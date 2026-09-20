# Instant Startup and Freshness Design

## Context

InsightVault currently blocks the entire interface behind a loading overlay while
it restores the Supabase session. Only after that step does `loadData` read the
stored snapshot. A warm launch therefore waits on authentication before using
data that is already on the device. A cold launch can wait through the primary
read timeout and retry before any useful content appears.

The homepage also presents static freshness language such as `今日 +124` and
`实时`. Those labels do not describe the loaded records, so a successful load
still does not tell the user what changed since the previous visit.

## Goals

- Render a safe local snapshot before waiting for authentication or cloud reads.
- Never cover usable cached content with a full-screen loading overlay.
- Refresh cloud data in the background and keep cached data visible on failure.
- Show a truthful last-sync time and the number of newly arrived trending items.
- Keep private snapshots isolated by user and clear the active-user bootstrap
  pointer on sign-out.
- Add measurable startup milestones so later infrastructure spending is based on
  observed latency.

## Non-goals

- Replacing Supabase or Vercel.
- Building a general offline editing/conflict-resolution engine.
- Implementing database change logs or tombstones in this iteration.
- Purchasing or changing a paid plan before client-side startup behavior is
  corrected and measured.

## Architecture

### Snapshot envelope

Stored snapshots gain metadata while remaining backward compatible:

- `savedAt`: when the device persisted the snapshot.
- `syncedAt`: when all required cloud reads last completed successfully.
- `ownerId`: authenticated owner ID, or `null` for the public guest snapshot.

The storage module maintains a small `last active owner` pointer. It is written
only after an authenticated snapshot has been persisted, and removed on
sign-out. Startup uses the pointed snapshot only when its envelope owner matches
the pointer. Guest snapshots are always safe to bootstrap.

### Synchronous bootstrap

The initial React state is created from storage during the first render. If a
valid snapshot exists, cards, trending items, collections, and tasks are present
immediately and the full-screen loading overlay is skipped. Authentication and
cloud synchronization begin after the first render.

If no valid snapshot exists, the application renders its normal shell with
skeleton placeholders. A full-screen blocking overlay is not used for routine
data loading.

### Background synchronization

Session restoration and the safe bootstrap render are independent. After the
session resolves, the application switches to the matching user snapshot when
necessary and calls the existing resilient cloud loader without hiding current
content.

The existing per-slice retry and abort behavior remains. Successful cloud data
is merged into the visible snapshot. Failed slices preserve their previous
values and show a non-blocking retry notice.

This iteration continues to fetch the bounded card and trending lists rather
than introducing a partial delta protocol that cannot represent deletions. A
later database-backed change log can add true delta sync if measurements show
the remaining network payload is material.

## Homepage Freshness Experience

The dashboard receives three truthful values:

- last successful synchronization time;
- whether a background refresh is active;
- the number of trending IDs returned by the refresh that were absent before it.

The static `今日 +124` and `实时` labels are removed. The header instead shows
states such as `正在后台更新`, `刚刚同步`, or `同步于 09:42`. When new items
arrive, it shows `新增 8 条` without interrupting browsing.

The first implementation updates the visible list when synchronization finishes
and uses the new-item count as confirmation. It does not hold new data behind a
separate inbox action.

## Error and Privacy Handling

- Cached content remains visible during timeouts, retries, and offline periods.
- A warning never replaces content with an empty state.
- User-specific cache keys remain namespaced by user ID.
- The bootstrap pointer is cleared during explicit sign-out.
- Invalid, mismatched, or malformed snapshot envelopes are ignored.
- Legacy snapshots remain readable and are upgraded on the next successful
  persist.

## Performance Targets

- Warm start cached content visible: p75 under 500 ms.
- Background cloud refresh complete: p75 under 3 seconds and p95 under 6 seconds
  under normal connectivity.
- No full-screen loader when any usable snapshot is available.
- Offline warm start remains browsable.

Development instrumentation records bootstrap-read, cached-content-visible, and
cloud-sync-complete milestones. Production UI exposes only the user-facing sync
state.

## Testing

- Snapshot-envelope unit tests for legacy compatibility, owner matching,
  bootstrap selection, timestamps, and pointer clearing.
- Startup source/integration tests proving storage is read before the auth wait
  and cached content disables the blocking overlay.
- Freshness-state tests for syncing, successful sync, new-item counts, and
  failed background refresh.
- Regression coverage for authenticated/guest cache isolation and sign-out.
- Full Node test suite and Vite production build.
- Browser verification for warm reload, cold shell, offline cached reload, and
  background refresh behavior.

## Rollout

Ship the client-side startup correction first and collect timings. If cold-start
or refresh latency still misses the targets, the next step is a single homepage
bootstrap endpoint or CDN snapshot for public trending data. Supabase or Vercel
upgrades should follow measured backend or cold-start constraints rather than
precede this correction.
