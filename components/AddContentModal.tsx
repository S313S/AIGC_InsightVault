import React, { useState } from 'react';
import { X, Loader2, Sparkles, Plus, ExternalLink } from './Icons';
import { analyzeContentWithGemini, classifyContentWithGemini } from '../services/geminiService';
import { fetchSocialContent, SocialMediaContent } from '../services/socialService';
import { Platform, ContentType, KnowledgeCard, EngagementMetrics } from '../types';
import { resolveContentTypeByPrompts } from '../shared/promptTagging.js';

interface AddContentModalProps {
    onClose: () => void;
    onAdd: (newCard: KnowledgeCard) => void;
}

export const AddContentModal: React.FC<AddContentModalProps> = ({ onClose, onAdd }) => {
    const [url, setUrl] = useState('');
    const [rawText, setRawText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [step, setStep] = useState<'input' | 'processing'>('input');
    const [fetchedData, setFetchedData] = useState<SocialMediaContent | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // Auto-Fill from URL
    const handleAutoFill = async () => {
        if (!url) return;

        setIsFetching(true);
        setFetchError(null);

        try {
            const data = await fetchSocialContent(url);
            setFetchedData(data);

            // Auto-fill the rawText field
            const contentPreview = data.rawContent || data.title || '';
            setRawText(contentPreview);

        } catch (error: any) {
            setFetchError(error.message || '内容抓取失败');
        } finally {
            setIsFetching(false);
        }
    };

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

    const normalizeCategory = (value: string) => {
        const v = (value || '').trim();
        if (v === 'Image Gen' || v === 'Video Gen' || v === 'Vibe Coding') return v;
        return '';
    };

    const handleProcessWithAI = async () => {
        if (!url && !rawText) return;

        setIsLoading(true);
        setStep('processing');

        let contentToAnalyze = rawText;

        // Call Gemini for AI analysis
        const analysis = await analyzeContentWithGemini(contentToAnalyze, {
            imageUrls: (fetchedData?.images || []).filter(Boolean)
        });

        // Use fetched data if available, otherwise fallback
        const extractedTags = (contentToAnalyze || '')
            .match(/#[^\s#]+/g)
            ?.map(t => t.slice(1))
            .filter(Boolean) || [];
        const baseTags = (fetchedData?.tags || []).filter(Boolean);
        const combinedText = [fetchedData?.title, fetchedData?.rawContent, contentToAnalyze].filter(Boolean).join('\n');
        let category = inferCategoryTag(combinedText);
        if (!category && combinedText.trim()) {
            const aiCategory = await classifyContentWithGemini(combinedText);
            category = normalizeCategory(aiCategory);
        }
        if (!category) category = 'Vibe Coding';
        const tagSet = new Set<string>();
        if (category) tagSet.add(category);
        extractedTags.forEach(t => tagSet.add(t));
        baseTags.forEach(t => tagSet.add(t));
        const tags = Array.from(tagSet);

        const newCard: KnowledgeCard = {
            id: Date.now().toString(),
            title: fetchedData?.title || analysis.summary.slice(0, 50) + "...",
            sourceUrl: fetchedData?.sourceUrl || url || '#',
            platform: (fetchedData?.platform as Platform) || Platform.Manual,
            author: fetchedData?.author || '我',
            date: new Date().toLocaleDateString(),
            coverImage: fetchedData?.coverImage || 'https://picsum.photos/400/300?random=' + Date.now(),
            images: fetchedData?.images || [],
            metrics: fetchedData?.metrics || { likes: 0, bookmarks: 0, comments: 0 },
            contentType: resolveContentTypeByPrompts(analysis?.extractedPrompts) as ContentType,
            rawContent: contentToAnalyze,
            aiAnalysis: analysis,
            tags,
        };

        onAdd(newCard);
        setIsLoading(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>

            <div className="relative bg-[#0d1526]/95 backdrop-blur-xl rounded-xl w-full max-w-lg overflow-hidden shadow-2xl border border-[#1e3a5f]/50">
                <div className="p-4 border-b border-[#1e3a5f]/40 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-gray-100">添加到知识库</h2>
                    <button onClick={onClose}><X size={20} className="text-gray-500 hover:text-gray-300" /></button>
                </div>

                <div className="p-6">
                    {step === 'input' ? (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">来源链接</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        className="flex-1 bg-[#0a0f1a] border border-[#1e3a5f]/50 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm text-gray-200 placeholder-gray-500"
                                        placeholder="https://twitter.com/... 或 https://xiaohongshu.com/..."
                                        value={url}
                                        onChange={e => setUrl(e.target.value)}
                                    />
                                    <button
                                        onClick={handleAutoFill}
                                        disabled={!url || isFetching}
                                        className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                    >
                                        {isFetching ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
                                        自动填充
                                    </button>
                                </div>
                                {fetchError && <p className="text-xs text-red-400 mt-1">{fetchError}</p>}
                                {fetchedData && !fetchError && (
                                    <p className="text-xs text-green-400 mt-1">
                                        ✓ 已从 {fetchedData.platform} 抓取 · {fetchedData.metrics.likes} 点赞
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">内容预览</label>
                                <textarea
                                    className="w-full bg-[#0a0f1a] border border-[#1e3a5f]/50 rounded-lg px-3 py-2 h-32 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none text-sm leading-relaxed text-gray-200 placeholder-gray-500"
                                    placeholder="可手动粘贴内容，或通过自动填充从链接抓取..."
                                    value={rawText}
                                    onChange={e => setRawText(e.target.value)}
                                ></textarea>
                            </div>

                            <button
                                onClick={handleProcessWithAI}
                                disabled={!url && !rawText}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Sparkles size={18} />
                                添加到知识库
                            </button>
                        </div>
                    ) : (
                        <div className="py-12 flex flex-col items-center justify-center text-center">
                            <Loader2 size={48} className="text-indigo-400 animate-spin mb-4" />
                            <h3 className="text-lg font-medium text-gray-100">AI 正在处理中...</h3>
                            <p className="text-sm text-gray-500 mt-1">正在过滤内容、生成摘要并提取提示词。</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
