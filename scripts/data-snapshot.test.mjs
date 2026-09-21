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
  topics: [],
  collections: [],
  tasks: [],
});

const topic = (id, overrides = {}) => ({
  id,
  isPublic: true,
  fingerprint: `fingerprint-${id}`,
  title: `Topic ${id}`,
  summary: 'Summary',
  whyNow: 'Why now',
  contentAngles: { quick: 'Quick', viewpoint: 'Viewpoint', tutorial: 'Tutorial' },
  durableKnowledge: ['Durable'],
  writeScore: 80,
  studyScore: 70,
  breakingScore: 60,
  confidenceScore: 90,
  preferenceScore: 50,
  firstSeenAt: '2026-09-20T00:00:00.000Z',
  latestEvidenceAt: '2026-09-21T00:00:00.000Z',
  trendDirection: 'rising',
  evidenceSignature: `evidence-${id}`,
  generationStatus: 'generated',
  createdAt: '2026-09-20T00:00:00.000Z',
  updatedAt: '2026-09-21T00:00:00.000Z',
  sourceCount: 2,
  platformCount: 2,
  ...overrides,
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
    topics: [topic('topic-1')],
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

test('deserializeSnapshot upgrades legacy snapshots with an empty topic slice', () => {
  const legacySnapshot = {
    cards: [{ id: 'legacy-card' }],
    trending: [{ id: 'legacy-trend' }],
    collections: [{ id: 'legacy-collection' }],
    tasks: [{ id: 'legacy-task' }],
  };

  assert.deepEqual(deserializeSnapshot(JSON.stringify(legacySnapshot)), {
    ...legacySnapshot,
    topics: [],
  });
});

test('deserializeSnapshot drops malformed topics without discarding valid cached data', () => {
  const cached = {
    cards: [{ id: 'cached-card' }],
    trending: [],
    topics: [
      topic('valid-topic'),
      null,
      { id: 'missing-required-fields' },
      topic('bad-score', { writeScore: Number.NaN }),
      topic('bad-angles', { contentAngles: [] }),
    ],
    collections: [{ id: 'cached-collection' }],
    tasks: [],
  };

  const decoded = deserializeSnapshot(JSON.stringify(cached));
  assert.deepEqual(decoded.cards, cached.cards);
  assert.deepEqual(decoded.collections, cached.collections);
  assert.deepEqual(decoded.topics, [topic('valid-topic')]);
});

test('shouldPersistSnapshot allows authenticated post-load snapshots', () => {
  const snapshot = {
    cards: [{ id: 'card-1', ownerId: 'user-1', collections: ['collection-1'] }],
    trending: [],
    topics: [topic('private-topic', { ownerId: 'user-1', isPublic: false })],
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
    topics: [topic('private-topic', { ownerId: 'user-1', isPublic: false })],
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

test('writeStoredSnapshot persists owner, sync, and collection metadata separately', () => {
  installStorage();
  writeStoredSnapshot('user-1', snapshot('private-card'), {
    syncedAt: '2026-09-20T01:00:00.000Z',
    collectedAt: '2026-09-19T23:30:00.000Z',
    now: () => '2026-09-20T01:00:01.000Z',
  });

  assert.deepEqual(readStoredSnapshotRecord('user-1'), {
    snapshot: snapshot('private-card'),
    ownerId: 'user-1',
    savedAt: '2026-09-20T01:00:01.000Z',
    syncedAt: '2026-09-20T01:00:00.000Z',
    collectedAt: '2026-09-19T23:30:00.000Z',
  });
  assert.equal(window.localStorage.getItem(ACTIVE_SNAPSHOT_OWNER_KEY), 'user-1');
});

test('writeStoredSnapshot preserves previous sync and collection times for local changes', () => {
  installStorage();
  writeStoredSnapshot('user-1', snapshot('first'), {
    syncedAt: '2026-09-20T01:00:00.000Z',
    collectedAt: '2026-09-19T23:30:00.000Z',
    now: () => '2026-09-20T01:00:01.000Z',
  });
  writeStoredSnapshot('user-1', snapshot('edited'), {
    now: () => '2026-09-20T01:05:00.000Z',
  });

  const record = readStoredSnapshotRecord('user-1');
  assert.equal(record.syncedAt, '2026-09-20T01:00:00.000Z');
  assert.equal(record.collectedAt, '2026-09-19T23:30:00.000Z');
  assert.equal(record.savedAt, '2026-09-20T01:05:00.000Z');
});

test('writeStoredSnapshot can clear collection time after a successful empty result', () => {
  installStorage();
  writeStoredSnapshot('user-1', snapshot('first'), {
    collectedAt: '2026-09-19T23:30:00.000Z',
  });
  writeStoredSnapshot('user-1', snapshot('fallback-kept'), {
    collectedAt: null,
  });

  assert.equal(readStoredSnapshotRecord('user-1').collectedAt, null);
});

test('snapshot collection metadata stays isolated between guest and authenticated owners', () => {
  installStorage();
  writeStoredSnapshot(null, snapshot('public-card'), {
    collectedAt: '2026-09-18T01:00:00.000Z',
  });
  writeStoredSnapshot('user-1', snapshot('private-card'), {
    collectedAt: '2026-09-20T01:00:00.000Z',
  });

  assert.equal(readStoredSnapshotRecord(null).collectedAt, '2026-09-18T01:00:00.000Z');
  assert.equal(readStoredSnapshotRecord('user-1').collectedAt, '2026-09-20T01:00:00.000Z');
});

test('cached topics stay isolated between guest and authenticated owners', () => {
  installStorage();
  writeStoredSnapshot(null, {
    ...snapshot('public-card'),
    topics: [topic('public-topic')],
  });
  writeStoredSnapshot('user-1', {
    ...snapshot('private-card'),
    topics: [topic('private-topic', { ownerId: 'user-1', isPublic: false })],
  });

  assert.equal(readStoredSnapshotRecord(null).snapshot.topics[0].id, 'public-topic');
  assert.equal(readStoredSnapshotRecord('user-1').snapshot.topics[0].id, 'private-topic');
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
  writeStoredSnapshot(null, {
    ...snapshot('public-card'),
    topics: [topic('public-topic')],
  });
  writeStoredSnapshot('user-1', {
    ...snapshot('private-card'),
    topics: [topic('private-topic', { ownerId: 'user-1', isPublic: false })],
  });
  clearActiveSnapshotOwner();

  assert.equal(readBootstrapSnapshot().snapshot.cards[0].id, 'public-card');
  assert.equal(readBootstrapSnapshot().snapshot.topics[0].id, 'public-topic');
});

test('legacy snapshots remain readable without metadata', () => {
  installStorage();
  const legacySnapshot = {
    cards: [{ id: 'legacy-card' }],
    trending: [],
    collections: [],
    tasks: [],
  };
  window.localStorage.setItem(
    buildSnapshotStorageKey('user-1'),
    serializeSnapshot(legacySnapshot)
  );

  assert.deepEqual(readStoredSnapshotRecord('user-1'), {
    snapshot: { ...legacySnapshot, topics: [] },
    ownerId: 'user-1',
    savedAt: null,
    syncedAt: null,
    collectedAt: null,
  });
});

test('snapshot helpers stay usable when browser storage is blocked', () => {
  global.window = {
    get localStorage() {
      throw new DOMException('Access denied', 'SecurityError');
    },
  };

  assert.doesNotThrow(() => writeStoredSnapshot('user-1', snapshot('private-card')));
  assert.doesNotThrow(() => clearActiveSnapshotOwner());
  assert.equal(readStoredSnapshotRecord('user-1'), null);
  assert.equal(readBootstrapSnapshot(), null);
});
