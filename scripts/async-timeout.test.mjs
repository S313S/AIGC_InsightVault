import test from 'node:test';
import assert from 'node:assert/strict';

import { withTimeout } from '../shared/asyncTimeout.js';

test('withTimeout resolves successful work before timeout', async () => {
  const result = await withTimeout(Promise.resolve('ok'), 50, 'fallback');
  assert.equal(result, 'ok');
});

test('withTimeout returns fallback when work does not settle in time', async () => {
  const never = new Promise(() => {});
  const start = Date.now();
  const result = await withTimeout(never, 20, 'fallback');

  assert.equal(result, 'fallback');
  assert.ok(Date.now() - start >= 15);
});

test('withTimeout returns fallback when work rejects', async () => {
  const result = await withTimeout(Promise.reject(new Error('boom')), 50, 'fallback');
  assert.equal(result, 'fallback');
});
