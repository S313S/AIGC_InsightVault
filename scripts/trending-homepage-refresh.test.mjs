import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const settingsSource = await readFile(new URL('../components/SettingsModal.tsx', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');

test('settings can refresh homepage trending data after a successful fetch', () => {
  assert.match(settingsSource, /onRefreshHomepage:\s*\(\)\s*=>\s*Promise<boolean>/);
  assert.match(settingsSource, /const refreshed = await onRefreshHomepage\(\)/);
  assert.match(settingsSource, /await refreshHomepageTrending\(\{ announce: false \}\)/);
  assert.match(settingsSource, /更新首页热点/);
});

test('app connects the settings refresh action to the existing data loader', () => {
  assert.match(
    appSource,
    /onRefreshHomepage=\{\(\)\s*=>\s*loadData\(currentUserRef\.current,\s*\{\s*showOverlay:\s*false,\s*preserveNotice:\s*true\s*\}\)\}/s
  );
  assert.match(appSource, /\): Promise<boolean> => \{/);
  assert.match(appSource, /return trendingLoad\.ok/);
});
