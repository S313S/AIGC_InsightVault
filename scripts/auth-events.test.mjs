import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldReloadOnAuthEvent } from '../shared/authEvents.js';

test('reloads on sign in and sign out events', () => {
  assert.equal(shouldReloadOnAuthEvent('SIGNED_IN'), true);
  assert.equal(shouldReloadOnAuthEvent('SIGNED_OUT'), true);
});

test('does not reload on token refresh or initial session events', () => {
  assert.equal(shouldReloadOnAuthEvent('TOKEN_REFRESHED'), false);
  assert.equal(shouldReloadOnAuthEvent('INITIAL_SESSION'), false);
});

test('does not reload for a repeated sign-in of the already loaded user', () => {
  assert.equal(shouldReloadOnAuthEvent('SIGNED_IN', {
    currentUserId: 'user-1',
    nextUserId: 'user-1',
    hasCompletedInitialLoad: true,
  }), false);
});

test('reloads for a new user or before the initial load has completed', () => {
  assert.equal(shouldReloadOnAuthEvent('SIGNED_IN', {
    currentUserId: 'user-1',
    nextUserId: 'user-2',
    hasCompletedInitialLoad: true,
  }), true);
  assert.equal(shouldReloadOnAuthEvent('SIGNED_IN', {
    currentUserId: 'user-1',
    nextUserId: 'user-1',
    hasCompletedInitialLoad: false,
  }), true);
});

test('still reloads for sign-out and user updates', () => {
  const sameUserContext = {
    currentUserId: 'user-1',
    nextUserId: 'user-1',
    hasCompletedInitialLoad: true,
  };

  assert.equal(shouldReloadOnAuthEvent('SIGNED_OUT', sameUserContext), true);
  assert.equal(shouldReloadOnAuthEvent('USER_UPDATED', sameUserContext), true);
});
