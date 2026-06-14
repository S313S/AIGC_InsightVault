const PLACEHOLDER_STATUS_PATHS = new Set([
  '/example/status/123456',
  '/i/web/status/123456',
]);

export const isPlaceholderSourceUrl = (url) => {
  const raw = String(url || '').trim();
  if (!raw || raw === '#') return false;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    if (host !== 'twitter.com' && host !== 'www.twitter.com' && host !== 'x.com' && host !== 'www.x.com') {
      return false;
    }
    return PLACEHOLDER_STATUS_PATHS.has(parsed.pathname.toLowerCase());
  } catch {
    return raw.toLowerCase().includes('twitter.com/example/status/123456') ||
      raw.toLowerCase().includes('x.com/example/status/123456');
  }
};

export const resolveOpenableSourceUrl = (url) => {
  const raw = String(url || '').trim();
  if (!raw || raw === '#' || isPlaceholderSourceUrl(raw)) return '';
  return raw;
};

export const getSourceUrlOpenBlockReason = (url) => {
  const raw = String(url || '').trim();
  if (!raw || raw === '#') return '当前卡片没有可打开的原文链接。';
  if (isPlaceholderSourceUrl(raw)) return '这是离线示例数据的占位链接，不是真实原文链接。';
  return '';
};
