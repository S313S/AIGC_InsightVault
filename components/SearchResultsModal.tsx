import React, { useState } from 'react';
import { X, Check, ExternalLink, Loader2, Heart, Bookmark, MessageCircle } from './Icons';
import { SocialSearchResult } from '../types';

interface SearchResultsModalProps {
    results: SocialSearchResult[];
    keyword: string;
    isLoading: boolean;
    onClose: () => void;
    onSaveSelected: (results: SocialSearchResult[]) => void;
}

export const SearchResultsModal: React.FC<SearchResultsModalProps> = ({
    results,
    keyword,
    isLoading,
    onClose,
    onSaveSelected,
}) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSaving, setIsSaving] = useState(false);

    const toggleSelect = (noteId: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(noteId)) {
                next.delete(noteId);
            } else {
                next.add(noteId);
            }
            return next;
        });
    };

    const selectAll = () => {
        if (selectedIds.size === results.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(results.map(r => r.noteId)));
        }
    };

    const handleSave = async () => {
        const selected = results.filter(r => selectedIds.has(r.noteId));
        if (selected.length === 0) return;

        setIsSaving(true);
        try {
            await onSaveSelected(selected);
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#0d1526]/95 backdrop-blur-xl rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl border border-[#1e3a5f]/50">
                {/* Header */}
                <div className="p-6 border-b border-[#1e3a5f]/40 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-gray-100">搜索结果</h2>
                        <p className="text-sm text-gray-500 mt-1">
                            关键词: "{keyword}" · 找到 {results.length} 条结果
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg">
                        <X size={20} className="text-gray-500 hover:text-gray-300" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <Loader2 size={40} className="text-indigo-400 animate-spin" />
                            <p className="text-gray-500 mt-4">正在搜索...</p>
                        </div>
                    ) : results.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                            <p>没有找到相关内容</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {results.map(result => (
                                <div
                                    key={result.noteId}
                                    onClick={() => toggleSelect(result.noteId)}
                                    className={`flex gap-4 p-4 rounded-xl border cursor-pointer transition-all ${selectedIds.has(result.noteId)
                                        ? 'border-indigo-500 bg-indigo-500/10'
                                        : 'border-[#1e3a5f]/40 hover:border-[#1e3a5f] bg-[#0a0f1a]/50'
                                        }`}
                                >
                                    {/* Checkbox */}
                                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 mt-1 ${selectedIds.has(result.noteId)
                                        ? 'bg-indigo-600 border-indigo-600'
                                        : 'border-gray-600'
                                        }`}>
                                        {selectedIds.has(result.noteId) && <Check size={14} className="text-white" />}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-gray-100 truncate">
                                            {result.title || result.desc?.slice(0, 50) || '无标题'}
                                        </h3>
                                        <p className="text-sm text-gray-400 mt-1 line-clamp-2">
                                            {result.desc}
                                        </p>
                                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                            <span>@{result.author}</span>
                                            <span>{result.publishTime}</span>
                                        </div>
                                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                            <span className="flex items-center gap-1">
                                                <Heart size={12} /> {result.metrics.likes}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Bookmark size={12} /> {result.metrics.bookmarks}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <MessageCircle size={12} /> {result.metrics.comments}
                                            </span>
                                        </div>
                                    </div>

                                    {/* External Link */}
                                    <a
                                        href={result.sourceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={e => e.stopPropagation()}
                                        className="p-2 hover:bg-white/5 rounded-lg flex-shrink-0"
                                    >
                                        <ExternalLink size={16} className="text-gray-500" />
                                    </a>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {!isLoading && results.length > 0 && (
                    <div className="p-4 border-t border-[#1e3a5f]/40 flex items-center justify-between">
                        <button
                            onClick={selectAll}
                            className="text-sm text-indigo-400 hover:text-indigo-300"
                        >
                            {selectedIds.size === results.length ? '取消全选' : '全选'}
                        </button>
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-500">
                                已选择 {selectedIds.size} 项
                            </span>
                            <button
                                onClick={handleSave}
                                disabled={selectedIds.size === 0 || isSaving}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isSaving && <Loader2 size={16} className="animate-spin" />}
                                保存到知识库
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
