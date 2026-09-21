export const createCollectionCardRequestPool = () => {
  const inFlight = new Map();

  const run = (key, operation) => {
    const existing = inFlight.get(key);
    if (existing) return existing;

    const request = Promise.resolve().then(operation);
    inFlight.set(key, request);
    const release = () => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    };
    request.then(release, release);
    return request;
  };

  return { run };
};

export const refreshCollectionCardsCacheFirst = async ({
  cache,
  userId,
  collectionIds,
  loadFresh,
  onCacheHit = () => undefined,
  onFresh = () => undefined,
}) => {
  let cachedRecord = cache.peek(userId, collectionIds);
  if (cachedRecord) {
    onCacheHit(cachedRecord.cards, cachedRecord);
  } else {
    cachedRecord = await cache.read(userId, collectionIds);
    if (cachedRecord) onCacheHit(cachedRecord.cards, cachedRecord);
  }

  let freshCards;
  try {
    freshCards = await loadFresh();
  } catch (refreshError) {
    if (!cachedRecord) throw refreshError;
    return {
      source: 'cache',
      cards: cachedRecord.cards,
      cachedRecord,
      refreshError,
    };
  }

  onFresh(freshCards);
  await cache.write(userId, collectionIds, freshCards);
  return {
    source: 'network',
    cards: freshCards,
    cachedRecord,
    refreshError: null,
  };
};
