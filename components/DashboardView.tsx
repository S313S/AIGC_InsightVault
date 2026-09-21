import React, { useEffect, useMemo, useState } from 'react';
import { EditorialTopic, KnowledgeCard, TrackingTask, Platform, TopicFeedbackAction } from '../types';
import { Flame, ArrowRight, Save, Activity, LayoutGrid, Heart, TrendingUp, Bookmark, Sparkles } from './Icons';
import { hasPromptEvidence } from '../shared/promptTagging.js';
import { fallbackCoverFromSeed, isRenderableCoverUrl, normalizeLegacyFallbackCover } from '../shared/fallbackCovers.js';
import { hasXiaohongshuXsecToken, isXiaohongshuUrl, normalizeXiaohongshuSourceUrl } from '../shared/xiaohongshuUrls.js';
import { getSourceUrlOpenBlockReason, resolveOpenableSourceUrl } from '../shared/sourceUrls.js';
import { getCollectionFreshness, getCollectionLabel } from '../shared/collectionFreshness.js';
import { getSyncLabel } from '../shared/syncFreshness.js';
import { TopicRadarView } from './TopicRadarView';

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
    const [rawPoolOpen, setRawPoolOpen] = useState(false);
    const [repairingCardId, setRepairingCardId] = useState<string | null>(null);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setFreshnessNow(Date.now());
        }, 60_000);
        return () => window.clearInterval(timer);
    }, []);

    const normalizeSourceUrl = (url: string) => {
        if (!url) return '';
        const [base] = url.split('?');
        return base.trim();
    };

    const buildFallbackCover = (item: KnowledgeCard) => {
        const seed = `${item.id}|${item.sourceUrl}|${item.title}|${item.author}|${item.date}`;
        return fallbackCoverFromSeed(seed);
    };

    const safeCover = (item: KnowledgeCard) => {
        const value = normalizeLegacyFallbackCover(item.coverImage);
        if (!value) return buildFallbackCover(item);
        return isRenderableCoverUrl(value) ? value : buildFallbackCover(item);
    };

    const uniqueTrending = useMemo(() => {
        const seen = new Set<string>();
        const unique: KnowledgeCard[] = [];
        for (const item of trendingItems) {
            const key = normalizeSourceUrl(item.sourceUrl) || `${item.title}|${item.author}`;
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push(item);
        }
        return unique;
    }, [trendingItems]);

    // 1. Hot Picks Data (Top 6 items for the 2x3 grid)
    const hotPicks = uniqueTrending.slice(0, 6);

    const formatLikes = (count: number) => {
        return count >= 1000 ? (count / 1000).toFixed(1) + 'k' : count;
    };

    const PlatformBadge: React.FC<{ platform: Platform }> = ({ platform }) => {
        const colors = {
            [Platform.Twitter]: 'bg-blue-500/20 text-blue-400',
            [Platform.Xiaohongshu]: 'bg-red-500/20 text-red-400',
            [Platform.Manual]: 'bg-gray-500/20 text-gray-400',
        };
        return (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${colors[platform]}`}>
                {platform}
            </span>
        );
    };

    const openSourceUrl = (url: string) => {
        const safeUrl = resolveOpenableSourceUrl(normalizeXiaohongshuSourceUrl(url) || url);
        const blockReason = getSourceUrlOpenBlockReason(url);
        if (blockReason) {
            window.alert(blockReason);
            return;
        }
        if (!safeUrl) return;
        if (isXiaohongshuUrl(safeUrl) && !hasXiaohongshuXsecToken(safeUrl)) {
            window.alert('该小红书链接缺少 xsec_token，可能会 404。请到「设置 → XHS Token 配置」补全后再打开。');
            return;
        }
        window.open(safeUrl, '_blank');
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

            <TopicRadarView
                topics={topics}
                isTopicsLoading={isTopicsLoading}
                freshnessNow={freshnessNow}
                canGiveFeedback={canGiveTopicFeedback}
                onToggleFeedback={onToggleTopicFeedback}
            />

            {/* Raw cards stay available as evidence, but do not displace editorial lanes. */}
            <section className="rounded-2xl border border-[#1e3a5f]/40 bg-[#0d1526]/35 p-4 sm:p-5">
                <button
                    type="button"
                    aria-expanded={rawPoolOpen}
                    aria-controls="raw-post-pool"
                    onClick={() => setRawPoolOpen((open) => !open)}
                    className="flex w-full items-center justify-between gap-4 text-left"
                >
                    <span>
                        <span className="block text-base font-bold text-gray-100">原始帖子池</span>
                        <span className="mt-1 block text-xs text-gray-500">保留 {uniqueTrending.length} 条原始证据，按需展开核对</span>
                    </span>
                    <span className="text-sm font-medium text-indigo-300">{rawPoolOpen ? '收起' : '展开'}</span>
                </button>

                <div id="raw-post-pool">
                {rawPoolOpen && (
                    <div className="mt-6 space-y-8">
            {/* 2. Hot Picks (Vertical Cards 2 Rows x 3 Cols) */}
            <div>
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-red-500/20 rounded-lg">
                            <Flame size={18} className="text-red-400" fill="currentColor" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-100">近期热点</h3>
                    </div>
                    <button
                        onClick={() => setShowAllTrending(true)}
                        className="text-sm text-indigo-400 font-medium hover:text-indigo-300 flex items-center gap-1"
                    >
                        查看全部 <ArrowRight size={14} />
                    </button>
                </div>

                {/* 2x3 Grid using vertical cards to match 'Picture 1' style */}
                {isInitialLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" aria-label="正在加载近期热点">
                        {Array.from({ length: 6 }, (_, index) => (
                            <div
                                key={index}
                                className="h-72 animate-pulse rounded-xl border border-[#1e3a5f]/40 bg-[#0d1526]/60"
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
                        <p className="text-gray-300 text-sm">当前暂无热点内容</p>
                        <p className="text-gray-500 text-xs mt-2">请先触发 /api/cron-monitor，或到「热点搜索」导入内容</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {hotPicks.map((item) => (
                            <div
                                key={item.id}
                                onClick={() => openSourceUrl(item.sourceUrl)}
                                className="bg-[#0d1526]/60 backdrop-blur-md rounded-xl border border-[#1e3a5f]/40 shadow-sm hover:shadow-lg hover:shadow-indigo-500/10 hover:-translate-y-1 transition-all duration-300 flex flex-col overflow-hidden group cursor-pointer"
                            >
                                {/* Cover Image Area */}
                                <div className="h-40 relative bg-[#1e3a5f]/30 overflow-hidden">
                                    <img
                                        src={safeCover(item)}
                                        alt={item.title}
                                        referrerPolicy="no-referrer"
                                        onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.src = buildFallbackCover(item);
                                        }}
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    />
                                    {/* Overlay Sparkles for Prompts */}
                                    {hasPromptEvidence(item.aiAnalysis?.extractedPrompts) && (
                                        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded-md flex items-center gap-1">
                                            <Sparkles size={10} className="text-yellow-400" />
                                            <span>提示词</span>
                                        </div>
                                    )}
                                </div>

                                {/* Content Area */}
                                <div className="p-4 flex flex-col flex-1">
                                    <div className="flex items-center justify-between mb-2">
                                        <PlatformBadge platform={item.platform} />
                                        <span className="text-xs text-gray-500">{item.date}</span>
                                    </div>
                                    {isXhsMissingToken(item.sourceUrl) && (
                                        <div className="mb-2 inline-flex text-[10px] px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300">
                                            缺少 xsec_token
                                        </div>
                                    )}

                                    <h4 className="text-base font-bold text-gray-100 mb-2 leading-snug line-clamp-2 group-hover:text-indigo-400 transition-colors">
                                        {item.title}
                                    </h4>

                                    <p className="text-sm text-gray-400 line-clamp-2 mb-3 flex-1">
                                        {item.rawContent}
                                    </p>

                                    {/* Tags */}
                                    <div className="flex flex-wrap gap-1 mb-4">
                                        {item.tags.filter(t => !t.startsWith('snapshot:')).slice(0, 2).map(tag => (
                                            <span key={tag} className="text-[10px] bg-[#1e3a5f]/50 text-gray-400 px-1.5 py-0.5 rounded border border-[#1e3a5f]/50">
                                                #{tag}
                                            </span>
                                        ))}
                                    </div>

                                    {/* Footer */}
                                    <div className="flex items-center justify-between pt-3 border-t border-[#1e3a5f]/40">
                                        <div className="flex items-center gap-3 text-gray-500 text-xs">
                                            <div className="flex items-center gap-1 hover:text-red-400 transition-colors">
                                                <Heart size={14} />
                                                <span>{formatLikes(item.metrics.likes)}</span>
                                            </div>
                                            <div className="flex items-center gap-1 hover:text-amber-400 transition-colors">
                                                <Bookmark size={14} />
                                                <span>{item.metrics.bookmarks}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider truncate max-w-[80px]">
                                                {item.author}
                                            </span>
                                            {item.platform === Platform.Xiaohongshu && canMutateTrendingItem(item) && (
                                                <button
                                                    onClick={(e) => handleRepairClick(e, item)}
                                                    disabled={repairingCardId === item.id}
                                                    className={`text-[10px] px-2 py-1 rounded border ${
                                                        repairingCardId === item.id
                                                            ? 'border-gray-600 text-gray-500 cursor-not-allowed'
                                                            : 'border-indigo-500/50 text-indigo-300 hover:bg-indigo-500/20'
                                                    }`}
                                                    title="打不开时点击修复链接"
                                                >
                                                    {repairingCardId === item.id ? '修复中...' : '🔄 修复'}
                                                </button>
                                            )}
                                            {canMutateTrendingItem(item) && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSaveToVault(item);
                                                    }}
                                                    className="text-gray-500 hover:text-indigo-400 transition-colors"
                                                    title="保存到知识库"
                                                >
                                                    <Save size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

                    </div>
                )}
                </div>
            </section>

            {/* All Trending Modal */}
            {showAllTrending && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[#0d1526]/95 backdrop-blur-xl rounded-2xl w-full max-w-6xl max-h-[85vh] flex flex-col shadow-2xl border border-[#1e3a5f]/50">
                        <div className="p-6 border-b border-[#1e3a5f]/40 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-gray-100">近期热点 · 全部</h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    当前快照 {uniqueTrending.length} 条（原始命中 {trendingItems.length} 条）
                                </p>
                            </div>
                            <button
                                onClick={() => setShowAllTrending(false)}
                                className="px-3 py-1.5 text-sm rounded-lg border border-[#1e3a5f]/50 text-gray-400 hover:bg-white/5"
                            >
                                关闭
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {uniqueTrending.map(item => (
                                    <div
                                        key={item.id}
                                        onClick={() => openSourceUrl(item.sourceUrl)}
                                        className="bg-[#0d1526]/60 backdrop-blur-md rounded-xl border border-[#1e3a5f]/40 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col overflow-hidden group cursor-pointer"
                                    >
                                        <div className="h-40 relative bg-[#1e3a5f]/30 overflow-hidden">
                                            <img
                                                src={safeCover(item)}
                                                alt={item.title}
                                                referrerPolicy="no-referrer"
                                                onError={(e) => {
                                                    const target = e.target as HTMLImageElement;
                                                    target.src = buildFallbackCover(item);
                                                }}
                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                            />
                                        </div>
                                        <div className="p-4 flex flex-col flex-1">
                                            <div className="flex items-center justify-between mb-2">
                                                <PlatformBadge platform={item.platform} />
                                                <span className="text-xs text-gray-500">{item.date}</span>
                                            </div>
                                            {isXhsMissingToken(item.sourceUrl) && (
                                                <div className="mb-2 inline-flex text-[10px] px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300">
                                                    缺少 xsec_token
                                                </div>
                                            )}
                                            <h4 className="text-base font-bold text-gray-100 mb-2 leading-snug line-clamp-2 group-hover:text-indigo-400 transition-colors">
                                                {item.title}
                                            </h4>
                                            <p className="text-sm text-gray-400 line-clamp-2 mb-3 flex-1">
                                                {item.rawContent}
                                            </p>
                                            {item.platform === Platform.Xiaohongshu && (
                                                <div className="pt-2 border-t border-[#1e3a5f]/40 flex justify-end">
                                                    <button
                                                        onClick={(e) => handleRepairClick(e, item)}
                                                        disabled={repairingCardId === item.id}
                                                        className={`text-[10px] px-2 py-1 rounded border ${
                                                            repairingCardId === item.id
                                                                ? 'border-gray-600 text-gray-500 cursor-not-allowed'
                                                                : 'border-indigo-500/50 text-indigo-300 hover:bg-indigo-500/20'
                                                        }`}
                                                        title="打不开时点击修复链接"
                                                    >
                                                        {repairingCardId === item.id ? '修复中...' : '🔄 修复链接（noteId）'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
