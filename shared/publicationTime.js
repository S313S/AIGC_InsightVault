const COMPLETE_ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export const formatPublicationTime = (value, options = {}) => {
  const raw = String(value || '').trim();
  if (!raw) return '发布时间未知';
  if (!COMPLETE_ISO_TIMESTAMP.test(raw)) return raw;

  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat(options.locale || 'zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  }).format(parsed);
};
