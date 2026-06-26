export const resolveLoadNotice = ({
  phase,
  hadFailure,
  hasCachedSnapshot,
  authUser,
}) => {
  if (!hadFailure) return '';

  if (hasCachedSnapshot) {
    return '部分云端数据加载超时，当前继续显示最近一次成功加载的数据。可以稍后刷新重试。';
  }

  if (phase === 'secondary') {
    return '收藏夹或任务加载超时，当前继续显示已加载的数据。可以稍后刷新重试。';
  }

  return authUser
    ? '部分云端数据加载超时，当前未能加载你的私有知识卡片。请稍后刷新重试。'
    : '部分云端数据加载超时，当前已回退到内置公开内容。可以稍后刷新重试。';
};
