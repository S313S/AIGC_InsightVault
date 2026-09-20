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

test('withTimeoutResult reports timeout without pretending fallback is live data', async () => {
  const { withTimeoutResult } = await import('../shared/asyncTimeout.js');
  const never = new Promise(() => {});

  const result = await withTimeoutResult(never, 20, []);

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'timeout');
  assert.deepEqual(result.value, []);
});

test('withTimeoutRetryResult aborts a timed-out attempt before retrying', async () => {
  const { withTimeoutRetryResult } = await import('../shared/asyncTimeout.js');
  const signals = [];

  const result = await withTimeoutRetryResult(
    async (signal) => {
      signals.push(signal);
      return new Promise(() => {});
    },
    { attemptTimeouts: [10, 10], retryDelayMs: 0 },
    'fallback'
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'timeout');
  assert.equal(result.attempts, 2);
  assert.equal(signals.length, 2);
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, true);
});

test('withTimeoutRetryResult recovers on the second attempt', async () => {
  const { withTimeoutRetryResult } = await import('../shared/asyncTimeout.js');
  let attempts = 0;

  const result = await withTimeoutRetryResult(
    async () => {
      attempts += 1;
      if (attempts === 1) return new Promise(() => {});
      return 'recovered';
    },
    { attemptTimeouts: [10, 20], retryDelayMs: 0 },
    'fallback'
  );

  assert.equal(result.ok, true);
  assert.equal(result.value, 'recovered');
  assert.equal(result.attempts, 2);
});

test('withTimeoutRetryResult preserves the final error after retries are exhausted', async () => {
  const { withTimeoutRetryResult } = await import('../shared/asyncTimeout.js');
  const finalError = new Error('still offline');
  let attempts = 0;

  const result = await withTimeoutRetryResult(
    async () => {
      attempts += 1;
      throw attempts === 1 ? new Error('temporary') : finalError;
    },
    { attemptTimeouts: [20, 20], retryDelayMs: 0 },
    'fallback'
  );

  assert.equal(result.ok, false);
  assert.equal(result.value, 'fallback');
  assert.equal(result.reason, finalError);
  assert.equal(result.attempts, 2);
});

test('withTimeoutRetryResult does not retry after parent cancellation', async () => {
  const { withTimeoutRetryResult } = await import('../shared/asyncTimeout.js');
  const parentController = new AbortController();
  let attempts = 0;

  const resultPromise = withTimeoutRetryResult(
    async () => {
      attempts += 1;
      throw new Error('temporary');
    },
    {
      attemptTimeouts: [20, 20],
      retryDelayMs: 30,
      signal: parentController.signal,
    },
    'fallback'
  );

  setTimeout(() => parentController.abort(), 5);
  const result = await resultPromise;

  assert.equal(attempts, 1);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'aborted');
});
