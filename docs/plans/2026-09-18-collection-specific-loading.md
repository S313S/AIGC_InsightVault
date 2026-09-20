# Collection-Specific Loading Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make every collection load its real Supabase members independently from the 60-card home-page window, with honest loading and error states.

**Architecture:** Add a paginated collection-membership query in the Supabase service, then keep collection results in dedicated React state so home-page offsets remain stable. Guard asynchronous results with a monotonically increasing request ID and synchronize existing card mutations into the active collection state.

**Tech Stack:** React 19, TypeScript, Supabase JS/PostgREST, Node test runner, Vite.

---

### Task 1: Add the collection-membership query

**Files:**
- Create: `scripts/collection-specific-loading.test.mjs`
- Modify: `services/supabaseService.ts:17-45,335-380`

**Step 1: Write the failing service query test**

Create a source-contract test following the existing `card-loading-shape.test.mjs` convention. Extract `getKnowledgeCardsByCollectionIds` and assert that it:

```js
test('collection card loading queries every alias id independently of the home page', () => {
  const body = extractFunctionBody('getKnowledgeCardsByCollectionIds');
  assert.equal(body.includes(".overlaps('collections', collectionIds)"), true);
  assert.equal(body.includes(".eq('is_trending', false)"), true);
  assert.equal(body.includes(".select(CARD_LIST_SELECT_FIELDS)"), true);
  assert.equal(body.includes('.range(offset, offset + COLLECTION_CARD_PAGE_SIZE - 1)'), true);
  assert.equal(body.includes('throw error'), true);
});
```

Also assert that the function cleans duplicate/blank IDs and returns early for an empty ID list.

**Step 2: Run the focused test and verify RED**

Run: `node --test scripts/collection-specific-loading.test.mjs`

Expected: FAIL because `getKnowledgeCardsByCollectionIds` does not exist.

**Step 3: Implement the minimal query**

Add `COLLECTION_CARD_PAGE_SIZE = 1000` and export:

```ts
export const getKnowledgeCardsByCollectionIds = async (
  rawCollectionIds: string[]
): Promise<KnowledgeCard[]> => {
  if (!isSupabaseConnected() || !supabase) return [];
  const collectionIds = uniqStrings(rawCollectionIds);
  if (collectionIds.length === 0) return [];

  const rows: any[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('knowledge_cards')
      .select(CARD_LIST_SELECT_FIELDS)
      .eq('is_trending', false)
      .overlaps('collections', collectionIds)
      .order('created_at', { ascending: false })
      .range(offset, offset + COLLECTION_CARD_PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < COLLECTION_CARD_PAGE_SIZE) break;
    offset += COLLECTION_CARD_PAGE_SIZE;
  }

  return dedupeCards(rows.map(row => dbToCard(row, { isDetailLoaded: false })));
};
```

**Step 4: Verify GREEN and regression safety**

Run:

```bash
node --test scripts/collection-specific-loading.test.mjs
npm test
```

Expected: focused test passes; all tests pass.

**Step 5: Commit**

```bash
git add scripts/collection-specific-loading.test.mjs services/supabaseService.ts
git commit -m "feat: query cards by collection membership"
```

### Task 2: Load and render collections independently

**Files:**
- Modify: `scripts/collection-specific-loading.test.mjs`
- Modify: `App.tsx:120-160,690-720,890-920,1165-1200,1778-1937`

**Step 1: Write failing page-state tests**

Add source-contract tests that require:

```js
assert.match(appSource, /const \[collectionCards, setCollectionCards\]/);
assert.match(appSource, /const \[collectionLoadStatus, setCollectionLoadStatus\]/);
assert.match(appSource, /collectionLoadRequestIdRef/);
assert.match(appSource, /db\.getKnowledgeCardsByCollectionIds\(aliasIds\)/);
assert.match(appSource, /requestId !== collectionLoadRequestIdRef\.current/);
assert.match(appSource, /正在加载收藏夹内容/);
assert.match(appSource, /重新加载/);
```

Assert that `filteredCards` chooses `collectionCards` when a collection is active rather than filtering only the home-page `cards` array.

**Step 2: Run the focused test and verify RED**

Run: `node --test scripts/collection-specific-loading.test.mjs`

Expected: FAIL on the first missing independent-state assertion.

**Step 3: Add independent state and request protection**

Add:

```ts
type CollectionLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';
const [collectionCards, setCollectionCards] = useState<KnowledgeCard[]>([]);
const [collectionLoadStatus, setCollectionLoadStatus] = useState<CollectionLoadStatus>('idle');
const [collectionLoadError, setCollectionLoadError] = useState('');
const collectionLoadRequestIdRef = useRef(0);
```

Create `loadCollectionCards(collectionId)` that gets alias IDs, increments the request ID, clears old results, calls the new service method, ignores stale responses, and sets `loaded` or `error` appropriately. Call it from `handleCollectionClick` and from the retry button.

Create `closeCollectionView()` to increment the request ID, clear collection state, and close the view. Reuse it from the close button and main navigation.

Change filtering to:

```ts
const sourceCards = currentCollectionId ? collectionCards : cards;
return sourceCards.filter(...);
```

**Step 4: Render honest states**

Before the normal grid/empty-state branch:

- render a loading indicator while status is `loading`;
- render the stored error and a retry button while status is `error`;
- render “这个收藏夹暂时为空” only when status is `loaded` and the filtered result is empty.

Do not expose the home-page `hasMoreCards` button while a collection is active.

**Step 5: Verify GREEN**

Run:

```bash
node --test scripts/collection-specific-loading.test.mjs
npm test
npm run build
```

Expected: all tests pass and Vite build exits 0.

**Step 6: Commit**

```bash
git add scripts/collection-specific-loading.test.mjs App.tsx
git commit -m "fix: load complete collection contents"
```

### Task 3: Keep collection interactions consistent

**Files:**
- Modify: `scripts/collection-specific-loading.test.mjs`
- Modify: `App.tsx:690-720,918-970,1120-1165,1320-1385`

**Step 1: Write failing interaction-sync tests**

Add assertions that existing handlers update the independent collection state:

```js
assert.match(syncLoadedCardBody, /setCollectionCards/);
assert.match(handleDeleteCardBody, /setCollectionCards/);
assert.match(handleUpdateCardBody, /setCollectionCards/);
assert.match(handleRemoveSelectedBody, /collectionCards/);
```

Also require selection permission checks to search both `cards` and `collectionCards`.

**Step 2: Run the focused test and verify RED**

Run: `node --test scripts/collection-specific-loading.test.mjs`

Expected: FAIL because mutation handlers do not yet synchronize collection state.

**Step 3: Synchronize single-card operations**

- `syncLoadedCard`: replace the matching card in `collectionCards`.
- `handleUpdateCard`: use `syncLoadedCard(updatedCard)` instead of separate duplicated updates.
- `handleDeleteCard`: remove the card from `collectionCards` on success/offline removal.
- `toggleCardSelection`: resolve the target from `collectionCards` as well as `cards`.

**Step 4: Make bulk removal operate on displayed collection cards**

Build updated cards from `collectionCards`, update each selected card's membership, remove selected cards from the active collection list, and mirror updated objects into the home-page `cards` array when present. Persist every changed card through the existing `db.updateCard` loop and decrement item counts using the removed alias IDs.

**Step 5: Verify GREEN**

Run:

```bash
node --test scripts/collection-specific-loading.test.mjs
npm test
npm run build
git diff --check
```

Expected: all tests pass, build exits 0, and no whitespace errors are reported.

**Step 6: Commit**

```bash
git add scripts/collection-specific-loading.test.mjs App.tsx
git commit -m "fix: sync collection card interactions"
```

### Task 4: Live read-only acceptance check

**Files:**
- No production file changes expected.

**Step 1: Verify the cloud evidence remains intact**

Run the existing read-only Supabase diagnostic and confirm `productsNew` still has one member outside the first 60 home-page rows.

**Step 2: Run the full verification suite fresh**

Run:

```bash
npm test
npm run build
git diff --check
git status --short --branch
```

Expected: all tests pass, build exits 0, no diff-check errors, and only expected branch commits are present.

**Step 3: Review the branch diff**

Run:

```bash
git diff main...HEAD --stat
git diff main...HEAD -- App.tsx services/supabaseService.ts scripts/collection-specific-loading.test.mjs
```

Confirm there are no changes to auth, timeout/retry infrastructure, Supabase schema, or cloud data.
