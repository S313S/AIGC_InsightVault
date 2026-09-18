import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const serviceSource = readFileSync(new URL('../services/supabaseService.ts', import.meta.url), 'utf8');

const extractFunctionBody = (source, functionName) => {
  const start = source.indexOf(`export const ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextExport = source.indexOf('\nexport const ', start + 1);
  return source.slice(start, nextExport === -1 ? source.length : nextExport);
};

test('collection card loading queries every alias independently of the home page', () => {
  const body = extractFunctionBody(serviceSource, 'getKnowledgeCardsByCollectionIds');

  assert.equal(body.includes(".select(CARD_LIST_SELECT_FIELDS)"), true);
  assert.equal(body.includes(".eq('is_trending', false)"), true);
  assert.equal(body.includes(".overlaps('collections', collectionIds)"), true);
  assert.equal(body.includes('.range(offset, offset + COLLECTION_CARD_PAGE_SIZE - 1)'), true);
  assert.equal(body.includes('throw error'), true);
});

test('collection card loading cleans aliases and handles empty input', () => {
  const body = extractFunctionBody(serviceSource, 'getKnowledgeCardsByCollectionIds');

  assert.equal(body.includes('uniqStrings(rawCollectionIds)'), true);
  assert.equal(body.includes('if (collectionIds.length === 0) return []'), true);
});
