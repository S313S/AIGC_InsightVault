import assert from 'node:assert/strict';
import test from 'node:test';

import {
  partitionTopicEvidence,
  selectTopicLeadSource,
  sortByPublicationTime,
} from '../shared/topicPresentation.js';

const source = ({ id, platform, url, cover = '', role = 'attention', date = '2026-09-22T08:00:00.000Z' }) => ({
  id,
  evidenceRole: role,
  sourceType: role === 'fact' ? 'repository' : 'social',
  card: {
    id: `card-${id}`,
    platform,
    sourceUrl: url,
    coverImage: cover,
    title: id,
    date,
  },
});

test('lead source prefers a linked social source with real media over coverless fact evidence', () => {
  const github = source({
    id: 'github',
    platform: 'GitHub',
    url: 'https://github.com/openai/openai-node/releases/tag/v7.21.0',
    role: 'fact',
  });
  const social = source({
    id: 'social',
    platform: 'Xiaohongshu',
    url: 'https://www.xiaohongshu.com/explore/abc123',
    cover: 'https://img.example.com/social.jpg',
  });

  const lead = selectTopicLeadSource([github, social]);

  assert.equal(lead?.source.id, 'social');
  assert.equal(lead?.card.id, 'card-social');
  assert.equal(lead?.href, 'https://www.xiaohongshu.com/explore/abc123');
});

test('lead source never exposes unsafe or placeholder URLs', () => {
  const unsafe = source({
    id: 'unsafe',
    platform: 'Twitter',
    url: 'javascript:alert(1)',
    cover: 'https://img.example.com/unsafe.jpg',
  });
  const placeholder = source({
    id: 'placeholder',
    platform: 'Twitter',
    url: 'https://twitter.com/example/status/123456',
    cover: 'https://img.example.com/placeholder.jpg',
  });
  const safe = source({
    id: 'safe',
    platform: 'Official',
    url: 'https://openai.com/index/example',
    role: 'fact',
  });

  assert.equal(selectTopicLeadSource([unsafe, placeholder, safe])?.source.id, 'safe');
  assert.equal(selectTopicLeadSource([unsafe, placeholder]), null);
});

test('raw evidence separates social posts from official and repository facts', () => {
  const cards = [
    { id: 'github', platform: 'GitHub', date: '2026-09-20T08:00:00Z' },
    { id: 'xhs', platform: 'Xiaohongshu', date: '2026-09-22T08:00:00Z' },
    { id: 'official', platform: 'Official', date: '2026-09-21T08:00:00Z' },
    { id: 'twitter', platform: 'Twitter', date: '2026-09-21T10:00:00Z' },
    { id: 'manual', platform: 'Manual', date: '2026-09-19T08:00:00Z' },
  ];

  const result = partitionTopicEvidence(cards);

  assert.deepEqual(result.socialPosts.map((card) => card.id), ['xhs', 'twitter', 'manual']);
  assert.deepEqual(result.factEvidence.map((card) => card.id), ['official', 'github']);
});

test('publication ordering is newest first and keeps invalid dates last without mutating input', () => {
  const cards = [
    { id: 'missing', date: '' },
    { id: 'older', date: '2026-09-20T08:00:00Z' },
    { id: 'invalid', date: 'not-a-date' },
    { id: 'newer', date: '2026-09-22T08:00:00Z' },
  ];

  const result = sortByPublicationTime(cards);

  assert.deepEqual(result.map((card) => card.id), ['newer', 'older', 'missing', 'invalid']);
  assert.deepEqual(cards.map((card) => card.id), ['missing', 'older', 'invalid', 'newer']);
});
