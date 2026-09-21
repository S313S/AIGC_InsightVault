# AI Creator Topic Radar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the stale post-centric hotspot feed with a trustworthy, topic-centric editorial radar that prioritizes publishable angles and durable AI knowledge while retaining a smaller breaking-news lane.

**Architecture:** Keep `knowledge_cards` as the evidence store, add owner-scoped topic, topic-source, and feedback tables, and build topics after each successful collection run. Pure shared modules handle freshness, normalization, clustering, and deterministic scoring; a server-only pipeline persists clusters and calls Gemini only when a topic's evidence signature changes. The React app loads topics alongside existing data and renders three editorial lanes with transparent evidence and collection health.

**Tech Stack:** React 19, TypeScript, Vite, Node test runner, Supabase/Postgres with RLS, Vercel Functions and Cron, Google Gemini, `fast-xml-parser` for curated RSS/Atom sources.

---

## Delivery rules

- Execute in a dedicated `codex/ai-creator-topic-radar` worktree.
- Preserve unrelated user changes and stage only files listed by each task.
- Use TDD for every pure behavior and source parser.
- Keep production SQL application, production deployment, and the first paid/live collection run behind explicit user approval.
- Treat test/build success as local implementation evidence only; production readiness requires the final live verification gate.

### Task 1: Separate collection freshness from browser synchronization

**Files:**
- Create: `shared/collectionFreshness.js`
- Create: `scripts/collection-freshness.test.mjs`
- Modify: `vercel.json:1-8`

**Step 1: Write the failing freshness and schedule tests**

Create fixtures covering a recent collection, a stale collection, an invalid timestamp, and snapshot-tag extraction. Assert that `vercel.json` contains the daily-safe expression `0 0 * * *`, not `0 0 */2 * *`.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getLatestCollectionAt,
  getCollectionFreshness,
} from '../shared/collectionFreshness.js';

test('extracts the newest snapshot timestamp from cards', () => {
  const cards = [
    { tags: ['snapshot:2026-09-20T01:00:00.000Z'] },
    { tags: ['snapshot:2026-09-21T01:00:00.000Z'] },
  ];
  assert.equal(getLatestCollectionAt(cards), '2026-09-21T01:00:00.000Z');
});

test('marks collection data stale independently of browser sync', () => {
  assert.equal(getCollectionFreshness({
    collectedAt: '2026-09-18T00:00:00.000Z',
    now: Date.parse('2026-09-21T00:00:00.000Z'),
  }).status, 'stale');
});

test('cron guarantees one complete run per day', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.crons[0].schedule, '0 0 * * *');
});
```

**Step 2: Run the focused test and verify RED**

Run: `node --test scripts/collection-freshness.test.mjs`

Expected: FAIL because `shared/collectionFreshness.js` does not exist and the old cron expression is not daily.

**Step 3: Implement minimal freshness helpers and correct the schedule**

Export:

```js
getLatestCollectionAt(cards)
getCollectionFreshness({ collectedAt, now, staleAfterMs = 36 * 60 * 60 * 1000 })
getCollectionLabel({ collectedAt, now, status })
```

Return `unknown`, `fresh`, or `stale`; never use browser sync time as a collection timestamp. Change `vercel.json` to `0 0 * * *`, which is valid on Vercel Hobby and guarantees the design's minimum daily run.

**Step 4: Run the focused test and verify GREEN**

Run: `node --test scripts/collection-freshness.test.mjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add shared/collectionFreshness.js scripts/collection-freshness.test.mjs vercel.json
git commit -m "fix: report real hotspot collection freshness"
```

### Task 2: Make run health explicit in cron results

**Files:**
- Create: `shared/monitorRunHealth.js`
- Create: `scripts/monitor-run-health.test.mjs`
- Modify: `api/cron-monitor.js:736-1735`
- Modify: `types.ts:135-155`
- Modify: `services/supabaseService.ts:303-326`
- Modify: `components/SettingsModal.tsx:934-1100`

**Step 1: Write failing health classification tests**

Cover `healthy`, `healthy_low_volume`, `partial_failure`, `failed`, and `truncated`. Inputs are intended platforms, fetched totals, candidate count, platform errors, runtime guard, and skipped state.

```js
assert.equal(classifyMonitorRun({
  intendedPlatforms: ['twitter', 'xiaohongshu'],
  platformTotals: { twitter: { fetched: 8 }, xiaohongshu: { fetched: 0 } },
  platformErrors: [{ platform: 'xiaohongshu', error: 'timeout' }],
  candidates: 3,
}).status, 'partial_failure');
```

**Step 2: Run the focused test and verify RED**

Run: `node --test scripts/monitor-run-health.test.mjs`

Expected: FAIL because the classifier does not exist.

**Step 3: Implement health classification and persist it**

Add `runHealth` to the cron response and `result_summary`, with:

```ts
interface MonitorRunHealth {
  status: 'healthy' | 'healthy_low_volume' | 'partial_failure' | 'failed' | 'truncated' | 'skipped';
  completedPlatforms: string[];
  failedPlatforms: string[];
  explanation: string;
}
```

Derive it in every success, empty, skip, and catch path. Display the status and explanation at the top of each audit-log entry before raw JSON details.

**Step 4: Run focused and regression tests**

Run: `node --test scripts/monitor-run-health.test.mjs scripts/cron-monitor-query-builder.test.mjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add shared/monitorRunHealth.js scripts/monitor-run-health.test.mjs api/cron-monitor.js types.ts services/supabaseService.ts components/SettingsModal.tsx
git commit -m "feat: expose hotspot collection health"
```

### Task 3: Render truthful collection freshness on the homepage

**Files:**
- Modify: `App.tsx:146-176,293-421,2034-2046`
- Modify: `components/DashboardView.tsx:10-50,228-270`
- Modify: `shared/dataSnapshot.js:1-165`
- Modify: `scripts/sync-freshness.test.mjs`
- Modify: `scripts/dashboard-freshness.test.mjs`
- Modify: `scripts/data-snapshot.test.mjs`

**Step 1: Extend failing UI/source tests**

Assert that the dashboard receives `lastCollectedAt`, renders separate `热点采集` and `页面同步` labels, and shows a stale warning. Extend snapshot metadata fixtures with `collectedAt` while keeping legacy snapshots readable.

**Step 2: Run tests and verify RED**

Run: `node --test scripts/sync-freshness.test.mjs scripts/dashboard-freshness.test.mjs scripts/data-snapshot.test.mjs`

Expected: FAIL because collection freshness is not represented.

**Step 3: Implement minimal UI and cache changes**

Calculate `lastCollectedAt` from returned trending snapshot tags, persist it separately from `syncedAt`, and render:

```text
热点采集：2026-09-21 08:00
页面同步：刚刚
```

When stale, show a visible warning that includes the last successful collection time. Keep the last good cards visible.

**Step 4: Run focused tests and build**

Run: `node --test scripts/sync-freshness.test.mjs scripts/dashboard-freshness.test.mjs scripts/data-snapshot.test.mjs && npm run build`

Expected: all tests PASS and Vite build succeeds.

**Step 5: Commit**

```bash
git add App.tsx components/DashboardView.tsx shared/dataSnapshot.js scripts/sync-freshness.test.mjs scripts/dashboard-freshness.test.mjs scripts/data-snapshot.test.mjs
git commit -m "feat: distinguish collection time from sync time"
```

### Task 4: Add owner-scoped topic storage and TypeScript contracts

**Files:**
- Create: `scripts/topic-radar-schema.sql`
- Create: `scripts/topic-radar-schema.test.mjs`
- Modify: `types.ts:1-170`

**Step 1: Write a failing structural SQL test**

Assert that the migration creates `topics`, `topic_sources`, and `topic_feedback`; enables RLS; adds owner/public read policies; adds owner-only feedback policies; and creates unique `(owner_id, fingerprint)` and `(topic_id, card_id)` constraints.

**Step 2: Run the SQL structure test and verify RED**

Run: `node --test scripts/topic-radar-schema.test.mjs`

Expected: FAIL because the migration is missing.

**Step 3: Create the migration and contracts**

Add these TypeScript contracts:

```ts
export type TopicTrendDirection = 'rising' | 'steady' | 'fading' | 'new';
export type TopicFeedbackAction = 'saved' | 'ignored' | 'published';

export interface EditorialTopic {
  id: string;
  ownerId?: string;
  isPublic: boolean;
  fingerprint: string;
  title: string;
  summary: string;
  whyNow: string;
  contentAngles: { quick: string; viewpoint: string; tutorial: string };
  durableKnowledge: string[];
  writeScore: number;
  studyScore: number;
  breakingScore: number;
  confidenceScore: number;
  preferenceScore: number;
  firstSeenAt: string;
  latestEvidenceAt: string;
  trendDirection: TopicTrendDirection;
  evidenceSignature: string;
  sourceCount: number;
  platformCount: number;
  sources?: TopicSource[];
  feedback?: TopicFeedbackAction[];
}
```

Use UUID primary keys, timestamps, JSONB for angles/knowledge, numeric checks `0..100`, and cascade deletion only from a topic to its links/feedback. Do not apply the SQL to production yet.

**Step 4: Run the structure test**

Run: `node --test scripts/topic-radar-schema.test.mjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/topic-radar-schema.sql scripts/topic-radar-schema.test.mjs types.ts
git commit -m "feat: define editorial topic storage"
```

### Task 5: Normalize evidence and form deterministic topic clusters

**Files:**
- Create: `shared/topicNormalization.js`
- Create: `shared/topicClustering.js`
- Create: `scripts/topic-normalization.test.mjs`
- Create: `scripts/topic-clustering.test.mjs`

**Step 1: Write failing fixtures**

Cover:

- tracking-parameter removal without losing Xiaohongshu access tokens needed to open a source;
- normalized evidence keys that ignore removable query parameters;
- bilingual tool-name preservation (`Claude Code`, `可灵`, `Sora`);
- exact URL duplicates;
- near-duplicate titles about the same launch;
- unrelated posts that share the word `AI` but must not merge.

**Step 2: Run tests and verify RED**

Run: `node --test scripts/topic-normalization.test.mjs scripts/topic-clustering.test.mjs`

Expected: FAIL because the modules do not exist.

**Step 3: Implement the pure clustering pipeline**

Export:

```js
normalizeEvidenceUrl(url)
tokenizeTopicText(card)
buildEvidenceFingerprint(card)
clusterTopicCandidates(cards, { similarityThreshold = 0.58 } = {})
```

Use exact normalized URL matching first, then token overlap with protected tool/product phrases. Require at least one distinctive shared token beyond generic terms such as `ai`, `aigc`, `人工智能`, `教程`, and `工具`.

**Step 4: Run focused tests**

Run: `node --test scripts/topic-normalization.test.mjs scripts/topic-clustering.test.mjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add shared/topicNormalization.js shared/topicClustering.js scripts/topic-normalization.test.mjs scripts/topic-clustering.test.mjs
git commit -m "feat: cluster hotspot evidence into topics"
```

### Task 6: Score creator usefulness, durable value, breaking momentum, and confidence

**Files:**
- Create: `shared/topicScoring.js`
- Create: `scripts/topic-scoring.test.mjs`

**Step 1: Write failing score-boundary tests**

Use fixed timestamps and fixtures to prove:

- a fresh cross-platform launch ranks highly for breaking;
- a practical tutorial with code/examples ranks highly for study even with modest engagement;
- a high-like entertainment post without actionable AI content does not rank highly for write/study;
- source-relative percentiles prevent a single large account from dominating;
- official evidence raises confidence but does not manufacture momentum;
- unparseable publication time produces zero breaking eligibility.

**Step 2: Run the focused test and verify RED**

Run: `node --test scripts/topic-scoring.test.mjs`

Expected: FAIL because the scorer does not exist.

**Step 3: Implement deterministic scoring**

Export:

```js
scoreTopicCluster(cluster, { now, sourceBaselines, preferenceSignals })
selectTopicLanes(topics, { writeLimit: 5, studyLimit: 5, breakingLimit: 3 })
```

Return scores from 0 to 100. Calculate the overall opportunity as `0.35 * write + 0.25 * study + 0.20 * breaking + 0.10 * confidence + 0.10 * preference`. Keep lane eligibility separate from the overall score.

**Step 4: Run focused tests**

Run: `node --test scripts/topic-scoring.test.mjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add shared/topicScoring.js scripts/topic-scoring.test.mjs
git commit -m "feat: score editorial topic opportunities"
```

### Task 7: Generate and cache topic briefs only when evidence changes

**Files:**
- Create: `server/topicBriefGenerator.js`
- Create: `scripts/topic-brief-generator.test.mjs`
- Modify: `package.json`

**Step 1: Write failing brief and cache-decision tests**

Mock the model call. Assert strict JSON normalization for `title`, `summary`, `whyNow`, three content angles, and durable knowledge. Assert that an unchanged `evidenceSignature` reuses the stored brief and performs zero model calls. Assert deterministic fallback output on invalid JSON or provider failure.

**Step 2: Run the focused test and verify RED**

Run: `node --test scripts/topic-brief-generator.test.mjs`

Expected: FAIL because the generator does not exist.

**Step 3: Implement the server-only generator**

Use `@google/genai` with `GEMINI_API_KEY || VITE_GEMINI_API_KEY`, `gemini-2.5-flash`, JSON response mode, and text-only evidence capped by character count. Export dependency-injectable functions so tests never call the network:

```js
buildTopicBriefPrompt(cluster)
normalizeTopicBrief(value, cluster)
shouldRegenerateBrief(existingTopic, evidenceSignature)
generateTopicBrief(cluster, { generateContent })
```

Do not generate images.

**Step 4: Run focused tests**

Run: `node --test scripts/topic-brief-generator.test.mjs`

Expected: PASS with no network access.

**Step 5: Commit**

```bash
git add server/topicBriefGenerator.js scripts/topic-brief-generator.test.mjs package.json
git commit -m "feat: generate cached editorial topic briefs"
```

### Task 8: Persist topic clusters after each successful collection run

**Files:**
- Create: `server/topicRadarPipeline.js`
- Create: `scripts/topic-radar-pipeline.test.mjs`
- Modify: `api/cron-monitor.js:1530-1708`

**Step 1: Write failing pipeline tests with a fake Supabase client**

Cover first insert, existing topic update, new evidence link, unchanged evidence signature, partial model failure, and owner isolation. Assert that old topics are retained and marked by timestamps rather than batch-deleted.

**Step 2: Run the focused test and verify RED**

Run: `node --test scripts/topic-radar-pipeline.test.mjs`

Expected: FAIL because the pipeline is missing.

**Step 3: Implement and integrate the pipeline**

Export:

```js
rebuildTopicRadar({ supabase, ownerId, now, generateContent })
```

Read recent owner-scoped trending cards, cluster and score them, reuse cached briefs, upsert topics by `(owner_id, fingerprint)`, and upsert evidence links by `(topic_id, card_id)`. Add `topicRadar` counts/errors to the cron result and audit log. A topic-pipeline failure must produce `partial_failure` health and must not roll back successfully collected cards.

**Step 4: Run focused cron tests**

Run: `node --test scripts/topic-radar-pipeline.test.mjs scripts/monitor-run-health.test.mjs scripts/cron-monitor-query-builder.test.mjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add server/topicRadarPipeline.js scripts/topic-radar-pipeline.test.mjs api/cron-monitor.js
git commit -m "feat: build topic radar after collection"
```

### Task 9: Add topic reads and feedback writes to the Supabase client

**Files:**
- Modify: `services/supabaseService.ts`
- Create: `scripts/topic-service.test.mjs`

**Step 1: Write failing source-shape tests**

Assert owner/public filtering, topic ordering, nested topic-source mapping, explicit selected fields instead of `select('*')`, abort-signal forwarding, and feedback upsert conflict keys.

**Step 2: Run the focused test and verify RED**

Run: `node --test scripts/topic-service.test.mjs`

Expected: FAIL because topic service functions are absent.

**Step 3: Implement client functions**

Add:

```ts
getEditorialTopics(signal?: AbortSignal): Promise<EditorialTopic[]>
saveTopicFeedback(topicId: string, action: TopicFeedbackAction): Promise<boolean>
removeTopicFeedback(topicId: string, action: TopicFeedbackAction): Promise<boolean>
```

Guest reads only public topics and public evidence. Feedback requires the authenticated owner and never mutates raw cards.

**Step 4: Run focused tests**

Run: `node --test scripts/topic-service.test.mjs scripts/card-loading-shape.test.mjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add services/supabaseService.ts scripts/topic-service.test.mjs
git commit -m "feat: load topics and record editorial feedback"
```

### Task 10: Load and cache topics without regressing startup resilience

**Files:**
- Modify: `App.tsx`
- Modify: `shared/dataSnapshot.js`
- Modify: `shared/loadMerge.js`
- Modify: `shared/loadFallback.js`
- Modify: `scripts/data-snapshot.test.mjs`
- Modify: `scripts/load-merge.test.mjs`
- Modify: `scripts/load-fallback.test.mjs`
- Modify: `scripts/resilient-load-integration.test.mjs`

**Step 1: Add failing topic snapshot and fallback tests**

Assert that cached topics render before the network, a topic-read failure preserves the last good topics, account switching cannot leak topics, and legacy snapshots without `topics` normalize to an empty array.

**Step 2: Run focused tests and verify RED**

Run: `node --test scripts/data-snapshot.test.mjs scripts/load-merge.test.mjs scripts/load-fallback.test.mjs scripts/resilient-load-integration.test.mjs`

Expected: FAIL because topics are absent from the snapshot model.

**Step 3: Extend application loading**

Add `topics` to `LoadedSnapshot`, refs, cache, merge, fallback, and account-switch logic. Load topics in the primary data phase next to trending cards. Do not block raw trending evidence when topic loading fails.

**Step 4: Run focused tests and build**

Run: `node --test scripts/data-snapshot.test.mjs scripts/load-merge.test.mjs scripts/load-fallback.test.mjs scripts/resilient-load-integration.test.mjs && npm run build`

Expected: PASS and build succeeds.

**Step 5: Commit**

```bash
git add App.tsx shared/dataSnapshot.js shared/loadMerge.js shared/loadFallback.js scripts/data-snapshot.test.mjs scripts/load-merge.test.mjs scripts/load-fallback.test.mjs scripts/resilient-load-integration.test.mjs
git commit -m "feat: load topic radar with resilient caching"
```

### Task 11: Replace the hotspot-first homepage with editorial lanes

**Files:**
- Create: `components/TopicRadarView.tsx`
- Create: `components/TopicCard.tsx`
- Modify: `components/DashboardView.tsx`
- Modify: `App.tsx:2034-2046`
- Modify: `components/Icons.tsx`
- Create: `scripts/topic-radar-ui.test.mjs`

**Step 1: Write failing UI source tests**

Assert the three lane headings, target limits, score explanations, evidence expansion, collection freshness warning, and feedback callbacks. Assert that the raw post grid remains reachable through a collapsed evidence section rather than disappearing.

**Step 2: Run the UI test and verify RED**

Run: `node --test scripts/topic-radar-ui.test.mjs`

Expected: FAIL because the topic components are absent.

**Step 3: Implement the topic radar UI**

Render:

- `今日值得写` from write-score order;
- `值得沉淀` from study-score order;
- `突发雷达` from breaking-score order and only eligible fresh topics;
- evidence details with source badges, author, publication time, and outbound link;
- disabled feedback controls for guests and functional controls for the owner;
- existing raw hotspot modal as `原始帖子池`.

Use the existing visual system and responsive grid; do not redesign unrelated navigation.

**Step 4: Run UI tests and build**

Run: `node --test scripts/topic-radar-ui.test.mjs scripts/dashboard-freshness.test.mjs && npm run build`

Expected: PASS and build succeeds.

**Step 5: Commit**

```bash
git add components/TopicRadarView.tsx components/TopicCard.tsx components/DashboardView.tsx App.tsx components/Icons.tsx scripts/topic-radar-ui.test.mjs
git commit -m "feat: present editorial topic lanes"
```

### Task 12: Add curated official and GitHub evidence collectors

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `server/topicSources.js`
- Create: `server/sourceCollectors/officialFeeds.js`
- Create: `server/sourceCollectors/githubReleases.js`
- Create: `scripts/official-source-collector.test.mjs`
- Create: `scripts/github-release-collector.test.mjs`

**Step 1: Install the XML parser**

Run: `npm install fast-xml-parser`

Expected: dependency and lockfile update only.

**Step 2: Write failing parser tests using local fixtures**

Test RSS and Atom variants, missing dates, canonical links, GitHub prerelease exclusion, rate-limit errors, and stable source IDs. Tests must inject `fetch` and must not use the network.

**Step 3: Implement curated collectors**

Create a small allowlist for major AI product feeds and relevant GitHub repositories. Export:

```js
collectOfficialFeedSignals({ fetchImpl, now, sources })
collectGithubReleaseSignals({ fetchImpl, now, repositories, token })
```

Normalize outputs to the same evidence shape as social results, using `Platform.Official` and `Platform.GitHub`. Unknown dates remain review-only and are excluded from breaking eligibility.

**Step 4: Run focused tests**

Run: `node --test scripts/official-source-collector.test.mjs scripts/github-release-collector.test.mjs`

Expected: PASS without network access.

**Step 5: Commit**

```bash
git add package.json package-lock.json server/topicSources.js server/sourceCollectors/officialFeeds.js server/sourceCollectors/githubReleases.js scripts/official-source-collector.test.mjs scripts/github-release-collector.test.mjs
git commit -m "feat: collect official and GitHub AI evidence"
```

### Task 13: Integrate fact sources without making social collection brittle

**Files:**
- Modify: `types.ts:1-10`
- Modify: `api/cron-monitor.js`
- Modify: `components/DashboardView.tsx`
- Modify: `components/Card.tsx`
- Create: `scripts/fact-source-integration.test.mjs`

**Step 1: Write failing integration tests**

Assert that official and GitHub failures are reported per source, successful social results still persist, fact evidence raises topic confidence, and platform badges render without an exhaustive-map runtime gap.

**Step 2: Run the test and verify RED**

Run: `node --test scripts/fact-source-integration.test.mjs`

Expected: FAIL because fact collectors are not integrated.

**Step 3: Integrate collectors and health reporting**

Add `Official` and `GitHub` platforms, execute fact collectors with independent timeouts, include them in `platformTotals`, `platformErrors`, and topic evidence, and preserve partial success. Cap feed and repository calls using environment-configurable limits with conservative defaults.

**Step 4: Run integration tests and build**

Run: `node --test scripts/fact-source-integration.test.mjs scripts/monitor-run-health.test.mjs && npm run build`

Expected: PASS and build succeeds.

**Step 5: Commit**

```bash
git add types.ts api/cron-monitor.js components/DashboardView.tsx components/Card.tsx scripts/fact-source-integration.test.mjs
git commit -m "feat: enrich topics with primary-source evidence"
```

### Task 14: Run the complete local acceptance suite

**Files:**
- Modify: `README.md`
- Create: `docs/topic-radar-operations.md`

**Step 1: Document configuration and operator meanings**

Document required/optional environment variables, daily schedule, manual refresh, source caps, run-health states, freshness meanings, SQL migration order, and rollback boundaries. Explicitly distinguish configured, locally verified, deployed, and observed production states.

**Step 2: Run all automated checks**

Run: `npm test`

Expected: all existing and new tests PASS.

Run: `npm run build`

Expected: Vite build succeeds; record existing non-blocking bundle-size warnings separately.

Run: `git diff --check`

Expected: no whitespace errors.

**Step 3: Perform local fixture acceptance**

Run the topic pipeline against deterministic fixtures and verify that the output contains 3-5 write topics, 3-5 study topics, no more than 3 breaking topics, evidence links, separate collection/sync timestamps, and partial-failure status when one fixture source fails.

**Step 4: Commit documentation**

```bash
git add README.md docs/topic-radar-operations.md
git commit -m "docs: add topic radar operations guide"
```

**Step 5: Stop at the production gate**

Report local test/build evidence and request explicit approval before:

1. applying `scripts/topic-radar-schema.sql` to Supabase;
2. pushing/deploying the branch;
3. invoking a real collection run that consumes external API quota.

### Task 15: Production migration and low-cost formal verification

**Prerequisite:** Explicit user approval for production SQL, deployment, and one live collection run.

**Files:**
- Evidence only; do not change application files unless the live run exposes a defect.

**Step 1: Apply and verify the schema**

Apply `scripts/topic-radar-schema.sql`, then perform read-only checks for tables, indexes, constraints, and RLS policies.

**Step 2: Deploy the reviewed commit**

Push/deploy according to the repository's established production workflow. Verify that the production deployment contains the intended commit and cron schedule.

**Step 3: Execute one manual collection run**

Capture the response fields: raw fetched totals, filter funnel, run health, inserted/updated cards, topic counts, model-generation count, cache-reuse count, and per-source errors.

**Step 4: Verify end to end**

Confirm, in order:

- audit log persisted;
- raw evidence persisted;
- topics and topic-source links persisted;
- homepage loads the three lanes;
- timestamps distinguish collection from sync;
- outbound evidence links resolve;
- a partial source failure, if present, is visible rather than hidden.

**Step 5: Begin the three-day observation gate**

Do not claim reliable production freshness after one run. Observe three consecutive daily executions and report useful topic counts plus reasons for any low-volume day.
