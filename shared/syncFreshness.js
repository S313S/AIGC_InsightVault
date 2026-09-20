export const countNewItemIds = (previousItems = [], nextItems = []) => {
  const previousIds = new Set(
    previousItems.map(item => String(item?.id || '').trim()).filter(Boolean)
  );
  const newIds = new Set();

  for (const item of nextItems) {
    const id = String(item?.id || '').trim();
    if (id && !previousIds.has(id)) newIds.add(id);
  }

  return newIds.size;
};

const formatClockTime = (value) => {
  const date = new Date(value);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

export const getSyncLabel = ({ isSyncing, lastSyncedAt, now = Date.now() }) => {
  if (isSyncing) {
    return lastSyncedAt ? '正在后台更新' : '正在获取最新数据';
  }

  const syncedAtMs = new Date(lastSyncedAt || '').getTime();
  if (!Number.isFinite(syncedAtMs)) return '尚未同步';

  const elapsedMs = Math.max(0, Number(now) - syncedAtMs);
  if (elapsedMs < 60_000) return '刚刚同步';
  if (elapsedMs < 60 * 60_000) {
    return `${Math.floor(elapsedMs / 60_000)} 分钟前同步`;
  }
  return `同步于 ${formatClockTime(syncedAtMs)}`;
};
