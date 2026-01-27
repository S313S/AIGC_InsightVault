import React, { useState, useEffect, useRef } from 'react';
import { KnowledgeCard, Collection } from '../types';
import { X, ExternalLink, Copy, Check, Sparkles, Heart, Bookmark, MessageCircle, Database, PenLine, FileText, Save, FolderPlus, FolderCheck } from './Icons';

interface DetailModalProps {
  card: KnowledgeCard | null;
  allCollections: Collection[];
  onClose: () => void;
  onUpdate: (card: KnowledgeCard) => void;
}

const NOTE_PLACEHOLDER = `## Experiment Idea
Describe your hypothesis or experiment here...

**Key takeaways:**
- Observation 1
- Observation 2`;

export const DetailModal: React.FC<DetailModalProps> = ({ card, allCollections, onClose, onUpdate }) => {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="relative bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col md:flex-row">
        
        {/* Header Actions (Absolute) */}
        <div className="absolute top-4 right-4 z-10 flex gap-2">
            {/* Collection Dropdown */}
            <div className="relative" ref={menuRef}>
                <button 
                    onClick={() => setIsCollectionMenuOpen(!isCollectionMenuOpen)}
                    className="p-2 bg-white/90 hover:bg-white rounded-full shadow-sm transition-colors text-gray-600 hover:text-indigo-600"
                    title="Add to Album"
                >
                    <FolderPlus size={20} />
                </button>
                
                {isCollectionMenuOpen && (
                    <div className="absolute right-0 top-12 w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-2 animate-in fade-in zoom-in-95 duration-100 z-50">
                        <div className="px-3 py-2 border-b border-gray-100 mb-1">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Save to Album</span>
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                            {allCollections.length === 0 ? (
                                <div className="px-4 py-3 text-sm text-gray-400 text-center">No albums created</div>
                            ) : (
                                allCollections.map(col => {
                                    const isSelected = card.collections?.includes(col.id);
                                    return (
                                        <button
                                            key={col.id}
                                            onClick={() => toggleCollection(col.id)}
                                            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between"
                                        >
                                            <div className="flex items-center gap-2 truncate">
                                                <div className="w-2 h-2 rounded-full bg-indigo-500 opacity-50"></div>
                                                <span className="truncate">{col.name}</span>
                                            </div>
                                            {isSelected && <Check size={14} className="text-indigo-600" />}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>

            <button 
                onClick={onClose}
                className="p-2 bg-white/90 hover:bg-white rounded-full shadow-sm transition-colors"
            >
                <X size={20} className="text-gray-600" />
            </button>
        </div>

        {/* Left Side: Visuals & Metrics (Scrollable on mobile) */}
        <div className="w-full md:w-2/5 bg-gray-50 p-6 overflow-y-auto border-r border-gray-100">
          <div className="rounded-xl overflow-hidden shadow-md mb-6 bg-white">
            <img 
              src={card.coverImage} 
              alt={card.title} 
              className="w-full h-auto object-cover"
            />
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 leading-snug mb-2">{card.title}</h2>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="font-medium text-gray-900">{card.author}</span>
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
                            <span key={colId} className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 text-xs rounded-md font-medium">
                                <FolderCheck size={10} />
                                {col.name}
                            </span>
                        );
                    })}
                </div>
            )}

            <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200">
                <div className="flex flex-col items-center">
                    <Heart size={18} className="text-rose-500 mb-1" />
                    <span className="text-xs font-semibold">{card.metrics.likes}</span>
                </div>
                <div className="flex flex-col items-center">
                    <Bookmark size={18} className="text-amber-500 mb-1" />
                    <span className="text-xs font-semibold">{card.metrics.bookmarks}</span>
                </div>
                 <div className="flex flex-col items-center">
                    <MessageCircle size={18} className="text-blue-500 mb-1" />
                    <span className="text-xs font-semibold">{card.metrics.comments}</span>
                </div>
            </div>

            <a 
              href={card.sourceUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <ExternalLink size={16} />
              View Original Post
            </a>

            {/* Raw Content Preview (Collapsed usually, showing snippet here) */}
             <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Original Context</h4>
                <p className="text-xs text-gray-500 line-clamp-6 whitespace-pre-wrap">
                    {card.rawContent}
                </p>
            </div>
          </div>
        </div>

        {/* Right Side: Knowledge & Prompts */}
        <div className="w-full md:w-3/5 bg-white overflow-y-auto p-6 md:p-8">
            
            {/* AI Summary Section - Now First */}
            <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 bg-purple-100 rounded-md">
                        <Sparkles size={18} className="text-purple-600" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">AI Summary</h3>
                </div>
                
                <div className="bg-purple-50/50 p-4 rounded-xl border border-purple-100 text-gray-700 text-sm leading-relaxed mb-4">
                    {card.aiAnalysis.summary}
                </div>

                <div className="grid grid-cols-1 gap-4">
                    <div>
                        <h4 className="text-sm font-semibold text-gray-900 mb-2">Usage Scenarios</h4>
                        <ul className="list-disc list-inside space-y-1">
                            {card.aiAnalysis.usageScenarios.map((s, i) => (
                                <li key={i} className="text-sm text-gray-600 pl-1">{s}</li>
                            ))}
                        </ul>
                    </div>
                     <div>
                        <h4 className="text-sm font-semibold text-gray-900 mb-2">Core Knowledge</h4>
                        <ul className="list-disc list-inside space-y-1">
                            {card.aiAnalysis.coreKnowledge.map((k, i) => (
                                <li key={i} className="text-sm text-gray-600 pl-1">{k}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            {/* Prompts Section */}
            {card.aiAnalysis.extractedPrompts.length > 0 && (
                <div className="mb-8">
                    <div className="flex items-center gap-2 mb-4 pt-6 border-t border-gray-100">
                         <div className="p-1.5 bg-indigo-100 rounded-md">
                            <Database size={18} className="text-indigo-600" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">Extracted Prompts</h3>
                    </div>

                    <div className="space-y-4">
                        {card.aiAnalysis.extractedPrompts.map((prompt, idx) => (
                            <div key={idx} className="relative group">
                                <pre className="bg-gray-900 text-gray-100 p-4 rounded-xl text-sm whitespace-pre-wrap font-mono leading-relaxed border border-gray-800">
                                    {prompt}
                                </pre>
                                <button
                                    onClick={() => handleCopy(prompt, idx)}
                                    className="absolute top-2 right-2 p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-md transition-colors opacity-0 group-hover:opacity-100"
                                    title="Copy Prompt"
                                >
                                    {copiedIndex === idx ? <Check size={16} /> : <Copy size={16} />}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* User Notes Section - Unified Format */}
            <div className="pt-6 border-t border-gray-100">
               <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-yellow-100 rounded-md">
                          <FileText size={18} className="text-yellow-600" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">My Notes</h3>
                  </div>
                  {!isEditingNote && (
                     <button 
                       onClick={() => setIsEditingNote(true)}
                       className="text-xs flex items-center gap-1 text-gray-500 hover:text-indigo-600 transition-colors"
                     >
                       <PenLine size={14} />
                       Edit
                     </button>
                  )}
               </div>

               {isEditingNote ? (
                 <div className="animate-in fade-in duration-200">
                    <textarea 
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      placeholder={NOTE_PLACEHOLDER}
                      className="w-full h-48 p-4 bg-yellow-50 border border-yellow-200 rounded-xl focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none text-sm leading-relaxed resize-none font-mono text-gray-900 placeholder-gray-400/60"
                      autoFocus
                    />
                    <div className="flex justify-end mt-2 gap-2">
                      <button 
                        onClick={() => {
                          setNoteContent(card.userNotes || '');
                          setIsEditingNote(false);
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded-md"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={handleSaveNote}
                        className="px-3 py-1.5 text-xs font-medium bg-gray-900 text-white hover:bg-gray-800 rounded-md flex items-center gap-1"
                      >
                        <Save size={14} />
                        Save Note
                      </button>
                    </div>
                 </div>
               ) : (
                 <div 
                   onClick={() => setIsEditingNote(true)}
                   className="p-4 rounded-xl border border-yellow-200 bg-yellow-50 transition-all cursor-text group hover:border-yellow-300 h-48 overflow-y-auto"
                 >
                    <div className={`text-sm whitespace-pre-wrap leading-relaxed font-mono ${!noteContent ? 'text-gray-400/60' : 'text-gray-900'}`}>
                       {noteContent || NOTE_PLACEHOLDER}
                    </div>
                 </div>
               )}
            </div>
        </div>
      </div>
    </div>
  );
};