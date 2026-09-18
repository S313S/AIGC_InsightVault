# Resilient Cloud Loading Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make initial Supabase loading cancelable, retry transient failures once, avoid redundant same-user reloads, and give users an actionable warning only after recovery is exhausted.

**Architecture:** Add a generic operation-factory retry helper so each timed attempt owns an `AbortController`. Forward the signal through the five Supabase read boundaries, then let `App` own and cancel the active load while preserving its existing cache-first slice merge. Keep authentication deduplication and notice actions in small independently tested helpers or source-shape contracts.

**Tech Stack:** React 19, TypeScript, Supabase JS/PostgREST, Node built-in test runner, Vite.

---

### Task 1: Add an aborting bounded-retry helper

**Files:**
- Modify: `shared/asyncTimeout.js`
- Modify: `scripts/async-timeout.test.mjs`

**Step 1: Write the failing timeout-abort test**

Add a test that calls the wished-for API and records the signal from each attempt:

```js
test('withTimeoutRetryResult aborts a timed-out attempt before retrying', async () => {
  const signals = [];
  const result = await withTimeoutRetryResult(
    async signal => {
      signals.push(signal);
      return new Promise(() => {});
    },
    { attemptTimeouts: [10, 10], retryDelayMs: 0 },
    'fallback'
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'timeout');
  assert.equal(result.attempts, 2);
  assert.equal(signals.length, 2);
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, true);
});
```

**Step 2: Run the focused test and verify RED**

Run: `node --test scripts/async-timeout.test.mjs`

Expected: FAIL because `withTimeoutRetryResult` is not exported.

**Step 3: Implement the minimal helper**

Export a helper with this interface:

```js
withTimeoutRetryResult(operation, {
  attemptTimeouts,
  retryDelayMs,
  signal,
}, fallbackValue)
```

For each attempt:

- stop immediately with reason `aborted` if the parent signal is aborted;
- create an attempt controller and forward parent cancellation to it;
- race the operation factory against that attempt's timeout;
- abort the controller when the timeout wins;
- wait the configured delay before the next attempt;
- return `{ ok, value, reason, attempts, elapsedMs }`.

Keep the existing `withTimeoutResult` and `withTimeout` exports unchanged for callers outside initial loading.

**Step 4: Run the focused test and verify GREEN**

Run: `node --test scripts/async-timeout.test.mjs`

Expected: PASS.

**Step 5: Add recovery, exhaustion, and parent-cancellation tests**

Add separate tests proving:

```js
// Attempt 1 never settles, attempt 2 returns "recovered".
assert.deepEqual(result.value, 'recovered');
assert.equal(result.attempts, 2);

// Two rejected attempts preserve fallback and the final error.
assert.equal(result.ok, false);
assert.equal(result.value, 'fallback');

// Aborting the parent during the retry delay prevents attempt 2.
assert.equal(attempts, 1);
assert.equal(result.reason, 'aborted');
```

**Step 6: Run tests and commit**

Run: `node --test scripts/async-timeout.test.mjs`

Expected: all async-timeout tests PASS.

```bash
git add shared/asyncTimeout.js scripts/async-timeout.test.mjs
git commit -m "fix: add aborting cloud read retries"
```

### Task 2: Forward cancellation through Supabase reads

**Files:**
- Modify: `services/supabaseService.ts`
- Modify: `scripts/card-loading-shape.test.mjs`
- Modify: `scripts/collection-counts.test.mjs`

**Step 1: Write failing source-shape tests**

Extend the tests to require:

```js
assert.equal(getKnowledgeCardsBody.includes('signal'), true);
assert.equal(getKnowledgeCardsBody.includes('.abortSignal(signal)'), true);
assert.equal(getTrendingCardsBody.includes('.abortSignal(signal)'), true);
assert.equal(getCollectionCountsBody.includes('.abortSignal(signal)'), true);
```

Also require the initial-load read functions to throw Supabase read errors instead of converting them into successful empty arrays.

**Step 2: Run focused tests and verify RED**

Run:

```bash
node --test scripts/card-loading-shape.test.mjs scripts/collection-counts.test.mjs
```

Expected: FAIL because the functions do not yet accept or forward a signal.

**Step 3: Implement abortable reads**

Update these functions:

- `getKnowledgeCards(options)` with `options.signal?: AbortSignal`;
- `getTrendingCards(signal?)`;
- `getCollections(signal?)`;
- `getCollectionItemCounts(signal?)`;
- `getTasks(signal?)`.

Build each read query, conditionally apply `.abortSignal(signal)`, then await it. Apply the signal to every page inside the collection-count loop. Throw on read errors so the retry layer can distinguish a failure from a valid empty result.

**Step 4: Run focused tests and verify GREEN**

Run:

```bash
node --test scripts/card-loading-shape.test.mjs scripts/collection-counts.test.mjs
```

Expected: PASS.

**Step 5: Compile and commit**

Run: `npm run build`

Expected: Vite build exits 0.

```bash
git add services/supabaseService.ts scripts/card-loading-shape.test.mjs scripts/collection-counts.test.mjs
git commit -m "fix: cancel timed out Supabase reads"
```

### Task 3: Suppress redundant same-user sign-in reloads

**Files:**
- Modify: `shared/authEvents.js`
- Modify: `scripts/auth-events.test.mjs`

**Step 1: Write the failing same-user test**

```js
test('does not reload for a repeated sign-in of the already loaded user', () => {
  assert.equal(shouldReloadOnAuthEvent('SIGNED_IN', {
    currentUserId: 'user-1',
    nextUserId: 'user-1',
    hasCompletedInitialLoad: true,
  }), false);
});
```

Add positive tests for a new user, initial sign-in before data has loaded, sign-out, and user update.

**Step 2: Run focused tests and verify RED**

Run: `node --test scripts/auth-events.test.mjs`

Expected: FAIL because the helper currently considers only the event name.

**Step 3: Implement the decision helper**

Keep backward-compatible defaults. Return false only for `SIGNED_IN` when an initial load has completed and `currentUserId === nextUserId` with both IDs present. Preserve existing behavior for real sign-in, sign-out, and user update events.

**Step 4: Run focused tests and verify GREEN**

Run: `node --test scripts/auth-events.test.mjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add shared/authEvents.js scripts/auth-events.test.mjs
git commit -m "fix: deduplicate repeated auth reloads"
```

### Task 4: Integrate retry ownership and actionable recovery UI

**Files:**
- Modify: `App.tsx`
- Create: `scripts/resilient-load-integration.test.mjs`

**Step 1: Write failing integration source tests**

Read `App.tsx` and assert that it contains these contracts:

```js
assert.equal(source.includes('activeLoadControllerRef.current?.abort()'), true);
assert.equal(source.includes('withTimeoutRetryResult'), true);
assert.equal(source.includes('attemptTimeouts: [12000, 18000]'), true);
assert.equal(source.includes('立即重试'), true);
assert.equal(source.includes("setLoadNotice('')"), true);
```

Also assert that `shouldReloadOnAuthEvent` receives current user ID, next user ID, and the completed-load flag.

**Step 2: Run the focused test and verify RED**

Run: `node --test scripts/resilient-load-integration.test.mjs`

Expected: FAIL because none of the integration contracts exist yet.

**Step 3: Add active-load ownership**

In `App`:

- import `withTimeoutRetryResult`;
- keep `activeLoadControllerRef`;
- abort the preceding load before starting a new one;
- pass the parent signal into every primary and secondary retry helper call;
- abort the active load during effect cleanup;
- retain request IDs to guard React state updates.

Use `[12000, 18000]` attempt timeouts and a 500 ms retry delay. Log a failed result with its label, attempt count, elapsed time, and final reason.

**Step 4: Update auth reload decisions**

Pass the current ID, session user ID, and completed-load state to `shouldReloadOnAuthEvent` before starting a reload.

**Step 5: Add retry and dismiss UI**

Add a small retry state and handlers:

- `立即重试` runs `loadData(currentUserRef.current, { showOverlay: false, preserveNotice: true })`;
- `关闭` clears the notice;
- disable the retry action while it is active;
- clear the notice after all required primary and secondary slices complete successfully.

Treat collection-count failure as a secondary partial failure so the notice accurately reflects preserved stale counts.

**Step 6: Run focused tests and verify GREEN**

Run:

```bash
node --test scripts/resilient-load-integration.test.mjs scripts/load-notice.test.mjs scripts/cache-first-load.test.mjs scripts/auth-events.test.mjs
```

Expected: PASS.

**Step 7: Review React edits**

Use `vercel:react-best-practices` to check the edited TSX for avoidable rerenders, unstable effects, or duplicated fetching.

**Step 8: Commit**

```bash
git add App.tsx scripts/resilient-load-integration.test.mjs
git commit -m "fix: recover cloud loading without stale requests"
```

### Task 5: Full verification

**Files:**
- Review: `App.tsx`
- Review: `services/supabaseService.ts`
- Review: `shared/asyncTimeout.js`
- Review: `shared/authEvents.js`

**Step 1: Run the entire test suite**

Run: `npm test`

Expected: 0 failed tests.

**Step 2: Run the production build**

Run: `npm run build`

Expected: exit code 0. The existing large-chunk warning may remain; no new compile error is acceptable.

**Step 3: Inspect repository state and commits**

Run:

```bash
git status --short
git log -6 --oneline --decorate
git diff HEAD~4..HEAD --check
```

Expected: clean worktree, four implementation commits after the design/plan commits, and no whitespace errors.

**Step 4: Do not deploy automatically**

Report the local commits, verification evidence, behavior change, and the remaining production-validation step. Leave push/deploy to explicit user direction.
