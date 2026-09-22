import { collectGithubReleaseSignals } from './sourceCollectors/githubReleases.js';
import { collectOfficialFeedSignals } from './sourceCollectors/officialFeeds.js';
import { DEFAULT_GITHUB_REPOSITORIES, DEFAULT_OFFICIAL_FEEDS } from './topicSources.js';

const boundedInteger = (value, fallback, minimum, maximum) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(number)));
};

const safePlatformError = (platform, error, sourceKey) => ({
  platform,
  source: String(error?.[sourceKey] || platform).slice(0, 160),
  error: String(error?.errorKind || 'collector_failed').slice(0, 80),
  ...(Number.isInteger(error?.status) ? { status: error.status } : {}),
  ...(error?.retryAfter ? { retryAfter: String(error.retryAfter).slice(0, 40) } : {}),
  ...(error?.rateLimitReset ? { rateLimitReset: String(error.rateLimitReset).slice(0, 40) } : {}),
});

export const factPlatformKey = (platform) => {
  const normalized = String(platform || '').trim().toLowerCase();
  return normalized === 'official' || normalized === 'github' ? normalized : null;
};

export const persistEvidenceRows = async ({ supabase, rows = [] } = {}) => {
  if (!supabase?.from || !Array.isArray(rows)) throw new TypeError('valid supabase client and rows are required');
  const socialRows = [];
  const factRows = { official: [], github: [] };
  for (const row of rows) {
    const platform = factPlatformKey(row?.platform);
    if (platform) factRows[platform].push(row);
    else socialRows.push(row);
  }

  let inserted = 0;
  if (socialRows.length > 0) {
    const { error } = await supabase.from('knowledge_cards').insert(socialRows);
    if (error) throw new Error(error.message || 'Failed to insert trending cards');
    inserted += socialRows.length;
  }

  const platformErrors = [];
  for (const platform of ['official', 'github']) {
    if (factRows[platform].length === 0) continue;
    const { error } = await supabase.from('knowledge_cards').insert(factRows[platform]);
    if (error) {
      platformErrors.push({ platform, source: platform, error: 'persistence_failed' });
      continue;
    }
    inserted += factRows[platform].length;
  }

  return { inserted, platformErrors };
};

const runCollector = async ({ platform, sourceKey, configuredCount, collect }) => {
  try {
    const result = await collect();
    const errors = Array.isArray(result?.errors) ? result.errors : [];
    const signals = Array.isArray(result?.signals) ? result.signals : [];
    const completedCalls = Math.max(0, configuredCount - errors.length);
    return {
      signals,
      platformErrors: errors.map((error) => safePlatformError(platform, error, sourceKey)),
      totals: {
        fetched: signals.length,
        output: signals.length,
        completed: completedCalls > 0,
        completedCalls,
        configuredCalls: configuredCount,
      },
    };
  } catch {
    return {
      signals: [],
      platformErrors: [{ platform, source: platform, error: 'collector_failed' }],
      totals: {
        fetched: 0,
        output: 0,
        completed: false,
        completedCalls: 0,
        configuredCalls: configuredCount,
      },
    };
  }
};

export const resolveFactSourceConfig = (env = process.env) => {
  const maxFeeds = boundedInteger(env.TOPIC_OFFICIAL_MAX_FEEDS, 2, 0, 10);
  const maxRepositories = boundedInteger(env.TOPIC_GITHUB_MAX_REPOS, 3, 0, 10);
  return {
    officialSources: DEFAULT_OFFICIAL_FEEDS.slice(0, maxFeeds),
    githubRepositories: DEFAULT_GITHUB_REPOSITORIES.slice(0, maxRepositories),
    limits: {
      timeoutMs: boundedInteger(env.TOPIC_FACT_TIMEOUT_MS, 6_000, 1_000, 30_000),
      recentDays: boundedInteger(env.TOPIC_FACT_RECENT_DAYS, 35, 1, 365),
      maxEntries: boundedInteger(env.TOPIC_FACT_MAX_ENTRIES, 10, 1, 50),
      maxPages: boundedInteger(env.TOPIC_FACT_MAX_PAGES, 1, 1, 3),
      maxResponseChars: boundedInteger(env.TOPIC_FACT_MAX_RESPONSE_CHARS, 1_000_000, 10_000, 5_000_000),
      maxContentChars: boundedInteger(env.TOPIC_FACT_MAX_CONTENT_CHARS, 4_000, 256, 20_000),
    },
  };
};

export const collectPrimarySourceEvidence = async ({
  now = new Date().toISOString(),
  env = process.env,
  fetchImpl = globalThis.fetch,
  officialCollector = collectOfficialFeedSignals,
  githubCollector = collectGithubReleaseSignals,
} = {}) => {
  const config = resolveFactSourceConfig(env);
  const jobs = [];

  if (config.officialSources.length > 0) {
    jobs.push({
      platform: 'official',
      promise: runCollector({
        platform: 'official',
        sourceKey: 'sourceId',
        configuredCount: config.officialSources.length,
        collect: () => officialCollector({
          fetchImpl,
          now,
          sources: config.officialSources,
          limits: config.limits,
        }),
      }),
    });
  }

  if (config.githubRepositories.length > 0) {
    jobs.push({
      platform: 'github',
      promise: runCollector({
        platform: 'github',
        sourceKey: 'repository',
        configuredCount: config.githubRepositories.length,
        collect: () => githubCollector({
          fetchImpl,
          now,
          repositories: config.githubRepositories,
          token: env.GITHUB_TOKEN,
          limits: config.limits,
        }),
      }),
    });
  }

  const results = await Promise.all(jobs.map(async ({ platform, promise }) => ({
    platform,
    result: await promise,
  })));

  return {
    intendedPlatforms: results.map(({ platform }) => platform),
    signals: results.flatMap(({ result }) => result.signals),
    platformTotals: Object.fromEntries(results.map(({ platform, result }) => [platform, result.totals])),
    platformErrors: results.flatMap(({ result }) => result.platformErrors),
    config: {
      officialFeeds: config.officialSources.length,
      githubRepositories: config.githubRepositories.length,
      timeoutMs: config.limits.timeoutMs,
      recentDays: config.limits.recentDays,
      maxEntries: config.limits.maxEntries,
      maxPages: config.limits.maxPages,
    },
  };
};
