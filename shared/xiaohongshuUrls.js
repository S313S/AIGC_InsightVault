const XHS_HOSTS = new Set(['xiaohongshu.com', 'www.xiaohongshu.com']);
const DEFAULT_XSEC_SOURCE = 'pc_feed';

const toUrl = (rawUrl) => {
  const raw = String(rawUrl || '').trim();
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
};

const extractNoteIdFromPath = (pathname = '') => {
  const match = pathname.match(/^\/(?:discovery\/item|explore)\/([a-zA-Z0-9]+)/i);
  return match?.[1] || '';
};

const parseXhsUrl = (rawUrl) => {
  const url = toUrl(rawUrl);
  if (!url) return null;
  if (!XHS_HOSTS.has(url.hostname.toLowerCase())) return null;

  const noteId = extractNoteIdFromPath(url.pathname);
  if (!noteId) return null;

  const xsecToken = String(url.searchParams.get('xsec_token') || '').trim();
  const xsecSource = String(url.searchParams.get('xsec_source') || DEFAULT_XSEC_SOURCE).trim() || DEFAULT_XSEC_SOURCE;
  return { noteId, xsecToken, xsecSource };
};

export const isXiaohongshuUrl = (rawUrl) => {
  const url = toUrl(rawUrl);
  return Boolean(url && XHS_HOSTS.has(url.hostname.toLowerCase()));
};

export const getXiaohongshuNoteId = (rawUrl) => {
  return parseXhsUrl(rawUrl)?.noteId || '';
};

export const getXiaohongshuXsecToken = (rawUrl) => {
  return parseXhsUrl(rawUrl)?.xsecToken || '';
};

export const hasXiaohongshuXsecToken = (rawUrl) => {
  return Boolean(getXiaohongshuXsecToken(rawUrl));
};

export const buildXiaohongshuWebUrl = (noteId, xsecToken = '', xsecSource = DEFAULT_XSEC_SOURCE) => {
  const id = String(noteId || '').trim();
  if (!id) return '';

  const base = `https://www.xiaohongshu.com/explore/${encodeURIComponent(id)}`;
  const token = String(xsecToken || '').trim();
  const source = String(xsecSource || DEFAULT_XSEC_SOURCE).trim() || DEFAULT_XSEC_SOURCE;
  if (!token) return base;
  return `${base}?xsec_token=${encodeURIComponent(token)}&xsec_source=${encodeURIComponent(source)}`;
};

export const applyXiaohongshuTokenToUrl = (rawUrl, xsecToken, xsecSource = DEFAULT_XSEC_SOURCE) => {
  const noteId = getXiaohongshuNoteId(rawUrl);
  if (!noteId) return String(rawUrl || '').trim();
  return buildXiaohongshuWebUrl(noteId, xsecToken, xsecSource);
};

export const normalizeXiaohongshuSourceUrl = (rawUrl) => {
  const raw = String(rawUrl || '').trim();
  if (!raw) return '';

  const xhs = parseXhsUrl(raw);
  if (xhs) {
    return buildXiaohongshuWebUrl(xhs.noteId, xhs.xsecToken, xhs.xsecSource);
  }

  const parsed = toUrl(raw);
  if (!parsed) return raw;
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
};
