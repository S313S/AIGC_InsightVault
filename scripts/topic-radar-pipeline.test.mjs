import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { clusterTopicCandidates } from '../shared/topicClustering.js';
import {
  buildSourceBaselines,
  rebuildTopicRadar,
  TopicRadarPipelineError,
} from '../server/topicRadarPipeline.js';

const OWNER = '00000000-0000-4000-8000-000000000001';
const OTHER_OWNER = '00000000-0000-4000-8000-000000000002';
const NOW = '2026-09-21T08:00:00.000Z';

const validBrief = (name = 'Claude Code 工作流') => ({
  title: name,
  summary: `${name} 的可验证变化与影响。`,
  whyNow: '官方信息与创作者实测在近期集中出现。',
  contentAngles: {
    quick: '快速梳理变化。',
    viewpoint: '分析创作者影响。',
    tutorial: '给出可验证步骤。',
  },
  durableKnowledge: ['保留可复用的验证方法。'],
});

const modelSuccess = (name) => async () => ({ text: JSON.stringify(validBrief(name)) });

const card = (overrides = {}) => ({
  id: '10000000-0000-4000-8000-000000000001',
  owner_id: OWNER,
  is_public: true,
  source_url: 'https://x.com/builder/status/101',
  title: 'Claude Code 2 正式发布：代理工作流实测教程',
  author: 'builder',
  platform: 'Twitter',
  date: '2026-09-21T07:00:00.000Z',
  raw_content: 'Claude Code 2 正式发布，包含代理工作流、代码示例和迁移步骤。',
  metrics: { likes: 1200, comments: 80, shares: 50 },
  ai_analysis: { summary: '新版编码代理工作流' },
  tags: ['Claude Code', '教程'],
  is_trending: true,
  created_at: '2026-09-21T07:05:00.000Z',
  ...overrides,
});

const existingTopic = (overrides = {}) => ({
  id: '20000000-0000-4000-8000-000000000001',
  owner_id: OWNER,
  is_public: false,
  fingerprint: 'topic:persisted-claude',
  ...validBrief(),
  why_now: validBrief().whyNow,
  content_angles: validBrief().contentAngles,
  durable_knowledge: validBrief().durableKnowledge,
  write_score: 70,
  study_score: 72,
  breaking_score: 65,
  confidence_score: 60,
  preference_score: 50,
  first_seen_at: '2026-09-20T08:00:00.000Z',
  latest_evidence_at: '2026-09-20T09:00:00.000Z',
  trend_direction: 'steady',
  evidence_signature: 'evidence:old',
  generation_status: 'generated',
  source_count: 1,
  platform_count: 1,
  generated_at: '2026-09-20T09:05:00.000Z',
  created_at: '2026-09-20T08:00:00.000Z',
  updated_at: '2026-09-20T09:05:00.000Z',
  ...overrides,
});

class FakeQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.operation = 'select';
    this.filters = [];
    this.selected = null;
    this.payload = null;
    this.options = null;
    this.singleRow = false;
    this.limitValue = null;
  }

  select(columns) { this.selected = columns; return this; }
  eq(column, value) { this.filters.push({ kind: 'eq', column, value }); return this; }
  in(column, values) { this.filters.push({ kind: 'in', column, values }); return this; }
  gte(column, value) { this.filters.push({ kind: 'gte', column, value }); return this; }
  order(column, options) { this.orderBy = { column, options }; return this; }
  limit(value) { this.limitValue = value; return this; }
  single() { this.singleRow = true; return this; }
  maybeSingle() { this.singleRow = true; return this; }
  insert(payload) { this.operation = 'insert'; this.payload = payload; return this; }
  upsert(payload, options) { this.operation = 'upsert'; this.payload = payload; this.options = options; return this; }
  delete() { this.operation = 'delete'; return this; }
  then(resolve, reject) { return this.execute().then(resolve, reject); }

  async execute() {
    const call = {
      table: this.table,
      operation: this.operation,
      columns: this.selected,
      filters: structuredClone(this.filters),
      payload: structuredClone(this.payload),
      options: structuredClone(this.options),
    };
    this.client.calls.push(call);
    const failure = this.client.failures.get(`${this.table}:${this.operation}`);
    if (failure) return { data: null, error: { message: failure } };
    if (this.operation === 'delete') {
      this.client.deleteCalls += 1;
      return { data: null, error: null };
    }
    if (this.operation === 'select') {
      let rows = [...(this.client.tables[this.table] || [])].filter((row) => this.matches(row));
      if (this.orderBy) {
        const direction = this.orderBy.options?.ascending === false ? -1 : 1;
        rows.sort((left, right) => String(left[this.orderBy.column] || '').localeCompare(String(right[this.orderBy.column] || '')) * direction);
      }
      if (this.limitValue !== null) rows = rows.slice(0, this.limitValue);
      return { data: this.singleRow ? rows[0] ?? null : structuredClone(rows), error: null };
    }

    const values = Array.isArray(this.payload) ? this.payload : [this.payload];
    const stored = [];
    for (const value of values) {
      const rows = this.client.tables[this.table] || (this.client.tables[this.table] = []);
      let current = null;
      if (this.operation === 'upsert') {
        const keys = String(this.options?.onConflict || '').split(',').map((item) => item.trim()).filter(Boolean);
        current = rows.find((row) => keys.length > 0 && keys.every((key) => row[key] === value[key])) || null;
      }
      if (current) {
        Object.assign(current, structuredClone(value));
      } else {
        current = { ...structuredClone(value) };
        if (!current.id) current.id = `${this.table}-${this.client.nextId++}`;
        rows.push(current);
      }
      stored.push(structuredClone(current));
    }
    let result = stored.filter((row) => this.matches(row));
    if (this.singleRow) result = result[0] ?? null;
    return { data: result, error: null };
  }

  matches(row) {
    return this.filters.every((filter) => {
      if (filter.kind === 'eq') return row[filter.column] === filter.value;
      if (filter.kind === 'in') return filter.values.includes(row[filter.column]);
      if (filter.kind === 'gte') return String(row[filter.column] || '') >= String(filter.value);
      return true;
    });
  }
}

class FakeSupabase {
  constructor(tables = {}, failures = {}) {
    this.tables = {
      knowledge_cards: [],
      topics: [],
      topic_sources: [],
      ...structuredClone(tables),
    };
    this.calls = [];
    this.deleteCalls = 0;
    this.nextId = 1;
    this.failures = new Map(Object.entries(failures));
  }

  from(table) { return new FakeQuery(this, table); }
}

const run = (supabase, options = {}) => rebuildTopicRadar({
  supabase,
  ownerId: OWNER,
  now: NOW,
  generateContent: modelSuccess('生成后的选题'),
  ...options,
});

test('first run inserts an owner-private topic and its evidence link with schema-safe fields', async () => {
  const supabase = new FakeSupabase({ knowledge_cards: [card()] });

  const result = await run(supabase);

  assert.equal(result.status, 'success');
  assert.equal(result.topicsInserted, 1);
  assert.equal(result.sourceLinksUpserted, 1);
  assert.equal(supabase.tables.topics.length, 1);
  assert.equal(supabase.tables.topic_sources.length, 1);
  const topic = supabase.tables.topics[0];
  assert.equal(topic.owner_id, OWNER);
  assert.equal(topic.is_public, false);
  assert.equal(topic.generation_status, 'generated');
  assert.equal(topic.generated_at, NOW);
  assert.deepEqual(Object.keys(topic).sort(), [
    'confidence_score', 'content_angles', 'durable_knowledge', 'evidence_signature',
    'fingerprint', 'first_seen_at', 'generated_at', 'generation_status', 'id',
    'is_public', 'latest_evidence_at', 'owner_id', 'platform_count', 'preference_score',
    'source_count', 'study_score', 'summary', 'title', 'trend_direction', 'updated_at',
    'why_now', 'write_score', 'breaking_score',
  ].sort());
  assert.deepEqual(supabase.tables.topic_sources[0], {
    id: supabase.tables.topic_sources[0].id,
    topic_id: topic.id,
    card_id: card().id,
    evidence_role: 'attention',
    source_type: 'social',
    relevance: 100,
  });
  assert.equal(supabase.deleteCalls, 0);
});

test('existing source links feed Task 5 reconciliation and update the persisted fingerprint', async () => {
  const currentCard = card({ raw_content: `${card().raw_content} 新增上下文。` });
  const old = existingTopic();
  const supabase = new FakeSupabase({
    knowledge_cards: [currentCard],
    topics: [old],
    topic_sources: [{
      id: 'source-existing', topic_id: old.id, card_id: currentCard.id,
      evidence_role: 'attention', source_type: 'social', relevance: 90,
    }],
  });

  const result = await run(supabase);

  assert.equal(result.topicsUpdated, 1);
  assert.equal(supabase.tables.topics.length, 1);
  assert.equal(supabase.tables.topics[0].fingerprint, old.fingerprint);
  assert.notEqual(supabase.tables.topics[0].evidence_signature, old.evidence_signature);
  assert.equal(supabase.tables.topic_sources.length, 1);
});

test('existing topics retain old links and count newly linked evidence cumulatively', async () => {
  const oldCard = card({
    id: '10000000-0000-4000-8000-000000000010',
    source_url: 'https://x.com/builder/status/101?utm_source=archive',
    date: '2026-09-20T07:00:00.000Z',
    is_trending: false,
  });
  const newCard = card({
    id: '10000000-0000-4000-8000-000000000011',
    source_url: 'https://x.com/builder/status/101',
  });
  const old = existingTopic({ source_count: 1, platform_count: 1 });
  const supabase = new FakeSupabase({
    knowledge_cards: [oldCard, newCard],
    topics: [old],
    topic_sources: [{
      id: 'source-old', topic_id: old.id, card_id: oldCard.id,
      evidence_role: 'attention', source_type: 'social', relevance: 90,
    }],
  });

  const result = await run(supabase);

  assert.equal(result.topicsUpdated, 1);
  assert.equal(supabase.tables.topics.length, 1);
  assert.equal(supabase.tables.topics[0].fingerprint, old.fingerprint);
  assert.equal(supabase.tables.topics[0].source_count, 2);
  assert.equal(supabase.tables.topics[0].platform_count, 1);
  assert.deepEqual(
    supabase.tables.topic_sources.map((source) => source.card_id).sort(),
    [newCard.id, oldCard.id].sort()
  );
});

test('same generated evidence signature reuses the brief with zero model calls', async () => {
  const currentCard = card();
  const cluster = clusterTopicCandidates([{
    ...currentCard,
    sourceUrl: currentCard.source_url,
    rawContent: currentCard.raw_content,
    aiAnalysis: currentCard.ai_analysis,
  }])[0];
  const old = existingTopic({
    fingerprint: cluster.fingerprint,
    evidence_signature: cluster.evidenceSignature,
  });
  const supabase = new FakeSupabase({
    knowledge_cards: [currentCard],
    topics: [old],
    topic_sources: [{ id: 'source-existing', topic_id: old.id, card_id: currentCard.id }],
  });
  let modelCalls = 0;

  const result = await run(supabase, { generateContent: async () => { modelCalls += 1; return { text: '{}' }; } });

  assert.equal(modelCalls, 0);
  assert.equal(result.briefsReused, 1);
  assert.equal(supabase.tables.topics[0].summary, old.summary);
  assert.equal(supabase.tables.topics[0].generated_at, old.generated_at);
});

test('same fallback signature retries and promotes a successful brief', async () => {
  const currentCard = card();
  const cluster = clusterTopicCandidates([{
    ...currentCard,
    sourceUrl: currentCard.source_url,
    rawContent: currentCard.raw_content,
    aiAnalysis: currentCard.ai_analysis,
  }])[0];
  const old = existingTopic({
    fingerprint: cluster.fingerprint,
    evidence_signature: cluster.evidenceSignature,
    generation_status: 'fallback',
    generated_at: null,
  });
  const supabase = new FakeSupabase({
    knowledge_cards: [currentCard],
    topics: [old],
    topic_sources: [{ id: 'source-existing', topic_id: old.id, card_id: currentCard.id }],
  });
  let modelCalls = 0;

  const result = await run(supabase, { generateContent: async () => {
    modelCalls += 1;
    return { text: JSON.stringify(validBrief('重试成功')) };
  } });

  assert.equal(modelCalls, 1);
  assert.equal(result.briefsGenerated, 1);
  assert.equal(supabase.tables.topics[0].generation_status, 'generated');
  assert.equal(supabase.tables.topics[0].generated_at, NOW);
  assert.equal(supabase.tables.topics[0].title, '重试成功');
});

test('one model failure persists fallback, preserves an old successful brief, and lets other topics continue', async () => {
  const firstCard = card();
  const secondCard = card({
    id: '10000000-0000-4000-8000-000000000002',
    source_url: 'https://x.com/video/status/202',
    title: 'Sora 4 视频生成基准测试正式发布',
    raw_content: 'Sora 4 视频生成发布，包含实测基准与镜头案例。',
    author: 'video-builder',
  });
  const firstCluster = clusterTopicCandidates([{
    ...firstCard,
    sourceUrl: firstCard.source_url,
    rawContent: firstCard.raw_content,
    aiAnalysis: firstCard.ai_analysis,
  }])[0];
  const old = existingTopic({
    fingerprint: firstCluster.fingerprint,
    evidence_signature: 'evidence:previous-success',
  });
  const supabase = new FakeSupabase({
    knowledge_cards: [firstCard, secondCard],
    topics: [old],
    topic_sources: [{ id: 'source-existing', topic_id: old.id, card_id: firstCard.id }],
  });
  let modelCalls = 0;
  const result = await run(supabase, { generateContent: async () => {
    modelCalls += 1;
    if (modelCalls === 1) throw new Error('provider secret must not escape');
    return { text: JSON.stringify(validBrief('第二个话题成功')) };
  } });

  assert.equal(result.status, 'partial_failure');
  assert.equal(result.briefsFallback, 1);
  assert.equal(result.briefsGenerated, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].stage, 'brief_generation');
  assert.doesNotMatch(JSON.stringify(result), /provider secret/);
  assert.equal(supabase.tables.topics.length, 2);
  const preserved = supabase.tables.topics.find((topic) => topic.id === old.id);
  assert.equal(preserved.summary, old.summary);
  assert.deepEqual(preserved.content_angles, old.content_angles);
  assert.equal(preserved.generation_status, 'fallback');
  assert.equal(preserved.generated_at, old.generated_at);
});

test('all reads and identity inheritance stay owner-scoped', async () => {
  const ownCard = card();
  const foreignCard = card({
    id: '10000000-0000-4000-8000-000000000099',
    owner_id: OTHER_OWNER,
  });
  const foreignTopic = existingTopic({
    id: '20000000-0000-4000-8000-000000000099',
    owner_id: OTHER_OWNER,
    fingerprint: 'topic:foreign-must-not-be-inherited',
  });
  const supabase = new FakeSupabase({
    knowledge_cards: [ownCard, foreignCard],
    topics: [foreignTopic],
    topic_sources: [{ id: 'foreign-source', topic_id: foreignTopic.id, card_id: foreignCard.id }],
  });

  await run(supabase);

  const inserted = supabase.tables.topics.find((topic) => topic.owner_id === OWNER);
  assert.ok(inserted);
  assert.notEqual(inserted.fingerprint, foreignTopic.fingerprint);
  assert.equal(supabase.tables.topic_sources.some((source) => source.card_id === foreignCard.id && source.topic_id === inserted.id), false);
  const ownerScopedReads = supabase.calls.filter((call) => ['knowledge_cards', 'topics'].includes(call.table) && call.operation === 'select');
  assert.ok(ownerScopedReads.length >= 2);
  assert.ok(ownerScopedReads.every((call) => call.filters.some((filter) => filter.kind === 'eq' && filter.column === 'owner_id' && filter.value === OWNER)));
  assert.ok(supabase.calls.filter((call) => call.operation === 'select').every((call) => call.columns && call.columns !== '*'));
});

test('owner-scoped distinct evidence builds account baselines and drives relative scoring', async () => {
  const baselineCard = ({ id, author, likes, product, status, createdAt = '2026-09-21T06:00:00.000Z' }) => card({
    id,
    author,
    source_url: `https://x.com/${author}/status/${status}`,
    title: `${product} 2 正式发布`,
    raw_content: `${product} 2 正式发布。`,
    metrics: { likes, comments: 0, shares: 0 },
    ai_analysis: { summary: `${product} 2` },
    tags: [product],
    created_at: createdAt,
  });
  const cards = [
    baselineCard({ id: 'big-target', author: 'big-account', likes: 12_000, product: 'Orion', status: 101 }),
    baselineCard({ id: 'big-mid', author: 'big-account', likes: 20_000, product: 'Nebula', status: 102 }),
    baselineCard({ id: 'big-high', author: 'big-account', likes: 30_000, product: 'Quasar', status: 103 }),
    baselineCard({ id: 'small-low', author: 'small-account', likes: 10, product: 'Sprout', status: 201 }),
    baselineCard({ id: 'small-mid', author: 'small-account', likes: 15, product: 'Seedling', status: 202 }),
    baselineCard({ id: 'small-target', author: 'small-account', likes: 18, product: 'Bloom', status: 203 }),
    baselineCard({
      id: 'small-duplicate-old-observation',
      author: 'small-account',
      likes: 999_999,
      product: 'Bloom',
      status: 203,
      createdAt: '2026-09-21T05:00:00.000Z',
    }),
    baselineCard({
      id: 'foreign-noise', author: 'small-account', likes: 5_000_000,
      product: 'Foreign', status: 999,
    }),
  ];
  cards.at(-1).owner_id = OTHER_OWNER;

  const baselines = buildSourceBaselines(cards.filter((value) => value.owner_id === OWNER).map((value) => ({
    ...value,
    sourceUrl: value.source_url,
    createdAt: value.created_at,
  })));
  assert.deepEqual(baselines['twitter:big-account'].engagement, [12_000, 20_000, 30_000]);
  assert.deepEqual(baselines['twitter:small-account'].engagement, [10, 15, 18]);

  const supabase = new FakeSupabase({ knowledge_cards: cards });
  await run(supabase);
  const topicForCard = (cardId) => {
    const source = supabase.tables.topic_sources.find((value) => value.card_id === cardId);
    return supabase.tables.topics.find((value) => value.id === source?.topic_id);
  };
  const bigTarget = topicForCard('big-target');
  const smallTarget = topicForCard('small-target');

  assert.ok(bigTarget && smallTarget);
  assert.ok(smallTarget.breaking_score > bigTarget.breaking_score,
    `expected relative small-account performance to win: ${smallTarget.breaking_score} > ${bigTarget.breaking_score}`);
  assert.equal(supabase.tables.topic_sources.some((value) => value.card_id === 'foreign-noise'), false);
});

test('stable evidence timestamps do not advance on rerun and only move for newer evidence', async () => {
  const firstCard = card({
    date: '2026-09-20T07:00:00.000Z',
    created_at: '2026-09-20T07:05:00.000Z',
  });
  const supabase = new FakeSupabase({ knowledge_cards: [firstCard] });

  await run(supabase, { now: '2026-09-21T08:00:00.000Z' });
  const initial = structuredClone(supabase.tables.topics[0]);
  await run(supabase, { now: '2026-09-24T08:00:00.000Z' });
  const rerun = structuredClone(supabase.tables.topics[0]);

  assert.equal(initial.first_seen_at, '2026-09-20T07:05:00.000Z');
  assert.equal(initial.latest_evidence_at, '2026-09-20T07:05:00.000Z');
  assert.equal(rerun.first_seen_at, initial.first_seen_at);
  assert.equal(rerun.latest_evidence_at, initial.latest_evidence_at);

  supabase.tables.knowledge_cards.push(card({
    id: '10000000-0000-4000-8000-000000000012',
    source_url: 'https://x.com/builder/status/102',
    date: '2026-09-22T07:00:00.000Z',
    created_at: '2026-09-22T07:05:00.000Z',
    raw_content: `${card().raw_content} 新增官方迁移案例。`,
  }));
  await run(supabase, { now: '2026-09-25T08:00:00.000Z' });
  const advanced = supabase.tables.topics[0];

  assert.equal(advanced.first_seen_at, initial.first_seen_at);
  assert.equal(advanced.latest_evidence_at, '2026-09-22T07:00:00.000Z');
});

test('old topics are retained and repeated runs are idempotent', async () => {
  const stale = existingTopic({ id: 'stale-topic', fingerprint: 'topic:old-unseen' });
  const supabase = new FakeSupabase({ knowledge_cards: [card()], topics: [stale] });

  const first = await run(supabase);
  const second = await run(supabase);

  assert.equal(first.topicsInserted, 1);
  assert.equal(second.topicsInserted, 0);
  assert.equal(supabase.tables.topics.length, 2);
  assert.equal(supabase.tables.topics.some((topic) => topic.id === stale.id), true);
  assert.equal(supabase.tables.topic_sources.length, 1);
  assert.equal(supabase.deleteCalls, 0);
});

test('no cards and only invalid cards return explicit non-writing results', async () => {
  const empty = new FakeSupabase();
  const invalid = new FakeSupabase({ knowledge_cards: [card({ id: '', source_url: '' })] });

  const emptyResult = await run(empty);
  const invalidResult = await run(invalid);

  assert.equal(emptyResult.status, 'skipped');
  assert.equal(emptyResult.reason, 'no_cards');
  assert.equal(invalidResult.status, 'skipped');
  assert.equal(invalidResult.reason, 'no_valid_cards');
  assert.equal(empty.tables.topics.length, 0);
  assert.equal(invalid.tables.topics.length, 0);
});

test('critical database failures expose a safe stage without destructive cleanup', async () => {
  const supabase = new FakeSupabase({ knowledge_cards: [card()] }, { 'topics:upsert': 'database credentials leaked here' });

  await assert.rejects(
    run(supabase),
    (error) => error instanceof TopicRadarPipelineError &&
      error.stage === 'topic_upsert' &&
      error.message === 'Topic radar failed during topic_upsert'
  );
  assert.equal(supabase.deleteCalls, 0);
});

test('cron runs topic persistence after card collection and reports failures as partial health', async () => {
  const source = await readFile(new URL('../api/cron-monitor.js', import.meta.url), 'utf8');

  assert.match(source, /import \{ rebuildTopicRadar \} from '\.\.\/server\/topicRadarPipeline\.js'/);
  assert.match(source, /topicRadar\s*=\s*await rebuildTopicRadar\(\{[\s\S]{0,240}?supabase,[\s\S]{0,240}?ownerId/);
  assert.match(source, /catch \(topicRadarError\)[\s\S]{0,500}?platform:\s*'topic_radar'/);
  assert.match(source, /responsePayload\s*=\s*\{[\s\S]{0,700}?topicRadar/);
  assert.match(source, /resultSummary\s*=\s*\{[\s\S]{0,500}?topicRadar/);
  const pipelineCall = source.indexOf('await rebuildTopicRadar({');
  const cardInsert = source.indexOf(".from('knowledge_cards')\n        .insert(toInsert)");
  assert.ok(cardInsert >= 0 && pipelineCall > cardInsert, 'topic pipeline must run after collected cards are committed');
});
