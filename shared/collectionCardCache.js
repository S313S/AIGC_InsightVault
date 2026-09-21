const CACHE_VERSION = 'v1';
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DB_NAME = 'insight-vault-cache';
const DB_VERSION = 1;
const STORE_NAME = 'collection-card-lists';

const ownerKeyFor = userId => userId || 'guest';

const normalizeCollectionIds = collectionIds =>
  Array.from(new Set((collectionIds || []).filter(Boolean))).sort();

export const buildCollectionCardCacheKey = (userId, collectionIds) =>
  `${CACHE_VERSION}:${ownerKeyFor(userId)}:${normalizeCollectionIds(collectionIds).join(',')}`;

const toCachedCard = card => ({
  id: card.id,
  ownerId: card.ownerId,
  isPublic: Boolean(card.isPublic),
  title: card.title || '',
  sourceUrl: card.sourceUrl || '#',
  platform: card.platform,
  author: card.author || '',
  date: card.date || '',
  coverImage: card.coverImage || '',
  metrics: card.metrics || { likes: 0, bookmarks: 0, comments: 0 },
  contentType: card.contentType,
  aiAnalysis: card.aiAnalysis || { summary: '', usageScenarios: [], coreKnowledge: [] },
  tags: Array.isArray(card.tags) ? card.tags : [],
  collections: Array.isArray(card.collections) ? card.collections : [],
  rawContent: '',
  userNotes: '',
  isDetailLoaded: false,
});

const requestResult = request => new Promise(resolve => {
  request.onsuccess = () => resolve(request.result ?? null);
  request.onerror = () => resolve(null);
});

export const createIndexedDbCollectionCacheBackend = () => {
  let databasePromise = null;

  const openDatabase = () => {
    if (databasePromise) return databasePromise;
    const indexedDb = globalThis.indexedDB;
    if (!indexedDb) return Promise.resolve(null);

    databasePromise = new Promise(resolve => {
      try {
        const request = indexedDb.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(STORE_NAME)) {
            const store = database.createObjectStore(STORE_NAME, { keyPath: 'key' });
            store.createIndex('ownerKey', 'ownerKey', { unique: false });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });

    return databasePromise;
  };

  return {
    async get(key) {
      const database = await openDatabase();
      if (!database) return null;
      try {
        return await requestResult(
          database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
        );
      } catch {
        return null;
      }
    },

    async put(record) {
      const database = await openDatabase();
      if (!database) return;
      try {
        await requestResult(
          database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record)
        );
      } catch {
        // Persistent caching is best-effort; memory caching remains available.
      }
    },

    async delete(key) {
      const database = await openDatabase();
      if (!database) return;
      try {
        await requestResult(
          database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(key)
        );
      } catch {
        // Ignore unavailable browser storage.
      }
    },

    async deleteForOwner(ownerKey) {
      const database = await openDatabase();
      if (!database) return;

      await new Promise(resolve => {
        try {
          const transaction = database.transaction(STORE_NAME, 'readwrite');
          const request = transaction.objectStore(STORE_NAME).openCursor();
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return;
            if (cursor.value?.ownerKey === ownerKey) cursor.delete();
            cursor.continue();
          };
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => resolve();
          transaction.onabort = () => resolve();
        } catch {
          resolve();
        }
      });
    },
  };
};

export const createCollectionCardCache = ({
  backend = createIndexedDbCollectionCacheBackend(),
  now = () => Date.now(),
  maxAgeMs = DEFAULT_MAX_AGE_MS,
} = {}) => {
  const memory = new Map();
  const pendingInvalidations = new Map();

  const isFresh = record => (
    record
    && Array.isArray(record.cards)
    && typeof record.savedAt === 'number'
    && now() - record.savedAt <= maxAgeMs
  );

  const waitForInvalidation = async ownerKey => {
    const pending = pendingInvalidations.get(ownerKey);
    if (pending) await pending;
  };

  const peek = (userId, collectionIds) => {
    const key = buildCollectionCardCacheKey(userId, collectionIds);
    const record = memory.get(key);
    if (!isFresh(record)) {
      memory.delete(key);
      return null;
    }
    return record;
  };

  const read = async (userId, collectionIds) => {
    const ownerKey = ownerKeyFor(userId);
    await waitForInvalidation(ownerKey);
    const memoryRecord = peek(userId, collectionIds);
    if (memoryRecord) return memoryRecord;

    const key = buildCollectionCardCacheKey(userId, collectionIds);
    const record = await backend.get(key);
    if (!isFresh(record) || record.ownerKey !== ownerKey) {
      if (record) await backend.delete(key);
      return null;
    }

    memory.set(key, record);
    return record;
  };

  const write = async (userId, collectionIds, cards) => {
    const normalizedIds = normalizeCollectionIds(collectionIds);
    if (normalizedIds.length === 0 || !Array.isArray(cards)) return null;

    const ownerKey = ownerKeyFor(userId);
    await waitForInvalidation(ownerKey);
    const record = {
      key: buildCollectionCardCacheKey(userId, normalizedIds),
      ownerKey,
      collectionIds: normalizedIds,
      cards: cards.map(toCachedCard),
      savedAt: now(),
    };
    memory.set(record.key, record);
    await backend.put(record);
    return record;
  };

  const clearForOwner = async userId => {
    const ownerKey = ownerKeyFor(userId);
    for (const [key, record] of memory) {
      if (record.ownerKey === ownerKey) memory.delete(key);
    }

    const previous = pendingInvalidations.get(ownerKey) || Promise.resolve();
    const pending = previous
      .catch(() => undefined)
      .then(() => backend.deleteForOwner(ownerKey));
    pendingInvalidations.set(ownerKey, pending);
    try {
      await pending;
    } finally {
      if (pendingInvalidations.get(ownerKey) === pending) {
        pendingInvalidations.delete(ownerKey);
      }
    }
  };

  return { peek, read, write, clearForOwner };
};

export const collectionCardCache = createCollectionCardCache();
