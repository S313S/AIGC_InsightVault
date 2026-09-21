import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveLoadFallback } from '../shared/loadFallback.js';

const offlineSnapshot = {
  cards: [{ id: 'offline-card' }],
  trending: [{ id: 'offline-trending' }],
  topics: [],
  collections: [{ id: 'offline-collection' }],
  tasks: [],
};

test('resolveLoadFallback keeps cloud data when any primary dataset loaded', () => {
  const result = resolveLoadFallback({
    cards: [{ id: 'cloud-card' }],
    trending: [],
    topics: [{ id: 'cloud-topic' }],
    collections: [],
    tasks: [],
    offlineSnapshot,
  });

  assert.deepEqual(result.cards, [{ id: 'cloud-card' }]);
  assert.deepEqual(result.topics, [{ id: 'cloud-topic' }]);
  assert.equal(result.usedFallback, false);
});

test('resolveLoadFallback uses offline snapshot when cloud datasets are all empty', () => {
  const result = resolveLoadFallback({
    cards: [],
    trending: [],
    topics: [],
    collections: [],
    tasks: [],
    offlineSnapshot,
    authUser: null,
  });

  assert.deepEqual(result.cards, offlineSnapshot.cards);
  assert.deepEqual(result.trending, offlineSnapshot.trending);
  assert.deepEqual(result.collections, offlineSnapshot.collections);
  assert.equal(result.usedFallback, true);
});

test('resolveLoadFallback prefers last successful snapshot over offline data', () => {
  const previousSnapshot = {
    cards: [{ id: 'cached-card' }],
    trending: [{ id: 'cached-trending' }],
    topics: [{ id: 'cached-topic' }],
    collections: [{ id: 'cached-collection' }],
    tasks: [{ id: 'cached-task' }],
  };

  const result = resolveLoadFallback({
    cards: [],
    trending: [],
    topics: undefined,
    collections: [],
    tasks: [],
    offlineSnapshot,
    previousSnapshot,
    authUser: { id: 'user-1' },
  });

  assert.deepEqual(result.cards, previousSnapshot.cards);
  assert.deepEqual(result.trending, previousSnapshot.trending);
  assert.deepEqual(result.topics, previousSnapshot.topics);
  assert.deepEqual(result.collections, previousSnapshot.collections);
  assert.deepEqual(result.tasks, previousSnapshot.tasks);
  assert.equal(result.usedFallback, true);
});

test('resolveLoadFallback does not use offline snapshot for authenticated users without any personal cache', () => {
  const result = resolveLoadFallback({
    cards: [],
    trending: [],
    topics: [],
    collections: [],
    tasks: [],
    offlineSnapshot,
    authUser: { id: 'user-1' },
  });

  assert.deepEqual(result.cards, []);
  assert.deepEqual(result.trending, []);
  assert.deepEqual(result.topics, []);
  assert.deepEqual(result.collections, []);
  assert.equal(result.usedFallback, true);
});

test('resolveLoadFallback does not leak stale raw data into a topics-only cloud response', () => {
  const previousSnapshot = {
    cards: [{ id: 'cached-card' }],
    trending: [{ id: 'cached-trending' }],
    topics: [{ id: 'cached-topic' }],
    collections: [],
    tasks: [],
  };

  const result = resolveLoadFallback({
    cards: [],
    trending: [],
    topics: [{ id: 'fresh-topic' }],
    collections: [],
    tasks: [],
    offlineSnapshot,
    previousSnapshot,
    authUser: { id: 'user-1' },
  });

  assert.deepEqual(result.cards, []);
  assert.deepEqual(result.trending, []);
  assert.deepEqual(result.topics, [{ id: 'fresh-topic' }]);
  assert.equal(result.usedFallback, false);
});

test('resolveLoadFallback treats a topics-only cloud response as live data', () => {
  const result = resolveLoadFallback({
    cards: [],
    trending: [],
    topics: [{ id: 'cloud-topic' }],
    collections: [],
    tasks: [],
    offlineSnapshot,
    authUser: null,
  });

  assert.deepEqual(result.cards, []);
  assert.deepEqual(result.topics, [{ id: 'cloud-topic' }]);
  assert.equal(result.usedFallback, false);
});

test('resolveLoadFallback preserves a topics-only previous snapshot', () => {
  const previousSnapshot = {
    cards: [],
    trending: [],
    topics: [{ id: 'previous-topic' }],
    collections: [],
    tasks: [],
  };
  const result = resolveLoadFallback({
    cards: [],
    trending: [],
    topics: undefined,
    collections: [],
    tasks: [],
    offlineSnapshot,
    previousSnapshot,
    authUser: { id: 'user-1' },
  });

  assert.deepEqual(result.topics, previousSnapshot.topics);
  assert.equal(result.usedFallback, true);
});

test('resolveLoadFallback preserves a topics-only stored snapshot', () => {
  const storedSnapshot = {
    cards: [],
    trending: [],
    topics: [{ id: 'stored-topic' }],
    collections: [],
    tasks: [],
  };
  const result = resolveLoadFallback({
    cards: [],
    trending: [],
    topics: undefined,
    collections: [],
    tasks: [],
    offlineSnapshot,
    storedSnapshot,
    authUser: { id: 'user-1' },
  });

  assert.deepEqual(result.topics, storedSnapshot.topics);
  assert.equal(result.usedFallback, true);
});
