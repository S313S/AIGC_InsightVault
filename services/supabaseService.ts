import { supabase, isSupabaseConnected } from './supabaseClient';
import {
    KnowledgeCard,
    Collection,
    TrackingTask,
    Platform,
    ContentType,
    TaskStatus,
    TrustedAccount,
    QualityKeyword,
    MonitorSettings
} from '../types';
import { normalizeLegacyFallbackCover } from '../shared/fallbackCovers.js';

// ============ 类型转换工具 ============

// 将数据库行转换为前端 KnowledgeCard 类型
const dbToCard = (row: any): KnowledgeCard => ({
    id: row.id,
    title: row.title,
    sourceUrl: row.source_url || '#',
    platform: row.platform as Platform,
    author: row.author || '',
    date: row.date || '',
    coverImage: normalizeLegacyFallbackCover(row.cover_image || ''),
    metrics: row.metrics || { likes: 0, bookmarks: 0, comments: 0 },
    contentType: row.content_type as ContentType,
    rawContent: row.raw_content || '',
    aiAnalysis: row.ai_analysis || { summary: '', usageScenarios: [], coreKnowledge: [], extractedPrompts: [] },
    tags: row.tags || [],
    userNotes: row.user_notes || '',
    collections: row.collections || [],
});

// 判断是否是有效的 UUID
const isValidUUID = (id: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
};

const toArray = <T,>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : []);

const uniqStrings = (arr: (string | null | undefined)[]): string[] =>
    Array.from(new Set(arr.map(v => (v || '').trim()).filter(Boolean)));

const normalizeSourceUrl = (url: string): string => {
    const raw = (url || '').trim();
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

const normalizeText = (value: string): string => (value || '').trim().toLowerCase();
const isSnapshotTag = (tag: unknown): tag is string =>
    typeof tag === 'string' && tag.startsWith('snapshot:');

const pickLatestSnapshotTag = (tags: unknown[]): string => {
    const snapshots = (Array.isArray(tags) ? tags : []).filter(isSnapshotTag);
    if (snapshots.length === 0) return 'snapshot:legacy';
    return [...snapshots].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))[0];
};

const buildCardDedupKey = (card: KnowledgeCard): string => {
    const normalizedUrl = normalizeSourceUrl(card.sourceUrl);
    if (normalizedUrl) return `url:${normalizedUrl}`;

    return `meta:${normalizeText(card.platform)}|${normalizeText(card.title)}|${normalizeText(card.author)}|${normalizeText(card.rawContent).slice(0, 120)}`;
};

const mergeAiAnalysis = (base: KnowledgeCard['aiAnalysis'], incoming: KnowledgeCard['aiAnalysis']) => {
    const baseSummary = String(base?.summary || '');
    const incomingSummary = String(incoming?.summary || '');

    return {
        summary: incomingSummary.length > baseSummary.length ? incomingSummary : baseSummary,
        usageScenarios: uniqStrings([...toArray(base?.usageScenarios), ...toArray(incoming?.usageScenarios)]),
        coreKnowledge: uniqStrings([...toArray(base?.coreKnowledge), ...toArray(incoming?.coreKnowledge)]),
        extractedPrompts: uniqStrings([...toArray(base?.extractedPrompts), ...toArray(incoming?.extractedPrompts)]),
    };
};

const scoreCardCompleteness = (card: KnowledgeCard): number => {
    const metrics = card.metrics || { likes: 0, bookmarks: 0, comments: 0 };
    const metricTotal = Number(metrics.likes || 0) + Number(metrics.bookmarks || 0) + Number(metrics.comments || 0);
    const ai = card.aiAnalysis || { summary: '', usageScenarios: [], coreKnowledge: [], extractedPrompts: [] };

    return (
        (card.userNotes?.length || 0) * 0.2 +
        (ai.summary?.length || 0) * 0.2 +
        (ai.usageScenarios?.length || 0) * 15 +
        (ai.coreKnowledge?.length || 0) * 15 +
        (ai.extractedPrompts?.length || 0) * 20 +
        (card.rawContent?.length || 0) * 0.02 +
        (card.tags?.length || 0) * 8 +
        (card.collections?.length || 0) * 20 +
        metricTotal * 0.01 +
        (card.coverImage ? 30 : 0)
    );
};

const mergeCardsForDedup = (a: KnowledgeCard, b: KnowledgeCard): KnowledgeCard => {
    const primary = scoreCardCompleteness(a) >= scoreCardCompleteness(b) ? a : b;
    const secondary = primary === a ? b : a;

    return {
        ...primary,
        id: a.id,
        sourceUrl: normalizeSourceUrl(primary.sourceUrl) || normalizeSourceUrl(secondary.sourceUrl) || '#',
        coverImage: primary.coverImage || secondary.coverImage || '',
        rawContent: (secondary.rawContent?.length || 0) > (primary.rawContent?.length || 0)
            ? secondary.rawContent
            : primary.rawContent,
        userNotes: (secondary.userNotes?.length || 0) > (primary.userNotes?.length || 0)
            ? secondary.userNotes
            : primary.userNotes,
        metrics: {
            likes: Math.max(Number(a.metrics?.likes || 0), Number(b.metrics?.likes || 0)),
            bookmarks: Math.max(Number(a.metrics?.bookmarks || 0), Number(b.metrics?.bookmarks || 0)),
            comments: Math.max(Number(a.metrics?.comments || 0), Number(b.metrics?.comments || 0)),
        },
        aiAnalysis: mergeAiAnalysis(a.aiAnalysis, b.aiAnalysis),
        tags: uniqStrings([...toArray(a.tags), ...toArray(b.tags)]),
        collections: uniqStrings([...toArray(a.collections), ...toArray(b.collections)]),
    };
};

const dedupeCards = (cards: KnowledgeCard[]): KnowledgeCard[] => {
    const grouped = new Map<string, KnowledgeCard>();

    for (const card of cards) {
        const key = buildCardDedupKey(card);
        const existing = grouped.get(key);
        if (!existing) {
            grouped.set(key, {
                ...card,
                sourceUrl: normalizeSourceUrl(card.sourceUrl) || '#',
                tags: uniqStrings(card.tags || []),
                collections: uniqStrings(card.collections || []),
            });
            continue;
        }

        grouped.set(key, mergeCardsForDedup(existing, card));
    }

    return Array.from(grouped.values());
};

// 将前端 KnowledgeCard 转换为数据库行
const cardToDb = (card: KnowledgeCard, isTrending: boolean = false, skipId: boolean = false) => {
    const dbRow: any = {
        title: card.title,
        source_url: normalizeSourceUrl(card.sourceUrl) || '#',
        platform: card.platform,
        author: card.author,
        date: card.date,
        cover_image: normalizeLegacyFallbackCover(card.coverImage),
        metrics: card.metrics,
        content_type: card.contentType,
        raw_content: card.rawContent,
        ai_analysis: card.aiAnalysis,
        tags: uniqStrings(card.tags || []),
        user_notes: card.userNotes || '',
        collections: uniqStrings(card.collections || []),
        is_trending: isTrending,
    };

    // 只有当 ID 是有效 UUID 时才包含它
    if (!skipId && isValidUUID(card.id)) {
        dbRow.id = card.id;
    }

    return dbRow;
};

const dbToCollection = (row: any): Collection => ({
    id: row.id,
    name: row.name,
    coverImage: row.cover_image || '',
    itemCount: 0, // 将在获取后计算
});

const collectionToDb = (collection: Collection, skipId: boolean = false) => {
    const dbRow: any = {
        name: collection.name,
        cover_image: collection.coverImage,
    };

    // 只有当 ID 是有效 UUID 时才包含它
    if (!skipId && isValidUUID(collection.id)) {
        dbRow.id = collection.id;
    }

    return dbRow;
};

const dbToTask = (row: any): TrackingTask => ({
    id: row.id,
    keywords: row.keywords,
    platforms: row.platforms || [],
    dateRange: row.date_range || { start: '', end: '' },
    status: row.status as TaskStatus,
    itemsFound: row.items_found || 0,
    lastRun: row.last_run || '',
    config: row.config || undefined,
});

const taskToDb = (task: TrackingTask, skipId: boolean = false, includeConfig: boolean = true) => {
    const dbRow: any = {
        keywords: task.keywords,
        platforms: task.platforms,
        date_range: task.dateRange,
        status: task.status,
        items_found: task.itemsFound,
        last_run: task.lastRun,
    };

    if (includeConfig && task.config) {
        dbRow.config = task.config;
    }

    if (!skipId && isValidUUID(task.id)) {
        dbRow.id = task.id;
    }

    return dbRow;
};

const dbToTrustedAccount = (row: any): TrustedAccount => ({
    id: row.id,
    platform: row.platform || 'twitter',
    handle: row.handle || '',
    category: row.category || 'vibe_coding',
    notes: row.notes || '',
    createdAt: row.created_at || undefined,
});

const dbToQualityKeyword = (row: any): QualityKeyword => ({
    id: row.id,
    keyword: row.keyword || '',
    type: row.type === 'blacklist' ? 'blacklist' : 'positive',
    createdAt: row.created_at || undefined,
});

// ============ 知识卡片 CRUD ============

export const getKnowledgeCards = async (): Promise<KnowledgeCard[]> => {
    if (!isSupabaseConnected() || !supabase) return [];

    const { data, error } = await supabase
        .from('knowledge_cards')
        .select('*')
        .eq('is_trending', false)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching cards:', error);
        return [];
    }

    return dedupeCards((data || []).map(dbToCard));
};

export const getTrendingCards = async (): Promise<KnowledgeCard[]> => {
    if (!isSupabaseConnected() || !supabase) return [];

    const { data, error } = await supabase
        .from('knowledge_cards')
        .select('*')
        .eq('is_trending', true)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching trending cards:', error);
        return [];
    }

    const cards = dedupeCards((data || []).map(dbToCard));
    const snapshotTags = cards
        .map(c => pickLatestSnapshotTag(c.tags || []))
        .filter(Boolean)
        .sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));

    if (snapshotTags.length === 0) return cards;

    const latest = snapshotTags[0];
    return cards.filter(c => pickLatestSnapshotTag(c.tags || []) === latest);
};

export const saveCard = async (card: KnowledgeCard, isTrending: boolean = false): Promise<boolean> => {
    if (!isSupabaseConnected() || !supabase) return false;

    const normalizedCard: KnowledgeCard = {
        ...card,
        sourceUrl: normalizeSourceUrl(card.sourceUrl) || '#',
        tags: uniqStrings(card.tags || []),
        collections: uniqStrings(card.collections || []),
    };
    const normalizedSourceUrl = normalizeSourceUrl(normalizedCard.sourceUrl);

    if (normalizedSourceUrl) {
        const { data: existingRows, error: queryError } = await supabase
            .from('knowledge_cards')
            .select('*')
            .eq('is_trending', isTrending)
            .eq('source_url', normalizedSourceUrl)
            .order('created_at', { ascending: false })
            .limit(1);

        if (queryError) {
            console.error('Error checking existing card:', queryError);
            return false;
        }

        const existing = existingRows?.[0];
        if (existing) {
            const merged = mergeCardsForDedup(dbToCard(existing), normalizedCard);
            const { error: updateError } = await supabase
                .from('knowledge_cards')
                .update(cardToDb(merged, isTrending, true))
                .eq('id', existing.id);

            if (updateError) {
                console.error('Error updating existing card during save:', updateError);
                return false;
            }
            return true;
        }
    }

    const { error } = await supabase
        .from('knowledge_cards')
        .upsert(cardToDb(normalizedCard, isTrending));

    if (error) {
        console.error('Error saving card:', error);
        return false;
    }

    return true;
};

export const updateCard = async (card: KnowledgeCard): Promise<boolean> => {
    if (!isSupabaseConnected() || !supabase) return false;

    const { error } = await supabase
        .from('knowledge_cards')
        .update(cardToDb(card))
        .eq('id', card.id);

    if (error) {
        console.error('Error updating card:', error);
        return false;
    }

    return true;
};

export const deleteCard = async (cardId: string): Promise<boolean> => {
    if (!isSupabaseConnected() || !supabase) return false;

    const { error } = await supabase
        .from('knowledge_cards')
        .delete()
        .eq('id', cardId);

    if (error) {
        console.error('Error deleting card:', error);
        return false;
    }

    return true;
};

// 将 Trending 卡片移动到 Vault（更新 is_trending 标志）
export const moveTrendingToVault = async (card: KnowledgeCard): Promise<boolean> => {
    if (!isSupabaseConnected() || !supabase) return false;

    const normalizedSourceUrl = normalizeSourceUrl(card.sourceUrl);

    if (normalizedSourceUrl) {
        const { data: existingRows, error: existingError } = await supabase
            .from('knowledge_cards')
            .select('*')
            .eq('is_trending', false)
            .eq('source_url', normalizedSourceUrl)
            .neq('id', card.id)
            .order('created_at', { ascending: false })
            .limit(1);

        if (existingError) {
            console.error('Error checking existing vault card:', existingError);
            return false;
        }

        const existing = existingRows?.[0];
        if (existing) {
            const merged = mergeCardsForDedup(dbToCard(existing), { ...card, sourceUrl: normalizedSourceUrl });
            const { error: updateError } = await supabase
                .from('knowledge_cards')
                .update(cardToDb(merged, false, true))
                .eq('id', existing.id);

            if (updateError) {
                console.error('Error merging duplicate vault card:', updateError);
                return false;
            }

            const { error: deleteError } = await supabase
                .from('knowledge_cards')
                .delete()
                .eq('id', card.id);

            if (deleteError) {
                console.error('Error deleting duplicate trending card:', deleteError);
                return false;
            }

            return true;
        }
    }

    const { error } = await supabase
        .from('knowledge_cards')
        .update({ is_trending: false })
        .eq('id', card.id);

    if (error) {
        console.error('Error moving card to vault:', error);
        return false;
    }

    return true;
};

// ============ 收藏集 CRUD ============

export const getCollections = async (): Promise<Collection[]> => {
    if (!isSupabaseConnected() || !supabase) return [];

    const { data, error } = await supabase
        .from('collections')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching collections:', error);
        return [];
    }

    // 计算每个合集的项目数
    const collections = (data || []).map(dbToCollection);

    // 获取所有卡片来计算 itemCount
    const { data: cards } = await supabase
        .from('knowledge_cards')
        .select('collections,source_url,title,author,platform,raw_content')
        .eq('is_trending', false);

    if (cards) {
        const dedupedCollectionRefs = new Map<string, Set<string>>();

        for (const row of cards) {
            const normalizedUrl = normalizeSourceUrl(row.source_url || '');
            const dedupeKey = normalizedUrl
                ? `url:${normalizedUrl}`
                : `meta:${normalizeText(row.platform || '')}|${normalizeText(row.title || '')}|${normalizeText(row.author || '')}|${normalizeText(row.raw_content || '').slice(0, 120)}`;

            const existingRefs = dedupedCollectionRefs.get(dedupeKey) || new Set<string>();
            for (const cid of toArray(row.collections)) {
                if (cid) existingRefs.add(cid);
            }
            dedupedCollectionRefs.set(dedupeKey, existingRefs);
        }

        const dedupedCards = Array.from(dedupedCollectionRefs.values()).map(refs => Array.from(refs));

        collections.forEach(col => {
            col.itemCount = dedupedCards.filter(refs => refs.includes(col.id)).length;
        });
    }

    return collections;
};

export const saveCollection = async (collection: Collection): Promise<string | null> => {
    if (!isSupabaseConnected() || !supabase) return null;

    // 使用 insert 而非 upsert，因为新建收藏夹时不应该覆盖已有记录
    const { data, error } = await supabase
        .from('collections')
        .insert(collectionToDb(collection, true)) // skipId = true，让数据库生成 UUID
        .select('id')
        .single();

    if (error) {
        console.error('Error saving collection:', error);
        return null;
    }

    return data?.id || null; // 返回数据库生成的 UUID
};

export const updateCollection = async (collection: Collection): Promise<boolean> => {
    if (!isSupabaseConnected() || !supabase) return false;

    const { error } = await supabase
        .from('collections')
        .update({ name: collection.name, cover_image: collection.coverImage })
        .eq('id', collection.id);

    if (error) {
        console.error('Error updating collection:', error);
        return false;
    }

    return true;
};

export const deleteCollection = async (collectionId: string): Promise<boolean> => {
    if (!isSupabaseConnected() || !supabase) return false;

    const { error } = await supabase
        .from('collections')
        .delete()
        .eq('id', collectionId);

    if (error) {
        console.error('Error deleting collection:', error);
        return false;
    }

    return true;
};

// ============ 监控任务 CRUD ============

export const getTasks = async (): Promise<TrackingTask[]> => {
    if (!isSupabaseConnected() || !supabase) return [];

    const { data, error } = await supabase
        .from('tracking_tasks')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching tasks:', error);
        return [];
    }

    return (data || []).map(dbToTask);
};

export const saveTask = async (task: TrackingTask): Promise<boolean> => {
    if (!isSupabaseConnected() || !supabase) return false;

    const { error } = await supabase
        .from('tracking_tasks')
        .upsert(taskToDb(task, false, true));

    if (error) {
        const msg = `${error.message || ''} ${error.details || ''}`.toLowerCase();
        if (msg.includes('config')) {
            const { error: retryError } = await supabase
                .from('tracking_tasks')
                .upsert(taskToDb(task, false, false));
            if (retryError) {
                console.error('Error saving task (retry without config):', retryError);
                return false;
            }
            return true;
        }
        console.error('Error saving task:', error);
        return false;
    }

    return true;
};

export const deleteTask = async (taskId: string): Promise<boolean> => {
    if (!isSupabaseConnected() || !supabase) return false;

    const { error } = await supabase
        .from('tracking_tasks')
        .delete()
        .eq('id', taskId);

    if (error) {
        console.error('Error deleting task:', error);
        return false;
    }

    return true;
};

// ============ 质量过滤设置 CRUD ============

export const getTrustedAccounts = async (): Promise<TrustedAccount[]> => {
    if (!isSupabaseConnected() || !supabase) return [];

    const { data, error } = await supabase
        .from('trusted_accounts')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching trusted accounts:', error);
        return [];
    }

    return (data || []).map(dbToTrustedAccount);
};

export const saveTrustedAccount = async (
    account: Omit<TrustedAccount, 'id' | 'createdAt'>
): Promise<TrustedAccount | null> => {
    if (!isSupabaseConnected() || !supabase) return null;

    const normalizedHandle = account.handle.replace(/^@+/, '').trim();
    const payload = {
        platform: (account.platform || 'twitter').toLowerCase(),
        handle: normalizedHandle,
        category: account.category || 'vibe_coding',
        notes: account.notes || ''
    };

    const { data, error } = await supabase
        .from('trusted_accounts')
        .insert(payload)
        .select('*')
        .single();

    if (error) {
        console.error('Error saving trusted account:', error);
        return null;
    }

    return dbToTrustedAccount(data);
};

export const updateTrustedAccount = async (account: TrustedAccount): Promise<boolean> => {
    if (!isSupabaseConnected() || !supabase) return false;

    const normalizedHandle = account.handle.replace(/^@+/, '').trim();
    const { error } = await supabase
        .from('trusted_accounts')
        .update({
            platform: (account.platform || 'twitter').toLowerCase(),
            handle: normalizedHandle,
            category: account.category,
            notes: account.notes || ''
        })
        .eq('id', account.id);

    if (error) {
        console.error('Error updating trusted account:', error);
        return false;
    }

    return true;
};

export const deleteTrustedAccount = async (id: string): Promise<boolean> => {
    if (!isSupabaseConnected() || !supabase) return false;

    const { error } = await supabase
        .from('trusted_accounts')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting trusted account:', error);
        return false;
    }

    return true;
};

export const getQualityKeywords = async (): Promise<QualityKeyword[]> => {
    if (!isSupabaseConnected() || !supabase) return [];

    const { data, error } = await supabase
        .from('quality_keywords')
        .select('*')
        .order('type', { ascending: true })
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching quality keywords:', error);
        return [];
    }

    return (data || []).map(dbToQualityKeyword);
};

export const saveQualityKeyword = async (
    keyword: Omit<QualityKeyword, 'id' | 'createdAt'>
): Promise<QualityKeyword | null> => {
    if (!isSupabaseConnected() || !supabase) return null;

    const payload = {
        keyword: keyword.keyword.trim(),
        type: keyword.type === 'blacklist' ? 'blacklist' : 'positive'
    };

    const { data, error } = await supabase
        .from('quality_keywords')
        .insert(payload)
        .select('*')
        .single();

    if (error) {
        console.error('Error saving quality keyword:', error);
        return null;
    }

    return dbToQualityKeyword(data);
};

export const deleteQualityKeyword = async (id: string): Promise<boolean> => {
    if (!isSupabaseConnected() || !supabase) return false;

    const { error } = await supabase
        .from('quality_keywords')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting quality keyword:', error);
        return false;
    }

    return true;
};

export const getMonitorSettings = async (): Promise<MonitorSettings> => {
    const defaults: MonitorSettings = { minEngagement: 500, trustedMinEngagement: 1000, splitKeywords: false };
    if (!isSupabaseConnected() || !supabase) return defaults;

    const { data, error } = await supabase
        .from('monitor_settings')
        .select('key, value');

    if (error) {
        console.error('Error fetching monitor settings:', error);
        return defaults;
    }

    const map = new Map<string, string>((data || []).map((row: any) => [row.key, row.value]));
    const minValue = Number(map.get('min_engagement'));
    const trustedMinValue = Number(map.get('trusted_min_engagement'));
    const splitRaw = String(map.get('split_keywords') || map.get('twitter_split_keywords') || '').toLowerCase();
    return {
        minEngagement: Number.isFinite(minValue) && minValue >= 0 ? minValue : defaults.minEngagement,
        trustedMinEngagement: Number.isFinite(trustedMinValue) && trustedMinValue >= 0
            ? trustedMinValue
            : defaults.trustedMinEngagement,
        splitKeywords: splitRaw === '1' || splitRaw === 'true'
    };
};

export const updateMonitorSetting = async (key: string, value: string): Promise<boolean> => {
    if (!isSupabaseConnected() || !supabase) return false;

    const { error } = await supabase
        .from('monitor_settings')
        .upsert(
            {
                key,
                value,
                updated_at: new Date().toISOString()
            },
            { onConflict: 'key' }
        );

    if (error) {
        console.error(`Error updating monitor setting (${key}):`, error);
        return false;
    }

    return true;
};

// ============ 初始化数据（首次运行时导入 mock 数据）============

// 全局锁防止重复初始化（解决 React StrictMode 问题）
let isInitializing = false;
let initPromise: Promise<boolean> | null = null;

export const initializeWithMockData = async (
    cards: KnowledgeCard[],
    trending: KnowledgeCard[],
    collections: Collection[],
    tasks: TrackingTask[]
): Promise<boolean> => {
    if (!isSupabaseConnected() || !supabase) return false;

    // 如果已经在初始化中，返回现有的 Promise
    if (isInitializing && initPromise) {
        console.log('Initialization already in progress, waiting...');
        return initPromise;
    }

    // 创建初始化 Promise
    isInitializing = true;
    initPromise = (async () => {
        try {
            // 检查是否已有数据
            const { count } = await supabase
                .from('knowledge_cards')
                .select('*', { count: 'exact', head: true });

            if (count && count > 0) {
                console.log('Database already has data, skipping initialization');
                return true;
            }

            console.log('Initializing database with mock data...');

            // 1. 先插入收藏集，建立 oldId -> newId 的映射
            const collectionIdMap: Record<string, string> = {};

            for (const col of collections) {
                const { data, error } = await supabase
                    .from('collections')
                    .insert(collectionToDb(col, true))
                    .select('id')
                    .single();

                if (error) {
                    console.error('Error inserting collection:', error);
                    continue;
                }

                if (data) {
                    collectionIdMap[col.id] = data.id;
                }
            }

            console.log('Collections inserted, ID mapping:', collectionIdMap);

            // 2. 插入知识卡片，替换 collection 引用
            for (const card of cards) {
                // 将旧的 collection ID 映射为新的 UUID
                const mappedCollections = (card.collections || [])
                    .map(oldId => collectionIdMap[oldId])
                    .filter(Boolean);

                const cardData = cardToDb({ ...card, collections: mappedCollections }, false, true);

                const { error } = await supabase
                    .from('knowledge_cards')
                    .insert(cardData);

                if (error) {
                    console.error('Error inserting card:', error);
                }
            }

            // 3. 插入热门卡片
            for (const card of trending) {
                const mappedCollections = (card.collections || [])
                    .map(oldId => collectionIdMap[oldId])
                    .filter(Boolean);

                const cardData = cardToDb({ ...card, collections: mappedCollections }, true, true);

                const { error } = await supabase
                    .from('knowledge_cards')
                    .insert(cardData);

                if (error) {
                    console.error('Error inserting trending card:', error);
                }
            }

            // 4. 插入任务
            for (const task of tasks) {
                const { error } = await supabase
                    .from('tracking_tasks')
                    .insert(taskToDb(task, true));

                if (error) {
                    console.error('Error inserting task:', error);
                }
            }

            console.log('Mock data initialized successfully');
            return true;
        } catch (error) {
            console.error('Error initializing mock data:', error);
            return false;
        } finally {
            isInitializing = false;
        }
    })();

    return initPromise;
};
