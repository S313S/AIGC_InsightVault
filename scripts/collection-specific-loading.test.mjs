import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const serviceSource = readFileSync(new URL('../services/supabaseService.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

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

test('collection view loads cards into independent request-guarded state', () => {
  assert.match(appSource, /const \[collectionCards, setCollectionCards\]/);
  assert.match(appSource, /const \[collectionLoadStatus, setCollectionLoadStatus\]/);
  assert.match(appSource, /collectionLoadRequestIdRef/);
  assert.match(appSource, /db\.getKnowledgeCardsByCollectionIds\(aliasIds\)/);
  assert.match(appSource, /requestId !== collectionLoadRequestIdRef\.current/);
});

test('collection view distinguishes loading, failure, retry, and confirmed empty states', () => {
  assert.match(appSource, /正在加载收藏夹内容/);
  assert.match(appSource, /收藏夹内容加载失败/);
  assert.match(appSource, /重新加载/);
  assert.match(appSource, /collectionLoadStatus === 'loaded'/);
});

test('collection filtering uses independently loaded collection cards', () => {
  assert.match(appSource, /const sourceCards = currentCollectionId \? collectionCards : cards/);
  assert.match(appSource, /return sourceCards\.filter\(card =>/);
  assert.match(appSource, /!currentCollectionId && hasMoreCards/);
});
