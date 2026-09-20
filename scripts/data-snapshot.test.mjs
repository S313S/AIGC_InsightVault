import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIVE_SNAPSHOT_OWNER_KEY,
  buildSnapshotMetaStorageKey,
  buildSnapshotStorageKey,
  clearActiveSnapshotOwner,
  deserializeSnapshot,
  readBootstrapSnapshot,
  readStoredSnapshotRecord,
  serializeSnapshot,
  shouldPersistSnapshot,
  writeStoredSnapshot,
} from '../shared/dataSnapshot.js';

const installStorage = () => {
  const values = new Map();
  global.window = {
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: key => values.delete(key),
    },
  };
  return values;
};

const snapshot = (id) => ({
  cards: [{ id }],
  trending: [],
  collections: [],
  tasks: [],
});

test('buildSnapshotStorageKey namespaces authenticated users', () => {
  assert.equal(buildSnapshotStorageKey('user-1'), 'insight-vault:snapshot:user-1');
});

test('buildSnapshotStorageKey falls back to guest namespace', () => {
  assert.equal(buildSnapshotStorageKey(null), 'insight-vault:snapshot:guest');
});

test('buildSnapshotMetaStorageKey follows the snapshot namespace', () => {
  assert.equal(buildSnapshotMetaStorageKey('user-1'), 'insight-vault:snapshot-meta:user-1');
  assert.equal(buildSnapshotMetaStorageKey(null), 'insight-vault:snapshot-meta:guest');
});

test('serializeSnapshot and deserializeSnapshot round-trip snapshot data', () => {
  const snapshot = {
    cards: [{ id: 'card-1' }],
    trending: [{ id: 'trend-1' }],
    collections: [{ id: 'collection-1' }],
    tasks: [{ id: 'task-1' }],
  };

  const encoded = serializeSnapshot(snapshot);
  assert.deepEqual(deserializeSnapshot(encoded), snapshot);
});

test('deserializeSnapshot rejects invalid payloads', () => {
  assert.equal(deserializeSnapshot('not-json'), null);
  assert.equal(deserializeSnapshot(JSON.stringify({ cards: 'bad' })), null);
});

test('shouldPersistSnapshot allows authenticated post-load snapshots', () => {
  const snapshot = {
    cards: [{ id: 'card-1', ownerId: 'user-1', collections: ['collection-1'] }],
    trending: [],
    collections: [{ id: 'collection-1', ownerId: 'user-1' }],
    tasks: [],
  };

  assert.equal(shouldPersistSnapshot({
    snapshot,
    userId: 'user-1',
    hasCompletedInitialLoad: true,
    isLoading: false,
  }), true);
});

test('shouldPersistSnapshot avoids writing private data to guest cache', () => {
  const snapshot = {
    cards: [{ id: 'card-1', ownerId: 'user-1', isPublic: false }],
    trending: [],
    collections: [{ id: 'collection-1', ownerId: 'user-1', isPublic: false }],
    tasks: [],
  };

  assert.equal(shouldPersistSnapshot({
    snapshot,
    userId: null,
    hasCompletedInitialLoad: true,
    isLoading: false,
  }), false);
});

test('writeStoredSnapshot persists owner and sync metadata', () => {
  installStorage();
  writeStoredSnapshot('user-1', snapshot('private-card'), {
    syncedAt: '2026-09-20T01:00:00.000Z',
    now: () => '2026-09-20T01:00:01.000Z',
  });

  assert.deepEqual(readStoredSnapshotRecord('user-1'), {
    snapshot: snapshot('private-card'),
    ownerId: 'user-1',
    savedAt: '2026-09-20T01:00:01.000Z',
    syncedAt: '2026-09-20T01:00:00.000Z',
  });
  assert.equal(window.localStorage.getItem(ACTIVE_SNAPSHOT_OWNER_KEY), 'user-1');
});

test('writeStoredSnapshot preserves the previous sync time for local changes', () => {
  installStorage();
  writeStoredSnapshot('user-1', snapshot('first'), {
    syncedAt: '2026-09-20T01:00:00.000Z',
    now: () => '2026-09-20T01:00:01.000Z',
  });
  writeStoredSnapshot('user-1', snapshot('edited'), {
    now: () => '2026-09-20T01:05:00.000Z',
  });

  const record = readStoredSnapshotRecord('user-1');
  assert.equal(record.syncedAt, '2026-09-20T01:00:00.000Z');
  assert.equal(record.savedAt, '2026-09-20T01:05:00.000Z');
});

test('readBootstrapSnapshot prefers the active authenticated owner', () => {
  installStorage();
  writeStoredSnapshot(null, snapshot('public-card'));
  writeStoredSnapshot('user-1', snapshot('private-card'));

  assert.equal(readBootstrapSnapshot().snapshot.cards[0].id, 'private-card');
  assert.equal(readBootstrapSnapshot().ownerId, 'user-1');
});

test('readBootstrapSnapshot falls back to the public guest snapshot', () => {
  installStorage();
  window.localStorage.setItem(ACTIVE_SNAPSHOT_OWNER_KEY, 'missing-user');
  writeStoredSnapshot(null, snapshot('public-card'));

  assert.equal(readBootstrapSnapshot().snapshot.cards[0].id, 'public-card');
  assert.equal(readBootstrapSnapshot().ownerId, null);
});

test('clearActiveSnapshotOwner prevents private bootstrap reuse', () => {
  installStorage();
  writeStoredSnapshot(null, snapshot('public-card'));
  writeStoredSnapshot('user-1', snapshot('private-card'));
  clearActiveSnapshotOwner();

  assert.equal(readBootstrapSnapshot().snapshot.cards[0].id, 'public-card');
});

test('legacy snapshots remain readable without metadata', () => {
  installStorage();
  window.localStorage.setItem(
    buildSnapshotStorageKey('user-1'),
    serializeSnapshot(snapshot('legacy-card'))
  );

  assert.deepEqual(readStoredSnapshotRecord('user-1'), {
    snapshot: snapshot('legacy-card'),
    ownerId: 'user-1',
    savedAt: null,
    syncedAt: null,
  });
});
