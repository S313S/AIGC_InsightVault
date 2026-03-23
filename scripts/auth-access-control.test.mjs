import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeUsername,
  usernameToSyntheticEmail,
  canAccessManagement,
  canMutateResource,
} from '../shared/authAccess.js';

test('usernameToSyntheticEmail normalizes username before building auth email', () => {
  assert.equal(normalizeUsername('  @XiaoCi  '), 'xiaoci');
  assert.equal(usernameToSyntheticEmail('  @XiaoCi  '), 'xiaoci@insightvault.local');
});

test('guests cannot access management surfaces', () => {
  assert.equal(canAccessManagement(false), false);
  assert.equal(canAccessManagement(true), true);
});

test('only the owner can mutate a resource', () => {
  assert.equal(canMutateResource(null, 'owner-1'), false);
  assert.equal(canMutateResource('owner-1', 'owner-1'), true);
  assert.equal(canMutateResource('owner-2', 'owner-1'), false);
});
