import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeCollectionName,
  shouldSubmitCollectionName,
} from '../shared/collectionCreation.js';

test('normalizeCollectionName trims surrounding whitespace', () => {
  assert.equal(normalizeCollectionName('  我的收藏夹  '), '我的收藏夹');
  assert.equal(normalizeCollectionName('   '), '');
});

test('shouldSubmitCollectionName ignores Enter while IME composition is active', () => {
  assert.equal(shouldSubmitCollectionName({ key: 'Enter', isComposing: true }), false);
  assert.equal(shouldSubmitCollectionName({ key: 'Enter', isComposing: false }), true);
  assert.equal(shouldSubmitCollectionName({ key: 'Escape', isComposing: false }), false);
});
