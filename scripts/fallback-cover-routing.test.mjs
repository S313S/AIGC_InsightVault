import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fallbackCoverFromSeed,
  normalizeLegacyFallbackCover,
  isFallbackCoverUrl,
  isRenderableCoverUrl,
} from '../shared/fallbackCovers.js';

test('maps legacy fallback path to new dashboard fallback path', () => {
  assert.equal(
    normalizeLegacyFallbackCover('/fallback-covers/cover-007.svg'),
    '/dashboard-fallbacks/nature-07.svg'
  );
});

test('seeded fallback uses new nature-* naming', () => {
  const url = fallbackCoverFromSeed('https://x.com/user/status/123');
  assert.match(url, /^\/dashboard-fallbacks\/nature-\d{2}\.svg$/);
});

test('fallback detector recognizes both old and new fallback pools', () => {
  assert.equal(isFallbackCoverUrl('/fallback-covers/cover-001.svg'), true);
  assert.equal(isFallbackCoverUrl('/dashboard-fallbacks/nature-01.svg'), true);
  assert.equal(isFallbackCoverUrl('https://example.com/cover.jpg'), false);
});

test('renderable URLs include relative web paths and data URLs', () => {
  assert.equal(isRenderableCoverUrl('/dashboard-fallbacks/nature-03.svg'), true);
  assert.equal(isRenderableCoverUrl('https://example.com/abc.jpg'), true);
  assert.equal(isRenderableCoverUrl('data:image/svg+xml;base64,AAA='), true);
  assert.equal(isRenderableCoverUrl('not-a-url'), false);
});
