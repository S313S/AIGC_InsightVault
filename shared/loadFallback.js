export const resolveLoadFallback = ({
  cards,
  trending,
  collections,
  tasks,
  authUser,
  offlineSnapshot,
  previousSnapshot,
  storedSnapshot,
}) => {
  const hasCloudData = cards.length > 0 || trending.length > 0 || collections.length > 0;

  if (hasCloudData) {
    return {
      cards,
      trending,
      collections,
      tasks,
      usedFallback: false,
    };
  }

  const hasPreviousSnapshot = previousSnapshot &&
    (previousSnapshot.cards?.length > 0 ||
      previousSnapshot.trending?.length > 0 ||
      previousSnapshot.collections?.length > 0);

  if (hasPreviousSnapshot) {
    return {
      cards: previousSnapshot.cards,
      trending: previousSnapshot.trending,
      collections: previousSnapshot.collections,
      tasks: previousSnapshot.tasks,
      usedFallback: true,
    };
  }

  const hasStoredSnapshot = storedSnapshot &&
    (storedSnapshot.cards?.length > 0 ||
      storedSnapshot.trending?.length > 0 ||
      storedSnapshot.collections?.length > 0);

  if (hasStoredSnapshot) {
    return {
      cards: storedSnapshot.cards,
      trending: storedSnapshot.trending,
      collections: storedSnapshot.collections,
      tasks: storedSnapshot.tasks,
      usedFallback: true,
    };
  }

  if (authUser) {
    return {
      cards: [],
      trending: [],
      collections: [],
      tasks: [],
      usedFallback: true,
    };
  }

  return {
    cards: offlineSnapshot.cards,
    trending: offlineSnapshot.trending,
    collections: offlineSnapshot.collections,
    tasks,
    usedFallback: true,
  };
};
