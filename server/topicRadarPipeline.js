import {
  generateTopicBrief,
  normalizeTopicBrief,
  shouldRegenerateBrief,
} from './topicBriefGenerator.js';
import { clusterTopicCandidates } from '../shared/topicClustering.js';
import {
  buildEvidenceFingerprint,
  normalizeEvidenceUrl,
  tokenizeTopicText,
} from '../shared/topicNormalization.js';
import { isFactEvidence, scoreTopicCluster } from '../shared/topicScoring.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const CARD_LOOKBACK_DAYS = 35;
const DEFAULT_QUERY_PAGE_SIZE = 100;
const DEFAULT_QUERY_BATCH_SIZE = 50;
const DEFAULT_QUERY_MAX_ROWS = 5_000;
const DEFAULT_MAX_MODEL_CALLS = 12;
const DEFAULT_MODEL_TIMEOUT_MS = 9_000;
const DEFAULT_PIPELINE_DEADLINE_MS = 45_000;

const CARD_COLUMNS = [
  'id', 'owner_id', 'is_public', 'source_url', 'title', 'author', 'platform',
  'date', 'raw_content', 'metrics', 'ai_analysis', 'tags', 'is_trending', 'created_at',
].join(', ');

const TOPIC_COLUMNS = [
  'id', 'owner_id', 'is_public', 'fingerprint', 'title', 'summary', 'why_now',
  'content_angles', 'durable_knowledge', 'write_score', 'study_score',
  'breaking_score', 'confidence_score', 'preference_score', 'first_seen_at',
  'latest_evidence_at', 'trend_direction', 'evidence_signature',
  'generation_status', 'source_count', 'platform_count', 'generated_at',
  'created_at', 'updated_at',
].join(', ');

const SOURCE_COLUMNS = 'id, topic_id, card_id, evidence_role, source_type, relevance, created_at';

const cleanId = (value) => String(value || '').trim();
const cleanText = (value) => String(value || '').normalize('NFKC').trim();
const asArray = (value) => Array.isArray(value) ? value : [];

const engagementTotal = (card) => ['likes', 'bookmarks', 'comments', 'shares', 'retweets', 'reposts']
  .reduce((total, key) => total + Math.max(0, Number(card?.metrics?.[key]) || 0), 0);

const baselinePlatform = (card) => cleanText(card?.platform).toLowerCase();
const baselineAccount = (card) => cleanText(
  card?.accountId || card?.account_id || card?.account || card?.handle ||
  card?.username || card?.userName || card?.user_name || card?.author
).toLowerCase().replace(/^@+/u, '');

const baselineEvidenceKey = (card) => {
  const normalizedUrl = normalizeEvidenceUrl(card?.sourceUrl || card?.source_url);
  if (normalizedUrl) return `url:${normalizedUrl}`;
  const id = cleanId(card?.id || card?.cardId || card?.card_id);
  return id ? `id:${id}` : '';
};

const observationTimestamp = (card) => {
  for (const field of ['observedAt', 'observed_at', 'collectedAt', 'collected_at', 'createdAt', 'created_at']) {
    const timestamp = safeDate(card?.[field]);
    if (timestamp !== null) return timestamp;
  }
  return null;
};

/** Build deterministic per-platform and per-account engagement distributions. */
export const buildSourceBaselines = (cards) => {
  const observations = new Map();
  for (const card of asArray(cards)) {
    if (!card || typeof card !== 'object') continue;
    const evidenceKey = baselineEvidenceKey(card);
    const platform = baselinePlatform(card);
    if (!evidenceKey || !platform) continue;
    const current = observations.get(evidenceKey);
    const timestamp = observationTimestamp(card);
    const stableKey = `${cleanId(card.id)}\u0000${engagementTotal(card)}`;
    const currentKey = current?.stableKey || '';
    if (!current ||
      (timestamp !== null && (current.timestamp === null || timestamp > current.timestamp)) ||
      (timestamp === current.timestamp && stableKey > currentKey)) {
      observations.set(evidenceKey, { card, platform, timestamp, stableKey });
    }
  }

  const samples = new Map();
  const addSample = (key, value) => {
    const values = samples.get(key) || [];
    values.push(value);
    samples.set(key, values);
  };
  for (const { card, platform } of observations.values()) {
    const engagement = engagementTotal(card);
    addSample(platform, engagement);
    const account = baselineAccount(card);
    if (account) addSample(`${platform}:${account}`, engagement);
  }

  return Object.fromEntries([...samples.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([key, engagement]) => [key, {
      engagement: [...engagement].sort((left, right) => left - right),
    }]));
};

const safeDate = (value) => {
  const timestamp = value instanceof Date
    ? value.getTime()
    : typeof value === 'number'
      ? (Math.abs(value) < 1e12 ? value * 1000 : value)
      : Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : null;
};

const stableAbsoluteTime = (value) => {
  if (value instanceof Date || typeof value === 'number') return safeDate(value);
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/u.exec(text);
  if (!match) return null;
  const normalized = match[4]
    ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] || '00'}${match[7] ? `.${match[7].padEnd(3, '0')}` : ''}${match[8] || 'Z'}`
    : `${match[1]}-${match[2]}-${match[3]}T00:00:00Z`;
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) return null;
  const parsed = new Date(timestamp);
  const offsetMatch = match[8] && match[8] !== 'Z' ? /([+-])(\d{2}):?(\d{2})/u.exec(match[8]) : null;
  const offsetMinutes = offsetMatch
    ? (offsetMatch[1] === '-' ? -1 : 1) * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]))
    : 0;
  const local = new Date(timestamp + offsetMinutes * 60 * 1000);
  return local.getUTCFullYear() === Number(match[1]) &&
    local.getUTCMonth() + 1 === Number(match[2]) &&
    local.getUTCDate() === Number(match[3]) &&
    (!match[4] || (
      local.getUTCHours() === Number(match[4]) &&
      local.getUTCMinutes() === Number(match[5]) &&
      local.getUTCSeconds() === Number(match[6] || 0)
    ))
    ? parsed.getTime()
    : null;
};

const readStableFieldTime = (card, fields) => {
  for (const field of fields) {
    const timestamp = stableAbsoluteTime(card?.[field]);
    if (timestamp !== null) return timestamp;
  }
  return null;
};

const latestSnapshotTime = (card) => {
  const timestamps = asArray(card?.tags)
    .filter((tag) => typeof tag === 'string' && tag.startsWith('snapshot:'))
    .map((tag) => stableAbsoluteTime(tag.slice('snapshot:'.length)))
    .filter((timestamp) => timestamp !== null);
  return timestamps.length > 0 ? Math.max(...timestamps) : null;
};

const evidenceDiscoveryTime = (card) => readStableFieldTime(card, [
  'collectedAt', 'collected_at', 'fetchedAt', 'fetched_at',
  'observedAt', 'observed_at',
]) ?? latestSnapshotTime(card) ?? readStableFieldTime(card, ['createdAt', 'created_at']);

const evidenceContentTime = (card) => readStableFieldTime(card, [
  'publishedAt', 'published_at', 'publishTime', 'publish_time', 'date',
]) ?? evidenceDiscoveryTime(card);

const relativePublicationDelta = (value) => {
  if (typeof value !== 'string') return null;
  const text = value.normalize('NFKC').trim().toLowerCase();
  if (['刚刚', '刚才', 'just now'].includes(text)) return 0;
  const match = /^(\d+(?:\.\d+)?)\s*(分钟|小时|天)前$/u.exec(text);
  if (!match) return null;
  const amount = Number(match[1]);
  const multiplier = match[2] === '分钟'
    ? 60 * 1000
    : match[2] === '小时'
      ? 60 * 60 * 1000
      : DAY_MS;
  return Number.isFinite(amount) ? amount * multiplier : null;
};

/** Resolve source-relative publication text against the card's stable observation. */
export const anchorRelativePublicationTime = (card) => {
  if (!card || typeof card !== 'object') return card;
  if (readStableFieldTime(card, ['publishedAt', 'published_at', 'publishTime', 'publish_time']) !== null) {
    return card;
  }
  for (const field of ['date', 'publishedAt', 'published_at', 'publishTime', 'publish_time']) {
    const delta = relativePublicationDelta(card[field]);
    if (delta === null) continue;
    const anchor = evidenceDiscoveryTime(card);
    if (anchor === null) return card;
    return { ...card, publishedAt: new Date(anchor - delta).toISOString() };
  }
  return card;
};

const resolveNow = (value) => {
  const timestamp = value === undefined ? Date.now() : safeDate(value);
  if (timestamp === null) throw new TypeError('rebuildTopicRadar requires a valid `now` value');
  return { timestamp, iso: new Date(timestamp).toISOString() };
};

const errorMessage = (result, fallback) => cleanText(result?.error?.message) || fallback;

export class TopicRadarPipelineError extends Error {
  constructor(stage, cause) {
    super(`Topic radar failed during ${stage}`, { cause });
    this.name = 'TopicRadarPipelineError';
    this.stage = stage;
  }
}

const fail = (stage, cause) => {
  throw new TopicRadarPipelineError(stage, cause instanceof Error ? cause : new Error(cleanText(cause) || stage));
};

const toRuntimeCard = (row) => ({
  ...row,
  ownerId: row.owner_id,
  isPublic: row.is_public,
  sourceUrl: row.source_url,
  rawContent: row.raw_content,
  aiAnalysis: row.ai_analysis,
  isTrending: row.is_trending,
  createdAt: row.created_at,
});

const isUsableCard = (row, ownerId) => (
  row &&
  cleanId(row.id) !== '' &&
  row.owner_id === ownerId &&
  row.is_trending === true &&
  cleanText(row.source_url) !== '' &&
  /^https?:\/\//iu.test(cleanText(row.source_url))
);

const existingBrief = (topic) => ({
  title: cleanText(topic?.title),
  summary: cleanText(topic?.summary),
  whyNow: cleanText(topic?.why_now),
  contentAngles: topic?.content_angles,
  durableKnowledge: topic?.durable_knowledge,
});

const sourceKind = (card) => {
  const explicit = cleanText(card?.source_type || card?.sourceType || card?.evidence_role || card?.evidenceRole).toLowerCase();
  const platform = cleanText(card?.platform).toLowerCase();
  let hostname = '';
  try {
    hostname = new URL(card?.sourceUrl || card?.source_url).hostname.toLowerCase();
  } catch {
    // Invalid URLs were removed before clustering.
  }
  if (/official|first.?party|changelog|官方|一手/u.test(explicit) || platform === 'official') {
    return { evidence_role: 'fact', source_type: 'official' };
  }
  if (/repo|github|gitlab/u.test(explicit) || ['github', 'gitlab'].includes(platform) || /(?:^|\.)github\.com$/u.test(hostname)) {
    return { evidence_role: 'fact', source_type: 'repository' };
  }
  if (isFactEvidence(card)) return { evidence_role: 'fact', source_type: 'first_party' };
  return { evidence_role: 'attention', source_type: 'social' };
};

const distinctPlatforms = (cards) => new Set(cards
  .map((card) => cleanText(card?.platform).toLowerCase())
  .filter(Boolean)).size;

const maximumTimestamp = (...values) => {
  const timestamps = values.flat().map(safeDate).filter((value) => value !== null);
  return timestamps.length > 0 ? Math.max(...timestamps) : null;
};

const chunkValues = (values, size) => {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
};

const positiveInteger = (value, fallback) => {
  const numeric = Math.trunc(Number(value));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const nonNegativeInteger = (value, fallback) => {
  const numeric = Math.trunc(Number(value));
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
};

const readPaged = async ({ makeQuery, stage, pageSize, maxRows }) => {
  const rows = [];
  while (rows.length < maxRows) {
    const size = Math.min(pageSize, maxRows - rows.length);
    const result = await makeQuery().range(rows.length, rows.length + size - 1);
    if (result?.error) fail(stage, errorMessage(result, `Failed during ${stage}`));
    const page = asArray(result?.data);
    rows.push(...page);
    if (page.length < size) return { rows, truncated: false };
  }
  return { rows, truncated: true };
};

const buildExistingTopics = (topics, sources, cardsById) => {
  const sourcesByTopic = new Map();
  for (const source of sources) {
    const values = sourcesByTopic.get(source.topic_id) || [];
    values.push(source);
    sourcesByTopic.set(source.topic_id, values);
  }
  return topics.map((topic) => {
    const cards = asArray(sourcesByTopic.get(topic.id))
      .map((source) => cardsById.get(source.card_id))
      .filter(Boolean);
    const evidenceKeys = [...new Set(cards.map(buildEvidenceFingerprint).filter(Boolean))].sort();
    const tokenSource = {
      title: topic.title,
      rawContent: [topic.summary, topic.why_now, ...cards.map((card) => card.rawContent)].filter(Boolean).join(' '),
      tags: cards.flatMap((card) => asArray(card.tags)),
    };
    return {
      ...topic,
      evidenceKeys,
      tokens: tokenizeTopicText(tokenSource),
    };
  });
};

const readCards = async (
  supabase,
  ownerId,
  cutoffIso,
  currentSnapshotTag,
  { pageSize, maxRows }
) => {
  const recent = await readPaged({
    makeQuery: () => supabase
      .from('knowledge_cards')
      .select(CARD_COLUMNS)
      .eq('owner_id', ownerId)
      .eq('is_trending', true)
      .gte('created_at', cutoffIso)
      .order('created_at', { ascending: false }),
    stage: 'cards_read',
    pageSize,
    maxRows,
  });
  let current = { rows: [], truncated: false };
  if (cleanText(currentSnapshotTag)) {
    current = await readPaged({
      makeQuery: () => supabase
        .from('knowledge_cards')
        .select(CARD_COLUMNS)
        .eq('owner_id', ownerId)
        .eq('is_trending', true)
        .contains('tags', [currentSnapshotTag])
        .order('created_at', { ascending: false }),
      stage: 'current_snapshot_cards_read',
      pageSize,
      maxRows,
    });
  }
  const byId = new Map([...recent.rows, ...current.rows].map((row) => [row.id, row]));
  return { rows: [...byId.values()], truncated: recent.truncated || current.truncated };
};

const readTopics = (supabase, ownerId, { pageSize, maxRows }) => readPaged({
  makeQuery: () => supabase
    .from('topics')
    .select(TOPIC_COLUMNS)
    .eq('owner_id', ownerId)
    .order('latest_evidence_at', { ascending: false }),
  stage: 'topics_read',
  pageSize,
  maxRows,
});

const readSources = async (supabase, topicIds, { pageSize, batchSize, maxRows }) => {
  if (topicIds.length === 0) return { rows: [], truncated: false };
  const rows = [];
  for (const topicBatch of chunkValues(topicIds, batchSize)) {
    const remaining = maxRows - rows.length;
    if (remaining <= 0) return { rows, truncated: true };
    const batch = await readPaged({
      makeQuery: () => supabase
        .from('topic_sources')
        .select(SOURCE_COLUMNS)
        .in('topic_id', topicBatch)
        .order('id', { ascending: true }),
      stage: 'topic_sources_read',
      pageSize,
      maxRows: remaining,
    });
    rows.push(...batch.rows);
    if (batch.truncated) return { rows, truncated: true };
  }
  return { rows, truncated: false };
};

const readReferencedCards = async (
  supabase,
  ownerId,
  cardIds,
  { pageSize, batchSize, maxRows }
) => {
  if (cardIds.length === 0) return { rows: [], truncated: false };
  const rows = [];
  for (const cardBatch of chunkValues(cardIds, batchSize)) {
    const remaining = maxRows - rows.length;
    if (remaining <= 0) return { rows, truncated: true };
    const batch = await readPaged({
      makeQuery: () => supabase
        .from('knowledge_cards')
        .select(CARD_COLUMNS)
        .eq('owner_id', ownerId)
        .in('id', cardBatch)
        .order('id', { ascending: true }),
      stage: 'source_cards_read',
      pageSize,
      maxRows: remaining,
    });
    rows.push(...batch.rows);
    if (batch.truncated) return { rows, truncated: true };
  }
  return { rows, truncated: false };
};

const upsertTopic = async (supabase, ownerId, row) => {
  const result = await supabase
    .from('topics')
    .upsert(row, { onConflict: 'owner_id,fingerprint' })
    .select('id, owner_id, fingerprint')
    .eq('owner_id', ownerId)
    .single();
  if (result?.error || !result?.data?.id) {
    fail('topic_upsert', errorMessage(result, 'Failed to persist topic'));
  }
  return result.data;
};

const upsertSources = async (supabase, rows) => {
  if (rows.length === 0) return;
  const result = await supabase
    .from('topic_sources')
    .upsert(rows, { onConflict: 'topic_id,card_id' });
  if (result?.error) fail('topic_sources_upsert', errorMessage(result, 'Failed to persist topic sources'));
};

const generationPriority = (candidate) => {
  const existing = candidate?.existingTopic;
  if (existing?.generation_status === 'fallback') return 0;
  if (!existing) return 1;
  return 2;
};

/** Select a bounded daily generation set with a rotating tail to avoid starvation. */
export const selectBriefGenerationFingerprints = (
  candidates,
  { maxModelCalls = DEFAULT_MAX_MODEL_CALLS, now } = {}
) => {
  const limit = Math.max(0, Math.trunc(Number(maxModelCalls) || 0));
  if (limit === 0) return new Set();
  const ordered = asArray(candidates)
    .filter((candidate) => cleanId(candidate?.fingerprint))
    .sort((left, right) => (
      generationPriority(left) - generationPriority(right) ||
      (safeDate(left?.existingTopic?.generated_at) ?? 0) - (safeDate(right?.existingTopic?.generated_at) ?? 0) ||
      Number(right?.opportunityScore || 0) - Number(left?.opportunityScore || 0) ||
      left.fingerprint.localeCompare(right.fingerprint, 'en')
    ));
  if (ordered.length <= limit) return new Set(ordered.map((candidate) => candidate.fingerprint));

  const prioritySlots = Math.max(1, Math.floor(limit * 2 / 3));
  const selected = ordered.slice(0, prioritySlots);
  const tail = ordered.slice(prioritySlots);
  const rotatingSlots = limit - selected.length;
  const timestamp = safeDate(now) ?? Date.now();
  const day = Math.floor(timestamp / DAY_MS);
  const offset = tail.length > 0 ? (day * Math.max(1, rotatingSlots)) % tail.length : 0;
  for (let index = 0; index < rotatingSlots && index < tail.length; index += 1) {
    selected.push(tail[(offset + index) % tail.length]);
  }
  return new Set(selected.map((candidate) => candidate.fingerprint));
};

const baseResult = (overrides = {}) => ({
  status: 'success',
  reason: null,
  cardsRead: 0,
  cardsAccepted: 0,
  clusters: 0,
  topicsInserted: 0,
  topicsUpdated: 0,
  sourceLinksUpserted: 0,
  briefsGenerated: 0,
  briefsReused: 0,
  briefsFallback: 0,
  truncated: false,
  errors: [],
  ...overrides,
});

/** Rebuild the owner-scoped editorial topic radar without deleting prior topics. */
export const rebuildTopicRadar = async ({
  supabase,
  ownerId,
  now,
  generateContent,
  currentSnapshotTag = '',
  queryPageSize = DEFAULT_QUERY_PAGE_SIZE,
  queryBatchSize = DEFAULT_QUERY_BATCH_SIZE,
  queryMaxRows = DEFAULT_QUERY_MAX_ROWS,
  maxModelCalls = DEFAULT_MAX_MODEL_CALLS,
  modelTimeoutMs = DEFAULT_MODEL_TIMEOUT_MS,
  pipelineDeadlineMs = DEFAULT_PIPELINE_DEADLINE_MS,
} = {}) => {
  if (!supabase || typeof supabase.from !== 'function') throw new TypeError('rebuildTopicRadar requires supabase');
  const scopedOwnerId = cleanId(ownerId);
  if (!scopedOwnerId) throw new TypeError('rebuildTopicRadar requires ownerId');
  const pipelineStartedAt = Date.now();
  const clock = resolveNow(now);
  const cutoffIso = new Date(clock.timestamp - CARD_LOOKBACK_DAYS * DAY_MS).toISOString();
  const queryOptions = {
    pageSize: positiveInteger(queryPageSize, DEFAULT_QUERY_PAGE_SIZE),
    batchSize: positiveInteger(queryBatchSize, DEFAULT_QUERY_BATCH_SIZE),
    maxRows: positiveInteger(queryMaxRows, DEFAULT_QUERY_MAX_ROWS),
  };
  const cardRead = await readCards(
    supabase,
    scopedOwnerId,
    cutoffIso,
    currentSnapshotTag,
    queryOptions
  );
  const rawCards = cardRead.rows;
  if (rawCards.length === 0) return baseResult({ status: 'skipped', reason: 'no_cards' });

  const cards = rawCards
    .filter((row) => isUsableCard(row, scopedOwnerId))
    .map(toRuntimeCard)
    .map(anchorRelativePublicationTime);
  if (cards.length === 0) {
    return baseResult({
      status: 'skipped',
      reason: 'no_valid_cards',
      cardsRead: rawCards.length,
    });
  }

  const topicRead = await readTopics(supabase, scopedOwnerId, queryOptions);
  const topics = topicRead.rows
    .filter((topic) => topic?.owner_id === scopedOwnerId && cleanId(topic?.id));
  const topicByFingerprint = new Map(topics.map((topic) => [topic.fingerprint, topic]));
  const topicIds = topics.map((topic) => topic.id);
  const sourceRead = await readSources(supabase, topicIds, queryOptions);
  const sources = sourceRead.rows
    .filter((source) => topicIds.includes(source?.topic_id) && cleanId(source?.card_id));
  const sourceCardIdsByTopic = new Map();
  for (const source of sources) {
    const cardIds = sourceCardIdsByTopic.get(source.topic_id) || new Set();
    cardIds.add(source.card_id);
    sourceCardIdsByTopic.set(source.topic_id, cardIds);
  }

  const cardsById = new Map(cards.map((value) => [value.id, value]));
  const missingCardIds = [...new Set(sources.map((source) => source.card_id))]
    .filter((cardId) => !cardsById.has(cardId));
  const referencedRead = await readReferencedCards(supabase, scopedOwnerId, missingCardIds, queryOptions);
  for (const row of referencedRead.rows) {
    if (row?.owner_id === scopedOwnerId && cleanId(row.id)) {
      cardsById.set(row.id, anchorRelativePublicationTime(toRuntimeCard(row)));
    }
  }

  const truncatedResources = [
    ['cards', cardRead.truncated],
    ['topics', topicRead.truncated],
    ['topic_sources', sourceRead.truncated],
    ['source_cards', referencedRead.truncated],
  ].filter(([, truncated]) => truncated).map(([resource]) => resource);
  if (truncatedResources.length > 0) {
    return baseResult({
      status: 'partial_failure',
      reason: 'read_truncated',
      cardsRead: rawCards.length,
      cardsAccepted: cards.length,
      truncated: true,
      errors: [{
        stage: 'read_truncated',
        resources: truncatedResources,
        errorKind: 'safety_limit',
      }],
    });
  }

  const existingTopics = buildExistingTopics(topics, sources, cardsById);
  const clusters = clusterTopicCandidates(cards, { existingTopics });
  if (clusters.length === 0) {
    return baseResult({
      status: 'skipped',
      reason: 'no_valid_cards',
      cardsRead: rawCards.length,
      cardsAccepted: cards.length,
    });
  }

  const result = baseResult({
    cardsRead: rawCards.length,
    cardsAccepted: cards.length,
    clusters: clusters.length,
  });
  const sourceBaselines = buildSourceBaselines(cards);
  // No topic-preference persistence exists yet. Task 9 will connect saved,
  // ignored, and published feedback; until then the neutral default is explicit.
  const preferenceSignals = {};
  const scoredTopics = clusters.map((cluster) => {
    const scored = scoreTopicCluster(cluster, {
      now: clock.iso,
      sourceBaselines,
      preferenceSignals,
    });
    return {
      scored,
      existing: topicByFingerprint.get(scored.fingerprint) || null,
    };
  });
  const generationSelection = selectBriefGenerationFingerprints(
    scoredTopics
      .filter(({ scored, existing }) => shouldRegenerateBrief(existing, scored.evidenceSignature))
      .map(({ scored, existing }) => ({
        fingerprint: scored.fingerprint,
        opportunityScore: scored.opportunityScore,
        existingTopic: existing,
      })),
    { maxModelCalls, now: clock.iso }
  );
  const deadline = pipelineStartedAt + nonNegativeInteger(pipelineDeadlineMs, DEFAULT_PIPELINE_DEADLINE_MS);
  let providerTimedOut = false;

  for (const { scored, existing } of scoredTopics) {
    const needsBrief = shouldRegenerateBrief(existing, scored.evidenceSignature);
    let brief;
    let generationStatus;
    let generatedAt;
    const remainingDeadlineMs = deadline - Date.now();

    if (!needsBrief) {
      brief = existingBrief(existing);
      generationStatus = 'generated';
      generatedAt = existing.generated_at || null;
      result.briefsReused += 1;
    } else if (providerTimedOut || !generationSelection.has(scored.fingerprint) || remainingDeadlineMs <= 0) {
      const errorKind = providerTimedOut
        ? 'provider_overlap_guard'
        : generationSelection.has(scored.fingerprint)
          ? 'pipeline_deadline_exhausted'
          : 'model_budget_exhausted';
      const preserveSuccessfulBrief = existing?.generation_status === 'generated' &&
        !shouldRegenerateBrief({ ...existing, evidence_signature: scored.evidenceSignature }, scored.evidenceSignature);
      brief = preserveSuccessfulBrief ? existingBrief(existing) : normalizeTopicBrief({}, scored);
      generationStatus = 'fallback';
      generatedAt = existing?.generated_at || null;
      result.briefsFallback += 1;
      result.errors.push({ stage: 'brief_generation', fingerprint: scored.fingerprint, errorKind });
    } else {
      const generation = await generateTopicBrief(scored, {
        generateContent,
        timeoutMs: Math.min(
          positiveInteger(modelTimeoutMs, DEFAULT_MODEL_TIMEOUT_MS),
          remainingDeadlineMs
        ),
      });
      generationStatus = generation.generationStatus;
      if (generationStatus === 'generated') {
        brief = generation.brief;
        generatedAt = clock.iso;
        result.briefsGenerated += 1;
      } else {
        if (generation.errorKind === 'timeout') providerTimedOut = true;
        const preserveSuccessfulBrief = existing?.generation_status === 'generated' &&
          !shouldRegenerateBrief({ ...existing, evidence_signature: scored.evidenceSignature }, scored.evidenceSignature);
        brief = preserveSuccessfulBrief ? existingBrief(existing) : generation.brief;
        generatedAt = existing?.generated_at || null;
        result.briefsFallback += 1;
        result.errors.push({
          stage: 'brief_generation',
          fingerprint: scored.fingerprint,
          errorKind: generation.errorKind || 'provider_failure',
        });
      }
    }

    const evidence = asArray(scored.evidence);
    const discoveryTimes = evidence.map(evidenceDiscoveryTime).filter((value) => value !== null);
    const contentTimes = evidence.map(evidenceContentTime).filter((value) => value !== null);
    const firstSeenTimestamp = existing
      ? stableAbsoluteTime(existing.first_seen_at)
      : discoveryTimes.length > 0
        ? Math.min(...discoveryTimes)
        : contentTimes.length > 0
          ? Math.min(...contentTimes)
          : null;
    if (firstSeenTimestamp === null) fail('evidence_time', 'Evidence has no stable timestamp');
    const eventTimestamp = maximumTimestamp(
      existing?.latest_evidence_at,
      contentTimes,
      firstSeenTimestamp
    );
    const persistedSourceIds = new Set(existing ? sourceCardIdsByTopic.get(existing.id) || [] : []);
    const currentSourceIds = evidence.map((item) => cleanId(item?.id)).filter(Boolean);
    const allSourceIds = new Set([...persistedSourceIds, ...currentSourceIds]);
    const allSourceCards = [...allSourceIds].map((cardId) => cardsById.get(cardId)).filter(Boolean);
    const sourceCount = allSourceIds.size;
    const topicRow = {
      owner_id: scopedOwnerId,
      is_public: existing?.is_public === true,
      fingerprint: scored.fingerprint,
      title: brief.title,
      summary: brief.summary,
      why_now: brief.whyNow,
      content_angles: brief.contentAngles,
      durable_knowledge: brief.durableKnowledge,
      write_score: Math.round(scored.writeScore),
      study_score: Math.round(scored.studyScore),
      breaking_score: Math.round(scored.breakingScore),
      confidence_score: Math.round(scored.confidenceScore),
      preference_score: Math.round(scored.preferenceScore),
      first_seen_at: new Date(firstSeenTimestamp).toISOString(),
      latest_evidence_at: new Date(eventTimestamp).toISOString(),
      trend_direction: existing
        ? sourceCount > Number(existing.source_count || 0) || scored.evidenceSignature !== existing.evidence_signature
          ? 'rising'
          : 'steady'
        : 'new',
      evidence_signature: scored.evidenceSignature,
      generation_status: generationStatus,
      source_count: sourceCount,
      platform_count: distinctPlatforms(allSourceCards.length > 0 ? allSourceCards : evidence),
      generated_at: generatedAt,
      updated_at: clock.iso,
    };

    const saved = await upsertTopic(supabase, scopedOwnerId, topicRow);
    if (existing) result.topicsUpdated += 1;
    else result.topicsInserted += 1;

    const sourceRows = evidence
      .filter((item) => item?.owner_id === scopedOwnerId && cleanId(item?.id))
      .map((item, index) => ({
        topic_id: saved.id,
        card_id: item.id,
        ...sourceKind(item),
        relevance: index === 0 ? 100 : 85,
      }));
    await upsertSources(supabase, sourceRows);
    result.sourceLinksUpserted += sourceRows.length;
  }

  if (result.errors.length > 0) result.status = 'partial_failure';
  return result;
};
