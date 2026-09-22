import { isFallbackCoverUrl, isRenderableCoverUrl } from './fallbackCovers.js';
import { resolveOpenableSourceUrl } from './sourceUrls.js';

const FACT_PLATFORMS = new Set(['github', 'official']);
const SOCIAL_PLATFORMS = new Set(['twitter', 'x', 'xiaohongshu', 'manual']);
const VERSION_ONLY_TITLE = /^v?\d+(?:\.\d+){1,4}(?:[-+][a-z0-9._-]+)?$/iu;

const normalizedPlatform = (value) => String(value || '').trim().toLowerCase();

const isFactSource = (source) => {
  const platform = normalizedPlatform(source?.card?.platform);
  const kind = `${source?.evidenceRole || ''} ${source?.sourceType || ''}`.toLowerCase();
  return FACT_PLATFORMS.has(platform) || /fact|official|repository|github|一手|官方/u.test(kind);
};

const isSocialSource = (source) => {
  const platform = normalizedPlatform(source?.card?.platform);
  return SOCIAL_PLATFORMS.has(platform) || !isFactSource(source);
};

const hasRealCover = (card) => {
  const cover = String(card?.coverImage || '').trim();
  return isRenderableCoverUrl(cover) && !isFallbackCoverUrl(cover);
};

export const selectTopicLeadSource = (sources = []) => {
  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const card = source?.card;
    const href = resolveOpenableSourceUrl(card?.sourceUrl);
    if (!card || !href) continue;

    const score = (isSocialSource(source) ? 4 : 0) + (hasRealCover(card) ? 2 : 0) - (index / 1_000);
    if (score <= bestScore) continue;
    bestScore = score;
    best = { source, card, href };
  }

  return best;
};

export const readableTopicDisplayText = (value, limit = 260) => {
  if (typeof value !== 'string') return '';
  const bounded = Array.from(value).slice(0, 4_000).join('');
  const plain = bounded
    .normalize('NFKC')
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/https?:\/\/[^\s)>\]]+/giu, ' ')
    .replace(/(?:^|\s)#{1,6}\s+/gu, ' ')
    .replace(/(?:^|\s)(?:[-*+]|\d+[.)])\s+/gu, ' ')
    .replace(/[*_~`>]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return Array.from(plain).slice(0, Math.max(0, limit)).join('').trim();
};

export const qualifyTopicDisplayTitle = (value, sourceIdentity) => {
  const title = readableTopicDisplayText(value, 120);
  if (!title || !VERSION_ONLY_TITLE.test(title)) return title;
  const source = readableTopicDisplayText(sourceIdentity, 40).replace(/^@+/u, '');
  if (!source || title.toLowerCase().includes(source.toLowerCase())) return title;
  return `${source} · ${title}`;
};

const RELATIVE_UNIT_MS = {
  second: 1_000,
  minute: 60_000,
  hour: 60 * 60_000,
  day: 24 * 60 * 60_000,
  week: 7 * 24 * 60 * 60_000,
  month: 30 * 24 * 60 * 60_000,
  year: 365 * 24 * 60 * 60_000,
  '秒': 1_000,
  '分钟': 60_000,
  '小时': 60 * 60_000,
  '天': 24 * 60 * 60_000,
  '周': 7 * 24 * 60 * 60_000,
  '个月': 30 * 24 * 60 * 60_000,
  '年': 365 * 24 * 60 * 60_000,
};

const publicationTimestamp = (card, now) => {
  const value = String(card?.date || '').normalize('NFKC').trim();
  const timestamp = Date.parse(value);
  if (Number.isFinite(timestamp)) return timestamp;

  const english = /^(\d+(?:\.\d+)?)\s*(second|minute|hour|day|week|month|year)(?:\(s\)|s)?\s+ago$/iu.exec(value);
  if (english) return now - Number(english[1]) * RELATIVE_UNIT_MS[english[2].toLowerCase()];

  const chinese = /^(\d+(?:\.\d+)?)\s*(秒|分钟|小时|天|周|个月|年)前$/u.exec(value);
  if (chinese) return now - Number(chinese[1]) * RELATIVE_UNIT_MS[chinese[2]];

  return null;
};

export const sortByPublicationTime = (cards = [], now = Date.now()) => cards
  .map((card, index) => ({ card, index, timestamp: publicationTimestamp(card, now) }))
  .sort((left, right) => {
    if (left.timestamp !== null && right.timestamp !== null) {
      return right.timestamp - left.timestamp || left.index - right.index;
    }
    if (left.timestamp !== null) return -1;
    if (right.timestamp !== null) return 1;
    return left.index - right.index;
  })
  .map(({ card }) => card);

export const partitionTopicEvidence = (cards = []) => {
  const socialPosts = [];
  const factEvidence = [];

  for (const card of cards) {
    if (FACT_PLATFORMS.has(normalizedPlatform(card?.platform))) factEvidence.push(card);
    else socialPosts.push(card);
  }

  return {
    socialPosts: sortByPublicationTime(socialPosts),
    factEvidence: sortByPublicationTime(factEvidence),
  };
};
