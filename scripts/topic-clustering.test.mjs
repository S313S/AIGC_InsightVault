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

test('makes similarityThreshold effective at the merge boundary', () => {
  const candidates = [
    card('threshold-a', 'Sora video storyboard workflow launch', 'https://example.com/threshold/a'),
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
    card('query-42', 'Release notes', 'https://example.com/resource?id=42'),
    card('query-43', 'Release notes', 'https://example.com/resource?id=43'),
  ], { similarityThreshold: 1 });

  assert.equal(clusters.length, 2);
});
