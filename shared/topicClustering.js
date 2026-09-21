import { createHash } from 'node:crypto';

import {
  buildEvidenceFingerprint,
  isDistinctiveTopicToken,
  normalizeEvidenceUrl,
  parseVersionedProductToken,
  tokenizeTopicText,
} from './topicNormalization.js';

const stableSerialize = (value) => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'number' && !Number.isFinite(value)) return `number:${String(value)}`;
  if (typeof value !== 'object') return `${typeof value}:${JSON.stringify(value)}`;
  if (value instanceof Date) return `date:${value.toISOString()}`;
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
    .join(',')}}`;
};

const stableCardKey = (card) => [
  String(card?.id || ''),
  normalizeEvidenceUrl(card?.sourceUrl || card?.source_url),
  String(card?.title || '').normalize('NFKC').toLowerCase(),
  stableSerialize(card),
].join('\u0000');

const compareCards = (left, right) => {
  const leftKey = stableCardKey(left);
  const rightKey = stableCardKey(right);
  if (leftKey < rightKey) return -1;
  if (leftKey > rightKey) return 1;
  return 0;
};

const clampThreshold = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.58;
  return Math.min(1, Math.max(0, numeric));
};

const resolveNonNegativeOption = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : fallback;
};

const diceSimilarity = (leftTokens, rightTokens) => {
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  if (intersection === 0) return 0;
  return (2 * intersection) / (leftTokens.size + rightTokens.size);
};

const hasDistinctiveOverlap = (leftTokens, rightTokens) => {
  for (const token of leftTokens) {
    if (rightTokens.has(token) && isDistinctiveTopicToken(token)) return true;
  }
  return false;
};

const hasConflictingVersionIdentity = (leftTokens, rightTokens) => {
  const versionsByProduct = (tokens) => {
    const result = new Map();
    for (const token of tokens) {
      const parsed = parseVersionedProductToken(token);
      if (!parsed) continue;
      const versions = result.get(parsed.product) || new Set();
      versions.add(parsed.version);
      result.set(parsed.product, versions);
    }
    return result;
  };

  const leftProducts = versionsByProduct(leftTokens);
  const rightProducts = versionsByProduct(rightTokens);
  for (const [product, leftVersions] of leftProducts) {
    const rightVersions = rightProducts.get(product);
    if (!rightVersions) continue;
    if (![...leftVersions].some((version) => rightVersions.has(version))) return true;
  }
  return false;
};

const hasConflictingResourceQuery = (leftUrl, rightUrl) => {
  if (!leftUrl || !rightUrl || leftUrl === rightUrl) return false;
  try {
    const left = new URL(leftUrl);
    const right = new URL(rightUrl);
    return left.origin === right.origin &&
      left.pathname === right.pathname &&
      left.search !== right.search &&
      Boolean(left.search || right.search);
  } catch {
    return false;
  }
};

// This clustering pipeline runs in Node during collection; it is not a browser bundle module.
const hashText = (value) => createHash('sha256').update(value).digest('hex');

const normalizeBriefText = (value) => String(value || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/\s+/gu, ' ')
  .trim();

const buildEvidenceKeys = (members) => {
  return [...new Set(members.map(({ fingerprint }) => fingerprint))].sort();
};

const buildClusterTokens = (members) => {
  const tokensByIdentity = new Map();
  for (const member of members) {
    const tokens = tokensByIdentity.get(member.fingerprint) || new Set();
    for (const token of member.reconciliationTokens) tokens.add(token);
    tokensByIdentity.set(member.fingerprint, tokens);
  }

  const identityTokenSets = [...tokensByIdentity.values()];
  if (identityTokenSets.length === 0) return [];
  return [...identityTokenSets[0]]
    .filter((token) => identityTokenSets.every((tokens) => tokens.has(token)))
    .sort();
};

const buildProvisionalFingerprint = (evidenceKeys, tokens) => {
  const material = stableSerialize({ evidenceKeys, tokens });
  return `topic:${hashText(`topic-provisional\n${material}`)}`;
};

const buildEvidenceSignature = (members) => {
  const briefEvidence = members.map(({ card, fingerprint }) => stableSerialize({
    identity: fingerprint,
    title: normalizeBriefText(card?.title),
    rawContent: normalizeBriefText(card?.rawContent || card?.raw_content),
    author: normalizeBriefText(card?.author),
    platform: normalizeBriefText(card?.platform),
  })).sort();
  return `evidence:${hashText(briefEvidence.join('\n'))}`;
};

const candidatesAreCompatible = (left, right, threshold) => {
  if (hasConflictingResourceQuery(left.normalizedUrl, right.normalizedUrl)) return false;
  if (hasConflictingVersionIdentity(left.tokens, right.tokens)) return false;
  if (!hasDistinctiveOverlap(left.tokens, right.tokens)) return false;
  return Math.max(
    diceSimilarity(left.titleTokens, right.titleTokens),
    diceSimilarity(left.tokens, right.tokens)
  ) >= threshold;
};

const identityGroupsAreCompatible = (leftGroup, rightGroup, threshold) => {
  return leftGroup.members.some((left) => (
    rightGroup.members.some((right) => candidatesAreCompatible(left, right, threshold))
  ));
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SEMANTIC_TIME_WINDOW_MS = 14 * DAY_MS;
const DEFAULT_SEMANTIC_MARGIN = 0.08;
const DEFAULT_SEMANTIC_MIN_SCORE = 0.84;
const CARD_EVENT_TIME_FIELDS = [
  'publishedAt',
  'published_at',
  'publishTime',
  'publish_time',
  'date',
  'createdAt',
  'created_at',
];
const TEMPORAL_TOKENS = new Set([
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'q1', 'q2', 'q3', 'q4', '一季度', '二季度', '三季度', '四季度',
]);

const parseComparableTime = (value) => {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.abs(value) < 1e12 ? value * 1000 : value;
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/u.test(value.trim())) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const readCardEventTime = (card) => {
  for (const field of CARD_EVENT_TIME_FIELDS) {
    const parsed = parseComparableTime(card?.[field]);
    if (parsed !== null) return parsed;
  }
  return null;
};

const getClusterEventRange = (members) => {
  const membersByIdentity = new Map();
  for (const member of members) {
    const group = membersByIdentity.get(member.fingerprint) || [];
    group.push(member);
    membersByIdentity.set(member.fingerprint, group);
  }

  const identityTimes = [];
  for (const identityMembers of membersByIdentity.values()) {
    const times = identityMembers
      .map(({ card }) => readCardEventTime(card))
      .filter((value) => value !== null);
    if (times.length === 0) return null;
    identityTimes.push(...times);
  }
  return identityTimes.length > 0
    ? { first: Math.min(...identityTimes), last: Math.max(...identityTimes) }
    : null;
};

const getTemporalMarkers = (tokens) => new Set([...tokens].filter((token) => (
  TEMPORAL_TOKENS.has(token) || /^20\d{2}$/u.test(token)
)));

const hasConflictingTemporalMarkers = (leftTokens, rightTokens) => {
  const leftMarkers = getTemporalMarkers(leftTokens);
  const rightMarkers = getTemporalMarkers(rightTokens);
  if (leftMarkers.size === 0 || rightMarkers.size === 0) return false;
  return ![...leftMarkers].some((marker) => rightMarkers.has(marker));
};

const eventRangeGap = (left, right) => {
  if (!left || !right) return null;
  if (left.last < right.first) return right.first - left.last;
  if (right.last < left.first) return left.first - right.last;
  return 0;
};

const normalizeExistingTopics = (existingTopics) => {
  const byFingerprint = new Map();
  for (const topic of Array.isArray(existingTopics) ? existingTopics : []) {
    const fingerprint = String(topic?.fingerprint || '').trim();
    if (!fingerprint) continue;
    const normalized = byFingerprint.get(fingerprint) || {
      fingerprint,
      evidenceKeys: new Set(),
      tokens: new Set(),
      eventTimes: [],
    };
    for (const key of Array.isArray(topic?.evidenceKeys) ? topic.evidenceKeys : []) {
      const value = String(key || '').trim();
      if (value) normalized.evidenceKeys.add(value);
    }
    for (const token of Array.isArray(topic?.tokens) ? topic.tokens : []) {
      const value = String(token || '').normalize('NFKC').trim().toLowerCase();
      if (value) normalized.tokens.add(value);
    }
    for (const value of [topic?.firstSeenAt, topic?.lastSeenAt]) {
      const parsed = parseComparableTime(value);
      if (parsed !== null) normalized.eventTimes.push(parsed);
    }
    byFingerprint.set(fingerprint, normalized);
  }
  return [...byFingerprint.values()]
    .map((topic) => ({
      ...topic,
      eventRange: topic.eventTimes.length > 0
        ? { first: Math.min(...topic.eventTimes), last: Math.max(...topic.eventTimes) }
        : null,
    }))
    .sort((left, right) => (
      left.fingerprint < right.fingerprint ? -1 : left.fingerprint > right.fingerprint ? 1 : 0
    ));
};

const semanticMatchScore = ({
  members,
  clusterTokens,
  clusterEventRange,
  topic,
  threshold,
  semanticTimeWindowMs,
}) => {
  const existingTokens = topic.tokens;
  if (existingTokens.size === 0) return null;
  if (!clusterEventRange || !topic.eventRange) return null;
  if (hasConflictingTemporalMarkers(existingTokens, clusterTokens)) return null;
  const timeGap = eventRangeGap(clusterEventRange, topic.eventRange);
  if (timeGap === null || timeGap > semanticTimeWindowMs) return null;

  const membersByIdentity = new Map();
  for (const member of members) {
    const group = membersByIdentity.get(member.fingerprint) || [];
    group.push(member);
    membersByIdentity.set(member.fingerprint, group);
  }

  const conservativeThreshold = Math.max(DEFAULT_SEMANTIC_MIN_SCORE, threshold);
  const identityScores = [];
  for (const identityMembers of membersByIdentity.values()) {
    let bestScore = 0;
    for (const member of identityMembers) {
      if (hasConflictingVersionIdentity(existingTokens, member.reconciliationTokens)) continue;
      if (!hasDistinctiveOverlap(existingTokens, member.reconciliationTokens)) continue;
      bestScore = Math.max(bestScore, diceSimilarity(existingTokens, member.reconciliationTokens));
    }
    if (bestScore < conservativeThreshold) return null;
    identityScores.push(bestScore);
  }
  return identityScores.length > 0
    ? { score: Math.min(...identityScores), timeGap }
    : null;
};

const compareDirectQuality = (left, right) => (
  right.overlapCount - left.overlapCount ||
  right.clusterCoverage - left.clusterCoverage ||
  right.existingCoverage - left.existingCoverage
);

const hasEqualDirectQuality = (left, right) => Boolean(
  left && right &&
  left.overlapCount === right.overlapCount &&
  left.clusterCoverage === right.clusterCoverage &&
  left.existingCoverage === right.existingCoverage
);

const assignDirectReconciliations = (clusters, topics, assignments, usedExisting) => {
  const nominations = [];
  const blockedSemanticClusters = new Set();
  clusters.forEach((cluster, clusterIndex) => {
    const matches = topics
      .map((topic) => {
        const overlapCount = cluster.evidenceKeys.filter((key) => topic.evidenceKeys.has(key)).length;
        return {
          clusterIndex,
          cluster,
          topic,
          overlapCount,
          clusterCoverage: overlapCount / Math.max(1, cluster.evidenceKeys.length),
          existingCoverage: overlapCount / Math.max(1, topic.evidenceKeys.size),
        };
      })
      .filter(({ overlapCount }) => overlapCount > 0)
      .sort((left, right) => (
        compareDirectQuality(left, right) ||
        (left.topic.fingerprint < right.topic.fingerprint ? -1 : left.topic.fingerprint > right.topic.fingerprint ? 1 : 0)
      ));

    if (matches.length === 0) return;
    blockedSemanticClusters.add(clusterIndex);
    if (hasEqualDirectQuality(matches[0], matches[1])) return;
    nominations.push(matches[0]);
  });

  const nominationsByExisting = new Map();
  for (const nomination of nominations) {
    const candidates = nominationsByExisting.get(nomination.topic.fingerprint) || [];
    candidates.push(nomination);
    nominationsByExisting.set(nomination.topic.fingerprint, candidates);
  }

  for (const [fingerprint, candidates] of nominationsByExisting) {
    const winner = [...candidates].sort((left, right) => (
      compareDirectQuality(left, right) ||
      (left.cluster.provisionalFingerprint < right.cluster.provisionalFingerprint ? -1 : 1)
    ))[0];
    assignments.set(winner.clusterIndex, { fingerprint, source: 'existing_evidence' });
    usedExisting.add(fingerprint);
  }

  return blockedSemanticClusters;
};

const assignSemanticReconciliations = (
  clusters,
  topics,
  assignments,
  usedExisting,
  blockedSemanticClusters,
  { threshold, semanticTimeWindowMs, semanticMinMargin }
) => {
  const nominations = [];
  clusters.forEach((cluster, clusterIndex) => {
    if (assignments.has(clusterIndex) || blockedSemanticClusters.has(clusterIndex)) return;
    const clusterEventRange = getClusterEventRange(cluster.members);
    const matches = topics
      .filter((topic) => !usedExisting.has(topic.fingerprint))
      .map((topic) => {
        const result = semanticMatchScore({
          members: cluster.members,
          clusterTokens: new Set(cluster.tokens),
          clusterEventRange,
          topic,
          threshold,
          semanticTimeWindowMs,
        });
        return result ? { clusterIndex, cluster, topic, ...result } : null;
      })
      .filter(Boolean)
      .sort((left, right) => (
        right.score - left.score ||
        left.timeGap - right.timeGap ||
        (left.topic.fingerprint < right.topic.fingerprint ? -1 : 1)
      ));

    if (matches.length === 0) return;
    if (matches.length > 1 && matches[0].score - matches[1].score < semanticMinMargin) return;
    nominations.push(matches[0]);
  });

  const nominationsByExisting = new Map();
  for (const nomination of nominations) {
    const candidates = nominationsByExisting.get(nomination.topic.fingerprint) || [];
    candidates.push(nomination);
    nominationsByExisting.set(nomination.topic.fingerprint, candidates);
  }

  for (const [fingerprint, candidates] of nominationsByExisting) {
    const winner = [...candidates].sort((left, right) => (
      right.score - left.score ||
      left.timeGap - right.timeGap ||
      (left.cluster.provisionalFingerprint < right.cluster.provisionalFingerprint ? -1 : 1)
    ))[0];
    assignments.set(winner.clusterIndex, { fingerprint, source: 'existing_semantic' });
    usedExisting.add(fingerprint);
  }
};

const reconcileClustersGlobally = (
  clusters,
  existingTopics,
  { threshold, semanticTimeWindowMs, semanticMinMargin }
) => {
  const topics = normalizeExistingTopics(existingTopics);
  const assignments = new Map();
  const usedExisting = new Set();

  const blockedSemanticClusters = assignDirectReconciliations(
    clusters,
    topics,
    assignments,
    usedExisting
  );
  assignSemanticReconciliations(
    clusters,
    topics,
    assignments,
    usedExisting,
    blockedSemanticClusters,
    { threshold, semanticTimeWindowMs, semanticMinMargin }
  );

  const usedFingerprints = new Set();
  return clusters.map((cluster, clusterIndex) => {
    const assignment = assignments.get(clusterIndex);
    let fingerprint = assignment?.fingerprint || cluster.provisionalFingerprint;
    let fingerprintSource = assignment?.source || 'provisional';
    if (usedFingerprints.has(fingerprint)) {
      fingerprint = cluster.provisionalFingerprint;
      fingerprintSource = 'provisional';
    }
    if (usedFingerprints.has(fingerprint)) {
      fingerprint = `topic:${hashText(`topic-unique\n${cluster.provisionalFingerprint}\n${cluster.evidenceSignature}`)}`;
    }
    usedFingerprints.add(fingerprint);
    return { ...cluster, fingerprint, fingerprintSource };
  });
};

/**
 * Forms deterministic topic clusters. Persisted `existingTopics` records use
 * `{ fingerprint, evidenceKeys, tokens, firstSeenAt, lastSeenAt }`. Direct
 * evidence reconciliation is globally one-to-one; semantic reconciliation
 * additionally requires complete-link token compatibility, comparable event
 * times inside `semanticTimeWindowMs`, and `semanticMinMargin` over runner-up
 * topics. Returned `fingerprint` is the reconciled identity, while
 * `provisionalFingerprint` is the deterministic current-run identity and
 * `fingerprintSource` is `existing_evidence`, `existing_semantic`, or
 * `provisional`. `evidenceSignature` changes with brief-affecting evidence.
 */
export const clusterTopicCandidates = (
  cards,
  {
    similarityThreshold = 0.58,
    existingTopics = [],
    semanticTimeWindowMs = DEFAULT_SEMANTIC_TIME_WINDOW_MS,
    semanticMinMargin = DEFAULT_SEMANTIC_MARGIN,
  } = {}
) => {
  const candidates = (Array.isArray(cards) ? cards : [])
    .map((card) => ({
      card,
      fingerprint: buildEvidenceFingerprint(card),
      normalizedUrl: normalizeEvidenceUrl(card?.sourceUrl || card?.source_url),
      tokens: new Set(tokenizeTopicText(card)),
      titleTokens: new Set(tokenizeTopicText({ title: card?.title, tags: card?.tags })),
      reconciliationTokens: new Set(tokenizeTopicText({
        title: card?.title,
        suggestedTitle: card?.suggestedTitle,
        summary: card?.summary,
        rawContent: card?.rawContent,
        raw_content: card?.raw_content,
        aiAnalysis: { summary: card?.aiAnalysis?.summary },
      })),
    }))
    .sort((left, right) => compareCards(left.card, right.card));

  const threshold = clampThreshold(similarityThreshold);
  const exactGroupsByFingerprint = new Map();
  for (const candidate of candidates) {
    const group = exactGroupsByFingerprint.get(candidate.fingerprint) || {
      fingerprint: candidate.fingerprint,
      members: [],
    };
    group.members.push(candidate);
    exactGroupsByFingerprint.set(candidate.fingerprint, group);
  }
  const identityGroups = [...exactGroupsByFingerprint.values()];

  const compatibility = identityGroups.map(() => new Map());
  for (let left = 0; left < identityGroups.length; left += 1) {
    for (let right = left + 1; right < identityGroups.length; right += 1) {
      const compatible = identityGroupsAreCompatible(identityGroups[left], identityGroups[right], threshold);
      compatibility[left].set(right, compatible);
      compatibility[right].set(left, compatible);
    }
  }

  const completeLinkGroups = [];
  identityGroups.forEach((identityGroup, identityIndex) => {
    const destination = completeLinkGroups.find((cluster) => (
      cluster.identityIndexes.every((existingIndex) => compatibility[identityIndex].get(existingIndex) === true)
    ));
    if (destination) {
      destination.identityIndexes.push(identityIndex);
      destination.members.push(...identityGroup.members);
    } else {
      completeLinkGroups.push({ identityIndexes: [identityIndex], members: [...identityGroup.members] });
    }
  });

  const clusterDrafts = completeLinkGroups
    .map(({ members }) => {
      const orderedMembers = [...members].sort((left, right) => compareCards(left.card, right.card));
      const evidence = orderedMembers.map(({ card }) => card);
      const representativeCard = evidence[0];
      const evidenceKeys = buildEvidenceKeys(orderedMembers);
      const tokens = buildClusterTokens(orderedMembers);
      const provisionalFingerprint = buildProvisionalFingerprint(evidenceKeys, tokens);
      return {
        provisionalFingerprint,
        evidenceSignature: buildEvidenceSignature(orderedMembers),
        evidenceKeys,
        tokens,
        title: String(representativeCard?.title || '').trim(),
        representativeCard,
        cards: evidence,
        evidence: [...evidence],
        members: orderedMembers,
      };
    })
    .sort((left, right) => compareCards(left.representativeCard, right.representativeCard));

  return reconcileClustersGlobally(clusterDrafts, existingTopics, {
    threshold,
    semanticTimeWindowMs: resolveNonNegativeOption(
      semanticTimeWindowMs,
      DEFAULT_SEMANTIC_TIME_WINDOW_MS
    ),
    semanticMinMargin: resolveNonNegativeOption(semanticMinMargin, DEFAULT_SEMANTIC_MARGIN),
  }).map(({ members, ...cluster }) => cluster);
};
