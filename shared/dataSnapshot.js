export const buildSnapshotStorageKey = (userId) =>
  `insight-vault:snapshot:${userId || 'guest'}`;

export const serializeSnapshot = (snapshot) => JSON.stringify(snapshot);

export const deserializeSnapshot = (value) => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    if (
      !parsed ||
      !Array.isArray(parsed.cards) ||
      !Array.isArray(parsed.trending) ||
      !Array.isArray(parsed.collections) ||
      !Array.isArray(parsed.tasks)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const snapshotArrays = (snapshot) => [
  snapshot?.cards,
  snapshot?.trending,
  snapshot?.collections,
  snapshot?.tasks,
].filter(Array.isArray);

const snapshotHasData = (snapshot) =>
  snapshotArrays(snapshot).some((items) => items.length > 0);

const snapshotHasPrivateData = (snapshot) =>
  snapshotArrays(snapshot).some((items) =>
    items.some((item) => item?.ownerId && item?.isPublic !== true)
  );

export const shouldPersistSnapshot = ({
  snapshot,
  userId,
  hasCompletedInitialLoad,
  isLoading,
}) => {
  if (!hasCompletedInitialLoad || isLoading || !snapshotHasData(snapshot)) return false;
  if (!userId && snapshotHasPrivateData(snapshot)) return false;
  return true;
};

export const readStoredSnapshot = (userId) => {
  if (typeof window === 'undefined') return null;
  return deserializeSnapshot(window.localStorage.getItem(buildSnapshotStorageKey(userId)));
};

export const writeStoredSnapshot = (userId, snapshot) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(buildSnapshotStorageKey(userId), serializeSnapshot(snapshot));
};
