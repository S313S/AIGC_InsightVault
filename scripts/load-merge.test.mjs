import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeLoadedSnapshot } from '../shared/loadMerge.js';

test('mergeLoadedSnapshot replaces only the provided slices', () => {
  const previous = {
    cards: [{ id: 'old-card' }],
    trending: [{ id: 'old-trending' }],
    collections: [{ id: 'old-collection' }],
    tasks: [{ id: 'old-task' }],
  };

  const merged = mergeLoadedSnapshot(previous, {
    cards: [{ id: 'new-card' }],
    trending: [{ id: 'new-trending' }],
  });

  assert.deepEqual(merged, {
    cards: [{ id: 'new-card' }],
    trending: [{ id: 'new-trending' }],
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
    collections: [],
    tasks: [],
  });
});
