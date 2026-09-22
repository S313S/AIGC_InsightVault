import test from 'node:test';
import assert from 'node:assert/strict';

const loadRankings = () => import('../shared/dashboardRankings.js');

const card = ({
  id,
  title,
  tags = [],
  likes = 0,
  bookmarks = 0,
  date = '2026-09-22T00:00:00.000Z',
  sourceUrl,
  rawContent = '',
} = {}) => ({
  id,
  title: title || id,
  tags,
  sourceUrl: sourceUrl || `https://example.com/${id}`,
  rawContent,
  date,
  metrics: { likes, bookmarks, comments: 0 },
});

test('selectHotPosts deduplicates canonical source URLs before applying the limit', async () => {
  const { selectHotPosts } = await loadRankings();
  const cards = [
    card({ id: 'older-copy', sourceUrl: 'https://x.com/name/status/123?utm_source=test', likes: 2 }),
    card({ id: 'hot-copy', sourceUrl: 'https://twitter.com/name/status/123', likes: 200 }),
    card({ id: 'unique', likes: 50 }),
  ];

  assert.deepEqual(selectHotPosts(cards, 6).map(item => item.id), ['hot-copy', 'unique']);
});

test('selectHotPosts sorts by likes, bookmarks, publication time, then stable id', async () => {
  const { selectHotPosts } = await loadRankings();
  const cards = [
    card({ id: 'd', likes: 10, bookmarks: 2, date: '2026-09-20T00:00:00.000Z' }),
    card({ id: 'c', likes: 10, bookmarks: 3, date: '2026-09-19T00:00:00.000Z' }),
    card({ id: 'b', likes: 10, bookmarks: 3, date: '2026-09-21T00:00:00.000Z' }),
    card({ id: 'a', likes: 10, bookmarks: 3, date: '2026-09-21T00:00:00.000Z' }),
  ];

  assert.deepEqual(selectHotPosts(cards, 6).map(item => item.id), ['a', 'b', 'c', 'd']);
});

test('category rankings include only genuine matches and omit empty categories', async () => {
  const { buildCategoryRankings } = await loadRankings();
  const cards = [
    card({ id: 'vibe', tags: ['Vibe Coding'], likes: 50 }),
    card({ id: 'image', title: 'FLUX image generation workflow', likes: 20 }),
    card({ id: 'video', rawContent: '用 Veo 生成短视频', likes: 30 }),
    card({ id: 'tool', tags: ['AI Tools'], title: 'MCP productivity agent', likes: 40 }),
    card({ id: 'unrelated', title: 'Weekend cooking notes', likes: 999 }),
  ];

  const rankings = buildCategoryRankings(cards, { limit: 3 });

  assert.deepEqual(rankings.map(ranking => ranking.id), ['vibe-coding', 'ai-tools', 'image-gen', 'video-gen']);
  assert.deepEqual(rankings.find(ranking => ranking.id === 'vibe-coding').items.map(item => item.id), ['vibe']);
  assert.deepEqual(rankings.find(ranking => ranking.id === 'image-gen').items.map(item => item.id), ['image']);
  assert.deepEqual(rankings.find(ranking => ranking.id === 'video-gen').items.map(item => item.id), ['video']);
  assert.equal(rankings.some(ranking => ranking.items.some(item => item.id === 'unrelated')), false);
});

test('category rankings cap every list and keep deterministic hotness order', async () => {
  const { buildCategoryRankings } = await loadRankings();
  const cards = [
    card({ id: 'low', tags: ['AI Tools'], likes: 1 }),
    card({ id: 'high', tags: ['AI Tools'], likes: 100 }),
    card({ id: 'mid', tags: ['AI Tools'], likes: 50 }),
  ];

  const [ranking] = buildCategoryRankings(cards, { limit: 2 });
  assert.equal(ranking.id, 'ai-tools');
  assert.deepEqual(ranking.items.map(item => item.id), ['high', 'mid']);
});

test('ranking helpers tolerate missing tags, text, metrics, and invalid URLs', async () => {
  const { buildCategoryRankings, selectHotPosts } = await loadRankings();
  const malformed = [{ id: 'broken', sourceUrl: '#', tags: null, metrics: null }];

  assert.deepEqual(selectHotPosts(malformed, 6), malformed);
  assert.deepEqual(buildCategoryRankings(malformed), []);
});
