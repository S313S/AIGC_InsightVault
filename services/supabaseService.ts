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
    MonitorSettings,
    XhsTokenConfig,
    CronRunLog,
    EditorialTopic,
    TopicFeedbackAction,
    TopicSource
} from '../types';
import { normalizeLegacyFallbackCover } from '../shared/fallbackCovers.js';
import { normalizeXiaohongshuSourceUrl } from '../shared/xiaohongshuUrls.js';
import { buildCardIdentityKey, countCollectionItems } from '../shared/collectionCounts.js';
import { selectHomepageTrendingCards } from '../shared/collectionFreshness.js';

// ============ 类型转换工具 ============

const CARD_LIST_LIMIT = 60;
const COLLECTION_CARD_PAGE_SIZE = 1000;
const COLLECTION_COUNT_PAGE_SIZE = 1000;
const TRENDING_CARD_PAGE_SIZE = 1000;
const TRENDING_CARD_MAX_PAGES = 10;
const CARD_LIST_SELECT_FIELDS = [
    'id',
    'owner_id',
    'is_public',
    'title',
    'source_url',
    'platform',
    'author',
    'date',
    'cover_image',
    'metrics',
    'content_type',
    'ai_analysis',
    'tags',
    'collections',
].join(',');
const COLLECTION_COUNT_SELECT_FIELDS = [
    'id',
    'owner_id',
    'title',
    'source_url',
    'platform',
    'author',
    'date',
    'collections',
].join(',');
const TOPIC_SOURCES_RELATION = 'topic_sources';
const TOPIC_EVIDENCE_RELATION = 'knowledge_cards';
const TOPIC_FEEDBACK_RELATION = 'topic_feedback';
const TOPIC_EVIDENCE_SELECT_FIELDS = [
    'id',
    'owner_id',
    'is_public',
    'title',
    'source_url',
    'platform',
    'author',
    'date',
    'cover_image',
    'metrics',
    'content_type',
    'ai_analysis',
    'tags',
    'collections',
].join(',');
const TOPIC_SELECT_FIELDS = [
    'id',
    'owner_id',
    'is_public',
    'fingerprint',
    'title',
    'summary',
    'why_now',
    'content_angles',
    'durable_knowledge',
    'write_score',
    'study_score',
    'breaking_score',
    'confidence_score',
    'preference_score',
    'first_seen_at',
    'latest_evidence_at',
    'trend_direction',
    'evidence_signature',
    'generation_status',
    'generated_at',
    'created_at',
    'updated_at',
    'source_count',
    'platform_count',
    `${TOPIC_SOURCES_RELATION}(id,topic_id,card_id,evidence_role,source_type,relevance,created_at,${TOPIC_EVIDENCE_RELATION}(${TOPIC_EVIDENCE_SELECT_FIELDS}))`,
    `${TOPIC_FEEDBACK_RELATION}(owner_id,action)`,
].join(',');
const TOPIC_FEEDBACK_ACTIONS = new Set<TopicFeedbackAction>(['saved', 'ignored', 'published']);
const TOPIC_DAY_MS = 24 * 60 * 60 * 1000;

type CardListOptions = {
    limit?: number;
    offset?: number;
    signal?: AbortSignal;
};

// 将数据库行转换为前端 KnowledgeCard 类型
const dbToCard = (row: any, options: { isDetailLoaded?: boolean } = {}): KnowledgeCard => ({
    id: row.id,
    ownerId: row.owner_id || undefined,
    isPublic: Boolean(row.is_public),
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
    isDetailLoaded: options.isDetailLoaded ?? true,
});

const relationRows = (value: any): any[] => {
    if (Array.isArray(value)) return value;
    return value && typeof value === 'object' ? [value] : [];
};

const dbToEditorialTopic = (row: any, userId?: string): EditorialTopic => {
    const seenSources = new Set<string>();
    const sources: TopicSource[] = relationRows(row.topic_sources)
        .map((sourceRow): TopicSource | null => {
            const cardRow = relationRows(sourceRow?.knowledge_cards).find(candidate => (
                userId ? candidate?.owner_id === userId : candidate?.is_public === true
            ));
            if (!cardRow) return null;
            const card = dbToCard(cardRow, { isDetailLoaded: false });
            if (!(userId ? card.ownerId === userId : card.isPublic === true)) return null;
            if (!card.id) return null;
            return {
                id: String(sourceRow?.id || ''),
                topicId: String(sourceRow?.topic_id || row.id || ''),
                cardId: card.id,
                evidenceRole: String(sourceRow?.evidence_role || ''),
                sourceType: String(sourceRow?.source_type || ''),
                relevance: Number(sourceRow?.relevance || 0),
                createdAt: String(sourceRow?.created_at || ''),
                card,
            };
        })
        .filter((source): source is TopicSource => source !== null)
        .sort((left, right) => (
            right.relevance - left.relevance ||
            left.createdAt.localeCompare(right.createdAt) ||
            left.cardId.localeCompare(right.cardId) ||
            left.id.localeCompare(right.id)
        ))
        .filter(source => {
            const sourceKey = `${source.topicId}:${source.cardId}`;
            if (seenSources.has(sourceKey)) return false;
            seenSources.add(sourceKey);
            return true;
        });
    const feedback = userId
        ? relationRows(row.topic_feedback)
            .filter(item => item?.owner_id === userId && TOPIC_FEEDBACK_ACTIONS.has(item?.action))
            .map(item => item.action as TopicFeedbackAction)
            .filter((action, index, values) => values.indexOf(action) === index)
        : [];

    return {
        id: String(row.id || ''),
        ownerId: row.owner_id || undefined,
        isPublic: Boolean(row.is_public),
        fingerprint: String(row.fingerprint || ''),
        title: String(row.title || ''),
        summary: String(row.summary || ''),
        whyNow: String(row.why_now || ''),
        contentAngles: row.content_angles || { quick: '', viewpoint: '', tutorial: '' },
        durableKnowledge: row.durable_knowledge || [],
        writeScore: Number(row.write_score || 0),
        studyScore: Number(row.study_score || 0),
        breakingScore: Number(row.breaking_score || 0),
        confidenceScore: Number(row.confidence_score || 0),
        preferenceScore: Number(row.preference_score || 0),
        firstSeenAt: String(row.first_seen_at || ''),
        latestEvidenceAt: row.latest_evidence_at || '',
        trendDirection: ['rising', 'steady', 'fading', 'new'].includes(row.trend_direction)
            ? row.trend_direction
            : 'new',
        evidenceSignature: String(row.evidence_signature || ''),
        generationStatus: row.generation_status === 'generated' ? 'generated' : 'fallback',
        generatedAt: row.generated_at || undefined,
        createdAt: String(row.created_at || ''),
        updatedAt: String(row.updated_at || ''),
        sourceCount: Number(row.source_count || 0),
        platformCount: Number(row.platform_count || 0),
        sources,
        feedback,
    };
};

const safeTimestamp = (value: string): number => {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
};

const eligibleLaneScores = (topic: EditorialTopic, now = Date.now()): number[] => {
    const evidenceAt = safeTimestamp(topic.latestEvidenceAt);
    const age = evidenceAt > 0 ? now - evidenceAt : Number.POSITIVE_INFINITY;
    if (age < 0) return [];
    return [
        age <= 3 * TOPIC_DAY_MS && topic.writeScore >= 50 ? topic.writeScore : null,
        age <= 30 * TOPIC_DAY_MS && topic.studyScore >= 55 ? topic.studyScore : null,
        age <= TOPIC_DAY_MS && topic.breakingScore >= 60 ? topic.breakingScore : null,
    ].filter((score): score is number => score !== null);
};

const compareEditorialTopics = (left: EditorialTopic, right: EditorialTopic, now: number): number => {
    const leftLaneScores = eligibleLaneScores(left, now);
    const rightLaneScores = eligibleLaneScores(right, now);
    const leftBestLane = Math.max(0, ...leftLaneScores);
    const rightBestLane = Math.max(0, ...rightLaneScores);
    const leftOpportunity = 0.35 * left.writeScore + 0.25 * left.studyScore + 0.20 * left.breakingScore
        + 0.10 * left.confidenceScore + 0.10 * left.preferenceScore;
    const rightOpportunity = 0.35 * right.writeScore + 0.25 * right.studyScore + 0.20 * right.breakingScore
        + 0.10 * right.confidenceScore + 0.10 * right.preferenceScore;

    return (
        rightBestLane - leftBestLane ||
        rightLaneScores.length - leftLaneScores.length ||
        rightOpportunity - leftOpportunity ||
        safeTimestamp(right.latestEvidenceAt) - safeTimestamp(left.latestEvidenceAt) ||
        left.fingerprint.localeCompare(right.fingerprint) ||
        left.id.localeCompare(right.id)
    );
};

const throwIfAborted = (signal?: AbortSignal): void => {
    if (!signal?.aborted) return;
    if (signal.reason instanceof Error) throw signal.reason;
    throw new DOMException('The operation was aborted.', 'AbortError');
};

const isValidTopicFeedbackInput = (topicId: string, action: TopicFeedbackAction): boolean =>
    isValidUUID(topicId) && TOPIC_FEEDBACK_ACTIONS.has(action);

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
    const normalizedXhs = normalizeXiaohongshuSourceUrl(raw);
    if (normalizedXhs) return normalizedXhs;
    try {
        const u = new URL(raw);
        u.search = '';
        u.hash = '';
        return u.toString();
    } catch {
        return raw.split('?')[0].trim();
    }
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
        ownerId: primary.ownerId || secondary.ownerId,
        isPublic: Boolean(primary.isPublic || secondary.isPublic),
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
        const key = buildCardIdentityKey(card);
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
        owner_id: card.ownerId,
        is_public: typeof card.isPublic === 'boolean' ? card.isPublic : false,
        title: card.title,
        source_url: normalizeSourceUrl(card.sourceUrl) || '#',
        platform: card.platform,
        author: card.author,
        date: card.date,
        cover_image: normalizeLegacyFallbackCover(card.coverImage),
        metrics: card.metrics,
        content_type: card.contentType,
        tags: uniqStrings(card.tags || []),
        collections: uniqStrings(card.collections || []),
        is_trending: isTrending,
    };

    if (card.isDetailLoaded !== false) {
        dbRow.raw_content = card.rawContent;
        dbRow.ai_analysis = card.aiAnalysis;
        dbRow.user_notes = card.userNotes || '';
    }

    // 只有当 ID 是有效 UUID 时才包含它
    if (!skipId && isValidUUID(card.id)) {
        dbRow.id = card.id;
    }

    return dbRow;
};

const dbToCollection = (row: any): Collection => ({
    id: row.id,
    ownerId: row.owner_id || undefined,
    isPublic: Boolean(row.is_public),
    name: row.name,
    coverImage: row.cover_image || '',
    itemCount: 0,
});

const collectionToDb = (collection: Collection, skipId: boolean = false) => {
    const dbRow: any = {
        owner_id: collection.ownerId,
        is_public: typeof collection.isPublic === 'boolean' ? collection.isPublic : false,
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
    ownerId: row.owner_id || undefined,
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
        owner_id: task.ownerId,
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
    ownerId: row.owner_id || undefined,
    platform: row.platform || 'twitter',
    handle: row.handle || '',
    category: row.category || 'vibe_coding',
    notes: row.notes || '',
    createdAt: row.created_at || undefined,
});

const dbToQualityKeyword = (row: any): QualityKeyword => ({
    id: row.id,
    ownerId: row.owner_id || undefined,
    keyword: row.keyword || '',
    type: row.type === 'blacklist' ? 'blacklist' : 'positive',
    createdAt: row.created_at || undefined,
});

const dbToCronRunLog = (row: any): CronRunLog => ({
    id: row.id,
    ownerId: row.owner_id || undefined,
    createdAt: row.created_at || undefined,
    triggerSource: row.trigger_source || 'manual',
    requestMethod: row.request_method || 'GET',
    requestUrl: row.request_url || '',
    queryParams: row.query_params || {},
    effectiveParams: row.effective_params || {},
    keywordExecution: row.keyword_execution || {},
    apiCallTrace: Array.isArray(row.api_call_trace) ? row.api_call_trace : [],
    apiCallsSummary: row.api_calls_summary || {},
    funnel: row.funnel || {},
    platformFunnel: row.platform_funnel || {},
    platformStats: Array.isArray(row.platform_stats) ? row.platform_stats : [],
    platformTotals: row.platform_totals || {},
    platformErrors: Array.isArray(row.platform_errors) ? row.platform_errors : [],
    resultSummary: row.result_summary || {},
    runHealth: row.result_summary?.runHealth || row.run_health || undefined,
    runtimeMs: Number(row.runtime_ms || 0),
    runtimeGuardTriggered: Boolean(row.runtime_guard_triggered),
    success: Boolean(row.success),
    errorMessage: row.error_message || null,
});

const logWriteError = (action: string, error: any) => {
    const message = String(error?.message || '');
    const details = String(error?.details || '');
    const full = `${message} ${details}`.trim().toLowerCase();
    if (full.includes('row-level security') || full.includes('permission denied') || full.includes('42501')) {
        console.error(`${action}: permission denied by RLS`, error);
        return;
    }
    console.error(action, error);
};

const isMissingDeleteCardRpc = (error: any): boolean =>
    ['PGRST202', '42883'].includes(String(error?.code || ''));

// ============ 知识卡片 CRUD ============

export const getKnowledgeCards = async (options: CardListOptions = {}): Promise<KnowledgeCard[]> => {
    if (!isSupabaseConnected() || !supabase) return [];
    const limit = options.limit || CARD_LIST_LIMIT;
    const offset = options.offset || 0;
    const signal = options.signal;

    let query = supabase
        .from('knowledge_cards')
        .select(CARD_LIST_SELECT_FIELDS)
        .eq('is_trending', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
    if (signal) query = query.abortSignal(signal);

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching cards:', error);
        throw error;
    }

    return dedupeCards((data || []).map(row => dbToCard(row, { isDetailLoaded: false })));
};

export const getKnowledgeCardsByCollectionIds = async (
    rawCollectionIds: string[],
    signal?: AbortSignal
): Promise<KnowledgeCard[]> => {
    if (!isSupabaseConnected() || !supabase) return [];
    const collectionIds = uniqStrings(rawCollectionIds);
    if (collectionIds.length === 0) return [];

    const rows: any[] = [];
    let offset = 0;

    while (true) {
        let query = supabase
            .from('knowledge_cards')
            .select(CARD_LIST_SELECT_FIELDS)
            .eq('is_trending', false)
            .overlaps('collections', collectionIds)
            .order('created_at', { ascending: false })
            .range(offset, offset + COLLECTION_CARD_PAGE_SIZE - 1);
        if (signal) query = query.abortSignal(signal);

        const { data, error } = await query;

        if (error) throw error;

        const page = data || [];
        rows.push(...page);
        if (page.length < COLLECTION_CARD_PAGE_SIZE) break;
        offset += COLLECTION_CARD_PAGE_SIZE;
    }

    return dedupeCards(rows.map(row => dbToCard(row, { isDetailLoaded: false })));
};

export const getTrendingCards = async (signal?: AbortSignal): Promise<KnowledgeCard[]> => {
    if (!isSupabaseConnected() || !supabase) return [];

    const rows: any[] = [];
    let offset = 0;

    for (let pageIndex = 0; pageIndex < TRENDING_CARD_MAX_PAGES; pageIndex += 1) {
        let query = supabase
            .from('knowledge_cards')
            .select(CARD_LIST_SELECT_FIELDS)
            .eq('is_trending', true)
            .order('created_at', { ascending: false })
            .range(offset, offset + TRENDING_CARD_PAGE_SIZE - 1);
        if (signal) query = query.abortSignal(signal);

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching trending cards:', error);
            throw error;
        }

        const page = data || [];
        rows.push(...page);
        if (page.length < TRENDING_CARD_PAGE_SIZE) break;
        if (pageIndex === TRENDING_CARD_MAX_PAGES - 1) {
            throw new Error('Trending card inventory exceeds the safe pagination limit');
        }
        offset += TRENDING_CARD_PAGE_SIZE;
    }

    const cards = dedupeCards(rows.map(row => dbToCard(row, { isDetailLoaded: false })));
    return selectHomepageTrendingCards(cards);
};

export const getEditorialTopics = async (signal?: AbortSignal): Promise<EditorialTopic[]> => {
    throwIfAborted(signal);
    if (!isSupabaseConnected() || !supabase) return [];

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
        console.error('Error resolving topic reader session:', sessionError);
        throw sessionError;
    }
    throwIfAborted(signal);
    const user = sessionData.session?.user;

    let topicQuery = supabase
        .from('topics')
        .select(TOPIC_SELECT_FIELDS)
        .order('latest_evidence_at', { ascending: false })
        .order('write_score', { ascending: false })
        .order('study_score', { ascending: false })
        .order('breaking_score', { ascending: false })
        .order('id', { ascending: true });

    if (user) {
        topicQuery = topicQuery.eq('owner_id', user.id);
        topicQuery = topicQuery.eq('topic_sources.knowledge_cards.owner_id', user.id);
        topicQuery = topicQuery.eq('topic_feedback.owner_id', user.id);
    } else {
        topicQuery = topicQuery.eq('is_public', true);
        topicQuery = topicQuery.eq('topic_sources.knowledge_cards.is_public', true);
    }
    if (signal) topicQuery = topicQuery.abortSignal(signal);

    const { data, error } = await topicQuery;
    if (error) {
        console.error('Error fetching editorial topics:', error);
        throw error;
    }
    throwIfAborted(signal);

    const topicById = new Map<string, EditorialTopic>();
    for (const row of data || []) {
        if (user ? row?.owner_id !== user.id : row?.is_public !== true) continue;
        const topic = dbToEditorialTopic(row, user?.id);
        if (!topic.id || topicById.has(topic.id)) continue;
        topicById.set(topic.id, topic);
    }
    const sortNow = Date.now();
    return Array.from(topicById.values()).sort((left, right) => compareEditorialTopics(left, right, sortNow));
};

export const saveTopicFeedback = async (
    topicId: string,
    action: TopicFeedbackAction
): Promise<boolean> => {
    if (!isValidTopicFeedbackInput(topicId, action)) return false;
    if (!isSupabaseConnected() || !supabase) return false;

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
        logWriteError('Error resolving topic feedback session:', sessionError);
        return false;
    }
    const user = sessionData.session?.user;
    if (!user) return false;

    const { error } = await supabase
        .from('topic_feedback')
        .upsert({ owner_id: user.id, topic_id: topicId, action }, {
            onConflict: 'owner_id,topic_id,action',
        });
    if (error) {
        logWriteError('Error saving topic feedback:', error);
        return false;
    }
    return true;
};

export const removeTopicFeedback = async (
    topicId: string,
    action: TopicFeedbackAction
): Promise<boolean> => {
    if (!isValidTopicFeedbackInput(topicId, action)) return false;
    if (!isSupabaseConnected() || !supabase) return false;

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
        logWriteError('Error resolving topic feedback session:', sessionError);
        return false;
    }
    const user = sessionData.session?.user;
    if (!user) return false;

    const { error } = await supabase
        .from('topic_feedback')
        .delete()
        .eq('owner_id', user.id)
        .eq('topic_id', topicId)
        .eq('action', action);
    if (error) {
        logWriteError('Error removing topic feedback:', error);
        return false;
    }
    return true;
};

export const getKnowledgeCardById = async (cardId: string): Promise<KnowledgeCard | null> => {
    if (!isSupabaseConnected() || !supabase) return null;

    const { data, error } = await supabase
        .from('knowledge_cards')
        .select('*')
        .eq('id', cardId)
        .single();

    if (error) {
        console.error('Error fetching card detail:', error);
        return null;
    }

    return data ? dbToCard(data, { isDetailLoaded: true }) : null;
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

    if (normalizedSourceUrl && normalizedCard.ownerId) {
        const { data: existingRows, error: queryError } = await supabase
            .from('knowledge_cards')
            .select('*')
            .eq('is_trending', isTrending)
            .eq('owner_id', normalizedCard.ownerId)
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
                logWriteError('Error updating existing card during save:', updateError);
                return false;
            }
            return true;
        }
    }

    const { error } = await supabase
        .from('knowledge_cards')
        .upsert(cardToDb(normalizedCard, isTrending));

    if (error) {
        logWriteError('Error saving card:', error);
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
        logWriteError('Error updating card:', error);
        return false;
    }

    return true;
};

export const deleteCard = async (cardId: string): Promise<boolean> => {
    if (!isSupabaseConnected() || !supabase) return false;

    const { data: rpcDeleted, error: rpcError } = await supabase.rpc(
        'delete_knowledge_card_with_topic_links',
        { p_card_id: cardId }
    );

    if (!rpcError) return rpcDeleted === true;

    if (!isMissingDeleteCardRpc(rpcError)) {
        logWriteError('Error deleting card with topic links:', rpcError);
        return false;
    }

    const { error } = await supabase
        .from('knowledge_cards')
        .delete()
        .eq('id', cardId);

    if (error) {
        logWriteError('Error deleting card with legacy fallback:', error);
        return false;
    }

    return true;
};

// 将 Trending 卡片移动到 Vault（更新 is_trending 标志）
export const moveTrendingToVault = async (card: KnowledgeCard): Promise<boolean> => {
    if (!isSupabaseConnected() || !supabase) return false;

    const normalizedSourceUrl = normalizeSourceUrl(card.sourceUrl);

    if (normalizedSourceUrl && card.ownerId) {
        const { data: existingRows, error: existingError } = await supabase
            .from('knowledge_cards')
            .select('*')
            .eq('is_trending', false)
            .eq('owner_id', card.ownerId)
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
                logWriteError('Error merging duplicate vault card:', updateError);
                return false;
            }

            const { error: deleteError } = await supabase
                .from('knowledge_cards')
                .delete()
                .eq('id', card.id);

            if (deleteError) {
                logWriteError('Error deleting duplicate trending card:', deleteError);
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
        logWriteError('Error moving card to vault:', error);
        return false;
    }

    return true;
};

// ============ 收藏集 CRUD ============

export const getCollections = async (signal?: AbortSignal): Promise<Collection[]> => {
    if (!isSupabaseConnected() || !supabase) return [];

    let query = supabase
        .from('collections')
        .select('*')
        .order('created_at', { ascending: false });
    if (signal) query = query.abortSignal(signal);

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching collections:', error);
        throw error;
    }

    return (data || []).map(dbToCollection);
};

export const getCollectionItemCounts = async (
    collections: Collection[],
    signal?: AbortSignal
): Promise<Record<string, number>> => {
    if (!isSupabaseConnected() || !supabase) return {};
    if (collections.length === 0) return {};

    const rows: any[] = [];
    let offset = 0;

    while (true) {
        let query = supabase
            .from('knowledge_cards')
            .select(COLLECTION_COUNT_SELECT_FIELDS)
            .eq('is_trending', false)
            .range(offset, offset + COLLECTION_COUNT_PAGE_SIZE - 1);
        if (signal) query = query.abortSignal(signal);

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching collection item counts:', error);
            throw error;
        }

        const page = data || [];
        rows.push(...page);

        if (page.length < COLLECTION_COUNT_PAGE_SIZE) break;
        offset += COLLECTION_COUNT_PAGE_SIZE;
    }

    return countCollectionItems(rows, collections);
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
        logWriteError('Error saving collection:', error);
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
        logWriteError('Error updating collection:', error);
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
        logWriteError('Error deleting collection:', error);
        return false;
    }

    return true;
};

// ============ 监控任务 CRUD ============

export const getTasks = async (signal?: AbortSignal): Promise<TrackingTask[]> => {
    if (!isSupabaseConnected() || !supabase) return [];

    let query = supabase
        .from('tracking_tasks')
        .select('*')
        .order('created_at', { ascending: false });
    if (signal) query = query.abortSignal(signal);

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching tasks:', error);
        throw error;
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
                logWriteError('Error saving task (retry without config):', retryError);
                return false;
            }
            return true;
        }
        logWriteError('Error saving task:', error);
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
        logWriteError('Error deleting task:', error);
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
        logWriteError('Error saving trusted account:', error);
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
        logWriteError('Error updating trusted account:', error);
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
        logWriteError('Error deleting trusted account:', error);
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
        logWriteError('Error saving quality keyword:', error);
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
        logWriteError('Error deleting quality keyword:', error);
        return false;
    }

    return true;
};

export const getMonitorSettings = async (): Promise<MonitorSettings> => {
    const defaults: MonitorSettings = { minEngagement: 500, trustedMinEngagement: 1000, splitKeywords: false, autoUpdateEnabled: false };
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
    const autoUpdateRaw = String(map.get('auto_update_enabled') || '').toLowerCase();
    return {
        minEngagement: Number.isFinite(minValue) && minValue >= 0 ? minValue : defaults.minEngagement,
        trustedMinEngagement: Number.isFinite(trustedMinValue) && trustedMinValue >= 0
            ? trustedMinValue
            : defaults.trustedMinEngagement,
        splitKeywords: splitRaw === '1' || splitRaw === 'true',
        autoUpdateEnabled: autoUpdateRaw === '1' || autoUpdateRaw === 'true'
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
        logWriteError(`Error updating monitor setting (${key}):`, error);
        return false;
    }

    return true;
};

export const getCronRunLogs = async (limit: number = 30): Promise<CronRunLog[]> => {
    if (!isSupabaseConnected() || !supabase) return [];

    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 30;
    const { data, error } = await supabase
        .from('cron_run_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(safeLimit);

    if (error) {
        console.error('Error fetching cron run logs:', error);
        return [];
    }

    return (data || []).map(dbToCronRunLog);
};

const XHS_TOKEN_SETTINGS_KEY = 'xhs_token_configs';

const parseXhsTokenConfigs = (raw: string | null | undefined): XhsTokenConfig[] => {
    if (!raw) return [];
    try {
        const value = JSON.parse(raw);
        const list = Array.isArray(value) ? value : [];
        return list
            .map((item) => ({
                noteId: String(item?.noteId || '').trim(),
                xsecToken: String(item?.xsecToken || '').trim(),
                xsecSource: String(item?.xsecSource || 'pc_feed').trim() || 'pc_feed',
                updatedAt: item?.updatedAt ? String(item.updatedAt) : undefined,
            }))
            .filter((item) => Boolean(item.noteId) && Boolean(item.xsecToken));
    } catch {
        return [];
    }
};

export const getXhsTokenConfigs = async (): Promise<XhsTokenConfig[]> => {
    if (!isSupabaseConnected() || !supabase) return [];

    const { data, error } = await supabase
        .from('monitor_settings')
        .select('value')
        .eq('key', XHS_TOKEN_SETTINGS_KEY)
        .maybeSingle();

    if (error) {
        console.error('Error fetching xhs token configs:', error);
        return [];
    }

    return parseXhsTokenConfigs(data?.value);
};

export const upsertXhsTokenConfig = async (config: XhsTokenConfig): Promise<XhsTokenConfig[] | null> => {
    const next: XhsTokenConfig = {
        noteId: String(config.noteId || '').trim(),
        xsecToken: String(config.xsecToken || '').trim(),
        xsecSource: String(config.xsecSource || 'pc_feed').trim() || 'pc_feed',
        updatedAt: new Date().toISOString(),
    };
    if (!next.noteId || !next.xsecToken) return null;

    const existing = await getXhsTokenConfigs();
    const map = new Map(existing.map(item => [item.noteId, item]));
    map.set(next.noteId, next);
    const payload = JSON.stringify(Array.from(map.values()).sort((a, b) => a.noteId.localeCompare(b.noteId)));

    const ok = await updateMonitorSetting(XHS_TOKEN_SETTINGS_KEY, payload);
    if (!ok) return null;
    return Array.from(map.values()).sort((a, b) => a.noteId.localeCompare(b.noteId));
};

export const deleteXhsTokenConfig = async (noteId: string): Promise<XhsTokenConfig[] | null> => {
    const id = String(noteId || '').trim();
    if (!id) return null;

    const existing = await getXhsTokenConfigs();
    const filtered = existing.filter(item => item.noteId !== id);
    const payload = JSON.stringify(filtered.sort((a, b) => a.noteId.localeCompare(b.noteId)));

    const ok = await updateMonitorSetting(XHS_TOKEN_SETTINGS_KEY, payload);
    if (!ok) return null;
    return filtered;
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
