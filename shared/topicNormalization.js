const XIAOHONGSHU_HOSTS = new Set(['xiaohongshu.com', 'www.xiaohongshu.com']);
const X_STATUS_HOSTS = new Set(['twitter.com', 'www.twitter.com', 'x.com', 'www.x.com']);

const TRACKING_PARAM_NAMES = new Set([
  'dclid',
  'fbclid',
  'gclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'msclkid',
  'spm',
]);
const PRESENTATION_PARAM_NAMES = new Set(['hl', 'lang', 'locale']);

const GENERIC_TOPIC_TERMS = new Set([
  'ai',
  'aigc',
  'artificial',
  'intelligence',
  'tool',
  'tools',
  'tutorial',
  'tutorials',
  'guide',
  'guides',
  'launch',
  'launches',
  'launched',
  'launching',
  'model',
  'models',
  'new',
  'release',
  'releases',
  'released',
  'releasing',
  'update',
  'updates',
  'updated',
  'updating',
  'announcement',
  'announcements',
  'announce',
  'announces',
  'announced',
  'announcing',
  'the',
  'a',
  'an',
  'and',
  'or',
  'for',
  'of',
  'to',
  'in',
  'on',
  'with',
  '人工智能',
  '教程',
  '工具',
  '发布',
  '上线',
  '更新',
  '模型',
  '新品',
  '新模型',
  '官宣',
  '宣布',
  '公告',
]);

const CHINESE_STOP_TERMS = [
  '人工智能',
  '新模型',
  '教程',
  '工具',
  '发布',
  '上线',
  '更新',
  '模型',
  '新品',
  '官宣',
  '宣布',
  '公告',
  '新',
];
const SHORT_CHINESE_STOP_WORDS = new Set(['与', '和', '及', '的', '了', '都', '会', '正式']);

const PRODUCT_ALIASES = [
  { alias: 'claude code', token: 'claude_code' },
  { alias: 'gemini', token: 'gemini' },
  { alias: 'claude', token: 'claude' },
  { alias: 'sora', token: 'sora' },
  { alias: 'veo', token: 'veo' },
  { alias: 'gpt', token: 'gpt' },
  { alias: '可灵', token: '可灵' },
];

const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const buildProductPattern = (alias, withVersion) => {
  const isLatin = /^[a-z]/iu.test(alias);
  const core = alias
    .split(/[\s._-]+/u)
    .map(escapePattern)
    .join('[\\s._-]*');
  const prefix = isLatin ? '\\b' : '';
  const suffix = withVersion ? '[\\s._-]*(\\d+(?:\\.\\d+)*)\\b' : (isLatin ? '\\b' : '');
  return new RegExp(`${prefix}${core}${suffix}`, 'giu');
};

const PRODUCT_PROTECTION_RULES = [
  ...PRODUCT_ALIASES.map(({ alias, token }) => ({
    pattern: buildProductPattern(alias, true),
    toToken: (_, version) => `${token}_${version.replaceAll('.', '_')}`,
  })),
  ...PRODUCT_ALIASES.map(({ alias, token }) => ({
    pattern: buildProductPattern(alias, false),
    toToken: () => token,
  })),
];

const VERSIONED_PRODUCT_TOKENS = PRODUCT_ALIASES
  .map(({ token }) => token)
  .sort((left, right) => right.length - left.length);

const asUrl = (rawUrl) => {
  const raw = String(rawUrl || '').trim();
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
};

const extractXiaohongshuNoteId = (pathname) => {
  return pathname.match(/^\/(?:discovery\/item|explore)\/([a-z0-9]+)/iu)?.[1] || '';
};

const extractXStatusId = (pathname) => {
  return pathname.match(/^\/(?:[^/]+\/status|i\/web\/status)\/(\d+)(?:\/|$)/iu)?.[1] || '';
};

const isTrackingParam = (name) => {
  const normalized = String(name || '').toLowerCase();
  return normalized.startsWith('utm_') || TRACKING_PARAM_NAMES.has(normalized);
};

const isPresentationParam = (name) => {
  return PRESENTATION_PARAM_NAMES.has(String(name || '').toLowerCase());
};

export const normalizeEvidenceUrl = (rawUrl) => {
  const raw = String(rawUrl || '').trim();
  if (!raw) return '';

  const parsed = asUrl(raw);
  if (!parsed || !['http:', 'https:'].includes(parsed.protocol.toLowerCase())) return '';

  const hostname = parsed.hostname.toLowerCase();
  if (XIAOHONGSHU_HOSTS.has(hostname)) {
    const noteId = extractXiaohongshuNoteId(parsed.pathname);
    if (noteId) return `https://www.xiaohongshu.com/explore/${noteId}`;
  }

  if (X_STATUS_HOSTS.has(hostname)) {
    const statusId = extractXStatusId(parsed.pathname);
    if (statusId) return `https://x.com/i/status/${statusId}`;
  }

  for (const name of [...parsed.searchParams.keys()]) {
    if (isTrackingParam(name) || isPresentationParam(name)) parsed.searchParams.delete(name);
  }
  parsed.searchParams.sort();
  return parsed.toString();
};

const collectCardText = (card = {}) => {
  const values = [
    card.title,
    card.suggestedTitle,
    card.summary,
    card.rawContent,
    card.raw_content,
    card.aiAnalysis?.summary,
    ...(Array.isArray(card.tags) ? card.tags : []),
    ...(Array.isArray(card.aiAnalysis?.toolTags) ? card.aiAnalysis.toolTags : []),
  ];
  return values.filter(Boolean).join(' ');
};

const splitChineseToken = (token) => {
  let normalized = token;
  for (const term of CHINESE_STOP_TERMS) normalized = normalized.split(term).join(' ');
  return normalized
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter((part) => part && !SHORT_CHINESE_STOP_WORDS.has(part));
};

export const tokenizeTopicText = (card = {}) => {
  let text = collectCardText(card).normalize('NFKC').toLowerCase();
  const protectedTokens = [];

  PRODUCT_PROTECTION_RULES.forEach(({ pattern, toToken }) => {
    text = text.replace(pattern, (...args) => {
      const index = protectedTokens.length;
      protectedTokens.push(toToken(...args));
      return ` protectedphrase${index} `;
    });
  });

  const rawTokens = text.match(/[a-z0-9_]+|[\p{Script=Han}]+/gu) || [];
  const tokens = [];
  for (const token of rawTokens) {
    const protectedMatch = token.match(/^protectedphrase(\d+)$/u);
    if (protectedMatch) {
      tokens.push(protectedTokens[Number(protectedMatch[1])]);
      continue;
    }

    if (/^[\p{Script=Han}]+$/u.test(token)) {
      tokens.push(...splitChineseToken(token));
      continue;
    }

    if (token.length > 1 && !GENERIC_TOPIC_TERMS.has(token)) tokens.push(token);
  }

  tokens.push(...protectedTokens);
  return [...new Set(tokens.filter((token) => !GENERIC_TOPIC_TERMS.has(token)))].sort();
};

export const buildEvidenceFingerprint = (card = {}) => {
  const sourceUrl = card.sourceUrl || card.source_url;
  const normalizedUrl = normalizeEvidenceUrl(sourceUrl);
  if (normalizedUrl) return `url:${normalizedUrl}`;

  const cardId = String(card.id || '').trim();
  if (cardId) return `id:${cardId}`;

  const tokens = tokenizeTopicText({
    title: card.title,
    suggestedTitle: card.suggestedTitle,
    summary: card.summary,
    rawContent: card.rawContent,
    raw_content: card.raw_content,
    aiAnalysis: { summary: card.aiAnalysis?.summary },
  });
  if (tokens.length > 0) return `text:${tokens.join('|')}`;

  const fallback = String(card.title || card.id || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase();
  return `text:${fallback}`;
};

export const isDistinctiveTopicToken = (token) => {
  const normalized = String(token || '').trim().toLowerCase();
  return Boolean(normalized && !GENERIC_TOPIC_TERMS.has(normalized));
};

export const isVersionedProductToken = (token) => {
  const normalized = String(token || '').trim().toLowerCase();
  return VERSIONED_PRODUCT_TOKENS.some((productToken) => {
    if (!normalized.startsWith(`${productToken}_`)) return false;
    return /^\d+(?:_\d+)*$/u.test(normalized.slice(productToken.length + 1));
  });
};
