import React, { useState } from 'react';
import { X, Loader2, Sparkles, Plus, ExternalLink } from './Icons';
import { analyzeContentWithGemini } from '../services/geminiService';
import { fetchSocialContent, SocialMediaContent } from '../services/socialService';
import { Platform, ContentType, KnowledgeCard, EngagementMetrics } from '../types';

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
            setFetchError(error.message || 'Failed to fetch content');
        } finally {
            setIsFetching(false);
        }
    };

    const handleProcessWithAI = async () => {
        if (!url && !rawText) return;

        setIsLoading(true);
        setStep('processing');

        let contentToAnalyze = rawText;

        // Call Gemini for AI analysis
        const analysis = await analyzeContentWithGemini(contentToAnalyze);

        // Use fetched data if available, otherwise fallback
        const newCard: KnowledgeCard = {
            id: Date.now().toString(),
            title: fetchedData?.title || analysis.summary.slice(0, 50) + "...",
            sourceUrl: fetchedData?.sourceUrl || url || '#',
            platform: (fetchedData?.platform as Platform) || Platform.Manual,
            author: fetchedData?.author || 'You',
            date: new Date().toLocaleDateString(),
            coverImage: fetchedData?.coverImage || 'https://picsum.photos/400/300?random=' + Date.now(),
            metrics: fetchedData?.metrics || { likes: 0, bookmarks: 0, comments: 0 },
            contentType: ContentType.ToolReview,
            rawContent: contentToAnalyze,
            aiAnalysis: analysis,
            tags: fetchedData?.tags || ['Manual', 'AI'],
        };

        onAdd(newCard);
        setIsLoading(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>

            <div className="relative bg-white rounded-xl w-full max-w-lg overflow-hidden shadow-2xl">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-gray-900">Add to Knowledge Base</h2>
                    <button onClick={onClose}><X size={20} className="text-gray-500" /></button>
                </div>

                <div className="p-6">
                    {step === 'input' ? (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Source Link</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                        placeholder="https://twitter.com/... or https://xiaohongshu.com/..."
                                        value={url}
                                        onChange={e => setUrl(e.target.value)}
                                    />
                                    <button
                                        onClick={handleAutoFill}
                                        disabled={!url || isFetching}
                                        className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                    >
                                        {isFetching ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
                                        Auto-Fill
                                    </button>
                                </div>
                                {fetchError && <p className="text-xs text-red-500 mt-1">{fetchError}</p>}
                                {fetchedData && !fetchError && (
                                    <p className="text-xs text-green-600 mt-1">
                                        ✓ Fetched from {fetchedData.platform} · {fetchedData.metrics.likes} likes
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Content Preview</label>
                                <textarea
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 h-32 focus:ring-2 focus:ring-blue-500 outline-none resize-none text-sm leading-relaxed"
                                    placeholder="Paste content manually or use Auto-Fill to fetch from URL..."
                                    value={rawText}
                                    onChange={e => setRawText(e.target.value)}
                                ></textarea>
                            </div>

                            <button
                                onClick={handleProcessWithAI}
                                disabled={!url && !rawText}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Sparkles size={18} />
                                Process with AI Agent
                            </button>
                        </div>
                    ) : (
                        <div className="py-12 flex flex-col items-center justify-center text-center">
                            <Loader2 size={48} className="text-blue-600 animate-spin mb-4" />
                            <h3 className="text-lg font-medium text-gray-900">AI Agent is thinking...</h3>
                            <p className="text-sm text-gray-500 mt-1">Filtering content, summarizing, and extracting prompts.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};