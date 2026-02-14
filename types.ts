
export enum Platform {
  Twitter = 'Twitter',
  Xiaohongshu = 'Xiaohongshu',
  Manual = 'Manual'
}

export enum ContentType {
  ToolReview = 'ToolReview',
  PromptShare = 'PromptShare',
  PromptCollection = 'PromptCollection'
}

export enum TaskStatus {
  Running = 'Running',
  Completed = 'Completed',
  Pending = 'Pending',
  Failed = 'Failed'
}

export interface EngagementMetrics {
  likes: number;
  bookmarks: number;
  comments: number;
}

export interface AIAnalysis {
  summary: string;
  usageScenarios: string[];
  coreKnowledge: string[];
  extractedPrompts: string[];
}

export interface KnowledgeCard {
  id: string;
  title: string;
  sourceUrl: string;
  platform: Platform;
  author: string;
  date: string;
  coverImage: string;
  metrics: EngagementMetrics;
  contentType: ContentType;
  rawContent: string; // The original text from the post
  aiAnalysis: AIAnalysis;
  tags: string[]; // e.g., "Midjourney", "Claude"
  userNotes?: string; // Markdown supported user notes
  collections?: string[]; // IDs of collections this card belongs to
}

export interface TrackingTask {
  id: string;
  keywords: string;
  platforms: Platform[];
  dateRange: { start: string; end: string };
  status: TaskStatus;
  itemsFound: number;
  lastRun: string;
  config?: {
    sort?: string;
    noteTime?: string;
    noteType?: string;
    minInteraction?: string;
  };
}

export interface Collection {
  id: string;
  name: string;
  coverImage: string;
  itemCount: number;
}

export interface FilterState {
  searchQuery: string;
  selectedTopic: string;
}

export interface SocialSearchResult {
  noteId: string;
  title: string;
  desc: string;
  author: string;
  authorAvatar: string;
  coverImage: string;
  images: string[];
  metrics: {
    likes: number;
    bookmarks: number;
    comments: number;
    shares: number;
  };
  publishTime: string;
  xsecToken?: string;
  sourceUrl: string;
  platform: Platform;
}

export interface TrustedAccount {
  id: string;
  platform: string; // 'twitter' | 'xiaohongshu'
  handle: string; // without @
  category: string; // 'image_gen' | 'video_gen' | 'vibe_coding'
  notes: string;
  createdAt?: string;
}

export interface QualityKeyword {
  id: string;
  keyword: string;
  type: 'positive' | 'blacklist';
  createdAt?: string;
}

export interface MonitorSettings {
  minEngagement: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isThinking?: boolean;
}
