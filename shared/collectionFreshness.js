const SNAPSHOT_PREFIX = 'snapshot:';
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const DEFAULT_STALE_AFTER_MS = 36 * 60 * 60 * 1000;

const parseIsoTimestamp = (value) => {
  if (typeof value !== 'string' || !ISO_TIMESTAMP_PATTERN.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const getLatestCollectionAt = (cards = []) => {
  let latestValue = null;
  let latestTimestamp = -Infinity;

  for (const card of Array.isArray(cards) ? cards : []) {
    for (const tag of Array.isArray(card?.tags) ? card.tags : []) {
      if (typeof tag !== 'string' || !tag.startsWith(SNAPSHOT_PREFIX)) continue;
      const value = tag.slice(SNAPSHOT_PREFIX.length);
      const timestamp = parseIsoTimestamp(value);
      if (timestamp !== null && timestamp > latestTimestamp) {
        latestValue = value;
        latestTimestamp = timestamp;
      }
    }
  }

  return latestValue;
};

export const getCollectionFreshness = ({
  collectedAt,
  now = Date.now(),
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
} = {}) => {
  const collectedAtMs = parseIsoTimestamp(collectedAt);
  const nowMs = Number(now);

  if (collectedAtMs === null || !Number.isFinite(nowMs)) {
    return { status: 'unknown', ageMs: null };
  }

  const ageMs = Math.max(0, nowMs - collectedAtMs);
  return {
    status: ageMs >= staleAfterMs ? 'stale' : 'fresh',
    ageMs,
  };
};

const formatCollectionTime = (timestamp) => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

export const getCollectionLabel = ({ collectedAt, now = Date.now(), status } = {}) => {
  const freshness = getCollectionFreshness({ collectedAt, now });
  const resolvedStatus = status === 'fresh' || status === 'stale' || status === 'unknown'
    ? status
    : freshness.status;

  if (freshness.status === 'unknown' || resolvedStatus === 'unknown') {
    return '采集时间未知';
  }

  if (resolvedStatus === 'stale') {
    return `热点数据已过期（${formatCollectionTime(collectedAt)} 采集）`;
  }

  if (freshness.ageMs < 60_000) return '刚刚采集';
  if (freshness.ageMs < 60 * 60_000) {
    return `${Math.floor(freshness.ageMs / 60_000)} 分钟前采集`;
  }
  if (freshness.ageMs < 24 * 60 * 60_000) {
    return `${Math.floor(freshness.ageMs / (60 * 60_000))} 小时前采集`;
  }
  return `采集于 ${formatCollectionTime(collectedAt)}`;
};
