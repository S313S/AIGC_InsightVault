// Vercel serverless function for searching social media content
// Path: /api/search-social

const API_BASE = 'https://api.justoneapi.com';

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
        const { keyword, page = 1, sort = 'general', noteType = '_0', noteTime, platform = 'xiaohongshu' } = req.body;

        if (!keyword) {
            return res.status(400).json({ error: 'keyword is required' });
        }

        const token = process.env.JUSTONEAPI_TOKEN;
        if (!token) {
            return res.status(500).json({ error: 'API token not configured' });
        }

        if (platform === 'xiaohongshu') {
            const results = await searchXiaohongshu(keyword, page, sort, noteType, noteTime, token);
            return res.status(200).json(results);
        }

        // TODO: Add Twitter search support
        return res.status(400).json({ error: `Platform ${platform} not supported for search` });

    } catch (error) {
        console.error('Search error:', error);
        return res.status(500).json({ error: error.message || 'Search failed' });
    }
}

async function searchXiaohongshu(keyword, page, sort, noteType, noteTime, token) {
    // Build search URL
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
    const notes = items
        .filter(item => item.model_type === 'note' && item.note)
        .map(item => mapSearchResult(item.note));

    return {
        total: notes.length,
        page,
        results: notes,
    };
}

function mapSearchResult(note) {
    // Extract publish time from corner_tag_info
    const publishTimeTag = note.corner_tag_info?.find(tag => tag.type === 'publish_time');

    return {
        noteId: note.id,
        title: note.title || '',
        desc: note.desc || '',
        author: note.user?.nickname || '',
        authorAvatar: note.user?.images || '',
        coverImage: note.images_list?.[0]?.url || note.images_list?.[0]?.url_size_large || '',
        images: (note.images_list || []).map(img => img.url || img.url_size_large).filter(Boolean),
        metrics: {
            likes: note.liked_count || 0,
            bookmarks: note.collected_count || 0,
            comments: note.comments_count || 0,
            shares: note.shared_count || 0,
        },
        publishTime: publishTimeTag?.text || '',
        xsecToken: note.xsec_token || '',
        sourceUrl: `https://www.xiaohongshu.com/explore/${note.id}`,
    };
}
