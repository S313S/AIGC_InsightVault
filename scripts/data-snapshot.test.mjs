import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSnapshotStorageKey,
  deserializeSnapshot,
  serializeSnapshot,
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
