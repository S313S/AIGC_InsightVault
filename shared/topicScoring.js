const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const LANE_WINDOWS = Object.freeze({
  breaking: DAY_MS,
  write: 3 * DAY_MS,
  study: 30 * DAY_MS,
});

const CARD_TIME_FIELDS = [
  'publishedAt',
  'published_at',
  'publishTime',
  'publish_time',
  'date',
  'createdAt',
  'created_at',
];

const BREAKING_PATTERNS = [
  /\b(?:launch(?:ed)?|release[ds]?|announc(?:e|ed|ement)|roll(?:ed)?\s*out|new\s+(?:model|api|feature)|api\s+update)\b/iu,
  /(?:正式发布|发布|上线|推出|官宣|开源|重大更新|新版|更新)/u,
];
const HANDS_ON_PATTERNS = [
  /\b(?:hands[- ]on|demo|benchmark(?:s|ed)?|tested?|experiment)\b/iu,
  /(?:实测|演示|测评|测试|跑分|基准)/u,
];
const ANALYSIS_PATTERNS = [
  /\b(?:analysis|comparison|versus|vs\.?|trade-?offs?|why|impact|architecture)\b/iu,
  /(?:分析|对比|争议|影响|原因|观点|架构|取舍)/u,
];
const PRACTICAL_SIGNAL_PATTERNS = Object.freeze({
  tutorial: /\b(?:tutorial|guide|how\s+to|walkthrough)\b|(?:教程|指南|教学)/iu,
  code: /\b(?:code|coding|script|snippet|implementation)\b|(?:代码|编程|实现)/iu,
  steps: /\b(?:step(?:s)?|checklist|migration)\b|(?:步骤|清单|迁移)/iu,
  benchmark: /\bbenchmark(?:s|ed)?\b|(?:基准|跑分|对比测试)/iu,
  caseStudy: /\b(?:case\s+study|practice|practical|production)\b|(?:案例|实践|实战|真实项目)/iu,
  repository: /\b(?:github|repo(?:sitory)?|open\s+source)\b|(?:仓库|开源)/iu,
  workflow: /\bworkflow\b|(?:工作流|流程)/iu,
});
const LOW_VALUE_PATTERNS = [
  /\b(?:meme|giveaway|celebrity|funny)\b/iu,
  /(?:搞笑|爆笑|哈哈|娱乐|表情包|围观|抽奖|吃瓜)/u,
];

const clamp = (value, minimum = 0, maximum = 100) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return minimum;
  return Math.min(maximum, Math.max(minimum, numeric));
};

const roundScore = (value) => Math.round(clamp(value) * 100) / 100;

const asArray = (value) => Array.isArray(value) ? value : [];

const normalizeText = (value) => String(value ?? '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/\s+/gu, ' ')
  .trim();

const cardsForCluster = (cluster) => {
  const values = asArray(cluster?.evidence).length > 0
    ? cluster.evidence
    : asArray(cluster?.cards).length > 0
      ? cluster.cards
      : cluster?.representativeCard
        ? [cluster.representativeCard]
        : [];
  return values.filter((card) => card && typeof card === 'object');
};

const cardText = (card) => [
  card?.title,
  card?.rawContent,
  card?.raw_content,
  card?.summary,
  card?.suggestedTitle,
  card?.aiAnalysis?.summary,
  ...asArray(card?.tags),
  ...asArray(card?.aiAnalysis?.usageScenarios),
  ...asArray(card?.aiAnalysis?.coreKnowledge),
  ...asArray(card?.aiAnalysis?.toolTags),
].map(normalizeText).filter(Boolean).join(' ');

const clusterText = (cluster, cards) => [
  cluster?.title,
  cluster?.summary,
  cluster?.whyNow,
  ...asArray(cluster?.tokens),
  ...cards.map(cardText),
].map(normalizeText).filter(Boolean).join(' ');

const matchesAny = (text, patterns) => patterns.some((pattern) => pattern.test(text));

const validCalendarDate = (year, month, day) => (
  Number.isInteger(year) &&
  Number.isInteger(month) &&
  Number.isInteger(day) &&
  month >= 1 &&
  month <= 12 &&
  day >= 1 &&
  day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
);

const parseAbsoluteTime = (value) => {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const timestamp = Math.abs(value) < 1e12 ? value * 1000 : value;
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const calendar = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/u.exec(trimmed);
  if (!calendar) return null;
  const year = Number(calendar[1]);
  const month = Number(calendar[2]);
  const day = Number(calendar[3]);
  if (!validCalendarDate(year, month, day)) return null;
  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const shortDateContext = (now, originalNow) => {
  if (typeof originalNow === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})T.*?(Z|[+-]\d{2}:?\d{2})$/iu.exec(originalNow.trim());
    if (match) {
      return {
        year: Number(match[1]),
        suffix: match[4].toUpperCase() === 'Z' ? 'Z' : match[4],
      };
    }
  }
  return { year: new Date(now).getUTCFullYear(), suffix: 'Z' };
};

const parseShortDate = (month, day, now, originalNow) => {
  const context = shortDateContext(now, originalNow);
  let year = context.year;
  if (!validCalendarDate(year, month, day)) return null;
  const suffix = context.suffix;
  const build = (candidateYear) => Date.parse(
    `${candidateYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00${suffix}`
  );
  let timestamp = build(year);
  if (!Number.isFinite(timestamp)) return null;
  if (timestamp > now) {
    year -= 1;
    if (!validCalendarDate(year, month, day)) return null;
    timestamp = build(year);
  }
  return Number.isFinite(timestamp) ? timestamp : null;
};

const parsePublicationTime = (value, now, originalNow) => {
  const absolute = parseAbsoluteTime(value);
  if (absolute !== null) return absolute;
  if (typeof value !== 'string') return null;
  const text = value.normalize('NFKC').trim().toLowerCase();
  if (!text) return null;
  if (text === '刚刚' || text === '刚才' || text === 'just now') return now;

  const relative = /^(\d+(?:\.\d+)?)\s*(分钟|小时|天)前$/u.exec(text);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2];
    const multiplier = unit === '分钟' ? 60 * 1000 : unit === '小时' ? HOUR_MS : DAY_MS;
    return now - amount * multiplier;
  }

  const short = /^(\d{1,2})-(\d{1,2})$/u.exec(text);
  if (short) return parseShortDate(Number(short[1]), Number(short[2]), now, originalNow);
  const chinese = /^(\d{1,2})月(\d{1,2})日$/u.exec(text);
  if (chinese) return parseShortDate(Number(chinese[1]), Number(chinese[2]), now, originalNow);
  return null;
};

const resolveNow = (value) => {
  if (value === undefined) return Date.now();
  const parsed = parseAbsoluteTime(value);
  if (parsed === null) throw new TypeError('scoreTopicCluster requires a valid `now` value');
  return parsed;
};

const readCardTime = (card, now, originalNow) => {
  for (const field of CARD_TIME_FIELDS) {
    const parsed = parsePublicationTime(card?.[field], now, originalNow);
    if (parsed !== null) return parsed;
  }
  return null;
};

const engagementTotal = (card) => {
  const metrics = card?.metrics || {};
  return ['likes', 'bookmarks', 'comments', 'shares', 'retweets', 'reposts']
    .reduce((total, key) => total + Math.max(0, Number(metrics[key]) || 0), 0);
};

const findBaseline = (sourceBaselines, card) => {
  if (!sourceBaselines || typeof sourceBaselines !== 'object') return null;
  const keys = [card?.platform, card?.source, card?.sourceName, card?.source_type, card?.sourceType]
    .map(normalizeText)
    .filter(Boolean);
  for (const [baselineKey, baseline] of Object.entries(sourceBaselines)) {
    if (keys.includes(normalizeText(baselineKey))) return baseline;
  }
  return null;
};

const percentile = (value, samples) => {
  const numericSamples = asArray(samples)
    .map(Number)
    .filter((sample) => Number.isFinite(sample) && sample >= 0)
    .sort((left, right) => left - right);
  if (numericSamples.length === 0) return null;
  const lower = numericSamples.filter((sample) => sample < value).length;
  const equal = numericSamples.filter((sample) => sample === value).length;
  return clamp(((lower + equal * 0.5) / numericSamples.length) * 100);
};

const cardEngagementPercentile = (card, sourceBaselines) => {
  const baseline = findBaseline(sourceBaselines, card);
  if (baseline === null) return 35;
  if (Array.isArray(baseline)) return percentile(engagementTotal(card), baseline) ?? 35;
  if (typeof baseline !== 'object') return 35;

  const totalSamples = baseline.engagement || baseline.total || baseline.values;
  const totalPercentile = percentile(engagementTotal(card), totalSamples);
  if (totalPercentile !== null) return totalPercentile;

  const metricPercentiles = ['likes', 'bookmarks', 'comments', 'shares']
    .map((key) => percentile(Math.max(0, Number(card?.metrics?.[key]) || 0), baseline[key]))
    .filter((value) => value !== null);
  if (metricPercentiles.length === 0) return 35;
  return metricPercentiles.reduce((sum, value) => sum + value, 0) / metricPercentiles.length;
};

const averageEngagementPercentile = (cards, sourceBaselines) => {
  if (cards.length === 0) return 35;
  return cards.reduce(
    (sum, card) => sum + cardEngagementPercentile(card, sourceBaselines),
    0
  ) / cards.length;
};

const normalizedSourceType = (card) => normalizeText(
  card?.sourceType || card?.source_type || card?.evidenceRole || card?.evidence_role
);

const isOfficialEvidence = (card) => (
  /\b(?:official|first.party|company.blog|changelog)\b/u.test(normalizedSourceType(card)) ||
  /(?:官方|一手)/u.test(normalizedSourceType(card))
);

const isRepositoryEvidence = (card) => {
  const sourceType = normalizedSourceType(card);
  const url = normalizeText(card?.sourceUrl || card?.source_url);
  return /\b(?:repository|repo|github|gitlab)\b/u.test(sourceType) ||
    /https?:\/\/(?:www\.)?(?:github|gitlab)\.com\//u.test(url);
};

const collectionSizeScore = (count) => Math.min(15, Math.max(0, count - 1) * 5);

const platformCount = (cards) => new Set(
  cards.map((card) => normalizeText(card?.platform || card?.source)).filter(Boolean)
).size;

const practicalSignals = (text) => Object.fromEntries(
  Object.entries(PRACTICAL_SIGNAL_PATTERNS).map(([key, pattern]) => [key, pattern.test(text)])
);

const scorePreference = (cluster, cards, text, preferenceSignals) => {
  if (!preferenceSignals || typeof preferenceSignals !== 'object') return 50;
  let score = 50;
  const topicKey = normalizeText(cluster?.id || cluster?.fingerprint);
  const tags = new Set(cards.flatMap((card) => asArray(card?.tags).map(normalizeText)).filter(Boolean));

  const applySignals = (signals, matcher) => {
    if (Array.isArray(signals)) {
      for (const signal of signals) {
        if (matcher(normalizeText(signal))) score += 10;
      }
      return;
    }
    if (!signals || typeof signals !== 'object') return;
    for (const [signal, weight] of Object.entries(signals)) {
      if (matcher(normalizeText(signal))) score += Number.isFinite(Number(weight)) ? Number(weight) : 0;
    }
  };

  applySignals(preferenceSignals.topics || preferenceSignals.topicIds, (signal) => signal === topicKey);
  applySignals(preferenceSignals.keywords, (signal) => Boolean(signal) && text.includes(signal));
  applySignals(preferenceSignals.tags, (signal) => tags.has(signal));
  return roundScore(score);
};

/**
 * Scores one deterministic Task 5 cluster. Relative engagement comes only
 * from same-source baselines. Unknown baselines get a conservative neutral-low
 * percentile instead of falling back to absolute likes or follower counts.
 */
export const scoreTopicCluster = (
  cluster,
  { now, sourceBaselines = {}, preferenceSignals = {} } = {}
) => {
  const nowTimestamp = resolveNow(now);
  const cards = cardsForCluster(cluster);
  const text = clusterText(cluster, cards);
  const latestPublishedAt = cards
    .map((card) => readCardTime(card, nowTimestamp, now))
    .filter((timestamp) => timestamp !== null && timestamp <= nowTimestamp)
    .sort((left, right) => right - left)[0] ?? null;
  const age = latestPublishedAt === null ? null : nowTimestamp - latestPublishedAt;
  const platforms = platformCount(cards);
  const engagement = averageEngagementPercentile(cards, sourceBaselines);
  const breakingSignal = matchesAny(text, BREAKING_PATTERNS);
  const handsOnSignal = matchesAny(text, HANDS_ON_PATTERNS);
  const analysisSignal = matchesAny(text, ANALYSIS_PATTERNS);
  const practical = practicalSignals(text);
  const practicalCount = Object.values(practical).filter(Boolean).length;
  const lowValue = matchesAny(text, LOW_VALUE_PATTERNS);
  const officialCount = cards.filter(isOfficialEvidence).length;
  const repositoryCount = cards.filter(isRepositoryEvidence).length;
  const hasSubstantiveEvidence = analysisSignal ||
    practicalCount > 0 ||
    officialCount > 0 ||
    repositoryCount > 0;

  let writeScore = 15 + collectionSizeScore(cards.length) + engagement * 0.12;
  if (breakingSignal) writeScore += 20;
  if (handsOnSignal) writeScore += 15;
  if (analysisSignal) writeScore += 20;
  if (practicalCount >= 2) writeScore += 15;
  if (platforms >= 2) writeScore += 10;

  let studyScore = 10 + engagement * 0.06;
  if (practical.tutorial) studyScore += 18;
  if (practical.code) studyScore += 18;
  if (practical.steps) studyScore += 15;
  if (practical.benchmark) studyScore += 15;
  if (practical.caseStudy) studyScore += 15;
  if (practical.repository) studyScore += 10;
  if (practical.workflow) studyScore += 10;
  if (text.length >= 240) studyScore += 8;

  // Broad launch/hands-on wording also appears in memes and reaction posts. It
  // cannot override the low-value cap without reusable or first-party evidence.
  if (lowValue && !hasSubstantiveEvidence) {
    writeScore = Math.min(writeScore, 25);
    studyScore = Math.min(studyScore, 15);
  }

  let breakingScore = 0;
  if (age !== null && age >= 0 && age <= LANE_WINDOWS.breaking) {
    const recency = (1 - age / LANE_WINDOWS.breaking) * 15;
    breakingScore = 20 + engagement * 0.2 + recency;
    if (breakingSignal) breakingScore += 30;
    if (handsOnSignal) breakingScore += 15;
    if (platforms >= 2) breakingScore += 15;
    if (lowValue && !hasSubstantiveEvidence) breakingScore = Math.min(breakingScore, 35);
  }

  let confidenceScore = 25 + collectionSizeScore(cards.length);
  if (platforms >= 2) confidenceScore += 15;
  if (officialCount > 0) confidenceScore += 30;
  if (repositoryCount > 0) confidenceScore += 25;
  if (officialCount > 0 && repositoryCount > 0) confidenceScore += 5;

  writeScore = roundScore(writeScore);
  studyScore = roundScore(studyScore);
  breakingScore = roundScore(breakingScore);
  confidenceScore = roundScore(confidenceScore);
  const preferenceScore = scorePreference(cluster, cards, text, preferenceSignals);
  const opportunityScore = roundScore(
    0.35 * writeScore +
    0.25 * studyScore +
    0.20 * breakingScore +
    0.10 * confidenceScore +
    0.10 * preferenceScore
  );

  return {
    ...cluster,
    writeScore,
    studyScore,
    breakingScore,
    confidenceScore,
    preferenceScore,
    opportunityScore,
    latestPublishedAt: latestPublishedAt === null ? null : new Date(latestPublishedAt).toISOString(),
    laneEligibility: {
      write: age !== null && age >= 0 && age <= LANE_WINDOWS.write && writeScore >= 50,
      study: age !== null && age >= 0 && age <= LANE_WINDOWS.study && studyScore >= 55,
      breaking: age !== null && age >= 0 && age <= LANE_WINDOWS.breaking && breakingScore >= 60,
    },
  };
};

const topicKey = (topic) => normalizeText(topic?.fingerprint || topic?.id);

const topicIdentityKeys = (topic) => [
  normalizeText(topic?.id) ? `id:${normalizeText(topic.id)}` : '',
  normalizeText(topic?.fingerprint) ? `fingerprint:${normalizeText(topic.fingerprint)}` : '',
].filter(Boolean);

const hasNegativeFeedback = (topic) => {
  if (topic?.ignored === true) return true;
  const direct = normalizeText(topic?.feedbackAction || topic?.feedback_action || topic?.preferenceAction);
  if (direct === 'ignored' || direct === 'negative') return true;
  return asArray(topic?.feedback).some((feedback) => {
    const action = typeof feedback === 'string'
      ? normalizeText(feedback)
      : normalizeText(feedback?.action || feedback?.feedbackAction || feedback?.feedback_action);
    return action === 'ignored' || action === 'negative';
  });
};

const readScore = (topic, key) => clamp(topic?.[key]);

const selectLane = (topics, lane, scoreKey, limit) => {
  if (limit <= 0) return [];
  const ordered = topics
    .filter((topic) => topic?.laneEligibility?.[lane] === true && !hasNegativeFeedback(topic))
    .sort((left, right) => (
      readScore(right, scoreKey) - readScore(left, scoreKey) ||
      readScore(right, 'opportunityScore') - readScore(left, 'opportunityScore') ||
      topicKey(left).localeCompare(topicKey(right), 'en') ||
      normalizeText(left?.id).localeCompare(normalizeText(right?.id), 'en')
    ));
  const selected = [];
  const seen = new Set();
  for (const topic of ordered) {
    const keys = topicIdentityKeys(topic);
    if (keys.length === 0) continue;
    const duplicate = keys.some((key) => seen.has(key));
    for (const key of keys) seen.add(key);
    if (duplicate) continue;
    selected.push(topic);
    if (selected.length >= limit) break;
  }
  return selected;
};

/**
 * Feedback compatibility contract: a topic is excluded when `ignored` is
 * true, when `feedbackAction` is `ignored`/`negative`, or when `feedback`
 * contains that string or an object with the same `action` value.
 */
export const selectTopicLanes = (
  topics,
  { writeLimit = 5, studyLimit = 5, breakingLimit = 3 } = {}
) => {
  const values = asArray(topics).filter((topic) => topic && typeof topic === 'object');
  return {
    write: selectLane(values, 'write', 'writeScore', Math.max(0, Math.trunc(Number(writeLimit) || 0))),
    study: selectLane(values, 'study', 'studyScore', Math.max(0, Math.trunc(Number(studyLimit) || 0))),
    breaking: selectLane(values, 'breaking', 'breakingScore', Math.max(0, Math.trunc(Number(breakingLimit) || 0))),
  };
};
