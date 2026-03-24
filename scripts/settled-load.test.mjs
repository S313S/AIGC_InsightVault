import test from 'node:test';
import assert from 'node:assert/strict';

import { getSettledValue } from '../shared/settledLoad.js';

test('getSettledValue returns the fulfilled value', () => {
  const value = getSettledValue({ status: 'fulfilled', value: ['ok'] }, [], 'cards');
  assert.deepEqual(value, ['ok']);
});

test('getSettledValue falls back and logs when a promise rejects', () => {
  const logs = [];
  const fallback = ['fallback'];
  const value = getSettledValue(
    { status: 'rejected', reason: new Error('denied') },
    fallback,
    'tasks',
    (...args) => logs.push(args.map(String).join(' '))
  );

  assert.equal(value, fallback);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /tasks failed:/);
  assert.match(logs[0], /denied/);
});
