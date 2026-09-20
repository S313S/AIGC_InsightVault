export const buildSnapshotStorageKey = (userId) =>
  `insight-vault:snapshot:${userId || 'guest'}`;

export const buildSnapshotMetaStorageKey = (userId) =>
  `insight-vault:snapshot-meta:${userId || 'guest'}`;

export const ACTIVE_SNAPSHOT_OWNER_KEY = 'insight-vault:active-snapshot-owner';

const getBrowserStorage = () => {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

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
  const storage = getBrowserStorage();
  if (!storage) return null;

  try {
    return deserializeSnapshot(storage.getItem(buildSnapshotStorageKey(userId)));
  } catch {
    return null;
  }
};

const readStoredSnapshotMetadata = (userId) => {
  const storage = getBrowserStorage();
  if (!storage) return null;

  try {
    const parsed = JSON.parse(
      storage.getItem(buildSnapshotMetaStorageKey(userId)) || 'null'
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
  const storage = getBrowserStorage();
  if (!storage) return null;

  let activeOwnerId = null;
  try {
    activeOwnerId = storage.getItem(ACTIVE_SNAPSHOT_OWNER_KEY);
  } catch {
    return null;
  }
  if (activeOwnerId) {
    const activeRecord = readStoredSnapshotRecord(activeOwnerId);
    if (activeRecord) return activeRecord;
  }
  return readStoredSnapshotRecord(null);
};

export const clearActiveSnapshotOwner = () => {
  const storage = getBrowserStorage();
  if (!storage) return;

  try {
    storage.removeItem(ACTIVE_SNAPSHOT_OWNER_KEY);
  } catch {
    // Storage access is optional. Signing out must still complete when blocked.
  }
};

export const writeStoredSnapshot = (userId, snapshot, options = {}) => {
  const storage = getBrowserStorage();
  if (!storage) return;
  const ownerId = userId || null;
  const previousMetadata = readStoredSnapshotMetadata(userId);
  const savedAt = (options.now || (() => new Date().toISOString()))();
  const syncedAt = options.syncedAt === undefined
    ? previousMetadata?.syncedAt || null
    : options.syncedAt;

  try {
    storage.setItem(buildSnapshotStorageKey(userId), serializeSnapshot(snapshot));
    storage.setItem(buildSnapshotMetaStorageKey(userId), JSON.stringify({
      ownerId,
      savedAt,
      syncedAt,
    }));
    if (userId) {
      storage.setItem(ACTIVE_SNAPSHOT_OWNER_KEY, userId);
    }
  } catch {
    // Cached startup is a performance enhancement; storage failure cannot block the app.
  }
};
