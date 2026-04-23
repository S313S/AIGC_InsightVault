import { normalizeUsername } from './authAccess.js';

export const toSessionAuthUser = (user) => {
  if (!user) return null;

  const fallbackUsername =
    normalizeUsername(user.user_metadata?.username || user.email?.split('@')[0] || user.id) || user.id;
  const displayName =
    String(user.user_metadata?.display_name || user.user_metadata?.username || fallbackUsername).trim() || fallbackUsername;

  return {
    id: user.id,
    username: fallbackUsername,
    displayName,
  };
};

export const resolveCurrentAuthUser = ({ session, fetchedUser, previousUser }) => {
  if (!session?.user) return null;
  return fetchedUser || toSessionAuthUser(session.user) || previousUser || null;
};
