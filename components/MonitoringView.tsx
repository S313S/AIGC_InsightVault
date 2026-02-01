import React, { useState } from 'react';
import { TrackingTask, Platform, TaskStatus, KnowledgeCard, ContentType } from '../types';
import { Play, Clock, Check, Plus, Trash2, Calendar, Activity, Loader2, Search } from './Icons';
import { SearchResultsModal, SearchResult } from './SearchResultsModal';
import { saveCard } from '../services/supabaseService';

interface MonitoringViewProps {
    tasks: TrackingTask[];
    onAddTask: (task: TrackingTask) => void;
    onDeleteTask?: (taskId: string) => void;
    onCardsAdded?: (count: number) => void;
}

export const MonitoringView: React.FC<MonitoringViewProps> = ({ tasks, onAddTask, onDeleteTask, onCardsAdded }) => {
    const [isCreating, setIsCreating] = useState(false);

    // Form State
    const [keywords, setKeywords] = useState('');
    const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([Platform.Xiaohongshu]);
    const [noteTime, setNoteTime] = useState(''); // 时间范围: 一天内, 一周内, 半年内
    const [sort, setSort] = useState('general'); // 排序方式

    // Search State
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [showResults, setShowResults] = useState(false);
    const [searchError, setSearchError] = useState('');
    const [reviewingTaskId, setReviewingTaskId] = useState<string | null>(null);

    // 过滤选项状态
    const [minInteraction, setMinInteraction] = useState<string>(''); // 最小互动量
    const [resultLimit, setResultLimit] = useState<number>(20); // 结果数量限制

    // 缓存工具函数
    const CACHE_KEY = 'search_cache';
    const CACHE_EXPIRY = 60 * 60 * 1000; // 1小时

    const getCachedResults = (keyword: string): SearchResult[] | null => {
        try {
            const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
            const entry = cache[keyword];
            if (entry && Date.now() - entry.timestamp < CACHE_EXPIRY) {
                return entry.results;
            }
        } catch { }
        return null;
    };

    const setCachedResults = (keyword: string, results: SearchResult[]) => {
        try {
            const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
            cache[keyword] = { results, timestamp: Date.now() };
            localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        } catch { }
    };

    const handleSearch = async () => {
        if (!keywords.trim()) {
            setSearchError('请输入搜索关键词');
            return;
        }

        setIsSearching(true);
        setSearchError('');
        setSearchResults([]);

        try {
            const response = await fetch('/api/search-social', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keyword: keywords,
                    page: 1,
                    sort,
                    noteType: '_0',
                    noteTime: noteTime || undefined,
                    platform: 'xiaohongshu',
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '搜索失败');
            }

            let results = data.results || [];

            // 前端过滤：最小互动量
            if (minInteraction && !isNaN(Number(minInteraction))) {
                const min = Number(minInteraction);
                results = results.filter((r: SearchResult) => {
                    const total = (r.metrics.likes || 0) + (r.metrics.bookmarks || 0) + (r.metrics.comments || 0);
                    return total >= min;
                });
            }

            // 前端限制：结果数量
            if (resultLimit > 0) {
                results = results.slice(0, resultLimit);
            }

            setSearchResults(results);
            setShowResults(true);

            // 缓存结果
            setCachedResults(keywords, results);

            // 自动创建任务卡片
            const today = new Date();
            const endDate = new Date(today);
            endDate.setDate(endDate.getDate() + 1); // 1天后过期

            const newTask: TrackingTask = {
                id: Date.now().toString(),
                keywords: keywords,
                platforms: [Platform.Xiaohongshu],
                dateRange: {
                    start: today.toISOString().split('T')[0],
                    end: endDate.toISOString().split('T')[0],
                },
                status: TaskStatus.Completed,
                itemsFound: results.length,
                lastRun: '刚刚',
                config: {
                    sort,
                    noteTime,
                    minInteraction
                }
            };
            onAddTask(newTask);

        } catch (error: any) {
            const errorMsg = error.message || '搜索出错';
            setSearchError(errorMsg);
        } finally {
            setIsSearching(false);
        }
    };

    // Review: 优先使用缓存，缓存过期才重新搜索
    const handleReview = async (task: TrackingTask) => {
        const { keywords: taskKeywords, id: taskId, config } = task;

        // 检查缓存
        const cached = getCachedResults(taskKeywords);
        if (cached) {
            setKeywords(taskKeywords);
            // Restore filters for display or future searches
            if (config) {
                if (config.sort) setSort(config.sort);
                if (config.noteTime) setNoteTime(config.noteTime);
                if (config.minInteraction) setMinInteraction(config.minInteraction);
            }
            setSearchResults(cached);
            setShowResults(true);
            return;
        }

        // 缓存未命中，询问用户
        const shouldRefetch = window.confirm('原始查询数据已过期（超过1小时）。\n\n是否重新查询？\n重新查询将产生新的 API 调用费用。');
        if (!shouldRefetch) {
            return;
        }

        // 用户确认重新查询
        setKeywords(taskKeywords);
        setReviewingTaskId(taskId); // 标记当前正在 Review 的任务
        setIsSearching(true);
        setSearchError('');
        setSearchResults([]);

        try {
            const response = await fetch('/api/search-social', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keyword: taskKeywords,
                    page: 1,
                    sort: config?.sort || 'general',
                    noteType: config?.noteType || '_0',
                    noteTime: config?.noteTime || undefined,
                    platform: 'xiaohongshu',
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '搜索失败');
            }

            let results = data.results || [];

            // 前端过滤：最小互动量（注意：Review时也应用当前的过滤设置）
            const minInter = config?.minInteraction || minInteraction;
            if (minInter && !isNaN(Number(minInter))) {
                const min = Number(minInter);
                results = results.filter((r: SearchResult) => {
                    const total = (r.metrics.likes || 0) + (r.metrics.bookmarks || 0) + (r.metrics.comments || 0);
                    return total >= min;
                });
            }

            // 前端限制：结果数量
            if (resultLimit > 0) {
                results = results.slice(0, resultLimit);
            }

            setSearchResults(results);
            setShowResults(true);

            // 缓存结果
            setCachedResults(taskKeywords, results);
        } catch (error: any) {
            setSearchError(error.message || '搜索出错');
        } finally {
            setIsSearching(false);
            setReviewingTaskId(null);
        }
    };

    const handleSaveSelected = async (results: SearchResult[]) => {
        let saved = 0;

        for (const result of results) {
            try {
                // Auto-generate basic metadata
                const summary = result.desc
                    ? (result.desc.length > 150 ? result.desc.slice(0, 150) + '...' : result.desc)
                    : '暂无摘要';

                const extractedTags = (result.desc || '').match(/#[^\s#]+/g)?.map(t => t.slice(1)) || [];

                // Map search result to KnowledgeCard
                const card: KnowledgeCard = {
                    id: crypto.randomUUID(),
                    title: result.title || result.desc?.slice(0, 30) || '无标题',
                    sourceUrl: result.sourceUrl,
                    platform: Platform.Xiaohongshu,
                    author: result.author,
                    date: result.publishTime,
                    coverImage: result.coverImage,
                    metrics: result.metrics,
                    contentType: ContentType.PromptShare,
                    rawContent: result.desc || '',
                    aiAnalysis: {
                        summary: summary, // Use extracted summary
                        usageScenarios: [],
                        coreKnowledge: [],
                        extractedPrompts: []
                    },
                    tags: extractedTags.slice(0, 5), // Limit tags
                    userNotes: '',
                    collections: [],
                };

                await saveCard(card);
                saved++;
            } catch (error: any) {
                console.error('Save error:', error);
            }
        }

        onCardsAdded?.(saved);
    };

    const togglePlatform = (p: Platform) => {
        setSelectedPlatforms(prev =>
            prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
        );
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <Activity className="text-indigo-600" />
                        Monitoring Console
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">搜索并批量导入社交媒体内容到知识库 · 缓存有效期：1小时</p>
                </div>
                <button
                    onClick={() => setIsCreating(true)}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                    <Search size={18} />
                    开始搜索
                </button>
            </div>

            {/* Content */}
            <div className="p-6 bg-gray-50 flex-1 overflow-y-auto">

                {/* Search Form */}
                {isCreating && (
                    <div className="bg-white p-6 rounded-xl border border-indigo-100 shadow-sm mb-6 animate-in slide-in-from-top-4">
                        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">小红书搜索</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">关键词</label>
                                <input
                                    type="text"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="输入搜索关键词，如 'Claude' 或 'AI绘画'"
                                    value={keywords}
                                    onChange={(e) => setKeywords(e.target.value)}
                                // onKeyDown removed to prevent accidental submission
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">时间范围</label>
                                <div className="flex gap-2 flex-wrap">
                                    {[
                                        { value: '', label: '全部' },
                                        { value: '一天内', label: '一天内' },
                                        { value: '一周内', label: '一周内' },
                                        { value: '半年内', label: '半年内' },
                                    ].map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => setNoteTime(opt.value)}
                                            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${noteTime === opt.value ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-gray-200 text-gray-600'}`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">排序方式</label>
                                <div className="flex gap-2 flex-wrap">
                                    {[
                                        { value: 'general', label: '综合' },
                                        { value: 'popularity_descending', label: '最热' },
                                        { value: 'time_descending', label: '最新' },
                                    ].map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => setSort(opt.value)}
                                            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${sort === opt.value ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-gray-200 text-gray-600'}`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* 第二行：高级过滤 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-2 pt-4 border-t border-gray-100">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    最小互动量 (点赞+收藏+评论)
                                    <span className="text-gray-400 font-normal ml-1 text-xs">可选</span>
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="例如: 100"
                                    value={minInteraction}
                                    onChange={(e) => setMinInteraction(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    结果数量限制
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="50"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="默认 20"
                                    value={resultLimit}
                                    onChange={(e) => setResultLimit(Math.max(1, Math.min(50, Number(e.target.value))))}
                                />
                            </div>
                        </div>
                        {searchError && (
                            <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
                                {searchError}
                            </div>
                        )}
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setIsCreating(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSearch}
                                disabled={isSearching || !keywords.trim()}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                            >
                                {isSearching && <Loader2 size={16} className="animate-spin" />}
                                搜索
                            </button>
                        </div>
                    </div>
                )}


                {/* Task List */}
                <div className="space-y-4">
                    {tasks.map(task => (
                        <div key={task.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${task.status === TaskStatus.Running ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                                    {task.status === TaskStatus.Running ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} />}
                                </div>
                                <div>
                                    <h4 className="font-semibold text-gray-900">{task.keywords}</h4>
                                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                                        <span className="flex items-center gap-1">
                                            <Calendar size={12} />
                                            {task.config?.noteTime || '全部时间'}
                                            {/* (API doesn't return date range, so we show the filter used) */}
                                        </span>
                                        <span className="flex items-center gap-1">|</span>
                                        <span>{task.platforms.join(', ')}</span>
                                        <span className="flex items-center gap-1">|</span>
                                        <span className="text-indigo-500">
                                            {task.config?.sort === 'popularity_descending' ? '最热搜索' :
                                                task.config?.sort === 'time_descending' ? '最新发布' :
                                                    '综合排序'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-8">
                                <div className="text-right">
                                    <div className="text-xs text-gray-500">Items Found</div>
                                    <div className="font-bold text-gray-900 text-lg">{task.itemsFound}</div>
                                </div>
                                <div className="text-right hidden sm:block">
                                    <div className="text-xs text-gray-500">Last Run</div>
                                    <div className="text-gray-700 text-sm">{task.lastRun}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {task.status === TaskStatus.Completed && (
                                        <button
                                            onClick={() => handleReview(task)}
                                            disabled={isSearching || reviewingTaskId !== null}
                                            className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-sm font-medium rounded-lg hover:bg-indigo-100 disabled:opacity-50 flex items-center gap-1"
                                        >
                                            {reviewingTaskId === task.id && <Loader2 size={14} className="animate-spin" />}
                                            Review
                                        </button>
                                    )}
                                    <button
                                        onClick={() => onDeleteTask?.(task.id)}
                                        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Search Results Modal */}
            {
                showResults && (
                    <SearchResultsModal
                        results={searchResults}
                        keyword={keywords}
                        isLoading={isSearching}
                        onClose={() => setShowResults(false)}
                        onSaveSelected={handleSaveSelected}
                    />
                )
            }
        </div >
    );
};