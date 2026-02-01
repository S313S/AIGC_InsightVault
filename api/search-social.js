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

    // Build a clean, non-expiring image URL from fileid.
    // The signed URLs (with sign= & t= params) expire quickly, causing broken images
    // in the knowledge base. Constructing from fileid avoids this issue.
    const buildImageUrl = (fileid) => {
        if (!fileid) return '';
        return `https://sns-img-bd.xhscdn.com/${fileid}?imageView2/2/w/660/format/jpg/q/75`;
    };

    // Get cover image using cover_image_index, falling back to first image
    const coverIndex = note.cover_image_index || 0;
    const coverImg = note.images_list?.[coverIndex] || note.images_list?.[0];

    // Prefer constructing a clean URL from fileid; fall back to signed URL with HEIF→JPG conversion
    const convertToJpg = (url) => {
        if (!url) return '';
        return url.replaceAll('format/heif', 'format/jpg');
    };

    let coverImage = '';
    if (coverImg?.fileid) {
        coverImage = buildImageUrl(coverImg.fileid);
    } else if (note.cover?.url_size_large || note.cover?.url || note.cover?.url_default) {
        coverImage = convertToJpg(note.cover.url_size_large || note.cover.url || note.cover.url_default);
    } else {
        coverImage = convertToJpg(coverImg?.url_size_large || coverImg?.url || '');
    }

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
        // 使用discovery链接，配合xsec_token参数
        sourceUrl: `https://www.xiaohongshu.com/discovery/item/${note.id}?xsec_token=${encodeURIComponent(note.xsec_token || '')}`,
    };
}

