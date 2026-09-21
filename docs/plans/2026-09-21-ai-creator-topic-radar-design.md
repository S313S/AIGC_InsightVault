# AI Creator Topic Radar Design

**Date:** 2026-09-21

## Goal

Turn the current post-centric trending feed into an editorial radar for an AI creator. The product should prioritize:

1. topics that can become timely, opinionated content;
2. topics worth keeping as reusable knowledge;
3. breaking AI news as a secondary lane.

The product should help the user decide what to create, why it matters, which evidence supports it, and whether it is worth revisiting later.

## Product direction

Use an editorial topic layer instead of treating every source post as an independent hotspot. Multiple posts about the same event or idea become one topic backed by traceable evidence.

The homepage contains four areas:

| Area | Target size | Purpose |
| --- | ---: | --- |
| Worth writing today | 3-5 topics | Decide what to publish and which angle to take |
| Worth studying | 3-5 topics | Save tutorials, cases, and reusable methods |
| Breaking radar | 1-3 topics | Detect launches and rapidly emerging events |
| Raw evidence | Collapsed | Inspect original sources without overwhelming the main view |

A topic may appear in more than one lane when it serves more than one purpose. The UI should explain the lane scores instead of presenting an opaque rank.

## Topic card

Each topic card includes:

- a concise statement of what changed;
- why the topic is gaining attention now;
- first-seen time, latest evidence time, and momentum direction;
- represented platforms, authors, and source count;
- primary or official evidence when available;
- confidence and cross-source verification status;
- three possible content treatments: quick update, point of view, and tutorial or case study;
- reusable knowledge worth retaining;
- actions for `Save for research`, `Ignore`, and `Published`.

The raw posts remain evidence attached to a topic. They are no longer the primary homepage unit.

## Ranking priorities

The default overall opportunity score is:

- 35% creator usefulness;
- 25% durable knowledge value;
- 20% momentum;
- 10% source confidence;
- 10% preference fit.

The three lanes also keep separate scores:

- **B / creator usefulness:** a clear change, an explainable disagreement, or enough evidence to support an opinion, tutorial, or case;
- **C / durable knowledge:** reusable methods, high information density, practical proof, and authoritative sources;
- **A / breaking:** engagement velocity, cross-platform spread, and recency.

Absolute engagement is one signal, not a hard gate. Relative performance is calculated within each source so large accounts do not automatically dominate small but valuable practitioners.

## Source strategy

Sources are divided into three roles:

1. **Fact sources:** selected AI company blogs, product changelogs, and GitHub releases. These establish what actually happened.
2. **Attention sources:** the existing Twitter/X and Xiaohongshu collectors. These reveal momentum, framing, and Chinese-market reaction.
3. **Practice sources:** GitHub activity and implementation cases. Reddit, Hacker News, and Product Hunt are deferred until the first version proves useful.

The first release retains the existing social sources and adds a curated official-source list plus GitHub releases. It does not expand indiscriminately to many platforms.

## Data flow

```text
collect raw signals
  -> normalize URL, author, published time, metrics, and source type
  -> canonical URL and semantic duplicate detection
  -> cluster related signals into a topic
  -> attach primary evidence and independent confirmations
  -> calculate B, C, A, confidence, and preference scores
  -> generate topic brief only for qualified clusters
  -> publish the three homepage lanes and preserve the evidence trail
```

The system must use the source publication time for freshness. Database insertion time and browser synchronization time are operational timestamps and must not be presented as content freshness.

## Storage model

Keep `knowledge_cards` as the raw evidence store. Add three topic-oriented entities:

- `topics`: canonical title, summary, B/C/A scores, confidence, first-seen time, latest-evidence time, trend direction, and generation status;
- `topic_sources`: topic-to-card links with evidence role, source type, and relevance;
- `topic_feedback`: owner-scoped save, ignore, and published events.

Topic history is retained. The system must not discard all but the latest snapshot because historical observations are needed to calculate momentum and determine whether a topic is rising or fading.

## Run strategy

- Guarantee at least one complete collection run per day.
- Run incremental scans every six hours when the hosting plan permits it.
- Breaking radar uses evidence from the latest 24 hours.
- Worth writing today primarily uses the latest 72 hours.
- Worth studying may consider the latest 30 days.
- Manual collection remains available and refreshes the topic lanes after a successful run.
- Scheduling is decoupled from collection logic so a hosting-plan restriction can be handled without changing the pipeline.

## Cost controls

Use a two-stage pipeline:

1. inexpensive rules perform parsing, normalization, canonical URL deduplication, candidate blocking, and initial clustering;
2. the model is called only for qualified topic clusters to refine clustering, produce the brief, and suggest content treatments.

Additional controls:

- reuse the previous topic brief when no new evidence changes the topic;
- cap source calls per run and record when a cap truncates coverage;
- avoid generated covers during ingestion; use source images or local semantic fallbacks;
- cache official-source results according to their update frequency;
- allow a partial source result to proceed without repeating successful calls.

## Failure and low-volume states

The product distinguishes these states explicitly:

- **Healthy, low volume:** all intended sources ran, but few topics qualified;
- **Partial failure:** some sources completed and others failed;
- **Complete failure:** no new ranking is published; the last successful topics remain visible with a stale warning;
- **Timeout or truncation:** the run records the completed sources and the point at which coverage stopped.

Content with an unknown or unparseable publication time may remain in a review pool but cannot enter the breaking lane.

The dashboard displays both the last successful collection time and the last browser synchronization time. When collection data exceeds the freshness threshold, the dashboard must show an explicit stale-data warning instead of saying that hotspots were just updated.

## First-release sequence

### Phase 1: restore trustworthy updates

- correct and test the intended schedule;
- expose per-source run health and the collection funnel;
- separate sync time from collection time;
- add stale-data warnings and preserve the last good result.

### Phase 2: introduce the topic layer

- normalize and deduplicate the existing Twitter/X and Xiaohongshu signals;
- cluster evidence into topics;
- compute B/C/A and confidence scores;
- render the three lanes and feedback actions.

### Phase 3: strengthen evidence

- add a curated set of official AI sources;
- add GitHub releases and selected project activity;
- connect official evidence to existing social topics;
- tune the preference score from save, ignore, and published feedback.

The first release excludes full-article generation, automatic publishing, and a complex user-profile model. Those features depend on evidence that users repeatedly save, ignore, or publish the surfaced topics.

## Testing

Automated coverage includes:

- schedule configuration and run-frequency expectations;
- publication-time parsing and freshness windows;
- URL normalization and semantic duplicate fixtures;
- deterministic B/C/A score boundaries;
- source-relative engagement scoring;
- single-source failure, total failure, timeout, and truncated-run states;
- stale collection data never being labelled as a recent collection;
- a topic receiving new evidence without creating a duplicate topic;
- owner isolation for topics, evidence links, and feedback;
- build and the existing regression suite.

## Acceptance

Use two levels of acceptance:

1. **Low-cost formal verification:** perform one real manual run and verify the run log, raw evidence, topic records, homepage lanes, timestamps, and source links end to end.
2. **Continuous verification:** observe at least three consecutive daily runs before declaring production freshness reliable.

The operating target is roughly 8-15 useful topics per day, but quantity is not a hard pass condition. A low count is acceptable only when the system proves that the intended sources completed and explains how the collection and filtering funnel produced the result.

The product succeeds when the user can consistently identify a publishable angle or a reusable research item from the topic lanes, not merely when the collector inserts more rows.
