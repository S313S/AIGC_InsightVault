import test from 'node:test';
import assert from 'node:assert/strict';

import { removeAliasIdsFromCollections } from '../shared/collectionAliases.js';

test('removeAliasIdsFromCollections removes all alias ids from card collections', () => {
  const result = removeAliasIdsFromCollections(['canonical-id', 'alias-id-2', 'other-id'], ['canonical-id', 'alias-id-2']);
  assert.deepEqual(result, ['other-id']);
});

test('removeAliasIdsFromCollections keeps input when no alias matches', () => {
  const source = ['other-id'];
  const result = removeAliasIdsFromCollections(source, ['canonical-id', 'alias-id-2']);
  assert.deepEqual(result, ['other-id']);
});
