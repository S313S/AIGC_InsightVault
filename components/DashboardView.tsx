import React, { useMemo, useState } from 'react';
import { KnowledgeCard, TrackingTask, Platform, TaskStatus } from '../types';
import { Flame, ArrowRight, Save, ExternalLink, Activity, LayoutGrid, Clock, Heart, TrendingUp, Bookmark, Sparkles } from './Icons';

interface DashboardViewProps {
    tasks: TrackingTask[];
    trendingItems: KnowledgeCard[];
    onNavigateToMonitoring: () => void;
    onNavigateToVault: () => void;
    onSaveToVault: (card: KnowledgeCard) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
    tasks,
    trendingItems,
    onNavigateToMonitoring,
    onNavigateToVault,
    onSaveToVault
}) => {

    const totalItemsFound = trendingItems.length;
    const [showAllTrending, setShowAllTrending] = useState(false);

    const normalizeSourceUrl = (url: string) => {
        if (!url) return '';
        const [base] = url.split('?');
        return base.trim();
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

    const sortedByHot = [...uniqueTrending].sort((a, b) => b.metrics.likes - a.metrics.likes);
    const usedIds = new Set<string>();

    const pickRankings = (tag: string) => {
        const primary = sortedByHot.filter(item => item.tags.includes(tag) && !usedIds.has(item.id));
        const selected: KnowledgeCard[] = [];
        for (const item of primary) {
            if (selected.length >= 3) break;
            selected.push(item);
            usedIds.add(item.id);
        }
        if (selected.length < 3) {
            const fallback = sortedByHot.filter(item => !usedIds.has(item.id));
            for (const item of fallback) {
                if (selected.length >= 3) break;
                selected.push(item);
                usedIds.add(item.id);
            }
        }
        return selected;
    };

    // 2. Categorized Rankings Data - Limited to Top 3 as requested
    const imageGenRankings = pickRankings('Image Gen');
    const videoGenRankings = pickRankings('Video Gen');
    const vibeCodingRankings = pickRankings('Vibe Coding');

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

    const RankingItem = ({ item, rank }: { item: KnowledgeCard, rank: number }) => (
        <div
            onClick={() => window.open(item.sourceUrl, '_blank')}
            className="flex items-center gap-4 p-3 hover:bg-white/5 rounded-xl transition-colors group cursor-pointer border-b border-[#1e3a5f]/30 last:border-0"
        >
            {/* Rank Number */}
            <div className={`
            flex-shrink-0 w-6 text-center font-bold text-lg italic
            ${rank === 1 ? 'text-red-400' : rank === 2 ? 'text-orange-400' : rank === 3 ? 'text-amber-400' : 'text-gray-500'}
        `}>
                {rank}
            </div>

            {/* Thumbnail */}
            <div className="w-12 h-12 bg-[#1e3a5f]/50 rounded-lg overflow-hidden flex-shrink-0 relative">
                <img src={item.coverImage} alt={item.title} className="w-full h-full object-cover" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-gray-200 truncate pr-2 group-hover:text-indigo-400 transition-colors">
                    {item.title}
                </h4>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] px-1.5 rounded-sm font-medium bg-[#1e3a5f]/50 text-gray-400`}>
                        {item.platform}
                    </span>
                    <span className="text-[10px] text-gray-500 truncate">
                        @{item.author}
                    </span>
                </div>
            </div>

            {/* Hot Metric */}
            <div className="flex-shrink-0 flex flex-col items-end">
                <div className="flex items-center gap-1 text-red-400 font-bold text-sm">
                    <Flame size={12} fill="currentColor" />
                    {formatLikes(item.metrics.likes)}
                </div>
                <span className="text-[10px] text-gray-500">热度</span>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-full overflow-y-auto space-y-8 pb-12">

            {/* 1. Header & Stats Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="col-span-1 md:col-span-2 bg-gradient-to-br from-gray-900 to-indigo-900 rounded-2xl p-6 text-white shadow-lg">
                    <h2 className="text-2xl font-bold mb-2">早上好，Hunter。</h2>
                    <p className="text-indigo-200 mb-6 max-w-md text-sm leading-relaxed">
                        你的监测任务已捕获 <span className="font-bold text-white">{trendingItems.length} 条高价值内容</span>。
                    </p>
                    <div className="flex gap-4">
                        <button
                            onClick={onNavigateToMonitoring}
                            className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                        >
                            <Activity size={16} />
                            管理任务
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
                        <span className="text-sm text-green-400 font-medium bg-green-500/20 px-2 py-0.5 rounded-full">今日 +124</span>
                    </div>
                    <p className="text-sm text-gray-500">本月已处理洞察</p>
                </div>
            </div>

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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {hotPicks.map((item) => (
                        <div
                            key={item.id}
                            onClick={() => window.open(item.sourceUrl, '_blank')}
                            className="bg-[#0d1526]/60 backdrop-blur-md rounded-xl border border-[#1e3a5f]/40 shadow-sm hover:shadow-lg hover:shadow-indigo-500/10 hover:-translate-y-1 transition-all duration-300 flex flex-col overflow-hidden group cursor-pointer"
                        >
                            {/* Cover Image Area */}
                            <div className="h-40 relative bg-[#1e3a5f]/30 overflow-hidden">
                                <img
                                    src={item.coverImage}
                                    alt={item.title}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />
                                {/* Overlay Sparkles for Prompts */}
                                {item.contentType === 'PromptShare' && (
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
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 3. Rankings Lists (3 Columns now) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Image Gen Ranking */}
                <div className="bg-[#0d1526]/60 backdrop-blur-md rounded-2xl border border-[#1e3a5f]/40 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#1e3a5f]/40">
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-5 bg-indigo-500 rounded-full"></div>
                            <h3 className="font-bold text-gray-100">Image Gen · 热门精选</h3>
                        </div>
                        <span className="text-xs text-gray-500">实时</span>
                    </div>

                    <div className="space-y-1">
                        {imageGenRankings.map((item, idx) => (
                            <RankingItem key={item.id} item={item} rank={idx + 1} />
                        ))}
                        {imageGenRankings.length === 0 && <div className="text-center py-8 text-gray-500 text-sm">暂无数据</div>}
                    </div>
                </div>

                {/* Video Gen Ranking */}
                <div className="bg-[#0d1526]/60 backdrop-blur-md rounded-2xl border border-[#1e3a5f]/40 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#1e3a5f]/40">
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-5 bg-purple-500 rounded-full"></div>
                            <h3 className="font-bold text-gray-100">Video Gen · 热门精选</h3>
                        </div>
                        <span className="text-xs text-gray-500">实时</span>
                    </div>

                    <div className="space-y-1">
                        {videoGenRankings.map((item, idx) => (
                            <RankingItem key={item.id} item={item} rank={idx + 1} />
                        ))}
                        {videoGenRankings.length === 0 && <div className="text-center py-8 text-gray-500 text-sm">暂无数据</div>}
                    </div>
                </div>

                {/* Vibe Coding Ranking (New) */}
                <div className="bg-[#0d1526]/60 backdrop-blur-md rounded-2xl border border-[#1e3a5f]/40 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#1e3a5f]/40">
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-5 bg-emerald-500 rounded-full"></div>
                            <h3 className="font-bold text-gray-100">Vibe Coding · 热门精选</h3>
                        </div>
                        <span className="text-xs text-gray-500">实时</span>
                    </div>

                    <div className="space-y-1">
                        {vibeCodingRankings.map((item, idx) => (
                            <RankingItem key={item.id} item={item} rank={idx + 1} />
                        ))}
                        {vibeCodingRankings.length === 0 && <div className="text-center py-8 text-gray-500 text-sm">暂无数据</div>}
                    </div>
                </div>

            </div>

            {/* All Trending Modal */}
            {showAllTrending && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-[#0d1526]/95 backdrop-blur-xl rounded-2xl w-full max-w-6xl max-h-[85vh] flex flex-col shadow-2xl border border-[#1e3a5f]/50">
                        <div className="p-6 border-b border-[#1e3a5f]/40 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-gray-100">近期热点 · 全部</h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    当前快照共 {uniqueTrending.length} 条
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
                                        onClick={() => window.open(item.sourceUrl, '_blank')}
                                        className="bg-[#0d1526]/60 backdrop-blur-md rounded-xl border border-[#1e3a5f]/40 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col overflow-hidden group cursor-pointer"
                                    >
                                        <div className="h-40 relative bg-[#1e3a5f]/30 overflow-hidden">
                                            <img
                                                src={item.coverImage}
                                                alt={item.title}
                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                            />
                                        </div>
                                        <div className="p-4 flex flex-col flex-1">
                                            <div className="flex items-center justify-between mb-2">
                                                <PlatformBadge platform={item.platform} />
                                                <span className="text-xs text-gray-500">{item.date}</span>
                                            </div>
                                            <h4 className="text-base font-bold text-gray-100 mb-2 leading-snug line-clamp-2 group-hover:text-indigo-400 transition-colors">
                                                {item.title}
                                            </h4>
                                            <p className="text-sm text-gray-400 line-clamp-2 mb-3 flex-1">
                                                {item.rawContent}
                                            </p>
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
