import React, { useState, useMemo, useEffect } from 'react';
import { LayoutGrid, Plus, Search, Database, Menu, MessageSquare, Activity, Home, Folder, X, Check, MoreVertical, Edit2, Trash2, CheckSquare, FolderPlus, Sparkles, Loader2 } from './components/Icons';
import { Card } from './components/Card';
import { DetailModal } from './components/DetailModal';
import { AddContentModal } from './components/AddContentModal';
import { ChatView } from './components/ChatView';
import { MonitoringView } from './components/MonitoringView';
import { DashboardView } from './components/DashboardView';
import { INITIAL_DATA, INITIAL_TASKS, TRENDING_DATA, INITIAL_COLLECTIONS } from './mockData';
import { KnowledgeCard, FilterState, TrackingTask, Collection, ContentType } from './types';
import { isSupabaseConnected } from './services/supabaseClient';
import * as db from './services/supabaseService';

type ViewMode = 'dashboard' | 'grid' | 'monitoring' | 'chat';

// Updated categories
const POPULAR_TOPICS = ['All', 'Image Gen', 'Video Gen', 'Vibe Coding'];

const App: React.FC = () => {
  const [cards, setCards] = useState<KnowledgeCard[]>([]);
  const [tasks, setTasks] = useState<TrackingTask[]>([]);
  const [trending, setTrending] = useState<KnowledgeCard[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCard, setSelectedCard] = useState<KnowledgeCard | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewMode>('dashboard');

  // Loading State
  const [isLoading, setIsLoading] = useState(true);

  // Chat Context State
  const [chatScope, setChatScope] = useState<{ cards: KnowledgeCard[], title: string }>({
    cards: [],
    title: 'Entire Vault'
  });

  // Collection Selection State
  const [currentCollectionId, setCurrentCollectionId] = useState<string | null>(null);
  const [activeCollectionMenuId, setActiveCollectionMenuId] = useState<string | null>(null);

  // Collection Creation State (Inline UI)
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');

  // Batch Selection State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [isAddToCollectionModalOpen, setIsAddToCollectionModalOpen] = useState(false);

  // Filter State
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    selectedTopic: 'All'
  });

  // ============ 从 Supabase 加载数据 ============
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);

      if (isSupabaseConnected()) {
        // 尝试初始化 mock 数据（首次运行时）
        await db.initializeWithMockData(INITIAL_DATA, TRENDING_DATA, INITIAL_COLLECTIONS, INITIAL_TASKS);

        // 从数据库加载
        const [dbCards, dbTrending, dbCollections, dbTasks] = await Promise.all([
          db.getKnowledgeCards(),
          db.getTrendingCards(),
          db.getCollections(),
          db.getTasks()
        ]);

        setCards(dbCards);
        setTrending(dbTrending);
        setCollections(dbCollections);
        setTasks(dbTasks);
        setChatScope({ cards: dbCards, title: 'Entire Vault' });
      } else {
        // 离线模式：使用 mock 数据
        setCards(INITIAL_DATA);
        setTrending(TRENDING_DATA);
        setCollections(INITIAL_COLLECTIONS);
        setTasks(INITIAL_TASKS);
        setChatScope({ cards: INITIAL_DATA, title: 'Entire Vault' });
      }

      setIsLoading(false);
    };

    loadData();
  }, []);

  // Check if a card belongs to a collection
  // Logic updated to check the card.collections array
  const isCardInCollection = (card: KnowledgeCard, collectionId: string) => {
    return card.collections?.includes(collectionId) ?? false;
  };

  // Derived filtered data
  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      // 1. Search Filter
      const matchesSearch = card.title.toLowerCase().includes(filters.searchQuery.toLowerCase()) ||
        card.tags.some(t => t.toLowerCase().includes(filters.searchQuery.toLowerCase()));

      // 2. Topic Filter
      const matchesTopic = filters.selectedTopic === 'All' ||
        card.tags.some(t => t.toLowerCase() === filters.selectedTopic.toLowerCase());

      // 3. Collection Filter
      let matchesCollection = true;
      if (currentCollectionId) {
        matchesCollection = isCardInCollection(card, currentCollectionId);
      }

      return matchesSearch && matchesTopic && matchesCollection;
    });
  }, [cards, filters, currentCollectionId]);

  const handleAddCard = async (newCard: KnowledgeCard) => {
    setCards(prev => [newCard, ...prev]);
    if (isSupabaseConnected()) {
      await db.saveCard(newCard, false);
    }
  };

  const handleAddTask = async (newTask: TrackingTask) => {
    setTasks(prev => [newTask, ...prev]);
    if (isSupabaseConnected()) {
      await db.saveTask(newTask);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    if (isSupabaseConnected()) {
      await db.deleteTask(taskId);
    }
  };

  const handleSaveTrendingToVault = async (card: KnowledgeCard) => {
    // Add to main cards list
    const savedCard = { ...card, id: isSupabaseConnected() ? card.id : Date.now().toString() };
    setCards(prev => [savedCard, ...prev]);
    // Remove from trending list
    setTrending(prev => prev.filter(c => c.id !== card.id));

    if (isSupabaseConnected()) {
      await db.moveTrendingToVault(card);
    }
  };

  // Update card data (e.g. when adding a note)
  const handleUpdateCard = async (updatedCard: KnowledgeCard) => {
    // Update selected card state
    setSelectedCard(updatedCard);

    // Update if it's in the main vault
    setCards(prev => prev.map(c => c.id === updatedCard.id ? updatedCard : c));

    // Update if it's in the trending list
    setTrending(prev => prev.map(c => c.id === updatedCard.id ? updatedCard : c));

    if (isSupabaseConnected()) {
      await db.updateCard(updatedCard);
    }
  };

  const handleCollectionClick = (collectionId: string) => {
    setActiveView('grid');
    setCurrentCollectionId(collectionId);
    setFilters(prev => ({ ...prev, selectedTopic: 'All' })); // Reset topic when switching collection
    setIsSidebarOpen(false);

    // Reset selection mode when changing collections
    setIsSelectionMode(false);
    setSelectedCardIds(new Set());
  };

  const handleMainNavigation = (view: ViewMode) => {
    setActiveView(view);

    // If navigating to chat via Sidebar, reset to Global scope
    if (view === 'chat') {
      setChatScope({ cards: cards, title: 'Entire Vault' });
    }

    setCurrentCollectionId(null); // Reset collection when navigating via main menu
    setIsSidebarOpen(false);
    setIsSelectionMode(false);
    setSelectedCardIds(new Set());
  }

  // --- Collection Management Functions ---

  const confirmCreateCollection = async () => {
    if (newCollectionName.trim()) {
      const newCollection: Collection = {
        id: `c_${Date.now()}`,
        name: newCollectionName,
        coverImage: `https://picsum.photos/200/200?random=${Date.now()}`,
        itemCount: 0
      };
      setCollections(prev => [...prev, newCollection]);
      setNewCollectionName('');
      setIsCreatingCollection(false);

      if (isSupabaseConnected()) {
        await db.saveCollection(newCollection);
      }
    }
  };

  const cancelCreateCollection = () => {
    setIsCreatingCollection(false);
    setNewCollectionName('');
  }

  const handleDeleteCollection = async (e: React.MouseEvent, collectionId: string) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this album? The items inside will not be deleted.")) {
      setCollections(prev => prev.filter(c => c.id !== collectionId));
      if (currentCollectionId === collectionId) {
        setCurrentCollectionId(null);
      }

      if (isSupabaseConnected()) {
        await db.deleteCollection(collectionId);
      }
    }
    setActiveCollectionMenuId(null);
  };

  const handleRenameCollection = async (e: React.MouseEvent, collectionId: string, currentName: string) => {
    e.stopPropagation();
    const newName = window.prompt("Rename Album", currentName);
    if (newName && newName.trim()) {
      const updatedCollection = collections.find(c => c.id === collectionId);
      if (updatedCollection) {
        const renamed = { ...updatedCollection, name: newName };
        setCollections(prev => prev.map(c => c.id === collectionId ? renamed : c));

        if (isSupabaseConnected()) {
          await db.updateCollection(renamed);
        }
      }
    }
    setActiveCollectionMenuId(null);
  };

  // --- Chat with Album ---
  const handleChatWithCollection = (collectionId: string) => {
    const collection = collections.find(c => c.id === collectionId);
    if (!collection) return;

    // Filter cards belonging to this collection
    const collectionCards = cards.filter(c => isCardInCollection(c, collectionId));

    // Set scope and navigate
    setChatScope({
      cards: collectionCards,
      title: collection.name
    });
    setActiveView('chat');
  };

  // --- Batch Selection Functions ---

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedCardIds(new Set());
  };

  const toggleCardSelection = (cardId: string) => {
    const newSet = new Set(selectedCardIds);
    if (newSet.has(cardId)) {
      newSet.delete(cardId);
    } else {
      newSet.add(cardId);
    }
    setSelectedCardIds(newSet);
  };

  const handleRemoveSelectedFromCollection = async () => {
    if (!currentCollectionId || selectedCardIds.size === 0) return;

    if (window.confirm(`Remove ${selectedCardIds.size} items from this collection?`)) {
      const updatedCards: KnowledgeCard[] = [];
      setCards(prevCards => prevCards.map(card => {
        if (selectedCardIds.has(card.id)) {
          const updated = {
            ...card,
            collections: card.collections?.filter(cid => cid !== currentCollectionId)
          };
          updatedCards.push(updated);
          return updated;
        }
        return card;
      }));
      setIsSelectionMode(false);
      setSelectedCardIds(new Set());

      if (isSupabaseConnected()) {
        for (const card of updatedCards) {
          await db.updateCard(card);
        }
      }
    }
  };

  const handleBatchAddToCollection = async (targetCollectionId: string) => {
    const updatedCards: KnowledgeCard[] = [];
    setCards(prevCards => prevCards.map(card => {
      if (selectedCardIds.has(card.id)) {
        const currentCollections = card.collections || [];
        if (!currentCollections.includes(targetCollectionId)) {
          const updated = { ...card, collections: [...currentCollections, targetCollectionId] };
          updatedCards.push(updated);
          return updated;
        }
      }
      return card;
    }));
    setIsAddToCollectionModalOpen(false);
    setIsSelectionMode(false);
    setSelectedCardIds(new Set());
    alert("Items added to album successfully.");

    if (isSupabaseConnected()) {
      for (const card of updatedCards) {
        await db.updateCard(card);
      }
    }
  };

  const activeCollectionName = useMemo(() => {
    return collections.find(c => c.id === currentCollectionId)?.name;
  }, [currentCollectionId, collections]);

  // Click outside listener to close dropdowns
  useEffect(() => {
    const handleClickOutside = () => setActiveCollectionMenuId(null);
    if (activeCollectionMenuId) {
      window.addEventListener('click', handleClickOutside);
    }
    return () => window.removeEventListener('click', handleClickOutside);
  }, [activeCollectionMenuId]);

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans text-gray-900">

      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
          <p className="text-gray-600 text-sm">Loading your vault...</p>
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)}></div>
      )}

      {/* Sidebar Navigation */}
      <aside className={`
        fixed lg:sticky top-0 left-0 h-screen w-64 bg-white border-r border-gray-200 z-50 transform transition-transform duration-300 ease-in-out flex flex-col
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Top Section: Logo & Nav */}
        <div className="p-6 pb-2">
          <div className="flex items-center gap-2 mb-8 text-indigo-600">
            <Database size={28} />
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Insight Vault</h1>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => handleMainNavigation('dashboard')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${activeView === 'dashboard' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
            >
              <Home size={20} />
              Dashboard
            </button>
            <button
              onClick={() => handleMainNavigation('grid')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${activeView === 'grid' && !currentCollectionId ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
            >
              <LayoutGrid size={20} />
              Knowledge Base
            </button>
            <button
              onClick={() => handleMainNavigation('monitoring')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${activeView === 'monitoring' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
            >
              <Activity size={20} />
              Monitoring
            </button>
            <button
              onClick={() => handleMainNavigation('chat')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${activeView === 'chat' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
            >
              <MessageSquare size={20} />
              Assistant
            </button>
          </nav>
        </div>

        {/* Middle Section: Collections (flex-1 pushes bottom section down) */}
        <div className="flex-1 overflow-y-auto px-6 py-4 mt-2">
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Collections</h3>
            <button
              onClick={() => setIsCreatingCollection(true)}
              className="text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 p-1 rounded-md transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="space-y-3">
            {collections.map(col => {
              // Calculate dynamic count
              const realItemCount = cards.filter(c => isCardInCollection(c, col.id)).length;

              return (
                <div
                  key={col.id}
                  onClick={() => handleCollectionClick(col.id)}
                  className={`group relative flex items-start gap-3 p-2 -mx-2 rounded-xl cursor-pointer transition-colors ${currentCollectionId === col.id ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                >
                  <div className="w-10 h-10 rounded-lg bg-gray-200 overflow-hidden flex-shrink-0 border border-gray-200">
                    <img src={col.coverImage} alt={col.name} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <h4 className={`text-sm font-medium truncate leading-tight mb-0.5 ${currentCollectionId === col.id ? 'text-indigo-900' : 'text-gray-700 group-hover:text-gray-900'}`}>
                      {col.name}
                    </h4>
                    <span className="text-[10px] text-gray-400 font-medium">
                      {realItemCount} items
                    </span>
                  </div>

                  {/* More Menu Trigger */}
                  <button
                    className={`absolute right-2 top-3 p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200/50 opacity-0 group-hover:opacity-100 transition-opacity ${activeCollectionMenuId === col.id ? 'opacity-100 bg-gray-200/50' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveCollectionMenuId(activeCollectionMenuId === col.id ? null : col.id);
                    }}
                  >
                    <MoreVertical size={14} />
                  </button>

                  {/* Dropdown Menu */}
                  {activeCollectionMenuId === col.id && (
                    <div className="absolute right-0 top-10 w-32 bg-white rounded-lg shadow-xl border border-gray-100 z-50 py-1 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                      <button
                        onClick={(e) => handleRenameCollection(e, col.id, col.name)}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-indigo-600 flex items-center gap-2"
                      >
                        <Edit2 size={12} /> Rename
                      </button>
                      <button
                        onClick={(e) => handleDeleteCollection(e, col.id)}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 flex items-center gap-2"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {isCreatingCollection ? (
            <div className="mt-4 p-3 border border-indigo-200 bg-indigo-50/50 rounded-xl animate-in fade-in zoom-in-95 duration-200">
              <input
                type="text"
                autoFocus
                placeholder="Album Name"
                className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 mb-2 transition-all"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmCreateCollection();
                  if (e.key === 'Escape') cancelCreateCollection();
                }}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={cancelCreateCollection}
                  className="px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-white hover:text-gray-700 rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmCreateCollection}
                  className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  Create
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsCreatingCollection(true)}
              className="w-full mt-4 flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50/50 transition-all text-sm font-medium">
              <Plus size={16} />
              Create New Album
            </button>
          )}
        </div>

        {/* Bottom Section: User Profile */}
        <div className="p-4 border-t border-gray-100 bg-white">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
              H
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">Hunter</p>
              <p className="text-xs text-gray-500 truncate">Pro Plan</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">

        {/* Header */}
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            <button className="lg:hidden p-2 -ml-2 text-gray-600" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={24} />
            </button>

            {activeView === 'grid' && (
              <div className="relative w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Search vault..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-100 border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 rounded-lg outline-none text-sm transition-all"
                  value={filters.searchQuery}
                  onChange={(e) => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
                />
              </div>
            )}
            {activeView !== 'grid' && (
              <div className="h-10 flex items-center text-lg font-semibold text-gray-700 capitalize">
                {activeView === 'dashboard' ? 'Dashboard' : activeView}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="bg-gray-900 hover:bg-black text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Manual Note</span>
            </button>
          </div>
        </header>

        {/* View Content */}
        <div className="flex-1 overflow-hidden relative">

          {activeView === 'dashboard' && (
            <div className="h-full overflow-y-auto p-6">
              <DashboardView
                tasks={tasks}
                trendingItems={trending}
                onNavigateToMonitoring={() => setActiveView('monitoring')}
                onNavigateToVault={() => handleMainNavigation('grid')}
                onSaveToVault={handleSaveTrendingToVault}
              />
            </div>
          )}

          {activeView === 'monitoring' && (
            <div className="h-full overflow-y-auto p-6">
              <MonitoringView tasks={tasks} onAddTask={handleAddTask} onDeleteTask={handleDeleteTask} />
            </div>
          )}

          {activeView === 'chat' && (
            <div className="h-full overflow-y-auto p-6">
              <ChatView cards={chatScope.cards} contextTitle={chatScope.title} />
            </div>
          )}

          {activeView === 'grid' && (
            <div className="h-full overflow-y-auto p-6">

              {/* Collection Header (if selected) */}
              {currentCollectionId && (
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between bg-white p-4 rounded-xl border border-gray-100 shadow-sm animate-in fade-in slide-in-from-top-2 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600">
                      <Folder size={24} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">{activeCollectionName}</h2>
                      <p className="text-xs text-gray-500">{filteredCards.length} items found</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* CHAT WITH COLLECTION BUTTON */}
                    <button
                      onClick={() => handleChatWithCollection(currentCollectionId)}
                      className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-lg text-xs font-medium hover:bg-amber-100 flex items-center gap-1.5 transition-colors"
                    >
                      <Sparkles size={14} className="text-amber-600" />
                      Chat with Album
                    </button>

                    <div className="w-px h-6 bg-gray-200 mx-1"></div>

                    {/* Batch Management Tools */}
                    {isSelectionMode ? (
                      <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-1">
                        <span className="text-xs font-semibold px-2 text-indigo-600">{selectedCardIds.size} Selected</span>
                        <button
                          onClick={handleRemoveSelectedFromCollection}
                          disabled={selectedCardIds.size === 0}
                          className="px-3 py-1.5 bg-red-100 text-red-600 rounded-md text-xs font-medium hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          <Trash2 size={12} /> Remove
                        </button>
                        <button
                          onClick={() => {
                            setIsSelectionMode(false);
                            setSelectedCardIds(new Set());
                          }}
                          className="px-3 py-1.5 bg-white text-gray-600 rounded-md text-xs font-medium hover:bg-gray-100 border border-gray-200"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={toggleSelectionMode}
                        className="px-3 py-1.5 bg-white text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 flex items-center gap-1"
                      >
                        <CheckSquare size={14} /> Manage Items
                      </button>
                    )}

                    <div className="w-px h-6 bg-gray-200 mx-1"></div>

                    <button
                      onClick={() => setCurrentCollectionId(null)}
                      className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
                      title="Close Collection View"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>
              )}

              {/* Filter Tabs / Main Grid Batch Actions */}
              {!currentCollectionId && (
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <div className="flex flex-wrap items-center gap-2">
                    {POPULAR_TOPICS.map(topic => (
                      <button
                        key={topic}
                        onClick={() => setFilters(prev => ({ ...prev, selectedTopic: topic }))}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${filters.selectedTopic === topic
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                          : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                          }`}
                      >
                        {topic}
                      </button>
                    ))}
                  </div>

                  {/* Main View Batch Actions */}
                  <div className="flex items-center gap-2">
                    {isSelectionMode ? (
                      <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-1">
                        <span className="text-xs font-semibold px-2 text-indigo-600">{selectedCardIds.size} Selected</span>
                        <button
                          onClick={() => setIsAddToCollectionModalOpen(true)}
                          disabled={selectedCardIds.size === 0}
                          className="px-3 py-1.5 bg-indigo-600 text-white rounded-md text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          <FolderPlus size={12} /> Add to Album
                        </button>
                        <button
                          onClick={() => {
                            setIsSelectionMode(false);
                            setSelectedCardIds(new Set());
                          }}
                          className="px-3 py-1.5 bg-white text-gray-600 rounded-md text-xs font-medium hover:bg-gray-100 border border-gray-200"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={toggleSelectionMode}
                        className="px-3 py-1.5 bg-white text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 flex items-center gap-1"
                      >
                        <CheckSquare size={14} /> Manage Items
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Grid */}
              {filteredCards.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-12">
                  {filteredCards.map(card => (
                    <Card
                      key={card.id}
                      card={card}
                      onClick={setSelectedCard}
                      isSelectionMode={isSelectionMode}
                      isSelected={selectedCardIds.has(card.id)}
                      onToggleSelect={toggleCardSelection}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-20">
                  <div className="bg-gray-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                    <Search className="text-gray-400" size={32} />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900">No results found</h3>
                  <p className="text-gray-500 mt-1">
                    {currentCollectionId ? "This collection is empty." : "Try adjusting your search or filters."}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      {selectedCard && (
        <DetailModal
          card={selectedCard}
          allCollections={collections}
          onClose={() => setSelectedCard(null)}
          onUpdate={handleUpdateCard}
        />
      )}

      {isAddModalOpen && (
        <AddContentModal
          onClose={() => setIsAddModalOpen(false)}
          onAdd={handleAddCard}
        />
      )}

      {/* Add To Collection Modal */}
      {isAddToCollectionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsAddToCollectionModalOpen(false)}></div>
          <div className="relative bg-white rounded-xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="font-semibold text-gray-900">Add to Album</h3>
              <button onClick={() => setIsAddToCollectionModalOpen(false)}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
            </div>
            <div className="p-2 max-h-80 overflow-y-auto">
              {collections.length === 0 ? (
                <p className="p-4 text-center text-gray-500 text-sm">No albums created yet.</p>
              ) : (
                collections.map(col => (
                  <button
                    key={col.id}
                    onClick={() => handleBatchAddToCollection(col.id)}
                    className="w-full text-left px-4 py-3 hover:bg-indigo-50 flex items-center gap-3 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gray-200 overflow-hidden flex-shrink-0">
                      <img src={col.coverImage} className="w-full h-full object-cover" alt="" />
                    </div>
                    <span className="font-medium text-gray-700 group-hover:text-indigo-700">{col.name}</span>
                  </button>
                ))
              )}
            </div>
            <div className="p-3 border-t border-gray-100 bg-gray-50/50">
              <button
                onClick={() => {
                  setIsAddToCollectionModalOpen(false);
                  setIsCreatingCollection(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-gray-300 rounded-lg text-gray-500 hover:text-indigo-600 hover:border-indigo-300 hover:bg-white transition-all text-xs font-medium"
              >
                <Plus size={14} /> Create New Album
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;