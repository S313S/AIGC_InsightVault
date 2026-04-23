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
