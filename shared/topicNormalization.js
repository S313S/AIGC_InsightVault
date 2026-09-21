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

const PROTECTED_PHRASES = [
  { pattern: /claude[\s\-_]+code/giu, token: 'claude_code' },
  { pattern: /可灵/gu, token: '可灵' },
  { pattern: /sora/giu, token: 'sora' },
];

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

export const normalizeEvidenceUrl = (rawUrl) => {
  const raw = String(rawUrl || '').trim();
  if (!raw) return '';

  const parsed = asUrl(raw);
  if (!parsed) return raw;

  const hostname = parsed.hostname.toLowerCase();
  if (XIAOHONGSHU_HOSTS.has(hostname)) {
    const noteId = extractXiaohongshuNoteId(parsed.pathname);
    if (noteId) return `https://www.xiaohongshu.com/explore/${noteId}`;
  }

  if (X_STATUS_HOSTS.has(hostname)) {
    const statusId = extractXStatusId(parsed.pathname);
    if (statusId) return `https://x.com/i/status/${statusId}`;
  }

  parsed.hash = '';
  for (const name of [...parsed.searchParams.keys()]) {
    if (isTrackingParam(name)) parsed.searchParams.delete(name);
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

  PROTECTED_PHRASES.forEach(({ pattern, token }, index) => {
    const marker = ` protectedphrase${index} `;
    if (pattern.test(text)) protectedTokens.push(token);
    pattern.lastIndex = 0;
    text = text.replace(pattern, marker);
  });

  const rawTokens = text.match(/[a-z0-9_]+|[\p{Script=Han}]+/gu) || [];
  const tokens = [];
  for (const token of rawTokens) {
    const protectedMatch = token.match(/^protectedphrase(\d+)$/u);
    if (protectedMatch) {
      tokens.push(PROTECTED_PHRASES[Number(protectedMatch[1])].token);
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

  const tokens = tokenizeTopicText(card);
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
