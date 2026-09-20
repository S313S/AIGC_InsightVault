# Trending Homepage Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refresh homepage trending content after a successful manual fetch and provide a manual refresh button beside the fetch control.

**Architecture:** Keep data ownership in `App.tsx` and pass a refresh callback into `SettingsModal`. Reuse the existing `loadData` workflow so manual refresh and browser refresh resolve data through the same state/cache path.

**Tech Stack:** React 19, TypeScript, Vite, Node test runner

---

### Task 1: Add the regression test

**Files:**
- Create: `scripts/trending-homepage-refresh.test.mjs`

**Step 1:** Assert that `SettingsModal` exposes the refresh callback, calls it after a successful fetch, and renders a manual update button.

**Step 2:** Assert that `App.tsx` connects the callback to the existing non-blocking `loadData` path.

**Step 3:** Run `node --test scripts/trending-homepage-refresh.test.mjs` and verify it fails because the feature is absent.

### Task 2: Implement the refresh workflow

**Files:**
- Modify: `components/SettingsModal.tsx`
- Modify: `App.tsx`

**Step 1:** Add a typed `onRefreshHomepage` callback and refresh-in-progress state.

**Step 2:** Add a helper that invokes the callback, reports manual success/failure, and returns whether refresh succeeded.

**Step 3:** Call the helper after a successful fetch without converting refresh failure into fetch failure.

**Step 4:** Render the persistent `更新首页热点` button beside `启动热点抓取`.

**Step 5:** Make `loadData` report whether trending data refreshed, then pass a callback from `App.tsx` that invokes it without the loading overlay.

### Task 3: Verify and review

**Files:**
- Test: `scripts/trending-homepage-refresh.test.mjs`

**Step 1:** Run the focused regression test and verify it passes.

**Step 2:** Run `npm test` and verify the full suite passes.

**Step 3:** Run `npm run build` and verify TypeScript/Vite production compilation succeeds.

**Step 4:** Review the TSX changes for hook, accessibility, rendering, and TypeScript issues.
