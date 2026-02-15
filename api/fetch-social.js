// Vercel Serverless Function: Fetch Social Media Content via multi-provider upstream APIs
// Environment Variables:
// - XHS: JUSTONEAPI_TOKEN and/or TIKHUB_API_TOKEN
// - X: X_API_BEARER_TOKEN

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    const justOneToken = process.env.JUSTONEAPI_TOKEN;
    const tikhubToken = process.env.TIKHUB_API_TOKEN;

    try {
        // Detect platform and extract ID
        const parsed = parseUrl(url);

        if (!parsed) {
            return res.status(400).json({ error: 'Unsupported URL format. Only Twitter and Xiaohongshu are supported.' });
        }

        let apiResponse;

        if (parsed.platform === 'xiaohongshu') {
            if (!justOneToken && !tikhubToken) {
                return res.status(500).json({ error: 'Xiaohongshu API token not configured (JUSTONEAPI_TOKEN or TIKHUB_API_TOKEN)' });
            }
            apiResponse = await fetchXiaohongshu(parsed.id, {
                justOneToken,
                tikhubToken,
                originalUrl: parsed.originalUrl,
                xsecToken: parsed.xsecToken
            });
        } else if (parsed.platform === 'twitter') {
            apiResponse = await fetchTwitter(parsed.id);
        }

        // Map to unified format
        const result = await mapToKnowledgeCard(apiResponse, parsed.platform);

        return res.status(200).json(result);

    } catch (error) {
        console.error('Fetch social error:', error);
        return res.status(500).json({
            error: 'Failed to fetch content',
            details: error.message
        });
    }
}

// ============ URL Parsing ============

function parseUrl(input) {
    const raw = String(input || '').trim();
    if (!raw) return null;

    // Support pasted share text by extracting the first URL token.
    const token = (raw.match(/https?:\/\/[^\s]+/i) || [raw])[0];
    let normalized = token;
    if (!/^https?:\/\//i.test(normalized)) {
        normalized = `https://${normalized}`;
    }

    let parsed;
    try {
        parsed = new URL(normalized);
    } catch {
        return null;
    }

    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = parsed.pathname || '';

    // Xiaohongshu full links:
    // - /explore/{noteId}
    // - /discovery/item/{noteId}
    if (host === 'xiaohongshu.com') {
        const noteMatch = pathname.match(/\/(?:explore|discovery\/item)\/([a-zA-Z0-9]+)/i);
        if (!noteMatch) return null;

        return {
            platform: 'xiaohongshu',
            id: noteMatch[1],
            originalUrl: parsed.toString(),
            xsecToken: parsed.searchParams.get('xsec_token') || null
        };
    }

    // Xiaohongshu short link: http://xhslink.com/xxx
    if (host === 'xhslink.com') {
        return {
            platform: 'xiaohongshu',
            id: null,
            originalUrl: parsed.toString(),
            xsecToken: null
        };
    }

    // Twitter/X: https://twitter.com/user/status/123456789 or https://x.com/user/status/123456789
    if (host === 'twitter.com' || host === 'x.com') {
        const twitterMatch = pathname.match(/^\/[^/]+\/status\/(\d+)/i);
        if (!twitterMatch) return null;
        return { platform: 'twitter', id: twitterMatch[1] };
    }

    return null;
}

// ============ API Calls ============

const API_BASE_XHS = 'https://api.justoneapi.com'; // JustOneAPI prod-global for Xiaohongshu
const API_BASE_TIKHUB = 'https://api.tikhub.io';
const XHS_PRIMARY_NOTE_DETAIL = '/api/xiaohongshu-pgy/api/solar/note/noteId/detail/v1';
const XHS_LEGACY_NOTE_DETAIL = '/api/xiaohongshu/get-note-detail/v1';
const TIKHUB_NOTE_DETAIL_V2 = '/api/v1/xiaohongshu/web_v2/fetch_feed_notes_v2';

// Step 1: Convert share URL to get real noteId (only for xhslink.com short links)
async function transferShareUrl(shareUrl, token) {
    // Share URL Transfer only works with xhslink.com short links
    if (!shareUrl.includes('xhslink.com')) {
        return null;
    }

    const endpoint = `${API_BASE_XHS}/api/xiaohongshu/share-url-transfer/v1?token=${token}&shareUrl=${encodeURIComponent(shareUrl)}`;

    const response = await fetch(endpoint);
    const data = await response.json();

    console.log('Transfer API response:', JSON.stringify(data));

    if (data.code !== 0) {
        console.log('Share URL transfer failed:', data.message);
        throw new Error(`Transfer API error: ${data.message || JSON.stringify(data)}`);
    }

    return data.data;
}

async function resolveXhsNoteId(noteId, originalUrl, xsecToken, justOneToken) {
    let resolvedId = noteId;
    let resolvedXsecToken = xsecToken || null;

    // If original URL is a xhslink.com short link, use JustOne transfer API to resolve real noteId.
    if (!resolvedId && originalUrl && originalUrl.includes('xhslink.com')) {
        if (!justOneToken) {
            throw new Error('Short-link resolution requires JUSTONEAPI_TOKEN');
        }

        const transferResult = await transferShareUrl(originalUrl, justOneToken);

        if (transferResult && transferResult.noteId) {
            resolvedId = transferResult.noteId;
        } else if (transferResult && transferResult.redirect_url) {
            const noteMatch = transferResult.redirect_url.match(/\/(?:discovery\/item|explore)\/([a-zA-Z0-9]+)/);
            if (noteMatch) {
                resolvedId = noteMatch[1];
            } else {
                throw new Error(`Cannot extract noteId from redirect_url: ${transferResult.redirect_url}`);
            }
            const tokenMatch = transferResult.redirect_url.match(/xsec_token=([^&]+)/);
            if (tokenMatch) {
                resolvedXsecToken = decodeURIComponent(tokenMatch[1]);
            }
        } else {
            throw new Error(`Transfer API returned unexpected format: ${JSON.stringify(transferResult)}`);
        }
    }

    if (!resolvedId) {
        throw new Error('noteId is required to fetch Xiaohongshu content');
    }

    return { noteId: resolvedId, xsecToken: resolvedXsecToken };
}

async function fetchXiaohongshuFromJustOne(noteId, token, xsecToken) {

    const fetchXhsDetail = async (apiPath, retries = 1, retryDelayMs = 250) => {
        let lastErr = null;
        for (let i = 0; i <= retries; i += 1) {
            const params = new URLSearchParams({ token, noteId });
            if (xsecToken && apiPath.includes('/api/xiaohongshu/get-note-detail/')) {
                params.set('xsec_token', xsecToken);
            }

            const endpoint = `${API_BASE_XHS}${apiPath}?${params.toString()}`;
            const response = await fetch(endpoint);
            const data = await response.json().catch(() => ({}));

            if (data.code === 0 && data.data) {
                const wrapper = Array.isArray(data.data) ? data.data[0] : data.data;
                if (wrapper && typeof wrapper === 'object') {
                    const noteData = wrapper?.note_list?.[0] || wrapper;
                    noteData._user = wrapper?.user;
                    return noteData;
                }
            }

            lastErr = new Error(data.message || `XHS API error (code: ${data.code}) on ${apiPath}`);
            if (i < retries) {
                await new Promise(resolve => setTimeout(resolve, retryDelayMs));
            }
        }
        throw lastErr || new Error(`XHS API failed on ${apiPath}`);
    };

    // Strategy requested:
    // 1) Try legacy endpoint first (richer metrics), retry up to 10 times with short interval.
    // 2) If still failed, fallback to new endpoint.
    try {
        return await fetchXhsDetail(XHS_LEGACY_NOTE_DETAIL, 10, 250);
    } catch (legacyErr) {
        const primary = await fetchXhsDetail(XHS_PRIMARY_NOTE_DETAIL, 0, 0);
        primary._fallbackInfo = {
            legacyError: legacyErr?.message || 'legacy endpoint failed after retries'
        };
        return primary;
    }
}

async function fetchXiaohongshuFromTikhub(noteId, token) {
    const endpoint = `${API_BASE_TIKHUB}${TIKHUB_NOTE_DETAIL_V2}?note_id=${encodeURIComponent(noteId)}`;
    const response = await fetch(endpoint, {
        headers: {
            'Authorization': `Bearer ${token}`,
        }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.message_zh || payload?.message || `TikHub API error: ${response.status}`);
    }
    if (payload?.code !== 200) {
        throw new Error(payload?.message_zh || payload?.message || `TikHub API error (code: ${payload?.code})`);
    }

    let wrapper = payload?.data;
    if (typeof wrapper === 'string') {
        try {
            wrapper = JSON.parse(wrapper);
        } catch {
            throw new Error('TikHub returned invalid data payload');
        }
    }
    if (!wrapper || typeof wrapper !== 'object') {
        throw new Error('TikHub API returned empty data');
    }

    const noteData = wrapper?.note_list?.[0] || wrapper;
    noteData._user = wrapper?.user;
    return noteData;
}

async function fetchXiaohongshu(noteId, options) {
    const { justOneToken, tikhubToken, originalUrl, xsecToken } = options || {};
    const resolved = await resolveXhsNoteId(noteId, originalUrl, xsecToken, justOneToken);

    const preferredProvider = String(process.env.XHS_NOTE_PROVIDER || 'auto').toLowerCase();
    const availableProviders = [];

    if (preferredProvider === 'tikhub') {
        if (tikhubToken) availableProviders.push('tikhub');
        if (justOneToken) availableProviders.push('justone');
    } else if (preferredProvider === 'justone') {
        if (justOneToken) availableProviders.push('justone');
        if (tikhubToken) availableProviders.push('tikhub');
    } else {
        if (justOneToken) availableProviders.push('justone');
        if (tikhubToken) availableProviders.push('tikhub');
    }

    if (availableProviders.length === 0) {
        throw new Error('No Xiaohongshu provider token configured');
    }

    let lastError = null;
    for (const provider of availableProviders) {
        try {
            if (provider === 'justone') {
                const data = await fetchXiaohongshuFromJustOne(resolved.noteId, justOneToken, resolved.xsecToken);
                data._provider = 'justone';
                return data;
            }
            if (provider === 'tikhub') {
                const data = await fetchXiaohongshuFromTikhub(resolved.noteId, tikhubToken);
                data._provider = 'tikhub';
                return data;
            }
        } catch (err) {
            lastError = err;
        }
    }

    throw lastError || new Error('All Xiaohongshu providers failed');
}

async function fetchTwitter(tweetId) {
    // Use official X API v2
    const xBearerToken = process.env.X_API_BEARER_TOKEN;
    if (!xBearerToken) {
        throw new Error('X API Bearer Token not configured');
    }

    const endpoint = `https://api.x.com/2/tweets/${tweetId}?tweet.fields=created_at,public_metrics,author_id,text,attachments&expansions=author_id,attachments.media_keys&user.fields=username,name,profile_image_url&media.fields=type,url,preview_image_url`;

    const response = await fetch(endpoint, {
        headers: {
            'Authorization': `Bearer ${xBearerToken}`
        }
    });

    const data = await response.json();

    if (data.errors) {
        throw new Error(data.errors[0]?.message || 'X API error');
    }

    if (!data.data) {
        throw new Error('Tweet not found');
    }

    // Combine tweet data with user data from includes
    const tweet = data.data;
    const author = data.includes?.users?.find(u => u.id === tweet.author_id) || {};
    const media = data.includes?.media || [];

    return {
        id: tweet.id,
        text: tweet.text,
        created_at: tweet.created_at,
        attachments: tweet.attachments || {},
        public_metrics: tweet.public_metrics,
        media,
        author: {
            id: author.id,
            username: author.username,
            name: author.name,
            profile_image_url: author.profile_image_url
        }
    };
}

// ============ Response Mapping ============

// Build a clean, non-expiring image URL from fileid
function buildXhsImageUrl(fileid) {
    if (!fileid) return '';
    return `https://sns-img-bd.xhscdn.com/${fileid}?imageView2/2/w/660/format/jpg/q/75`;
}

function parseMetricCount(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const t = value.trim().toLowerCase().replace(/,/g, '');
        if (!t) return 0;

        // Chinese/EN unit support: 1.2w / 1.2万 / 1.2k / 1.2千
        const unitMatch = t.match(/^([\d.]+)\s*(w|万|k|千)$/i);
        if (unitMatch) {
            const base = Number(unitMatch[1]);
            if (!Number.isFinite(base)) return 0;
            const unit = unitMatch[2];
            if (unit === 'w' || unit === '万') return Math.round(base * 10000);
            if (unit === 'k' || unit === '千') return Math.round(base * 1000);
        }

        const n = Number(t);
        if (Number.isFinite(n)) return n;
    }
    return 0;
}

function pickFirstMetric(data, keys) {
    for (const key of keys) {
        if (data?.[key] !== undefined && data?.[key] !== null) {
            return parseMetricCount(data[key]);
        }
    }
    return 0;
}

async function mapToKnowledgeCard(data, platform) {
    if (platform === 'xiaohongshu') {
        const noteId = data.noteId || data.id;
        const user = data.userInfo || data._user || data.user || {};

        const convertToJpg = (url) => (url || '').replaceAll('format/heif', 'format/jpg');
        const extractCoverUrl = (cover) => {
            if (!cover) return '';
            if (typeof cover === 'string') return convertToJpg(cover);
            if (cover.fileId) return buildXhsImageUrl(cover.fileId);
            if (cover.fileid) return buildXhsImageUrl(cover.fileid);
            const url = cover.url_size_large || cover.url || cover.url_default || cover.url_pre || cover.url_original;
            return convertToJpg(url || '');
        };

        const imageList = data.imagesList || data.images_list || [];
        // Build cover image: prefer explicit cover, fall back to cover_image_index or share_info
        const coverFromNote = extractCoverUrl(data.cover);
        const coverIndex = Number.isFinite(Number(data.cover_image_index)) ? Number(data.cover_image_index) : 0;
        const coverImg = imageList?.[coverIndex] || imageList?.[0];
        const coverFromImages = coverImg?.fileid
            ? buildXhsImageUrl(coverImg.fileid)
            : coverImg?.fileId
                ? buildXhsImageUrl(coverImg.fileId)
                : convertToJpg(coverImg?.url || coverImg?.original || '');
        const coverFromShare = convertToJpg(data.share_info?.image || data.noteLink || '');
        const coverImage = coverFromNote || coverFromImages || coverFromShare;

        const images = imageList.map(img => {
            if (img.fileId) return buildXhsImageUrl(img.fileId);
            if (img.fileid) return buildXhsImageUrl(img.fileid);
            return (img.url || img.original || '').replaceAll('format/heif', 'format/jpg');
        }).filter(Boolean);

        const legacyTags = (data.hash_tag || []).map(tag => tag?.name).filter(Boolean);
        const featureTags = (data.featureTags || []).map(tag => {
            if (typeof tag === 'string') return tag;
            return tag?.name;
        }).filter(Boolean);
        const tags = Array.from(new Set([...legacyTags, ...featureTags]));

        const likes = pickFirstMetric(data, [
            'likeNum', 'liked_count', 'likedCount', 'like_count',
            'thumbsUpCount', 'thumbs_up_count', 'upCount'
        ]);
        const bookmarks = pickFirstMetric(data, [
            'favNum', 'favoriteNum', 'collectNum', 'collected_count',
            'collectedCount', 'bookmarkCount', 'bookmark_count'
        ]);
        const comments = pickFirstMetric(data, [
            'cmtNum', 'commentNum', 'comments_count', 'commentCount', 'comment_count'
        ]);

        return {
            platform: 'Xiaohongshu',
            title: data.title || data.share_info?.title || '',
            author: user.nickName || user.name || user.nickname || '',
            rawContent: data.content || data.desc || '',
            coverImage,
            images,
            metrics: {
                likes,
                bookmarks,
                comments,
            },
            tags,
            sourceUrl: data.noteLink || data.share_info?.link || data.mini_program_info?.webpage_url || data.qq_mini_program_info?.webpage_url || `https://www.xiaohongshu.com/explore/${noteId}`,
        };
    }

    if (platform === 'twitter') {
        const mediaKeys = data.attachments?.media_keys || [];
        const mediaByKey = new Map((data.media || []).map(m => [m.media_key, m]));
        const images = mediaKeys
            .map(key => mediaByKey.get(key))
            .filter(m => m && (m.type === 'photo' || m.type === 'animated_gif' || m.type === 'video'))
            .map(m => m.url || m.preview_image_url)
            .filter(Boolean);

        // Prefer original tweet media first. Generate AI cover only when media is unavailable.
        let coverImage = images[0] || '';
        if (!coverImage) {
            const textForImage = data.text || '';
            if (textForImage) {
                try {
                    coverImage = await generateCoverImage(textForImage);
                } catch (err) {
                    console.warn('Failed to generate cover image via Bailian:', err.message);
                }
            }
        }

        return {
            platform: 'Twitter',
            title: '', // Twitter posts don't have titles
            author: data.author?.username || '',
            rawContent: data.text || '',
            coverImage,
            images,
            metrics: {
                likes: data.public_metrics?.like_count || 0,
                bookmarks: data.public_metrics?.bookmark_count || 0,
                comments: data.public_metrics?.reply_count || 0,
            },
            tags: [], // Would need to parse hashtags from text
            sourceUrl: `https://twitter.com/${data.author?.username}/status/${data.id}`,
        };
    }

    return { error: 'Unknown platform' };
}

// ============ Bailian (DashScope) Cover Image Generation ============

/**
 * Call Alibaba Bailian (DashScope) Agent App to generate a cover image based on post text.
 * Returns the image URL or empty string on failure.
 */
async function generateCoverImage(postText) {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    const appId = process.env.DASHSCOPE_APP_ID;

    if (!apiKey || !appId) {
        console.warn('Bailian API not configured, skipping cover generation');
        return '';
    }

    const endpoint = `https://dashscope.aliyuncs.com/api/v1/apps/${appId}/completion`;

    // Truncate text if too long (to avoid token limits)
    const truncatedText = postText.length > 500 ? postText.substring(0, 500) + '...' : postText;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            input: {
                prompt: truncatedText
            },
            parameters: {},
            debug: {}
        }),
    });

    const data = await response.json();

    // Debug: log response structure
    console.log('Bailian response:', JSON.stringify(data, null, 2));

    if (!response.ok || data.code) {
        throw new Error(data.message || `Bailian API error: ${response.status}`);
    }

    // Extract image URL from response
    // The response structure depends on Bailian app output. 
    // Typical structure: data.output.text contains markdown with image, or data.output.images
    const output = data.output;

    // Case 1: Direct images array
    if (output?.images && output.images.length > 0) {
        return output.images[0].url || output.images[0];
    }

    // Case 2: Image URL in text (markdown format ![...](url))
    if (output?.text) {
        const imgMatch = output.text.match(/!\[.*?\]\((https?:\/\/[^\)]+)\)/);
        if (imgMatch) {
            return imgMatch[1];
        }
        // Case 3: Plain URL in text
        const urlMatch = output.text.match(/(https?:\/\/[^\s\)]+\.(png|jpg|jpeg|webp|gif))/i);
        if (urlMatch) {
            return urlMatch[1];
        }
    }

    console.warn('Could not extract image URL from Bailian response');
    return '';
}
