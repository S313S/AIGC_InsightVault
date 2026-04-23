import React, { useState, useMemo, useEffect, useRef } from 'react';
import { LayoutGrid, Plus, Search, Database, Menu, MessageSquare, Activity, Home, Folder, X, Check, MoreVertical, Edit2, Trash2, CheckSquare, FolderPlus, Sparkles, Loader2, Settings, LogOut } from './components/Icons';
import { Card } from './components/Card';
import { DetailModal } from './components/DetailModal';
import { AddContentModal } from './components/AddContentModal';
import { LoginModal } from './components/LoginModal';
import { ChatView } from './components/ChatView';
import { MonitoringView } from './components/MonitoringView';
import { DashboardView } from './components/DashboardView';
import { SettingsModal } from './components/SettingsModal';
import { INITIAL_DATA, INITIAL_TASKS, TRENDING_DATA, INITIAL_COLLECTIONS } from './mockData';
import { AuthUser, KnowledgeCard, FilterState, TrackingTask, Collection, ContentType, Platform, SocialSearchResult, TaskStatus, XhsMissingTokenItem, XhsTokenConfig } from './types';
import { isSupabaseConnected } from './services/supabaseClient';
import * as db from './services/supabaseService';
import * as auth from './services/authService';
import { fetchSocialContent, searchSocial } from './services/socialService';
import { analyzeContentWithGemini, classifyContentWithGemini } from './services/geminiService';
import { isFallbackCoverUrl } from './shared/fallbackCovers.js';
import { pickSemanticCover } from './shared/semanticCovers.js';
import { canAccessManagement, canMutateResource } from './shared/authAccess.js';
import {
  applyXiaohongshuTokenToUrl,
  getXiaohongshuNoteId,
  hasXiaohongshuXsecToken,
  isXiaohongshuUrl,
  normalizeXiaohongshuSourceUrl
} from './shared/xiaohongshuUrls.js';
import { removeAliasIdsFromCollections } from './shared/collectionAliases.js';
import { normalizeCollectionName, shouldSubmitCollectionName } from './shared/collectionCreation.js';
import { getSettledValue } from './shared/settledLoad.js';
import { withTimeout } from './shared/asyncTimeout.js';
import { resolveLoadFallback } from './shared/loadFallback.js';
import { shouldReloadOnAuthEvent } from './shared/authEvents.js';
import { resolveCurrentAuthUser } from './shared/authState.js';
import { readStoredSnapshot, writeStoredSnapshot } from './shared/dataSnapshot.js';
import { mergeLoadedSnapshot } from './shared/loadMerge.js';

type ViewMode = 'dashboard' | 'grid' | 'monitoring' | 'chat';

// Updated categories
const POPULAR_TOPICS = ['All', 'Image Gen', 'Video Gen', 'Vibe Coding'];

const AUTO_MONITOR_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000;
const ENABLE_CLIENT_MONITORING = false;
const DEFAULT_MONITOR_KEYWORDS = ['AI', 'AIGC', '人工智能', '大模型', 'LLM', 'GPT', 'Claude'];
const OFFLINE_PUBLIC_OWNER_ID = 'offline-public';
const DATA_LOAD_TIMEOUT_MS = 12000;

type LoadedSnapshot = {
  cards: KnowledgeCard[];
  trending: KnowledgeCard[];
  collections: Collection[];
  tasks: TrackingTask[];
};

const toOfflinePublicCard = (card: KnowledgeCard): KnowledgeCard => ({
  ...card,
  ownerId: OFFLINE_PUBLIC_OWNER_ID,
  isPublic: true,
});

const toOfflinePublicCollection = (collection: Collection): Collection => ({
  ...collection,
  ownerId: OFFLINE_PUBLIC_OWNER_ID,
  isPublic: true,
});

const App: React.FC = () => {
  const [cards, setCards] = useState<KnowledgeCard[]>([]);
  const [tasks, setTasks] = useState<TrackingTask[]>([]);
  const [trending, setTrending] = useState<KnowledgeCard[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [selectedCard, setSelectedCard] = useState<KnowledgeCard | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewMode>('dashboard');
  const [loadNotice, setLoadNotice] = useState('');

  // Loading State
  const [isLoading, setIsLoading] = useState(true);
  const autoMonitoringRef = useRef(false);
  const tasksRef = useRef<TrackingTask[]>([]);
  const cardsRef = useRef<KnowledgeCard[]>([]);
  const trendingRef = useRef<KnowledgeCard[]>([]);
  const collectionsRef = useRef<Collection[]>([]);
  const lastSuccessfulDataRef = useRef<LoadedSnapshot | null>(null);
  const hasCompletedInitialLoadRef = useRef(false);
  const currentUserRef = useRef<AuthUser | null>(null);
  const loadRequestIdRef = useRef(0);

  // Chat Context State
  const [chatScope, setChatScope] = useState<{ cards: KnowledgeCard[], title: string }>({
    cards: [],
    title: '全部知识库'
  });

  // Collection Selection State
  const [currentCollectionId, setCurrentCollectionId] = useState<string | null>(null);
  const [activeCollectionMenuId, setActiveCollectionMenuId] = useState<string | null>(null);

  // Collection Creation State (Inline UI)
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');

  // Batch Selection State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [isAddToCollectionModalOpen, setIsAddToCollectionModalOpen] = useState(false);

  // Filter State
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    selectedTopic: 'All'
  });

  const isAuthenticated = Boolean(currentUser);
  const canManageData = canAccessManagement(isAuthenticated);

  const userCanMutate = (ownerId?: string) =>
    canMutateResource(currentUser?.id || null, ownerId || null);

  const openLoginModal = () => setIsLoginModalOpen(true);

  const loadData = async (
    authUser: AuthUser | null,
    options: { showOverlay?: boolean; preserveNotice?: boolean } = {}
  ) => {
    const { showOverlay = !hasCompletedInitialLoadRef.current, preserveNotice = false } = options;
    const requestId = ++loadRequestIdRef.current;

    if (showOverlay) setIsLoading(true);
    if (!preserveNotice) setLoadNotice('');
    try {
      if (isSupabaseConnected()) {
        const offlineSnapshot = {
          cards: INITIAL_DATA.map(toOfflinePublicCard),
          trending: TRENDING_DATA.map(toOfflinePublicCard),
          collections: INITIAL_COLLECTIONS.map(toOfflinePublicCollection),
          tasks: [],
        };
        const storedSnapshot = readStoredSnapshot(authUser?.id || null);
        const liveSnapshot = {
          cards: cardsRef.current,
          trending: trendingRef.current,
          collections: collectionsRef.current,
          tasks: tasksRef.current,
        };
        const baselineSnapshot = lastSuccessfulDataRef.current || storedSnapshot || liveSnapshot;

        const [cardsResult, trendingResult] = await Promise.allSettled([
          withTimeout(db.getKnowledgeCards(), DATA_LOAD_TIMEOUT_MS, []),
          withTimeout(db.getTrendingCards(), DATA_LOAD_TIMEOUT_MS, []),
        ]);

        if (requestId !== loadRequestIdRef.current) return;

        const dbCards = getSettledValue(cardsResult, [], 'Loading knowledge cards');
        const dbTrending = getSettledValue(trendingResult, [], 'Loading trending cards');
        const primaryResolved = resolveLoadFallback({
          cards: dbCards,
          trending: dbTrending,
          collections: [],
          tasks: [],
          authUser,
          offlineSnapshot,
          previousSnapshot: baselineSnapshot,
          storedSnapshot,
        });
        const primarySnapshot = mergeLoadedSnapshot(baselineSnapshot, {
          cards: primaryResolved.cards,
          trending: primaryResolved.trending,
        });

        setCards(primarySnapshot.cards);
        setTrending(primarySnapshot.trending);
        setCollections(primarySnapshot.collections);
        setTasks(primarySnapshot.tasks);
        setChatScope({ cards: primarySnapshot.cards, title: '全部知识库' });

        if (!primaryResolved.usedFallback) {
          lastSuccessfulDataRef.current = primarySnapshot;
          writeStoredSnapshot(authUser?.id || null, lastSuccessfulDataRef.current);
        }

        hasCompletedInitialLoadRef.current = true;
        if (showOverlay) setIsLoading(false);

        if (primaryResolved.usedFallback && isSupabaseConnected()) {
          setLoadNotice(
            lastSuccessfulDataRef.current || storedSnapshot
              ? '部分云端数据加载超时，当前继续显示最近一次成功加载的数据。可以稍后刷新重试。'
              : authUser
                ? '部分云端数据加载超时，当前未能加载你的私有知识卡片。请稍后刷新重试。'
                : '部分云端数据加载超时，当前已回退到内置公开内容。可以稍后刷新重试。'
          );
        }

        const [collectionsResult, tasksResult] = await Promise.allSettled([
          withTimeout(db.getCollections(), DATA_LOAD_TIMEOUT_MS, []),
          withTimeout(authUser ? db.getTasks() : Promise.resolve([]), DATA_LOAD_TIMEOUT_MS, []),
        ]);

        if (requestId !== loadRequestIdRef.current) return;

        const dbCollections = getSettledValue(collectionsResult, [], 'Loading collections');
        const dbTasks = getSettledValue(tasksResult, [], 'Loading tasks');
        const secondarySnapshot = mergeLoadedSnapshot(primarySnapshot, {
          collections: dbCollections,
          tasks: dbTasks,
        });

        setCollections(secondarySnapshot.collections);
        setTasks(secondarySnapshot.tasks);

        if (
          secondarySnapshot.cards.length > 0 ||
          secondarySnapshot.trending.length > 0 ||
          secondarySnapshot.collections.length > 0
        ) {
          lastSuccessfulDataRef.current = secondarySnapshot;
          writeStoredSnapshot(authUser?.id || null, secondarySnapshot);
        }
        return;
      }

      const offlineCards = INITIAL_DATA.map(toOfflinePublicCard);
      setCards(offlineCards);
      setTrending(TRENDING_DATA.map(toOfflinePublicCard));
      setCollections(INITIAL_COLLECTIONS.map(toOfflinePublicCollection));
      setTasks([]);
      setChatScope({ cards: offlineCards, title: '全部知识库' });
      lastSuccessfulDataRef.current = {
        cards: offlineCards,
        trending: TRENDING_DATA.map(toOfflinePublicCard),
        collections: INITIAL_COLLECTIONS.map(toOfflinePublicCollection),
        tasks: [],
      };
      writeStoredSnapshot(null, lastSuccessfulDataRef.current);
    } catch (error) {
      console.error('Failed to load app data:', error);
      setLoadNotice('云端数据加载失败，当前已回退为空状态。请稍后刷新重试。');
      setCards([]);
      setTrending([]);
      setCollections([]);
      setTasks([]);
      setChatScope({ cards: [], title: '全部知识库' });
    } finally {
      hasCompletedInitialLoadRef.current = true;
      if (showOverlay) setIsLoading(false);
    }
  };

  // ============ 从 Supabase 加载数据 ============
  useEffect(() => {
    let active = true;

    const hydrate = async () => {
      const session = isSupabaseConnected()
        ? await withTimeout(auth.getSession(), DATA_LOAD_TIMEOUT_MS, null)
        : null;
      const authUser = resolveCurrentAuthUser({
        session,
        fetchedUser: null,
        previousUser: currentUserRef.current,
      });
      if (!active) return;
      setCurrentUser(authUser);
      currentUserRef.current = authUser;
      await loadData(authUser, { showOverlay: true, preserveNotice: true });

      if (!session?.user) return;

      const enrichedUser = await withTimeout(auth.getCurrentAuthUser(), DATA_LOAD_TIMEOUT_MS, authUser);
      if (!active) return;

      const resolvedUser = resolveCurrentAuthUser({
        session,
        fetchedUser: enrichedUser,
        previousUser: currentUserRef.current,
      });
      setCurrentUser(resolvedUser);
      currentUserRef.current = resolvedUser;
    };

    hydrate();

    const subscription = auth.onAuthStateChange(async (event, session) => {
      if (!shouldReloadOnAuthEvent(event)) return;

      const authUser = resolveCurrentAuthUser({
        session,
        fetchedUser: null,
        previousUser: currentUserRef.current,
      });
      if (!active) return;
      setCurrentUser(authUser);
      currentUserRef.current = authUser;
      await loadData(authUser, { showOverlay: false });

      if (!session?.user) return;

      const enrichedUser = await withTimeout(auth.getCurrentAuthUser(), DATA_LOAD_TIMEOUT_MS, authUser);
      if (!active) return;

      const resolvedUser = resolveCurrentAuthUser({
        session,
        fetchedUser: enrichedUser,
        previousUser: currentUserRef.current,
      });
      setCurrentUser(resolvedUser);
      currentUserRef.current = resolvedUser;
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  useEffect(() => {
    trendingRef.current = trending;
  }, [trending]);

  useEffect(() => {
    collectionsRef.current = collections;
  }, [collections]);

  const inferCategoryTag = (text: string) => {
    const t = (text || '').toLowerCase();
    const imageKeywords = [
      'image', 'img', 'photo', 'picture', '图', '图片', '绘画', '生图', '海报', '头像',
      'midjourney', 'mj', 'stable diffusion', 'sd', 'comfyui', 'flux', 'krea',
      'lora', 'controlnet', 'prompt', '风格化', '修图', '上色'
    ];
    const videoKeywords = [
      'video', '视频', 'animation', '动画', '短片', '剪辑', '镜头',
      'runway', 'gen-3', 'gen3', 'kling', '可灵', 'pika', 'sora', 'veo', 'luma'
    ];
    const vibeKeywords = [
      'code', 'coding', '程序', '编程', '开发', '工程', 'repo', 'github', 'git',
      'cursor', 'claude code', 'vibe coding', 'vscode', 'ide', 'agent', 'workflow',
      '自动化', '前端', '后端', 'python', 'node', 'typescript', 'react', 'prompt engineering'
    ];

    const hasAny = (arr: string[]) => arr.some(k => t.includes(k));
    if (hasAny(imageKeywords)) return 'Image Gen';
    if (hasAny(videoKeywords)) return 'Video Gen';
    if (hasAny(vibeKeywords)) return 'Vibe Coding';
    return '';
  };

  const buildTrendingCard = (result: SocialSearchResult): KnowledgeCard => {
    const baseText = result.desc || result.title || '';
    const summary = baseText
      ? (baseText.length > 160 ? baseText.slice(0, 160) + '...' : baseText)
      : '暂无摘要';
    const extractedTags = (result.desc || '').match(/#[^\s#]+/g)?.map(t => t.slice(1)) || [];
    const sourceTags = (result.tags || []).filter(Boolean);
    const sourceToolTags = sourceTags.filter(t => t !== 'Image Gen' && t !== 'Video Gen' && t !== 'Vibe Coding');
    const category = inferCategoryTag(baseText);
    const tags = category
      ? Array.from(new Set([category, ...sourceToolTags, ...extractedTags]))
      : Array.from(new Set([...sourceTags, ...extractedTags]));
    const semanticCover = pickSemanticCover({
      text: baseText,
      seed: result.sourceUrl || result.noteId || result.author,
      categoryHint: category
    });
    const preferredCoverImage = result.coverImage || result.images?.[0] || semanticCover.coverImage;

    return {
      id: crypto.randomUUID(),
      title: result.title || result.desc?.slice(0, 40) || '无标题',
      sourceUrl: result.sourceUrl,
      platform: result.platform,
      author: result.author,
      date: result.publishTime || '',
      coverImage: preferredCoverImage,
      images: result.images || [],
      metrics: result.metrics,
      contentType: ContentType.ToolReview,
      rawContent: result.desc || '',
      aiAnalysis: {
        summary,
        usageScenarios: [],
        coreKnowledge: [],
        extractedPrompts: []
      },
      tags,
      userNotes: '',
      collections: [],
    };
  };

  const runAutoMonitoring = async () => {
    if (autoMonitoringRef.current) return;
    if (document.hidden) return;

    autoMonitoringRef.current = true;
    try {
      const activeTasks: TrackingTask[] = tasksRef.current.length > 0 ? tasksRef.current : [{
        id: 'default',
        keywords: DEFAULT_MONITOR_KEYWORDS.join(' '),
        platforms: [Platform.Xiaohongshu, Platform.Twitter],
        dateRange: { start: '', end: '' },
        status: TaskStatus.Running,
        itemsFound: 0,
        lastRun: '',
        config: { sort: 'popularity_descending', noteTime: '一周内' }
      }];

      const knownSourceUrls = new Set(
        [...cardsRef.current, ...trendingRef.current].map(c => c.sourceUrl).filter(Boolean)
      );

      const newTrending: KnowledgeCard[] = [];
      const updatedTasks: TrackingTask[] = [];

      for (const task of activeTasks) {
        const platforms = task.platforms?.length ? task.platforms : [Platform.Xiaohongshu, Platform.Twitter];
        const responses = await Promise.all(
          platforms.map(p => searchSocial({
            keyword: task.keywords,
            platform: p === Platform.Twitter ? 'twitter' : 'xiaohongshu',
            page: 1,
            sort: task.config?.sort || 'popularity_descending',
            noteType: task.config?.noteType || '_0',
            noteTime: task.config?.noteTime || undefined,
            limit: 20,
          }))
        );

        let results: SocialSearchResult[] = responses.flatMap(r => r.results || []);

        const minInter = task.config?.minInteraction;
        if (minInter && !isNaN(Number(minInter))) {
          const min = Number(minInter);
          results = results.filter((r: SocialSearchResult) => {
            const total = (r.metrics.likes || 0) + (r.metrics.bookmarks || 0) + (r.metrics.comments || 0);
            return total >= min;
          });
        }

        for (const result of results) {
          if (!result?.sourceUrl || knownSourceUrls.has(result.sourceUrl)) continue;
          knownSourceUrls.add(result.sourceUrl);
          newTrending.push(buildTrendingCard(result));
        }

        if (task.id !== 'default') {
          const updatedTask: TrackingTask = {
            ...task,
            status: TaskStatus.Completed,
            itemsFound: results.length,
            lastRun: new Date().toISOString(),
          };
          updatedTasks.push(updatedTask);
        }
      }

      if (newTrending.length > 0) {
        setTrending(prev => [...newTrending, ...prev].slice(0, 60));
        if (isSupabaseConnected()) {
          for (const card of newTrending) {
            await db.saveCard(card, true);
          }
        }
      }

      if (updatedTasks.length > 0) {
        setTasks(prev => prev.map(t => {
          const updated = updatedTasks.find(u => u.id === t.id);
          return updated || t;
        }));
        if (isSupabaseConnected()) {
          for (const task of updatedTasks) {
            await db.saveTask(task);
          }
        }
      }
    } catch (err) {
      console.error('Auto monitoring failed:', err);
    } finally {
      autoMonitoringRef.current = false;
    }
  };

  useEffect(() => {
    if (isLoading) return;
    if (!ENABLE_CLIENT_MONITORING) return;
    runAutoMonitoring();
    const timer = setInterval(runAutoMonitoring, AUTO_MONITOR_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isLoading]);

  // 刷新知识库卡片
  const refreshCards = async () => {
    if (isSupabaseConnected()) {
      const dbCards = await db.getKnowledgeCards();
      setCards(dbCards);
      setChatScope(prev => ({ ...prev, cards: dbCards })); // Update chat scope if needed
    }
    // 离线模式下暂时无法真正保存新卡片，除非我们修改内存中的 STATE。
    // 但鉴于 saveCard 在离线时返回 false，这里主要处理在线逻辑。
  };

  const handleLoginSubmit = async (username: string, password: string): Promise<string | null> => {
    const result = await auth.signInWithUsername(username, password);
    if (!result.ok) {
      return result.error || '登录失败，请重试。';
    }

    const authUser = result.user || await auth.getCurrentAuthUser();
    setCurrentUser(authUser);
    currentUserRef.current = authUser;
    return null;
  };

  const handleLogout = async () => {
    await auth.signOut();
    setCurrentUser(null);
    currentUserRef.current = null;
    setShowSettings(false);
    setSelectedCard(null);
    setIsSidebarOpen(false);
    setIsSelectionMode(false);
    setSelectedCardIds(new Set());
  };

  const handleClearLocalAuthState = () => {
    auth.clearLocalAuthState();
    setCurrentUser(null);
  };

  const { displayCollections, collectionAliasMap } = useMemo(() => {
    const groups = new Map<string, { canonical: Collection; ids: string[] }>();

    for (const col of collections) {
      const key = `${col.ownerId || 'public'}::${col.name.trim().toLowerCase()}::${col.coverImage || ''}`;
      const group = groups.get(key);
      if (!group) {
        groups.set(key, { canonical: col, ids: [col.id] });
      } else {
        group.ids.push(col.id);
      }
    }

    const aliasMap: Record<string, string[]> = {};
    const deduped = Array.from(groups.values()).map(group => {
      aliasMap[group.canonical.id] = group.ids;
      return group.canonical;
    });

    return { displayCollections: deduped, collectionAliasMap: aliasMap };
  }, [collections]);

  const getCollectionAliasIds = (collectionId: string) => {
    return collectionAliasMap[collectionId] || [collectionId];
  };

  const xhsMissingTokenItems = useMemo<XhsMissingTokenItem[]>(() => {
    const items: XhsMissingTokenItem[] = [];
    const seenNoteIds = new Set<string>();

    const collect = (card: KnowledgeCard, from: 'trending' | 'vault') => {
      if (!userCanMutate(card.ownerId)) return;
      if (card.platform !== Platform.Xiaohongshu) return;
      const normalized = normalizeXiaohongshuSourceUrl(card.sourceUrl) || card.sourceUrl;
      if (!isXiaohongshuUrl(normalized)) return;
      if (hasXiaohongshuXsecToken(normalized)) return;

      const noteId = getXiaohongshuNoteId(normalized);
      if (!noteId || seenNoteIds.has(noteId)) return;

      seenNoteIds.add(noteId);
      items.push({
        id: `${from}:${card.id}`,
        noteId,
        title: card.title || '',
        author: card.author || '',
        date: card.date || '',
        sourceUrl: normalized,
        from
      });
    };

    trending.forEach(card => collect(card, 'trending'));
    cards.forEach(card => collect(card, 'vault'));
    return items;
  }, [cards, currentUser, trending]);

  const handleApplyXhsTokenConfig = async (config: XhsTokenConfig) => {
    const noteId = String(config.noteId || '').trim();
    const token = String(config.xsecToken || '').trim();
    const source = String(config.xsecSource || 'pc_feed').trim() || 'pc_feed';
    if (!noteId || !token) return;

    const patchCard = (card: KnowledgeCard): KnowledgeCard => {
      if (!userCanMutate(card.ownerId)) return card;
      const normalized = normalizeXiaohongshuSourceUrl(card.sourceUrl) || card.sourceUrl;
      if (!isXiaohongshuUrl(normalized)) return card;
      if (getXiaohongshuNoteId(normalized) !== noteId) return card;
      const nextUrl = applyXiaohongshuTokenToUrl(normalized, token, source);
      if (!nextUrl || nextUrl === card.sourceUrl) return card;
      return { ...card, sourceUrl: nextUrl };
    };

    const nextCards = cards.map(patchCard);
    const changedCards = nextCards.filter((card, idx) => card.sourceUrl !== cards[idx].sourceUrl);
    if (changedCards.length > 0) setCards(nextCards);

    const nextTrending = trending.map(patchCard);
    const changedTrending = nextTrending.filter((card, idx) => card.sourceUrl !== trending[idx].sourceUrl);
    if (changedTrending.length > 0) setTrending(nextTrending);

    if (selectedCard) {
      const updatedSelected = patchCard(selectedCard);
      if (updatedSelected.sourceUrl !== selectedCard.sourceUrl) setSelectedCard(updatedSelected);
    }

    if (isSupabaseConnected()) {
      for (const card of changedCards) {
        await db.updateCard(card);
      }
      for (const card of changedTrending) {
        await db.saveCard(card, true);
      }
    }
  };

  const handleRepairTrendingSourceUrl = async (
    card: KnowledgeCard
  ): Promise<{ updated: boolean; message: string }> => {
    if (!userCanMutate(card.ownerId)) {
      return { updated: false, message: '只能修复你自己的内容链接。' };
    }
    const currentUrl = normalizeXiaohongshuSourceUrl(card.sourceUrl) || card.sourceUrl;
    if (card.platform !== Platform.Xiaohongshu || !isXiaohongshuUrl(currentUrl)) {
      return { updated: false, message: '仅支持小红书链接修复。' };
    }

    try {
      const fetched = await fetchSocialContent(currentUrl);
      const refreshedUrl = normalizeXiaohongshuSourceUrl(fetched?.sourceUrl || '');
      if (!refreshedUrl || !isXiaohongshuUrl(refreshedUrl) || !hasXiaohongshuXsecToken(refreshedUrl)) {
        return { updated: false, message: '⚠️ 暂未获取到有效 xsec_token，请到「设置 → XHS Token 配置」补全。' };
      }
      if (refreshedUrl === currentUrl) {
        return { updated: false, message: '⚠️ 当前未拿到新的链接参数，请稍后再试。' };
      }

      const updatedCard = { ...card, sourceUrl: refreshedUrl };
      setTrending(prev => prev.map(item => (item.id === card.id ? updatedCard : item)));
      if (selectedCard?.id === card.id) {
        setSelectedCard(updatedCard);
      }
      if (isSupabaseConnected()) {
        await db.saveCard(updatedCard, true);
      }

      return { updated: true, message: '✅ 链接已更新，重新点击即可。' };
    } catch (error: any) {
      return { updated: false, message: `⚠️ 修复失败：${error?.message || '请稍后重试'}` };
    }
  };

  // Check if a card belongs to a collection
  const isCardInCollection = (card: KnowledgeCard, collectionId: string) => {
    const aliasIds = getCollectionAliasIds(collectionId);
    return card.collections?.some(cid => aliasIds.includes(cid)) ?? false;
  };

  // Derived filtered data
  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      // 1. Search Filter
      const matchesSearch = card.title.toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
        card.tags.some(t => t.toLowerCase().includes(filters.searchQuery.toLowerCase()));

      // 2. Topic Filter
      const matchesTopic = filters.selectedTopic === 'All' ||
        card.tags.some(t => t.toLowerCase() === filters.selectedTopic.toLowerCase());

      // 3. Collection Filter
      let matchesCollection = true;
      if (currentCollectionId) {
        matchesCollection = isCardInCollection(card, currentCollectionId);
      }

      return matchesSearch && matchesTopic && matchesCollection;
    });
  }, [cards, filters, currentCollectionId]);

  // Delete Card Handler
  const handleDeleteCard = async (cardId: string) => {
    const target = cards.find(c => c.id === cardId) || trending.find(c => c.id === cardId) || selectedCard;
    if (!userCanMutate(target?.ownerId)) {
      window.alert(isAuthenticated ? '只能删除你自己的内容。' : '请先登录后再操作。');
      if (!isAuthenticated) openLoginModal();
      return;
    }

    if (isSupabaseConnected()) {
      const success = await db.deleteCard(cardId);
      if (success) {
        setCards(prev => prev.filter(c => c.id !== cardId));
        setChatScope(prev => ({ ...prev, cards: prev.cards.filter(c => c.id !== cardId) }));
        setSelectedCard(null); // Close modal if open
      }
    } else {
      // Offline mode deletion
      setCards(prev => prev.filter(c => c.id !== cardId));
      setChatScope(prev => ({ ...prev, cards: prev.cards.filter(c => c.id !== cardId) }));
      setSelectedCard(null);
    }
  };

  const handleAddCard = async (newCard: KnowledgeCard) => {
    if (!currentUser) {
      openLoginModal();
      return;
    }

    const ownedCard: KnowledgeCard = {
      ...newCard,
      ownerId: currentUser.id,
      isPublic: false,
    };

    setCards(prev => [ownedCard, ...prev]);
    if (isSupabaseConnected()) {
      await db.saveCard(ownedCard, false);
    }
  };

  const handleAddTask = async (newTask: TrackingTask) => {
    if (!currentUser) {
      openLoginModal();
      return;
    }

    const ownedTask: TrackingTask = {
      ...newTask,
      ownerId: currentUser.id,
    };

    setTasks(prev => [ownedTask, ...prev]);
    if (isSupabaseConnected()) {
      await db.saveTask(ownedTask);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const target = tasks.find(t => t.id === taskId);
    if (!userCanMutate(target?.ownerId)) {
      window.alert(isAuthenticated ? '只能删除你自己的任务。' : '请先登录后再操作。');
      if (!isAuthenticated) openLoginModal();
      return;
    }
    setTasks(prev => prev.filter(t => t.id !== taskId));
    if (isSupabaseConnected()) {
      await db.deleteTask(taskId);
    }
  };

  const handleSaveTrendingToVault = async (card: KnowledgeCard) => {
    if (!userCanMutate(card.ownerId)) {
      window.alert(isAuthenticated ? '只能保存或移动你自己的热点内容。' : '请先登录后再操作。');
      if (!isAuthenticated) openLoginModal();
      return;
    }

    const shouldAnalyze = (target: KnowledgeCard) => {
      const summary = target.aiAnalysis?.summary?.trim() || '';
      const hasSummary = summary.length > 0 && summary !== '暂无摘要';
      const hasDetails = (target.aiAnalysis?.usageScenarios?.length || 0) > 0
        || (target.aiAnalysis?.coreKnowledge?.length || 0) > 0
        || (target.aiAnalysis?.extractedPrompts?.length || 0) > 0;
      return !hasSummary || !hasDetails;
    };

    const buildAnalysisContent = (target: KnowledgeCard) => {
      const content = [target.title, target.rawContent].filter(Boolean).join('\n');
      return content.trim();
    };

    const enrichWithAnalysis = async (target: KnowledgeCard) => {
      if (!shouldAnalyze(target)) return target;
      const content = buildAnalysisContent(target);
      if (!content) return target;

      try {
        let imageUrls = (target.images || []).filter(Boolean);
        if (imageUrls.length === 0 && target.sourceUrl) {
          try {
            const fetched = await fetchSocialContent(target.sourceUrl);
            imageUrls = (fetched?.images || []).filter(Boolean);
          } catch (err) {
            console.warn('Fetch source images for analysis failed:', err);
          }
        }

        const analysis = await analyzeContentWithGemini(content, { imageUrls });
        const summary = analysis?.summary?.trim() || target.aiAnalysis?.summary || '';
        const suggestedTitle = analysis?.suggestedTitle?.trim() || '';
        const preferredTitle = target.platform === Platform.Twitter
          ? (suggestedTitle || target.title || '').trim() || target.title
          : (target.title || suggestedTitle).trim() || target.title;
        return {
          ...target,
          title: preferredTitle,
          aiAnalysis: {
            summary,
            usageScenarios: analysis?.usageScenarios || target.aiAnalysis?.usageScenarios || [],
            coreKnowledge: analysis?.coreKnowledge || target.aiAnalysis?.coreKnowledge || [],
            extractedPrompts: analysis?.extractedPrompts || target.aiAnalysis?.extractedPrompts || [],
            suggestedTitle,
            toolTags: analysis?.toolTags || target.aiAnalysis?.toolTags || []
          }
        };
      } catch (error) {
        console.error('Trending analysis failed:', error);
        return target;
      }
    };

    const isFallbackPoolCover = (url?: string) => isFallbackCoverUrl(url || '');

    const enrichCoverImage = async (target: KnowledgeCard) => {
      if (target.coverImage && !isFallbackPoolCover(target.coverImage)) return target;
      if (!target.sourceUrl) return target;

      try {
        const fetched = await fetchSocialContent(target.sourceUrl);
        if (fetched?.coverImage) {
          return { ...target, coverImage: fetched.coverImage };
        }
      } catch (error) {
        console.warn('Cover image generation failed:', error);
      }

      const semanticCover = pickSemanticCover({
        text: [target.title, target.rawContent, target.aiAnalysis?.summary].filter(Boolean).join('\n'),
        seed: target.sourceUrl || target.id || target.author,
        categoryHint: (target.tags || []).find(t => t === 'Image Gen' || t === 'Video Gen' || t === 'Vibe Coding') || ''
      });
      if (semanticCover?.coverImage) {
        return { ...target, coverImage: semanticCover.coverImage };
      }

      return target;
    };

    const normalizeCategory = (value: string) => {
      const v = (value || '').trim();
      if (v === 'Image Gen' || v === 'Video Gen' || v === 'Vibe Coding') return v;
      return '';
    };

    const ensureTags = async (target: KnowledgeCard) => {
      const currentTags = (target.tags || []).filter(Boolean).filter(t => !t.startsWith('snapshot:'));
      if (currentTags.length > 0) return target;

      const text = [target.title, target.rawContent, target.aiAnalysis?.summary]
        .filter(Boolean)
        .join('\n');

      const extracted = text.match(/#[^\s#]+/g)?.map(t => t.slice(1)).filter(Boolean) || [];
      let category = inferCategoryTag(text);
      if (!category && text.trim()) {
        const aiCategory = await classifyContentWithGemini(text);
        category = normalizeCategory(aiCategory);
      }
      if (!category) category = 'Vibe Coding';
      const tagSet = new Set<string>();
      if (category) tagSet.add(category);
      extracted.forEach(t => tagSet.add(t));
      (target.aiAnalysis?.toolTags || []).forEach(t => tagSet.add(t));

      return { ...target, tags: Array.from(tagSet) };
    };

    // Add to main cards list
    const savedCard = { ...card, id: isSupabaseConnected() ? card.id : Date.now().toString() };
    setCards(prev => [savedCard, ...prev]);
    // Remove from trending list
    setTrending(prev => prev.filter(c => c.id !== card.id));

    let updatedCard = await enrichCoverImage(savedCard);
    updatedCard = await enrichWithAnalysis(updatedCard);
    updatedCard = await ensureTags(updatedCard);

    if (updatedCard !== savedCard) {
      setCards(prev => prev.map(c => c.id === savedCard.id ? updatedCard : c));
    }

    if (isSupabaseConnected()) {
      if (updatedCard !== savedCard) {
        await db.updateCard(updatedCard);
      } else {
        await db.moveTrendingToVault(card);
      }
    }
  };

  // Update card data (e.g. when adding a note)
  const handleUpdateCard = async (updatedCard: KnowledgeCard) => {
    if (!userCanMutate(updatedCard.ownerId)) {
      window.alert(isAuthenticated ? '只能编辑你自己的内容。' : '请先登录后再操作。');
      if (!isAuthenticated) openLoginModal();
      return;
    }

    // Update selected card state
    setSelectedCard(updatedCard);

    // Update if it's in the main vault
    setCards(prev => prev.map(c => c.id === updatedCard.id ? updatedCard : c));

    // Update if it's in the trending list
    setTrending(prev => prev.map(c => c.id === updatedCard.id ? updatedCard : c));

    if (isSupabaseConnected()) {
      await db.updateCard(updatedCard);
    }
  };

  const handleCollectionClick = (collectionId: string) => {
    setActiveView('grid');
    setCurrentCollectionId(collectionId);
    setFilters(prev => ({ ...prev, selectedTopic: 'All' })); // Reset topic when switching collection
    setIsSidebarOpen(false);

    // Reset selection mode when changing collections
    setIsSelectionMode(false);
    setSelectedCardIds(new Set());
  };

  const handleMainNavigation = (view: ViewMode) => {
    if (view === 'monitoring' && !canManageData) {
      openLoginModal();
      return;
    }
    setActiveView(view);
    if (view === 'chat') {
      // Sidebar Assistant should always represent full-vault chat scope.
      setChatScope({ cards, title: '全部知识库' });
    }

    setCurrentCollectionId(null); // Reset collection when navigating via main menu
    setIsSidebarOpen(false);
    setIsSelectionMode(false);
    setSelectedCardIds(new Set());
  }

  // --- Collection Management Functions ---

  const confirmCreateCollection = async () => {
    if (!currentUser) {
      openLoginModal();
      return;
    }

    const normalizedName = normalizeCollectionName(newCollectionName);

    if (normalizedName) {
      // 使用固定的 placeholder 图片，避免刷新时变化
      const placeholderImages = [
        'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=200&h=200&fit=crop', // books
        'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=200&h=200&fit=crop', // library
        'https://images.unsplash.com/photo-1532012197267-da84d127e765?w=200&h=200&fit=crop', // book stack
        'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=200&h=200&fit=crop', // coffee & book
        'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=200&h=200&fit=crop', // study desk
      ];
      const randomIndex = collections.length % placeholderImages.length;

      const newCollection: Collection = {
        id: `c_${Date.now()}`, // 临时 ID，数据库会返回真正的 UUID
        ownerId: currentUser.id,
        isPublic: false,
        name: normalizedName,
        coverImage: placeholderImages[randomIndex],
        itemCount: 0
      };

      if (isSupabaseConnected()) {
        const newId = await db.saveCollection(newCollection);
        if (newId) {
          // 使用数据库返回的真实 UUID
          setCollections(prev => [...prev, { ...newCollection, id: newId }]);
        } else {
          // 如果保存失败，仍然添加到本地（离线模式）
          setCollections(prev => [...prev, newCollection]);
        }
      } else {
        setCollections(prev => [...prev, newCollection]);
      }

      setNewCollectionName('');
      setIsCreatingCollection(false);
    }
  };

  const cancelCreateCollection = () => {
    setIsCreatingCollection(false);
    setNewCollectionName('');
  }

  const handleDeleteCollection = async (e: React.MouseEvent, collectionId: string) => {
    e.stopPropagation();
    const target = collections.find(c => c.id === collectionId) || collections.find(c => getCollectionAliasIds(collectionId).includes(c.id));
    if (!userCanMutate(target?.ownerId)) {
      window.alert(isAuthenticated ? '只能删除你自己的收藏夹。' : '请先登录后再操作。');
      if (!isAuthenticated) openLoginModal();
      return;
    }
    const aliasIds = getCollectionAliasIds(collectionId);
    if (window.confirm("确定要删除这个收藏夹吗？其中内容不会被删除。")) {
      setCollections(prev => prev.filter(c => !aliasIds.includes(c.id)));
      if (currentCollectionId && aliasIds.includes(currentCollectionId)) {
        setCurrentCollectionId(null);
      }

      if (isSupabaseConnected()) {
        await Promise.all(aliasIds.map(id => db.deleteCollection(id)));
      }
    }
    setActiveCollectionMenuId(null);
  };

  const handleRenameCollection = async (e: React.MouseEvent, collectionId: string, currentName: string) => {
    e.stopPropagation();
    const target = collections.find(c => c.id === collectionId) || collections.find(c => getCollectionAliasIds(collectionId).includes(c.id));
    if (!userCanMutate(target?.ownerId)) {
      window.alert(isAuthenticated ? '只能重命名你自己的收藏夹。' : '请先登录后再操作。');
      if (!isAuthenticated) openLoginModal();
      return;
    }
    const aliasIds = getCollectionAliasIds(collectionId);
    const newName = window.prompt("重命名收藏夹", currentName);
    if (newName && newName.trim()) {
      const updatedCollection = collections.find(c => c.id === collectionId) || collections.find(c => aliasIds.includes(c.id));
      if (updatedCollection) {
        const renamed = { ...updatedCollection, name: newName };
        setCollections(prev => prev.map(c => aliasIds.includes(c.id) ? { ...c, name: newName } : c));

        if (isSupabaseConnected()) {
          await Promise.all(aliasIds.map(id => db.updateCollection({ ...renamed, id })));
        }
      }
    }
    setActiveCollectionMenuId(null);
  };

  // --- Chat with Album ---
  const handleChatWithCollection = (collectionId: string) => {
    const collection = displayCollections.find(c => c.id === collectionId);
    if (!collection) return;

    // Filter cards belonging to this collection
    const collectionCards = cards.filter(c => isCardInCollection(c, collectionId));

    // Set scope and navigate
    setChatScope({
      cards: collectionCards,
      title: collection.name
    });
    setActiveView('chat');
  };

  // --- Batch Selection Functions ---

  const toggleSelectionMode = () => {
    if (!canManageData) {
      openLoginModal();
      return;
    }
    setIsSelectionMode(!isSelectionMode);
    setSelectedCardIds(new Set());
  };

  const toggleCardSelection = (cardId: string) => {
    const target = cards.find(card => card.id === cardId);
    if (target && !userCanMutate(target.ownerId)) {
      return;
    }
    const newSet = new Set(selectedCardIds);
    if (newSet.has(cardId)) {
      newSet.delete(cardId);
    } else {
      newSet.add(cardId);
    }
    setSelectedCardIds(newSet);
  };

  const handleRemoveSelectedFromCollection = async () => {
    if (!currentCollectionId || selectedCardIds.size === 0) return;
    if (!canManageData) {
      openLoginModal();
      return;
    }
    const aliasIds = getCollectionAliasIds(currentCollectionId);

    if (window.confirm(`确定从当前收藏夹移除 ${selectedCardIds.size} 条内容吗？`)) {
      const updatedCards: KnowledgeCard[] = [];
      setCards(prevCards => prevCards.map(card => {
        if (selectedCardIds.has(card.id)) {
          const nextCollections = removeAliasIdsFromCollections(card.collections || [], aliasIds);
          if (nextCollections.length === (card.collections || []).length) {
            return card;
          }
          const updated = {
            ...card,
            collections: nextCollections
          };
          updatedCards.push(updated);
          return updated;
        }
        return card;
      }));
      setIsSelectionMode(false);
      setSelectedCardIds(new Set());

      if (isSupabaseConnected()) {
        for (const card of updatedCards) {
          await db.updateCard(card);
        }
      }
    }
  };

  const handleBatchAddToCollection = async (targetCollectionId: string) => {
    if (!canManageData) {
      openLoginModal();
      return;
    }
    const updatedCards: KnowledgeCard[] = [];
    setCards(prevCards => prevCards.map(card => {
      if (selectedCardIds.has(card.id)) {
        if (!userCanMutate(card.ownerId)) return card;
        const currentCollections = card.collections || [];
        if (!currentCollections.includes(targetCollectionId)) {
          const updated = { ...card, collections: [...currentCollections, targetCollectionId] };
          updatedCards.push(updated);
          return updated;
        }
      }
      return card;
    }));
    setIsAddToCollectionModalOpen(false);
    setIsSelectionMode(false);
    setSelectedCardIds(new Set());
    alert("已成功添加到收藏夹。");

    if (isSupabaseConnected()) {
      for (const card of updatedCards) {
        await db.updateCard(card);
      }
    }
  };

  const activeCollectionName = useMemo(() => {
    return displayCollections.find(c => c.id === currentCollectionId)?.name;
  }, [currentCollectionId, displayCollections]);

  // Click outside listener to close dropdowns
  useEffect(() => {
    const handleClickOutside = () => setActiveCollectionMenuId(null);
    if (activeCollectionMenuId) {
      window.addEventListener('click', handleClickOutside);
    }
    return () => window.removeEventListener('click', handleClickOutside);
  }, [activeCollectionMenuId]);

  return (
    <div className="h-[100dvh] overflow-hidden bg-gradient-to-br from-[#0a0f1a] via-[#0d1a2d] to-[#0a0f1a] flex font-sans text-gray-100 relative">
      {/* Deep ocean glow effect */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[150px]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px]"></div>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-[100] bg-[#0a0f1a]/95 flex flex-col items-center justify-center">
          <Loader2 className="w-10 h-10 text-indigo-400 animate-spin mb-4" />
          <p className="text-gray-400 text-sm">正在加载你的知识库...</p>
        </div>
      )}

      {loadNotice && !isLoading && (
        <div className="fixed top-4 left-1/2 z-[90] -translate-x-1/2 rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-100 backdrop-blur">
          {loadNotice}
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)}></div>
      )}

      {/* Sidebar Navigation */}
      <aside className={`
        fixed lg:sticky top-0 left-0 h-[100dvh] w-64 bg-[#0d1526]/80 backdrop-blur-xl border-r border-[#1e3a5f]/50 z-50 transform transition-transform duration-300 ease-in-out flex flex-col
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Top Section: Logo & Nav */}
        <div className="p-4 pt-4 pb-2">
          <div className="flex items-center gap-3 mb-2">
            <img
              src="/logo_icon.png"
              alt="Logo"
              className="w-14 h-14 object-contain drop-shadow-lg"
            />
            <div className="flex flex-col justify-center leading-tight">
              <h1 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-200 to-purple-300 tracking-tight">
                AI热点
              </h1>
              <h1 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-200 to-purple-300 tracking-tight">
                洞察库
              </h1>
            </div>

            {/* Vertical Separator */}
            <div className="h-10 w-0.5 bg-gradient-to-b from-indigo-500/0 via-indigo-500/50 to-purple-500/0 mx-2 rounded-full"></div>

            <div className="flex flex-col justify-center leading-tight ml-1">
              <h1 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-200 to-purple-300 tracking-tight">卡片式</h1>
              <h1 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-200 to-purple-300 tracking-tight">知识库</h1>
            </div>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => handleMainNavigation('dashboard')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${activeView === 'dashboard' ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
            >
              <Home size={20} />
              近期热点
            </button>
            <button
              onClick={() => handleMainNavigation('grid')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${activeView === 'grid' && !currentCollectionId ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
            >
              <LayoutGrid size={20} />
              知识卡片
            </button>
            <button
              onClick={() => handleMainNavigation('monitoring')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${activeView === 'monitoring' ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
            >
              <Activity size={20} />
              {canManageData ? '热点搜索' : '登录后管理'}
            </button>
            <button
              onClick={() => handleMainNavigation('chat')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${activeView === 'chat' ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
            >
              <MessageSquare size={20} />
              智能助手
            </button>
          </nav>
        </div>

        {/* Middle Section: Collections (flex-1 pushes bottom section down) */}
        <div className="flex-1 overflow-y-auto px-6 py-4 mt-2">
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">收藏夹</h3>
            {canManageData && (
              <button
                onClick={() => setIsCreatingCollection(true)}
                className="text-gray-500 hover:text-indigo-400 hover:bg-indigo-500/20 p-1 rounded-md transition-colors"
              >
                <Plus size={14} />
              </button>
            )}
          </div>

          <div className="space-y-3">
            {displayCollections.map(col => {
              // Calculate dynamic count
              const realItemCount = cards.filter(c => isCardInCollection(c, col.id)).length;

              return (
                <div
                  key={col.id}
                  onClick={() => handleCollectionClick(col.id)}
                  className={`group relative flex items-start gap-3 p-2 -mx-2 rounded-xl cursor-pointer transition-colors ${currentCollectionId === col.id ? 'bg-indigo-500/20' : 'hover:bg-white/5'}`}
                >
                  <div className="w-10 h-10 rounded-lg bg-[#1e3a5f]/50 overflow-hidden flex-shrink-0 border border-[#1e3a5f]/50">
                    <img src={col.coverImage} alt={col.name} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <h4 className={`text-sm font-medium truncate leading-tight mb-0.5 ${currentCollectionId === col.id ? 'text-indigo-300' : 'text-gray-300 group-hover:text-gray-100'}`}>
                      {col.name}
                    </h4>
                    <span className="text-[10px] text-gray-500 font-medium">
                      {realItemCount} 条
                    </span>
                  </div>

                  {/* More Menu Trigger */}
                  {userCanMutate(col.ownerId) && (
                    <button
                      className={`absolute right-2 top-3 p-1 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity ${activeCollectionMenuId === col.id ? 'opacity-100 bg-white/10' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveCollectionMenuId(activeCollectionMenuId === col.id ? null : col.id);
                      }}
                    >
                      <MoreVertical size={14} />
                    </button>
                  )}

                  {/* Dropdown Menu */}
                  {activeCollectionMenuId === col.id && (
                    <div className="absolute right-0 top-10 w-32 bg-[#0d1526]/95 backdrop-blur-lg rounded-lg shadow-xl border border-[#1e3a5f]/50 z-50 py-1 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                      <button
                        onClick={(e) => handleRenameCollection(e, col.id, col.name)}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-gray-400 hover:bg-white/5 hover:text-indigo-400 flex items-center gap-2"
                      >
                        <Edit2 size={12} /> 重命名
                      </button>
                      <button
                        onClick={(e) => handleDeleteCollection(e, col.id)}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-gray-400 hover:bg-red-500/10 hover:text-red-400 flex items-center gap-2"
                      >
                        <Trash2 size={12} /> 删除
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {canManageData && isCreatingCollection ? (
            <div className="mt-4 p-3 border border-indigo-500/30 bg-indigo-500/10 rounded-xl animate-in fade-in zoom-in-95 duration-200">
              <input
                type="text"
                autoFocus
                placeholder="收藏夹名称"
                className="w-full bg-[#0a0f1a]/50 border border-[#1e3a5f]/50 rounded-lg px-2 py-1.5 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 mb-2 transition-all"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (shouldSubmitCollectionName({ key: e.key, isComposing: e.nativeEvent.isComposing })) confirmCreateCollection();
                  if (e.key === 'Escape') cancelCreateCollection();
                }}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={cancelCreateCollection}
                  className="px-2 py-1.5 text-xs font-medium text-gray-400 hover:bg-white/5 hover:text-gray-200 rounded transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={confirmCreateCollection}
                  disabled={!normalizeCollectionName(newCollectionName)}
                  className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-50 hover:bg-indigo-700"
                >
                  创建
                </button>
              </div>
            </div>
          ) : canManageData ? (
            <button
              onClick={() => setIsCreatingCollection(true)}
              className="w-full mt-4 flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#1e3a5f]/50 rounded-xl text-gray-500 hover:text-indigo-400 hover:border-indigo-500/50 hover:bg-indigo-500/10 transition-all text-sm font-medium">
              <Plus size={16} />
              新建收藏夹
            </button>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-[#1e3a5f]/50 px-4 py-3 text-center text-xs text-gray-500">
              登录后可创建和管理收藏夹
            </div>
          )}
        </div>

        {/* Bottom Section: User Profile */}
        <div className="p-4 border-t border-[#1e3a5f]/30 bg-[#0d1526]/50">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs">
              {(currentUser?.username || 'G').slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-100 truncate">{currentUser?.displayName || '游客模式'}</p>
              <p className="text-xs text-gray-500 truncate">{currentUser ? `@${currentUser.username}` : '仅可浏览公开内容'}</p>
            </div>
            {currentUser ? (
              <>
                <button
                  onClick={() => setShowSettings(true)}
                  className="p-1.5 rounded-md text-gray-500 hover:text-gray-200 hover:bg-white/10 transition-colors"
                  title="设置"
                >
                  <Settings size={16} />
                </button>
                <button
                  onClick={handleLogout}
                  className="p-1.5 rounded-md text-gray-500 hover:text-gray-200 hover:bg-white/10 transition-colors"
                  title="退出登录"
                >
                  <LogOut size={16} />
                </button>
              </>
            ) : (
              <button
                onClick={openLoginModal}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
              >
                登录
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden min-h-0">

        {/* Header - hide for chat view */}
        {activeView !== 'chat' && (
          <header className="sticky top-0 z-30 bg-[#0d1526]/70 backdrop-blur-md border-b border-[#1e3a5f]/40 px-3 sm:px-6 py-3 flex items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-4 flex-1">
              <button className="lg:hidden p-2 -ml-2 text-gray-400" onClick={() => setIsSidebarOpen(true)}>
                <Menu size={24} />
              </button>

              {activeView === 'grid' && (
                <div className="relative w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                  <input
                    type="text"
                    placeholder="搜索知识库..."
                    className="w-full pl-10 pr-4 py-2 bg-[#1e3a5f]/30 border-transparent text-gray-100 placeholder-gray-500 focus:bg-[#1e3a5f]/50 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 rounded-lg outline-none text-sm transition-all"
                    value={filters.searchQuery}
                    onChange={(e) => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
                  />
                </div>
              )}
              {activeView !== 'grid' && (
                <div className="h-10 flex items-center text-lg font-semibold text-gray-200 capitalize">
                  {activeView === 'dashboard'
                    ? '近期热点'
                    : activeView === 'monitoring'
                      ? '热点搜索'
                      : activeView === 'grid'
                        ? '知识卡片'
                        : activeView === 'chat'
                          ? '智能助手'
                          : activeView}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {canManageData ? (
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm shadow-indigo-500/30"
                >
                  <Plus size={18} />
                  <span className="hidden sm:inline">手动录入</span>
                </button>
              ) : (
                <button
                  onClick={openLoginModal}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm shadow-indigo-500/30"
                >
                  <Plus size={18} />
                  <span className="hidden sm:inline">登录后编辑</span>
                </button>
              )}
            </div>
          </header>
        )}

        {/* View Content */}
        <div className="flex-1 overflow-hidden relative min-h-0">

          {activeView === 'dashboard' && (
            <div className="h-full overflow-y-auto p-3 sm:p-6">
              <DashboardView
                tasks={tasks}
                trendingItems={trending}
                onNavigateToMonitoring={() => handleMainNavigation('monitoring')}
                onNavigateToVault={() => handleMainNavigation('grid')}
                onSaveToVault={handleSaveTrendingToVault}
                onRepairSourceUrl={handleRepairTrendingSourceUrl}
                canManageTasks={canManageData}
                canMutateTrendingItem={(card) => userCanMutate(card.ownerId)}
                onRequireLogin={openLoginModal}
              />
            </div>
          )}

          {activeView === 'monitoring' && (
            <div className="h-full overflow-y-auto p-3 sm:p-6">
              {canManageData ? (
                <MonitoringView
                  tasks={tasks}
                  onAddTask={handleAddTask}
                  onDeleteTask={handleDeleteTask}
                  onCardsAdded={refreshCards}
                />
              ) : (
                <div className="flex h-full items-center justify-center rounded-xl border border-[#1e3a5f]/40 bg-[#0d1526]/60 p-8 text-center">
                  <div>
                    <p className="text-lg font-semibold text-gray-100">登录后才能管理搜索和导入</p>
                    <p className="mt-2 text-sm text-gray-500">游客模式仅支持浏览公开内容。</p>
                    <button
                      onClick={openLoginModal}
                      className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                      立即登录
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className={`absolute inset-0 ${activeView === 'chat' ? '' : 'hidden'}`}>
            <ChatView cards={chatScope.cards} contextTitle={chatScope.title} />
          </div>

          {activeView === 'grid' && (
            <div className="h-full overflow-y-auto p-3 sm:p-6">

              {/* Collection Header (if selected) */}
              {currentCollectionId && (
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between bg-[#0d1526]/60 backdrop-blur-md p-4 rounded-xl border border-[#1e3a5f]/40 shadow-sm animate-in fade-in slide-in-from-top-2 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-indigo-500/20 rounded-lg flex items-center justify-center text-indigo-400">
                      <Folder size={24} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-100">{activeCollectionName}</h2>
                      <p className="text-xs text-gray-500">共 {filteredCards.length} 条</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {/* CHAT WITH COLLECTION BUTTON */}
                    <button
                      onClick={() => handleChatWithCollection(currentCollectionId)}
                      className="px-3 py-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-medium hover:bg-amber-500/30 flex items-center gap-1.5 transition-colors"
                    >
                      <Sparkles size={14} className="text-amber-400" />
                      与收藏夹对话
                    </button>

                    {canManageData && <div className="w-px h-6 bg-[#1e3a5f]/50 mx-1"></div>}

                    {/* Batch Management Tools */}
                    {canManageData && isSelectionMode ? (
                      <div className="flex flex-wrap items-center gap-2 bg-[#1e3a5f]/30 rounded-lg p-1">
                        <span className="text-xs font-semibold px-2 text-indigo-400">已选 {selectedCardIds.size} 条</span>
                        <button
                          onClick={handleRemoveSelectedFromCollection}
                          disabled={selectedCardIds.size === 0}
                          className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-md text-xs font-medium hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          <Trash2 size={12} /> 移除
                        </button>
                        <button
                          onClick={() => {
                            setIsSelectionMode(false);
                            setSelectedCardIds(new Set());
                          }}
                          className="px-3 py-1.5 bg-[#0d1526]/50 text-gray-400 rounded-md text-xs font-medium hover:bg-white/5 border border-[#1e3a5f]/50"
                        >
                          取消
                        </button>
                      </div>
                    ) : canManageData ? (
                      <button
                        onClick={toggleSelectionMode}
                        className="px-3 py-1.5 bg-[#0d1526]/50 text-gray-400 border border-[#1e3a5f]/50 rounded-lg text-xs font-medium hover:bg-white/5 flex items-center gap-1"
                      >
                        <CheckSquare size={14} /> 管理条目
                      </button>
                    ) : null}

                    {canManageData && <div className="w-px h-6 bg-[#1e3a5f]/50 mx-1"></div>}

                    <button
                      onClick={() => setCurrentCollectionId(null)}
                      className="p-2 hover:bg-white/5 rounded-full text-gray-500 hover:text-gray-300 transition-colors"
                      title="关闭收藏夹视图"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>
              )}

              {/* Filter Tabs / Main Grid Batch Actions */}
              {!currentCollectionId && (
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <div className="flex flex-wrap items-center gap-2">
                    {POPULAR_TOPICS.map(topic => (
                      <button
                        key={topic}
                        onClick={() => setFilters(prev => ({ ...prev, selectedTopic: topic }))}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${filters.selectedTopic === topic
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30'
                          : 'bg-[#0d1526]/60 text-gray-400 hover:bg-[#1e3a5f]/40 border border-[#1e3a5f]/40'
                          }`}
                      >
                        {topic}
                      </button>
                    ))}
                  </div>

                  {/* Main View Batch Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    {canManageData && isSelectionMode ? (
                      <div className="flex flex-wrap items-center gap-2 bg-[#1e3a5f]/30 rounded-lg p-1">
                        <span className="text-xs font-semibold px-2 text-indigo-400">已选 {selectedCardIds.size} 条</span>
                        <button
                          onClick={() => setIsAddToCollectionModalOpen(true)}
                          disabled={selectedCardIds.size === 0}
                          className="px-3 py-1.5 bg-indigo-600 text-white rounded-md text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          <FolderPlus size={12} /> 加入收藏夹
                        </button>
                        <button
                          onClick={() => {
                            setIsSelectionMode(false);
                            setSelectedCardIds(new Set());
                          }}
                          className="px-3 py-1.5 bg-[#0d1526]/50 text-gray-400 rounded-md text-xs font-medium hover:bg-white/5 border border-[#1e3a5f]/50"
                        >
                          取消
                        </button>
                      </div>
                    ) : canManageData ? (
                      <button
                        onClick={toggleSelectionMode}
                        className="px-3 py-1.5 bg-[#0d1526]/60 text-gray-400 border border-[#1e3a5f]/40 rounded-lg text-xs font-medium hover:bg-white/5 flex items-center gap-1"
                      >
                        <CheckSquare size={14} /> 管理条目
                      </button>
                    ) : (
                      <div className="text-xs text-gray-500">登录后可批量管理卡片</div>
                    )}
                  </div>
                </div>
              )}

              {/* Grid */}
              {filteredCards.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-12">
                  {filteredCards.map(card => (
                    <Card
                      key={card.id}
                      card={card}
                      onClick={setSelectedCard}
                      isSelectionMode={isSelectionMode}
                      isSelected={selectedCardIds.has(card.id)}
                      onToggleSelect={toggleCardSelection}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-20">
                  <div className="bg-[#1e3a5f]/30 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                    <Search className="text-gray-500" size={32} />
                  </div>
                  <h3 className="text-lg font-medium text-gray-200">未找到结果</h3>
                  <p className="text-gray-500 mt-1">
                    {currentCollectionId ? "这个收藏夹暂时为空。" : "试试调整搜索词或筛选条件。"}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      {selectedCard && (
        <DetailModal
          card={selectedCard}
          allCollections={displayCollections}
          editableCollections={displayCollections.filter(col => userCanMutate(col.ownerId))}
          onClose={() => setSelectedCard(null)}
          onUpdate={handleUpdateCard}
          onDelete={handleDeleteCard}
          canEdit={userCanMutate(selectedCard.ownerId)}
        />
      )}

      {isAddModalOpen && canManageData && (
        <AddContentModal
          onClose={() => setIsAddModalOpen(false)}
          onAdd={handleAddCard}
        />
      )}

      {showSettings && canManageData && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          xhsMissingTokenItems={xhsMissingTokenItems}
          onApplyXhsTokenConfig={handleApplyXhsTokenConfig}
        />
      )}

      {/* Add To Collection Modal */}
      {isAddToCollectionModalOpen && canManageData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsAddToCollectionModalOpen(false)}></div>
          <div className="relative bg-[#0d1526]/95 backdrop-blur-xl rounded-xl w-full max-w-sm overflow-hidden shadow-2xl border border-[#1e3a5f]/50 animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-[#1e3a5f]/40 flex justify-between items-center bg-[#0d1526]/50">
              <h3 className="font-semibold text-gray-100">加入收藏夹</h3>
              <button onClick={() => setIsAddToCollectionModalOpen(false)}><X size={18} className="text-gray-500 hover:text-gray-300" /></button>
            </div>
            <div className="p-2 max-h-80 overflow-y-auto">
              {displayCollections.filter(col => userCanMutate(col.ownerId)).length === 0 ? (
                <p className="p-4 text-center text-gray-500 text-sm">还没有创建收藏夹。</p>
              ) : (
                displayCollections.filter(col => userCanMutate(col.ownerId)).map(col => (
                  <button
                    key={col.id}
                    onClick={() => handleBatchAddToCollection(col.id)}
                    className="w-full text-left px-4 py-3 hover:bg-indigo-500/20 flex items-center gap-3 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[#1e3a5f]/50 overflow-hidden flex-shrink-0">
                      <img src={col.coverImage} className="w-full h-full object-cover" alt="" />
                    </div>
                    <span className="font-medium text-gray-300 group-hover:text-indigo-300">{col.name}</span>
                  </button>
                ))
              )}
            </div>
            <div className="p-3 border-t border-[#1e3a5f]/40 bg-[#0d1526]/50">
              <button
                onClick={() => {
                  setIsAddToCollectionModalOpen(false);
                  setIsCreatingCollection(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-[#1e3a5f]/50 rounded-lg text-gray-500 hover:text-indigo-400 hover:border-indigo-500/50 hover:bg-indigo-500/10 transition-all text-xs font-medium"
              >
                <Plus size={14} /> 新建收藏夹
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoginModalOpen && (
        <LoginModal
          onClose={() => setIsLoginModalOpen(false)}
          onSubmit={handleLoginSubmit}
          onClearLocalAuthState={handleClearLocalAuthState}
        />
      )}
    </div>
  );
};

export default App;
