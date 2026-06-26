import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyCollectionCounts,
  countCollectionItems,
} from '../shared/collectionCounts.js';

test('countCollectionItems counts unique collection ids per card row', () => {
  const counts = countCollectionItems([
    { collections: ['a', 'b', 'a', ''] },
    { collections: ['b'] },
    { collections: null },
    {},
  ]);

  assert.deepEqual(counts, { a: 1, b: 2 });
});

test('applyCollectionCounts uses live counts when present', () => {
  const collections = [
    { id: 'a', name: 'A', coverImage: '', itemCount: 9 },
    { id: 'b', name: 'B', coverImage: '', itemCount: 3 },
  ];

  assert.deepEqual(applyCollectionCounts(collections, { a: 2, b: 0 }), [
    { id: 'a', name: 'A', coverImage: '', itemCount: 2 },
    { id: 'b', name: 'B', coverImage: '', itemCount: 0 },
  ]);
});

test('applyCollectionCounts preserves previous counts when live counts are unavailable', () => {
  const collections = [
    { id: 'a', name: 'A', coverImage: '', itemCount: 0 },
    { id: 'b', name: 'B', coverImage: '', itemCount: 0 },
  ];
  const previous = [
    { id: 'a', name: 'A', coverImage: '', itemCount: 5 },
  ];

  assert.deepEqual(applyCollectionCounts(collections, {}, previous), [
    { id: 'a', name: 'A', coverImage: '', itemCount: 5 },
    { id: 'b', name: 'B', coverImage: '', itemCount: 0 },
  ]);
});
