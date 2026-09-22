import {
  DEFAULT_GITHUB_REPOSITORIES,
  normalizeGithubRepositories,
  resolveSourceLimits,
} from '../topicSources.js';
import {
  canonicalHttpUrl,
  classifyPublicationDate,
  cleanText,
  fetchWithTimeout,
  readBoundedText,
  safeErrorKind,
  stableHash,
} from './collectorUtils.js';

const releaseUrlFor = (repo, tag) => `https://github.com/${repo}/releases/tag/${encodeURIComponent(String(tag || 'latest'))}`;

const safeReleaseUrl = (value, repo, tag) => canonicalHttpUrl(value, 'https://github.com', (url) => (
  url.hostname.toLowerCase() === 'github.com' &&
  url.pathname.toLowerCase().startsWith(`/${repo.toLowerCase()}/releases/`)
)) || releaseUrlFor(repo, tag);

const parseNextLink = (header, repo) => {
  const match = String(header || '').match(/<([^>]+)>;\s*rel="next"/iu);
  if (!match) return null;
  return canonicalHttpUrl(match[1], 'https://api.github.com', (url) => (
    url.hostname === 'api.github.com' &&
    url.pathname.toLowerCase() === `/repos/${repo.toLowerCase()}/releases`
  ));
};

const normalizeRelease = (release, config, nowMs, limits) => {
  if (!release || release.draft || release.prerelease) return null;
  const tag = cleanText(release.tag_name, 200) || 'latest';
  const publication = classifyPublicationDate(String(release.published_at || release.created_at || ''), nowMs);
  if (publication.timestamp !== null && nowMs - publication.timestamp > config.recentDays * 86_400_000) return null;
  const sourceUrl = safeReleaseUrl(release.html_url, config.repo, tag);
  const identity = release.id ?? tag ?? sourceUrl;
  const hash = stableHash(`${config.repo}\n${identity}`);
  const body = cleanText(release.body, limits.maxContentChars);
  const title = cleanText(release.name, 300) || `${config.repo} ${tag}`;
  return {
    id: `github-${hash.slice(0, 24)}`,
    sourceId: config.repo,
    evidenceKey: `github:${hash}`,
    title,
    rawContent: body,
    summary: body,
    sourceUrl,
    platform: 'GitHub',
    author: config.repo.split('/')[0],
    date: publication.publishedAt || String(release.published_at || ''),
    publishedAt: publication.publishedAt,
    breakingEligible: publication.breakingEligible,
    reviewOnly: publication.reviewOnly,
    sourceType: 'repository',
    evidenceRole: 'fact',
    metrics: {},
    tags: ['github-release', tag],
    version: tag,
    isTrending: true,
  };
};

const collectRepository = async (fetchImpl, config, token, nowMs, limits) => {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ai-insight-vault-topic-radar',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  let nextUrl = `https://api.github.com/repos/${config.repo}/releases?per_page=${Math.min(100, config.maxReleases)}`;
  const releases = [];
  for (let page = 0; nextUrl && page < config.maxPages && releases.length < config.maxReleases; page += 1) {
    const response = await fetchWithTimeout(fetchImpl, nextUrl, { headers }, limits.timeoutMs);
    if (!response?.ok) {
      const error = new Error('github_http_error');
      error.status = Number(response?.status) || null;
      error.kind = error.status === 403 || error.status === 429 ? 'rate_limited' : 'http_error';
      error.retryAfter = response?.headers?.get?.('retry-after') || null;
      throw error;
    }
    const text = await readBoundedText(response, limits.maxResponseChars);
    let pageItems;
    try {
      pageItems = JSON.parse(text);
    } catch {
      throw Object.assign(new Error('invalid_json'), { kind: 'invalid_json' });
    }
    if (!Array.isArray(pageItems)) throw Object.assign(new Error('invalid_json'), { kind: 'invalid_json' });
    releases.push(...pageItems);
    nextUrl = parseNextLink(response.headers.get('link'), config.repo);
  }
  return releases.slice(0, config.maxReleases).map((release) => normalizeRelease(release, config, nowMs, limits)).filter(Boolean);
};

export const collectGithubReleaseSignals = async ({
  fetchImpl = globalThis.fetch,
  now = new Date().toISOString(),
  repositories = DEFAULT_GITHUB_REPOSITORIES,
  token,
  limits: limitOverrides = {},
} = {}) => {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  const limits = resolveSourceLimits(limitOverrides);
  const configs = normalizeGithubRepositories(repositories, limits);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new TypeError('now must be a valid date');

  const results = await Promise.all(configs.map(async (config) => {
    try {
      return { signals: await collectRepository(fetchImpl, config, token, nowMs, limits), error: null };
    } catch (error) {
      return {
        signals: [],
        error: {
          repository: config.repo,
          errorKind: safeErrorKind(error),
          ...(Number.isInteger(error?.status) ? { status: error.status } : {}),
          ...(error?.retryAfter ? { retryAfter: String(error.retryAfter).slice(0, 40) } : {}),
        },
      };
    }
  }));

  return {
    signals: results.flatMap((result) => result.signals).sort((a, b) => a.id.localeCompare(b.id)),
    errors: results.flatMap((result) => result.error ? [result.error] : []),
  };
};
