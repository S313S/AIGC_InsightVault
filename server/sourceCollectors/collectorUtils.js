import { createHash } from 'node:crypto';

const TRACKING_PARAMETERS = new Set(['fbclid', 'gclid', 'igshid', 'mc_cid', 'mc_eid', 'ref', 'ref_src']);

export const stableHash = (value) => createHash('sha256').update(String(value)).digest('hex');

export const cleanText = (value, maxChars = 4_000) => {
  const bounded = String(value ?? '').slice(0, Math.max(256, maxChars * 4));
  return bounded
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maxChars);
};

export const canonicalHttpUrl = (value, base, predicate = () => true) => {
  try {
    const url = new URL(String(value || '').trim(), base);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !predicate(url)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMETERS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
};

const ISO_CALENDAR_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s]|$)/u;

export const parseStrictDate = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  const calendar = text.match(ISO_CALENDAR_PATTERN);
  if (calendar) {
    const year = Number(calendar[1]);
    const month = Number(calendar[2]);
    const day = Number(calendar[3]);
    const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (month < 1 || month > 12 || day < 1 || day > maxDay) return null;
  }
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const classifyPublicationDate = (value, nowMs) => {
  const timestamp = parseStrictDate(value);
  if (timestamp === null || timestamp > nowMs + 5 * 60 * 1000) {
    return { timestamp: null, publishedAt: null, reviewOnly: true, breakingEligible: false };
  }
  return { timestamp, publishedAt: new Date(timestamp).toISOString(), reviewOnly: false, breakingEligible: true };
};

export const readBoundedText = async (response, maxChars) => {
  const contentLength = Number(response?.headers?.get?.('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxChars * 4) {
    const error = new Error('response_too_large');
    error.kind = 'response_too_large';
    throw error;
  }
  if (!response?.body?.getReader) {
    const text = await response.text();
    if (text.length > maxChars) {
      const error = new Error('response_too_large');
      error.kind = 'response_too_large';
      throw error;
    }
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length > maxChars) {
        const error = new Error('response_too_large');
        error.kind = 'response_too_large';
        throw error;
      }
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock?.();
  }
};

export const fetchWithTimeout = async (fetchImpl, url, options, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

export const safeErrorKind = (error) => {
  if (error?.kind) return String(error.kind);
  if (error?.name === 'AbortError' || /abort|timeout/iu.test(String(error?.message || ''))) return 'timeout';
  return 'request_failed';
};

export const asArray = (value) => value == null ? [] : Array.isArray(value) ? value : [value];

export const scalarText = (value) => {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (!value || typeof value !== 'object') return '';
  return scalarText(value['#text'] ?? value.__cdata ?? value._ ?? '');
};
