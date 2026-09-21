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

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isNonEmptyString = (value) =>
  typeof value === 'string' && value.trim().length > 0;

const isFiniteScore = (value) =>
  typeof value === 'number' && Number.isFinite(value);

const isBoundedScore = (value) =>
  isFiniteScore(value) && value >= 0 && value <= 100;

const hasMinimumCachedCardShape = (card) => (
  isPlainObject(card) &&
  isNonEmptyString(card.id) &&
  typeof card.title === 'string' &&
  isNonEmptyString(card.sourceUrl) &&
  isNonEmptyString(card.platform)
);

const isSafeTopicSource = (source) => (
  isPlainObject(source) &&
  isNonEmptyString(source.id) &&
  isNonEmptyString(source.topicId) &&
  isNonEmptyString(source.cardId) &&
  typeof source.evidenceRole === 'string' &&
  typeof source.sourceType === 'string' &&
  isFiniteScore(source.relevance) &&
  source.relevance >= 0 &&
  source.relevance <= 1 &&
  typeof source.createdAt === 'string' &&
  (source.card === undefined || hasMinimumCachedCardShape(source.card))
);

const sanitizeEditorialTopicSnapshotItem = (topic) => {
  if (!isPlainObject(topic) || typeof topic.isPublic !== 'boolean') return null;

  const requiredStrings = [
    'id',
    'fingerprint',
    'title',
    'summary',
    'whyNow',
    'firstSeenAt',
    'latestEvidenceAt',
    'evidenceSignature',
    'createdAt',
    'updatedAt',
  ];
  if (!requiredStrings.every((key) => isNonEmptyString(topic[key]))) return null;

  const scoreFields = [
    'writeScore',
    'studyScore',
    'breakingScore',
    'confidenceScore',
    'preferenceScore',
  ];
  if (!scoreFields.every((key) => isBoundedScore(topic[key]))) return null;
  if (!['sourceCount', 'platformCount'].every((key) => (
    Number.isInteger(topic[key]) && topic[key] >= 0
  ))) return null;

  if (!isPlainObject(topic.contentAngles)) return null;
  if (!['quick', 'viewpoint', 'tutorial'].every((key) => typeof topic.contentAngles[key] === 'string')) {
    return null;
  }
  if (!Array.isArray(topic.durableKnowledge) || !topic.durableKnowledge.every(isNonEmptyString)) {
    return null;
  }
  if (!['rising', 'steady', 'fading', 'new'].includes(topic.trendDirection)) return null;
  if (!['generated', 'fallback'].includes(topic.generationStatus)) return null;
  if (topic.ownerId !== undefined && typeof topic.ownerId !== 'string') return null;
  if (topic.generatedAt !== undefined && typeof topic.generatedAt !== 'string') return null;

  const sanitized = { ...topic };
  if (topic.sources !== undefined) {
    sanitized.sources = Array.isArray(topic.sources)
      ? topic.sources.filter(isSafeTopicSource)
      : [];
  }
  if (topic.feedback !== undefined) {
    sanitized.feedback = Array.isArray(topic.feedback)
      ? topic.feedback.filter((action) => ['saved', 'ignored', 'published'].includes(action))
      : [];
  }
  return sanitized;
};

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
    const topics = Array.isArray(parsed.topics)
      ? parsed.topics
          .map(sanitizeEditorialTopicSnapshotItem)
          .filter((topic) => topic !== null)
      : [];
    return { ...parsed, topics };
  } catch {
    return null;
  }
};

const snapshotArrays = (snapshot) => [
  snapshot?.cards,
  snapshot?.trending,
  snapshot?.topics,
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
      collectedAt: typeof parsed.collectedAt === 'string' ? parsed.collectedAt : null,
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
    collectedAt: metadata?.collectedAt || null,
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
  const collectedAt = options.collectedAt === undefined
    ? previousMetadata?.collectedAt || null
    : options.collectedAt;

  try {
    storage.setItem(buildSnapshotStorageKey(userId), serializeSnapshot(snapshot));
    storage.setItem(buildSnapshotMetaStorageKey(userId), JSON.stringify({
      ownerId,
      savedAt,
      syncedAt,
      collectedAt,
    }));
    if (userId) {
      storage.setItem(ACTIVE_SNAPSHOT_OWNER_KEY, userId);
    }
  } catch {
    // Cached startup is a performance enhancement; storage failure cannot block the app.
  }
};
