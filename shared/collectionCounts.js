import { normalizeXiaohongshuSourceUrl } from './xiaohongshuUrls.js';
import { isPlaceholderSourceUrl } from './sourceUrls.js';

const toCleanId = (value) => String(value || '').trim();

const toCleanText = (value) => String(value || '').trim().toLowerCase();

const normalizeIdentitySourceUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw || raw === '#') return '';

  const normalized = normalizeXiaohongshuSourceUrl(raw);
  if (!normalized) return '';

  try {
    const url = new URL(normalized);
    if (!url.hostname.endsWith('xiaohongshu.com')) {
      url.search = '';
      url.hash = '';
    }
    return url.toString();
  } catch {
    return normalized.split('?')[0].trim();
  }
};

export const buildCardIdentityKey = (card = {}) => {
  const ownerKey = toCleanText(card.ownerId || card.owner_id || 'public');
  const sourceUrl = normalizeIdentitySourceUrl(card.sourceUrl || card.source_url);
  if (sourceUrl && !isPlaceholderSourceUrl(sourceUrl)) {
    return `owner:${ownerKey}|url:${sourceUrl}`;
  }

  const platform = toCleanText(card.platform);
  const title = toCleanText(card.title);
  const author = toCleanText(card.author);
  const date = toCleanText(card.date);
  const rawContent = toCleanText(card.rawContent || card.raw_content).slice(0, 120);
  return `owner:${ownerKey}|meta:${platform}|${title}|${author}|${date}|${rawContent}`;
};

const collectionGroupKey = (collection = {}) => (
  `${collection.ownerId || collection.owner_id || 'public'}::${toCleanText(collection.name)}::${collection.coverImage || collection.cover_image || ''}`
);

const buildCollectionGroups = (collections = []) => {
  const groups = new Map();

  for (const collection of collections || []) {
    const key = collectionGroupKey(collection);
    const group = groups.get(key);
    if (group) {
      group.ids.push(collection.id);
    } else {
      groups.set(key, { canonicalId: collection.id, ids: [collection.id] });
    }
  }

  return [...groups.values()];
};

export const countCollectionItems = (rows = [], collections = []) => {
  if (collections.length > 0) {
    const groups = buildCollectionGroups(collections);
    const groupByAliasId = new Map();
    const identitySets = groups.map(() => new Set());
    const counts = Object.fromEntries(collections.map(collection => [collection.id, 0]));

    groups.forEach((group, groupIndex) => {
      for (const id of group.ids) groupByAliasId.set(id, groupIndex);
    });

    for (const row of rows || []) {
      const identityKey = buildCardIdentityKey(row);
      const matchedGroupIndexes = new Set();
      const ids = Array.isArray(row?.collections) ? row.collections : [];

      for (const rawId of ids) {
        const groupIndex = groupByAliasId.get(toCleanId(rawId));
        if (groupIndex !== undefined) matchedGroupIndexes.add(groupIndex);
      }

      for (const groupIndex of matchedGroupIndexes) {
        identitySets[groupIndex].add(identityKey);
      }
    }

    groups.forEach((group, groupIndex) => {
      counts[group.canonicalId] = identitySets[groupIndex].size;
    });

    return counts;
  }

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
