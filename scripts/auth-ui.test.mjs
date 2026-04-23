import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSupabaseStorageKeys,
  mapAuthErrorMessage,
} from '../shared/authUi.js';

test('mapAuthErrorMessage preserves invalid credential guidance', () => {
  const message = mapAuthErrorMessage({ message: 'Invalid login credentials' });
  assert.equal(message, '账号名或密码错误。');
});

test('mapAuthErrorMessage explains paused projects', () => {
  const message = mapAuthErrorMessage({ message: 'project is paused' });
  assert.equal(message, 'Supabase 项目当前不可用，可能仍在恢复中，请稍后重试。');
});

test('mapAuthErrorMessage explains network-style failures', () => {
  const message = mapAuthErrorMessage({ message: 'Failed to fetch' });
  assert.equal(message, '登录请求未完成，可能被浏览器扩展、隐私设置或网络拦截。可先清除本地登录状态后重试。');
});

test('buildSupabaseStorageKeys derives the auth token key from project ref', () => {
  assert.deepEqual(
    buildSupabaseStorageKeys('https://htulkjuvoodbzfhtwseo.supabase.co'),
    [
      'sb-htulkjuvoodbzfhtwseo-auth-token',
      'sb-htulkjuvoodbzfhtwseo-auth-token-code-verifier',
      'supabase.auth.token',
    ]
  );
});

test('buildSupabaseStorageKeys tolerates invalid urls', () => {
  assert.deepEqual(buildSupabaseStorageKeys('not-a-url'), ['supabase.auth.token']);
});
