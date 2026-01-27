import React, { useState } from 'react';
import { X, Loader2, Sparkles, Plus } from './Icons';
import { analyzeContentWithGemini } from '../services/geminiService';
import { Platform, ContentType, KnowledgeCard, EngagementMetrics } from '../types';

interface AddContentModalProps {
  onClose: () => void;
  onAdd: (newCard: KnowledgeCard) => void;
}

export const AddContentModal: React.FC<AddContentModalProps> = ({ onClose, onAdd }) => {
  const [url, setUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'input' | 'processing'>('input');

  const handleSimulateFetch = async () => {
    if (!url && !rawText) return;
    
    setIsLoading(true);
    setStep('processing');

    // Simulate "Scraping" delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // For demo purposes, if text is empty but URL is provided, we mock the scraped text
    // In a real app, backend would fetch this.
    let contentToAnalyze = rawText;
    if (!contentToAnalyze && url) {
        contentToAnalyze = "This is a simulated scrape of " + url + ". The tool Midjourney v6 is amazing for creating photorealistic images. You can use parameters like --v 6.0 and --style raw. It is great for architectural visualization and character design. Prompt: A futuristic city with neon lights, cinematic lighting, 8k resolution --ar 16:9.";
    }

    // Call Gemini
    const analysis = await analyzeContentWithGemini(contentToAnalyze);

    const newCard: KnowledgeCard = {
        id: Date.now().toString(),
        title: analysis.summary.slice(0, 50) + "...", // Simple title generation
        sourceUrl: url || '#',
        platform: Platform.Manual,
        author: 'You',
        date: new Date().toLocaleDateString(),
        coverImage: 'https://picsum.photos/400/300?random=' + Date.now(),
        metrics: { likes: 0, bookmarks: 0, comments: 0 },
        contentType: ContentType.ToolReview,
        rawContent: contentToAnalyze,
        aiAnalysis: analysis,
        tags: ['Manual', 'AI']
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">Source Link (Optional)</label>
                        <input 
                            type="text" 
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="https://twitter.com/..."
                            value={url}
                            onChange={e => setUrl(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Paste Content</label>
                        <textarea 
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 h-32 focus:ring-2 focus:ring-blue-500 outline-none resize-none text-sm leading-relaxed"
                            placeholder="e.g., 'Just saw a thread by @TechLead about the new Claude 3.5 capabilities. Key points: 1. Better coding context. 2. Faster inference. Here is the full text: ...'"
                            value={rawText}
                            onChange={e => setRawText(e.target.value)}
                        ></textarea>
                        <p className="text-xs text-gray-500 mt-1">
                            Paste the article text, social media post, or your raw notes here. The AI will automatically summarize it and extract prompts.
                        </p>
                    </div>

                    <button 
                        onClick={handleSimulateFetch}
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