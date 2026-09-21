const normalizePlatform = (platform) => {
  const value = String(platform || '').trim().toLowerCase();
  if (value === 'x' || value === 'twitter') return 'twitter';
  if (value === 'xhs' || value === 'xiaohongshu') return 'xiaohongshu';
  return value;
};

const uniquePlatforms = (platforms) => Array.from(new Set(
  (Array.isArray(platforms) ? platforms : [])
    .map(normalizePlatform)
    .filter(Boolean)
));

const RUN_HEALTH_STATUSES = new Set([
  'healthy',
  'healthy_low_volume',
  'partial_failure',
  'failed',
  'truncated',
  'skipped'
]);

const normalizeRunHealth = (runHealth) => {
  if (!runHealth || !RUN_HEALTH_STATUSES.has(runHealth.status)) return null;
  return {
    status: runHealth.status,
    completedPlatforms: uniquePlatforms(runHealth.completedPlatforms),
    failedPlatforms: uniquePlatforms(runHealth.failedPlatforms),
    explanation: String(runHealth.explanation || '').trim() || '运行状态已记录。'
  };
};

export const classifyMonitorRun = ({
  intendedPlatforms = [],
  platformTotals = {},
  candidateCount = 0,
  platformErrors = [],
  runtimeGuardTriggered = false,
  skipped = false,
  skipReason = '',
  failed = false
} = {}) => {
  const intended = uniquePlatforms(intendedPlatforms);
  const completedPlatforms = intended.filter((platform) => {
    const totals = platformTotals?.[platform] || {};
    return totals.completed === true || Number(totals.completedCalls || 0) > 0;
  });
  const realErrors = (Array.isArray(platformErrors) ? platformErrors : [])
    .filter((item) => String(item?.error || '').trim().length > 0);
  const intendedSet = new Set(intended);
  const failedPlatforms = uniquePlatforms(
    realErrors
      .map((item) => item?.platform)
      .filter((platform) => intendedSet.has(normalizePlatform(platform)))
  );
  const isIncomplete = intended.length > 0 && completedPlatforms.length < intended.length;

  if (skipped) {
    const explanation = skipReason === 'auto_update_disabled'
      ? '自动更新已关闭，本次未执行平台抓取。'
      : skipReason === 'rebuild_only'
        ? '维护模式仅重建热点快照，本次未执行平台抓取。'
        : '本次运行已跳过，未执行平台抓取。';
    return { status: 'skipped', completedPlatforms, failedPlatforms, explanation };
  }

  if (runtimeGuardTriggered) {
    return {
      status: 'truncated',
      completedPlatforms,
      failedPlatforms,
      explanation: '运行时间保护已触发，任务在完成全部计划平台前提前停止。'
    };
  }

  if (completedPlatforms.length > 0 && (isIncomplete || realErrors.length > 0 || failed)) {
    return {
      status: 'partial_failure',
      completedPlatforms,
      failedPlatforms,
      explanation: isIncomplete && realErrors.length === 0 && !failed
        ? '部分平台抓取完成，但仍有计划平台未完成；结果可能不完整。'
        : '部分平台抓取完成，但运行部分失败；结果可能不完整。'
    };
  }

  if (completedPlatforms.length === 0 && (isIncomplete || realErrors.length > 0 || failed)) {
    return {
      status: 'failed',
      completedPlatforms,
      failedPlatforms,
      explanation: failedPlatforms.length === intended.length && intended.length > 0
        ? '计划平台全部失败，本次未完成有效抓取。'
        : '运行失败，本次未完成有效抓取。'
    };
  }

  if (intended.length > 0 && completedPlatforms.length === intended.length && Number(candidateCount || 0) === 0) {
    return {
      status: 'healthy_low_volume',
      completedPlatforms,
      failedPlatforms,
      explanation: '所有计划平台均正常完成，但筛选后得到 0 条候选。'
    };
  }

  return {
    status: 'healthy',
    completedPlatforms,
    failedPlatforms,
    explanation: '所有计划平台正常完成，并产出了候选内容。'
  };
};

const resolveIntendedPlatforms = (log) => {
  const effectiveParams = log?.effectiveParams || log?.effective || {};
  if (Array.isArray(effectiveParams.platforms) && effectiveParams.platforms.length > 0) {
    return uniquePlatforms(effectiveParams.platforms);
  }
  const explicitPlatform = normalizePlatform(effectiveParams.platform);
  if (explicitPlatform && explicitPlatform !== 'all') {
    return uniquePlatforms([explicitPlatform]);
  }

  const totalPlatforms = uniquePlatforms(Object.keys(log?.platformTotals || {}));
  if (totalPlatforms.length > 0) return totalPlatforms;

  return uniquePlatforms([
    ...(Array.isArray(log?.platformStats) ? log.platformStats.map((item) => item?.platform) : []),
    ...(Array.isArray(log?.platformErrors) ? log.platformErrors.map((item) => item?.platform) : [])
  ]).filter((platform) => platform !== 'system');
};

export const resolveStoredMonitorRunHealth = (log = {}) => {
  const savedRunHealth = normalizeRunHealth(log.runHealth || log.resultSummary?.runHealth);
  if (savedRunHealth) return savedRunHealth;

  const intendedPlatforms = resolveIntendedPlatforms(log);
  const sourceTotals = log.platformTotals || {};
  const platformTotals = {};
  for (const platform of intendedPlatforms) {
    const totals = sourceTotals[platform] || {};
    platformTotals[platform] = { ...totals };
  }
  for (const stat of Array.isArray(log.platformStats) ? log.platformStats : []) {
    const platform = normalizePlatform(stat?.platform);
    if (!platform || !intendedPlatforms.includes(platform)) continue;
    platformTotals[platform] = {
      ...(platformTotals[platform] || {}),
      completed: true,
      completedCalls: Math.max(1, Number(platformTotals[platform]?.completedCalls || 0))
    };
  }

  const platformErrors = [...(Array.isArray(log.platformErrors) ? log.platformErrors : [])];
  const errorMessage = String(log.errorMessage || '').trim();
  if (errorMessage) platformErrors.push({ platform: 'system', error: errorMessage });

  return classifyMonitorRun({
    intendedPlatforms,
    platformTotals,
    candidateCount: Number(log.resultSummary?.candidates ?? log.candidates ?? 0),
    platformErrors,
    runtimeGuardTriggered: Boolean(log.runtimeGuardTriggered),
    skipped: Boolean(log.resultSummary?.skipped ?? log.skipped),
    skipReason: String(log.resultSummary?.skipReason ?? log.reason ?? ''),
    failed: log.success === false
  });
};

export const resolveManualMonitorRunOutcome = ({ ok = false, payload = {}, fallbackError = '' } = {}) => {
  const runHealth = normalizeRunHealth(payload?.runHealth) || resolveStoredMonitorRunHealth({
    success: ok,
    effectiveParams: payload?.effective || {},
    platformStats: payload?.platformStats || [],
    platformTotals: payload?.platformTotals || {},
    platformErrors: payload?.platformErrors || [],
    resultSummary: payload,
    runtimeGuardTriggered: payload?.runtimeGuardTriggered,
    skipped: payload?.skipped,
    errorMessage: payload?.error || (!ok ? fallbackError : '')
  });
  const inserted = Number(payload?.inserted || 0);
  const candidates = Number(payload?.candidates || 0);
  const runtimeMs = Number(payload?.runtimeMs || 0);
  const errorCount = (Array.isArray(payload?.platformErrors) ? payload.platformErrors : [])
    .filter((item) => String(item?.error || '').trim().length > 0)
    .length;
  const details = `候选 ${candidates}，新增 ${inserted}，耗时 ${runtimeMs}ms，错误 ${errorCount}`;
  const explanation = runHealth.explanation;

  let summary = `完成：${details}`;
  let notification = '热点抓取完成';
  if (runHealth.status === 'healthy_low_volume') {
    summary = `正常结束但候选较少：${details}；${explanation}`;
    notification = '热点抓取正常结束，但候选较少';
  } else if (runHealth.status === 'partial_failure') {
    summary = `部分完成：${details}；${explanation}`;
    notification = '热点抓取部分失败，请查看运行日志';
  } else if (runHealth.status === 'truncated') {
    summary = `提前停止：${details}；${explanation}`;
    notification = '热点抓取提前停止，请查看运行日志';
  } else if (runHealth.status === 'failed') {
    const error = String(payload?.error || fallbackError || explanation).trim();
    summary = `执行失败：${error}`;
    notification = error || '热点抓取失败，请查看运行日志';
  } else if (runHealth.status === 'skipped') {
    summary = `已跳过：${explanation}`;
    notification = explanation;
  }

  return {
    runHealth,
    summary,
    notification,
    shouldRefreshLogs: true,
    shouldRefreshHomepage: ok && ['healthy', 'healthy_low_volume', 'partial_failure', 'truncated'].includes(runHealth.status)
  };
};
