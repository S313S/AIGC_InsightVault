import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveLoadNotice } from '../shared/loadNotice.js';

test('resolveLoadNotice stays quiet when cloud loaded successfully but data is empty', () => {
  const notice = resolveLoadNotice({
    phase: 'primary',
    hadFailure: false,
    hasCachedSnapshot: false,
    authUser: { id: 'user-1' },
  });

  assert.equal(notice, '');
});

test('resolveLoadNotice reports cached fallback only when a real load failure occurred', () => {
  const notice = resolveLoadNotice({
    phase: 'primary',
    hadFailure: true,
    hasCachedSnapshot: true,
    authUser: { id: 'user-1' },
  });

  assert.equal(notice, '部分云端数据加载超时，当前继续显示最近一次成功加载的数据。可以稍后刷新重试。');
});

test('resolveLoadNotice reports secondary failures without implying all primary content failed', () => {
  const notice = resolveLoadNotice({
    phase: 'secondary',
    hadFailure: true,
    hasCachedSnapshot: false,
    authUser: { id: 'user-1' },
  });

  assert.equal(notice, '收藏夹或任务加载超时，当前继续显示已加载的数据。可以稍后刷新重试。');
});
