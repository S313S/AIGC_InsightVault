const freezeEntries = (entries) => Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));

export const DEFAULT_OFFICIAL_FEEDS = freezeEntries([
  { id: 'openai-news', name: 'OpenAI News', url: 'https://openai.com/news/rss.xml', allowedHosts: ['openai.com', 'www.openai.com'] },
  { id: 'google-ai-blog', name: 'Google AI Blog', url: 'https://blog.google/technology/ai/rss/', allowedHosts: ['blog.google'] },
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

const isPrivateHostname = (hostname) => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true;
  if (/^127\./u.test(host) || /^10\./u.test(host) || /^169\.254\./u.test(host) || /^192\.168\./u.test(host)) return true;
  const private172 = host.match(/^172\.(\d+)\./u);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return true;
  return false;
};

const safeHttpsUrl = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' && !isPrivateHostname(url.hostname) && url.port === '' ? url.toString() : null;
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
    const url = safeHttpsUrl(source?.url);
    if (!url) return [];
    const feedHost = new URL(url).hostname.toLowerCase();
    const allowedHosts = [...new Set([
      feedHost,
      ...(Array.isArray(source?.allowedHosts) ? source.allowedHosts : []),
    ].map((host) => String(host || '').trim().toLowerCase()).filter((host) => (
      host && !isPrivateHostname(host) && !host.includes('/') && !host.includes(':')
    )))].slice(0, 10);
    return [{
      id: String(source?.id || `official-${index + 1}`).slice(0, 100),
      name: String(source?.name || source?.id || new URL(url).hostname).slice(0, 160),
      url,
      allowedHosts,
      recentDays: positiveInteger(source?.recentDays, limits.recentDays, 365),
      maxEntries: positiveInteger(source?.maxEntries, limits.maxEntries, 100),
    }];
  });
};

const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

export const normalizeGithubRepositories = (repositories = DEFAULT_GITHUB_REPOSITORIES, limits = DEFAULT_SOURCE_LIMITS) => {
  if (!Array.isArray(repositories)) return [];
  const seen = new Set();
  return repositories.slice(0, 30).flatMap((value) => {
    const config = typeof value === 'string' ? { repo: value } : value;
    const repo = String(config?.repo || '').trim();
    const repoKey = repo.toLowerCase();
    if (!REPOSITORY_PATTERN.test(repo) || seen.has(repoKey)) return [];
    seen.add(repoKey);
    return [{
      repo,
      recentDays: positiveInteger(config?.recentDays, limits.recentDays, 365),
      maxReleases: positiveInteger(config?.maxReleases, limits.maxEntries, 100),
      maxPages: positiveInteger(config?.maxPages, limits.maxPages, 5),
    }];
  });
};
