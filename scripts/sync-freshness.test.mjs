import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { countNewItemIds, getSyncLabel } from '../shared/syncFreshness.js';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

test('counts only newly returned trending ids', () => {
  assert.equal(
    countNewItemIds([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }, { id: 'b' }]),
    1
  );
});

test('ignores malformed ids while counting new items', () => {
  assert.equal(countNewItemIds([{ id: 'a' }], [{ id: '' }, {}, { id: 'b' }]), 1);
});

test('reports background refresh without hiding the previous sync', () => {
  assert.equal(
    getSyncLabel({ isSyncing: true, lastSyncedAt: '2026-09-20T01:00:00.000Z' }),
    '正在后台更新'
  );
});

test('reports never-synced initial loading honestly', () => {
  assert.equal(
    getSyncLabel({ isSyncing: true, lastSyncedAt: null }),
    '正在获取最新数据'
  );
});

test('reports a just-completed sync', () => {
  assert.equal(getSyncLabel({
    isSyncing: false,
    lastSyncedAt: '2026-09-20T01:00:00.000Z',
    now: Date.parse('2026-09-20T01:00:30.000Z'),
  }), '刚刚同步');
});

test('reports a recent sync in minutes', () => {
  assert.equal(getSyncLabel({
    isSyncing: false,
    lastSyncedAt: '2026-09-20T01:00:00.000Z',
    now: Date.parse('2026-09-20T01:08:00.000Z'),
  }), '8 分钟前同步');
});

test('reports an older same-day sync as a clock time', () => {
  assert.match(getSyncLabel({
    isSyncing: false,
    lastSyncedAt: '2026-09-20T01:00:00.000Z',
    now: Date.parse('2026-09-20T04:00:00.000Z'),
  }), /^同步于 \d{2}:\d{2}$/);
});

test('reports a missing or invalid sync time honestly', () => {
  assert.equal(getSyncLabel({ isSyncing: false, lastSyncedAt: null }), '尚未同步');
  assert.equal(getSyncLabel({ isSyncing: false, lastSyncedAt: 'bad-date' }), '尚未同步');
});

test('app resolves trending cards and collection time independently from knowledge cards', () => {
  assert.match(appSource, /import \{ getLatestCollectionAt, resolveTrendingSnapshot \} from '\.\/shared\/collectionFreshness\.js'/);
  assert.match(
    appSource,
    /const trendingSnapshot = resolveTrendingSnapshot\(\{[\s\S]*?ok:\s*trendingLoad\.ok,[\s\S]*?cards:\s*dbTrending,[\s\S]*?previousCards:\s*baselineSnapshot\.trending,[\s\S]*?previousCollectedAt:\s*baselineCollectedAt,[\s\S]*?\}\);/
  );
  assert.match(
    appSource,
    /trending:\s*preserveOnFailedLoad\(trendingLoad, trendingSnapshot\.cards, hasBaselineData\)/
  );
  assert.doesNotMatch(appSource, /setLastCollectedAt\(new Date\(\)\.toISOString\(\)\)/);
});

test('app persists collection and browser sync times as separate metadata', () => {
  assert.match(
    appSource,
    /writeStoredSnapshot\(targetOwnerId, rawPrimarySnapshot, \{ collectedAt \}\)/
  );
  assert.match(
    appSource,
    /writeStoredSnapshot\(targetOwnerId, topicSnapshot, \{ syncedAt \}\)/
  );
});
