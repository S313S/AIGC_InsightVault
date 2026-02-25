import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildXiaohongshuWebUrl,
  getXiaohongshuNoteId,
  hasXiaohongshuXsecToken,
  normalizeXiaohongshuSourceUrl,
} from '../shared/xiaohongshuUrls.js';

test('normalizes discovery/item URL by preserving xsec token and source', () => {
  assert.equal(
    normalizeXiaohongshuSourceUrl('https://www.xiaohongshu.com/discovery/item/67e81903000000000b03798f?xsec_token=abc123'),
    'https://www.xiaohongshu.com/explore/67e81903000000000b03798f?xsec_token=abc123&xsec_source=pc_feed'
  );
});

test('normalizes explore URL while preserving existing xsec params', () => {
  assert.equal(
    normalizeXiaohongshuSourceUrl('https://www.xiaohongshu.com/explore/67e81903000000000b03798f?xsec_token=token-xyz&xsec_source=pc_feed#bar'),
    'https://www.xiaohongshu.com/explore/67e81903000000000b03798f?xsec_token=token-xyz&xsec_source=pc_feed'
  );
});

test('returns no-query explore URL when xsec token is missing', () => {
  assert.equal(
    normalizeXiaohongshuSourceUrl('https://www.xiaohongshu.com/discovery/item/67e81903000000000b03798f'),
    'https://www.xiaohongshu.com/explore/67e81903000000000b03798f'
  );
});

test('builds canonical URL with token and source', () => {
  assert.equal(
    buildXiaohongshuWebUrl('67e81903000000000b03798f', 'abc123', 'pc_feed'),
    'https://www.xiaohongshu.com/explore/67e81903000000000b03798f?xsec_token=abc123&xsec_source=pc_feed'
  );
});

test('extracts note id and detects missing token', () => {
  const url = 'https://www.xiaohongshu.com/explore/67e81903000000000b03798f';
  assert.equal(getXiaohongshuNoteId(url), '67e81903000000000b03798f');
  assert.equal(hasXiaohongshuXsecToken(url), false);
});
