// Vercel serverless function for searching social media content
// Path: /api/search-social

const API_BASE = 'https://api.justoneapi.com';
const API_BASE_TIKHUB = 'https://api.tikhub.io';
const TIKHUB_SEARCH_PATH_DEFAULT = '/api/v1/xiaohongshu/app/search_notes';

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { keyword, page = 1, sort = 'general', noteType = '_0', noteTime, platform = 'xiaohongshu', limit } = req.body;

        if (!keyword) {
            return res.status(400).json({ error: 'keyword is required' });
        }

        const justOneToken = process.env.JUSTONEAPI_TOKEN;
        const tikhubToken = process.env.TIKHUB_API_TOKEN;

        if (platform === 'xiaohongshu') {
            if (!justOneToken && !tikhubToken) {
                return res.status(500).json({ error: 'Xiaohongshu API token not configured (JUSTONEAPI_TOKEN or TIKHUB_API_TOKEN)' });
            }
            const results = await searchXiaohongshu(keyword, page, sort, noteType, noteTime, {
                justOneToken,
                tikhubToken,
                limit
            });
            return res.status(200).json(results);
        }

        if (platform === 'twitter') {
            const results = await searchTwitter(keyword, limit);
            return res.status(200).json(results);
        }

        return res.status(400).json({ error: `Platform ${platform} not supported for search` });

    } catch (error) {
        console.error('Search error:', error);
        return res.status(500).json({ error: error.message || 'Search failed' });
    }
}

const parseMaybeJson = (value) => {
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
};

const extractTikhubSearchNotes = (payload) => {
    const wrapper = parseMaybeJson(payload?.data);
    if (!wrapper || typeof wrapper !== 'object') return [];

    const candidates = [
        wrapper?.items,
        wrapper?.data?.items,
        wrapper?.notes,
        wrapper?.note_list,
        wrapper?.feeds
    ];
    const list = candidates.find(Array.isArray) || [];

    return list
        .map((item) => (item && typeof item === 'object' && item.note ? item.note : item))
        .filter((note) => note && typeof note === 'object' && note.id);
};

const toTikhubSortType = (sort) => {
    const s = String(sort || '').trim();
    if (!s) return 'general';
    const map = {
        general: 'general',
        time_descending: 'time_descending',
        popularity_descending: 'popularity_descending',
        comment_descending: 'comment_descending',
        collect_descending: 'collect_descending',
    };
    return map[s] || 'general';
};

const toTikhubNoteType = (noteType) => {
    const s = String(noteType || '').trim();
    if (!s || s === '_0') return '不限';
    if (s === 'video' || s === '视频笔记' || s === '_1') return '视频笔记';
    if (s === 'normal' || s === '普通笔记' || s === '_2') return '普通笔记';
    return '不限';
};

const toTikhubNoteTime = (noteTime) => {
    const s = String(noteTime || '').trim();
    if (!s) return '不限';
    const map = {
        all: '不限',
        any: '不限',
        '24h': '一天内',
        '7d': '一周内',
        '6m': '半年内',
        '一天内': '一天内',
        '一周内': '一周内',
        '半年内': '半年内',
        '不限': '不限'
    };
    return map[s] || '不限';
};

async function searchXiaohongshuViaJustOne(keyword, page, sort, noteType, noteTime, token, limit) {
    let url = `${API_BASE}/api/xiaohongshu/search-note/v2?token=${token}&keyword=${encodeURIComponent(keyword)}&page=${page}&sort=${sort}&noteType=${noteType}`;

    if (noteTime) {
        url += `&noteTime=${encodeURIComponent(noteTime)}`;
    }

    const response = await fetch(url);
    const data = await response.json();

    if (data.code !== 0) {
        throw new Error(data.message || `Search API error (code: ${data.code})`);
    }

    // Parse items from response
    const items = data.data?.items || [];
    let notes = items
        .filter(item => item.model_type === 'note' && item.note)
        .map(item => mapSearchResult(item.note));

    if (limit && Number.isFinite(Number(limit))) {
        notes = notes.slice(0, Number(limit));
    }

    return {
        total: notes.length,
        page,
        results: notes,
    };
}

async function searchXiaohongshuViaTikhub(keyword, page, sort, noteType, noteTime, token, limit) {
    const params = new URLSearchParams({
        keyword: String(keyword || ''),
        page: String(page || 1),
        sort_type: toTikhubSortType(sort),
        filter_note_type: toTikhubNoteType(noteType),
        filter_note_time: toTikhubNoteTime(noteTime),
    });

    const path = process.env.TIKHUB_XHS_SEARCH_PATH || TIKHUB_SEARCH_PATH_DEFAULT;
    const endpoint = `${API_BASE_TIKHUB}${path}?${params.toString()}`;

    const response = await fetch(endpoint, {
        headers: {
            Authorization: `Bearer ${token}`,
        }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload?.message_zh || payload?.message || `TikHub API error: ${response.status}`);
    }
    if (payload?.code !== 200) {
        throw new Error(payload?.message_zh || payload?.message || `TikHub API error (code: ${payload?.code})`);
    }

    let notes = extractTikhubSearchNotes(payload).map(mapSearchResult);
    if (limit && Number.isFinite(Number(limit))) {
        notes = notes.slice(0, Number(limit));
    }

    return {
        total: notes.length,
        page,
        results: notes,
    };
}

async function searchXiaohongshu(keyword, page, sort, noteType, noteTime, options) {
    const { justOneToken, tikhubToken, limit } = options || {};
    const preferredProvider = String(process.env.XHS_SEARCH_PROVIDER || 'auto').toLowerCase();
    const providers = [];

    if (preferredProvider === 'tikhub') {
        if (tikhubToken) providers.push('tikhub');
        if (justOneToken) providers.push('justone');
    } else if (preferredProvider === 'justone') {
        if (justOneToken) providers.push('justone');
        if (tikhubToken) providers.push('tikhub');
    } else {
        if (tikhubToken) providers.push('tikhub');
        if (justOneToken) providers.push('justone');
    }

    let lastErr = null;
    for (const provider of providers) {
        try {
            if (provider === 'justone') {
                return await searchXiaohongshuViaJustOne(keyword, page, sort, noteType, noteTime, justOneToken, limit);
            }
            if (provider === 'tikhub') {
                return await searchXiaohongshuViaTikhub(keyword, page, sort, noteType, noteTime, tikhubToken, limit);
            }
        } catch (err) {
            lastErr = err;
        }
    }

    throw lastErr || new Error('All Xiaohongshu providers failed');
}

async function searchTwitter(keyword, limit) {
    const xBearerToken = process.env.X_API_BEARER_TOKEN;
    if (!xBearerToken) {
        throw new Error('X API Bearer Token not configured');
    }

    const maxResults = Math.min(Math.max(Number(limit) || 20, 10), 100);
    const query = `${keyword} -is:retweet`;
    const endpoint = `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=${maxResults}&tweet.fields=created_at,public_metrics,author_id,attachments&expansions=author_id,attachments.media_keys&user.fields=username,name,profile_image_url&media.fields=type,url,preview_image_url`;

    const response = await fetch(endpoint, {
        headers: {
            'Authorization': `Bearer ${xBearerToken}`
        }
    });

    const data = await response.json();

    if (!response.ok || data.errors) {
        const message = data.errors?.[0]?.message || `X API error: ${response.status}`;
        throw new Error(message);
    }

    const tweets = data.data || [];
    const users = data.includes?.users || [];
    const media = data.includes?.media || [];

    const userById = new Map(users.map(u => [u.id, u]));
    const mediaByKey = new Map(media.map(m => [m.media_key, m]));

    const results = tweets.map(tweet => mapTwitterSearchResult(tweet, userById, mediaByKey));

    return {
        total: results.length,
        page: 1,
        results,
    };
}

function mapSearchResult(note) {
    // Extract publish time from corner_tag_info
    const publishTimeTag = note.corner_tag_info?.find(tag => tag.type === 'publish_time');

    // Build a clean, non-expiring image URL from fileid.
    // The signed URLs (with sign= & t= params) expire quickly, causing broken images
    // in the knowledge base. Constructing from fileid avoids this issue.
    const buildImageUrl = (fileid) => {
        if (!fileid) return '';
        return `https://sns-img-bd.xhscdn.com/${fileid}?imageView2/2/w/660/format/jpg/q/75`;
    };

    // Prefer constructing a clean URL from fileid; fall back to signed URL with HEIF→JPG conversion
    const convertToJpg = (url) => {
        if (!url) return '';
        return url.replaceAll('format/heif', 'format/jpg');
    };

    const extractCoverUrl = (cover) => {
        if (!cover) return '';
        if (typeof cover === 'string') return convertToJpg(cover);
        if (cover.fileid) return buildImageUrl(cover.fileid);
        const url = cover.url_size_large || cover.url || cover.url_default || cover.url_pre || cover.url_original;
        return convertToJpg(url || '');
    };

    // Get cover image using explicit cover when available, otherwise fall back to cover_image_index
    const coverFromNote = extractCoverUrl(note.cover);
    const coverIndex = Number.isFinite(Number(note.cover_image_index)) ? Number(note.cover_image_index) : 0;
    const coverImg = note.images_list?.[coverIndex] || note.images_list?.[0];
    const coverFromImages = coverImg?.fileid
        ? buildImageUrl(coverImg.fileid)
        : convertToJpg(coverImg?.url_size_large || coverImg?.url || '');

    const coverImage = coverFromNote || coverFromImages;

    const images = (note.images_list || [])
        .map(img => {
            if (img.fileid) return buildImageUrl(img.fileid);
            return convertToJpg(img.url_size_large || img.url);
        })
        .filter(Boolean);

    return {
        noteId: note.id,
        title: note.title || '',
        desc: note.desc || '',
        author: note.user?.nickname || '',
        authorAvatar: note.user?.images || '',
        coverImage: coverImage,
        images: images,
        metrics: {
            likes: note.liked_count || 0,
            bookmarks: note.collected_count || 0,
            comments: note.comments_count || 0,
            shares: note.shared_count || 0,
        },
        publishTime: publishTimeTag?.text || '',
        xsecToken: note.xsec_token || '',
        platform: 'Xiaohongshu',
        // 使用discovery链接，配合xsec_token参数
        sourceUrl: `https://www.xiaohongshu.com/discovery/item/${note.id}?xsec_token=${encodeURIComponent(note.xsec_token || '')}`,
    };
}

function mapTwitterSearchResult(tweet, userById, mediaByKey) {
    const user = userById.get(tweet.author_id) || {};
    const mediaKeys = tweet.attachments?.media_keys || [];
    const images = mediaKeys
        .map(key => mediaByKey.get(key))
        .filter(m => m && (m.type === 'photo' || m.type === 'animated_gif' || m.type === 'video'))
        .map(m => m.url || m.preview_image_url)
        .filter(Boolean);

    const coverImage = images[0] || '';

    return {
        noteId: tweet.id,
        title: '',
        desc: tweet.text || '',
        author: user.username || user.name || '',
        authorAvatar: user.profile_image_url || '',
        coverImage,
        images,
        metrics: {
            likes: tweet.public_metrics?.like_count || 0,
            bookmarks: tweet.public_metrics?.bookmark_count || 0,
            comments: tweet.public_metrics?.reply_count || 0,
            shares: tweet.public_metrics?.retweet_count || 0,
        },
        publishTime: tweet.created_at || '',
        xsecToken: '',
        platform: 'Twitter',
        sourceUrl: user.username ? `https://twitter.com/${user.username}/status/${tweet.id}` : `https://twitter.com/i/web/status/${tweet.id}`,
    };
}
