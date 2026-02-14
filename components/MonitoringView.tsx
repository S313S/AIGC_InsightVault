import React, { useEffect, useState } from 'react';
import { TrackingTask, Platform, TaskStatus, KnowledgeCard, ContentType, SocialSearchResult } from '../types';
import { Play, Clock, Check, Plus, Trash2, Calendar, Activity, Loader2, Search } from './Icons';
import { SearchResultsModal } from './SearchResultsModal';
import { saveCard } from '../services/supabaseService';
import { analyzeContentWithGemini, classifyContentWithGemini } from '../services/geminiService';
import { searchSocial } from '../services/socialService';

const CATEGORY_TAGS = ['Image Gen', 'Video Gen', 'Vibe Coding'];

const normalizeCategory = (value: string) => {
    const v = (value || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!v || v === 'other') return '';
    if (v.includes('image')) return 'Image Gen';
    if (v.includes('video')) return 'Video Gen';
    if (v.includes('vibe')) return 'Vibe Coding';
    return '';
};

const scoreCategory = (text: string) => {
    const t = (text || '').toLowerCase();
    const scores = { image: 0, video: 0, vibe: 0 };

    const imageKeywords = [
        'image', 'img', 'photo', 'picture', '图', '图片', '绘画', '生图', '海报', '头像',
        'midjourney', 'mj', 'stable diffusion', 'sd', 'comfyui', 'flux', 'krea',
        'lora', 'controlnet', 'prompt', '风格化', '修图', '上色'
    ];
    const videoKeywords = [
        'video', '视频', 'animation', '动画', '短片', '剪辑', '运动', '镜头',
        'runway', 'gen-3', 'gen3', 'kling', '可灵', 'pika', 'sora', 'veo', 'luma'
    ];
    const vibeKeywords = [
        'code', 'coding', '程序', '编程', '开发', '工程', 'repo', 'github', 'git',
        'cursor', 'claude code', 'vibe coding', 'vscode', 'ide', 'agent', 'workflow',
        '自动化', '前端', '后端', 'python', 'node', 'typescript', 'react', 'prompt engineering'
    ];

    for (const k of imageKeywords) if (t.includes(k)) scores.image += 1;
    for (const k of videoKeywords) if (t.includes(k)) scores.video += 1;
    for (const k of vibeKeywords) if (t.includes(k)) scores.vibe += 1;

    return scores;
};

const classifyByHeuristic = (text: string) => {
    const scores = scoreCategory(text);
    const entries: Array<[string, number]> = [
        ['Image Gen', scores.image],
        ['Video Gen', scores.video],
        ['Vibe Coding', scores.vibe],
    ];

    entries.sort((a, b) => b[1] - a[1]);
    const [top, topScore] = entries[0];
    const secondScore = entries[1][1];

    if (topScore === 0) return '';
    if (topScore === secondScore) return '';
    return top;
};

interface MonitoringViewProps {
    tasks: TrackingTask[];
    onAddTask: (task: TrackingTask) => void;
    onDeleteTask?: (taskId: string) => void;
    onCardsAdded?: (count: number) => void;
}

export const MonitoringView: React.FC<MonitoringViewProps> = ({ tasks, onAddTask, onDeleteTask, onCardsAdded }) => {
    const [isCreating, setIsCreating] = useState(false);
    const [taskPage, setTaskPage] = useState(1);
    const TASKS_PER_PAGE = 6;

    // Form State
    const [keywords, setKeywords] = useState('');
    const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([Platform.Xiaohongshu]);
    const [noteTime, setNoteTime] = useState(''); // 时间范围: 一天内, 一周内, 半年内
    const [sort, setSort] = useState('general'); // 排序方式

    // Search State
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<SocialSearchResult[]>([]);
    const [showResults, setShowResults] = useState(false);
    const [searchError, setSearchError] = useState('');
    const [reviewingTaskId, setReviewingTaskId] = useState<string | null>(null);

    // 过滤选项状态
    const [minInteraction, setMinInteraction] = useState<string>(''); // 最小互动量
    const [resultLimit, setResultLimit] = useState<number>(20); // 结果数量限制

    // 缓存工具函数
    const CACHE_KEY = 'search_cache';
    const CACHE_EXPIRY = 60 * 60 * 1000; // 1小时

    const getCachedResults = (taskId: string): SocialSearchResult[] | null => {
        try {
            const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
            const entry = cache[taskId];
            if (entry && Date.now() - entry.timestamp < CACHE_EXPIRY) {
                return entry.results;
            }
        } catch { }
        return null;
    };

    const setCachedResults = (taskId: string, results: SocialSearchResult[]) => {
        try {
            const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
            cache[taskId] = { results, timestamp: Date.now() };
            // Optional: Clean up old cache entries here if needed
            localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        } catch { }
    };

    // Helper for relative time
    const formatTimeAgo = (dateStr: string) => {
        if (!dateStr) return '';
        if (dateStr === '刚刚' || /^just\s*now$/i.test(dateStr)) return '刚刚'; // Backwards compatibility

        const minsAgo = dateStr.match(/^(\d+)\s*minutes?\s*ago$/i);
        if (minsAgo) return `${minsAgo[1]}分钟前`;

        const hoursAgo = dateStr.match(/^(\d+)\s*hours?\s*ago$/i);
        if (hoursAgo) return `${hoursAgo[1]}小时前`;

        const date = new Date(dateStr);
        if (Number.isNaN(date.getTime())) {
            return dateStr;
        }

        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return '刚刚';
        if (diffMins < 60) return `${diffMins}分钟前`;

        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}小时前`;

        return `${date.getMonth() + 1}月${date.getDate()}日`;
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
            const platforms = selectedPlatforms.length > 0 ? selectedPlatforms : [Platform.Xiaohongshu];
            const responses = await Promise.all(
                platforms.map((p) =>
                    searchSocial({
                        keyword: keywords,
                        page: 1,
                        sort,
                        noteType: '_0',
                        noteTime: noteTime || undefined,
                        platform: p === Platform.Twitter ? 'twitter' : 'xiaohongshu',
                        limit: resultLimit,
                    })
                )
            );

            let results = responses.flatMap((r) => r.results || []);

            // 前端过滤：最小互动量
            if (minInteraction && !isNaN(Number(minInteraction))) {
                const min = Number(minInteraction);
                results = results.filter((r: SocialSearchResult) => {
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

            // 自动创建任务卡片
            const today = new Date();
            const endDate = new Date(today);
            endDate.setDate(endDate.getDate() + 1); // 1天后过期

            const newTask: TrackingTask = {
                id: Date.now().toString(),
                keywords: keywords,
                platforms: platforms,
                dateRange: {
                    start: today.toISOString().split('T')[0],
                    end: endDate.toISOString().split('T')[0],
                },
                status: TaskStatus.Completed,
                itemsFound: results.length,
                lastRun: new Date().toISOString(),
                config: {
                    sort,
                    noteTime,
                    minInteraction
                }
            };

            // 缓存结果 (Use Task ID as key)
            setCachedResults(newTask.id, results);

            onAddTask(newTask);

        } catch (error: any) {
            const errorMsg = error.message || '搜索出错';
            setSearchError(errorMsg);
        } finally {
            setIsSearching(false);
        }
    };

    const totalTaskPages = Math.max(1, Math.ceil(tasks.length / TASKS_PER_PAGE));
    const safeTaskPage = Math.min(taskPage, totalTaskPages);
    const taskStart = (safeTaskPage - 1) * TASKS_PER_PAGE;
    const pagedTasks = tasks.slice(taskStart, taskStart + TASKS_PER_PAGE);

    useEffect(() => {
        if (taskPage > totalTaskPages) setTaskPage(totalTaskPages);
    }, [taskPage, totalTaskPages]);

    const handleDeletePage = async () => {
        if (!onDeleteTask || pagedTasks.length === 0) return;
        const ok = window.confirm(`确定要删除当前页的 ${pagedTasks.length} 条任务吗？`);
        if (!ok) return;
        for (const task of pagedTasks) {
            try {
                await onDeleteTask(task.id);
            } catch (e) {
                    console.error('删除任务失败:', task.id, e);
            }
        }
    };

    // Review: 优先使用缓存，缓存过期才重新搜索
    const handleReview = async (task: TrackingTask) => {
        const { keywords: taskKeywords, id: taskId, config } = task;

        // 检查缓存 (Use Task ID)
        const cached = getCachedResults(taskId);
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
            const platforms = task.platforms.length > 0 ? task.platforms : [Platform.Xiaohongshu];
            const responses = await Promise.all(
                platforms.map((p) =>
                    searchSocial({
                        keyword: taskKeywords,
                        page: 1,
                        sort: config?.sort || 'general',
                        noteType: config?.noteType || '_0',
                        noteTime: config?.noteTime || undefined,
                        platform: p === Platform.Twitter ? 'twitter' : 'xiaohongshu',
                        limit: resultLimit,
                    })
                )
            );

            let results = responses.flatMap((r) => r.results || []);

            // 前端过滤：最小互动量（注意：Review时也应用当前的过滤设置）
            const minInter = config?.minInteraction || minInteraction;
            if (minInter && !isNaN(Number(minInter))) {
                const min = Number(minInter);
                results = results.filter((r: SocialSearchResult) => {
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

            // 缓存结果 (Use Task ID)
            setCachedResults(taskId, results);
        } catch (error: any) {
            setSearchError(error.message || '搜索出错');
        } finally {
            setIsSearching(false);
            setReviewingTaskId(null);
        }
    };

    const handleSaveSelected = async (results: SocialSearchResult[]) => {
        let saved = 0;

        for (const result of results) {
            try {
                const rawText = result.desc || result.title || '';

                // Run AI analysis for structured fields
                const analysis = await analyzeContentWithGemini(rawText);
                const analysisOk = Boolean(analysis?.summary) && (
                    (analysis?.usageScenarios?.length || 0) > 0 ||
                    (analysis?.coreKnowledge?.length || 0) > 0 ||
                    (analysis?.extractedPrompts?.length || 0) > 0
                );
                console.info('[Import][Gemini] analysis', {
                    noteId: result.noteId,
                    ok: analysisOk
                });
                const summaryFallback = rawText
                    ? (rawText.length > 150 ? rawText.slice(0, 150) + '...' : rawText)
                    : '暂无摘要';

                const extractedTags = (result.desc || '').match(/#[^\s#]+/g)?.map(t => t.slice(1)) || [];

                // Category tagging: heuristic first, then AI fallback
                const combinedText = [
                    result.title,
                    result.desc,
                    analysis?.summary,
                    (analysis?.coreKnowledge || []).join(' ')
                ].filter(Boolean).join('\n');

                let category = combinedText.trim() ? classifyByHeuristic(combinedText) : '';
                if (!category && combinedText.trim()) {
                    const aiCategory = await classifyContentWithGemini(combinedText);
                    category = normalizeCategory(aiCategory);
                }

                const tagSet = new Set<string>();
                for (const t of extractedTags.slice(0, 5)) {
                    if (t && !CATEGORY_TAGS.includes(t)) tagSet.add(t);
                }
                if (category) tagSet.add(category);

                // Map search result to KnowledgeCard
                const card: KnowledgeCard = {
                    id: crypto.randomUUID(),
                    title: result.title || result.desc?.slice(0, 30) || '无标题',
                    sourceUrl: result.sourceUrl,
                    platform: result.platform,
                    author: result.author,
                    date: result.publishTime,
                    coverImage: result.coverImage || result.images?.[0] || '',
                    metrics: result.metrics,
                    contentType: ContentType.PromptShare,
                    rawContent: result.desc || '',
                    aiAnalysis: {
                        summary: analysis?.summary || summaryFallback,
                        usageScenarios: analysis?.usageScenarios || [],
                        coreKnowledge: analysis?.coreKnowledge || [],
                        extractedPrompts: analysis?.extractedPrompts || []
                    },
                    tags: Array.from(tagSet),
                    userNotes: '',
                    collections: [],
                };

                await saveCard(card);
                saved++;
            } catch (error: any) {
                console.error('保存失败:', error);
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
        <div className="flex flex-col h-full bg-[#0d1526]/60 backdrop-blur-md rounded-xl shadow-sm border border-[#1e3a5f]/40 overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-[#1e3a5f]/40 flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
                        <Activity className="text-indigo-400" />
                        热点搜索台
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
            <div className="p-6 bg-[#0a0f1a]/30 flex-1 overflow-y-auto">

                {/* Search Form */}
                {isCreating && (
                    <div className="bg-[#0d1526]/80 backdrop-blur-sm p-6 rounded-xl border border-[#1e3a5f]/50 shadow-sm mb-6 animate-in slide-in-from-top-4">
                        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">小红书搜索</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-300 mb-1">关键词</label>
                                <input
                                    type="text"
                                    className="w-full bg-[#0a0f1a] border border-[#1e3a5f]/50 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-200 placeholder-gray-500"
                                    placeholder="输入搜索关键词，如 'Claude' 或 'AI绘画'"
                                    value={keywords}
                                    onChange={(e) => setKeywords(e.target.value)}
                                // onKeyDown removed to prevent accidental submission
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-300 mb-2">平台</label>
                                <div className="flex gap-2 flex-wrap">
                                    {[
                                        { value: Platform.Xiaohongshu, label: '小红书' },
                                        { value: Platform.Twitter, label: 'Twitter / X' },
                                    ].map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => togglePlatform(opt.value)}
                                            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${selectedPlatforms.includes(opt.value)
                                                ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400'
                                                : 'bg-[#0a0f1a] border-[#1e3a5f]/50 text-gray-400'
                                                }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">时间范围</label>
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
                                            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${noteTime === opt.value ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400' : 'bg-[#0a0f1a] border-[#1e3a5f]/50 text-gray-400'}`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">排序方式</label>
                                <div className="flex gap-2 flex-wrap">
                                    {[
                                        { value: 'general', label: '综合' },
                                        { value: 'popularity_descending', label: '最热' },
                                        { value: 'time_descending', label: '最新' },
                                    ].map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => setSort(opt.value)}
                                            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${sort === opt.value ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400' : 'bg-[#0a0f1a] border-[#1e3a5f]/50 text-gray-400'}`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* 第二行：高级过滤 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-2 pt-4 border-t border-[#1e3a5f]/40">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">
                                    最小互动量 (点赞+收藏+评论)
                                    <span className="text-gray-500 font-normal ml-1 text-xs">可选</span>
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    className="w-full bg-[#0a0f1a] border border-[#1e3a5f]/50 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-gray-200 placeholder-gray-500"
                                    placeholder="例如: 100"
                                    value={minInteraction}
                                    onChange={(e) => setMinInteraction(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">
                                    结果数量限制
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="50"
                                    className="w-full bg-[#0a0f1a] border border-[#1e3a5f]/50 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-gray-200 placeholder-gray-500"
                                    placeholder="默认 20"
                                    value={resultLimit}
                                    onChange={(e) => setResultLimit(Math.max(1, Math.min(50, Number(e.target.value))))}
                                />
                            </div>
                        </div>
                        {searchError && (
                            <div className="mb-4 p-3 bg-red-500/10 text-red-400 rounded-lg text-sm border border-red-500/20">
                                {searchError}
                            </div>
                        )}
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setIsCreating(false)}
                                className="px-4 py-2 text-gray-400 hover:bg-white/5 rounded-lg text-sm font-medium"
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
                    {pagedTasks.map(task => (
                        <div key={task.id} className="bg-[#0d1526]/60 backdrop-blur-sm rounded-xl border border-[#1e3a5f]/40 p-4 flex items-center justify-between hover:border-[#1e3a5f] transition-all">
                            <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${task.status === TaskStatus.Running ? 'bg-green-500/20 text-green-400' : 'bg-[#1e3a5f]/50 text-gray-400'}`}>
                                    {task.status === TaskStatus.Running ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} />}
                                </div>
                                <div>
                                    <h4 className="font-semibold text-gray-100">{task.keywords}</h4>
                                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                                        <span className="flex items-center gap-1">
                                            <Calendar size={12} />
                                            {task.config?.noteTime || '全部时间'}
                                            {/* (API doesn't return date range, so we show the filter used) */}
                                        </span>
                                        <span className="flex items-center gap-1">|</span>
                                        <span>{task.platforms.join(', ')}</span>
                                        <span className="flex items-center gap-1">|</span>
                                        <span className="text-indigo-400">
                                            {task.config?.sort === 'popularity_descending' ? '最热搜索' :
                                                task.config?.sort === 'time_descending' ? '最新发布' :
                                                    '综合排序'}
                                        </span>
                                        {task.config?.minInteraction && (
                                            <>
                                                <span className="flex items-center gap-1">|</span>
                                                <span className="text-gray-500">
                                                    最小互动量 {task.config.minInteraction}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-8">
                                <div className="text-right">
                                    <div className="text-xs text-gray-500">命中条数</div>
                                    <div className="font-bold text-gray-100 text-lg">{task.itemsFound}</div>
                                </div>
                                <div className="text-right hidden sm:block">
                                    <div className="text-xs text-gray-500">最近运行</div>
                                    <div className="text-gray-400 text-sm">{formatTimeAgo(task.lastRun)}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {task.status === TaskStatus.Completed && (
                                        <button
                                            onClick={() => handleReview(task)}
                                            disabled={isSearching || reviewingTaskId !== null}
                                            className="px-3 py-1.5 bg-indigo-500/20 text-indigo-400 text-sm font-medium rounded-lg hover:bg-indigo-500/30 disabled:opacity-50 flex items-center gap-1"
                                        >
                                            {reviewingTaskId === task.id && <Loader2 size={14} className="animate-spin" />}
                                            复查
                                        </button>
                                    )}
                                    <button
                                        onClick={() => onDeleteTask?.(task.id)}
                                        className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {tasks.length > TASKS_PER_PAGE && (
                    <div className="flex items-center justify-between mt-4">
                        <div className="text-xs text-gray-500">
                            {taskStart + 1}-{Math.min(taskStart + TASKS_PER_PAGE, tasks.length)} / {tasks.length}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleDeletePage}
                                disabled={!onDeleteTask || pagedTasks.length === 0}
                                className="px-3 py-1.5 text-sm rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                            >
                                删除本页
                            </button>
                            <button
                                onClick={() => setTaskPage(p => Math.max(1, p - 1))}
                                disabled={safeTaskPage <= 1}
                                className="px-3 py-1.5 text-sm rounded-lg border border-[#1e3a5f]/50 text-gray-400 hover:bg-white/5 disabled:opacity-50"
                            >
                                上一页
                            </button>
                            <div className="text-sm text-gray-500">
                                {safeTaskPage} / {totalTaskPages}
                            </div>
                            <button
                                onClick={() => setTaskPage(p => Math.min(totalTaskPages, p + 1))}
                                disabled={safeTaskPage >= totalTaskPages}
                                className="px-3 py-1.5 text-sm rounded-lg border border-[#1e3a5f]/50 text-gray-400 hover:bg-white/5 disabled:opacity-50"
                            >
                                下一页
                            </button>
                        </div>
                    </div>
                )}
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
