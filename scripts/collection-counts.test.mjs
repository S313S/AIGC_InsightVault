import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  applyCollectionCounts,
  countCollectionItems,
} from '../shared/collectionCounts.js';

const serviceSource = readFileSync(new URL('../services/supabaseService.ts', import.meta.url), 'utf8');

test('countCollectionItems counts unique collection ids per card row', () => {
  const counts = countCollectionItems([
    { collections: ['a', 'b', 'a', ''] },
    { collections: ['b'] },
    { collections: null },
    {},
  ]);

  assert.deepEqual(counts, { a: 1, b: 2 });
});

test('countCollectionItems deduplicates collection aliases without collapsing placeholder URLs', () => {
  const collections = [
    { id: 'alias-a', ownerId: 'owner-1', name: 'AI Tools', coverImage: 'cover.jpg' },
    { id: 'alias-b', ownerId: 'owner-1', name: 'AI Tools', coverImage: 'cover.jpg' },
  ];
  const rows = [
    {
      owner_id: 'owner-1',
      title: 'Prompt A',
      source_url: 'https://twitter.com/example/status/123456',
      platform: 'Manual',
      author: 'Author A',
      date: '2025-01-01',
      collections: ['alias-a'],
    },
    {
      owner_id: 'owner-1',
      title: 'Prompt A',
      source_url: 'https://twitter.com/example/status/123456',
      platform: 'Manual',
      author: 'Author A',
      date: '2025-01-01',
      collections: ['alias-b'],
    },
    {
      owner_id: 'owner-1',
      title: 'Prompt B',
      source_url: 'https://twitter.com/example/status/123456',
      platform: 'Manual',
      author: 'Author B',
      date: '2025-01-02',
      collections: ['alias-a'],
    },
    {
      owner_id: 'owner-1',
      title: 'Prompt A',
      source_url: 'https://twitter.com/example/status/123456',
      platform: 'Manual',
      author: 'Author A',
      date: '2025-02-01',
      collections: ['alias-a'],
    },
    {
      owner_id: 'owner-1',
      title: 'Original title',
      source_url: 'https://twitter.com/real/status/42?utm_source=test',
      platform: 'Twitter',
      author: 'Real author',
      collections: ['alias-a'],
    },
    {
      owner_id: 'owner-1',
      title: 'Updated title',
      source_url: 'https://twitter.com/real/status/42',
      platform: 'Twitter',
      author: 'Real author',
      collections: ['alias-b'],
    },
  ];

  assert.deepEqual(countCollectionItems(rows, collections), {
    'alias-a': 4,
    'alias-b': 0,
  });
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

test('collection count pagination forwards cancellation and throws read errors', () => {
  const start = serviceSource.indexOf('export const getCollectionItemCounts = async');
  const end = serviceSource.indexOf('\nexport const ', start + 1);
  const body = serviceSource.slice(start, end);

  assert.notEqual(start, -1);
  assert.equal(body.includes('signal'), true);
  assert.equal(body.includes('.abortSignal(signal)'), true);
  assert.equal(body.includes('throw error'), true);
  assert.equal(body.includes('countCollectionItems(rows, collections)'), true);
  assert.equal(body.includes(".select(COLLECTION_COUNT_SELECT_FIELDS)"), true);
});

test('collection list deduplication uses the shared card identity rule', () => {
  assert.equal(serviceSource.includes('buildCardIdentityKey(card)'), true);
  assert.equal(serviceSource.includes('const buildCardDedupKey ='), false);
});
