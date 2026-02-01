import React, { useState } from 'react';
import { TrackingTask, Platform, TaskStatus, KnowledgeCard, ContentType } from '../types';
import { Play, Clock, Check, Plus, Trash2, Calendar, Activity, Loader2, Search } from './Icons';
import { SearchResultsModal, SearchResult } from './SearchResultsModal';
import { addCard } from '../services/supabaseService';

interface MonitoringViewProps {
    tasks: TrackingTask[];
    onAddTask: (task: TrackingTask) => void;
    onCardsAdded?: (count: number) => void;
}

export const MonitoringView: React.FC<MonitoringViewProps> = ({ tasks, onAddTask, onCardsAdded }) => {
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
    const [console, setConsole] = useState<string[]>([]);

    const addLog = (msg: string) => {
        setConsole(prev => [...prev.slice(-9), `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    const handleSearch = async () => {
        if (!keywords.trim()) {
            addLog('❌ 请输入搜索关键词');
            return;
        }

        setIsSearching(true);
        setSearchError('');
        setSearchResults([]);
        addLog(`🔍 开始搜索: "${keywords}"`);

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

            addLog(`✅ 找到 ${data.results?.length || 0} 条结果`);
            setSearchResults(data.results || []);
            setShowResults(true);

        } catch (error: any) {
            const errorMsg = error.message || '搜索出错';
            addLog(`❌ 错误: ${errorMsg}`);
            setSearchError(errorMsg);
        } finally {
            setIsSearching(false);
        }
    };

    const handleSaveSelected = async (results: SearchResult[]) => {
        addLog(`📥 开始保存 ${results.length} 条内容...`);
        let saved = 0;

        for (const result of results) {
            try {
                // Map search result to KnowledgeCard
                const card: KnowledgeCard = {
                    id: crypto.randomUUID(),
                    title: result.title || result.desc?.slice(0, 50) || '无标题',
                    sourceUrl: result.sourceUrl,
                    platform: Platform.Xiaohongshu,
                    author: result.author,
                    date: result.publishTime,
                    coverImage: result.coverImage,
                    metrics: result.metrics,
                    contentType: ContentType.Post,
                    rawContent: result.desc || '',
                    aiAnalysis: { summary: '', usageScenarios: [], coreKnowledge: [], extractedPrompts: [] },
                    tags: [],
                    userNotes: '',
                    collections: [],
                };

                await addCard(card);
                saved++;
                addLog(`✅ 已保存: ${card.title.slice(0, 20)}...`);
            } catch (error: any) {
                addLog(`❌ 保存失败: ${result.title?.slice(0, 20) || result.noteId}`);
            }
        }

        addLog(`📦 保存完成: ${saved}/${results.length}`);
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
                    <p className="text-sm text-gray-500 mt-1">搜索并批量导入社交媒体内容到知识库</p>
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
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
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

                {/* Console Log */}
                {console.length > 0 && (
                    <div className="bg-gray-900 rounded-xl p-4 mb-6 font-mono text-sm">
                        <div className="flex items-center gap-2 text-gray-400 mb-2">
                            <div className="w-3 h-3 rounded-full bg-red-500"></div>
                            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                            <div className="w-3 h-3 rounded-full bg-green-500"></div>
                            <span className="ml-2">Console</span>
                        </div>
                        <div className="space-y-1 text-gray-300">
                            {console.map((log, i) => (
                                <div key={i}>{log}</div>
                            ))}
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
                                        <span className="flex items-center gap-1"><Calendar size={12} /> {task.dateRange.start} - {task.dateRange.end}</span>
                                        <span className="flex items-center gap-1">|</span>
                                        <span>{task.platforms.join(', ')}</span>
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
                                        <button className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-sm font-medium rounded-lg hover:bg-indigo-100">
                                            Review
                                        </button>
                                    )}
                                    <button className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Search Results Modal */}
            {showResults && (
                <SearchResultsModal
                    results={searchResults}
                    keyword={keywords}
                    isLoading={isSearching}
                    onClose={() => setShowResults(false)}
                    onSaveSelected={handleSaveSelected}
                />
            )}
        </div>
    );
};