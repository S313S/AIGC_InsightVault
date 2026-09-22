import { normalizeEvidenceUrl } from './topicNormalization.js';

export const DASHBOARD_RANKING_CATEGORIES = Object.freeze([
  Object.freeze({
    id: 'vibe-coding',
    label: 'Vibe Coding',
    accent: 'indigo',
    patterns: Object.freeze([
      /\bvibe[\s-]*coding\b/iu,
      /\bclaude[\s-]*code\b/iu,
      /\bcodex\b/iu,
      /\bcursor\b/iu,
      /\bcopilot\b/iu,
      /\blovable\b/iu,
      /\bbolt\.new\b/iu,
      /编程助手|代码助手|氛围编程/iu,
    ]),
  }),
  Object.freeze({
    id: 'ai-tools',
    label: 'AI 工具',
    accent: 'emerald',
    patterns: Object.freeze([
      /\bai[\s-]*tools?\b/iu,
      /\bai[\s-]*agent\b/iu,
      /\bagentic\b/iu,
      /\bmcp\b/iu,
      /\bworkflow\b/iu,
      /\bautomation\b/iu,
      /智能体|智能助手|自动化工作流|效率工具/iu,
    ]),
  }),
  Object.freeze({
    id: 'image-gen',
    label: 'Image Gen',
    accent: 'purple',
    patterns: Object.freeze([
      /\bimage[\s-]*(?:gen|generation)\b/iu,
      /\bmidjourney\b/iu,
      /\bstable[\s-]*diffusion\b/iu,
      /\bflux\b/iu,
      /\bdall[\s-]*e\b/iu,
      /\bimagen\b/iu,
      /图像生成|文生图|绘图模型/iu,
    ]),
  }),
  Object.freeze({
    id: 'video-gen',
    label: 'Video Gen',
    accent: 'rose',
    patterns: Object.freeze([
      /\bvideo[\s-]*(?:gen|generation)\b/iu,
      /\bsora\b/iu,
      /\bveo\b/iu,
      /\brunway\b/iu,
      /\bkling\b/iu,
      /视频生成|文生视频|可灵/iu,
    ]),
  }),
]);

const numberOrZero = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const timestampOrMinimum = (value) => {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
};

export const compareDashboardHotness = (left, right) =>
  numberOrZero(right?.metrics?.likes) - numberOrZero(left?.metrics?.likes) ||
  numberOrZero(right?.metrics?.bookmarks) - numberOrZero(left?.metrics?.bookmarks) ||
  timestampOrMinimum(right?.date) - timestampOrMinimum(left?.date) ||
  String(left?.id || '').localeCompare(String(right?.id || ''));

const fallbackIdentity = (card) => [
  card?.platform,
  card?.author,
  card?.title,
  card?.id,
].map(value => String(value || '').trim().toLowerCase()).join('|');

export const dedupeDashboardCards = (cards = []) => {
  const sorted = [...(Array.isArray(cards) ? cards : [])].sort(compareDashboardHotness);
  const seen = new Set();
  return sorted.filter(card => {
    const identity = normalizeEvidenceUrl(card?.sourceUrl) || fallbackIdentity(card);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
};

export const selectHotPosts = (cards = [], limit = 6) =>
  dedupeDashboardCards(cards).slice(0, Math.max(0, Number(limit) || 0));

const searchableCardText = (card) => [
  ...(Array.isArray(card?.tags) ? card.tags : []),
  card?.title,
  card?.rawContent,
  card?.aiAnalysis?.summary,
  ...(Array.isArray(card?.aiAnalysis?.toolTags) ? card.aiAnalysis.toolTags : []),
]
  .filter(value => typeof value === 'string' && value.trim())
  .join(' ')
  .normalize('NFKC');

const matchesCategory = (card, category) => {
  const text = searchableCardText(card);
  return text !== '' && category.patterns.some(pattern => pattern.test(text));
};

export const buildCategoryRankings = (cards = [], { limit = 3 } = {}) => {
  const uniqueCards = dedupeDashboardCards(cards);
  const safeLimit = Math.max(0, Number(limit) || 0);

  return DASHBOARD_RANKING_CATEGORIES
    .map(category => ({
      id: category.id,
      label: category.label,
      accent: category.accent,
      items: uniqueCards.filter(card => matchesCategory(card, category)).slice(0, safeLimit),
    }))
    .filter(category => category.items.length > 0);
};
