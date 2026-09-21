import test from 'node:test';
import assert from 'node:assert/strict';

import { clusterTopicCandidates } from '../shared/topicClustering.js';

const card = (id, title, sourceUrl, extra = {}) => ({
  id,
  title,
  sourceUrl,
  platform: 'Twitter',
  author: `author-${id}`,
  rawContent: '',
  tags: [],
  ...extra,
});

const summarize = (clusters) => clusters.map((cluster) => ({
  fingerprint: cluster.fingerprint,
  title: cluster.title,
  representativeId: cluster.representativeCard.id,
  cardIds: cluster.cards.map((item) => item.id),
  evidenceIds: cluster.evidence.map((item) => item.id),
}));

test('merges exact evidence URL duplicates before considering title similarity', () => {
  const clusters = clusterTopicCandidates([
    card('x-1', 'Claude Code launches Agent Teams', 'https://twitter.com/anthropic/status/1900000000000000001?utm_source=share'),
    card('x-2', 'A different summary of the announcement', 'https://x.com/AnthropicAI/status/1900000000000000001?ref=home'),
  ]);

  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0].cards.map((item) => item.id), ['x-1', 'x-2']);
  assert.deepEqual(clusters[0].evidence.map((item) => item.id), ['x-1', 'x-2']);
  assert.equal(typeof clusters[0].fingerprint, 'string');
  assert.equal(clusters[0].fingerprint.length > 0, true);
  assert.equal(clusters[0].title, clusters[0].representativeCard.title);
});

test('merges near-duplicate titles for the same distinctive launch', () => {
  const clusters = clusterTopicCandidates([
    card('launch-a', 'Claude Code launches Agent Teams for parallel coding', 'https://example.com/posts/a'),
    card('launch-b', 'Claude Code launch: Agent Teams enable parallel coding', 'https://another.example/posts/b'),
  ]);

  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0].cards.map((item) => item.id), ['launch-a', 'launch-b']);
});

test('keeps near-duplicate title matching useful when evidence bodies contain different details', () => {
  const clusters = clusterTopicCandidates([
    card(
      'detail-a',
      'Claude Code launches Agent Teams for parallel coding',
      'https://example.com/details/a',
      { rawContent: 'Benchmarks compare terminal latency, sandbox startup, permissions, and repository indexing.' }
    ),
    card(
      'detail-b',
      'Claude Code launch: Agent Teams enable parallel coding',
      'https://another.example/details/b',
      { rawContent: 'A walkthrough covers delegation prompts, review checkpoints, branch naming, and merge recovery.' }
    ),
  ]);

  assert.equal(clusters.length, 1);
});

test('does not merge unrelated posts that only share generic AI terms', () => {
  const clusters = clusterTopicCandidates([
    card('art', 'AI 绘画教程：Midjourney 构图指南', 'https://example.com/art'),
    card('code', '人工智能编程工具：Cursor 数据库重构实战', 'https://example.com/code'),
    card('video', 'AIGC 视频教程：可灵镜头控制方法', 'https://example.com/video'),
  ]);

  assert.equal(clusters.length, 3);
  assert.deepEqual(clusters.map((cluster) => cluster.cards.length), [1, 1, 1]);
});

test('does not merge competing company announcements that only share low-information launch language', () => {
  const clusters = clusterTopicCandidates([
    card('openai-model', 'OpenAI launches a new AI model', 'https://openai.example/model'),
    card('anthropic-model', 'Anthropic launches a new AI model', 'https://anthropic.example/model'),
  ]);

  assert.equal(clusters.length, 2);
});

test('still merges launch coverage that shares a concrete product identity', () => {
  const clusters = clusterTopicCandidates([
    card('gpt-a', 'OpenAI GPT-5 launch announcement: faster coding model', 'https://example.com/gpt/a'),
    card('gpt-b', 'GPT-5 released with a faster coding model update', 'https://another.example/gpt/b'),
  ]);

  assert.equal(clusters.length, 1);
});

test('keeps different model versions separate while merging the same version', () => {
  const clusters = clusterTopicCandidates([
    card('gpt-4', 'OpenAI launches a new GPT-4 AI coding model benchmark', 'https://example.com/gpt-4'),
    card('gpt-5-a', 'OpenAI launches a new GPT-5 AI coding model benchmark', 'https://example.com/gpt-5/a'),
    card('gpt-5-b', 'GPT-5 coding benchmark release announcement from OpenAI', 'https://another.example/gpt-5'),
  ]);

  assert.equal(clusters.length, 2);
  assert.deepEqual(clusters.map((cluster) => cluster.cards.map((item) => item.id)), [
    ['gpt-4'],
    ['gpt-5-a', 'gpt-5-b'],
  ]);
});

test('applies version identity consistently across protected product aliases', () => {
  const fixtures = [
    ['sora', 'Sora 1', 'Sora 1', 'Sora 2'],
    ['veo', 'Veo2', 'Veo 2', 'Veo3'],
    ['kling', '可灵1.6', '可灵 1.6', '可灵2.0'],
    ['claude-code', 'Claude Code1.0', 'Claude Code 1.0', 'Claude Code2.0'],
  ];

  for (const [name, firstVersion, sameVersion, otherVersion] of fixtures) {
    const clusters = clusterTopicCandidates([
      card(`${name}-a`, `${firstVersion} cinematic workflow benchmark`, `https://example.com/${name}/a`),
      card(`${name}-b`, `${sameVersion} cinematic workflow benchmark`, `https://example.com/${name}/b`),
      card(`${name}-c`, `${otherVersion} cinematic workflow benchmark`, `https://example.com/${name}/c`),
    ]);

    assert.equal(clusters.length, 2, name);
    assert.deepEqual(clusters.map((cluster) => cluster.cards.map((item) => item.id)), [
      [`${name}-a`, `${name}-b`],
      [`${name}-c`],
    ], name);
  }
});

test('makes similarityThreshold effective at the merge boundary', () => {
  const candidates = [
    card('threshold-a', 'Sora video storyboard workflow benchmarks launch', 'https://example.com/threshold/a'),
    card('threshold-b', 'Sora video storyboard prompt guide', 'https://example.com/threshold/b'),
  ];

  assert.equal(clusterTopicCandidates(candidates, { similarityThreshold: 0.55 }).length, 1);
  assert.equal(clusterTopicCandidates(candidates, { similarityThreshold: 0.7 }).length, 2);
});

test('keeps input unchanged and returns deterministic clusters independent of input order', () => {
  const cards = [
    card('sora-b', 'Sora video storyboard prompt guide', 'https://example.com/sora/b'),
    card('unrelated', 'Cursor database refactor field notes', 'https://example.com/cursor'),
    card('sora-a', 'Sora video storyboard workflow launch', 'https://example.com/sora/a'),
  ];
  const before = structuredClone(cards);

  const forward = summarize(clusterTopicCandidates(cards, { similarityThreshold: 0.55 }));
  const reverse = summarize(clusterTopicCandidates([...cards].reverse(), { similarityThreshold: 0.55 }));

  assert.deepEqual(cards, before);
  assert.deepEqual(forward, reverse);
  assert.deepEqual(forward.map((cluster) => cluster.cardIds), [
    ['sora-a', 'sora-b'],
    ['unrelated'],
  ]);
});

test('keeps unknown URL resources separate when their retained query identity differs', () => {
  const clusters = clusterTopicCandidates([
    card('query-alpha', 'Release notes', 'https://example.com/resource?source=alpha'),
    card('query-beta', 'Release notes', 'https://example.com/resource?source=beta'),
  ], { similarityThreshold: 1 });

  assert.equal(clusters.length, 2);
});

test('uses every card field as a deterministic final tie-breaker regardless of object key order', () => {
  const first = card('same-id', 'Same title', 'https://example.com/same', {
    author: 'alpha-author',
    platform: 'Twitter',
    date: '2026-09-20',
    rawContent: 'alpha detail',
    tags: ['Sora', 'video'],
    metrics: { likes: 2, comments: 1 },
  });
  const second = card('same-id', 'Same title', 'https://example.com/same', {
    author: 'zeta-author',
    platform: 'Xiaohongshu',
    date: '2026-09-21',
    rawContent: 'zeta detail',
    tags: ['Claude Code'],
    metrics: { comments: 4, likes: 9 },
  });
  const reverseKeys = (value) => Object.fromEntries(Object.entries(value).reverse());

  const forward = clusterTopicCandidates([first, second]);
  const reversed = clusterTopicCandidates([reverseKeys(second), reverseKeys(first)]);

  assert.deepEqual(forward, reversed);
  assert.equal(forward[0].representativeCard.author, 'alpha-author');
  assert.deepEqual(forward[0].cards.map((item) => item.author), ['alpha-author', 'zeta-author']);
  assert.deepEqual(forward[0].evidence.map((item) => item.author), ['alpha-author', 'zeta-author']);
});

test('reconciles a persisted fingerprint when relative publication text changes', () => {
  const initialCard = card(
    'relative-time',
    'Claude Code Agent Teams parallel coding workflow',
    'https://example.com/agent-teams/relative',
    { date: '刚刚' }
  );
  const initial = clusterTopicCandidates([initialCard])[0];
  const persistedFingerprint = 'topic:persisted-agent-teams';
  const refreshed = clusterTopicCandidates([
    { ...initialCard, date: '09-21' },
  ], {
    existingTopics: [{
      fingerprint: persistedFingerprint,
      evidenceKeys: initial.evidenceKeys,
      tokens: initial.tokens,
    }],
  })[0];

  assert.equal(refreshed.fingerprint, persistedFingerprint);
  assert.equal(refreshed.fingerprintSource, 'existing_evidence');
  assert.match(refreshed.provisionalFingerprint, /^topic:[a-f0-9]{64}$/);
  assert.equal(initial.evidenceSignature, refreshed.evidenceSignature);
});

test('keeps a persisted fingerprint when earlier official evidence is added', () => {
  const early = card(
    'z-early',
    'Claude Code Agent Teams parallel coding workflow',
    'https://example.com/agent-teams/early',
    { date: '2026-09-20T08:00:00Z' }
  );
  const middle = card(
    'm-middle',
    'Claude Code Agent Teams parallel coding guide',
    'https://example.com/agent-teams/middle',
    { date: '2026-09-21T08:00:00Z' }
  );
  const later = card(
    'a-later',
    'Claude Code Agent Teams parallel coding benchmarks',
    'https://example.com/agent-teams/later',
    { date: '2026-09-22T08:00:00Z' }
  );

  const initial = clusterTopicCandidates([early, middle])[0];
  const persistedFingerprint = 'topic:persisted-agent-teams';
  const earlierOfficial = card(
    'a-official',
    'Claude Code Agent Teams parallel coding official details',
    'https://official.example.com/agent-teams',
    { date: '2026-09-01T08:00:00Z' }
  );
  const expanded = clusterTopicCandidates([later, earlierOfficial, middle, early], {
    existingTopics: [{
      fingerprint: persistedFingerprint,
      evidenceKeys: initial.evidenceKeys,
      tokens: initial.tokens,
    }],
  })[0];

  assert.equal(expanded.fingerprint, persistedFingerprint);
  assert.equal(expanded.fingerprintSource, 'existing_evidence');
  assert.notEqual(initial.evidenceSignature, expanded.evidenceSignature);
  assert.match(initial.fingerprint, /^topic:[a-f0-9]{64}$/);
  assert.match(initial.evidenceSignature, /^evidence:[a-f0-9]{64}$/);
});

test('keeps evidence signature stable across operational metadata changes even without a URL', () => {
  const base = card('stable-evidence', 'Sora 2 cinematic workflow', '', {
    rawContent: 'A reproducible camera-control workflow.',
    author: 'creator',
    platform: 'Twitter',
    date: '刚刚',
    metrics: { likes: 10, comments: 2 },
    tags: ['snapshot:2026-09-20', 'video'],
    collections: ['daily'],
    ownerId: 'owner-a',
  });
  const changedOperations = {
    ...base,
    date: '09-21',
    metrics: { likes: 999, comments: 120 },
    tags: ['snapshot:2026-09-21', 'trending'],
    collections: ['published'],
    ownerId: 'owner-b',
  };
  const changedBody = { ...changedOperations, rawContent: 'A materially revised camera-control workflow.' };

  const baseCluster = clusterTopicCandidates([base])[0];
  const operationsCluster = clusterTopicCandidates([changedOperations])[0];
  const bodyCluster = clusterTopicCandidates([changedBody])[0];
  assert.equal(operationsCluster.evidenceSignature, baseCluster.evidenceSignature);
  assert.equal(operationsCluster.provisionalFingerprint, baseCluster.provisionalFingerprint);
  assert.deepEqual(operationsCluster.tokens, baseCluster.tokens);
  assert.notEqual(bodyCluster.evidenceSignature, baseCluster.evidenceSignature);
});

test('does not reconcile when multiple existing topics have an equal evidence match', () => {
  const first = card('ambiguous-a', 'Claude Code Agent Teams parallel coding', 'https://example.com/ambiguous/a');
  const second = card('ambiguous-b', 'Claude Code Agent Teams parallel coding', 'https://example.com/ambiguous/b');
  const provisional = clusterTopicCandidates([first, second])[0];
  const reconciled = clusterTopicCandidates([second, first], {
    existingTopics: [
      { fingerprint: 'topic:existing-a', evidenceKeys: [provisional.evidenceKeys[0]], tokens: provisional.tokens },
      { fingerprint: 'topic:existing-b', evidenceKeys: [provisional.evidenceKeys[1]], tokens: provisional.tokens },
    ],
  })[0];

  assert.equal(reconciled.fingerprint, reconciled.provisionalFingerprint);
  assert.equal(reconciled.fingerprintSource, 'provisional');
  assert.notEqual(reconciled.fingerprint, 'topic:existing-a');
  assert.notEqual(reconciled.fingerprint, 'topic:existing-b');
});

test('uses a wide digest instead of the known 32-bit FNV collision', () => {
  const first = clusterTopicCandidates([
    card('collision-a', 'Collision fixture', 'https://example.com/item/149599'),
  ])[0];
  const second = clusterTopicCandidates([
    card('collision-b', 'Collision fixture', 'https://example.com/item/312382'),
  ])[0];

  assert.notEqual(first.fingerprint, second.fingerprint);
  assert.notEqual(first.evidenceSignature, second.evidenceSignature);
});

test('prevents single-link bridge evidence from collapsing distinct topic edges', () => {
  const clusters = clusterTopicCandidates([
    card('bridge-a', 'alpha bravo charlie delta', 'https://example.com/bridge/a'),
    card('bridge-b', 'alpha bravo charlie delta echo foxtrot golf hotel', 'https://example.com/bridge/b'),
    card('bridge-c', 'echo foxtrot golf hotel', 'https://example.com/bridge/c'),
  ], { similarityThreshold: 0.6 });

  assert.equal(clusters.length, 2);
  assert.deepEqual(clusters.map((cluster) => cluster.cards.map((item) => item.id)), [
    ['bridge-a', 'bridge-b'],
    ['bridge-c'],
  ]);
});
