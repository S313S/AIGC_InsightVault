import { createHash } from 'node:crypto';

import {
  buildEvidenceFingerprint,
  isDistinctiveTopicToken,
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

const VERSION_TOKEN_PATTERN = /^(?:gpt|gemini|claude)_\d/u;

const hasConflictingVersionIdentity = (leftTokens, rightTokens) => {
  const leftVersions = [...leftTokens].filter((token) => VERSION_TOKEN_PATTERN.test(token));
  const rightVersions = [...rightTokens].filter((token) => VERSION_TOKEN_PATTERN.test(token));
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

const PUBLICATION_FIELDS = [
  'publishedAt',
  'published_at',
  'publishTime',
  'publish_time',
  'date',
  'createdAt',
  'created_at',
];

const parsePublicationTime = (card) => {
  for (const field of PUBLICATION_FIELDS) {
    const value = card?.[field];
    if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
    if (typeof value === 'number' && Number.isFinite(value)) {
      const milliseconds = Math.abs(value) < 1e12 ? value * 1000 : value;
      if (Number.isFinite(new Date(milliseconds).getTime())) return milliseconds;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
};

const compareAnchorCandidates = (left, right) => {
  const leftTime = parsePublicationTime(left.card);
  const rightTime = parsePublicationTime(right.card);
  if (leftTime !== null && rightTime !== null && leftTime !== rightTime) return leftTime - rightTime;
  if (leftTime !== null && rightTime === null) return -1;
  if (leftTime === null && rightTime !== null) return 1;
  return compareCards(left.card, right.card);
};

const buildTopicFingerprint = (members) => {
  const anchor = [...members].sort(compareAnchorCandidates)[0];
  return `topic:${hashText(`topic-anchor\n${anchor.fingerprint}`)}`;
};

const buildEvidenceSignature = (members) => {
  const evidenceKeys = members.map(({ card }) => stableCardKey(card)).sort();
  return `evidence:${hashText(evidenceKeys.join('\n'))}`;
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

export const clusterTopicCandidates = (cards, { similarityThreshold = 0.58 } = {}) => {
  const candidates = (Array.isArray(cards) ? cards : [])
    .map((card) => ({
      card,
      fingerprint: buildEvidenceFingerprint(card),
      normalizedUrl: normalizeEvidenceUrl(card?.sourceUrl || card?.source_url),
      tokens: new Set(tokenizeTopicText(card)),
      titleTokens: new Set(tokenizeTopicText({ title: card?.title, tags: card?.tags })),
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
      const anchor = [...orderedMembers].sort(compareAnchorCandidates)[0];
      const representativeCard = anchor.card;
      return {
        fingerprint: buildTopicFingerprint(orderedMembers),
        evidenceSignature: buildEvidenceSignature(orderedMembers),
        title: String(representativeCard?.title || '').trim(),
        representativeCard,
        cards: evidence,
        evidence: [...evidence],
      };
    })
    .sort((left, right) => compareCards(left.representativeCard, right.representativeCard));
};
