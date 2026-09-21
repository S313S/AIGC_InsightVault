import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEvidenceFingerprint,
  normalizeEvidenceUrl,
  tokenizeTopicText,
} from '../shared/topicNormalization.js';

test('normalizes evidence identity URLs without mutating the openable source URL', () => {
  const card = {
    id: 'xhs-1',
    title: 'Claude Code 实战',
    sourceUrl: 'https://www.xiaohongshu.com/explore/67e81903000000000b03798f?xsec_token=secret-token&xsec_source=pc_feed&utm_source=share',
  };
  const before = structuredClone(card);

  assert.equal(
    normalizeEvidenceUrl(card.sourceUrl),
    'https://www.xiaohongshu.com/explore/67e81903000000000b03798f'
  );
  assert.deepEqual(card, before);
  assert.equal(card.sourceUrl.includes('xsec_token=secret-token'), true);
});

test('uses the Xiaohongshu note id as identity even when access tokens differ', () => {
  const first = 'https://www.xiaohongshu.com/discovery/item/67e81903000000000b03798f?xsec_token=first';
  const second = 'https://xiaohongshu.com/explore/67e81903000000000b03798f?xsec_token=second&xsec_source=pc_search';

  assert.equal(normalizeEvidenceUrl(first), normalizeEvidenceUrl(second));
});

test('normalizes Twitter and X status identity across hosts and tracking queries', () => {
  const twitter = 'https://twitter.com/openai/status/1900000000000000000?utm_source=newsletter';
  const x = 'https://www.x.com/OpenAI/status/1900000000000000000?ref=home&source=timeline';

  assert.equal(normalizeEvidenceUrl(twitter), 'https://x.com/i/status/1900000000000000000');
  assert.equal(normalizeEvidenceUrl(twitter), normalizeEvidenceUrl(x));
});

test('removes known tracking parameters but conservatively retains resource queries', () => {
  assert.equal(
    normalizeEvidenceUrl('https://example.com/releases?id=42&lang=zh&utm_medium=social&ref=feed#comments'),
    'https://example.com/releases?id=42&lang=zh'
  );
  assert.notEqual(
    normalizeEvidenceUrl('https://example.com/releases?id=42'),
    normalizeEvidenceUrl('https://example.com/releases?id=43')
  );
});

test('produces a query-free normalized evidence key when all params are removable', () => {
  assert.equal(
    normalizeEvidenceUrl('https://example.com/launch?utm_campaign=spring&source=twitter'),
    'https://example.com/launch'
  );
});

test('tokenizes Unicode text while preserving bilingual product phrases and filtering generic terms', () => {
  const tokens = tokenizeTopicText({
    title: 'AI 工具｜Claude Code、可灵与 SORA 实战教程！',
    rawContent: 'Claude Code improves coding; 可灵和 Sora 都发布新版本。',
    tags: ['AIGC', '人工智能'],
  });

  assert.equal(tokens.includes('claude_code'), true);
  assert.equal(tokens.includes('可灵'), true);
  assert.equal(tokens.includes('sora'), true);
  assert.equal(tokens.includes('ai'), false);
  assert.equal(tokens.includes('aigc'), false);
  assert.equal(tokens.includes('人工智能'), false);
  assert.equal(tokens.includes('教程'), false);
  assert.equal(tokens.includes('工具'), false);
  assert.equal(tokens.filter((token) => token === 'claude_code').length, 1);
});

test('builds stable fingerprints from normalized URL identity before text', () => {
  const first = {
    title: 'Original title',
    sourceUrl: 'https://x.com/builder/status/1900000000000000000?utm_source=share',
  };
  const repost = {
    title: 'Completely rewritten title',
    source_url: 'https://twitter.com/another/status/1900000000000000000?ref=timeline',
  };

  assert.equal(buildEvidenceFingerprint(first), buildEvidenceFingerprint(repost));
});

test('falls back to normalized distinctive text when a URL is unavailable', () => {
  assert.equal(
    buildEvidenceFingerprint({ title: 'Claude Code Agent Teams Launch' }),
    buildEvidenceFingerprint({ title: '  CLAUDE CODE — agent teams launch! ' })
  );
});
