import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

test('app owns and cancels the active cloud load', () => {
  assert.equal(source.includes('activeLoadControllerRef.current?.abort()'), true);
  assert.equal(source.includes('withTimeoutRetryResult'), true);
  assert.equal(source.includes('attemptTimeouts: [12000, 18000]'), true);
});

test('auth reload decisions include the current and next user context', () => {
  assert.equal(source.includes('currentUserId: currentUserRef.current?.id || null'), true);
  assert.equal(source.includes('nextUserId: session?.user?.id || null'), true);
  assert.equal(source.includes('hasCompletedInitialLoad: hasCompletedInitialLoadRef.current'), true);
});

test('load warnings provide retry, dismiss, and recovery cleanup', () => {
  assert.equal(source.includes('立即重试'), true);
  assert.equal(source.includes('关闭'), true);
  assert.equal(source.includes("setLoadNotice('')"), true);
  assert.equal(source.includes('!collectionCountsLoad.ok'), true);
});

test('cached topics initialize state before background network reads', () => {
  const bootstrapIndex = source.indexOf('useState<EditorialTopic[]>(bootstrapSnapshot.topics)');
  const networkIndex = source.indexOf('db.getEditorialTopics(signal)');

  assert.ok(bootstrapIndex >= 0);
  assert.ok(networkIndex >= 0);
  assert.ok(bootstrapIndex < networkIndex);
  assert.match(source, /topicsRef = useRef<EditorialTopic\[\]>\(bootstrapSnapshot\.topics\)/);
  assert.match(source, /topicsRef\.current = snapshot\.topics;[\s\S]*?setTopics\(snapshot\.topics\)/);
});

test('topic reads settle independently and failed reads preserve last good topics', () => {
  assert.match(source, /settlePrimaryLoadsIndependently\(\{[\s\S]*?cards:[\s\S]*?db\.getKnowledgeCards[\s\S]*?trending:[\s\S]*?db\.getTrendingCards[\s\S]*?topics:[\s\S]*?db\.getEditorialTopics/);
  assert.match(source, /const \[cardsResult, trendingResult\] = await primarySettlements\.raw/);
  assert.match(source, /const topicSettlementPromise = primarySettlements\.topics\.then/);
  assert.match(source, /const topicOutcome = await topicSettlementPromise/);
  assert.match(source, /const topicsLoad = getLoadResult\(topicsResult, \[\], 'Loading editorial topics'\)/);
  assert.match(source, /primaryHadFailure = rawPrimaryHadFailure \|\| topicOutcome\.hadFailure/);
  assert.match(source, /preserveOnFailedLoad\([\s\S]*?topicsLoad,[\s\S]*?dbTopics,[\s\S]*?baselineSnapshot\.topics\.length > 0/);
  assert.match(source, /trending:\s*preserveOnFailedLoad\(trendingLoad, trendingSnapshot\.cards, hasBaselineData\)/);
});

test('raw evidence applies before a pending topic read', () => {
  const rawSettledIndex = source.indexOf('const [cardsResult, trendingResult] = await primarySettlements.raw');
  const rawApplyIndex = source.indexOf('applyLoadedSnapshot(rawPrimarySnapshot)', rawSettledIndex);
  const topicsSettledIndex = source.indexOf('const topicOutcome = await topicSettlementPromise', rawSettledIndex);

  assert.ok(rawSettledIndex >= 0);
  assert.ok(rawApplyIndex > rawSettledIndex);
  assert.ok(topicsSettledIndex > rawApplyIndex);
});

test('stale owner requests are rejected before raw or topic results can replace state', () => {
  const rawSettledIndex = source.indexOf('const [cardsResult, trendingResult] = await primarySettlements.raw');
  const rawGuardIndex = source.indexOf('if (requestId !== loadRequestIdRef.current) return false;', rawSettledIndex);
  const rawApplyIndex = source.indexOf('applyLoadedSnapshot(rawPrimarySnapshot)', rawSettledIndex);
  const topicHandlerIndex = source.indexOf('const topicSettlementPromise = primarySettlements.topics.then');
  const topicsGuardIndex = source.indexOf('requestId !== loadRequestIdRef.current', topicHandlerIndex);
  const topicsApplyIndex = source.indexOf('setTopics(topicSnapshot.topics)', topicHandlerIndex);

  assert.ok(rawGuardIndex > rawSettledIndex && rawGuardIndex < rawApplyIndex);
  assert.ok(topicHandlerIndex >= 0);
  assert.ok(topicsGuardIndex > topicHandlerIndex && topicsGuardIndex < topicsApplyIndex);
});

test('topic settlement is consumed before secondary reads can finish', () => {
  const handlerIndex = source.indexOf('const topicSettlementPromise = primarySettlements.topics.then');
  const rawAwaitIndex = source.indexOf('const [cardsResult, trendingResult] = await primarySettlements.raw');
  const secondaryAwaitIndex = source.indexOf('const [collectionsResult, collectionCountsResult, tasksResult] = await Promise.allSettled');
  const topicApplyIndex = source.indexOf('setTopics(topicSnapshot.topics)', handlerIndex);

  assert.ok(handlerIndex >= 0 && handlerIndex < rawAwaitIndex);
  assert.ok(topicApplyIndex > handlerIndex);
  assert.ok(secondaryAwaitIndex > rawAwaitIndex);
});

test('topic loading has independent empty-state lifecycle and cleanup cancellation', () => {
  assert.match(source, /const \[isTopicsLoading, setIsTopicsLoading\] = useState/);
  assert.match(source, /setIsTopicsLoading\(baselineSnapshot\.topics\.length === 0\)/);
  assert.match(source, /setIsTopicsLoading\(false\)/);
  assert.match(source, /loadRequestIdRef\.current \+= 1;[\s\S]*?activeLoadControllerRef\.current\?\.abort\(\)/);
});

test('late topic persistence reads current refs and current freshness metadata', () => {
  assert.match(source, /mergeTopicsIntoCurrentSnapshot\(\(\) => \(\{[\s\S]*?cards: cardsRef\.current,[\s\S]*?trending: trendingRef\.current,[\s\S]*?collections: collectionsRef\.current,[\s\S]*?tasks: tasksRef\.current/);
  assert.match(source, /writeStoredSnapshot\(targetOwnerId, topicSnapshot, \{[\s\S]*?collectedAt: lastCollectedAtRef\.current,[\s\S]*?syncedAt: lastSyncedAtRef\.current/);
});

test('late topic failures cannot overwrite a known secondary warning', () => {
  assert.match(source, /let secondaryHadFailureForNotice = false/);
  assert.match(source, /if \(!topicsLoad\.ok && !secondaryHadFailureForNotice\)/);
  assert.match(source, /secondaryHadFailureForNotice = secondaryHadFailure/);
});

test('offline guest loading clears owner topics in both state and its synchronous ref', () => {
  const offlineStart = source.indexOf('const offlineCards = INITIAL_DATA.map(toOfflinePublicCard)');
  const offlineEnd = source.indexOf('return true;', offlineStart);
  const offlineBlock = source.slice(offlineStart, offlineEnd);

  assert.match(offlineBlock, /topicsRef\.current = \[\]/);
  assert.match(offlineBlock, /setTopics\(\[\]\)/);
  assert.ok(offlineBlock.indexOf('topicsRef.current = []') < offlineBlock.indexOf('writeStoredSnapshot(null'));
});

test('topic loading does not participate in collection freshness updates', () => {
  const freshnessStart = source.indexOf('const trendingSnapshot = resolveTrendingSnapshot');
  const trendingSuccessStart = source.indexOf('if (trendingLoad.ok)', freshnessStart);
  const freshnessEnd = source.indexOf('if (cardsLoad.ok)', trendingSuccessStart);
  const freshnessBlock = source.slice(trendingSuccessStart, freshnessEnd);

  assert.match(freshnessBlock, /if \(trendingLoad\.ok\)/);
  assert.doesNotMatch(freshnessBlock, /topicsLoad|dbTopics/);
});
