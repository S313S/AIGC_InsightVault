// Frontend service to fetch social media content via our backend proxy

const FETCH_SOCIAL_API = '/api/fetch-social';

// 重试配置
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

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

/**
 * 带重试机制的 fetch 请求
 * 如果请求失败（超时/网络错误），会自动重试最多 MAX_RETRIES 次
 */
async function fetchWithRetry(
    url: string,
    options: RequestInit,
    retries: number = MAX_RETRIES
): Promise<Response> {
    try {
        const response = await fetch(url, options);
        return response;
    } catch (error) {
        if (retries > 0) {
            console.warn(`Fetch failed, retrying... (${MAX_RETRIES - retries + 1}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            return fetchWithRetry(url, options, retries - 1);
        }
        throw error;
    }
}

export async function fetchSocialContent(url: string): Promise<SocialMediaContent> {
    try {
        const response = await fetchWithRetry(FETCH_SOCIAL_API, {
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
