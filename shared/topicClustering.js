import { createHash } from 'node:crypto';

import {
  buildEvidenceFingerprint,
  isDistinctiveTopicToken,
  isVersionedProductToken,
  normalizeEvidenceUrl,
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
  const leftVersions = [...leftTokens].filter(isVersionedProductToken);
  const rightVersions = [...rightTokens].filter(isVersionedProductToken);
  if (leftVersions.length === 0 || rightVersions.length === 0) return false;
  return !leftVersions.some((token) => rightTokens.has(token));
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

const normalizeExistingTopics = (existingTopics) => {
  const byFingerprint = new Map();
  for (const topic of Array.isArray(existingTopics) ? existingTopics : []) {
    const fingerprint = String(topic?.fingerprint || '').trim();
    if (!fingerprint) continue;
    const normalized = byFingerprint.get(fingerprint) || {
      fingerprint,
      evidenceKeys: new Set(),
      tokens: new Set(),
    };
    for (const key of Array.isArray(topic?.evidenceKeys) ? topic.evidenceKeys : []) {
      const value = String(key || '').trim();
      if (value) normalized.evidenceKeys.add(value);
    }
    for (const token of Array.isArray(topic?.tokens) ? topic.tokens : []) {
      const value = String(token || '').normalize('NFKC').trim().toLowerCase();
      if (value) normalized.tokens.add(value);
    }
    byFingerprint.set(fingerprint, normalized);
  }
  return [...byFingerprint.values()].sort((left, right) => (
    left.fingerprint < right.fingerprint ? -1 : left.fingerprint > right.fingerprint ? 1 : 0
  ));
};

const uniqueHighestScore = (matches) => {
  if (matches.length === 0) return null;
  const ordered = [...matches].sort((left, right) => (
    right.score - left.score ||
    (left.topic.fingerprint < right.topic.fingerprint ? -1 : left.topic.fingerprint > right.topic.fingerprint ? 1 : 0)
  ));
  if (ordered.length > 1 && ordered[0].score === ordered[1].score) return null;
  return ordered[0];
};

const semanticMatchScore = (members, existingTokens, threshold) => {
  if (existingTokens.size === 0) return null;
  const membersByIdentity = new Map();
  for (const member of members) {
    const group = membersByIdentity.get(member.fingerprint) || [];
    group.push(member);
    membersByIdentity.set(member.fingerprint, group);
  }

  const conservativeThreshold = Math.max(0.72, threshold);
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
  return identityScores.length > 0 ? Math.min(...identityScores) : null;
};

const reconcileTopicFingerprint = ({ members, evidenceKeys, existingTopics, threshold }) => {
  const normalizedTopics = normalizeExistingTopics(existingTopics);
  const directMatches = normalizedTopics
    .map((topic) => ({
      topic,
      score: evidenceKeys.filter((key) => topic.evidenceKeys.has(key)).length,
    }))
    .filter(({ score }) => score > 0);

  if (directMatches.length > 0) {
    const direct = uniqueHighestScore(directMatches);
    return direct
      ? { fingerprint: direct.topic.fingerprint, source: 'existing_evidence' }
      : null;
  }

  const semanticMatches = normalizedTopics
    .map((topic) => ({ topic, score: semanticMatchScore(members, topic.tokens, threshold) }))
    .filter(({ score }) => score !== null);
  const semantic = uniqueHighestScore(semanticMatches);
  return semantic
    ? { fingerprint: semantic.topic.fingerprint, source: 'existing_semantic' }
    : null;
};

export const clusterTopicCandidates = (
  cards,
  { similarityThreshold = 0.58, existingTopics = [] } = {}
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

  return completeLinkGroups
    .map(({ members }) => {
      const orderedMembers = [...members].sort((left, right) => compareCards(left.card, right.card));
      const evidence = orderedMembers.map(({ card }) => card);
      const representativeCard = evidence[0];
      const evidenceKeys = buildEvidenceKeys(orderedMembers);
      const tokens = buildClusterTokens(orderedMembers);
      const provisionalFingerprint = buildProvisionalFingerprint(evidenceKeys, tokens);
      const reconciled = reconcileTopicFingerprint({
        members: orderedMembers,
        evidenceKeys,
        existingTopics,
        threshold,
      });
      return {
        fingerprint: reconciled?.fingerprint || provisionalFingerprint,
        provisionalFingerprint,
        fingerprintSource: reconciled?.source || 'provisional',
        evidenceSignature: buildEvidenceSignature(orderedMembers),
        evidenceKeys,
        tokens,
        title: String(representativeCard?.title || '').trim(),
        representativeCard,
        cards: evidence,
        evidence: [...evidence],
      };
    })
    .sort((left, right) => compareCards(left.representativeCard, right.representativeCard));
};
