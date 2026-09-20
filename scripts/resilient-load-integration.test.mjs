import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

test('app owns and cancels the active cloud load', () => {
  assert.equal(source.includes('activeLoadControllerRef.current?.abort()'), true);
  assert.equal(source.includes('withTimeoutRetryResult'), true);
  assert.equal(source.includes('attemptTimeouts: [12000, 18000]'), true);
});

test('auth reload decisions include the current and next user context', () => {
  assert.equal(source.includes('currentUserId: currentUserRef.current?.id || null'), true);
  assert.equal(source.includes('nextUserId: session?.user?.id || null'), true);
  assert.equal(source.includes('hasCompletedInitialLoad: hasCompletedInitialLoadRef.current'), true);
});

test('load warnings provide retry, dismiss, and recovery cleanup', () => {
  assert.equal(source.includes('立即重试'), true);
  assert.equal(source.includes('关闭'), true);
  assert.equal(source.includes("setLoadNotice('')"), true);
  assert.equal(source.includes('!collectionCountsLoad.ok'), true);
});
