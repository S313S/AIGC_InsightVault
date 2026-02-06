#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadDotEnv(path.resolve(process.cwd(), '.env'));
loadDotEnv(path.resolve(process.cwd(), '.env.local'));

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const ONLY_COLLECTIONS = args.has('--only-collections');
const ONLY_CARDS = args.has('--only-cards');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase env vars. Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const usingServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!usingServiceRole) {
  console.warn('[warn] SUPABASE_SERVICE_ROLE_KEY not found. Write/delete may fail due to RLS.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const PAGE_SIZE = 1000;

const toArray = (v) => (Array.isArray(v) ? v : []);
const normText = (v) => String(v || '').trim().toLowerCase();
const compact = (arr) => arr.filter(Boolean);
const uniq = (arr) => Array.from(new Set(arr));

const normalizeSourceUrl = (url) => {
  const raw = String(url || '').trim();
  if (!raw || raw === '#') return '';
  try {
    const u = new URL(raw);
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return raw.split('?')[0].trim();
  }
};

async function fetchAll(table, selectColumns) {
  let from = 0;
  const rows = [];
  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from(table)
      .select(selectColumns)
      .order('created_at', { ascending: true })
      .range(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

function mergeAIAnalysis(primary, incoming) {
  const p = primary || {};
  const n = incoming || {};
  const pSummary = String(p.summary || '');
  const nSummary = String(n.summary || '');

  const mergedSummary =
    nSummary.length > pSummary.length ? nSummary : pSummary;

  return {
    summary: mergedSummary,
    usageScenarios: uniq(compact([...toArray(p.usageScenarios), ...toArray(n.usageScenarios)])),
    coreKnowledge: uniq(compact([...toArray(p.coreKnowledge), ...toArray(n.coreKnowledge)])),
    extractedPrompts: uniq(compact([...toArray(p.extractedPrompts), ...toArray(n.extractedPrompts)])),
  };
}

function scoreCard(c) {
  const metrics = c.metrics || {};
  const ai = c.ai_analysis || {};
  const noteLen = String(c.user_notes || '').length;
  const summaryLen = String(ai.summary || '').length;
  const arraysLen =
    toArray(ai.usageScenarios).length +
    toArray(ai.coreKnowledge).length +
    toArray(ai.extractedPrompts).length;
  const rawLen = String(c.raw_content || '').length;
  const tagsLen = toArray(c.tags).length;
  const collectionsLen = toArray(c.collections).length;
  const metricTotal = Number(metrics.likes || 0) + Number(metrics.bookmarks || 0) + Number(metrics.comments || 0);
  const hasCover = c.cover_image ? 1 : 0;
  const vaultBonus = c.is_trending ? 0 : 200;
  return (
    vaultBonus +
    noteLen * 0.2 +
    summaryLen * 0.2 +
    arraysLen * 20 +
    rawLen * 0.02 +
    tagsLen * 8 +
    collectionsLen * 20 +
    metricTotal * 0.01 +
    hasCover * 30
  );
}

function groupCardKey(card) {
  const url = normalizeSourceUrl(card.source_url);
  if (url) return `url:${url}`;
  return `meta:${normText(card.platform)}|${normText(card.title)}|${normText(card.author)}|${normText(card.raw_content).slice(0, 120)}`;
}

async function dedupeCollections(cards, collections) {
  const refCount = new Map();
  for (const card of cards) {
    for (const cid of toArray(card.collections)) {
      refCount.set(cid, (refCount.get(cid) || 0) + 1);
    }
  }

  const groups = new Map();
  for (const col of collections) {
    const key = normText(col.name);
    const group = groups.get(key) || [];
    group.push(col);
    groups.set(key, group);
  }

  const duplicateGroups = Array.from(groups.values()).filter((g) => g.length > 1);
  const aliasToCanonical = {};
  const duplicateCollectionIds = [];

  for (const group of duplicateGroups) {
    group.sort((a, b) => {
      const refDiff = (refCount.get(b.id) || 0) - (refCount.get(a.id) || 0);
      if (refDiff !== 0) return refDiff;
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });
    const canonical = group[0];
    for (let i = 1; i < group.length; i += 1) {
      aliasToCanonical[group[i].id] = canonical.id;
      duplicateCollectionIds.push(group[i].id);
    }
  }

  let cardsNeedingUpdate = 0;
  for (const card of cards) {
    const next = uniq(toArray(card.collections).map((cid) => aliasToCanonical[cid] || cid));
    const prev = toArray(card.collections);
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      cardsNeedingUpdate += 1;
      if (APPLY) {
        const { error } = await supabase.from('knowledge_cards').update({ collections: next }).eq('id', card.id);
        if (error) throw error;
      }
    }
  }

  if (APPLY) {
    for (const id of duplicateCollectionIds) {
      const { error } = await supabase.from('collections').delete().eq('id', id);
      if (error) throw error;
    }
  }

  return {
    duplicateGroups: duplicateGroups.length,
    duplicateCollectionIds: duplicateCollectionIds.length,
    cardsNeedingUpdate,
  };
}

async function dedupeKnowledgeCards(cards) {
  const groups = new Map();
  for (const card of cards) {
    const key = groupCardKey(card);
    const group = groups.get(key) || [];
    group.push(card);
    groups.set(key, group);
  }

  const duplicateGroups = Array.from(groups.values()).filter((g) => g.length > 1);
  let updatedCanonicalCount = 0;
  let deletedCount = 0;

  for (const group of duplicateGroups) {
    const sorted = [...group].sort((a, b) => scoreCard(b) - scoreCard(a));
    const canonical = sorted[0];
    const duplicates = sorted.slice(1);

    const merged = { ...canonical };
    for (const dup of duplicates) {
      merged.collections = uniq(compact([...toArray(merged.collections), ...toArray(dup.collections)]));
      merged.tags = uniq(compact([...toArray(merged.tags), ...toArray(dup.tags)]));
      merged.metrics = {
        likes: Math.max(Number(merged.metrics?.likes || 0), Number(dup.metrics?.likes || 0)),
        bookmarks: Math.max(Number(merged.metrics?.bookmarks || 0), Number(dup.metrics?.bookmarks || 0)),
        comments: Math.max(Number(merged.metrics?.comments || 0), Number(dup.metrics?.comments || 0)),
      };
      merged.ai_analysis = mergeAIAnalysis(merged.ai_analysis, dup.ai_analysis);
      if (!merged.cover_image && dup.cover_image) merged.cover_image = dup.cover_image;
      if (!merged.source_url || merged.source_url === '#') merged.source_url = dup.source_url || merged.source_url;
      if (!merged.raw_content || String(dup.raw_content || '').length > String(merged.raw_content || '').length) {
        merged.raw_content = dup.raw_content;
      }
      if (!merged.user_notes || String(dup.user_notes || '').length > String(merged.user_notes || '').length) {
        merged.user_notes = dup.user_notes;
      }
      // If any duplicate is already in vault, keep merged in vault.
      if (merged.is_trending && !dup.is_trending) merged.is_trending = false;
    }

    const patch = {
      collections: merged.collections || [],
      tags: merged.tags || [],
      metrics: merged.metrics || { likes: 0, bookmarks: 0, comments: 0 },
      ai_analysis: merged.ai_analysis || { summary: '', usageScenarios: [], coreKnowledge: [], extractedPrompts: [] },
      cover_image: merged.cover_image || '',
      source_url: merged.source_url || '#',
      raw_content: merged.raw_content || '',
      user_notes: merged.user_notes || '',
      is_trending: Boolean(merged.is_trending),
    };

    const before = {
      collections: canonical.collections || [],
      tags: canonical.tags || [],
      metrics: canonical.metrics || { likes: 0, bookmarks: 0, comments: 0 },
      ai_analysis: canonical.ai_analysis || { summary: '', usageScenarios: [], coreKnowledge: [], extractedPrompts: [] },
      cover_image: canonical.cover_image || '',
      source_url: canonical.source_url || '#',
      raw_content: canonical.raw_content || '',
      user_notes: canonical.user_notes || '',
      is_trending: Boolean(canonical.is_trending),
    };

    if (JSON.stringify(before) !== JSON.stringify(patch)) {
      updatedCanonicalCount += 1;
      if (APPLY) {
        const { error } = await supabase.from('knowledge_cards').update(patch).eq('id', canonical.id);
        if (error) throw error;
      }
    }

    deletedCount += duplicates.length;
    if (APPLY) {
      for (const dup of duplicates) {
        const { error } = await supabase.from('knowledge_cards').delete().eq('id', dup.id);
        if (error) throw error;
      }
    }
  }

  return {
    duplicateGroups: duplicateGroups.length,
    updatedCanonicalCount,
    deletedCount,
  };
}

async function main() {
  console.log(`[start] Supabase dedupe script (${APPLY ? 'APPLY' : 'DRY-RUN'})`);
  console.log('[scope] collections duplicates + knowledge_cards duplicates');

  const [collections, cards] = await Promise.all([
    fetchAll('collections', 'id,name,cover_image,created_at'),
    fetchAll('knowledge_cards', 'id,source_url,title,author,platform,raw_content,cover_image,metrics,ai_analysis,tags,user_notes,collections,is_trending,created_at'),
  ]);

  console.log(`[loaded] collections=${collections.length}, knowledge_cards=${cards.length}`);

  if (!ONLY_CARDS) {
    const c = await dedupeCollections(cards, collections);
    console.log(`[collections] duplicate_groups=${c.duplicateGroups}, duplicate_ids=${c.duplicateCollectionIds}, cards_relinked=${c.cardsNeedingUpdate}`);
  }

  if (!ONLY_COLLECTIONS) {
    const k = await dedupeKnowledgeCards(cards);
    console.log(`[knowledge_cards] duplicate_groups=${k.duplicateGroups}, canonical_updates=${k.updatedCanonicalCount}, duplicates_to_delete=${k.deletedCount}`);
  }

  if (!APPLY) {
    console.log('[dry-run] No data was modified. Re-run with --apply to execute.');
  } else {
    console.log('[done] Dedupe changes applied.');
  }
}

main().catch((err) => {
  console.error('[error]', err?.message || err);
  process.exit(1);
});
