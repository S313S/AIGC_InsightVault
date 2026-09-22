# Topic Card Presentation Recovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore image-led, directly linked topic cards while separating social posts from fact evidence and making fallback briefs readable.

**Architecture:** Add small pure presentation helpers for deterministic lead-source selection and evidence partitioning, then consume them in the existing topic and dashboard components. Keep the database model unchanged. Improve the deterministic server-side fallback brief at its source so every consumer receives clean editorial text.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Node test runner, Vite.

---

### Task 1: Add evidence presentation rules

**Files:**
- Create: `shared/topicPresentation.js`
- Create: `scripts/topic-presentation.test.mjs`

**Step 1: Write the failing tests**

Add tests proving that:

- a social source with a safe URL and real cover wins over a coverless GitHub source;
- unsafe URLs are never selected as the direct source action;
- raw evidence partitions Twitter/Xiaohongshu/Manual into social posts and GitHub/Official into fact evidence;
- both partitions sort by source publication time with invalid dates last.

**Step 2: Run the focused tests and verify RED**

Run: `node --test scripts/topic-presentation.test.mjs`

Expected: FAIL because `shared/topicPresentation.js` does not exist.

**Step 3: Implement the minimal pure helpers**

Export:

- `selectTopicLeadSource(sources)`;
- `partitionTopicEvidence(cards)`;
- `sortByPublicationTime(cards)`.

Reuse `resolveSafeHttpUrl` and fallback-cover detection instead of duplicating URL rules.

**Step 4: Run the focused tests and verify GREEN**

Run: `node --test scripts/topic-presentation.test.mjs`

Expected: all focused tests pass.

**Step 5: Commit**

```bash
git add shared/topicPresentation.js scripts/topic-presentation.test.mjs
git commit -m "feat: classify topic evidence presentation"
```

### Task 2: Restore visual topic cards and direct source actions

**Files:**
- Modify: `components/TopicCard.tsx:1-202`
- Modify: `scripts/topic-radar-ui.test.mjs:20-116`

**Step 1: Add failing UI contract assertions**

Require the component to contain:

- a lead-source image using a deterministic fallback;
- image dimensions, lazy loading, and a no-referrer policy;
- an always-visible safe `查看原文` anchor;
- clamped summary, signal, and lane explanation text;
- the existing expandable evidence list and feedback controls.

**Step 2: Run the focused UI test and verify RED**

Run: `node --test scripts/topic-radar-ui.test.mjs`

Expected: FAIL because topic cards have no lead image or visible direct source action.

**Step 3: Implement the visual topic card**

Use `selectTopicLeadSource` to derive the representative card and link. Render a 16:9 lead image above the score row, falling back through the existing local cover pool. Keep the evidence disclosure and feedback controls intact. Replace the ambiguous fallback badge with `规则摘要 · 模型未生成`.

**Step 4: Run the focused tests and verify GREEN**

Run: `node --test scripts/topic-radar-ui.test.mjs scripts/topic-presentation.test.mjs`

Expected: all focused tests pass.

**Step 5: Commit**

```bash
git add components/TopicCard.tsx scripts/topic-radar-ui.test.mjs
git commit -m "fix: restore visual linked topic cards"
```

### Task 3: Separate social posts from fact evidence

**Files:**
- Modify: `components/DashboardView.tsx:77-600`
- Modify: `scripts/topic-radar-ui.test.mjs:78-116`
- Modify: `scripts/topic-presentation.test.mjs`

**Step 1: Add failing dashboard contract assertions**

Require the dashboard to:

- derive `socialPosts` and `factEvidence` from the presentation helper;
- build the image-card hot picks only from social posts;
- report both counts in the collapsed pool summary;
- show GitHub/Official sources in a separate compact `事实证据` section with direct safe links;
- make `查看全部` refer to social posts only.

**Step 2: Run the focused tests and verify RED**

Run: `node --test scripts/topic-radar-ui.test.mjs scripts/topic-presentation.test.mjs`

Expected: FAIL because all source types still share the same hot-pick array.

**Step 3: Implement the partitioned evidence UI**

Replace `hotPicks = uniqueTrending.slice(0, 6)` with publication-time-sorted social picks. Render fact evidence as compact linked rows without fabricated engagement metrics or fallback landscape images. Preserve existing keyboard and dialog behavior.

**Step 4: Run the focused tests and verify GREEN**

Run: `node --test scripts/topic-radar-ui.test.mjs scripts/topic-presentation.test.mjs`

Expected: all focused tests pass.

**Step 5: Commit**

```bash
git add components/DashboardView.tsx scripts/topic-radar-ui.test.mjs scripts/topic-presentation.test.mjs
git commit -m "fix: separate social posts from fact evidence"
```

### Task 4: Clean deterministic fallback briefs

**Files:**
- Modify: `server/topicBriefGenerator.js:89-183`
- Modify: `scripts/topic-brief-generator.test.mjs`

**Step 1: Add failing fallback tests**

Use a GitHub release fixture whose body contains headings, bullets, Markdown links, bare URLs, and a changelog. Assert that:

- the fallback summary contains no Markdown URL syntax, heading markers, or raw URL;
- the summary remains bounded and readable;
- a version-only title is qualified with the repository author;
- social-only fallback attribution remains truthful.

**Step 2: Run the focused test and verify RED**

Run: `node --test scripts/topic-brief-generator.test.mjs`

Expected: FAIL because the fallback copies `rawContent` after whitespace-only normalization.

**Step 3: Implement bounded Markdown cleanup**

Add a bounded fallback-only sanitizer that removes code fences, image/link destinations, bare URLs, heading/bullet markers, and repeated punctuation before selecting the first meaningful statement. Add a bounded version-title qualifier based on the evidence author or source identity.

**Step 4: Run the focused tests and verify GREEN**

Run: `node --test scripts/topic-brief-generator.test.mjs`

Expected: all focused tests pass.

**Step 5: Commit**

```bash
git add server/topicBriefGenerator.js scripts/topic-brief-generator.test.mjs
git commit -m "fix: make fallback topic briefs readable"
```

### Task 5: Full verification and local browser acceptance

**Files:**
- Modify only if verification exposes a scoped defect.

**Step 1: Run the full automated suite**

Run: `npm test`

Expected: all tests pass with zero failures.

**Step 2: Run the production build**

Run: `npm run build`

Expected: Vite exits successfully.

**Step 3: Start a local production preview**

Run: `npm run preview -- --host 127.0.0.1`

Expected: preview server reports a local URL.

**Step 4: Verify the browser acceptance story**

Inspect a representative topic card and expanded evidence pool. Confirm:

- topic cards visibly contain an image and direct `查看原文` action;
- social image cards appear before and separately from GitHub/Official evidence;
- fact evidence has working source links without fake engagement;
- fallback copy does not expose raw Markdown;
- browser console contains no new errors.

**Step 5: Review the branch diff**

Run: `git status --short && git diff --check && git diff origin/main...HEAD --stat`

Expected: only scoped files are changed and `git diff --check` is clean.

**Step 6: Commit any final scoped verification adjustment**

Only if Step 4 required a small correction; rerun Steps 1-5 before committing.
