import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getSourceUrlOpenBlockReason,
  isPlaceholderSourceUrl,
  resolveOpenableSourceUrl,
} from '../shared/sourceUrls.js';

test('detects demo placeholder X/Twitter source URLs', () => {
  assert.equal(isPlaceholderSourceUrl('https://twitter.com/example/status/123456'), true);
  assert.equal(isPlaceholderSourceUrl('https://x.com/example/status/123456?utm=demo'), true);
  assert.equal(isPlaceholderSourceUrl('https://x.com/real_builder/status/123456'), false);
});

test('prevents opening empty or demo placeholder source URLs', () => {
  assert.equal(resolveOpenableSourceUrl('#'), '');
  assert.equal(resolveOpenableSourceUrl('https://twitter.com/example/status/123456'), '');
  assert.equal(
    resolveOpenableSourceUrl('https://x.com/real_builder/status/123456?utm=demo'),
    'https://x.com/real_builder/status/123456?utm=demo'
  );
});

test('returns a user-facing reason for blocked source URLs', () => {
  assert.equal(getSourceUrlOpenBlockReason('#'), '当前卡片没有可打开的原文链接。');
  assert.equal(
    getSourceUrlOpenBlockReason('https://twitter.com/example/status/123456'),
    '这是离线示例数据的占位链接，不是真实原文链接。'
  );
  assert.equal(getSourceUrlOpenBlockReason('https://x.com/real_builder/status/123456'), '');
});
