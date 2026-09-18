export const shouldReloadOnAuthEvent = (
  event,
  {
    currentUserId = null,
    nextUserId = null,
    hasCompletedInitialLoad = false,
  } = {}
) => {
  if (event === 'SIGNED_IN') {
    const isRepeatedUser = Boolean(
      hasCompletedInitialLoad &&
      currentUserId &&
      nextUserId &&
      currentUserId === nextUserId
    );
    return !isRepeatedUser;
  }

  return event === 'SIGNED_OUT' || event === 'USER_UPDATED';
};
