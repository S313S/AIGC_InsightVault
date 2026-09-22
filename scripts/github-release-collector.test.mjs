import assert from 'node:assert/strict';
import test from 'node:test';

import { collectGithubReleaseSignals } from '../server/sourceCollectors/githubReleases.js';

const NOW = '2026-09-22T08:00:00.000Z';

test('collects stable releases with safe headers and fact roles', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify([
      { id: 10, tag_name: 'v2.0.0', name: 'SDK 2.0', html_url: 'https://github.com/openai/openai-node/releases/tag/v2.0.0?utm_source=x', published_at: '2026-09-21T10:00:00Z', body: 'Adds API support.', draft: false, prerelease: false },
      { id: 11, tag_name: 'v2.1.0-beta', name: 'Beta', html_url: 'https://github.com/openai/openai-node/releases/tag/beta', published_at: '2026-09-21T11:00:00Z', draft: false, prerelease: true },
      { id: 12, tag_name: 'draft', name: 'Draft', html_url: 'https://github.com/openai/openai-node/releases/tag/draft', published_at: '2026-09-21T11:00:00Z', draft: true, prerelease: false },
    ]), { status: 200 });
  };
  const result = await collectGithubReleaseSignals({ fetchImpl, now: NOW, repositories: ['openai/openai-node'], token: 'secret' });
  assert.equal(result.errors.length, 0);
  assert.equal(result.signals.length, 1);
  assert.equal(result.signals[0].platform, 'GitHub');
  assert.equal(result.signals[0].sourceType, 'repository');
  assert.equal(result.signals[0].evidenceRole, 'fact');
  assert.equal(result.signals[0].sourceUrl, 'https://github.com/openai/openai-node/releases/tag/v2.0.0');
  assert.equal(result.signals[0].breakingEligible, true);
  assert.equal(result.signals[0].desc, result.signals[0].rawContent);
  assert.equal(result.signals[0].publishTime, result.signals[0].publishedAt);
  assert.deepEqual(result.signals[0].metrics, { likes: 0, bookmarks: 0, comments: 0, shares: 0, views: 0 });
  assert.match(calls[0].options.headers.Authorization, /^Bearer /u);
  assert.ok(calls[0].options.headers.Accept);
  assert.ok(calls[0].options.headers['User-Agent']);
  assert.doesNotMatch(JSON.stringify(result), /secret/u);
});

test('times out an injected GitHub fetch that ignores AbortSignal', async () => {
  const result = await Promise.race([
    collectGithubReleaseSignals({
      fetchImpl: () => new Promise(() => {}),
      now: NOW,
      repositories: ['acme/tool'],
      limits: { timeoutMs: 10 },
    }),
    new Promise((resolve) => setTimeout(() => resolve('still_pending'), 80)),
  ]);
  assert.notEqual(result, 'still_pending');
  assert.equal(result.errors[0].errorKind, 'timeout');
});

test('marks missing, invalid, and future release dates review-only', async () => {
  const releases = [
    { id: 1, tag_name: 'a', html_url: 'https://github.com/acme/tool/releases/tag/a', published_at: null, created_at: '2026-09-21T00:00:00Z' },
    { id: 2, tag_name: 'b', html_url: 'https://github.com/acme/tool/releases/tag/b', published_at: 'not-a-date' },
    { id: 3, tag_name: 'c', html_url: 'https://github.com/acme/tool/releases/tag/c', published_at: '2027-01-01T00:00:00Z' },
  ];
  const result = await collectGithubReleaseSignals({ fetchImpl: async () => new Response(JSON.stringify(releases)), now: NOW, repositories: ['acme/tool'] });
  assert.equal(result.signals.length, 3);
  assert.ok(result.signals.every((item) => item.reviewOnly && !item.breakingEligible));
});

test('falls back from hostile release URLs to canonical repository URLs', async () => {
  const release = { id: 42, tag_name: 'v1', html_url: 'javascript:alert(1)', published_at: '2026-09-21T00:00:00Z' };
  const result = await collectGithubReleaseSignals({ fetchImpl: async () => new Response(JSON.stringify([release])), now: NOW, repositories: ['acme/tool'] });
  assert.equal(result.signals[0].sourceUrl, 'https://github.com/acme/tool/releases/tag/v1');
});

test('requires HTTPS for GitHub canonical release links', async () => {
  const release = { id: 43, tag_name: 'v2', html_url: 'http://github.com/acme/tool/releases/tag/v2', published_at: '2026-09-21T00:00:00Z' };
  const result = await collectGithubReleaseSignals({ fetchImpl: async () => new Response(JSON.stringify([release])), now: NOW, repositories: ['acme/tool'] });
  assert.equal(result.signals[0].sourceUrl, 'https://github.com/acme/tool/releases/tag/v2');
});

test('reports rate limits safely and continues other repositories', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('/blocked/')) return new Response('token secret server body', { status: 429, headers: { 'retry-after': '60', 'x-ratelimit-reset': '1790000000' } });
    return new Response(JSON.stringify([{ id: 1, tag_name: 'v1', html_url: 'https://github.com/ok/repo/releases/tag/v1', published_at: '2026-09-21T00:00:00Z' }]));
  };
  const result = await collectGithubReleaseSignals({ fetchImpl, now: NOW, repositories: ['blocked/repo', 'ok/repo'], token: 'secret' });
  assert.equal(result.signals.length, 1);
  assert.equal(result.errors[0].errorKind, 'rate_limited');
  assert.equal(result.errors[0].repository, 'blocked/repo');
  assert.equal(result.errors[0].rateLimitReset, '1790000000');
  assert.doesNotMatch(JSON.stringify(result.errors), /secret|server body/u);
});

test('uses bounded pagination, content, and stable identifiers', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    const items = Array.from({ length: 3 }, (_, index) => ({ id: calls * 10 + index, tag_name: `v${calls}.${index}`, html_url: `https://github.com/acme/tool/releases/tag/v${calls}.${index}`, published_at: '2026-09-21T00:00:00Z', body: 'x'.repeat(200) }));
    return new Response(JSON.stringify(items), { headers: calls === 1 ? { link: '<https://api.github.com/repos/acme/tool/releases?page=2>; rel="next"' } : {} });
  };
  const first = await collectGithubReleaseSignals({ fetchImpl, now: NOW, repositories: [{ repo: 'acme/tool', maxReleases: 4, maxPages: 2 }], limits: { maxContentChars: 30 } });
  assert.equal(first.signals.length, 4);
  assert.equal(calls, 2);
  assert.ok(first.signals.every((item) => item.rawContent.length <= 30));
  const ids = first.signals.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('never follows insecure pagination links with an authorization token', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(JSON.stringify([{ id: 1, tag_name: 'v1', html_url: 'https://github.com/acme/tool/releases/tag/v1', published_at: '2026-09-21T00:00:00Z' }]), {
      headers: { link: '<http://api.github.com/repos/acme/tool/releases?page=2>; rel="next"' },
    });
  };
  const result = await collectGithubReleaseSignals({ fetchImpl, now: NOW, repositories: ['acme/tool'], token: 'TOP_SECRET' });
  assert.equal(calls, 1);
  assert.equal(result.signals.length, 1);
});

test('deduplicates duplicate repository configuration and repeated releases', async () => {
  let calls = 0;
  const release = { id: 1, tag_name: 'v1', html_url: 'https://github.com/acme/tool/releases/tag/v1', published_at: '2026-09-21T00:00:00Z' };
  const result = await collectGithubReleaseSignals({
    fetchImpl: async () => { calls += 1; return new Response(JSON.stringify([release, release])); },
    now: NOW,
    repositories: ['acme/tool', 'ACME/tool'],
  });
  assert.equal(calls, 1);
  assert.equal(result.signals.length, 1);
});
