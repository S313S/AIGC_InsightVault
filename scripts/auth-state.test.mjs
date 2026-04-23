import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveCurrentAuthUser, toSessionAuthUser } from '../shared/authState.js';

test('toSessionAuthUser derives a stable auth user from session metadata', () => {
  const authUser = toSessionAuthUser({
    id: 'user-1',
    email: 'xiaoci@insightvault.local',
    user_metadata: {
      username: 'XiaoCi',
      display_name: 'XiaoCi',
    },
  });

  assert.deepEqual(authUser, {
    id: 'user-1',
    username: 'xiaoci',
    displayName: 'XiaoCi',
  });
});

test('resolveCurrentAuthUser keeps a signed-in user from the session when profile fetch fails', () => {
  const authUser = resolveCurrentAuthUser({
    session: {
      user: {
        id: 'user-1',
        email: 'xiaoci@insightvault.local',
        user_metadata: {
          username: 'XiaoCi',
        },
      },
    },
    fetchedUser: null,
    previousUser: {
      id: 'user-1',
      username: 'xiaoci',
      displayName: 'XiaoCi',
    },
  });

  assert.deepEqual(authUser, {
    id: 'user-1',
    username: 'xiaoci',
    displayName: 'XiaoCi',
  });
});

test('resolveCurrentAuthUser clears user only when session is missing', () => {
  const authUser = resolveCurrentAuthUser({
    session: null,
    fetchedUser: null,
    previousUser: {
      id: 'user-1',
      username: 'xiaoci',
      displayName: 'XiaoCi',
    },
  });

  assert.equal(authUser, null);
});
