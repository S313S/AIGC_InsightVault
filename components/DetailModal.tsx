import React, { useState, useEffect, useRef } from 'react';
import { KnowledgeCard, Collection } from '../types';
import { X, ExternalLink, Copy, Check, Sparkles, Heart, Bookmark, MessageCircle, Database, PenLine, FileText, Save, FolderPlus, FolderCheck, Trash2 } from './Icons';
import { filterCompletePromptsLocal } from '../shared/promptTagging.js';

interface DetailModalProps {
  card: KnowledgeCard | null;
  allCollections: Collection[];
  onClose: () => void;
  onUpdate: (card: KnowledgeCard) => void;
  onDelete: (id: string) => void;
}

const NOTE_PLACEHOLDER = `## 实验想法
在这里记录你的假设或实验思路...

**关键结论：**
- 观察点 1
- 观察点 2`;

export const DetailModal: React.FC<DetailModalProps> = ({ card, allCollections, onClose, onUpdate, onDelete }) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [isCollectionMenuOpen, setIsCollectionMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (card) {
      setNoteContent(card.userNotes || '');
    }
  }, [card]);

  // Click outside to close collection menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsCollectionMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!card) return null;

  const fallbackUsageScenarios = [
    '场景：你第一次接触这个主题。做法：先按帖子关键词搜索3条高互动案例，对比共性步骤后再动手。',
    '场景：你不确定是否值得投入。做法：先做一次10分钟小实验，再根据结果决定是否继续。'
  ];
  const fallbackCoreKnowledge = [
    '先做最小验证：优先小成本试错，记录输入与结果，避免盲目照搬。',
    '沉淀可复用模板：按“目标-步骤-参数-结果-复盘”整理，后续可直接复用。'
  ];
  const usageScenarios = card.aiAnalysis?.usageScenarios?.length ? card.aiAnalysis.usageScenarios : fallbackUsageScenarios;
  const coreKnowledge = card.aiAnalysis?.coreKnowledge?.length ? card.aiAnalysis.coreKnowledge : fallbackCoreKnowledge;
  const summaryText = (card.aiAnalysis?.summary || '').trim() || '当前摘要为空，建议点击“交给 AI 处理”重新生成。';
  const completePrompts = filterCompletePromptsLocal(card.aiAnalysis?.extractedPrompts || []);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSaveNote = () => {
    onUpdate({ ...card, userNotes: noteContent });
    setIsEditingNote(false);
  };

  const toggleCollection = (collectionId: string) => {
    const currentCollections = card.collections || [];
    let newCollections;

    if (currentCollections.includes(collectionId)) {
      newCollections = currentCollections.filter(id => id !== collectionId);
    } else {
      newCollections = [...currentCollections, collectionId];
    }

    onUpdate({ ...card, collections: newCollections });
  };

  const handleDelete = () => {
    if (window.confirm('确定要删除这张卡片吗？此操作不可撤销。')) {
      onDelete(card.id);
      onClose(); // Close modal after delete
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>

      <div className="relative bg-[#0d1526]/95 backdrop-blur-xl rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl border border-[#1e3a5f]/50 flex flex-col md:flex-row">

        {/* Header Actions (Absolute) */}
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          {/* Collection Dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setIsCollectionMenuOpen(!isCollectionMenuOpen)}
              className="p-2 bg-[#0d1526]/90 hover:bg-[#1e3a5f]/70 rounded-full shadow-sm transition-colors text-gray-400 hover:text-indigo-400"
              title="加入收藏夹"
            >
              <FolderPlus size={20} />
            </button>

            {isCollectionMenuOpen && (
              <div className="absolute right-0 top-12 w-56 bg-[#0d1526]/95 backdrop-blur-xl rounded-xl shadow-xl border border-[#1e3a5f]/50 py-2 animate-in fade-in zoom-in-95 duration-100 z-50">
                <div className="px-3 py-2 border-b border-[#1e3a5f]/40 mb-1">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">保存到收藏夹</span>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {allCollections.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500 text-center">尚未创建收藏夹</div>
                  ) : (
                    allCollections.map(col => {
                      const isSelected = card.collections?.includes(col.id);
                      return (
                        <button
                          key={col.id}
                          onClick={() => toggleCollection(col.id)}
                          className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-white/5 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <div className="w-2 h-2 rounded-full bg-indigo-500 opacity-50"></div>
                            <span className="truncate">{col.name}</span>
                          </div>
                          {isSelected && <Check size={14} className="text-indigo-400" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleDelete}
            className="p-2 bg-[#0d1526]/90 hover:bg-red-500/20 rounded-full shadow-sm transition-colors text-red-400 hover:text-red-300"
            title="删除卡片"
          >
            <Trash2 size={20} />
          </button>
          <button
            onClick={onClose}
            className="p-2 bg-[#0d1526]/90 hover:bg-[#1e3a5f]/70 rounded-full shadow-sm transition-colors text-gray-500 hover:text-gray-300"
          >
            <X size={20} />
          </button>
        </div>

        {/* Left Side: Visuals & Metrics (Scrollable on mobile) */}
        <div className="w-full md:w-2/5 bg-[#0a0f1a]/50 p-6 overflow-y-auto border-r border-[#1e3a5f]/40">
          <div className="rounded-xl overflow-hidden shadow-md mb-6 bg-[#1e3a5f]/30">
            <img
              src={card.coverImage || 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=1000&auto=format&fit=crop'}
              alt={card.title}
              referrerPolicy="no-referrer"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=1000&auto=format&fit=crop';
              }}
              className="w-full h-auto object-cover"
            />
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-gray-100 leading-snug mb-2">{card.title}</h2>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="font-medium text-gray-300">{card.author}</span>
                <span>•</span>
                <span>{card.date}</span>
                <span>•</span>
                <span className="capitalize">{card.platform}</span>
              </div>
            </div>

            {/* Collection Tags Display */}
            {(card.collections && card.collections.length > 0) && (
              <div className="flex flex-wrap gap-1">
                {card.collections.map(colId => {
                  const col = allCollections.find(c => c.id === colId);
                  if (!col) return null;
                  return (
                    <span key={colId} className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-500/20 text-indigo-400 text-xs rounded-md font-medium">
                      <FolderCheck size={10} />
                      {col.name}
                    </span>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between bg-[#0d1526]/60 p-3 rounded-lg border border-[#1e3a5f]/40">
              <div className="flex flex-col items-center">
                <Heart size={18} className="text-rose-400 mb-1" />
                <span className="text-xs font-semibold text-gray-300">{card.metrics.likes}</span>
              </div>
              <div className="flex flex-col items-center">
                <Bookmark size={18} className="text-amber-400 mb-1" />
                <span className="text-xs font-semibold text-gray-300">{card.metrics.bookmarks}</span>
              </div>
              <div className="flex flex-col items-center">
                <MessageCircle size={18} className="text-blue-400 mb-1" />
                <span className="text-xs font-semibold text-gray-300">{card.metrics.comments}</span>
              </div>
            </div>

            <a
              href={card.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <ExternalLink size={16} />
              查看原帖
            </a>

            {/* Raw Content Preview (Collapsed usually, showing snippet here) */}
            <div className="mt-6 pt-6 border-t border-[#1e3a5f]/40">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">原始内容</h4>
              <p className="text-xs text-gray-400 line-clamp-6 whitespace-pre-wrap">
                {card.rawContent}
              </p>
            </div>
          </div>
        </div>

        {/* Right Side: Knowledge & Prompts */}
        <div className="w-full md:w-3/5 bg-[#0d1526]/30 overflow-y-auto p-6 md:p-8">

          {/* AI Summary Section - Now First */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-purple-500/20 rounded-md">
                <Sparkles size={18} className="text-purple-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-100">帖子整理 Agent</h3>
            </div>

            <div className="bg-purple-500/10 p-4 rounded-xl border border-purple-500/20 text-gray-300 text-sm leading-relaxed mb-4">
              {summaryText}
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <h4 className="text-sm font-semibold text-gray-200 mb-2">使用场景（可直接照做）</h4>
                <ul className="list-disc list-inside space-y-1">
                  {usageScenarios.map((s, i) => (
                    <li key={i} className="text-sm text-gray-400 pl-1">{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-200 mb-2">核心知识（小白版）</h4>
                <ul className="list-disc list-inside space-y-1">
                  {coreKnowledge.map((k, i) => (
                    <li key={i} className="text-sm text-gray-400 pl-1">{k}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Prompts Section */}
          {completePrompts.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4 pt-6 border-t border-[#1e3a5f]/40">
                <div className="p-1.5 bg-indigo-500/20 rounded-md">
                  <Database size={18} className="text-indigo-400" />
                </div>
                <h3 className="text-lg font-bold text-gray-100">提取提示词</h3>
              </div>

              <div className="space-y-4">
                {completePrompts.map((prompt, idx) => (
                  <div key={idx} className="relative group">
                    <pre className="bg-[#0a0f1a] text-gray-100 p-4 rounded-xl text-sm whitespace-pre-wrap font-mono leading-relaxed border border-[#1e3a5f]/50">
                      {prompt}
                    </pre>
                    <button
                      onClick={() => handleCopy(prompt, idx)}
                      className="absolute top-2 right-2 p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-md transition-colors opacity-0 group-hover:opacity-100"
                      title="复制提示词"
                    >
                      {copiedIndex === idx ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* User Notes Section - Unified Format */}
          <div className="pt-6 border-t border-[#1e3a5f]/40">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-yellow-500/20 rounded-md">
                  <FileText size={18} className="text-yellow-400" />
                </div>
                <h3 className="text-lg font-bold text-gray-100">我的笔记</h3>
              </div>
              {!isEditingNote && (
                <button
                  onClick={() => setIsEditingNote(true)}
                  className="text-xs flex items-center gap-1 text-gray-500 hover:text-indigo-400 transition-colors"
                >
                  <PenLine size={14} />
                  编辑
                </button>
              )}
            </div>

            {isEditingNote ? (
              <div className="animate-in fade-in duration-200">
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder={NOTE_PLACEHOLDER}
                  className="w-full h-48 p-4 bg-[#0a0f1a] border border-[#1e3a5f]/50 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm leading-relaxed resize-none font-mono text-gray-200 placeholder-gray-600"
                  autoFocus
                />
                <div className="flex justify-end mt-2 gap-2">
                  <button
                    onClick={() => {
                      setNoteContent(card.userNotes || '');
                      setIsEditingNote(false);
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:bg-white/5 rounded-md"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSaveNote}
                    className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 rounded-md flex items-center gap-1"
                  >
                    <Save size={14} />
                    保存笔记
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => setIsEditingNote(true)}
                className="p-4 rounded-xl border border-[#1e3a5f]/50 bg-[#0a0f1a]/50 transition-all cursor-text group hover:border-[#1e3a5f] h-48 overflow-y-auto"
              >
                <div className={`text-sm whitespace-pre-wrap leading-relaxed font-mono ${!noteContent ? 'text-gray-600' : 'text-gray-300'}`}>
                  {noteContent || NOTE_PLACEHOLDER}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div >
  );
};
