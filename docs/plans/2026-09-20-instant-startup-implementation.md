# Instant Startup and Freshness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make cached InsightVault content visible immediately, refresh cloud data without blocking the interface, and show truthful synchronization and new-content status.

**Architecture:** Persist snapshot data with owner and synchronization metadata, synchronously select a safe bootstrap snapshot during the first React render, and keep the existing resilient Supabase loader as a background reconciliation path. Add a small pure freshness model for user-facing labels and new-item counts, then remove render-blocking development CDN assets from the production page.

**Tech Stack:** React 19, TypeScript, Vite 6, Supabase JS, browser localStorage, Node test runner, Tailwind CSS build pipeline

---

## Working-tree constraint

`App.tsx` and `components/SettingsModal.tsx` already contain an unrelated,
uncommitted homepage-refresh feature. Preserve those changes. Do not restore,
overwrite, or include them in commits for this plan. When a commit touches
`App.tsx`, stage only the instant-startup hunks.

### Task 1: Add owner-aware snapshot metadata and bootstrap selection

**Files:**
- Modify: `shared/dataSnapshot.js`
- Modify: `scripts/data-snapshot.test.mjs`

**Step 1: Write the failing tests**

Add tests covering:

```js
test('writeStoredSnapshot persists owner and sync metadata', () => {
  // install a small in-memory localStorage mock
  // write a user snapshot with syncedAt
  // assert data and metadata are both readable
});

test('readBootstrapSnapshot prefers the active authenticated owner', () => {
  // store guest and user snapshots, mark user-1 active, assert user-1 returns
});

test('readBootstrapSnapshot falls back to the public guest snapshot', () => {
  // no valid active owner record; assert guest data is returned
});

test('clearActiveSnapshotOwner prevents private bootstrap reuse', () => {
  // clear pointer and assert bootstrap returns guest data
});

test('legacy snapshots remain readable', () => {
  // seed the existing raw snapshot JSON and assert readStoredSnapshot works
});
```

**Step 2: Run the focused test and verify failure**

Run: `node --test scripts/data-snapshot.test.mjs`

Expected: FAIL because the metadata/bootstrap functions do not exist.

**Step 3: Implement the storage helpers**

Keep the existing snapshot payload key and add separate metadata/pointer keys:

```js
export const ACTIVE_SNAPSHOT_OWNER_KEY = 'insight-vault:active-snapshot-owner';

export const buildSnapshotMetaStorageKey = (userId) =>
  `insight-vault:snapshot-meta:${userId || 'guest'}`;

export const readStoredSnapshotRecord = (userId) => ({
  snapshot: readStoredSnapshot(userId),
  ownerId: userId || null,
  savedAt: metadata?.savedAt || null,
  syncedAt: metadata?.syncedAt || null,
});
```

Implement `readBootstrapSnapshot()` to prefer a valid active-owner record and
fall back to the guest record. Extend
`writeStoredSnapshot(userId, snapshot, options = {})` so it:

- keeps the existing data key for backward compatibility;
- writes `savedAt` on every persistence;
- updates `syncedAt` only when supplied, otherwise preserves the prior value;
- marks a non-null user as the active snapshot owner.

Add `clearActiveSnapshotOwner()` and guard every browser-storage access for SSR.

**Step 4: Run the focused test and verify success**

Run: `node --test scripts/data-snapshot.test.mjs`

Expected: PASS.

**Step 5: Commit only this task**

```bash
git add shared/dataSnapshot.js scripts/data-snapshot.test.mjs
git commit -m "feat: add owner-aware startup snapshots"
```

### Task 2: Add a pure synchronization freshness model

**Files:**
- Create: `shared/syncFreshness.js`
- Create: `scripts/sync-freshness.test.mjs`

**Step 1: Write the failing tests**

Cover the exact behavior:

```js
test('counts only newly returned trending ids', () => {
  assert.equal(countNewItemIds([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }]), 1);
});

test('reports background refresh without hiding the previous sync', () => {
  assert.equal(getSyncLabel({ isSyncing: true, lastSyncedAt: 1 }), '正在后台更新');
});

test('reports never-synced initial loading honestly', () => {
  assert.equal(getSyncLabel({ isSyncing: true, lastSyncedAt: null }), '正在获取最新数据');
});
```

Also test `刚刚同步`, `N 分钟前同步`, and `同步于 HH:mm` with an explicit
`now` argument.

**Step 2: Run the focused test and verify failure**

Run: `node --test scripts/sync-freshness.test.mjs`

Expected: FAIL because `shared/syncFreshness.js` does not exist.

**Step 3: Implement minimal pure helpers**

Export `countNewItemIds(previousItems, nextItems)` and
`getSyncLabel({ isSyncing, lastSyncedAt, now = Date.now() })`.

**Step 4: Run the focused test and verify success**

Run: `node --test scripts/sync-freshness.test.mjs`

Expected: PASS.

**Step 5: Commit only this task**

```bash
git add shared/syncFreshness.js scripts/sync-freshness.test.mjs
git commit -m "feat: model background sync freshness"
```

### Task 3: Bootstrap React state synchronously and reconcile in the background

**Files:**
- Modify: `App.tsx`
- Create: `scripts/instant-startup.test.mjs`
- Modify: `scripts/cache-first-load.test.mjs`

**Step 1: Write failing source/integration assertions**

Assert that `App.tsx`:

- calls `readBootstrapSnapshot` from a lazy state initializer before auth hydration;
- initializes cards, trending, collections, tasks, and chat scope from that snapshot;
- initializes the blocking-load state to false when the snapshot has data;
- tracks `loadedOwnerIdRef`, `isSyncing`, `lastSyncedAt`, and `newTrendingCount`;
- calls the first `loadData` with `showOverlay: false`;
- clears the active snapshot owner from both explicit logout paths;
- no longer renders the fixed full-screen loading overlay.

**Step 2: Run the focused tests and verify failure**

Run:

```bash
node --test scripts/instant-startup.test.mjs scripts/cache-first-load.test.mjs
```

Expected: FAIL on missing bootstrap and non-blocking behavior.

**Step 3: Add lazy bootstrap state**

At the start of `App`, read the record once:

```ts
const [bootstrapRecord] = useState(() => readBootstrapSnapshot());
const bootstrapSnapshot = bootstrapRecord?.snapshot || EMPTY_SNAPSHOT;
```

Initialize the four data arrays and `chatScope` from `bootstrapSnapshot`. Seed
`lastSuccessfulDataRef`, `hasCompletedInitialLoadRef`, and `loadedOwnerIdRef`
consistently. Do not mutate or remove the existing unrelated
`onRefreshHomepage` implementation.

**Step 4: Make `loadData` owner-aware**

Before choosing a baseline, compare the requested owner with
`loadedOwnerIdRef.current`. Reuse live/ref data only for the same owner. For an
owner change, prefer that owner's stored snapshot and otherwise use an empty
snapshot until the matching cloud response arrives. This prevents guest/private
state from being merged across accounts.

At load start set `isSyncing(true)`. On a successful trending read, calculate
the ID difference against the owner-correct baseline. Only the active request
may set `isSyncing(false)` in `finally`.

When all primary and secondary reads succeed, set `lastSyncedAt` and call:

```ts
writeStoredSnapshot(targetOwnerId, secondarySnapshot, { syncedAt });
```

Persistence caused by local mutations must preserve the prior `syncedAt` rather
than pretending a cloud refresh occurred.

**Step 5: Remove the blocking overlay and make initial hydration non-blocking**

The first hydrate call uses `showOverlay: false`. Remove the fixed loading
overlay from the JSX. Keep `isLoading` only as the cold-shell/skeleton state and
set it false when the active initial request settles.

Call `clearActiveSnapshotOwner()` before both `auth.signOut()` and
`auth.clearLocalAuthState()`.

**Step 6: Run focused tests**

Run:

```bash
node --test scripts/instant-startup.test.mjs scripts/cache-first-load.test.mjs scripts/data-snapshot.test.mjs scripts/auth-state.test.mjs scripts/auth-events.test.mjs
```

Expected: PASS.

**Step 7: Commit only instant-startup hunks**

Stage the new test normally. Stage `App.tsx` interactively and exclude the
pre-existing homepage-refresh hunks:

```bash
git add scripts/instant-startup.test.mjs scripts/cache-first-load.test.mjs
git add -p App.tsx
git commit -m "feat: render cached data before cloud hydration"
```

### Task 4: Replace static dashboard freshness claims with real state

**Files:**
- Modify: `components/DashboardView.tsx`
- Modify: `App.tsx`
- Create: `scripts/dashboard-freshness.test.mjs`

**Step 1: Write the failing regression test**

Assert that:

- `DashboardViewProps` includes `isInitialLoading`, `isSyncing`,
  `lastSyncedAt`, and `newItemsCount`;
- `DashboardView` uses `getSyncLabel`;
- the source no longer contains `今日 +124` or a static `实时` badge;
- the empty hotspot state is not shown while `isInitialLoading` is true;
- `App.tsx` passes all four props.

**Step 2: Run the focused test and verify failure**

Run: `node --test scripts/dashboard-freshness.test.mjs scripts/sync-freshness.test.mjs`

Expected: FAIL on the missing props and static labels.

**Step 3: Implement the dashboard status**

Show the sync label next to the total. If `newItemsCount > 0`, show a small
`新增 N 条` badge. During a cold initial load, render six lightweight card
skeletons in the hotspot grid instead of the confirmed-empty message. Once the
load has settled with zero items, restore the existing empty-state guidance.

**Step 4: Wire props from `App.tsx`**

Pass the four state values to `DashboardView` without altering the existing
homepage-refresh callback in `SettingsModal`.

**Step 5: Run focused tests**

Run:

```bash
node --test scripts/dashboard-freshness.test.mjs scripts/sync-freshness.test.mjs scripts/trending-homepage-refresh.test.mjs
```

Expected: PASS.

**Step 6: Commit only this feature's hunks**

```bash
git add components/DashboardView.tsx scripts/dashboard-freshness.test.mjs
git add -p App.tsx
git commit -m "feat: show truthful dashboard freshness"
```

### Task 5: Remove render-blocking Tailwind CDN compilation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `index.html`
- Modify: `index.tsx`
- Create: `styles.css`
- Create: `tailwind.config.js`
- Create: `postcss.config.js`
- Create: `scripts/production-assets.test.mjs`

**Step 1: Write the failing production-asset test**

Assert that `index.html` does not contain `cdn.tailwindcss.com`, `esm.sh`, or an
import map, and that `index.tsx` imports `./styles.css`.

**Step 2: Run the test and verify failure**

Run: `node --test scripts/production-assets.test.mjs`

Expected: FAIL because the page still loads Tailwind's browser compiler and the
legacy import map.

**Step 3: Install the build-time dependencies**

Run:

```bash
npm install --save-dev tailwindcss@3.4.17 postcss autoprefixer
```

Expected: `package.json` and the lockfile include the three development
dependencies.

**Step 4: Add the build-time configuration and CSS entry**

Use `content: ['./index.html', './**/*.{js,ts,jsx,tsx}']` in
`tailwind.config.js`. Add Tailwind's three directives and the current body and
scrollbar rules to `styles.css`. Import it from `index.tsx`.

Remove the Tailwind CDN script, import map, remote Inter stylesheet, and inline
style block from `index.html`. The Tailwind `font-sans` system stack replaces the
render-blocking font request.

**Step 5: Run the focused test and production build**

Run:

```bash
node --test scripts/production-assets.test.mjs
npm run build
```

Expected: PASS and a successful Vite build with a generated CSS asset and no
Tailwind production warning.

**Step 6: Commit**

```bash
git add package.json package-lock.json index.html index.tsx styles.css tailwind.config.js postcss.config.js scripts/production-assets.test.mjs
git commit -m "perf: compile Tailwind styles at build time"
```

### Task 6: Full verification and browser acceptance

**Files:**
- Test: `scripts/*.test.mjs`
- Verify: production build and deployed-style preview

**Step 1: Run the full automated suite**

Run: `npm test`

Expected: all tests pass, including the pre-existing homepage-refresh tests.

**Step 2: Run the production build**

Run: `npm run build`

Expected: Vite exits successfully with no TypeScript error.

**Step 3: Start a production preview**

Run: `npm run preview -- --host 127.0.0.1`

Expected: Vite prints a local preview URL.

**Step 4: Verify warm-start behavior in a browser**

Open the preview, let one sync complete, and reload. Confirm:

- cached cards are visible without a full-screen loading overlay;
- `正在后台更新` is visible while the network refresh runs;
- the last-sync label appears after success;
- the interface remains usable if the refresh fails;
- no private snapshot appears after explicit sign-out.

Record time-to-cached-content using a monotonic browser timer. Acceptance is
under 500 ms on a warm local preview.

**Step 5: Review working-tree scope**

Run:

```bash
git status --short
git diff --check
git diff --stat
```

Expected: no whitespace errors; the original homepage-refresh changes remain
present and unlost. Do not claim those unrelated changes were authored or
verified by this implementation unless their focused test was also run.
