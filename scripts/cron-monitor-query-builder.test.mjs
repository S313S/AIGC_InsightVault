import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('cron monitor does not call filters directly on supabase.from()', async () => {
  const source = await readFile(new URL('../api/cron-monitor.js', import.meta.url), 'utf8');
  const invalidFilterAfterFrom = /\.from\([^)]*\)\s*\.\s*(?:eq|in|gte|lte|gt|lt|like|ilike|is|not|or)\s*\(/s;

  assert.equal(
    invalidFilterAfterFrom.test(source),
    false,
    'Call select(), update(), delete(), or insert() before applying Supabase filters.'
  );
});
