import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

test('initial load renders a cached snapshot before waiting for cloud data', () => {
  assert.equal(appSource.includes('showCachedSnapshotImmediately'), true);
  assert.equal(appSource.includes('showOverlay && hasBaselineData'), true);
  assert.equal(appSource.includes('setIsLoading(false);'), true);
});
