// Frontend service to fetch social media content via our backend proxy

const FETCH_SOCIAL_API = '/api/fetch-social';
const SEARCH_SOCIAL_API = '/api/search-social';

export interface SocialMediaContent {
    platform: 'Twitter' | 'Xiaohongshu' | string;
    title: string;
    author: string;
    rawContent: string;
    coverImage: string;
    images: string[];
    metrics: {
        likes: number;
        bookmarks: number;
        comments: number;
    };
    tags: string[];
    sourceUrl: string;
    error?: string;
}

export interface SocialSearchParams {
    keyword: string;
    platform: 'xiaohongshu' | 'twitter';
    page?: number;
    sort?: string;
    noteType?: string;
    noteTime?: string;
    limit?: number;
}

export async function searchSocial(params: SocialSearchParams) {
    const response = await fetch(SEARCH_SOCIAL_API, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'Search failed');
    }

    return data;
}

export async function fetchSocialContent(url: string): Promise<SocialMediaContent> {
    try {
        const response = await fetch(FETCH_SOCIAL_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            const message = [errorData?.error, errorData?.details].filter(Boolean).join(': ');
            throw new Error(message || 'Failed to fetch content');
        }

        return await response.json();
    } catch (error) {
        console.error('Social fetch error:', error);
        throw error;
    }
}
