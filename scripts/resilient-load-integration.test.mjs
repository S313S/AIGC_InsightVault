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
  assert.match(source, /const topicsResult = await primarySettlements\.topics/);
  assert.match(source, /const topicsLoad = getLoadResult\(topicsResult, \[\], 'Loading editorial topics'\)/);
  assert.match(source, /primaryHadFailure = rawPrimaryHadFailure \|\| !topicsLoad\.ok/);
  assert.match(
    source,
    /topics:\s*preserveOnFailedLoad\(topicsLoad, dbTopics, baselineSnapshot\.topics\.length > 0\)/
  );
  assert.match(source, /trending:\s*preserveOnFailedLoad\(trendingLoad, trendingSnapshot\.cards, hasBaselineData\)/);
});

test('raw evidence applies before a pending topic read', () => {
  const rawSettledIndex = source.indexOf('const [cardsResult, trendingResult] = await primarySettlements.raw');
  const rawApplyIndex = source.indexOf('applyLoadedSnapshot(rawPrimarySnapshot)', rawSettledIndex);
  const topicsSettledIndex = source.indexOf('const topicsResult = await primarySettlements.topics', rawSettledIndex);

  assert.ok(rawSettledIndex >= 0);
  assert.ok(rawApplyIndex > rawSettledIndex);
  assert.ok(topicsSettledIndex > rawApplyIndex);
});

test('stale owner requests are rejected before raw or topic results can replace state', () => {
  const rawSettledIndex = source.indexOf('const [cardsResult, trendingResult] = await primarySettlements.raw');
  const rawGuardIndex = source.indexOf('if (requestId !== loadRequestIdRef.current) return false;', rawSettledIndex);
  const rawApplyIndex = source.indexOf('applyLoadedSnapshot(rawPrimarySnapshot)', rawSettledIndex);
  const topicsSettledIndex = source.indexOf('const topicsResult = await primarySettlements.topics', rawSettledIndex);
  const topicsGuardIndex = source.indexOf('if (requestId !== loadRequestIdRef.current) return false;', topicsSettledIndex);
  const topicsApplyIndex = source.indexOf('setTopics(topicSnapshot.topics)', topicsSettledIndex);

  assert.ok(rawGuardIndex > rawSettledIndex && rawGuardIndex < rawApplyIndex);
  assert.ok(topicsGuardIndex > topicsSettledIndex && topicsGuardIndex < topicsApplyIndex);
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
