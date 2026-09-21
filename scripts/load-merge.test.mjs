import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mergeLoadedSnapshot,
  mergeTopicsIntoCurrentSnapshot,
  settlePrimaryLoadsIndependently,
} from '../shared/loadMerge.js';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
};

test('mergeLoadedSnapshot replaces only the provided slices', () => {
  const previous = {
    cards: [{ id: 'old-card' }],
    trending: [{ id: 'old-trending' }],
    topics: [{ id: 'old-topic' }],
    collections: [{ id: 'old-collection' }],
    tasks: [{ id: 'old-task' }],
  };

  const merged = mergeLoadedSnapshot(previous, {
    cards: [{ id: 'new-card' }],
    trending: [{ id: 'new-trending' }],
    topics: [{ id: 'new-topic' }],
  });

  assert.deepEqual(merged, {
    cards: [{ id: 'new-card' }],
    trending: [{ id: 'new-trending' }],
    topics: [{ id: 'new-topic' }],
    collections: [{ id: 'old-collection' }],
    tasks: [{ id: 'old-task' }],
  });
});

test('mergeLoadedSnapshot falls back to empty arrays when previous snapshot is missing', () => {
  const merged = mergeLoadedSnapshot(null, {
    cards: [{ id: 'new-card' }],
  });

  assert.deepEqual(merged, {
    cards: [{ id: 'new-card' }],
    trending: [],
    topics: [],
    collections: [],
    tasks: [],
  });
});

test('mergeLoadedSnapshot preserves previous slices when a load result is omitted', () => {
  const previous = {
    cards: [{ id: 'old-card' }],
    trending: [{ id: 'old-trending' }],
    topics: [{ id: 'old-topic' }],
    collections: [{ id: 'old-collection' }],
    tasks: [{ id: 'old-task' }],
  };

  const merged = mergeLoadedSnapshot(previous, {
    cards: [{ id: 'new-card' }],
    trending: [{ id: 'new-trending' }],
    topics: undefined,
    collections: undefined,
    tasks: undefined,
  });

  assert.deepEqual(merged, {
    cards: [{ id: 'new-card' }],
    trending: [{ id: 'new-trending' }],
    topics: [{ id: 'old-topic' }],
    collections: [{ id: 'old-collection' }],
    tasks: [{ id: 'old-task' }],
  });
});

test('mergeLoadedSnapshot updates topics while preserving failed trending data', () => {
  const previous = {
    cards: [{ id: 'old-card' }],
    trending: [{ id: 'old-trending' }],
    topics: [{ id: 'old-topic' }],
    collections: [],
    tasks: [],
  };

  const merged = mergeLoadedSnapshot(previous, {
    cards: [{ id: 'new-card' }],
    trending: undefined,
    topics: [{ id: 'new-topic' }],
  });

  assert.deepEqual(merged.trending, previous.trending);
  assert.deepEqual(merged.topics, [{ id: 'new-topic' }]);
  assert.deepEqual(merged.cards, [{ id: 'new-card' }]);
});

test('raw primary loads settle before an independently pending topic read', async () => {
  const topicRead = deferred();
  const settlements = settlePrimaryLoadsIndependently({
    cards: Promise.resolve({ ok: true, value: [{ id: 'card' }] }),
    trending: Promise.resolve({ ok: true, value: [{ id: 'trend' }] }),
    topics: topicRead.promise,
  });
  let topicsSettled = false;
  settlements.topics.finally(() => {
    topicsSettled = true;
  });

  const [cardsResult, trendingResult] = await settlements.raw;

  assert.equal(cardsResult.status, 'fulfilled');
  assert.equal(trendingResult.status, 'fulfilled');
  assert.equal(topicsSettled, false);

  topicRead.resolve({ ok: true, value: [{ id: 'topic' }] });
  const topicsResult = await settlements.topics;
  assert.equal(topicsResult.status, 'fulfilled');
});

test('a topic settlement is consumable while an unrelated secondary read is pending', async () => {
  const topicRead = deferred();
  const secondaryRead = deferred();
  const settlements = settlePrimaryLoadsIndependently({
    cards: Promise.resolve({ ok: true, value: [] }),
    trending: Promise.resolve({ ok: true, value: [] }),
    topics: topicRead.promise,
  });
  let secondarySettled = false;
  secondaryRead.promise.finally(() => {
    secondarySettled = true;
  });

  topicRead.resolve({ ok: true, value: [{ id: 'fast-topic' }] });
  const topicResult = await settlements.topics;

  assert.equal(topicResult.status, 'fulfilled');
  assert.equal(secondarySettled, false);
  secondaryRead.resolve([]);
});

test('late topics merge with the latest non-topic slices instead of an earlier snapshot', async () => {
  const topicRead = deferred();
  const current = {
    cards: [{ id: 'old-card' }],
    trending: [{ id: 'old-trend' }],
    topics: [],
    collections: [{ id: 'old-collection' }],
    tasks: [],
  };
  const topicSnapshotPromise = topicRead.promise.then((nextTopics) =>
    mergeTopicsIntoCurrentSnapshot(() => ({ ...current }), nextTopics)
  );

  current.cards = [{ id: 'edited-card' }];
  current.collections = [{ id: 'new-collection' }];
  topicRead.resolve([{ id: 'late-topic' }]);

  assert.deepEqual(await topicSnapshotPromise, {
    cards: [{ id: 'edited-card' }],
    trending: [{ id: 'old-trend' }],
    topics: [{ id: 'late-topic' }],
    collections: [{ id: 'new-collection' }],
    tasks: [],
  });
});
