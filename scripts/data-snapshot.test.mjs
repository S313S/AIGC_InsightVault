import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSnapshotStorageKey,
  deserializeSnapshot,
  serializeSnapshot,
  shouldPersistSnapshot,
} from '../shared/dataSnapshot.js';

test('buildSnapshotStorageKey namespaces authenticated users', () => {
  assert.equal(buildSnapshotStorageKey('user-1'), 'insight-vault:snapshot:user-1');
});

test('buildSnapshotStorageKey falls back to guest namespace', () => {
  assert.equal(buildSnapshotStorageKey(null), 'insight-vault:snapshot:guest');
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
