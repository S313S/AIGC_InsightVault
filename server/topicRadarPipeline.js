import { generateTopicBrief, shouldRegenerateBrief } from './topicBriefGenerator.js';
import { clusterTopicCandidates } from '../shared/topicClustering.js';
import { buildEvidenceFingerprint, tokenizeTopicText } from '../shared/topicNormalization.js';
import { isFactEvidence, scoreTopicCluster } from '../shared/topicScoring.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const CARD_LOOKBACK_DAYS = 35;
const MAX_CARDS = 500;
const MAX_TOPICS = 500;

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

const safeDate = (value) => {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : null;
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

const latestTimestamp = (...values) => {
  const timestamps = values.flat().map(safeDate).filter((value) => value !== null);
  return timestamps.length > 0 ? Math.max(...timestamps) : null;
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

const readCards = async (supabase, ownerId, cutoffIso) => {
  const result = await supabase
    .from('knowledge_cards')
    .select(CARD_COLUMNS)
    .eq('owner_id', ownerId)
    .eq('is_trending', true)
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: false })
    .limit(MAX_CARDS);
  if (result?.error) fail('cards_read', errorMessage(result, 'Failed to read topic cards'));
  return asArray(result?.data);
};

const readTopics = async (supabase, ownerId) => {
  const result = await supabase
    .from('topics')
    .select(TOPIC_COLUMNS)
    .eq('owner_id', ownerId)
    .order('latest_evidence_at', { ascending: false })
    .limit(MAX_TOPICS);
  if (result?.error) fail('topics_read', errorMessage(result, 'Failed to read existing topics'));
  return asArray(result?.data);
};

const readSources = async (supabase, topicIds) => {
  if (topicIds.length === 0) return [];
  const result = await supabase
    .from('topic_sources')
    .select(SOURCE_COLUMNS)
    .in('topic_id', topicIds);
  if (result?.error) fail('topic_sources_read', errorMessage(result, 'Failed to read topic sources'));
  return asArray(result?.data);
};

const readReferencedCards = async (supabase, ownerId, cardIds) => {
  if (cardIds.length === 0) return [];
  const result = await supabase
    .from('knowledge_cards')
    .select(CARD_COLUMNS)
    .eq('owner_id', ownerId)
    .in('id', cardIds)
    .limit(MAX_CARDS);
  if (result?.error) fail('source_cards_read', errorMessage(result, 'Failed to read source cards'));
  return asArray(result?.data);
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
  errors: [],
  ...overrides,
});

/** Rebuild the owner-scoped editorial topic radar without deleting prior topics. */
export const rebuildTopicRadar = async ({ supabase, ownerId, now, generateContent } = {}) => {
  if (!supabase || typeof supabase.from !== 'function') throw new TypeError('rebuildTopicRadar requires supabase');
  const scopedOwnerId = cleanId(ownerId);
  if (!scopedOwnerId) throw new TypeError('rebuildTopicRadar requires ownerId');
  const clock = resolveNow(now);
  const cutoffIso = new Date(clock.timestamp - CARD_LOOKBACK_DAYS * DAY_MS).toISOString();
  const rawCards = await readCards(supabase, scopedOwnerId, cutoffIso);
  if (rawCards.length === 0) return baseResult({ status: 'skipped', reason: 'no_cards' });

  const cards = rawCards.filter((row) => isUsableCard(row, scopedOwnerId)).map(toRuntimeCard);
  if (cards.length === 0) {
    return baseResult({
      status: 'skipped',
      reason: 'no_valid_cards',
      cardsRead: rawCards.length,
    });
  }

  const topics = (await readTopics(supabase, scopedOwnerId))
    .filter((topic) => topic?.owner_id === scopedOwnerId && cleanId(topic?.id));
  const topicByFingerprint = new Map(topics.map((topic) => [topic.fingerprint, topic]));
  const topicIds = topics.map((topic) => topic.id);
  const sources = (await readSources(supabase, topicIds))
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
  const referencedRows = await readReferencedCards(supabase, scopedOwnerId, missingCardIds);
  for (const row of referencedRows) {
    if (row?.owner_id === scopedOwnerId && cleanId(row.id)) cardsById.set(row.id, toRuntimeCard(row));
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

  for (const cluster of clusters) {
    const scored = scoreTopicCluster(cluster, { now: clock.iso });
    const existing = topicByFingerprint.get(scored.fingerprint) || null;
    const needsBrief = shouldRegenerateBrief(existing, scored.evidenceSignature);
    let brief;
    let generationStatus;
    let generatedAt;

    if (!needsBrief) {
      brief = existingBrief(existing);
      generationStatus = 'generated';
      generatedAt = existing.generated_at || null;
      result.briefsReused += 1;
    } else {
      const generation = await generateTopicBrief(scored, { generateContent });
      generationStatus = generation.generationStatus;
      if (generationStatus === 'generated') {
        brief = generation.brief;
        generatedAt = clock.iso;
        result.briefsGenerated += 1;
      } else {
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
    const priorLatest = existing?.latest_evidence_at;
    const eventTimestamp = latestTimestamp(scored.latestPublishedAt, priorLatest, clock.iso);
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
      first_seen_at: existing?.first_seen_at || clock.iso,
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
