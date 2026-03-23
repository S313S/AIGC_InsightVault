export const normalizeUsername = (value) =>
  String(value || '').trim().replace(/^@+/, '').toLowerCase();

export const usernameToSyntheticEmail = (username) => {
  const normalized = normalizeUsername(username);
  return normalized ? `${normalized}@insightvault.local` : '';
};

export const canAccessManagement = (isAuthenticated) => Boolean(isAuthenticated);

export const canMutateResource = (currentUserId, ownerId) =>
  Boolean(currentUserId) && Boolean(ownerId) && currentUserId === ownerId;
