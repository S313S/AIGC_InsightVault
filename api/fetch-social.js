// Vercel Serverless Function: Fetch Social Media Content via JustOneAPI
// Environment Variable Required: JUSTONEAPI_TOKEN

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

    const token = process.env.JUSTONEAPI_TOKEN;
    if (!token) {
        return res.status(500).json({ error: 'API token not configured' });
    }

    try {
        // Detect platform and extract ID
        const parsed = parseUrl(url);

        if (!parsed) {
            return res.status(400).json({ error: 'Unsupported URL format. Only Twitter and Xiaohongshu are supported.' });
        }

        let apiResponse;

        if (parsed.platform === 'xiaohongshu') {
            apiResponse = await fetchXiaohongshu(parsed.id, token, parsed.originalUrl);
        } else if (parsed.platform === 'twitter') {
            apiResponse = await fetchTwitter(parsed.id, token);
        }

        // Map to unified format
        const result = mapToKnowledgeCard(apiResponse, parsed.platform);

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

function parseUrl(url) {
    // Xiaohongshu: https://www.xiaohongshu.com/explore/64f... or https://www.xiaohongshu.com/discovery/item/64f...
    const xhsMatch = url.match(/xiaohongshu\.com\/(?:explore|discovery\/item)\/([a-zA-Z0-9]+)/);
    if (xhsMatch) {
        // Return both id and original URL for share link transfer
        return { platform: 'xiaohongshu', id: xhsMatch[1], originalUrl: url };
    }

    // Twitter/X: https://twitter.com/user/status/123456789 or https://x.com/user/status/123456789
    const twitterMatch = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
    if (twitterMatch) {
        return { platform: 'twitter', id: twitterMatch[1] };
    }

    return null;
}

// ============ API Calls ============

const API_BASE = 'https://api.justoneapi.com';

// Step 1: Convert share URL to get real noteId (for links with xsec_token etc.)
async function transferShareUrl(shareUrl, token) {
    const endpoint = `${API_BASE}/api/xiaohongshu/share-url-transfer/v1?token=${token}&shareUrl=${encodeURIComponent(shareUrl)}`;

    const response = await fetch(endpoint);
    const data = await response.json();

    if (data.code !== 0) {
        // If transfer fails, return null and try with original id
        console.log('Share URL transfer failed:', data.message);
        return null;
    }

    return data.data;
}

async function fetchXiaohongshu(noteId, token, originalUrl) {
    // If original URL contains xsec_token, try to transfer it first
    if (originalUrl && originalUrl.includes('xsec_token')) {
        const transferResult = await transferShareUrl(originalUrl, token);
        if (transferResult && transferResult.noteId) {
            noteId = transferResult.noteId;
        }
    }

    const endpoint = `${API_BASE}/api/xiaohongshu/get-note-detail/v1?token=${token}&noteId=${noteId}`;

    const response = await fetch(endpoint);
    const data = await response.json();

    if (data.code !== 0) {
        throw new Error(data.message || `XHS API error (code: ${data.code})`);
    }

    return data.data;
}

async function fetchTwitter(tweetId, token) {
    const endpoint = `${API_BASE}/api/twitter/get-tweet-detail/v1?token=${token}&tweetId=${tweetId}`;

    const response = await fetch(endpoint);
    const data = await response.json();

    if (data.code !== 0) {
        throw new Error(data.message || 'Twitter API error');
    }

    return data.data;
}

// ============ Response Mapping ============

function mapToKnowledgeCard(data, platform) {
    if (platform === 'xiaohongshu') {
        return {
            platform: 'Xiaohongshu',
            title: data.title || '',
            author: data.user?.nickname || '',
            rawContent: data.desc || '',
            coverImage: data.imageList?.[0]?.url || data.video?.coverUrl || '',
            images: data.imageList?.map(img => img.url) || [],
            metrics: {
                likes: data.interactStatus?.likedCount || 0,
                bookmarks: data.interactStatus?.collectedCount || 0,
                comments: data.interactStatus?.commentCount || 0,
            },
            tags: data.tagList?.map(tag => tag.name) || [],
            sourceUrl: `https://www.xiaohongshu.com/explore/${data.id}`,
        };
    }

    if (platform === 'twitter') {
        return {
            platform: 'Twitter',
            title: '', // Twitter posts don't have titles
            author: data.user?.screenName || '',
            rawContent: data.fullText || '',
            coverImage: data.media?.[0]?.url || '',
            images: data.media?.filter(m => m.type === 'photo').map(m => m.url) || [],
            metrics: {
                likes: data.stats?.favoriteCount || 0,
                bookmarks: 0, // Twitter API might not expose this
                comments: data.stats?.replyCount || 0,
            },
            tags: [], // Would need to parse hashtags from fullText
            sourceUrl: `https://twitter.com/${data.user?.screenName}/status/${data.id}`,
        };
    }

    return { error: 'Unknown platform' };
}
