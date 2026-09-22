# Topic Card Presentation Recovery Design

**Date:** 2026-09-22

## Problem

The production topic radar is technically traceable but fails the visual acceptance standard:

- topic cards are text-only and hide source links behind a second interaction;
- fallback briefs expose raw GitHub release Markdown as editorial copy;
- the raw post pool mixes social posts with newly inserted GitHub and official evidence, so source rows with no media and zero engagement occupy the first visible cards;
- the raw feed is ordered by database insertion time rather than source publication time.

The result no longer resembles the established image-card experience and makes the evidence pool look corrupted even though the stored source URLs remain valid.

## Accepted direction

Keep the topic layer, but recover the card-first browsing experience.

### Considered approaches

1. **Recommended: visual topic cards plus separated evidence pools.** Topic cards use a representative source image and a visible source action. Social posts remain image cards; GitHub and official sources move to a compact fact-evidence section.
2. **Restore the old raw-post homepage.** This immediately restores familiar cards but abandons the topic-level editorial value introduced by the radar.
3. **Keep text cards and add small thumbnails.** This is the smallest UI change, but it preserves hidden links, unreadable fallback copy, and source mixing.

The accepted implementation uses approach 1.

## Topic card behavior

Each topic card selects one lead source deterministically:

1. prefer an attention/social source with a safe HTTP URL and a renderable cover;
2. otherwise prefer any source with a safe URL and renderable cover;
3. otherwise use the first safe linked source and a deterministic local fallback image.

The lead image is visible at the top of the card. A visible `查看原文` link opens the selected source in an isolated tab. The existing expandable evidence list remains available for additional sources, and feedback actions remain unchanged.

Long dynamic text is clamped in the default card view so three-column layouts remain scannable. Evidence expansion remains the route to full source detail.

## Raw evidence behavior

The collapsed evidence area reports separate counts for:

- `原始帖子`: Twitter/X, Xiaohongshu, and manual social content;
- `事实证据`: GitHub and official sources.

When expanded, the existing image-card grid shows only social posts. Fact evidence is shown in a separate compact linked list that does not invent engagement metrics or pretend local fallback landscapes are source media.

Both groups are sorted by source publication time, with invalid or missing dates after valid dates. Database insertion time no longer determines which cards are visible first.

## Fallback brief behavior

Fallback generation remains deterministic and safe, but it must produce editorially readable text:

- strip Markdown headings, bullets, code fences, link destinations, and bare URLs;
- collapse the result to a concise first meaningful statement;
- qualify version-only titles with the source author or repository identity;
- label the card as a rule-generated fallback because the model brief did not succeed.

This change does not fabricate facts. It only converts already stored evidence into a readable fallback.

## Data and deployment boundaries

No database mutation or schema migration is required. GitHub and official evidence stays in `knowledge_cards` with `is_trending=true` so the topic pipeline can continue using it. Presentation logic partitions the already loaded cards without weakening topic evidence.

This branch will not push, deploy, or run a paid/live collection. Production acceptance remains a separate gate.

## Verification

Automated verification must cover:

- deterministic lead-source selection and safe links;
- direct image and source controls on topic cards;
- social/fact partitioning and publication-time ordering;
- Markdown-free fallback summaries and qualified release titles;
- preservation of evidence expansion, feedback controls, and accessibility;
- the full Node test suite and production build.

Browser verification uses a local production preview with representative topic and evidence fixtures. The visible acceptance target is: topic cards have an image and direct source action, social cards are not displaced by GitHub releases, and no raw changelog Markdown appears in the primary card surface.
