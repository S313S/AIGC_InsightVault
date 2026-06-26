const toCleanId = (value) => String(value || '').trim();

export const countCollectionItems = (rows = []) => {
  const counts = {};

  for (const row of rows || []) {
    const ids = Array.isArray(row?.collections) ? row.collections : [];
    const uniqueIds = new Set(ids.map(toCleanId).filter(Boolean));

    for (const id of uniqueIds) {
      counts[id] = (counts[id] || 0) + 1;
    }
  }

  return counts;
};

const toSafeCount = (value) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
};

export const applyCollectionCounts = (
  collections = [],
  countByCollectionId = {},
  fallbackCollections = []
) => {
  const fallbackById = new Map(
    (fallbackCollections || []).map(collection => [
      collection.id,
      toSafeCount(collection.itemCount),
    ])
  );

  return (collections || []).map(collection => {
    const hasLiveCount = Object.prototype.hasOwnProperty.call(countByCollectionId || {}, collection.id);
    const itemCount = hasLiveCount
      ? toSafeCount(countByCollectionId[collection.id])
      : fallbackById.get(collection.id) ?? toSafeCount(collection.itemCount);

    return { ...collection, itemCount };
  });
};
