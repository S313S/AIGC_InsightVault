export const mergeLoadedSnapshot = (previousSnapshot, partialSnapshot) => ({
  cards: partialSnapshot.cards ?? previousSnapshot?.cards ?? [],
  trending: partialSnapshot.trending ?? previousSnapshot?.trending ?? [],
  topics: partialSnapshot.topics ?? previousSnapshot?.topics ?? [],
  collections: partialSnapshot.collections ?? previousSnapshot?.collections ?? [],
  tasks: partialSnapshot.tasks ?? previousSnapshot?.tasks ?? [],
});

export const settlePrimaryLoadsIndependently = ({ cards, trending, topics }) => ({
  raw: Promise.allSettled([cards, trending]),
  topics: Promise.allSettled([topics]).then(([result]) => result),
});
