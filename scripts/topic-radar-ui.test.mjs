import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const readSource = (relativePath) => {
  const url = new URL(relativePath, import.meta.url);
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
};

const radarSource = readSource('../components/TopicRadarView.tsx');
const topicCardSource = readSource('../components/TopicCard.tsx');
const dashboardSource = readSource('../components/DashboardView.tsx');
const appSource = readSource('../App.tsx');

test('topic radar derives three independent, bounded editorial lanes once', () => {
  assert.match(radarSource, /今日值得写/);
  assert.match(radarSource, /值得沉淀/);
  assert.match(radarSource, /突发雷达/);
  assert.match(radarSource, /writeLimit:\s*5/);
  assert.match(radarSource, /studyLimit:\s*5/);
  assert.match(radarSource, /breakingLimit:\s*3/);
  assert.match(radarSource, /useMemo\(\(\)\s*=>\s*deriveTopicLanes\(topics, freshnessNow\)/);
  assert.match(radarSource, /latestEvidenceAt/);
  assert.match(radarSource, /breakingScore/);
  assert.doesNotMatch(radarSource, /opportunityScore[^\n]*\.sort/);
});

test('topic cards explain lane score and label fallback briefs truthfully', () => {
  assert.match(topicCardSource, /topic\.title/);
  assert.match(topicCardSource, /topic\.summary/);
  assert.match(topicCardSource, /topic\.whyNow/);
  assert.match(topicCardSource, /为什么值得写/);
  assert.match(topicCardSource, /为什么值得学/);
  assert.match(topicCardSource, /为什么正在爆/);
  assert.match(topicCardSource, /topic\.contentAngles\.quick/);
  assert.match(topicCardSource, /topic\.durableKnowledge\[0\]/);
  assert.match(topicCardSource, /topic\.generationStatus === 'fallback'/);
  assert.match(topicCardSource, /自动摘要/);
  assert.match(topicCardSource, /待核验/);
});

test('topic evidence is expandable, role-aware, and only links safe web URLs', () => {
  assert.match(topicCardSource, /aria-expanded=\{evidenceOpen\}/);
  assert.match(topicCardSource, /aria-controls=\{evidencePanelId\}/);
  assert.match(topicCardSource, /事实来源/);
  assert.match(topicCardSource, /热度来源/);
  assert.match(topicCardSource, /没有可展示的证据来源/);
  assert.match(topicCardSource, /protocol !== 'http:' && parsed\.protocol !== 'https:'/);
  assert.match(topicCardSource, /rel="noopener noreferrer"/);
  assert.match(topicCardSource, /card\?\.author/);
  assert.match(topicCardSource, /card\?\.date/);
});

test('feedback controls are owner-only, guarded while pending, and callback-driven', () => {
  assert.match(topicCardSource, /TopicFeedbackAction/);
  assert.match(topicCardSource, /onToggleFeedback/);
  assert.match(topicCardSource, /收藏/);
  assert.match(topicCardSource, /忽略/);
  assert.match(topicCardSource, /已发布/);
  assert.match(topicCardSource, /登录后可标记/);
  assert.match(topicCardSource, /pendingFeedbackKeys/);
  assert.match(topicCardSource, /buildTopicFeedbackKey\(feedbackOwnerId, topic\.id, action\)/);
  assert.match(topicCardSource, /disabled=\{!canGiveFeedback \|\| pending\}/);
  assert.match(topicCardSource, /await onToggleFeedback\(topic\.id, action, !active\)/);
});

test('topic loading stays local and collection freshness remains collection-owned', () => {
  assert.match(radarSource, /isTopicsLoading && topics\.length === 0/);
  assert.match(radarSource, /正在整理话题/);
  assert.match(dashboardSource, /getCollectionFreshness\(\{ collectedAt: lastCollectedAt, now: freshnessNow \}\)/);
  assert.match(dashboardSource, /热点采集：\{collectionLabel\}/);
  assert.match(dashboardSource, /页面同步：\{syncLabel\}/);
  assert.match(dashboardSource, /collectionFreshness\.status === 'stale'/);
});

test('raw posts remain reachable in a collapsed accessible pool and topic-empty fallback', () => {
  assert.match(dashboardSource, /原始帖子池/);
  assert.match(dashboardSource, /aria-expanded=\{rawPoolOpen\}/);
  assert.match(dashboardSource, /aria-controls="raw-post-pool"/);
  assert.match(dashboardSource, /id="raw-post-pool"/);
  assert.match(dashboardSource, /rawPoolOpen &&/);
  assert.match(dashboardSource, /setShowAllTrending\(true\)/);
  assert.match(radarSource, /暂无可用话题/);
});

test('app wires cached topics, auth, and optimistic feedback with rollback and owner cache persistence', () => {
  assert.match(appSource, /topics=\{topics\}/);
  assert.match(appSource, /isTopicsLoading=\{isTopicsLoading\}/);
  assert.match(appSource, /canGiveTopicFeedback=\{Boolean\(currentUser\)\}/);
  assert.match(appSource, /onToggleTopicFeedback=\{handleToggleTopicFeedback\}/);
  assert.match(appSource, /db\.saveTopicFeedback\(topicId, action\)/);
  assert.match(appSource, /db\.removeTopicFeedback\(topicId, action\)/);
  assert.match(appSource, /resolveTopicFeedbackSettlement/);
  assert.match(appSource, /writeStoredSnapshot\(ownerId, nextSnapshot/);
  assert.match(appSource, /beginTopicFeedbackRead\(topicFeedbackStateRef\.current, targetOwnerId\)/);
  assert.match(appSource, /mergeTopicFeedbackRead\(/);
  assert.match(appSource, /createTopicFeedbackRequestRegistry/);
  assert.match(appSource, /const pendingRequest = topicFeedbackRequestsRef\.current!\.get\(requestKey\)/);
  assert.match(appSource, /if \(pendingRequest\) return pendingRequest/);
  assert.match(appSource, /readStoredSnapshotRecord\(ownerId\)/);
  assert.match(appSource, /activateOwner:\s*false/);
});
