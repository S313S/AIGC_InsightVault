
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
  suggestedTitle?: string;
  toolTags?: string[];
}

export interface KnowledgeCard {
  id: string;
  ownerId?: string;
  isPublic?: boolean;
  title: string;
  sourceUrl: string;
  platform: Platform;
  author: string;
  date: string;
  coverImage: string;
  images?: string[];
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
  ownerId?: string;
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
  ownerId?: string;
  isPublic?: boolean;
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
  coverImageSource?: string;
  tags?: string[];
}

export interface TrustedAccount {
  id: string;
  ownerId?: string;
  platform: string; // 'twitter' | 'xiaohongshu'
  handle: string; // without @
  category: string; // 'image_gen' | 'video_gen' | 'vibe_coding'
  notes: string;
  createdAt?: string;
}

export interface QualityKeyword {
  id: string;
  ownerId?: string;
  keyword: string;
  type: 'positive' | 'blacklist';
  createdAt?: string;
}

export interface MonitorSettings {
  minEngagement: number;
  trustedMinEngagement: number;
  splitKeywords: boolean;
  autoUpdateEnabled: boolean;
}

export interface CronRunLog {
  id: string;
  ownerId?: string;
  createdAt?: string;
  triggerSource: string;
  requestMethod: string;
  requestUrl: string;
  queryParams: Record<string, any>;
  effectiveParams: Record<string, any>;
  keywordExecution: Record<string, any>;
  apiCallTrace: any[];
  apiCallsSummary: Record<string, any>;
  funnel: Record<string, any>;
  platformFunnel: Record<string, any>;
  platformStats: any[];
  platformTotals: Record<string, any>;
  platformErrors: any[];
  resultSummary: Record<string, any>;
  runtimeMs: number;
  runtimeGuardTriggered: boolean;
  success: boolean;
  errorMessage?: string | null;
}

export interface XhsTokenConfig {
  ownerId?: string;
  noteId: string;
  xsecToken: string;
  xsecSource?: string;
  updatedAt?: string;
}

export interface XhsMissingTokenItem {
  id: string;
  noteId: string;
  title: string;
  author: string;
  date: string;
  sourceUrl: string;
  from: 'trending' | 'vault';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isThinking?: boolean;
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
}

export interface AuthResult {
  ok: boolean;
  error?: string;
  user?: AuthUser;
}
