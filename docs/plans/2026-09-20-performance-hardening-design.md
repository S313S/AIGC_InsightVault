# Performance Hardening Design

## Context

InsightVault now renders a local snapshot before waiting for cloud data, which
reduced warm cached-content visibility to well below the 500 ms target. The
remaining work is no longer one startup bug: it is a set of independent risks
across dependency safety, initial bundle size, cloud-client startup cost,
background synchronization latency, and snapshot schema growth.

The main working tree also contains an uncommitted collection-count correction.
That change touches the same startup loader and Supabase service used by this
work, so it will be validated and committed separately before performance work
is layered on top.

## Goals

- Preserve the current cache-first experience and collection correctness.
- Remove unused dependencies and resolve high or critical production audit
  findings without forcing incompatible upgrades.
- Reduce the initial JavaScript bundle by loading non-homepage features only
  when they are opened.
- Keep Supabase initialization and background synchronization off the cached
  content critical path.
- Record truthful synchronization phase timings and reduce unnecessary network
  sequencing.
- Version, minimize, and bound local snapshots while migrating existing data.

## Non-goals

- Replacing Supabase or Vercel.
- Rewriting the whole application shell or introducing a routing framework.
- Adding a server aggregation endpoint before measurements prove it is needed.
- Purchasing a paid plan before client and query bottlenecks are measured.
- Deleting existing worktrees or unrelated user changes.

## Recommended Approach

Use a staged hardening path with one independently testable commit per concern.
This keeps rollback simple and separates correctness changes from performance
changes.

### Stage 0: Collection correctness baseline

Take ownership of the existing collection alias/count changes. Run their focused
tests and the full suite, review the query shape, and commit them independently.
No performance change should be mixed into this commit.

### Stage 1: Dependency safety

Remove `@google/genai`, which is declared but not imported by runtime code. Apply
compatible lockfile updates for vulnerable transitive packages. Do not use a
forceful audit fix or a major-version upgrade. The production audit must report
no high or critical findings before this stage is complete.

### Stage 2: Route and modal code splitting

Keep the dashboard and common card shell eager. Load settings, monitoring, chat,
add-content, login, and detail experiences through `React.lazy` and localized
`Suspense` fallbacks. Opening a lazy feature must show a lightweight in-context
placeholder rather than blanking the page.

This stage should produce real asynchronous chunks and eliminate the current
single-chunk size warning. Manual chunk configuration alone is insufficient
because it does not remove work from the initial route.

### Stage 3: Deferred cloud runtime

Replace eager Supabase service imports in the application shell with a small
lazy cloud-runtime loader. Cached state must render synchronously; cloud modules
load after the first render and are reused through a memoized import promise.

Authentication and data services remain separate internally, but the shell uses
one typed runtime boundary so feature code does not repeatedly import the whole
SDK. Failed runtime loading leaves cached content usable and surfaces the
existing non-blocking retry notice.

### Stage 4: Synchronization timing and concurrency

Track three monotonic milestones internally:

- cache bootstrap completed;
- primary cards and trending reconciliation completed;
- full synchronization completed.

Expose development diagnostics through structured console entries and keep the
production UI limited to the current truthful sync label. Start independent
collection and task reads alongside the primary reads. Collection counts may
wait for the collection aliases they require, but should not delay cards or
trending visibility.

If repeated measurements still miss the six-second full-sync target, a later
iteration may add a database RPC or homepage bootstrap endpoint.

### Stage 5: Snapshot v2

Introduce versioned keys and a v2 envelope. Persist only list fields needed by
the dashboard, collection sidebar, and task summary; omit large detail bodies
and derived/transient UI state. Bound list lengths and encoded payload size.

Read legacy snapshots once, sanitize them into v2, and rewrite them on the next
successful persistence. Invalid, oversized, or future-version payloads are
ignored safely. Explicit sign-out continues to clear the active-owner pointer.

## Data Flow

1. The first render reads a safe v2 snapshot, or migrates a valid legacy record.
2. Cached cards and navigation render immediately.
3. After mount, the cloud runtime is imported and session restoration starts.
4. Independent cloud reads begin concurrently where their data dependencies
   allow it.
5. Successful slices replace cached slices; failed slices preserve them.
6. A fully successful reconciliation writes a minimized v2 snapshot with a new
   `syncedAt` timestamp.

## Error and Privacy Handling

- A dependency or cloud-runtime load error never removes cached content.
- Storage access remains best-effort and exception-safe.
- User snapshots remain namespaced and are never merged across owners.
- Guest snapshots must not persist private records.
- Lazy-component failures use a local fallback and remain retryable on the next
  navigation or reload.
- No automated command may force dependency upgrades or delete worktrees.

## Testing

- Focused regression tests for the pending collection alias/count behavior.
- Package/source tests proving the unused SDK is removed and no prohibited audit
  findings remain.
- Source and browser tests proving non-homepage features are lazy chunks and can
  still open.
- Runtime-loader unit tests for memoization, success, and failure.
- Synchronization-plan unit tests for dependency-aware concurrency and timings.
- Snapshot-v2 tests for migration, field minimization, size limits, owner
  isolation, malformed input, and blocked storage.
- Full Node test suite, production build, production audit, and browser warm/cold
  acceptance.

## Acceptance Criteria

- Cached content is visible in under 500 ms on a warm production preview.
- The production build has multiple functional chunks and no chunk-size warning.
- Normal full synchronization aims for under six seconds; outliers remain
  non-blocking and are measurable.
- `npm audit --omit=dev` reports no high or critical vulnerabilities.
- Collection counts, sign-in/out, offline cache, and legacy-cache migration pass
  automated regression tests.

## Rollout

Land stages independently, verify after every commit, and merge locally only
after full browser acceptance. Do not push or deploy without a separate user
request. Reconsider paid infrastructure only after timing evidence identifies a
server or network bottleneck that client-side work cannot remove.
