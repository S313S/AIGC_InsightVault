const FALLBACK_POOL_SIZE = 10;
const LEGACY_BASE_PATH = '/fallback-covers';
const NEW_BASE_PATH = '/dashboard-fallbacks';

const legacyPattern = /\/fallback-covers\/cover-(\d{1,3})\.svg(?:\?|#|$)/i;
const newPattern = /\/dashboard-fallbacks\/nature-(\d{1,2})\.svg(?:\?|#|$)/i;

const clampIndex = (index) => {
  const n = Number(index);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return ((Math.floor(n) - 1) % FALLBACK_POOL_SIZE) + 1;
};

const pad2 = (n) => String(n).padStart(2, '0');

const hashSeed = (value) => {
  const input = String(value || '');
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const buildNaturePath = (index) => `${NEW_BASE_PATH}/nature-${pad2(clampIndex(index))}.svg`;

export const isFallbackCoverUrl = (url) => {
  const raw = String(url || '').trim();
  if (!raw) return false;
  return legacyPattern.test(raw) || newPattern.test(raw);
};

export const normalizeLegacyFallbackCover = (url) => {
  const raw = String(url || '').trim();
  if (!raw) return '';

  const oldMatch = raw.match(legacyPattern);
  if (oldMatch?.[1]) {
    return buildNaturePath(oldMatch[1]);
  }

  const newMatch = raw.match(newPattern);
  if (newMatch?.[1]) {
    return buildNaturePath(newMatch[1]);
  }

  return raw;
};

export const fallbackCoverFromSeed = (seed) => {
  const index = (hashSeed(seed) % FALLBACK_POOL_SIZE) + 1;
  return buildNaturePath(index);
};

export const isRenderableCoverUrl = (url) => {
  const value = String(url || '').trim();
  if (!value) return false;
  if (/^https?:\/\//i.test(value)) return true;
  if (value.startsWith('/')) return true;
  if (value.startsWith('data:image/')) return true;
  if (value.startsWith('blob:')) return true;
  return false;
};

export const FALLBACK_COVER_LEGACY_BASE_PATH = LEGACY_BASE_PATH;
export const FALLBACK_COVER_NEW_BASE_PATH = NEW_BASE_PATH;
