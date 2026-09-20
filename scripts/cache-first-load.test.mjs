import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

test('initial render reads a cached snapshot before auth hydration starts', () => {
  const bootstrapIndex = appSource.indexOf('readBootstrapSnapshot()');
  const hydrateIndex = appSource.indexOf('const hydrate = async () =>');

  assert.ok(bootstrapIndex >= 0);
  assert.ok(hydrateIndex >= 0);
  assert.ok(bootstrapIndex < hydrateIndex);
  assert.match(appSource, /useState\(!snapshotHasAnyData\(bootstrapSnapshot\)\)/);
});
