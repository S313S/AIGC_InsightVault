// Frontend service to fetch social media content via our backend proxy

const FETCH_SOCIAL_API = '/api/fetch-social';

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
            throw new Error(errorData.error || 'Failed to fetch content');
        }

        return await response.json();
    } catch (error) {
        console.error('Social fetch error:', error);
        throw error;
    }
}
