import React from 'react';
import { KnowledgeCard, TrackingTask, Platform, TaskStatus } from '../types';
import { Flame, ArrowRight, Save, ExternalLink, Activity, LayoutGrid, Clock, Heart, TrendingUp, Bookmark, Sparkles } from './Icons';

interface DashboardViewProps {
  tasks: TrackingTask[];
  trendingItems: KnowledgeCard[];
  onNavigateToMonitoring: () => void;
  onNavigateToVault: () => void;
  onSaveToVault: (card: KnowledgeCard) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ 
  tasks, 
  trendingItems, 
  onNavigateToMonitoring, 
  onNavigateToVault,
  onSaveToVault 
}) => {
  
  const totalItemsFound = tasks.reduce((acc, t) => acc + t.itemsFound, 0);

  // 1. Hot Picks Data (Top 6 items for the 2x3 grid)
  const hotPicks = trendingItems.slice(0, 6);

  // 2. Categorized Rankings Data - Limited to Top 3 as requested
  const imageGenRankings = trendingItems
    .filter(item => item.tags.includes('Image Gen'))
    .sort((a, b) => b.metrics.likes - a.metrics.likes)
    .slice(0, 3);

  const videoGenRankings = trendingItems
    .filter(item => item.tags.includes('Video Gen'))
    .sort((a, b) => b.metrics.likes - a.metrics.likes)
    .slice(0, 3);
  
  const vibeCodingRankings = trendingItems
    .filter(item => item.tags.includes('Vibe Coding'))
    .sort((a, b) => b.metrics.likes - a.metrics.likes)
    .slice(0, 3);

  const formatLikes = (count: number) => {
    return count >= 1000 ? (count / 1000).toFixed(1) + 'k' : count;
  };

  const PlatformBadge: React.FC<{ platform: Platform }> = ({ platform }) => {
    const colors = {
        [Platform.Twitter]: 'bg-blue-100 text-blue-700',
        [Platform.Xiaohongshu]: 'bg-red-100 text-red-700',
        [Platform.Manual]: 'bg-gray-100 text-gray-700',
    };
    return (
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${colors[platform]}`}>
        {platform}
        </span>
    );
  };

  const RankingItem = ({ item, rank }: { item: KnowledgeCard, rank: number }) => (
    <div className="flex items-center gap-4 p-3 hover:bg-gray-50 rounded-xl transition-colors group cursor-pointer border-b border-gray-100 last:border-0">
        {/* Rank Number */}
        <div className={`
            flex-shrink-0 w-6 text-center font-bold text-lg italic
            ${rank === 1 ? 'text-red-500' : rank === 2 ? 'text-orange-500' : rank === 3 ? 'text-amber-500' : 'text-gray-400'}
        `}>
            {rank}
        </div>

        {/* Thumbnail */}
        <div className="w-12 h-12 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0 relative">
            <img src={item.coverImage} alt={item.title} className="w-full h-full object-cover" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-gray-900 truncate pr-2 group-hover:text-indigo-600 transition-colors">
                {item.title}
            </h4>
            <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] px-1.5 rounded-sm font-medium bg-gray-100 text-gray-500`}>
                   {item.platform}
                </span>
                <span className="text-[10px] text-gray-400 truncate">
                    @{item.author}
                </span>
            </div>
        </div>

        {/* Hot Metric */}
        <div className="flex-shrink-0 flex flex-col items-end">
            <div className="flex items-center gap-1 text-red-500 font-bold text-sm">
                <Flame size={12} fill="currentColor" />
                {formatLikes(item.metrics.likes)}
            </div>
            <span className="text-[10px] text-gray-400">Hot</span>
        </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-y-auto space-y-8 pb-12">
      
      {/* 1. Header & Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-1 md:col-span-2 bg-gradient-to-br from-gray-900 to-indigo-900 rounded-2xl p-6 text-white shadow-lg">
          <h2 className="text-2xl font-bold mb-2">Good Morning, Hunter.</h2>
          <p className="text-indigo-200 mb-6 max-w-md text-sm leading-relaxed">
            Your monitoring agents have captured <span className="font-bold text-white">{trendingItems.length} high-signal posts</span>.
          </p>
          <div className="flex gap-4">
            <button 
                onClick={onNavigateToMonitoring}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
            >
                <Activity size={16} />
                Manage Tasks
            </button>
            <button 
                onClick={onNavigateToVault}
                className="px-4 py-2 bg-white text-indigo-900 hover:bg-indigo-50 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors shadow-sm"
            >
                <LayoutGrid size={16} />
                Vault
            </button>
          </div>
        </div>

        <div className="col-span-1 bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex flex-col justify-center relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-5">
                <Activity size={80} />
             </div>
             <div className="flex items-center gap-2 text-gray-500 mb-2">
                <TrendingUp size={16} />
                <span className="text-xs font-semibold uppercase tracking-wider">Tracker Volume</span>
             </div>
             <div className="flex items-baseline gap-2 mb-1">
                <span className="text-4xl font-bold text-gray-900">{totalItemsFound}</span>
                <span className="text-sm text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full">+124 today</span>
             </div>
             <p className="text-sm text-gray-400">Insights processed this month</p>
        </div>
      </div>

      {/* 2. Hot Picks (Vertical Cards 2 Rows x 3 Cols) */}
      <div>
        <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
                <div className="p-1.5 bg-red-100 rounded-lg">
                    <Flame size={18} className="text-red-500" fill="currentColor" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Trending Now</h3>
            </div>
            <button className="text-sm text-indigo-600 font-medium hover:text-indigo-700 flex items-center gap-1">
                See All <ArrowRight size={14} />
            </button>
        </div>

        {/* 2x3 Grid using vertical cards to match 'Picture 1' style */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {hotPicks.map((item) => (
                <div key={item.id} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col overflow-hidden group">
                    {/* Cover Image Area */}
                    <div className="h-40 relative bg-gray-100 overflow-hidden">
                        <img 
                            src={item.coverImage} 
                            alt={item.title} 
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                        />
                        {/* Overlay Sparkles for Prompts */}
                        {item.contentType === 'PromptShare' && (
                            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded-md flex items-center gap-1">
                                <Sparkles size={10} className="text-yellow-400" />
                                <span>Prompts</span>
                            </div>
                        )}
                    </div>
                    
                    {/* Content Area */}
                    <div className="p-4 flex flex-col flex-1">
                        <div className="flex items-center justify-between mb-2">
                            <PlatformBadge platform={item.platform} />
                            <span className="text-xs text-gray-400">{item.date}</span>
                        </div>

                        <h4 className="text-base font-bold text-gray-900 mb-2 leading-snug line-clamp-2 group-hover:text-indigo-600 transition-colors">
                            {item.title}
                        </h4>

                        <p className="text-sm text-gray-500 line-clamp-2 mb-3 flex-1">
                            {item.rawContent}
                        </p>

                        {/* Tags */}
                        <div className="flex flex-wrap gap-1 mb-4">
                            {item.tags.slice(0, 2).map(tag => (
                                <span key={tag} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">
                                    #{tag}
                                </span>
                            ))}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                            <div className="flex items-center gap-3 text-gray-400 text-xs">
                                <div className="flex items-center gap-1 hover:text-red-500 transition-colors">
                                    <Heart size={14} />
                                    <span>{formatLikes(item.metrics.likes)}</span>
                                </div>
                                <div className="flex items-center gap-1 hover:text-amber-500 transition-colors">
                                    <Bookmark size={14} />
                                    <span>{item.metrics.bookmarks}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider truncate max-w-[80px]">
                                    {item.author}
                                </span>
                                <button 
                                    onClick={() => onSaveToVault(item)}
                                    className="text-gray-400 hover:text-indigo-600 transition-colors"
                                    title="Save to Vault"
                                >
                                    <Save size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
      </div>

      {/* 3. Rankings Lists (3 Columns now) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Image Gen Ranking */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
             <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 bg-indigo-500 rounded-full"></div>
                    <h3 className="font-bold text-gray-900">Image Gen · Top Rated</h3>
                </div>
                <span className="text-xs text-gray-400">Real-time</span>
             </div>
             
             <div className="space-y-1">
                 {imageGenRankings.map((item, idx) => (
                    <RankingItem key={item.id} item={item} rank={idx + 1} />
                 ))}
                 {imageGenRankings.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">No data</div>}
             </div>
          </div>

          {/* Video Gen Ranking */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
             <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 bg-purple-500 rounded-full"></div>
                    <h3 className="font-bold text-gray-900">Video Gen · Top Rated</h3>
                </div>
                <span className="text-xs text-gray-400">Real-time</span>
             </div>
             
             <div className="space-y-1">
                 {videoGenRankings.map((item, idx) => (
                    <RankingItem key={item.id} item={item} rank={idx + 1} />
                 ))}
                 {videoGenRankings.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">No data</div>}
             </div>
          </div>

          {/* Vibe Coding Ranking (New) */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
             <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
                <div className="flex items-center gap-2">
                    <div className="w-1 h-5 bg-emerald-500 rounded-full"></div>
                    <h3 className="font-bold text-gray-900">Vibe Coding · Top Rated</h3>
                </div>
                <span className="text-xs text-gray-400">Real-time</span>
             </div>
             
             <div className="space-y-1">
                 {vibeCodingRankings.map((item, idx) => (
                    <RankingItem key={item.id} item={item} rank={idx + 1} />
                 ))}
                 {vibeCodingRankings.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">No data</div>}
             </div>
          </div>

      </div>
    </div>
  );
};