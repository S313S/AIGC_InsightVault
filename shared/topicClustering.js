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

const hashText = (value) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const buildClusterFingerprint = (members) => {
  const identities = [...new Set(members.map(({ fingerprint }) => fingerprint))].sort();
  return `topic:${hashText(identities.join('\n'))}`;
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

  const parent = candidates.map((_, index) => index);
  const find = (index) => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
  };

  const firstByFingerprint = new Map();
  candidates.forEach((candidate, index) => {
    const previous = firstByFingerprint.get(candidate.fingerprint);
    if (previous === undefined) firstByFingerprint.set(candidate.fingerprint, index);
    else union(previous, index);
  });

  const threshold = clampThreshold(similarityThreshold);
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      const a = candidates[left];
      const b = candidates[right];
      if (a.fingerprint === b.fingerprint) continue;
      if (hasConflictingResourceQuery(a.normalizedUrl, b.normalizedUrl)) continue;
      if (!hasDistinctiveOverlap(a.tokens, b.tokens)) continue;
      const similarity = Math.max(
        diceSimilarity(a.titleTokens, b.titleTokens),
        diceSimilarity(a.tokens, b.tokens)
      );
      if (similarity >= threshold) union(left, right);
    }
  }

  const groups = new Map();
  candidates.forEach((candidate, index) => {
    const root = find(index);
    const group = groups.get(root) || [];
    group.push(candidate);
    groups.set(root, group);
  });

  return [...groups.values()]
    .map((members) => {
      const orderedMembers = [...members].sort((left, right) => compareCards(left.card, right.card));
      const evidence = orderedMembers.map(({ card }) => card);
      const representativeCard = evidence[0];
      return {
        fingerprint: buildClusterFingerprint(orderedMembers),
        title: String(representativeCard?.title || '').trim(),
        representativeCard,
        cards: evidence,
        evidence: [...evidence],
      };
    })
    .sort((left, right) => compareCards(left.representativeCard, right.representativeCard));
};
