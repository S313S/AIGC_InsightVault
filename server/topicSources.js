const freezeEntries = (entries) => Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));

export const DEFAULT_OFFICIAL_FEEDS = freezeEntries([
  { id: 'openai-news', name: 'OpenAI News', url: 'https://openai.com/news/rss.xml' },
  { id: 'google-ai-blog', name: 'Google AI Blog', url: 'https://blog.google/technology/ai/rss/' },
]);

export const DEFAULT_GITHUB_REPOSITORIES = Object.freeze([
  'openai/openai-node',
  'anthropics/anthropic-sdk-typescript',
  'googleapis/js-genai',
]);

export const DEFAULT_SOURCE_LIMITS = Object.freeze({
  timeoutMs: 8_000,
  recentDays: 35,
  maxEntries: 20,
  maxPages: 2,
  maxResponseChars: 1_000_000,
  maxContentChars: 4_000,
});

const safeHttpUrl = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
};

const positiveInteger = (value, fallback, maximum) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(maximum, Math.floor(number));
};

export const resolveSourceLimits = (overrides = {}) => Object.freeze({
  timeoutMs: positiveInteger(overrides.timeoutMs, DEFAULT_SOURCE_LIMITS.timeoutMs, 30_000),
  recentDays: positiveInteger(overrides.recentDays, DEFAULT_SOURCE_LIMITS.recentDays, 365),
  maxEntries: positiveInteger(overrides.maxEntries, DEFAULT_SOURCE_LIMITS.maxEntries, 100),
  maxPages: positiveInteger(overrides.maxPages, DEFAULT_SOURCE_LIMITS.maxPages, 5),
  maxResponseChars: positiveInteger(overrides.maxResponseChars, DEFAULT_SOURCE_LIMITS.maxResponseChars, 5_000_000),
  maxContentChars: positiveInteger(overrides.maxContentChars, DEFAULT_SOURCE_LIMITS.maxContentChars, 20_000),
});

export const normalizeOfficialSources = (sources = DEFAULT_OFFICIAL_FEEDS, limits = DEFAULT_SOURCE_LIMITS) => {
  if (!Array.isArray(sources)) return [];
  return sources.slice(0, 20).flatMap((source, index) => {
    const url = safeHttpUrl(source?.url);
    if (!url) return [];
    return [{
      id: String(source?.id || `official-${index + 1}`).slice(0, 100),
      name: String(source?.name || source?.id || new URL(url).hostname).slice(0, 160),
      url,
      recentDays: positiveInteger(source?.recentDays, limits.recentDays, 365),
      maxEntries: positiveInteger(source?.maxEntries, limits.maxEntries, 100),
    }];
  });
};

const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

export const normalizeGithubRepositories = (repositories = DEFAULT_GITHUB_REPOSITORIES, limits = DEFAULT_SOURCE_LIMITS) => {
  if (!Array.isArray(repositories)) return [];
  return repositories.slice(0, 30).flatMap((value) => {
    const config = typeof value === 'string' ? { repo: value } : value;
    const repo = String(config?.repo || '').trim();
    if (!REPOSITORY_PATTERN.test(repo)) return [];
    return [{
      repo,
      recentDays: positiveInteger(config?.recentDays, limits.recentDays, 365),
      maxReleases: positiveInteger(config?.maxReleases, limits.maxEntries, 100),
      maxPages: positiveInteger(config?.maxPages, limits.maxPages, 5),
    }];
  });
};
