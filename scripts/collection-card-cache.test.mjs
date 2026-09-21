import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCollectionCardCacheKey,
  createCollectionCardCache,
} from '../shared/collectionCardCache.js';
import {
  createCollectionCardRequestPool,
  refreshCollectionCardsCacheFirst,
} from '../shared/collectionCardLoader.js';

const createBackend = () => {
  const records = new Map();

  return {
    records,
    async get(key) {
      return records.get(key) || null;
    },
    async put(record) {
      records.set(record.key, structuredClone(record));
    },
    async delete(key) {
      records.delete(key);
    },
    async deleteForOwner(ownerKey) {
      for (const [key, record] of records) {
        if (record.ownerKey === ownerKey) records.delete(key);
      }
    },
  };
};

const card = (id, overrides = {}) => ({
  id,
  ownerId: 'user-1',
  isPublic: false,
  title: `Card ${id}`,
  sourceUrl: `https://example.com/${id}`,
  platform: 'Manual',
  author: 'Author',
  date: '2026-09-21',
  coverImage: 'https://example.com/cover.jpg',
  metrics: { likes: 1, bookmarks: 2, comments: 3 },
  contentType: 'Article',
  aiAnalysis: { summary: 'Summary', usageScenarios: [], coreKnowledge: [] },
  tags: ['Vibe Coding'],
  collections: ['collection-a'],
  rawContent: 'large detail body',
  userNotes: 'private detail note',
  isDetailLoaded: true,
  ...overrides,
});

test('collection cache keys are owner scoped and alias-order independent', () => {
  assert.equal(
    buildCollectionCardCacheKey('user-1', ['collection-b', 'collection-a', 'collection-a']),
    'v1:user-1:collection-a,collection-b'
  );
  assert.equal(
    buildCollectionCardCacheKey(null, ['collection-a']),
    'v1:guest:collection-a'
  );
});

test('collection cache restores persisted cards in a fresh cache instance', async () => {
  const backend = createBackend();
  const first = createCollectionCardCache({ backend, now: () => 1_000 });
  await first.write('user-1', ['collection-a'], [card('card-1')]);

  const second = createCollectionCardCache({ backend, now: () => 1_500 });
  const restored = await second.read('user-1', ['collection-a']);

  assert.equal(restored.savedAt, 1_000);
  assert.deepEqual(restored.cards.map(item => item.id), ['card-1']);
});

test('collection cache never exposes one owner records to another owner', async () => {
  const backend = createBackend();
  const cache = createCollectionCardCache({ backend, now: () => 1_000 });
  await cache.write('user-1', ['collection-a'], [card('private-card')]);

  assert.equal(await cache.read('user-2', ['collection-a']), null);
  assert.equal(await cache.read(null, ['collection-a']), null);
});

test('collection cache drops expired records instead of showing stale data forever', async () => {
  const backend = createBackend();
  const writer = createCollectionCardCache({ backend, now: () => 1_000, maxAgeMs: 500 });
  await writer.write('user-1', ['collection-a'], [card('card-1')]);

  const reader = createCollectionCardCache({ backend, now: () => 1_501, maxAgeMs: 500 });
  assert.equal(await reader.read('user-1', ['collection-a']), null);
  assert.equal(backend.records.size, 0);
});

test('collection cache invalidation clears memory and persistent records for one owner', async () => {
  const backend = createBackend();
  const cache = createCollectionCardCache({ backend, now: () => 1_000 });
  await cache.write('user-1', ['collection-a'], [card('card-1')]);
  await cache.write('user-2', ['collection-a'], [card('card-2', { ownerId: 'user-2' })]);

  await cache.clearForOwner('user-1');

  assert.equal(cache.peek('user-1', ['collection-a']), null);
  assert.equal(await cache.read('user-1', ['collection-a']), null);
  assert.deepEqual((await cache.read('user-2', ['collection-a'])).cards.map(item => item.id), ['card-2']);
});

test('collection cache stores only list fields and forces detail reload', async () => {
  const backend = createBackend();
  const cache = createCollectionCardCache({ backend, now: () => 1_000 });
  await cache.write('user-1', ['collection-a'], [card('card-1')]);

  const [cachedCard] = (await cache.read('user-1', ['collection-a'])).cards;
  assert.equal(cachedCard.rawContent, '');
  assert.equal(cachedCard.userNotes, '');
  assert.equal(cachedCard.isDetailLoaded, false);
});

test('cache-first refresh exposes memory cards before the network finishes', async () => {
  const backend = createBackend();
  const cache = createCollectionCardCache({ backend, now: () => 1_000 });
  await cache.write('user-1', ['collection-a'], [card('cached-card')]);
  let resolveNetwork;
  const network = new Promise(resolve => { resolveNetwork = resolve; });
  const phases = [];

  const refresh = refreshCollectionCardsCacheFirst({
    cache,
    userId: 'user-1',
    collectionIds: ['collection-a'],
    loadFresh: () => network,
    onCacheHit: cards => phases.push(`cache:${cards[0].id}`),
    onFresh: cards => phases.push(`fresh:${cards[0].id}`),
  });

  assert.deepEqual(phases, ['cache:cached-card']);
  resolveNetwork([card('fresh-card')]);
  const result = await refresh;
  assert.deepEqual(phases, ['cache:cached-card', 'fresh:fresh-card']);
  assert.equal(result.source, 'network');
});

test('cache-first refresh preserves cached cards when revalidation fails', async () => {
  const backend = createBackend();
  const cache = createCollectionCardCache({ backend, now: () => 1_000 });
  await cache.write('user-1', ['collection-a'], [card('cached-card')]);

  const result = await refreshCollectionCardsCacheFirst({
    cache,
    userId: 'user-1',
    collectionIds: ['collection-a'],
    loadFresh: async () => { throw new Error('network unavailable'); },
  });

  assert.equal(result.source, 'cache');
  assert.deepEqual(result.cards.map(item => item.id), ['cached-card']);
  assert.match(result.refreshError.message, /network unavailable/);
});

test('cache-first refresh throws when both cache and network are unavailable', async () => {
  const cache = createCollectionCardCache({ backend: createBackend(), now: () => 1_000 });

  await assert.rejects(
    refreshCollectionCardsCacheFirst({
      cache,
      userId: 'user-1',
      collectionIds: ['collection-a'],
      loadFresh: async () => { throw new Error('network unavailable'); },
    }),
    /network unavailable/
  );
});

test('collection request pool deduplicates concurrent reads and releases settled requests', async () => {
  const pool = createCollectionCardRequestPool();
  let calls = 0;
  const operation = async () => {
    calls += 1;
    return [card(`card-${calls}`)];
  };

  const first = pool.run('same-key', operation);
  const second = pool.run('same-key', operation);
  assert.equal(first, second);
  assert.deepEqual((await first).map(item => item.id), ['card-1']);
  assert.deepEqual((await pool.run('same-key', operation)).map(item => item.id), ['card-2']);
  assert.equal(calls, 2);
});
