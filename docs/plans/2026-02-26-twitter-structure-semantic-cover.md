# Twitter Structured Metadata + Semantic Cover Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve Twitter/X ingestion quality by generating Chinese titles, extracting post-grounded tags, and assigning strong semantic local covers without DashScope image generation.

**Architecture:** Extend Gemini analysis JSON with `suggestedTitle` and optional tool hints, then apply the new fields across import/search mapping flows. Replace Bailian cover generation with deterministic semantic cover routing: classify tweet content into Image Gen / Video Gen / Vibe Coding, pick a themed local cover from a category-specific pool, and keep media-first behavior when tweet media exists.

**Tech Stack:** Vercel serverless API routes, React + TypeScript frontend, Gemini 2.5 Flash (`/api/chat` + `services/geminiService.ts`), local SVG assets in `public/dashboard-fallbacks`.

---

### Task 1: Add AI analysis field support for title/tool extraction

**Files:**
- Modify: `types.ts`
- Modify: `services/geminiService.ts`
- Modify: `api/chat.js`

**Step 1: Update `AIAnalysis` type**
- Add optional fields:
  - `suggestedTitle?: string`
  - `toolTags?: string[]`

**Step 2: Update analysis prompt contract**
- In both frontend and server analysis prompts, require JSON keys:
  - `suggestedTitle` (Chinese 10-25 characters)
  - `toolTags` (0-5 tools/products explicitly mentioned in post text/images)

**Step 3: Normalize new fields**
- In `normalizeAIAnalysis`, sanitize:
  - `suggestedTitle` as trimmed string with max length guard
  - `toolTags` as deduped string array, max 5

**Step 4: Ensure fallback behavior**
- Keep old fallback path compatible when fields are missing or parse fails.

**Step 5: Verify typing/build consistency**
- Run: `npm run build`
- Expected: build succeeds with no type errors from new fields.

### Task 2: Add semantic cover selection utility and category routing

**Files:**
- Create: `shared/semanticCovers.js`
- Modify: `services/socialService.ts`

**Step 1: Create semantic cover utility**
- Add category enum-like constants:
  - `Image Gen`, `Video Gen`, `Vibe Coding`
- Add keyword-based classifier for content text (zh/en + known tool names).
- Add deterministic picker by hash seed from category pools.

**Step 2: Define strong semantic local pools**
- Map local assets by category (reusing local SVG pool initially with fixed index groups):
  - Image Gen: `nature-01..04`
  - Video Gen: `nature-05..07`
  - Vibe Coding: `nature-08..10`

**Step 3: Export reusable helpers**
- `inferSemanticCategory(text)`
- `pickSemanticCover({ text, seed, categoryHint })`
- Return path + source marker (e.g. `semantic_pool`).

**Step 4: Update frontend social type**
- Extend `coverImageSource` union to include `semantic_pool`.

### Task 3: Replace Twitter DashScope cover generation and enrich Twitter mapping

**Files:**
- Modify: `api/fetch-social.js`
- Modify: `api/search-social.js`

**Step 1: Remove DashScope generation branch**
- Delete `generateCoverImage` dependency path from Twitter mapping.
- Keep media-first logic: if tweet has media, use media as cover.

**Step 2: Add hashtag extraction**
- Parse hashtags from tweet text and output as `tags` in both:
  - `mapToKnowledgeCard` (fetch detail)
  - `mapTwitterSearchResult` (search list)

**Step 3: Add semantic cover fallback**
- If no media cover:
  - classify text to semantic category
  - assign local semantic cover
  - set `coverImageSource = 'semantic_pool'`

**Step 4: Keep safe fallback**
- If category cannot be inferred, default to deterministic Vibe Coding pool route.

### Task 4: Use suggested title + tool tags in card creation flows

**Files:**
- Modify: `components/MonitoringView.tsx`
- Modify: `components/AddContentModal.tsx`
- Modify: `App.tsx`

**Step 1: Monitoring import flow**
- Card title priority:
  - `result.title`
  - `analysis.suggestedTitle`
  - safe text truncation fallback
- Tag merge:
  - `result` hashtags
  - normalized category tag
  - `analysis.toolTags`

**Step 2: Manual add flow**
- Same title and tags merge rules for consistency.

**Step 3: App trending flow**
- Ensure trending card builder consumes `result.tags` from backend.
- Keep category inference as backup only.

### Task 5: Verification

**Files:**
- N/A (commands + runtime checks)

**Step 1: Build check**
- Run: `npm run build`
- Expected: PASS

**Step 2: Focused behavior checks**
- Validate one Twitter URL import through `/api/fetch-social`:
  - title is non-empty Chinese line (or deterministic fallback)
  - tags include hashtags/tools when present
  - no DashScope dependency required
- Validate Twitter search result mapping:
  - tags populated
  - no-media items get semantic local covers

**Step 3: Regression spot check**
- Ensure Xiaohongshu mapping remains unchanged.
