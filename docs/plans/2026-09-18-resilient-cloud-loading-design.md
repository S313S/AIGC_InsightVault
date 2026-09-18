# Resilient Cloud Loading Design

## Context

The app currently gives every cloud read a fixed 12-second budget. When that
budget expires, `Promise.race` returns cached data but leaves the Supabase
request running. There is no bounded retry, no recovery-driven notice cleanup,
and every handled `SIGNED_IN` event starts a fresh data load. Intermittent
network latency can therefore become repeated stale-data warnings and
overlapping requests.

Live read-only checks on 2026-09-18 showed the four main Supabase reads
completing successfully in roughly 1.9 to 3.1 seconds. This points to an
intermittent client/network resilience problem rather than a consistently slow
query.

## Goals

- Keep the existing cache-first experience.
- Abort timed-out or superseded Supabase reads so they do not remain in flight.
- Retry only the failed read once with a bounded second timeout.
- Avoid redundant reloads for repeated sign-in events for the same user.
- Clear the warning automatically after a successful recovery.
- Keep a final warning actionable with retry and dismiss controls.
- Make the failing data slice and attempt duration visible in diagnostics.

## Non-goals

- Replacing Supabase or moving all reads behind a new backend endpoint.
- Changing database schemas or row-level security policies.
- Deploying the change automatically.

## Architecture

### Abortable read boundary

The five initial-load read functions accept an optional `AbortSignal` and pass
it to the Supabase query builder through `abortSignal`. The collection-count
pagination loop applies the same signal to every page.

### Bounded retry helper

A shared helper receives an operation factory instead of an already-started
promise. Each attempt creates its own `AbortController`. The first attempt has
a 12-second timeout; one retry follows after a short delay and has an 18-second
timeout. A timed-out attempt is aborted before the retry starts.

The helper returns a structured result containing success state, value, final
reason, attempt count, and elapsed time. It never retries an operation after a
parent load has been superseded.

### Load ownership

`App` keeps one controller for the active load. Starting a newer load aborts the
older one. Component cleanup also aborts the active load. The existing request
ID check remains as a state-update guard.

Repeated `SIGNED_IN` events for the same already-loaded user do not reload all
data. Actual sign-in, sign-out, and user changes still reload as needed.

## Data Flow

1. Render the stored or in-memory snapshot immediately when available.
2. Start primary card and trending reads in parallel.
3. Abort and retry only a failed primary read once.
4. Merge successful slices without replacing preserved data from failed slices.
5. Start collections, collection counts, and task reads in parallel.
6. Apply the same per-slice abort/retry behavior.
7. Clear any previous notice when all required slices recover.
8. Show the final warning only after retries are exhausted.

## Error Handling and UI

The final notice continues to explain that cached data remains visible. It also
provides:

- `立即重试`, which starts a background reload without hiding cached content.
- `关闭`, which dismisses the notice without changing data.

Console diagnostics include the read label, attempt number, elapsed time, and
normalized reason. Expected aborts caused by a newer load are not presented as
cloud failures.

## Testing

- Unit test that a timed-out attempt aborts before retrying.
- Unit test that a second attempt can recover and reports two attempts.
- Unit test that exhausted retries preserve the fallback and final reason.
- Unit test that parent cancellation prevents a retry.
- Unit test for suppressing redundant same-user `SIGNED_IN` reloads.
- Source-shape tests ensuring initial Supabase reads forward `AbortSignal`.
- Notice tests for retry and dismiss behavior where practical.
- Full `npm test` and production `npm run build` verification.

## Rollout and Remaining Risk

This change improves client resilience but cannot eliminate a prolonged outage
or a consistently unreachable Supabase region. If post-fix diagnostics show a
specific query regularly consuming the full second-attempt budget, the next
step is a query/index or backend aggregation investigation rather than a longer
client timeout.
