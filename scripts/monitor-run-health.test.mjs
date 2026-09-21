import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { classifyMonitorRun } from '../shared/monitorRunHealth.js';

const classify = (overrides = {}) => classifyMonitorRun({
  intendedPlatforms: ['twitter', 'xiaohongshu'],
  platformTotals: {
    twitter: { fetched: 8, output: 3, completed: true },
    xiaohongshu: { fetched: 5, output: 2, completed: true }
  },
  candidateCount: 5,
  platformErrors: [],
  runtimeGuardTriggered: false,
  skipped: false,
  ...overrides
});

test('classifies a completed run with candidates as healthy', () => {
  const result = classify();

  assert.equal(result.status, 'healthy');
  assert.deepEqual(result.completedPlatforms, ['twitter', 'xiaohongshu']);
  assert.deepEqual(result.failedPlatforms, []);
  assert.match(result.explanation, /正常完成/);
});

test('classifies completed zero-result platforms as healthy low volume', () => {
  const result = classify({
    platformTotals: {
      twitter: { fetched: 0, output: 0, completed: true },
      xiaohongshu: { fetched: 0, output: 0, completed: true }
    },
    candidateCount: 0
  });

  assert.equal(result.status, 'healthy_low_volume');
  assert.deepEqual(result.completedPlatforms, ['twitter', 'xiaohongshu']);
  assert.deepEqual(result.failedPlatforms, []);
  assert.match(result.explanation, /0 条候选/);
});

test('classifies one completed platform and one failed platform as partial failure', () => {
  const result = classify({
    platformTotals: {
      twitter: { fetched: 8, output: 3, completed: true },
      xiaohongshu: { fetched: 0, output: 0, completed: false }
    },
    candidateCount: 3,
    platformErrors: [{ platform: 'xiaohongshu', error: 'timeout' }]
  });

  assert.equal(result.status, 'partial_failure');
  assert.deepEqual(result.completedPlatforms, ['twitter']);
  assert.deepEqual(result.failedPlatforms, ['xiaohongshu']);
  assert.match(result.explanation, /部分失败/);
});

test('classifies a run where no intended platform completed and errors were recorded as failed', () => {
  const result = classify({
    platformTotals: {
      twitter: { fetched: 0, output: 0, completed: false },
      xiaohongshu: { fetched: 0, output: 0, completed: false }
    },
    candidateCount: 0,
    platformErrors: [
      { platform: 'twitter', error: 'missing token' },
      { platform: 'xiaohongshu', error: 'timeout' }
    ]
  });

  assert.equal(result.status, 'failed');
  assert.deepEqual(result.completedPlatforms, []);
  assert.deepEqual(result.failedPlatforms, ['twitter', 'xiaohongshu']);
  assert.match(result.explanation, /全部失败/);
});

test('classifies a system error with no completed platform as failed', () => {
  const result = classify({
    platformTotals: {
      twitter: { fetched: 0, output: 0, completed: false },
      xiaohongshu: { fetched: 0, output: 0, completed: false }
    },
    candidateCount: 0,
    platformErrors: [{ platform: 'system', error: 'boom' }]
  });

  assert.equal(result.status, 'failed');
  assert.deepEqual(result.completedPlatforms, []);
  assert.deepEqual(result.failedPlatforms, []);
  assert.match(result.explanation, /运行失败/);
});

test('ignores empty error records when classifying a completed run', () => {
  const result = classify({
    candidateCount: 2,
    platformErrors: [
      {},
      { platform: 'system', error: '   ' },
      { platform: 'twitter' }
    ]
  });

  assert.equal(result.status, 'healthy');
  assert.deepEqual(result.failedPlatforms, []);
});

test('runtime guard takes precedence over platform completion and errors', () => {
  const result = classify({
    platformTotals: {
      twitter: { fetched: 8, output: 3, completed: true },
      xiaohongshu: { fetched: 0, output: 0, completed: false }
    },
    candidateCount: 3,
    runtimeGuardTriggered: true,
    platformErrors: [{ platform: 'xiaohongshu', error: 'timeout' }]
  });

  assert.equal(result.status, 'truncated');
  assert.deepEqual(result.completedPlatforms, ['twitter']);
  assert.deepEqual(result.failedPlatforms, ['xiaohongshu']);
  assert.match(result.explanation, /提前停止/);
});

test('skipped takes precedence over runtime guard and platform errors', () => {
  const result = classify({
    platformTotals: {
      twitter: { fetched: 0, output: 0, completed: false },
      xiaohongshu: { fetched: 0, output: 0, completed: false }
    },
    candidateCount: 0,
    runtimeGuardTriggered: true,
    platformErrors: [{ platform: 'twitter', error: 'missing token' }],
    skipped: true,
    skipReason: 'auto_update_disabled'
  });

  assert.equal(result.status, 'skipped');
  assert.deepEqual(result.completedPlatforms, []);
  assert.deepEqual(result.failedPlatforms, ['twitter']);
  assert.match(result.explanation, /自动更新已关闭/);
});

test('rebuild-only maintenance is explicitly classified as skipped collection work', () => {
  const result = classify({
    intendedPlatforms: [],
    platformTotals: {},
    candidateCount: 0,
    platformErrors: [],
    runtimeGuardTriggered: false,
    skipped: true,
    skipReason: 'rebuild_only'
  });

  assert.equal(result.status, 'skipped');
  assert.match(result.explanation, /维护模式/);
});

test('cron results persist and return run health for collection outcome paths', async () => {
  const source = await readFile(new URL('../api/cron-monitor.js', import.meta.url), 'utf8');

  assert.match(source, /import \{ classifyMonitorRun \} from '\.\.\/shared\/monitorRunHealth\.js';/);
  assert.match(source, /twitter:\s*\{ fetched: 0, output: 0, completed: false, completedCalls: 0 \}/);
  assert.match(source, /platformTotals\.twitter\.completed = true/);
  assert.match(source, /platformTotals\.xiaohongshu\.completed = true/);
  assert.match(source, /skipReason: 'auto_update_disabled'/);
  assert.match(source, /skipReason: 'rebuild_only'/);
  assert.match(source, /failed: true/);

  assert.match(source, /mode: 'rebuild'[\s\S]{0,300}?runHealth/);
  assert.match(source, /reason: 'auto_update_disabled'[\s\S]{0,300}?runHealth/);
  assert.match(source, /\.json\(\{ error: err\.message \|\| 'Cron monitor failed', runHealth \}\)/);
  assert.ok((source.match(/responsePayload\.runHealth = runHealth/g) || []).length >= 2,
    'zero-candidate and normal responses should expose runHealth');
  assert.ok((source.match(/resultSummary = \{[\s\S]{0,240}?runHealth/g) || []).length >= 3,
    'skip, zero-candidate and normal summaries should include runHealth');
  assert.match(source, /result_summary: \{ \.\.\.resultSummary, fallbackCoverCount, runHealth \}/);
});

test('cron run log types, mapping and UI support run health with a legacy fallback', async () => {
  const [typesSource, serviceSource, settingsSource] = await Promise.all([
    readFile(new URL('../types.ts', import.meta.url), 'utf8'),
    readFile(new URL('../services/supabaseService.ts', import.meta.url), 'utf8'),
    readFile(new URL('../components/SettingsModal.tsx', import.meta.url), 'utf8')
  ]);

  assert.match(typesSource, /export interface MonitorRunHealth/);
  assert.match(typesSource, /runHealth\?: MonitorRunHealth/);
  assert.match(serviceSource, /runHealth: row\.result_summary\?\.runHealth \|\| row\.run_health \|\| undefined/);
  assert.match(settingsSource, /const runHealthStatus = log\.runHealth\?\.status/);
  assert.match(settingsSource, /log\.runHealth\?\.explanation/);
  assert.match(settingsSource, /抓取状态：/);
});
