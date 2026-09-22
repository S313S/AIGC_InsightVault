import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EditorialTopic, KnowledgeCard, TrackingTask, Platform, TopicFeedbackAction } from '../types';
import { Flame, ArrowRight, Save, Activity, LayoutGrid, Heart, TrendingUp, Bookmark, Sparkles } from './Icons';
import { hasPromptEvidence } from '../shared/promptTagging.js';
import { fallbackCoverFromSeed, isRenderableCoverUrl, normalizeLegacyFallbackCover } from '../shared/fallbackCovers.js';
import { hasXiaohongshuXsecToken, isXiaohongshuUrl, normalizeXiaohongshuSourceUrl } from '../shared/xiaohongshuUrls.js';
import { getSourceUrlOpenBlockReason, resolveOpenableSourceUrl } from '../shared/sourceUrls.js';
import { getCollectionFreshness, getCollectionLabel, getLatestSnapshotByPlatform } from '../shared/collectionFreshness.js';
import { getSyncLabel } from '../shared/syncFreshness.js';
import { TopicRadarView } from './TopicRadarView';
import { handleDialogKeyDown } from '../shared/dialogFocus.js';
import { partitionTopicEvidence } from '../shared/topicPresentation.js';
import { buildCategoryRankings, dedupeDashboardCards, selectHotPosts } from '../shared/dashboardRankings.js';

const PLATFORM_BADGE_COLORS: Record<Platform, string> = {
    [Platform.Twitter]: 'bg-blue-500/20 text-blue-400',
    [Platform.Xiaohongshu]: 'bg-red-500/20 text-red-400',
    [Platform.Official]: 'bg-emerald-500/20 text-emerald-300',
    [Platform.GitHub]: 'bg-violet-500/20 text-violet-300',
    [Platform.Manual]: 'bg-gray-500/20 text-gray-400',
};

const PlatformBadge: React.FC<{ platform: Platform }> = ({ platform }) => (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${PLATFORM_BADGE_COLORS[platform]}`}>
        {platform}
    </span>
);

const RANKING_ACCENT_CLASSES: Record<string, string> = {
    indigo: 'bg-indigo-500',
    emerald: 'bg-emerald-500',
    purple: 'bg-purple-500',
    rose: 'bg-rose-500',
};

const SOCIAL_PLATFORMS = [Platform.Twitter, Platform.Xiaohongshu, Platform.Manual];

interface DashboardViewProps {
    tasks: TrackingTask[];
    trendingItems: KnowledgeCard[];
    topics: EditorialTopic[];
    isInitialLoading: boolean;
    isTopicsLoading: boolean;
    isSyncing: boolean;
    lastCollectedAt: string | null;
    lastSyncedAt: string | null;
    newItemsCount: number;
    onNavigateToMonitoring: () => void;
    onNavigateToVault: () => void;
    onSaveToVault: (card: KnowledgeCard) => void;
    onRepairSourceUrl: (card: KnowledgeCard) => Promise<{ updated: boolean; message: string }>;
    canManageTasks?: boolean;
    canGiveTopicFeedback: boolean;
    feedbackOwnerId: string | null;
    pendingTopicFeedbackKeys: ReadonlySet<string>;
    onToggleTopicFeedback: (
        topicId: string,
        action: TopicFeedbackAction,
        enabled: boolean
    ) => Promise<boolean>;
    canMutateTrendingItem?: (card: KnowledgeCard) => boolean;
    onRequireLogin?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
    tasks,
    trendingItems,
    topics,
    isInitialLoading,
    isTopicsLoading,
    isSyncing,
    lastCollectedAt,
    lastSyncedAt,
    newItemsCount,
    onNavigateToMonitoring,
    onNavigateToVault,
    onSaveToVault,
    onRepairSourceUrl,
    canManageTasks = false,
    canGiveTopicFeedback,
    feedbackOwnerId,
    pendingTopicFeedbackKeys,
    onToggleTopicFeedback,
    canMutateTrendingItem = () => false,
    onRequireLogin
}) => {

    const totalItemsFound = trendingItems.length;
    const [freshnessNow, setFreshnessNow] = useState(() => Date.now());
    const collectionFreshness = getCollectionFreshness({ collectedAt: lastCollectedAt, now: freshnessNow });
    const collectionLabel = getCollectionLabel({
        collectedAt: lastCollectedAt,
        now: freshnessNow,
        status: collectionFreshness.status,
    });
    const syncLabel = getSyncLabel({ isSyncing, lastSyncedAt });
    const [showAllTrending, setShowAllTrending] = useState(false);
    const [repairingCardId, setRepairingCardId] = useState<string | null>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const dialogCloseRef = useRef<HTMLButtonElement>(null);
    const modalTriggerRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setFreshnessNow(Date.now());
        }, 60_000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!showAllTrending) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const frame = window.requestAnimationFrame(() => dialogCloseRef.current?.focus());
        const handleKeyDown = (event: KeyboardEvent) => {
            handleDialogKeyDown(
                event,
                dialogRef.current,
                () => setShowAllTrending(false),
                document.activeElement
            );
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            window.cancelAnimationFrame(frame);
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
            modalTriggerRef.current?.focus();
        };
    }, [showAllTrending]);

    const buildFallbackCover = (item: KnowledgeCard) => {
        const seed = `${item.id}|${item.sourceUrl}|${item.title}|${item.author}|${item.date}`;
        return fallbackCoverFromSeed(seed);
    };

    const safeCover = (item: KnowledgeCard) => {
        const value = normalizeLegacyFallbackCover(item.coverImage);
        if (!value) return buildFallbackCover(item);
        return isRenderableCoverUrl(value) ? value : buildFallbackCover(item);
    };

    const uniqueTrending = useMemo(
        () => dedupeDashboardCards(trendingItems) as KnowledgeCard[],
        [trendingItems]
    );
    const { socialPosts, factEvidence } = useMemo(
        () => partitionTopicEvidence(uniqueTrending),
        [uniqueTrending]
    );

    const hotPicks = useMemo(
        () => selectHotPosts(socialPosts, 6) as KnowledgeCard[],
        [socialPosts]
    );
    const categoryRankings = useMemo(
        () => buildCategoryRankings(socialPosts, { limit: 3 }) as Array<{
            id: string;
            label: string;
            accent: string;
            items: KnowledgeCard[];
        }>,
        [socialPosts]
    );
    const socialSnapshotAt = useMemo(
        () => getLatestSnapshotByPlatform(socialPosts, SOCIAL_PLATFORMS) as Record<Platform, string | null>,
        [socialPosts]
    );

    const formatLikes = (count: number) => {
        return count >= 1000 ? (count / 1000).toFixed(1) + 'k' : count;
    };

    const formatSnapshotTime = (value: string) => new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Shanghai',
    }).format(new Date(value));

    const openSourceUrl = (url: string) => {
        const candidateUrl = normalizeXiaohongshuSourceUrl(url) || url;
        const safeUrl = resolveOpenableSourceUrl(candidateUrl);
        const blockReason = getSourceUrlOpenBlockReason(candidateUrl);
        if (blockReason) {
            window.alert(blockReason);
            return;
        }
        if (!safeUrl) return;
        if (isXiaohongshuUrl(safeUrl) && !hasXiaohongshuXsecToken(safeUrl)) {
            window.alert('该小红书链接缺少 xsec_token，可能会 404。请到「设置 → XHS Token 配置」补全后再打开。');
            return;
        }
        const openedWindow = window.open(safeUrl, '_blank', 'noopener,noreferrer');
        if (openedWindow) openedWindow.opener = null;
    };

    const isXhsMissingToken = (url: string) =>
        (() => {
            const normalized = normalizeXiaohongshuSourceUrl(url) || url;
            return isXiaohongshuUrl(normalized) && !hasXiaohongshuXsecToken(normalized);
        })();

    const handleRepairClick = async (e: React.MouseEvent, item: KnowledgeCard) => {
        e.stopPropagation();
        if (item.platform !== Platform.Xiaohongshu || repairingCardId === item.id) return;
        setRepairingCardId(item.id);
        try {
            const result = await onRepairSourceUrl(item);
            window.alert(result.message);
        } finally {
            setRepairingCardId(null);
        }
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto space-y-8 pb-12">

            {/* 1. Header & Stats Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="col-span-1 md:col-span-2 bg-gradient-to-br from-gray-900 to-indigo-900 rounded-2xl p-6 text-white shadow-lg">
                    <h2 className="text-2xl font-bold mb-2">早上好，XiaoCi。</h2>
                    <p className="text-indigo-200 mb-6 max-w-md text-sm leading-relaxed">
                        你的监测任务已捕获 <span className="font-bold text-white">{trendingItems.length} 条高价值内容</span>。
                    </p>
                    <div className="flex gap-4">
                        <button
                            onClick={canManageTasks ? onNavigateToMonitoring : onRequireLogin}
                            className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                        >
                            <Activity size={16} />
                            {canManageTasks ? '管理任务' : '登录后管理'}
                        </button>
                        <button
                            onClick={onNavigateToVault}
                            className="px-4 py-2 bg-white text-indigo-900 hover:bg-indigo-50 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors shadow-sm"
                        >
                            <LayoutGrid size={16} />
                            知识库
                        </button>
                    </div>
                </div>

                <div className="col-span-1 bg-[#0d1526]/60 backdrop-blur-md rounded-2xl border border-[#1e3a5f]/40 p-6 shadow-sm flex flex-col justify-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                        <Activity size={80} />
                    </div>
                    <div className="flex items-center gap-2 text-gray-400 mb-2">
                        <TrendingUp size={16} />
                        <span className="text-xs font-semibold uppercase tracking-wider">监测总量</span>
                    </div>
                    <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-4xl font-bold text-gray-100">{totalItemsFound}</span>
                        {newItemsCount > 0 && (
                            <span className="text-sm text-green-400 font-medium bg-green-500/20 px-2 py-0.5 rounded-full">
                                新增 {newItemsCount} 条
                            </span>
                        )}
                    </div>
                    <div className="space-y-1 text-sm text-gray-500" aria-live="polite">
                        <p>热点采集：{collectionLabel}</p>
                        <p>页面同步：{syncLabel}</p>
                    </div>
                    {collectionFreshness.status === 'stale' && (
                        <div
                            role="alert"
                            className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200"
                        >
                            更新提醒：{collectionLabel}。当前继续显示上次成功采集的内容。
                        </div>
                    )}
                </div>
            </div>

            {/* 2. Hot Posts (Visual cards first, matching the original homepage rhythm) */}
            <section aria-labelledby="hot-posts-title">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-red-500/20 rounded-lg">
                            <Flame size={18} className="text-red-400" fill="currentColor" />
                        </div>
                        <div>
                            <h2 id="hot-posts-title" className="text-xl font-bold text-gray-100">近期热门原帖</h2>
                            <p className="mt-1 text-xs text-gray-500">按互动热度排序，保留各平台最近一次成功采集结果</p>
                        </div>
                    </div>
                    <button
                        ref={modalTriggerRef}
                        type="button"
                        onClick={() => setShowAllTrending(true)}
                        className="flex items-center gap-1 text-sm font-medium text-indigo-400 hover:text-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    >
                        查看全部原帖 <ArrowRight size={14} />
                    </button>
                </div>

                <div className="mb-5 flex flex-wrap gap-2" aria-label="各平台最后成功采集时间">
                    {SOCIAL_PLATFORMS.map((platform) => {
                        const collectedAt = socialSnapshotAt[platform];
                        const count = socialPosts.filter((item) => item.platform === platform).length;
                        if (count === 0) return null;
                        const freshness = getCollectionFreshness({ collectedAt, now: freshnessNow });
                        return (
                            <span
                                key={platform}
                                className={`rounded-full border px-3 py-1 text-xs ${freshness.status === 'stale' ? 'border-amber-500/35 bg-amber-500/10 text-amber-300' : 'border-[#1e3a5f]/60 bg-[#0d1526]/60 text-gray-400'}`}
                            >
                                {platform} · {count} 条 · {collectedAt ? `${formatSnapshotTime(collectedAt)} 采集` : '采集时间未知'}
                            </span>
                        );
                    })}
                </div>

                {/* 2x3 Grid using vertical cards to match 'Picture 1' style */}
                {isInitialLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" aria-label="正在加载近期热点">
                        {Array.from({ length: 6 }, (_, index) => (
                            <div
                                key={index}
                                className="h-72 animate-pulse rounded-xl border border-[#1e3a5f]/40 bg-[#0d1526]/60 motion-reduce:animate-none"
                            >
                                <div className="h-40 bg-[#1e3a5f]/30" />
                                <div className="space-y-3 p-4">
                                    <div className="h-3 w-20 rounded bg-[#1e3a5f]/50" />
                                    <div className="h-4 w-4/5 rounded bg-[#1e3a5f]/60" />
                                    <div className="h-3 w-full rounded bg-[#1e3a5f]/40" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : hotPicks.length === 0 ? (
                    <div className="rounded-xl border border-[#1e3a5f]/40 bg-[#0d1526]/40 p-8 text-center">
                        <p className="text-gray-300 text-sm">当前暂无社交原帖</p>
                        <p className="text-gray-500 text-xs mt-2">GitHub 与官方资料仍保留在下方事实证据中</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {hotPicks.map((item) => (
                            <article
                                key={item.id}
                                className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#1e3a5f]/40 bg-[#0d1526]/60 shadow-sm backdrop-blur-md transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-indigo-500/10 motion-reduce:transform-none motion-reduce:transition-none"
                            >
                                <button
                                    type="button"
                                    onClick={() => openSourceUrl(item.sourceUrl)}
                                    className="flex min-w-0 flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400"
                                    aria-label={`打开原文：${item.title}`}
                                >
                                    <span className="relative block h-40 overflow-hidden bg-[#1e3a5f]/30">
                                        <img
                                            src={safeCover(item)}
                                            alt={item.title}
                                            width={640}
                                            height={360}
                                            loading="lazy"
                                            decoding="async"
                                            referrerPolicy="no-referrer"
                                            onError={(e) => {
                                                const target = e.target as HTMLImageElement;
                                                target.src = buildFallbackCover(item);
                                            }}
                                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
                                        />
                                        {hasPromptEvidence(item.aiAnalysis?.extractedPrompts) && (
                                            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[10px] text-white backdrop-blur-sm">
                                                <Sparkles size={10} className="text-yellow-400" />
                                                <span>提示词</span>
                                            </span>
                                        )}
                                    </span>
                                    <span className="flex min-w-0 flex-1 flex-col p-4">
                                        <span className="mb-2 flex min-w-0 items-center justify-between gap-2">
                                            <PlatformBadge platform={item.platform} />
                                            <span className="min-w-0 break-words text-xs text-gray-500">{item.date}</span>
                                        </span>
                                        {isXhsMissingToken(item.sourceUrl) && (
                                            <span className="mb-2 inline-flex self-start rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
                                                缺少 xsec_token
                                            </span>
                                        )}
                                        <span className="mb-2 min-w-0 break-words text-base font-bold leading-snug text-gray-100 line-clamp-2 transition-colors group-hover:text-indigo-400">
                                            {item.title}
                                        </span>
                                        <span className="mb-3 min-w-0 flex-1 break-words text-sm text-gray-400 line-clamp-2">
                                            {item.rawContent}
                                        </span>
                                        <span className="mb-4 flex flex-wrap gap-1">
                                            {item.tags.filter(t => !t.startsWith('snapshot:')).slice(0, 2).map(tag => (
                                                <span key={tag} className="break-words rounded border border-[#1e3a5f]/50 bg-[#1e3a5f]/50 px-1.5 py-0.5 text-[10px] text-gray-400">
                                                    #{tag}
                                                </span>
                                            ))}
                                        </span>
                                        <span className="flex items-center justify-between border-t border-[#1e3a5f]/40 pt-3">
                                            <span className="flex items-center gap-3 text-xs text-gray-500">
                                                <span className="flex items-center gap-1"><Heart size={14} />{formatLikes(item.metrics.likes)}</span>
                                                <span className="flex items-center gap-1"><Bookmark size={14} />{item.metrics.bookmarks}</span>
                                            </span>
                                            <span className="max-w-[80px] truncate text-[10px] font-medium uppercase tracking-wider text-gray-500">{item.author}</span>
                                        </span>
                                    </span>
                                </button>
                                {canMutateTrendingItem(item) && (
                                    <div className="flex items-center justify-end gap-2 border-t border-[#1e3a5f]/40 px-4 py-3">
                                        {item.platform === Platform.Xiaohongshu && canMutateTrendingItem(item) && (
                                            <button
                                                type="button"
                                                onClick={(e) => handleRepairClick(e, item)}
                                                disabled={repairingCardId === item.id}
                                                className={`rounded border px-2 py-1 text-[10px] ${repairingCardId === item.id ? 'cursor-not-allowed border-gray-600 text-gray-500' : 'border-indigo-500/50 text-indigo-300 hover:bg-indigo-500/20'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400`}
                                                title="打不开时点击修复链接"
                                            >
                                                <span aria-live="polite">{repairingCardId === item.id ? '修复中…' : '🔄 修复'}</span>
                                            </button>
                                        )}
                                        {canMutateTrendingItem(item) && (
                                            <button
                                                type="button"
                                                onClick={() => onSaveToVault(item)}
                                                className="text-gray-500 transition-colors hover:text-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                                                aria-label="保存到知识库"
                                                title="保存到知识库"
                                            >
                                                <Save size={16} />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </article>
                        ))}
                    </div>
                )}
            </section>

            {/* 3. Categorized rankings use only genuine matches; no unrelated fallback fill. */}
            {categoryRankings.length > 0 && (
                <section aria-labelledby="category-rankings-title">
                    <div className="mb-5">
                        <h2 id="category-rankings-title" className="text-xl font-bold text-gray-100">分类热榜</h2>
                        <p className="mt-1 text-sm text-gray-500">按真实内容分类并依据互动热度排序，不用无关帖子补足榜单。</p>
                    </div>
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
                        {categoryRankings.map((category) => (
                            <section key={category.id} aria-labelledby={`ranking-${category.id}`} className="rounded-2xl border border-[#1e3a5f]/40 bg-[#0d1526]/60 p-5 shadow-sm backdrop-blur-md">
                                <div className="mb-3 flex items-center justify-between border-b border-[#1e3a5f]/40 pb-3">
                                    <div className="flex items-center gap-2">
                                        <span className={`h-5 w-1 rounded-full ${RANKING_ACCENT_CLASSES[category.accent] || 'bg-indigo-500'}`} />
                                        <h3 id={`ranking-${category.id}`} className="font-bold text-gray-100">{category.label} · 热门精选</h3>
                                    </div>
                                    <span className="text-xs text-gray-500">Top {category.items.length}</span>
                                </div>
                                <div>
                                    {category.items.map((item, index) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => openSourceUrl(item.sourceUrl)}
                                            aria-label={`打开榜单第 ${index + 1} 名原文：${item.title}`}
                                            className="group flex w-full items-center gap-3 border-b border-[#1e3a5f]/30 p-3 text-left last:border-0 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400"
                                        >
                                            <span className={`w-6 shrink-0 text-center text-lg font-bold italic ${index === 0 ? 'text-red-400' : index === 1 ? 'text-orange-400' : 'text-amber-400'}`}>
                                                {index + 1}
                                            </span>
                                            <img
                                                src={safeCover(item)}
                                                alt=""
                                                width={48}
                                                height={48}
                                                loading="lazy"
                                                decoding="async"
                                                referrerPolicy="no-referrer"
                                                onError={(event) => {
                                                    event.currentTarget.src = buildFallbackCover(item);
                                                }}
                                                className="h-12 w-12 shrink-0 rounded-lg object-cover"
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-medium text-gray-200 group-hover:text-indigo-300">{item.title}</span>
                                                <span className="mt-1 flex items-center gap-2 text-[10px] text-gray-500">
                                                    <PlatformBadge platform={item.platform} />
                                                    <span className="truncate">@{item.author || '来源未知'}</span>
                                                </span>
                                            </span>
                                            <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-red-400">
                                                <Flame size={12} fill="currentColor" />
                                                {formatLikes(item.metrics.likes)}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                </section>
            )}

            <TopicRadarView
                topics={topics}
                isTopicsLoading={isTopicsLoading}
                freshnessNow={freshnessNow}
                canGiveFeedback={canGiveTopicFeedback}
                feedbackOwnerId={feedbackOwnerId}
                pendingFeedbackKeys={pendingTopicFeedbackKeys}
                onToggleFeedback={onToggleTopicFeedback}
            />

            {factEvidence.length > 0 && (
                <section aria-labelledby="fact-evidence-title">
                    <div className="mb-4">
                        <h3 id="fact-evidence-title" className="text-lg font-bold text-gray-100">事实证据</h3>
                        <p className="mt-1 text-xs text-gray-500">官方公告与代码仓库资料，用于核验话题，不占用社交原帖卡位。</p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        {factEvidence.filter((item) => resolveOpenableSourceUrl(item.sourceUrl)).map((item) => (
                            <article key={item.id} className="rounded-xl border border-[#1e3a5f]/40 bg-[#111d33]/55 p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-500">
                                            <PlatformBadge platform={item.platform} />
                                            <span>{item.author || '来源未知'}</span>
                                            <span>{item.date}</span>
                                        </div>
                                        <h4 className="mt-2 break-words text-sm font-semibold leading-snug text-gray-200 line-clamp-2">{item.title}</h4>
                                        {item.rawContent ? (
                                            <p className="mt-2 break-words text-xs leading-relaxed text-gray-500 line-clamp-2">{item.rawContent}</p>
                                        ) : null}
                                    </div>
                                    <a
                                        href={resolveOpenableSourceUrl(item.sourceUrl)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="shrink-0 text-xs font-medium text-indigo-300 hover:text-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                                    >
                                        查看来源
                                    </a>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
            )}

            {/* All Trending Modal */}
            {showAllTrending && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div
                        ref={dialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="all-trending-title"
                        tabIndex={-1}
                        className="flex max-h-[85vh] w-full max-w-6xl flex-col overscroll-contain rounded-2xl border border-[#1e3a5f]/50 bg-[#0d1526]/95 shadow-2xl backdrop-blur-xl"
                    >
                        <div className="p-6 border-b border-[#1e3a5f]/40 flex items-center justify-between">
                            <div className="min-w-0">
                                <h2 id="all-trending-title" className="break-words text-xl font-bold text-gray-100">全部原帖 · {socialPosts.length} 条</h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    已按原文链接去重；GitHub 与官方资料在主页「事实证据」中单独展示
                                </p>
                            </div>
                            <button
                                ref={dialogCloseRef}
                                type="button"
                                onClick={() => setShowAllTrending(false)}
                                className="px-3 py-1.5 text-sm rounded-lg border border-[#1e3a5f]/50 text-gray-400 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                            >
                                关闭
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto overscroll-contain p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {socialPosts.map(item => (
                                    <article
                                        key={item.id}
                                        className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#1e3a5f]/40 bg-[#0d1526]/60 shadow-sm backdrop-blur-md transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lg motion-reduce:transform-none motion-reduce:transition-none"
                                    >
                                        <button
                                            type="button"
                                            onClick={() => openSourceUrl(item.sourceUrl)}
                                            className="flex min-w-0 flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400"
                                            aria-label={`打开原文：${item.title}`}
                                        >
                                            <span className="relative block h-40 overflow-hidden bg-[#1e3a5f]/30">
                                                <img
                                                    src={safeCover(item)}
                                                    alt={item.title}
                                                    width={640}
                                                    height={360}
                                                    loading="lazy"
                                                    decoding="async"
                                                    referrerPolicy="no-referrer"
                                                    onError={(e) => {
                                                        const target = e.target as HTMLImageElement;
                                                        target.src = buildFallbackCover(item);
                                                    }}
                                                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
                                                />
                                            </span>
                                            <span className="flex min-w-0 flex-1 flex-col p-4">
                                                <span className="mb-2 flex min-w-0 items-center justify-between gap-2">
                                                    <PlatformBadge platform={item.platform} />
                                                    <span className="min-w-0 break-words text-xs text-gray-500">{item.date}</span>
                                                </span>
                                                {isXhsMissingToken(item.sourceUrl) && (
                                                    <span className="mb-2 inline-flex self-start rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">缺少 xsec_token</span>
                                                )}
                                                <span className="mb-2 min-w-0 break-words text-base font-bold leading-snug text-gray-100 line-clamp-2 transition-colors group-hover:text-indigo-400">{item.title}</span>
                                                <span className="mb-3 min-w-0 flex-1 break-words text-sm text-gray-400 line-clamp-2">{item.rawContent}</span>
                                            </span>
                                        </button>
                                        {item.platform === Platform.Xiaohongshu && canMutateTrendingItem(item) && (
                                            <div className="flex justify-end border-t border-[#1e3a5f]/40 px-4 py-3">
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleRepairClick(e, item)}
                                                    disabled={repairingCardId === item.id}
                                                    className={`rounded border px-2 py-1 text-[10px] ${repairingCardId === item.id ? 'cursor-not-allowed border-gray-600 text-gray-500' : 'border-indigo-500/50 text-indigo-300 hover:bg-indigo-500/20'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400`}
                                                    title="打不开时点击修复链接"
                                                >
                                                    <span aria-live="polite">{repairingCardId === item.id ? '修复中…' : '🔄 修复链接（noteId）'}</span>
                                                </button>
                                            </div>
                                        )}
                                    </article>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
