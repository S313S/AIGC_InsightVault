export const buildSnapshotStorageKey = (userId) =>
  `insight-vault:snapshot:${userId || 'guest'}`;

export const buildSnapshotMetaStorageKey = (userId) =>
  `insight-vault:snapshot-meta:${userId || 'guest'}`;

export const ACTIVE_SNAPSHOT_OWNER_KEY = 'insight-vault:active-snapshot-owner';

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

const readStoredSnapshotMetadata = (userId) => {
  if (typeof window === 'undefined') return null;

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(buildSnapshotMetaStorageKey(userId)) || 'null'
    );
    if (!parsed || parsed.ownerId !== (userId || null)) return null;
    return {
      ownerId: parsed.ownerId,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : null,
      syncedAt: typeof parsed.syncedAt === 'string' ? parsed.syncedAt : null,
    };
  } catch {
    return null;
  }
};

export const readStoredSnapshotRecord = (userId) => {
  const snapshot = readStoredSnapshot(userId);
  if (!snapshot) return null;
  const metadata = readStoredSnapshotMetadata(userId);

  return {
    snapshot,
    ownerId: userId || null,
    savedAt: metadata?.savedAt || null,
    syncedAt: metadata?.syncedAt || null,
  };
};

export const readBootstrapSnapshot = () => {
  if (typeof window === 'undefined') return null;
  const activeOwnerId = window.localStorage.getItem(ACTIVE_SNAPSHOT_OWNER_KEY);
  if (activeOwnerId) {
    const activeRecord = readStoredSnapshotRecord(activeOwnerId);
    if (activeRecord) return activeRecord;
  }
  return readStoredSnapshotRecord(null);
};

export const clearActiveSnapshotOwner = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACTIVE_SNAPSHOT_OWNER_KEY);
};

export const writeStoredSnapshot = (userId, snapshot, options = {}) => {
  if (typeof window === 'undefined') return;
  const ownerId = userId || null;
  const previousMetadata = readStoredSnapshotMetadata(userId);
  const savedAt = (options.now || (() => new Date().toISOString()))();
  const syncedAt = options.syncedAt === undefined
    ? previousMetadata?.syncedAt || null
    : options.syncedAt;

  window.localStorage.setItem(buildSnapshotStorageKey(userId), serializeSnapshot(snapshot));
  window.localStorage.setItem(buildSnapshotMetaStorageKey(userId), JSON.stringify({
    ownerId,
    savedAt,
    syncedAt,
  }));
  if (userId) {
    window.localStorage.setItem(ACTIVE_SNAPSHOT_OWNER_KEY, userId);
  }
};
