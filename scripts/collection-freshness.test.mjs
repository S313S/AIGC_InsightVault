import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const loadFreshnessHelpers = () => import('../shared/collectionFreshness.js');

test('extracts the newest valid snapshot timestamp without mutating cards', async () => {
  const { getLatestCollectionAt } = await loadFreshnessHelpers();
  const cards = [
    { tags: ['snapshot:2026-09-20T01:00:00.000Z', 'ai'] },
    { tags: ['snapshot:not-a-date', 'snapshot:2026-09-21T01:00:00.000Z'] },
    { tags: ['snapshot:legacy'] },
    { tags: null },
  ];
  const before = structuredClone(cards);

  assert.equal(getLatestCollectionAt(cards), '2026-09-21T01:00:00.000Z');
  assert.deepEqual(cards, before);
});

test('returns null when cards contain no valid snapshot timestamp', async () => {
  const { getLatestCollectionAt } = await loadFreshnessHelpers();

  assert.equal(getLatestCollectionAt([
    { tags: ['snapshot:legacy', 'snapshot:bad-date'] },
    { tags: ['ai'] },
  ]), null);
});

test('selects the newest real snapshot batch over legacy and invalid tags', async () => {
  const { selectLatestSnapshotCards } = await loadFreshnessHelpers();
  const cards = [
    { id: 'legacy', tags: ['snapshot:legacy'] },
    { id: 'invalid', tags: ['snapshot:not-a-date'] },
    { id: 'older', tags: ['snapshot:2026-09-20T01:00:00.000Z'] },
    { id: 'latest-a', tags: ['snapshot:2026-09-21T01:00:00.000Z'] },
    { id: 'latest-b', tags: ['ai', 'snapshot:2026-09-21T01:00:00.000Z'] },
  ];

  assert.deepEqual(
    selectLatestSnapshotCards(cards).map(card => card.id),
    ['latest-a', 'latest-b']
  );
});

test('keeps legacy cards when no valid timestamp batch exists', async () => {
  const { selectLatestSnapshotCards } = await loadFreshnessHelpers();
  const cards = [
    { id: 'legacy', tags: ['snapshot:legacy'] },
    { id: 'untagged', tags: ['ai'] },
    { id: 'invalid', tags: ['snapshot:not-a-date'] },
  ];

  assert.deepEqual(
    selectLatestSnapshotCards(cards).map(card => card.id),
    ['legacy', 'untagged']
  );
});

test('returns all unclassifiable cards instead of letting an invalid tag win', async () => {
  const { selectLatestSnapshotCards } = await loadFreshnessHelpers();
  const cards = [
    { id: 'invalid-a', tags: ['snapshot:not-a-date'] },
    { id: 'invalid-b', tags: ['snapshot:tomorrow-ish'] },
  ];

  assert.deepEqual(selectLatestSnapshotCards(cards), cards);
});

test('rejects calendar-invalid snapshot timestamps', async () => {
  const { getLatestCollectionAt } = await loadFreshnessHelpers();

  assert.equal(getLatestCollectionAt([
    { tags: ['snapshot:2026-02-30T00:00:00.000Z'] },
  ]), null);
});

test('accepts valid UTC shorthand timestamps', async () => {
  const { getCollectionFreshness } = await loadFreshnessHelpers();

  assert.deepEqual(getCollectionFreshness({
    collectedAt: '2026-09-21T01:00:00Z',
    now: Date.parse('2026-09-21T02:00:00.000Z'),
  }), {
    status: 'fresh',
    ageMs: 60 * 60 * 1000,
  });
});

test('accepts timezone offsets and compares snapshots by their real instant', async () => {
  const { getLatestCollectionAt } = await loadFreshnessHelpers();

  assert.equal(getLatestCollectionAt([
    { tags: ['snapshot:2026-09-21T01:30:00Z'] },
    { tags: ['snapshot:2026-09-21T10:00:00+08:00'] },
  ]), '2026-09-21T10:00:00+08:00');
});

test('marks a recent collection fresh and reports its age', async () => {
  const { getCollectionFreshness } = await loadFreshnessHelpers();
  const now = Date.parse('2026-09-21T12:00:00.000Z');

  assert.deepEqual(getCollectionFreshness({
    collectedAt: '2026-09-21T00:00:00.000Z',
    now,
  }), {
    status: 'fresh',
    ageMs: 12 * 60 * 60 * 1000,
  });
});

test('marks a collection stale after the freshness window', async () => {
  const { getCollectionFreshness } = await loadFreshnessHelpers();
  const now = Date.parse('2026-09-21T00:00:00.000Z');

  assert.deepEqual(getCollectionFreshness({
    collectedAt: '2026-09-18T00:00:00.000Z',
    now,
  }), {
    status: 'stale',
    ageMs: 3 * 24 * 60 * 60 * 1000,
  });
});

test('changes from fresh to stale exactly at the freshness boundary', async () => {
  const { getCollectionFreshness } = await loadFreshnessHelpers();
  const collectedAt = '2026-09-20T00:00:00.000Z';
  const staleAfterMs = 36 * 60 * 60 * 1000;

  assert.equal(getCollectionFreshness({
    collectedAt,
    now: Date.parse(collectedAt) + staleAfterMs - 1,
    staleAfterMs,
  }).status, 'fresh');
  assert.equal(getCollectionFreshness({
    collectedAt,
    now: Date.parse(collectedAt) + staleAfterMs,
    staleAfterMs,
  }).status, 'stale');
});

test('successful empty trending keeps the last good snapshot and collection time', async () => {
  const { resolveTrendingSnapshot } = await loadFreshnessHelpers();
  const previousCards = [{ id: 'old', tags: ['snapshot:2026-09-19T01:00:00.000Z'] }];

  assert.deepEqual(resolveTrendingSnapshot({
    ok: true,
    cards: [],
    previousCards,
    previousCollectedAt: '2026-09-19T01:00:00.000Z',
  }), {
    cards: previousCards,
    collectedAt: '2026-09-19T01:00:00.000Z',
  });
});

test('successful empty trending without a baseline remains empty and unknown', async () => {
  const { resolveTrendingSnapshot } = await loadFreshnessHelpers();

  assert.deepEqual(resolveTrendingSnapshot({
    ok: true,
    cards: [],
    previousCards: [],
    previousCollectedAt: null,
  }), {
    cards: [],
    collectedAt: null,
  });
});

test('failed trending load preserves the previous snapshot metadata', async () => {
  const { resolveTrendingSnapshot } = await loadFreshnessHelpers();
  const previousCards = [{ id: 'old', tags: ['snapshot:2026-09-19T01:00:00.000Z'] }];

  assert.deepEqual(resolveTrendingSnapshot({
    ok: false,
    cards: [],
    previousCards,
    previousCollectedAt: '2026-09-19T01:00:00.000Z',
  }), {
    cards: previousCards,
    collectedAt: '2026-09-19T01:00:00.000Z',
  });
});

test('reports invalid collection timestamps as unknown', async () => {
  const { getCollectionFreshness, getCollectionLabel } = await loadFreshnessHelpers();

  assert.deepEqual(getCollectionFreshness({
    collectedAt: 'not-a-date',
    now: Date.parse('2026-09-21T00:00:00.000Z'),
  }), {
    status: 'unknown',
    ageMs: null,
  });
  assert.equal(getCollectionLabel({
    collectedAt: 'not-a-date',
    now: Date.parse('2026-09-21T00:00:00.000Z'),
    status: 'unknown',
  }), '采集时间未知');
});

test('reports calendar-invalid ISO timestamps as unknown', async () => {
  const { getCollectionFreshness } = await loadFreshnessHelpers();

  assert.deepEqual(getCollectionFreshness({
    collectedAt: '2026-02-30T00:00:00.000Z',
    now: Date.parse('2026-09-21T00:00:00.000Z'),
  }), {
    status: 'unknown',
    ageMs: null,
  });
});

test('clamps future collection timestamps to zero age', async () => {
  const { getCollectionFreshness } = await loadFreshnessHelpers();

  assert.deepEqual(getCollectionFreshness({
    collectedAt: '2026-09-22T00:00:00.000Z',
    now: Date.parse('2026-09-21T00:00:00.000Z'),
  }), {
    status: 'fresh',
    ageMs: 0,
  });
});

test('uses concise collection labels without confusing collection and browser sync', async () => {
  const { getCollectionLabel } = await loadFreshnessHelpers();
  const now = Date.parse('2026-09-21T12:00:00.000Z');

  assert.equal(getCollectionLabel({
    collectedAt: '2026-09-21T11:00:00.000Z',
    now,
    status: 'fresh',
  }), '1 小时前采集');
  assert.match(getCollectionLabel({
    collectedAt: '2026-09-18T00:00:00.000Z',
    now,
    status: 'stale',
  }), /^热点数据已过期（.+采集）$/);
});

test('cron guarantees one complete run per day', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

  assert.equal(config.crons[0].schedule, '0 0 * * *');
  assert.notEqual(config.crons[0].schedule, '0 0 */2 * *');
});
