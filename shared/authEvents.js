export const shouldReloadOnAuthEvent = (event) =>
  event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED';
