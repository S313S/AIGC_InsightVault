const toAliasSet = (aliasIds = []) => new Set(aliasIds.filter(Boolean));

export const removeAliasIdsFromCollections = (collections = [], aliasIds = []) => {
  if (!Array.isArray(collections) || collections.length === 0) return [];
  const aliasSet = toAliasSet(aliasIds);
  if (aliasSet.size === 0) return collections;
  return collections.filter((id) => !aliasSet.has(id));
};
