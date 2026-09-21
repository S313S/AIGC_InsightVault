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
  const intendedSet = new Set(intended);
  const failedPlatforms = uniquePlatforms(
    (Array.isArray(platformErrors) ? platformErrors : [])
      .map((item) => item?.platform)
      .filter((platform) => intendedSet.has(normalizePlatform(platform)))
  );

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

  if (failed || (failedPlatforms.length > 0 && completedPlatforms.length === 0)) {
    return {
      status: 'failed',
      completedPlatforms,
      failedPlatforms,
      explanation: failedPlatforms.length === intended.length && intended.length > 0
        ? '计划平台全部失败，本次未完成有效抓取。'
        : '运行失败，本次未完成有效抓取。'
    };
  }

  if (failedPlatforms.length > 0 && completedPlatforms.length > 0) {
    return {
      status: 'partial_failure',
      completedPlatforms,
      failedPlatforms,
      explanation: '部分平台抓取完成，部分失败；结果可能不完整。'
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
