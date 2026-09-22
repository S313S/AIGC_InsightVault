import assert from 'node:assert/strict';
import test from 'node:test';

import { getCollectionLabel } from '../shared/collectionFreshness.js';
import { classifyMonitorRun } from '../shared/monitorRunHealth.js';
import { getSyncLabel } from '../shared/syncFreshness.js';
import { selectTopicLanes } from '../shared/topicScoring.js';

const topics = Array.from({ length: 6 }, (_, index) => ({
  id: `topic-${index + 1}`,
  fingerprint: `fingerprint-${index + 1}`,
  writeScore: 90 - index,
  studyScore: 88 - index,
  breakingScore: 85 - index,
  opportunityScore: 80 - index,
  laneEligibility: {
    write: index < 5,
    study: index < 5,
    breaking: index < 4,
  },
  sources: [{
    evidenceRole: index % 2 === 0 ? 'fact' : 'attention',
    card: { sourceUrl: `https://example.com/evidence/${index + 1}` },
  }],
}));

test('fixture acceptance yields bounded editorial lanes with evidence links', () => {
  const lanes = selectTopicLanes(topics, { writeLimit: 5, studyLimit: 5, breakingLimit: 3 });
  assert.equal(lanes.write.length, 5);
  assert.equal(lanes.study.length, 5);
  assert.equal(lanes.breaking.length, 3);
  for (const lane of Object.values(lanes)) {
    for (const topic of lane) {
      assert.match(topic.sources[0].card.sourceUrl, /^https:\/\//u);
    }
  }
});

test('fixture acceptance exposes partial source failure without hiding completed sources', () => {
  const health = classifyMonitorRun({
    intendedPlatforms: ['twitter', 'xiaohongshu', 'official', 'github'],
    platformTotals: {
      twitter: { completed: true, output: 3 },
      xiaohongshu: { completed: true, output: 2 },
      official: { completed: true, output: 1 },
      github: { completed: false, output: 0 },
    },
    candidateCount: 6,
    platformErrors: [{ platform: 'github', error: 'rate_limited' }],
  });
  assert.equal(health.status, 'partial_failure');
  assert.deepEqual(health.completedPlatforms, ['twitter', 'xiaohongshu', 'official']);
  assert.deepEqual(health.failedPlatforms, ['github']);
});

test('fixture acceptance keeps collection and browser synchronization clocks distinct', () => {
  const now = Date.parse('2026-09-22T08:00:00.000Z');
  const collection = getCollectionLabel({
    collectedAt: '2026-09-22T06:00:00.000Z',
    now,
    status: 'fresh',
  });
  const sync = getSyncLabel({
    isSyncing: false,
    lastSyncedAt: '2026-09-22T07:59:00.000Z',
    now,
  });
  assert.notEqual(collection, sync);
  assert.match(collection, /采集|2 小时/u);
  assert.match(sync, /刚刚|1 分钟/u);
});
