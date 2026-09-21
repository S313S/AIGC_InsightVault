const asArray = (value) => Array.isArray(value) ? value : [];
const cleanId = (value) => String(value || '').trim();

const positiveInteger = (value, fallback) => {
  const numeric = Math.trunc(Number(value));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const chunkValues = (values, size) => {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
};

const pickLatestSnapshotTag = (tags) => {
  const snapshots = asArray(tags).filter((tag) => typeof tag === 'string' && tag.startsWith('snapshot:'));
  if (snapshots.length === 0) return 'snapshot:legacy';
  return [...snapshots].sort((left, right) => right.localeCompare(left, 'en'))[0];
};

const readPaged = async ({ makeQuery, pageSize, maxRows }) => {
  const rows = [];
  while (rows.length < maxRows) {
    const size = Math.min(pageSize, maxRows - rows.length);
    const result = await makeQuery().range(rows.length, rows.length + size - 1);
    if (result?.error) return { rows: [], truncated: true, failed: true };
    const page = asArray(result?.data);
    rows.push(...page);
    if (page.length < size) return { rows, truncated: false, failed: false };
  }
  return { rows, truncated: true, failed: false };
};

const baseResult = (overrides = {}) => ({
  candidateCount: 0,
  protectedCount: 0,
  deletedCount: 0,
  truncated: false,
  errors: [],
  ...overrides,
});

/** Remove only expired snapshot cards proven to have no topic-source reference. */
export const cleanupOldTrendingSnapshots = async ({
  supabase,
  ownerId,
  trendRows,
  keepCount = 5,
  pageSize = 100,
  batchSize = 50,
  maxSnapshotRows = 20_000,
  maxReferenceRows = 10_000,
} = {}) => {
  const resolvedPageSize = positiveInteger(pageSize, 100);
  const resolvedBatchSize = positiveInteger(batchSize, 50);
  const resolvedMaxRows = positiveInteger(maxReferenceRows, 10_000);
  let snapshotsInput = trendRows;
  if (!Array.isArray(snapshotsInput)) {
    const snapshotRows = await readPaged({
      makeQuery: () => supabase
        .from('knowledge_cards')
        .select('id, tags')
        .eq('owner_id', ownerId)
        .eq('is_trending', true)
        .order('id', { ascending: true }),
      pageSize: resolvedPageSize,
      maxRows: positiveInteger(maxSnapshotRows, 20_000),
    });
    if (snapshotRows.failed || snapshotRows.truncated) {
      return baseResult({
        truncated: true,
        errors: [{ stage: 'snapshot_cleanup_cards_read', errorKind: snapshotRows.failed ? 'database_failure' : 'safety_limit' }],
      });
    }
    snapshotsInput = snapshotRows.rows;
  }
  const snapshotToIds = new Map();
  for (const row of snapshotsInput) {
    const id = cleanId(row?.id);
    if (!id) continue;
    const snapshot = pickLatestSnapshotTag(row?.tags);
    const ids = snapshotToIds.get(snapshot) || [];
    ids.push(id);
    snapshotToIds.set(snapshot, ids);
  }
  const snapshots = [...snapshotToIds.keys()].sort((left, right) => {
    if (left === 'snapshot:legacy') return 1;
    if (right === 'snapshot:legacy') return -1;
    return right.localeCompare(left, 'en');
  });
  const retained = new Set(snapshots.slice(0, Math.max(0, Math.trunc(Number(keepCount) || 0))));
  const candidates = [...snapshotToIds.entries()]
    .filter(([snapshot]) => !retained.has(snapshot))
    .flatMap(([, ids]) => ids);
  if (candidates.length === 0) return baseResult();

  const topics = await readPaged({
    makeQuery: () => supabase
      .from('topics')
      .select('id')
      .eq('owner_id', ownerId)
      .order('id', { ascending: true }),
    pageSize: resolvedPageSize,
    maxRows: resolvedMaxRows,
  });
  if (topics.failed || topics.truncated) {
    return baseResult({
      candidateCount: candidates.length,
      truncated: true,
      errors: [{ stage: 'snapshot_cleanup_reference_read', errorKind: topics.failed ? 'database_failure' : 'safety_limit' }],
    });
  }

  const topicIds = topics.rows.map((row) => cleanId(row?.id)).filter(Boolean);
  const referenced = new Set();
  let referenceRowsRead = 0;
  for (const topicBatch of chunkValues(topicIds, resolvedBatchSize)) {
    const remaining = resolvedMaxRows - referenceRowsRead;
    if (remaining <= 0) {
      return baseResult({
        candidateCount: candidates.length,
        truncated: true,
        errors: [{ stage: 'snapshot_cleanup_reference_read', errorKind: 'safety_limit' }],
      });
    }
    const links = await readPaged({
      makeQuery: () => supabase
        .from('topic_sources')
        .select('id, topic_id, card_id')
        .in('topic_id', topicBatch)
        .order('id', { ascending: true }),
      pageSize: resolvedPageSize,
      maxRows: remaining,
    });
    if (links.failed || links.truncated) {
      return baseResult({
        candidateCount: candidates.length,
        truncated: true,
        errors: [{ stage: 'snapshot_cleanup_reference_read', errorKind: links.failed ? 'database_failure' : 'safety_limit' }],
      });
    }
    referenceRowsRead += links.rows.length;
    for (const row of links.rows) {
      const cardId = cleanId(row?.card_id);
      if (cardId) referenced.add(cardId);
    }
  }

  const protectedIds = candidates.filter((id) => referenced.has(id));
  const deletableIds = candidates.filter((id) => !referenced.has(id));
  let deletedCount = 0;
  const errors = [];
  for (const cardBatch of chunkValues(deletableIds, resolvedBatchSize)) {
    const result = await supabase
      .from('knowledge_cards')
      .delete()
      .eq('owner_id', ownerId)
      .in('id', cardBatch);
    if (result?.error) {
      errors.push({ stage: 'snapshot_cleanup_delete', errorKind: 'database_failure' });
      continue;
    }
    deletedCount += cardBatch.length;
  }

  return baseResult({
    candidateCount: candidates.length,
    protectedCount: protectedIds.length,
    deletedCount,
    errors,
  });
};
