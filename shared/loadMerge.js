export const mergeLoadedSnapshot = (previousSnapshot, partialSnapshot) => ({
  cards: partialSnapshot.cards ?? previousSnapshot?.cards ?? [],
  trending: partialSnapshot.trending ?? previousSnapshot?.trending ?? [],
  collections: partialSnapshot.collections ?? previousSnapshot?.collections ?? [],
  tasks: partialSnapshot.tasks ?? previousSnapshot?.tasks ?? [],
});
