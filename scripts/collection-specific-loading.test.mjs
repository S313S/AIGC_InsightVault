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

const extractBetween = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `${startMarker} should exist`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `${endMarker} should exist after ${startMarker}`);
  return source.slice(start, end);
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

test('collection card loading participates in cancellation and retry recovery', () => {
  const serviceBody = extractFunctionBody(serviceSource, 'getKnowledgeCardsByCollectionIds');
  const appBody = extractBetween(appSource, '  const loadCollectionCards =', '  const closeCollectionView =');

  assert.equal(serviceBody.includes('signal?: AbortSignal'), true);
  assert.equal(serviceBody.includes('.abortSignal(signal)'), true);
  assert.match(appSource, /collectionLoadControllerRef/);
  assert.match(appBody, /withTimeoutRetryResult/);
  assert.match(appBody, /db\.getKnowledgeCardsByCollectionIds\(aliasIds, signal\)/);
});

test('collection view loads cards into independent request-guarded state', () => {
  assert.match(appSource, /const \[collectionCards, setCollectionCards\]/);
  assert.match(appSource, /const \[collectionLoadStatus, setCollectionLoadStatus\]/);
  assert.match(appSource, /collectionLoadRequestIdRef/);
  assert.match(appSource, /db\.getKnowledgeCardsByCollectionIds\(aliasIds, signal\)/);
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

test('single-card interactions synchronize the active collection state', () => {
  const syncLoadedCardBody = extractBetween(appSource, '  const syncLoadedCard =', '  const handleOpenCard =');
  const handleDeleteCardBody = extractBetween(appSource, '  const handleDeleteCard =', '  const handleAddCard =');
  const handleUpdateCardBody = extractBetween(appSource, '  const handleUpdateCard =', '  const handleCollectionClick =');

  assert.match(syncLoadedCardBody, /setCollectionCards/);
  assert.match(syncLoadedCardBody, /!isCardInCollection\(loadedCard, currentCollectionId\)/);
  assert.match(handleDeleteCardBody, /setCollectionCards/);
  assert.match(handleUpdateCardBody, /syncLoadedCard\(updatedCard\)/);
});

test('collection header keeps a truthful total while content is loading', () => {
  assert.match(appSource, /const activeCollectionItemCount =/);
  assert.match(appSource, /collectionLoadStatus === 'loaded'/);
  assert.match(appSource, /共 \{activeCollectionItemCount\} 条/);
  assert.doesNotMatch(appSource, /共 \{filteredCards\.length\} 条/);
});

test('collection selection and bulk removal use independently loaded cards', () => {
  const toggleSelectionBody = extractBetween(appSource, '  const toggleCardSelection =', '  const handleRemoveSelectedFromCollection =');
  const removeSelectedBody = extractBetween(appSource, '  const handleRemoveSelectedFromCollection =', '  const handleBatchAddToCollection =');

  assert.match(toggleSelectionBody, /collectionCards\.find/);
  assert.match(removeSelectedBody, /collectionCards\.map/);
  assert.match(removeSelectedBody, /setCollectionCards/);
  assert.match(removeSelectedBody, /setCards/);
});
