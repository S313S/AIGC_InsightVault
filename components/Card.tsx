import React from 'react';
import { KnowledgeCard, Platform, ContentType } from '../types';
import { Heart, MessageCircle, Bookmark, Sparkles, CheckSquare, Square } from './Icons';

interface CardProps {
  card: KnowledgeCard;
  onClick: (card: KnowledgeCard) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

const PlatformBadge: React.FC<{ platform: Platform }> = ({ platform }) => {
  const colors = {
    [Platform.Twitter]: 'bg-blue-100 text-blue-700',
    [Platform.Xiaohongshu]: 'bg-red-100 text-red-700',
    [Platform.Manual]: 'bg-gray-100 text-gray-700',
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[platform]}`}>
      {platform}
    </span>
  );
};

export const Card: React.FC<CardProps> = ({
  card,
  onClick,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelect
}) => {
  const hasPrompts = card.aiAnalysis.extractedPrompts.length > 0;

  const handleClick = (e: React.MouseEvent) => {
    if (isSelectionMode && onToggleSelect) {
      e.stopPropagation();
      onToggleSelect(card.id);
    } else {
      onClick(card);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`group bg-white rounded-xl border shadow-sm transition-all duration-200 cursor-pointer overflow-hidden flex flex-col h-full relative
        ${isSelectionMode && isSelected ? 'ring-2 ring-indigo-500 border-indigo-500' : 'border-gray-200 hover:shadow-lg hover:-translate-y-1'}
      `}
    >
      {/* Selection Overlay */}
      {isSelectionMode && (
        <div className="absolute top-2 left-2 z-20">
          <div className={`
            w-6 h-6 rounded-md flex items-center justify-center transition-colors shadow-sm
            ${isSelected ? 'bg-indigo-600 text-white' : 'bg-white/90 text-gray-400 hover:text-gray-600'}
          `}>
            {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
          </div>
        </div>
      )}

      {/* Cover Image */}
      <div className="relative h-40 w-full overflow-hidden bg-gray-100">
        <img
          src={card.coverImage || 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=1000&auto=format&fit=crop'}
          alt={card.title}
          referrerPolicy="no-referrer"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=1000&auto=format&fit=crop';
          }}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {hasPrompts && (
          <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-md flex items-center gap-1">
            <Sparkles size={12} className="text-yellow-400" />
            <span>Prompts</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-grow">
        <div className="flex items-center justify-between mb-2">
          <PlatformBadge platform={card.platform} />
          <span className="text-xs text-gray-400">{card.date}</span>
        </div>

        <h3 className="text-base font-semibold text-gray-900 mb-2 line-clamp-2 leading-tight">
          {card.title}
        </h3>

        {/* AI Summary Snippet */}
        <p className="text-sm text-gray-600 line-clamp-3 mb-4 flex-grow">
          {card.aiAnalysis.summary}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mb-3">
          {card.tags.slice(0, 3).map(tag => (
            <span key={tag} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
              #{tag}
            </span>
          ))}
        </div>

        {/* Metrics Footer */}
        <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-gray-400 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Heart size={14} />
              <span>{card.metrics.likes >= 1000 ? (card.metrics.likes / 1000).toFixed(1) + 'k' : card.metrics.likes}</span>
            </div>
            <div className="flex items-center gap-1">
              <Bookmark size={14} />
              <span>{card.metrics.bookmarks}</span>
            </div>
          </div>
          <div className="text-gray-400 font-medium text-[10px] uppercase tracking-wider">
            {card.author}
          </div>
        </div>
      </div>
    </div>
  );
};