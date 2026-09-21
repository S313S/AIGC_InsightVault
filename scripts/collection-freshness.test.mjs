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
