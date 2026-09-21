import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

test('app initializes visible data from a synchronous bootstrap snapshot', () => {
  assert.match(appSource, /useState\(\(\)\s*=>\s*readBootstrapSnapshot\(\)\)/);
  assert.match(appSource, /useState<KnowledgeCard\[\]>\(bootstrapSnapshot\.cards\)/);
  assert.match(appSource, /useState<TrackingTask\[\]>\(bootstrapSnapshot\.tasks\)/);
  assert.match(appSource, /useState<KnowledgeCard\[\]>\(bootstrapSnapshot\.trending\)/);
  assert.match(appSource, /useState<Collection\[\]>\(bootstrapSnapshot\.collections\)/);
  assert.match(appSource, /cards:\s*bootstrapSnapshot\.cards/);
});

test('app tracks owner-correct background synchronization state', () => {
  assert.match(appSource, /loadedOwnerIdRef/);
  assert.match(appSource, /const \[isSyncing, setIsSyncing\]/);
  assert.match(appSource, /const \[lastSyncedAt, setLastSyncedAt\]/);
  assert.match(appSource, /const \[newTrendingCount, setNewTrendingCount\]/);
  assert.match(appSource, /countNewItemIds\(/);
  assert.match(appSource, /writeStoredSnapshot\(targetOwnerId, finalSnapshot, \{[\s\S]*?syncedAt/);
});

test('initial hydration refreshes in the background without an overlay', () => {
  assert.match(
    appSource,
    /await loadData\(authUser,\s*\{\s*showOverlay:\s*false,\s*preserveNotice:\s*true\s*\}\)/s
  );
  assert.doesNotMatch(appSource, /\{\/\* Loading Overlay \*\/\}/);
  assert.doesNotMatch(appSource, /fixed inset-0 z-\[100\]/);
});

test('explicit logout paths stop private snapshots from bootstrapping again', () => {
  const clearCalls = appSource.match(/clearActiveSnapshotOwner\(\)/g) || [];
  assert.ok(clearCalls.length >= 2);
  assert.match(appSource, /clearActiveSnapshotOwner\(\);\s*await auth\.signOut\(\)/s);
  assert.match(appSource, /clearActiveSnapshotOwner\(\);\s*auth\.clearLocalAuthState\(\)/s);
});
