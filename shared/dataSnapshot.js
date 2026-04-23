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

export const readStoredSnapshot = (userId) => {
  if (typeof window === 'undefined') return null;
  return deserializeSnapshot(window.localStorage.getItem(buildSnapshotStorageKey(userId)));
};

export const writeStoredSnapshot = (userId, snapshot) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(buildSnapshotStorageKey(userId), serializeSnapshot(snapshot));
};
