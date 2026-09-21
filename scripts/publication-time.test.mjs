import test from 'node:test';
import assert from 'node:assert/strict';

import { formatPublicationTime } from '../shared/publicationTime.js';

test('formats complete ISO timestamps with an explicit timezone via Intl', () => {
  const value = '2026-09-21T00:30:00Z';
  const utc = formatPublicationTime(value, { locale: 'zh-CN', timeZone: 'UTC' });
  const shanghai = formatPublicationTime(value, { locale: 'zh-CN', timeZone: 'Asia/Shanghai' });

  assert.match(utc, /2026/);
  assert.match(utc, /00:30/);
  assert.match(shanghai, /2026/);
  assert.match(shanghai, /08:30/);
  assert.notEqual(utc, shanghai);
});

test('preserves date-only and imprecise publication text without inventing a time', () => {
  for (const value of ['2026-09-21', '09-21', '9月21日', '3小时前', '昨天', 'not-a-date']) {
    assert.equal(formatPublicationTime(value, { timeZone: 'Asia/Shanghai' }), value);
  }
});

test('requires a complete ISO time and explicit Z or offset before parsing', () => {
  assert.equal(formatPublicationTime('2026-09-21T08:30'), '2026-09-21T08:30');
  assert.equal(formatPublicationTime('2026-09-21T08:30:00'), '2026-09-21T08:30:00');
  assert.match(
    formatPublicationTime('2026-09-21T08:30:00+08:00', { locale: 'zh-CN', timeZone: 'UTC' }),
    /00:30/
  );
  assert.equal(formatPublicationTime(''), '发布时间未知');
});
