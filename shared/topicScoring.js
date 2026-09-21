import { normalizeEvidenceUrl } from './topicNormalization.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const LANE_WINDOWS = Object.freeze({
  breaking: DAY_MS,
  write: 3 * DAY_MS,
  study: 30 * DAY_MS,
});

// Only publisher-originated timestamps establish editorial recency. Database
// creation and collection timestamps belong exclusively to observation merge.
const CARD_TIME_FIELDS = [
  'publishedAt',
  'published_at',
  'publishTime',
  'publish_time',
  'date',
];

const OBSERVATION_TIME_FIELDS = [
  'collectedAt',
  'collected_at',
  'fetchedAt',
  'fetched_at',
  'observedAt',
  'observed_at',
  'createdAt',
  'created_at',
];

const RELEASE_ACTION_PATTERNS = [
  /\b(?:launch(?:es|ed)?|releas(?:e|es|ed)|introduc(?:es|ed|ing)|announc(?:e|es|ed|ing)|unveil(?:s|ed))\b|\b(?:is\s+)?now\s+available\b/iu,
  /(?:正式发布|现已发布|宣布发布|正式推出|现已推出|宣布推出|现已上线|开放使用|现已可用|正式开放)/u,
];
const BREAKING_PATTERNS = [
  ...RELEASE_ACTION_PATTERNS,
  /\b(?:roll(?:ed)?\s*out|new\s+(?:model|api|feature)|api\s+update)\b/iu,
  /(?:发布|上线|推出|官宣|开源|重大更新|新版|更新)/u,
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

const rawCardsForCluster = (cluster) => {
  const values = asArray(cluster?.evidence).length > 0
    ? cluster.evidence
    : asArray(cluster?.cards).length > 0
      ? cluster.cards
      : cluster?.representativeCard
        ? [cluster.representativeCard]
        : [];
  return values.filter((card) => card && typeof card === 'object');
};

const evidenceIdentity = (card) => {
  const explicit = card?.evidenceKey || card?.evidence_key || card?.normalizedUrl || card?.normalized_url;
  if (normalizeText(explicit)) return `evidence:${normalizeText(explicit)}`;
  const sourceUrl = normalizeText(normalizeEvidenceUrl(card?.sourceUrl || card?.source_url));
  if (sourceUrl) return `url:${sourceUrl}`;
  const id = normalizeText(card?.id || card?.cardId || card?.card_id);
  if (id) return `id:${id}`;
  return `fallback:${[
    card?.platform,
    card?.author || card?.account || card?.handle,
    card?.title,
  ].map(normalizeText).join('\u0000')}`;
};

const stableObservationKey = (card) => [
  evidenceIdentity(card),
  normalizeText(card?.platform),
  normalizeText(card?.author || card?.account || card?.handle),
  normalizeText(card?.title),
  normalizeText(card?.rawContent || card?.raw_content),
  normalizeText(card?.summary),
  normalizeText(card?.suggestedTitle),
  normalizeText(card?.aiAnalysis?.summary),
  asArray(card?.tags).map(normalizeText).sort().join(','),
  asArray(card?.aiAnalysis?.usageScenarios).map(normalizeText).sort().join(','),
  asArray(card?.aiAnalysis?.coreKnowledge).map(normalizeText).sort().join(','),
  normalizeText(card?.sourceType || card?.source_type || card?.evidenceRole || card?.evidence_role),
  CARD_TIME_FIELDS.map((field) => normalizeText(card?.[field])).join(','),
  ['likes', 'bookmarks', 'comments', 'shares', 'retweets', 'reposts']
    .map((field) => String(Number(card?.metrics?.[field]) || 0)).join(','),
].join('\u0000');

const informationCompleteness = (card) => [
  card?.title,
  card?.rawContent,
  card?.raw_content,
  card?.summary,
  card?.suggestedTitle,
  card?.aiAnalysis?.summary,
  ...asArray(card?.tags),
  ...asArray(card?.aiAnalysis?.usageScenarios),
  ...asArray(card?.aiAnalysis?.coreKnowledge),
].map(normalizeText).reduce((total, value) => total + value.length, 0);

const metricMaximums = (cards) => {
  const merged = {};
  for (const card of cards) {
    for (const [key, value] of Object.entries(card?.metrics || {})) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0) continue;
      merged[key] = Math.max(merged[key] ?? 0, numeric);
    }
  }
  return merged;
};

const readObservationTime = (card, now, timezoneOffsetMinutes) => {
  for (const field of OBSERVATION_TIME_FIELDS) {
    const parsed = parseAbsoluteTime(card?.[field], timezoneOffsetMinutes);
    if (parsed !== null && parsed <= now) return parsed;
  }
  return null;
};

const mergeEvidenceObservations = (values, now, timezoneOffsetMinutes) => {
  const richest = [...values].sort((left, right) => (
    informationCompleteness(right) - informationCompleteness(left) ||
    (stableObservationKey(left) < stableObservationKey(right) ? -1 : stableObservationKey(left) > stableObservationKey(right) ? 1 : 0)
  ))[0];
  const latest = values
    .map((card) => ({ card, timestamp: readCardTime(card, now, timezoneOffsetMinutes) }))
    .filter(({ timestamp }) => timestamp !== null && timestamp <= now)
    .sort((left, right) => {
      if (right.timestamp !== left.timestamp) return right.timestamp - left.timestamp;
      const leftKey = stableObservationKey(left.card);
      const rightKey = stableObservationKey(right.card);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    })[0] || null;
  const observed = values
    .map((card) => ({ card, timestamp: readObservationTime(card, now, timezoneOffsetMinutes) }))
    .filter(({ timestamp }) => timestamp !== null)
    .sort((left, right) => right.timestamp - left.timestamp);
  const latestObservedAt = observed[0]?.timestamp ?? null;
  const metricCards = latestObservedAt === null
    ? values
    : observed.filter(({ timestamp }) => timestamp === latestObservedAt).map(({ card }) => card);
  const merged = {
    ...richest,
    // Social counters are monotonic within a snapshot. Without an observation
    // timestamp, merge each counter by max; with one, only the latest observed
    // snapshot participates (ties still merge per counter deterministically).
    metrics: metricMaximums(metricCards),
  };
  for (const field of CARD_TIME_FIELDS) delete merged[field];
  if (latest) merged.publishedAt = new Date(latest.timestamp).toISOString();
  return merged;
};

const cardsForCluster = (cluster, now, timezoneOffsetMinutes) => {
  const groups = new Map();
  for (const card of rawCardsForCluster(cluster)) {
    const key = evidenceIdentity(card);
    const values = groups.get(key) || [];
    values.push(card);
    groups.set(key, values);
  }
  let representatives = [...groups.values()]
    .map((values) => mergeEvidenceObservations(values, now, timezoneOffsetMinutes))
    .sort((left, right) => (
      stableObservationKey(left) < stableObservationKey(right) ? -1 : stableObservationKey(left) > stableObservationKey(right) ? 1 : 0
    ));

  // Task 5 evidenceKeys are the authoritative distinct-identity count. When
  // legacy/raw card arrays do not map one-to-one, cap to that count and choose
  // deterministic representatives instead of inventing extra reach.
  const evidenceKeyCount = new Set(
    asArray(cluster?.evidenceKeys).map(normalizeText).filter(Boolean)
  ).size;
  if (evidenceKeyCount > 0 && representatives.length > evidenceKeyCount) {
    representatives = representatives.slice(0, evidenceKeyCount);
  }
  return representatives;
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

const normalizeTimezoneOffset = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < -14 * 60 || numeric > 14 * 60) return null;
  return Math.trunc(numeric);
};

const offsetFromNowValue = (value) => {
  if (typeof value !== 'string') return null;
  const suffix = /(Z|[+-]\d{2}:?\d{2})$/iu.exec(value.trim())?.[1];
  if (!suffix) return null;
  if (suffix.toUpperCase() === 'Z') return 0;
  const sign = suffix.startsWith('-') ? -1 : 1;
  const digits = suffix.slice(1).replace(':', '');
  return sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
};

const resolveTimezoneOffset = (value, nowValue) => {
  if (value !== undefined) {
    const explicit = normalizeTimezoneOffset(value);
    if (explicit === null) throw new TypeError('timezoneOffsetMinutes must be between -840 and 840');
    return explicit;
  }
  return offsetFromNowValue(nowValue) ?? 0;
};

const formatTimezoneOffset = (minutes) => {
  if (minutes === 0) return 'Z';
  const absolute = Math.abs(minutes);
  const sign = minutes < 0 ? '-' : '+';
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
};

const parseAbsoluteTime = (value, timezoneOffsetMinutes = 0) => {
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
  const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/iu.test(trimmed);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/u.test(trimmed);
  const unzonedDateTime = /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/u.test(trimmed);
  if (!hasTimezone && !dateOnly && !unzonedDateTime) return null;
  const explicit = hasTimezone
    ? trimmed
    : `${dateOnly ? `${trimmed}T00:00:00` : trimmed.replace(' ', 'T')}${formatTimezoneOffset(timezoneOffsetMinutes)}`;
  const timestamp = Date.parse(explicit);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const parseShortDate = (month, day, now, timezoneOffsetMinutes) => {
  const shiftedNow = new Date(now + timezoneOffsetMinutes * 60 * 1000);
  let year = shiftedNow.getUTCFullYear();
  if (!validCalendarDate(year, month, day)) return null;
  const build = (candidateYear) => (
    Date.UTC(candidateYear, month - 1, day) - timezoneOffsetMinutes * 60 * 1000
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

const parsePublicationTime = (value, now, timezoneOffsetMinutes) => {
  const absolute = parseAbsoluteTime(value, timezoneOffsetMinutes);
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
  if (short) return parseShortDate(Number(short[1]), Number(short[2]), now, timezoneOffsetMinutes);
  const chinese = /^(\d{1,2})月(\d{1,2})日$/u.exec(text);
  if (chinese) return parseShortDate(Number(chinese[1]), Number(chinese[2]), now, timezoneOffsetMinutes);
  return null;
};

const resolveNow = (value, timezoneOffsetMinutes) => {
  if (value === undefined) return Date.now();
  const parsed = parseAbsoluteTime(value, timezoneOffsetMinutes);
  if (parsed === null) throw new TypeError('scoreTopicCluster requires a valid `now` value');
  return parsed;
};

const readCardTime = (card, now, timezoneOffsetMinutes) => {
  for (const field of CARD_TIME_FIELDS) {
    const parsed = parsePublicationTime(card?.[field], now, timezoneOffsetMinutes);
    if (parsed !== null) return parsed;
  }
  return null;
};

const engagementTotal = (card) => {
  const metrics = card?.metrics || {};
  return ['likes', 'bookmarks', 'comments', 'shares', 'retweets', 'reposts']
    .reduce((total, key) => total + Math.max(0, Number(metrics[key]) || 0), 0);
};

const accountIdentities = (card) => [...new Set([
  card?.accountId,
  card?.account_id,
  card?.account,
  card?.handle,
  card?.username,
  card?.userName,
  card?.user_name,
  card?.author,
].map(normalizeText).map((value) => value.replace(/^@+/u, '')).filter(Boolean))];

const findEntry = (record, wanted) => {
  if (!record || typeof record !== 'object' || !wanted) return null;
  for (const [key, value] of Object.entries(record)) {
    if (normalizeText(key).replace(/^@+/u, '') === wanted) return value;
  }
  return null;
};

const findBaseline = (sourceBaselines, card) => {
  if (!sourceBaselines || typeof sourceBaselines !== 'object') return null;
  // Evidence role (official/repository/social) is a confidence signal, not an
  // attention-source baseline. Only the actual platform/source participates.
  const keys = [card?.platform, card?.source, card?.sourceName]
    .map(normalizeText)
    .filter(Boolean);
  const accounts = accountIdentities(card);
  if (accounts.length > 0) {
    const compositeKeys = keys.flatMap((source) => accounts.flatMap((account) => [
      `${source}:${account}`,
      `${source}/${account}`,
      `${source}|${account}`,
    ]));
    for (const [baselineKey, baseline] of Object.entries(sourceBaselines)) {
      if (compositeKeys.includes(normalizeText(baselineKey).replace(/@/gu, ''))) return baseline;
    }
  }

  for (const [baselineKey, platformBaseline] of Object.entries(sourceBaselines)) {
    if (!keys.includes(normalizeText(baselineKey))) continue;
    if (accounts.length > 0 && platformBaseline && typeof platformBaseline === 'object') {
      for (const containerKey of ['accounts', 'authors', 'handles', 'byAccount', 'by_account']) {
        for (const account of accounts) {
          const accountBaseline = findEntry(platformBaseline[containerKey], account);
          if (accountBaseline !== null) return accountBaseline;
        }
      }
    }
    return platformBaseline;
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

const normalizedPlatformKind = (card) => normalizeText(card?.platform)
  .replace(/^platform[.:/]/u, '');

const ATTENTION_PLATFORM_KINDS = new Set([
  'twitter',
  'x',
  'xiaohongshu',
  'reddit',
  'weibo',
  'youtube',
  'tiktok',
  'linkedin',
  'facebook',
  'instagram',
  'threads',
  'bluesky',
  'hacker news',
  'product hunt',
]);

const explicitEvidenceKind = (card) => {
  const sourceType = normalizedSourceType(card);
  const platform = normalizedPlatformKind(card);
  if (/\b(?:official|first[. -]?party|company[. -]?blog|changelog)\b/u.test(sourceType) || /(?:官方|一手)/u.test(sourceType)) {
    return 'official';
  }
  if (/\b(?:repository|repo|github|gitlab)\b/u.test(sourceType)) return 'repository';
  if (platform === 'official') return 'official';
  if (platform === 'github' || platform === 'gitlab') return 'repository';
  if (/\b(?:social|attention|community|discussion|forum|user[. -]?content)\b/u.test(sourceType)) return 'attention';
  if (ATTENTION_PLATFORM_KINDS.has(platform)) return 'attention';
  return '';
};

const sourceLocation = (card) => {
  try {
    const url = new URL(card?.sourceUrl || card?.source_url);
    return {
      hostname: url.hostname.toLowerCase().replace(/^www\./u, ''),
      pathname: url.pathname.toLowerCase(),
    };
  } catch {
    return { hostname: '', pathname: '' };
  }
};

const isReviewedOfficialUrl = (card) => {
  const { hostname, pathname } = sourceLocation(card);
  if (!hostname || /(?:^|\.)(?:community|discuss|forum|user-content)(?:\.|$)/u.test(hostname)) return false;
  if (hostname === 'platform.openai.com') return /^\/(?:docs|changelog)(?:\/|$)/u.test(pathname);
  if (hostname === 'developers.openai.com') return /^\/(?:api|apps-sdk|codex|resources)(?:\/|$)/u.test(pathname);
  if (hostname === 'ai.google.dev') return /^\/(?:api|docs|gemini-api\/docs)(?:\/|$)/u.test(pathname);
  if (hostname === 'docs.anthropic.com' || hostname === 'docs.mistral.ai' || hostname === 'docs.cohere.com') {
    return pathname !== '/';
  }
  if (hostname === 'openai.com') return /^\/(?:index|news|research)(?:\/|$)/u.test(pathname);
  if (hostname === 'anthropic.com') return /^\/(?:news|research)(?:\/|$)/u.test(pathname);
  return false;
};

const isReviewedRepositoryUrl = (card) => {
  const { hostname, pathname } = sourceLocation(card);
  if (hostname !== 'github.com' && hostname !== 'gitlab.com') return false;
  return pathname.split('/').filter(Boolean).length >= 2;
};

const isOfficialEvidence = (card) => {
  const explicitKind = explicitEvidenceKind(card);
  if (explicitKind) return explicitKind === 'official';
  return isReviewedOfficialUrl(card);
};

const isRepositoryEvidence = (card) => {
  const explicitKind = explicitEvidenceKind(card);
  if (explicitKind) return explicitKind === 'repository';
  return isReviewedRepositoryUrl(card);
};

const isFactEvidence = (card) => isOfficialEvidence(card) || isRepositoryEvidence(card);

const collectionSizeScore = (count) => Math.min(15, Math.max(0, count - 1) * 5);

const platformCount = (cards) => new Set(
  cards.map((card) => normalizeText(card?.platform || card?.source)).filter(Boolean)
).size;

const practicalSignals = (text) => Object.fromEntries(
  Object.entries(PRACTICAL_SIGNAL_PATTERNS).map(([key, pattern]) => [key, pattern.test(text)])
);

const positiveFactText = (text) => text
  .replace(/(?:没有|并无|不含|缺少|无)[^。.!?；;]{0,100}/giu, ' ')
  .replace(/\b(?:no|not|without|lacks?)\b[^.!?;]{0,100}/giu, ' ');

const VERSIONED_PRODUCT_PATTERN = /\b(?:gpt|gemini|claude(?:[\s-]+code)?|sora|veo|llama|mistral|codex(?:[\s-]+cli)?)[\s-]*\d+(?:\.\d+)*(?:[a-z])?\b|(?:通义千问|文心一言|豆包|混元|智谱|可灵)[\s-]*\d+(?:\.\d+)*/iu;
const NAMED_PRODUCT_PATTERN = /\b(?:claude\s+code|codex\s+cli|chatgpt\s+agent|responses\s+api|assistants\s+api|gemini\s+api)\b/iu;

const hasConcreteProductIdentity = (text) => (
  VERSIONED_PRODUCT_PATTERN.test(text) || NAMED_PRODUCT_PATTERN.test(text)
);

const releaseFactStructure = (card) => {
  const text = positiveFactText(cardText(card));
  const body = positiveFactText([
    card?.rawContent,
    card?.raw_content,
    card?.summary,
    card?.aiAnalysis?.summary,
  ].map(normalizeText).filter(Boolean).join(' '));
  const signalsFor = (value) => ({
    releaseArtifact: /\b(?:changelog|release\s+notes?)\b|(?:更新日志|变更日志|发布说明)/iu.test(value),
    version: /\b(?:version|v)\s*\d+(?:\.\d+)*\b|(?:版本)\s*\d+(?:\.\d+)*/iu.test(value) || VERSIONED_PRODUCT_PATTERN.test(value),
    availability: /\b(?:availability|available|rollout)\b[^.!?。；;]{0,60}\b(?:regions?|countries|users?|date|scope|access)\b|\b(?:rollout\s+regions?|access\s+scope)\b|(?:已开放|开放至|覆盖|上线日期)[^。.!?；;]{0,40}(?:地区|国家|用户|日期|范围)/iu.test(value),
    apiDetail: /\b(?:get|post|put|patch|delete)\s+\/v\d+\/[^\s]+|\/v\d+\/[a-z0-9_./{}:-]+|\bapi\s+(?:parameters?|limits?|rate\s+limits?|endpoints?)\b|(?:接口参数|API\s*参数|接口端点|速率限制|模型限制)/iu.test(value),
    concreteChange: /\b(?:adds?|added|removes?|removed|supports?|introduced|changed)\b[^.!?;]{1,80}|(?:新增|增加|移除|支持|调整|变更)[^。.!?；;]{1,80}/iu.test(value),
  });
  const bodySignals = signalsFor(body);
  const bodyStructuredCombination = (
    (bodySignals.releaseArtifact && (bodySignals.version || bodySignals.availability || bodySignals.concreteChange)) ||
    (bodySignals.version && bodySignals.availability) ||
    (bodySignals.apiDetail && bodySignals.concreteChange)
  );
  const factBodyCount = Object.values(bodySignals).filter(Boolean).length;
  const verifiedFactAction = isFactEvidence(card) &&
    matchesAny(text, RELEASE_ACTION_PATTERNS) &&
    hasConcreteProductIdentity(text) &&
    !matchesAny(text, LOW_VALUE_PATTERNS);
  return verifiedFactAction || bodyStructuredCombination || (isFactEvidence(card) && factBodyCount >= 2);
};

const structuredEvidence = (card) => {
  const text = cardText(card);
  const practical = practicalSignals(text);
  const numericValues = text.match(/\b\d+(?:\.\d+)?(?:%|ms|s|x)?\b/gu) || [];
  const quantitativeBenchmark = practical.benchmark && numericValues.length >= 2 &&
    /\b(?:vs\.?|versus|median|average|mean|p\d{2}|result|latency|accuracy|throughput)\b|(?:对比|结果|延迟|准确率|吞吐)/iu.test(text);
  const numberedProcedure = /(?:\bstep\s*\d+\b|(?:^|[\s；;。])\d+(?:[)、]\s*|\.\s+)|步骤\s*[一二三四五六七八九十\d]+|[一二三四五六七八九十两\d]+个步骤)/iu.test(text);
  const codeStructure = /```|\b(?:const|let|function|import|from|curl|npm|pnpm|pip)\s+[^\s]/iu.test(text);
  const problemMethodResult = (
    /\bproblem\b|问题/u.test(text) &&
    /\bmethod\b|方法/u.test(text) &&
    /\bresult\b|结果/u.test(text)
  );
  return {
    factualRelease: releaseFactStructure(card),
    quantitativeBenchmark,
    structured: numberedProcedure || codeStructure || problemMethodResult || quantitativeBenchmark,
  };
};

const hasSubstantiveContent = (cards) => cards.some((card) => {
  const structure = structuredEvidence(card);
  return structure.factualRelease || structure.structured;
});

const hasQuantitativeBenchmark = (cards) => cards.some(
  (card) => structuredEvidence(card).quantitativeBenchmark
);

const newestFactBreakingCandidate = (cards, now, timezoneOffsetMinutes) => cards
  .filter((card) => releaseFactStructure(card))
  .map((card) => ({ card, timestamp: readCardTime(card, now, timezoneOffsetMinutes) }))
  .filter(({ timestamp }) => timestamp !== null && timestamp <= now)
  .sort((left, right) => (
    right.timestamp - left.timestamp ||
    stableObservationKey(left.card).localeCompare(stableObservationKey(right.card), 'en')
  ))[0]?.card || null;

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
 * Scores one deterministic Task 5 cluster. `sourceBaselines` accepts platform
 * fallbacks (`{ Twitter: { engagement: [...] } }`), account maps under
 * `accounts`/`authors`/`handles`/`byAccount`, or flat `platform:account` keys.
 * Account identity is read from author/account/accountId/handle/username and
 * always wins over the platform fallback. Unknown baselines get a conservative
 * neutral-low percentile; absolute likes or follower counts are never gates.
 * `timezoneOffsetMinutes` is minutes east of UTC and makes unzoned source
 * timestamps deterministic; otherwise the explicit `now` offset or UTC wins.
 */
export const scoreTopicCluster = (
  cluster,
  { now, timezoneOffsetMinutes, sourceBaselines = {}, preferenceSignals = {} } = {}
) => {
  const sourceTimezoneOffset = resolveTimezoneOffset(timezoneOffsetMinutes, now);
  const nowTimestamp = resolveNow(now, sourceTimezoneOffset);
  const cards = cardsForCluster(cluster, nowTimestamp, sourceTimezoneOffset);
  const attentionCards = cards.filter((card) => !isFactEvidence(card));
  // A fact-only topic can be a time-sensitive release candidate, but one
  // newest valid structured fact supplies only date/content. It never supplies
  // engagement or a cross-platform propagation bonus.
  const factBreakingCandidate = attentionCards.length === 0
    ? newestFactBreakingCandidate(cards, nowTimestamp, sourceTimezoneOffset)
    : null;
  const breakingCards = attentionCards.length > 0
    ? attentionCards
    : factBreakingCandidate
      ? [factBreakingCandidate]
      : [];
  const text = clusterText(cluster, cards);
  const breakingText = breakingCards.map(cardText).filter(Boolean).join(' ');
  const latestPublishedAt = cards
    .map((card) => readCardTime(card, nowTimestamp, sourceTimezoneOffset))
    .filter((timestamp) => timestamp !== null && timestamp <= nowTimestamp)
    .sort((left, right) => right - left)[0] ?? null;
  const latestBreakingAt = breakingCards
    .map((card) => readCardTime(card, nowTimestamp, sourceTimezoneOffset))
    .filter((timestamp) => timestamp !== null && timestamp <= nowTimestamp)
    .sort((left, right) => right - left)[0] ?? null;
  const age = latestPublishedAt === null ? null : nowTimestamp - latestPublishedAt;
  const breakingAge = latestBreakingAt === null ? null : nowTimestamp - latestBreakingAt;
  const platforms = platformCount(cards);
  const attentionPlatforms = platformCount(attentionCards);
  const engagement = attentionCards.length > 0
    ? averageEngagementPercentile(attentionCards, sourceBaselines)
    : 0;
  const breakingSignal = matchesAny(text, BREAKING_PATTERNS);
  const handsOnSignal = matchesAny(text, HANDS_ON_PATTERNS);
  const analysisSignal = matchesAny(text, ANALYSIS_PATTERNS);
  const practical = practicalSignals(text);
  const practicalCount = Object.values(practical).filter(Boolean).length;
  const lowValue = matchesAny(text, LOW_VALUE_PATTERNS);
  const momentumBreakingSignal = matchesAny(breakingText, BREAKING_PATTERNS);
  const momentumHandsOnSignal = matchesAny(breakingText, HANDS_ON_PATTERNS);
  const momentumLowValue = matchesAny(breakingText, LOW_VALUE_PATTERNS);
  const officialCount = cards.filter(isOfficialEvidence).length;
  const repositoryCount = cards.filter(isRepositoryEvidence).length;
  const hasSubstantiveEvidence = hasSubstantiveContent(cards);
  const hasSubstantiveBreaking = hasSubstantiveContent(breakingCards);

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
  if (hasQuantitativeBenchmark(cards)) studyScore += 35;
  if (text.length >= 240) studyScore += 8;

  // Broad launch/hands-on wording also appears in memes and reaction posts. It
  // cannot override the low-value cap without reusable or concrete factual evidence.
  if (lowValue && !hasSubstantiveEvidence) {
    writeScore = 25;
    studyScore = 15;
  }

  let breakingScore = 0;
  if (breakingAge !== null && breakingAge >= 0 && breakingAge <= LANE_WINDOWS.breaking) {
    const recency = (1 - breakingAge / LANE_WINDOWS.breaking) * 15;
    breakingScore = 20 + engagement * 0.2 + recency;
    if (momentumBreakingSignal) breakingScore += 30;
    if (momentumHandsOnSignal) breakingScore += 15;
    if (attentionPlatforms >= 2) breakingScore += 15;
    if (momentumLowValue && !hasSubstantiveBreaking) breakingScore = 0;
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
      breaking: breakingAge !== null && breakingAge >= 0 && breakingAge <= LANE_WINDOWS.breaking && breakingScore >= 60,
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
