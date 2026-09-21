import assert from 'node:assert/strict';
import test from 'node:test';

import { cleanupOldTrendingSnapshots } from '../server/trendingSnapshotCleanup.js';

const OWNER = 'owner-1';

class Query {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.operation = 'select';
    this.filters = [];
    this.rangeValue = null;
  }
  select(columns) { this.columns = columns; return this; }
  delete() { this.operation = 'delete'; return this; }
  eq(column, value) { this.filters.push({ kind: 'eq', column, value }); return this; }
  in(column, values) { this.filters.push({ kind: 'in', column, values }); return this; }
  order() { return this; }
  range(from, to) { this.rangeValue = { from, to }; return this; }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
  matches(row) {
    return this.filters.every((filter) => filter.kind === 'eq'
      ? row[filter.column] === filter.value
      : filter.values.includes(row[filter.column]));
  }
  async execute() {
    this.client.calls.push({
      table: this.table,
      operation: this.operation,
      columns: this.columns,
      filters: structuredClone(this.filters),
    });
    const failure = this.client.failures.get(`${this.table}:${this.operation}`);
    if (failure) return { data: null, error: { message: failure } };
    if (this.operation === 'delete') {
      const before = this.client.tables[this.table];
      const removed = before.filter((row) => this.matches(row));
      this.client.tables[this.table] = before.filter((row) => !this.matches(row));
      return { data: removed, error: null };
    }
    let rows = this.client.tables[this.table].filter((row) => this.matches(row));
    if (this.rangeValue) rows = rows.slice(this.rangeValue.from, this.rangeValue.to + 1);
    return { data: structuredClone(rows), error: null };
  }
}

class FakeSupabase {
  constructor(tables, failures = {}) {
    this.tables = structuredClone(tables);
    this.calls = [];
    this.failures = new Map(Object.entries(failures));
  }
  from(table) { return new Query(this, table); }
}

test('snapshot cleanup protects referenced cards and deletes only old unreferenced cards in chunks', async () => {
  const snapshots = Array.from({ length: 7 }, (_, index) => `snapshot:2026-09-${String(21 - index).padStart(2, '0')}T08:00:00.000Z`);
  const trendRows = snapshots.map((snapshot, index) => ({
    id: `card-${index}`,
    tags: [snapshot],
  }));
  const supabase = new FakeSupabase({
    topics: [
      { id: 'topic-owned-a', owner_id: OWNER },
      { id: 'topic-owned-b', owner_id: OWNER },
      { id: 'topic-foreign', owner_id: 'owner-2' },
    ],
    topic_sources: [
      { id: 'source-1', topic_id: 'topic-owned-a', card_id: 'card-5' },
      { id: 'source-2', topic_id: 'topic-owned-b', card_id: 'card-3' },
      { id: 'source-foreign', topic_id: 'topic-foreign', card_id: 'card-6' },
    ],
    knowledge_cards: trendRows.map((row) => ({ ...row, owner_id: OWNER })),
  });

  const result = await cleanupOldTrendingSnapshots({
    supabase,
    ownerId: OWNER,
    trendRows,
    keepCount: 5,
    pageSize: 1,
    batchSize: 1,
  });

  assert.deepEqual(result, {
    candidateCount: 2,
    protectedCount: 1,
    deletedCount: 1,
    truncated: false,
    errors: [],
  });
  assert.equal(supabase.tables.knowledge_cards.some((row) => row.id === 'card-5'), true);
  assert.equal(supabase.tables.knowledge_cards.some((row) => row.id === 'card-6'), false);
  assert.equal(supabase.tables.knowledge_cards.some((row) => row.id === 'card-3'), true);
  const deletes = supabase.calls.filter((call) => call.table === 'knowledge_cards' && call.operation === 'delete');
  assert.equal(deletes.length, 1);
  assert.ok(deletes.every((call) => call.filters.find((filter) => filter.kind === 'in').values.length <= 1));
  assert.ok(supabase.calls.filter((call) => call.table === 'topic_sources').length >= 2);
});

test('snapshot cleanup reports a concurrent RESTRICT conflict without deleting evidence', async () => {
  const trendRows = [
    { id: 'new', tags: ['snapshot:2026-09-21T08:00:00.000Z'] },
    { id: 'old', tags: ['snapshot:2026-09-20T08:00:00.000Z'] },
  ];
  const supabase = new FakeSupabase({
    topics: [],
    topic_sources: [],
    knowledge_cards: trendRows.map((row) => ({ ...row, owner_id: OWNER })),
  }, { 'knowledge_cards:delete': 'foreign key restrict conflict' });

  const result = await cleanupOldTrendingSnapshots({
    supabase,
    ownerId: OWNER,
    trendRows,
    keepCount: 1,
  });

  assert.equal(result.deletedCount, 0);
  assert.equal(result.errors.some((error) => error.stage === 'snapshot_cleanup_delete'), true);
  assert.equal(supabase.tables.knowledge_cards.some((row) => row.id === 'old'), true);
});

test('snapshot cleanup fails closed when reference pagination reaches its safety limit', async () => {
  const trendRows = [
    { id: 'new', tags: ['snapshot:2026-09-21T08:00:00.000Z'] },
    { id: 'old', tags: ['snapshot:2026-09-20T08:00:00.000Z'] },
  ];
  const supabase = new FakeSupabase({
    topics: [{ id: 'topic-owned-a', owner_id: OWNER }],
    topic_sources: [
      { id: 'source-1', topic_id: 'topic-owned-a', card_id: 'something' },
      { id: 'source-2', topic_id: 'topic-owned-a', card_id: 'old' },
    ],
    knowledge_cards: trendRows.map((row) => ({ ...row, owner_id: OWNER })),
  });

  const result = await cleanupOldTrendingSnapshots({
    supabase,
    ownerId: OWNER,
    trendRows,
    keepCount: 1,
    pageSize: 1,
    batchSize: 1,
    maxReferenceRows: 1,
  });

  assert.equal(result.truncated, true);
  assert.equal(result.deletedCount, 0);
  assert.equal(supabase.tables.knowledge_cards.some((row) => row.id === 'old'), true);
  assert.equal(supabase.calls.some((call) => call.operation === 'delete'), false);
});

test('production cleanup can page the complete owner trending-card inventory itself', async () => {
  const supabase = new FakeSupabase({
    topics: [],
    topic_sources: [],
    knowledge_cards: [
      { id: 'new', owner_id: OWNER, is_trending: true, tags: ['snapshot:2026-09-21T08:00:00.000Z'] },
      { id: 'middle', owner_id: OWNER, is_trending: true, tags: ['snapshot:2026-09-20T08:00:00.000Z'] },
      { id: 'old', owner_id: OWNER, is_trending: true, tags: ['snapshot:2026-09-19T08:00:00.000Z'] },
      { id: 'foreign', owner_id: 'owner-2', is_trending: true, tags: ['snapshot:2026-01-01T08:00:00.000Z'] },
    ],
  });

  const result = await cleanupOldTrendingSnapshots({
    supabase,
    ownerId: OWNER,
    keepCount: 2,
    pageSize: 1,
    batchSize: 1,
  });

  assert.equal(result.deletedCount, 1);
  assert.equal(supabase.tables.knowledge_cards.some((row) => row.id === 'old'), false);
  assert.equal(supabase.tables.knowledge_cards.some((row) => row.id === 'foreign'), true);
  assert.ok(supabase.calls.filter((call) => call.table === 'knowledge_cards' && call.operation === 'select').length >= 4);
});
