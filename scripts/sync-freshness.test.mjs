import test from 'node:test';
import assert from 'node:assert/strict';

import { countNewItemIds, getSyncLabel } from '../shared/syncFreshness.js';

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
