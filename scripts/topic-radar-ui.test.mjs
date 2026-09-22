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
  assert.match(topicCardSource, /规则摘要/);
  assert.match(topicCardSource, /模型未生成/);
});

test('topic cards restore a visual lead source and a direct safe source action', () => {
  assert.match(topicCardSource, /selectTopicLeadSource\(sources\)/);
  assert.match(topicCardSource, /readableTopicDisplayText/);
  assert.match(topicCardSource, /qualifyTopicDisplayTitle/);
  assert.match(topicCardSource, /displayTitle/);
  assert.match(topicCardSource, /displaySummary/);
  assert.match(topicCardSource, /fallbackCoverFromSeed/);
  assert.match(topicCardSource, /<img/);
  assert.match(topicCardSource, /width=\{640\}/);
  assert.match(topicCardSource, /height=\{360\}/);
  assert.match(topicCardSource, /loading="lazy"/);
  assert.match(topicCardSource, /referrerPolicy="no-referrer"/);
  assert.match(topicCardSource, /href=\{leadSource\.href\}/);
  assert.match(topicCardSource, /查看原文/);
  assert.match(topicCardSource, /line-clamp-3/);
});

test('topic evidence is expandable, role-aware, and only links safe web URLs', () => {
  assert.match(topicCardSource, /aria-expanded=\{evidenceOpen\}/);
  assert.match(topicCardSource, /aria-controls=\{evidencePanelId\}/);
  assert.match(topicCardSource, /事实来源/);
  assert.match(topicCardSource, /热度来源/);
  assert.match(topicCardSource, /没有可展示的证据来源/);
  assert.match(topicCardSource, /resolveSafeHttpUrl\(card\?\.sourceUrl\)/);
  assert.doesNotMatch(topicCardSource, /const safeEvidenceUrl/);
  assert.match(topicCardSource, /formatPublicationTime\(card\?\.date\)/);
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

test('raw social posts stay visual while GitHub and official sources move to fact evidence', () => {
  assert.match(dashboardSource, /partitionTopicEvidence\(uniqueTrending\)/);
  assert.match(dashboardSource, /const \{ socialPosts, factEvidence \}/);
  assert.match(dashboardSource, /const hotPicks = socialPosts\.slice\(0, 6\)/);
  assert.match(dashboardSource, /原始帖子 \{socialPosts\.length\} 条/);
  assert.match(dashboardSource, /事实证据 \{factEvidence\.length\} 条/);
  assert.match(dashboardSource, /事实证据/);
  assert.match(dashboardSource, /factEvidence[\s\S]{0,160}\.map/);
  assert.match(dashboardSource, /href=\{resolveOpenableSourceUrl\(item\.sourceUrl\)\}/);
  assert.match(dashboardSource, /socialPosts\.map/);
  assert.doesNotMatch(dashboardSource, /uniqueTrending\.map\(item/);
});

test('raw post actions and all-hotspots modal are keyboard and focus accessible', () => {
  assert.match(dashboardSource, /type="button"[\s\S]{0,260}onClick=\{\(\) => openSourceUrl\(item\.sourceUrl\)\}/);
  assert.doesNotMatch(dashboardSource, /<div[\s\S]{0,160}onClick=\{\(\) => openSourceUrl\(item\.sourceUrl\)\}/);
  assert.match(dashboardSource, /role="dialog"/);
  assert.match(dashboardSource, /aria-modal="true"/);
  assert.match(dashboardSource, /aria-labelledby="all-trending-title"/);
  assert.match(dashboardSource, /id="all-trending-title"/);
  assert.match(dashboardSource, /dialogRef/);
  assert.match(dashboardSource, /modalTriggerRef/);
  assert.match(dashboardSource, /handleDialogKeyDown/);
  assert.match(dashboardSource, /document\.body\.style\.overflow = 'hidden'/);
});

test('dashboard opens only safe web URLs in an isolated tab', () => {
  assert.match(dashboardSource, /window\.open\(safeUrl, '_blank', 'noopener,noreferrer'\)/);
  assert.match(dashboardSource, /openedWindow\.opener = null/);
});

test('editorial loading, dynamic text, media, and pending feedback honor UI guidance', () => {
  assert.match(radarSource, /motion-reduce:animate-none/);
  assert.match(dashboardSource, /motion-reduce:animate-none/);
  assert.doesNotMatch(dashboardSource, /transition-all/);
  assert.match(dashboardSource, /loading="lazy"/);
  assert.match(dashboardSource, /width=\{640\}/);
  assert.match(dashboardSource, /height=\{360\}/);
  assert.match(topicCardSource, /break-words/);
  assert.match(topicCardSource, /aria-live="polite"/);
  assert.match(topicCardSource, /motion-reduce:transition-none/);
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
  assert.match(appSource, /clearTopicFeedbackOwner\(topicFeedbackStateRef\.current, ownerId\)/);
  assert.match(appSource, /confirmTopicFeedbackWrite/);
  assert.match(appSource, /void confirmTopicFeedbackWrite\(ownerId\)/);
});
