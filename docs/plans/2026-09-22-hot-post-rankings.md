# Hot Post Rankings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore a visual hot-post-first homepage, add truthful categorized rankings, and make “view all posts” include the latest successful social snapshot per platform.

**Architecture:** Fetch the complete retained trending inventory in bounded pages, then derive a presentation snapshot that keeps the newest global fact batch and the newest available batch for every social platform. Keep this data selection in a shared pure module so service behavior and UI counts can be tested independently. Reorder the dashboard without weakening existing topic, link-safety, freshness, or dialog accessibility behavior.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, Supabase JS, Node test runner.

---

### Task 1: Select complete per-platform social snapshots

**Files:**
- Modify: `shared/collectionFreshness.js`
- Modify: `services/supabaseService.ts`
- Test: `scripts/collection-freshness.test.mjs`
- Test: `scripts/card-loading-shape.test.mjs`

**Step 1: Write the failing tests**

Add fixtures with a new Twitter-only snapshot, an older Xiaohongshu snapshot, and fact evidence. Assert that the helper returns both social platforms but only facts from the newest global snapshot. Add a service-shape assertion that trending reads use bounded pagination rather than `.limit(60)`.

**Step 2: Run tests to verify they fail**

Run: `node --test scripts/collection-freshness.test.mjs scripts/card-loading-shape.test.mjs`

Expected: FAIL because the shared selector currently keeps only one global snapshot and the service reads only 60 rows.

**Step 3: Implement the minimal selection and paging behavior**

Add a pure selector that:

```js
selectHomepageTrendingCards(cards, { socialPlatforms, factPlatforms })
```

It should choose the newest valid snapshot independently for every social platform, choose the newest global snapshot for fact platforms, preserve legacy fallback behavior, and return deterministic input-order results. Replace the fixed 60-row query with repeated `.range()` reads using a bounded page size and safety cap, forwarding `AbortSignal` on every page.

**Step 4: Run focused tests**

Run: `node --test scripts/collection-freshness.test.mjs scripts/card-loading-shape.test.mjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add shared/collectionFreshness.js services/supabaseService.ts scripts/collection-freshness.test.mjs scripts/card-loading-shape.test.mjs
git commit -m "fix: restore latest social snapshots per platform"
```

### Task 2: Add truthful classification and ranking helpers

**Files:**
- Create: `shared/dashboardRankings.js`
- Create: `scripts/dashboard-rankings.test.mjs`

**Step 1: Write the failing tests**

Cover real category matches, no unrelated fallback, deterministic hotness ordering, duplicate URL removal, omission of empty categories, and safe handling of missing metrics/tags.

**Step 2: Run the test to verify it fails**

Run: `node --test scripts/dashboard-rankings.test.mjs`

Expected: FAIL because the module does not exist.

**Step 3: Implement minimal pure helpers**

Export category definitions plus helpers to dedupe social cards, select the top six posts, and build category rankings from normalized tags/title/body signals. Sort by likes, bookmarks, publication time, then stable ID.

**Step 4: Run the focused test**

Run: `node --test scripts/dashboard-rankings.test.mjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add shared/dashboardRankings.js scripts/dashboard-rankings.test.mjs
git commit -m "feat: derive truthful dashboard rankings"
```

### Task 3: Restore hot-post-first dashboard layout

**Files:**
- Modify: `components/DashboardView.tsx`
- Modify: `components/TopicRadarView.tsx`
- Modify: `scripts/topic-radar-ui.test.mjs`

**Step 1: Write failing UI source-contract tests**

Assert source order: the hot-post heading precedes categorized ranking markup, which precedes `<TopicRadarView>`, which precedes fact evidence. Assert the raw-pool collapse is removed, the all-post modal maps the complete social set, classification uses the shared helper, and fact evidence remains separate.

**Step 2: Run the test to verify it fails**

Run: `node --test scripts/topic-radar-ui.test.mjs`

Expected: FAIL because the current topic radar precedes a collapsed raw pool and no ranking section exists.

**Step 3: Implement the dashboard**

Refactor repeated post cards and ranking rows into local components, render the top six social posts immediately after status, add platform snapshot freshness labels, render non-empty category leaderboards, then render `TopicRadarView` and fact evidence. Rename the modal to “全部原帖” and keep existing dialog keyboard/focus behavior.

**Step 4: Run focused UI tests**

Run: `node --test scripts/topic-radar-ui.test.mjs scripts/dialog-focus.test.mjs scripts/source-urls.test.mjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add components/DashboardView.tsx components/TopicRadarView.tsx scripts/topic-radar-ui.test.mjs
git commit -m "feat: restore hot posts and category rankings"
```

### Task 4: Verify the complete experience

**Files:**
- Modify if needed: files identified by verification failures only

**Step 1: Run all automated tests**

Run: `npm test`

Expected: all tests pass with zero failures.

**Step 2: Run production build and diff checks**

Run: `npm run build`

Expected: exit 0.

Run: `git diff --check origin/main...HEAD`

Expected: no output.

**Step 3: Run the app against production-readable data**

Copy only the ignored local environment configuration into the worktree, start the Vite server, and verify desktop plus narrow viewport behavior in a real browser. Confirm card images, source links, all-post counts, rankings, topic order, fact separation, and browser console errors.

**Step 4: Request code review and resolve findings**

Review `origin/main...HEAD` against the approved design. Fix every critical or important finding and repeat focused plus full verification.

**Step 5: Merge and push only after acceptance**

Follow the finishing-development-branch workflow: merge the reviewed branch into local `main`, rerun the full test/build gates on merged `main`, push `main`, verify remote SHA, and verify the production deployment before reporting completion.
