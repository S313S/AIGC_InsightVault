import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { collectPrimarySourceEvidence } from '../server/factSourceIntegration.js';
import { scoreTopicCluster } from '../shared/topicScoring.js';

const rootUrl = new URL('../', import.meta.url);

test('collects primary sources independently and preserves partial results', async () => {
  let officialOptions;
  let githubOptions;
  const result = await collectPrimarySourceEvidence({
    now: '2026-09-22T08:00:00.000Z',
    env: {
      TOPIC_OFFICIAL_MAX_FEEDS: '1',
      TOPIC_GITHUB_MAX_REPOS: '1',
      TOPIC_FACT_TIMEOUT_MS: '2500',
      TOPIC_FACT_MAX_ENTRIES: '4',
      GITHUB_TOKEN: 'secret',
    },
    officialCollector: async (options) => {
      officialOptions = options;
      return {
        signals: [{ id: 'official-1', platform: 'Official', sourceUrl: 'https://openai.com/news/one' }],
        errors: [],
      };
    },
    githubCollector: async (options) => {
      githubOptions = options;
      throw new Error('upstream unavailable');
    },
  });

  assert.deepEqual(result.intendedPlatforms, ['official', 'github']);
  assert.deepEqual(result.signals.map((signal) => signal.id), ['official-1']);
  assert.equal(result.platformTotals.official.completed, true);
  assert.equal(result.platformTotals.official.output, 1);
  assert.equal(result.platformTotals.github.completed, false);
  assert.equal(result.platformErrors[0].platform, 'github');
  assert.equal(result.platformErrors[0].error, 'collector_failed');
  assert.equal(officialOptions.sources.length, 1);
  assert.equal(githubOptions.repositories.length, 1);
  assert.equal(officialOptions.limits.timeoutMs, 2500);
  assert.equal(githubOptions.limits.maxEntries, 4);
  assert.equal(githubOptions.token, 'secret');
  assert.doesNotMatch(JSON.stringify(result), /secret|upstream unavailable/u);
});

test('reports per-source errors without dropping another primary source', async () => {
  const result = await collectPrimarySourceEvidence({
    officialCollector: async () => ({
      signals: [{ id: 'official-1', platform: 'Official' }],
      errors: [{ sourceId: 'broken-feed', errorKind: 'timeout' }],
    }),
    githubCollector: async () => ({
      signals: [{ id: 'github-1', platform: 'GitHub' }],
      errors: [{ repository: 'broken/repo', errorKind: 'rate_limited', status: 429 }],
    }),
  });

  assert.equal(result.signals.length, 2);
  assert.deepEqual(result.platformErrors, [
    { platform: 'official', source: 'broken-feed', error: 'timeout' },
    { platform: 'github', source: 'broken/repo', error: 'rate_limited', status: 429 },
  ]);
});

test('fact evidence raises confidence without inventing social momentum', () => {
  const social = {
    id: 'social',
    title: 'GPT-6 API update',
    rawContent: 'GPT-6 API release announcement and benchmark details.',
    sourceUrl: 'https://x.com/example/status/1',
    platform: 'Twitter',
    sourceType: 'social',
    publishedAt: '2026-09-22T06:00:00.000Z',
    metrics: { likes: 20, bookmarks: 3, comments: 2, shares: 1 },
  };
  const socialScore = scoreTopicCluster({ evidence: [social] }, { now: '2026-09-22T08:00:00.000Z' });
  const enrichedScore = scoreTopicCluster({ evidence: [
    social,
    {
      ...social,
      id: 'official',
      sourceUrl: 'https://openai.com/news/gpt-6',
      platform: 'Official',
      sourceType: 'official',
      metrics: { likes: 0, bookmarks: 0, comments: 0, shares: 0 },
    },
  ] }, { now: '2026-09-22T08:00:00.000Z' });

  assert.ok(enrichedScore.confidenceScore > socialScore.confidenceScore);
  assert.equal(enrichedScore.breakingScore, socialScore.breakingScore);
});

test('cron persists fact evidence and exposes primary-source health', async () => {
  const source = await readFile(new URL('api/cron-monitor.js', rootUrl), 'utf8');
  assert.match(source, /collectPrimarySourceEvidence/);
  assert.match(source, /allResults\.push\(\.\.\.factEvidence\.signals\)/);
  assert.match(source, /intendedPlatforms\s*=\s*\[\.\.\.effectivePlatforms,\s*\.\.\.factEvidence\.intendedPlatforms\]/s);
  assert.match(source, /platformTotals\s*=\s*\{[\s\S]*?\.\.\.factEvidence\.platformTotals/);
  assert.match(source, /platformErrors\.push\(\.\.\.factEvidence\.platformErrors\)/);
});

test('platform contracts and badges include Official and GitHub', async () => {
  const [types, card, dashboard] = await Promise.all([
    readFile(new URL('types.ts', rootUrl), 'utf8'),
    readFile(new URL('components/Card.tsx', rootUrl), 'utf8'),
    readFile(new URL('components/DashboardView.tsx', rootUrl), 'utf8'),
  ]);
  assert.match(types, /Official\s*=\s*'Official'/);
  assert.match(types, /GitHub\s*=\s*'GitHub'/);
  for (const source of [card, dashboard]) {
    assert.match(source, /\[Platform\.Official\]/);
    assert.match(source, /\[Platform\.GitHub\]/);
  }
});
