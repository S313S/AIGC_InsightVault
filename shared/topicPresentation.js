import { isFallbackCoverUrl, isRenderableCoverUrl } from './fallbackCovers.js';
import { resolveOpenableSourceUrl } from './sourceUrls.js';

const FACT_PLATFORMS = new Set(['github', 'official']);
const SOCIAL_PLATFORMS = new Set(['twitter', 'x', 'xiaohongshu', 'manual']);

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

const publicationTimestamp = (card) => {
  const timestamp = Date.parse(String(card?.date || ''));
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const sortByPublicationTime = (cards = []) => cards
  .map((card, index) => ({ card, index, timestamp: publicationTimestamp(card) }))
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
