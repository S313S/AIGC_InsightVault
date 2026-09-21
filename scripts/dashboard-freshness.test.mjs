import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboardSource = readFileSync(new URL('../components/DashboardView.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

test('dashboard receives real initial-load and sync state', () => {
  assert.match(dashboardSource, /isInitialLoading:\s*boolean/);
  assert.match(dashboardSource, /isSyncing:\s*boolean/);
  assert.match(dashboardSource, /lastCollectedAt:\s*string\s*\|\s*null/);
  assert.match(dashboardSource, /lastSyncedAt:\s*string\s*\|\s*null/);
  assert.match(dashboardSource, /newItemsCount:\s*number/);
  assert.match(dashboardSource, /getCollectionFreshness\(/);
  assert.match(dashboardSource, /getCollectionLabel\(/);
  assert.match(dashboardSource, /getSyncLabel\(/);
});

test('dashboard removes static freshness claims', () => {
  assert.doesNotMatch(dashboardSource, /今日 \+124/);
  assert.doesNotMatch(dashboardSource, />实时</);
  assert.match(dashboardSource, /新增 \{newItemsCount\} 条/);
});

test('dashboard uses skeletons instead of a false empty state during cold load', () => {
  assert.match(dashboardSource, /isInitialLoading\s*\?\s*\(/);
  assert.match(dashboardSource, /animate-pulse/);
  assert.match(dashboardSource, /hotPicks\.length === 0/);
});

test('app passes freshness state to the dashboard', () => {
  assert.match(appSource, /isInitialLoading=\{isLoading\}/);
  assert.match(appSource, /isSyncing=\{isSyncing\}/);
  assert.match(appSource, /lastCollectedAt=\{lastCollectedAt\}/);
  assert.match(appSource, /lastSyncedAt=\{lastSyncedAt\}/);
  assert.match(appSource, /newItemsCount=\{newTrendingCount\}/);
});

test('dashboard distinguishes collection freshness from browser synchronization', () => {
  assert.match(dashboardSource, /热点采集：\{collectionLabel\}/);
  assert.match(dashboardSource, /页面同步：\{syncLabel\}/);
});

test('dashboard renders a visible stale warning with the last collection time', () => {
  assert.match(dashboardSource, /collectionFreshness\.status === 'stale'/);
  assert.match(dashboardSource, /role="alert"/);
  assert.match(dashboardSource, /\{collectionLabel\}/);
});
