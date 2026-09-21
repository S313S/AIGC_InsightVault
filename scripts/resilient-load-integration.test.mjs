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
  assert.match(
    source,
    /const \[cardsResult, trendingResult, topicsResult\] = await Promise\.allSettled\(\[[\s\S]*?db\.getKnowledgeCards[\s\S]*?db\.getTrendingCards[\s\S]*?db\.getEditorialTopics/
  );
  assert.match(source, /const topicsLoad = getLoadResult\(topicsResult, \[\], 'Loading editorial topics'\)/);
  assert.match(source, /primaryHadFailure = !cardsLoad\.ok \|\| !trendingLoad\.ok \|\| !topicsLoad\.ok/);
  assert.match(
    source,
    /topics:\s*preserveOnFailedLoad\(topicsLoad, dbTopics, baselineSnapshot\.topics\.length > 0\)/
  );
  assert.match(source, /trending:\s*preserveOnFailedLoad\(trendingLoad, trendingSnapshot\.cards, hasBaselineData\)/);
});

test('stale owner requests are rejected before network topics can replace state', () => {
  const settledIndex = source.indexOf('const [cardsResult, trendingResult, topicsResult] = await Promise.allSettled');
  const staleGuardIndex = source.indexOf('if (requestId !== loadRequestIdRef.current) return false;', settledIndex);
  const topicsResultIndex = source.indexOf('const topicsLoad = getLoadResult', settledIndex);

  assert.ok(settledIndex >= 0);
  assert.ok(staleGuardIndex > settledIndex);
  assert.ok(topicsResultIndex > staleGuardIndex);
});

test('topic loading does not participate in collection freshness updates', () => {
  const freshnessStart = source.indexOf('const trendingSnapshot = resolveTrendingSnapshot');
  const trendingSuccessStart = source.indexOf('if (trendingLoad.ok)', freshnessStart);
  const freshnessEnd = source.indexOf('if (cardsLoad.ok)', trendingSuccessStart);
  const freshnessBlock = source.slice(trendingSuccessStart, freshnessEnd);

  assert.match(freshnessBlock, /if \(trendingLoad\.ok\)/);
  assert.doesNotMatch(freshnessBlock, /topicsLoad|dbTopics/);
});
