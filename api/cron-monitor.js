// Vercel Cron: periodic social monitoring and trending ingestion

import { createClient } from '@supabase/supabase-js';

// Search keywords: high-volume terms covering all 3 categories (used for API searches)
const DEFAULT_MONITOR_KEYWORDS = [
  // Core AI terms
  'AI', 'AIGC', '人工智能', '大模型',
  // Image Gen - high-volume search terms
  'Midjourney', 'AI绘画', 'Stable Diffusion', 'AI绘图',
  // Video Gen - high-volume search terms
  '可灵', 'Sora', 'AI视频', 'Runway', '即梦',
  // Vibe Coding - high-volume search terms
  'Claude Code', 'Cursor', 'Vibe Coding', 'AI编程'
];
const DEFAULT_PLATFORMS = ['xiaohongshu', 'twitter'];
const DEFAULT_LIMIT = 10;
const DEFAULT_MIN_INTERACTION = 500;
const DEFAULT_TRUSTED_MIN_INTERACTION = 1000;
const RECENT_DAYS = 3;
const TWITTER_RECENT_DAYS = 7;
const MAX_TASKS_PER_RUN = 3;
const XHS_DELAY_MS = 1000;
const XHS_RETRIES = 2;
const TWITTER_REQUIRE_TERMS = ['Claude', 'GPT', 'LLM', 'OpenAI', 'Anthropic', 'Gemini'];
const SOFT_TIMEOUT_GUARD_MS = 260000;
const HIGH_ENGAGEMENT_QUALITY_BYPASS = 5000;
const FALLBACK_COVER_POOL_SIZE = 100;
const FALLBACK_COVER_BASE_PATH = '/fallback-covers';
const QUALITY_FALLBACK_POSITIVE = [
  'tutorial', 'workflow', 'tips', 'how to', 'step by step', 'guide', 'setup', 'build',
  'prompt engineering', 'use case', 'demo', 'walkthrough', 'comparison', 'review',
  'best practices', 'toolchain', 'deep dive',
  'release', 'upgrade', 'launch',
  '教程', '实操', '工作流', '技巧', '分享', '经验', '玩法', '用法', '攻略', '测评',
  '对比', '上手', '指南', '保姆级', '干货', '实战', '案例',
  '发布', '升级', '重大更新'
];
const QUALITY_FALLBACK_BLACKLIST = [
  'hiring', 'giveaway', 'breaking news', 'subscribe', 'follow me',
  'sponsored', 'ad', 'promotion', 'discount', 'coupon',
  '招聘', '抽奖', '转发抽', '广告', '优惠', '打折', '求职', '招人'
];

// Expanded AI keyword pool for better coverage (from research on Twitter/X and Xiaohongshu trends)
const AI_KEYWORDS = [
  // === Core AI Terms ===
  'ai', 'a.i.', '人工智能', '大模型', 'llm', 'gpt', 'claude', 'openai', 'anthropic', 'gemini', 'deepseek',
  'chatbot', 'agent', 'prompt', '模型', '算法', '训练', '推理', '生成',

  // === Image Gen - Tools (EN) ===
  'midjourney', 'mj', 'stable diffusion', 'sd', 'sdxl', 'comfyui', 'flux', 'krea',
  'dall-e', 'dalle', 'leonardo', 'firefly', 'ideogram', 'playground',
  'lora', 'controlnet', 'nijijourney', 'synthography',
  // Image Gen - Hashtags (EN)
  'aiart', 'aiartcommunity', 'aiartist', 'generativeart', 'promptshare', 'aigeneratedart',
  // Image Gen - Chinese
  'ai绘画', 'ai绘图', 'ai生图', 'ai头像', 'ai壁纸', 'ai海报', '文生图', '图生图',
  'ai写真', 'ai换脸', '治愈系插画', '国潮插画', '妙鸭', '此刻', 'trik',

  // === Video Gen - Tools (EN) ===
  'runway', 'gen-3', 'gen3', 'sora', 'veo', 'veo3', 'pika', 'luma',
  'haiper', 'hailuo', 'minimax', 'ray2', 'stability video',
  // Video Gen - Hashtags (EN)
  'aivideo', 'videogeneration', 'textovideo',
  // Video Gen - Chinese
  'kling', '可灵', '即梦', '海螺', 'pixverse', '混元视频',
  'ai视频', 'ai生成视频', '文生视频', '图生视频', 'ai动画', 'ai短片', 'ai特效', '一键生成视频',

  // === Vibe Coding - Tools (EN) ===
  'cursor', 'claude code', 'vibe coding', 'copilot', 'codex', 'replit',
  'windsurf', 'aider', 'codeium', 'tabnine', 'v0', 'bolt', 'lovable', 'devin', 'continue', 'cody',
  // Vibe Coding - Hashtags (EN)
  'vibecoding', 'aicoding', 'aicode', 'codingwithai',
  // Vibe Coding - Chinese
  'marscode', '通义灵码', 'codegeex',
  'ai编程', 'ai写代码', 'ai开发', 'ai工程师', '一人公司', 'ai超级个体', '独立开发者', '零代码'
];

const isAIRelevant = (text) => {
  const t = (text || '').toLowerCase();
  return AI_KEYWORDS.some(k => t.includes(k));
};

const inferCategoryTag = (text) => {
  if (!isAIRelevant(text)) return '';
  const t = (text || '').toLowerCase();

  // === Image Gen Keywords (Complete) ===
  const imageKeywords = [
    // Core terms
    'image', 'img', 'photo', 'picture', '图', '图片', '绘画', '生图', '海报', '头像', '壁纸', '写真',
    // Tools (EN)
    'midjourney', 'mj', 'stable diffusion', 'sd', 'sdxl', 'comfyui', 'flux', 'krea',
    'dall-e', 'dalle', 'leonardo', 'firefly', 'ideogram', 'playground',
    // Techniques
    'lora', 'controlnet', 'prompt', '风格化', '修图', '上色', 'nijijourney', 'synthography',
    // Hashtags (EN)
    'aiart', 'aiartcommunity', 'aiartist', 'generativeart', 'promptshare', 'aigeneratedart',
    'midjourneyart', 'midjourneyai', 'stablediffusionart',
    // Chinese specific
    'ai绘画', 'ai绘图', 'ai生图', 'ai头像', 'ai壁纸', 'ai海报', '文生图', '图生图', 'ai写真', 'ai换脸',
    '治愈系插画', '国潮插画', '妙鸭', '此刻', 'trik', '莫兰迪色'
  ];

  // === Video Gen Keywords (Complete) ===
  const videoKeywords = [
    // Core terms
    'video', '视频', 'animation', '动画', '短片', '剪辑', '镜头', '特效',
    // Tools (EN)
    'runway', 'runwaygen3', 'runwayml', 'gen-3', 'gen3', 'sora', 'openaisora', 'veo', 'veo3',
    'pika', 'pikalabs', 'luma', 'lumadream', 'haiper', 'hailuo', 'minimax', 'ray2', 'stability video',
    // Hashtags (EN)
    'aivideo', 'videogeneration', 'textovideo', 'klingai',
    // Tools & Terms (CN)
    'kling', '可灵', '即梦', '海螺', 'pixverse', '混元视频',
    'ai视频', 'ai生成视频', '文生视频', '图生视频', 'ai动画', 'ai短片', 'ai特效', '一键生成视频'
  ];

  // === Vibe Coding Keywords (Complete) ===
  const vibeKeywords = [
    // Core terms
    'code', 'coding', '程序', '编程', '开发', '工程', 'repo', 'github', 'git',
    // Tools (EN)
    'cursor', 'cursorai', 'claude code', 'vibe coding', 'copilot', 'githubcopilot',
    'codex', 'openaicodex', 'replit', 'replitagent', 'windsurf', 'aider', 'codeium', 'tabnine',
    'v0', 'v0dev', 'bolt', 'lovable', 'devin', 'continue', 'cody',
    // Hashtags (EN)
    'vibecoding', 'aicoding', 'aicode', 'codingwithai',
    // Tools (CN)
    'marscode', '通义灵码', 'codegeex',
    // IDE & Environment
    'vscode', 'ide', 'terminal', 'cli',
    // Concepts
    'agent', 'workflow', '自动化', '前端', '后端', 'python', 'node', 'typescript', 'react', 'prompt engineering',
    // Chinese specific
    'ai编程', 'ai写代码', 'ai开发', 'ai工程师', '一人公司', 'ai超级个体', '独立开发者', '零代码'
  ];

  const hasAny = (arr) => arr.some((k) => t.includes(k));
  if (hasAny(imageKeywords)) return 'Image Gen';
  if (hasAny(videoKeywords)) return 'Video Gen';
  if (hasAny(vibeKeywords)) return 'Vibe Coding';
  return '';
};

const parsePublishTime = (dateStr) => {
  if (!dateStr) return null;
  const now = new Date();
  if (dateStr === '刚刚') return now;

  const minsMatch = dateStr.match(/(\d+)\s*分钟/);
  if (minsMatch) return new Date(now.getTime() - Number(minsMatch[1]) * 60 * 1000);

  const hoursMatch = dateStr.match(/(\d+)\s*小时/);
  if (hoursMatch) return new Date(now.getTime() - Number(hoursMatch[1]) * 60 * 60 * 1000);

  const daysMatch = dateStr.match(/(\d+)\s*天/);
  if (daysMatch) return new Date(now.getTime() - Number(daysMatch[1]) * 24 * 60 * 60 * 1000);

  const iso = new Date(dateStr);
  if (!Number.isNaN(iso.getTime())) return iso;

  const ymd = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    return new Date(`${ymd[1]}-${ymd[2]}-${ymd[3]}T00:00:00`);
  }

  const md = dateStr.match(/^(\d{2})-(\d{2})$/);
  if (md) {
    const year = now.getFullYear();
    let dt = new Date(`${year}-${md[1]}-${md[2]}T00:00:00`);
    if (dt.getTime() - now.getTime() > 24 * 60 * 60 * 1000) {
      dt = new Date(`${year - 1}-${md[1]}-${md[2]}T00:00:00`);
    }
    return dt;
  }

  const mdCn = dateStr.match(/(\d{1,2})月(\d{1,2})日/);
  if (mdCn) {
    const year = now.getFullYear();
    let dt = new Date(`${year}-${String(mdCn[1]).padStart(2, '0')}-${String(mdCn[2]).padStart(2, '0')}T00:00:00`);
    if (dt.getTime() - now.getTime() > 24 * 60 * 60 * 1000) {
      dt = new Date(`${year - 1}-${String(mdCn[1]).padStart(2, '0')}-${String(mdCn[2]).padStart(2, '0')}T00:00:00`);
    }
    return dt;
  }

  return null;
};

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const isRecentEnough = (dateStr, windowDays = RECENT_DAYS) => {
  const dt = parsePublishTime(dateStr);
  if (!dt) return true;
  const now = new Date();
  const diffDays = (now.getTime() - dt.getTime()) / (24 * 60 * 60 * 1000);
  return diffDays <= windowDays;
};

const computeInteraction = (item) => {
  if (!item) return 0;
  if (item.platform === 'Twitter') {
    const raw = item.metricsRaw || {};
    const likes = toNumber(raw.like_count ?? item.metrics?.likes);
    const comments = toNumber(raw.reply_count ?? item.metrics?.comments);
    return likes + comments;
  }
  // Xiaohongshu + others: keep same metric rule (likes + comments)
  return toNumber(item.metrics?.likes) + toNumber(item.metrics?.comments);
};

const passesQualityFilter = (item, positiveKeywords, blacklistKeywords) => {
  const text = `${item?.title || ''} ${item?.desc || ''}`.toLowerCase();
  const blacklist = (blacklistKeywords || []).map(k => String(k || '').toLowerCase()).filter(Boolean);
  const positive = (positiveKeywords || []).map(k => String(k || '').toLowerCase()).filter(Boolean);

  const isBlacklisted = blacklist.some(kw => text.includes(kw));
  if (isBlacklisted) return false;

  if (item?._fromTrustedAccount) return true;

  if (positive.length === 0) return true;
  return positive.some(kw => text.includes(kw));
};

const buildTrendingRow = (result, snapshotTag) => {
  const baseText = result.desc || result.title || '';
  const summary = baseText
    ? (baseText.length > 160 ? baseText.slice(0, 160) + '...' : baseText)
    : '暂无摘要';
  const extractedTags = (result.desc || '').match(/#[^\s#]+/g)?.map(t => t.slice(1)) || [];
  const category = inferCategoryTag(baseText);
  const tags = category ? Array.from(new Set([category, ...extractedTags])) : extractedTags;
  const tagsWithSnapshot = snapshotTag ? Array.from(new Set([...tags, snapshotTag])) : tags;

  return {
    title: result.title || (result.desc ? result.desc.slice(0, 40) : '') || '无标题',
    source_url: result.sourceUrl,
    platform: result.platform,
    author: result.author,
    date: result.publishTime || '',
    cover_image: result.coverImage || (result.images && result.images[0]) || '',
    metrics: result.metrics || { likes: 0, bookmarks: 0, comments: 0 },
    content_type: 'PromptShare',
    raw_content: result.desc || '',
    ai_analysis: {
      summary,
      usageScenarios: [],
      coreKnowledge: [],
      extractedPrompts: []
    },
    tags: tagsWithSnapshot,
    user_notes: '',
    collections: [],
    is_trending: true,
  };
};

const normalizeSourceUrl = (url) => {
  if (!url) return '';
  return url.split('?')[0].trim();
};

const hashSeed = (value) => {
  const input = String(value || '');
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const getFallbackCoverPath = (seed) => {
  const index = (hashSeed(seed) % FALLBACK_COVER_POOL_SIZE) + 1;
  return `${FALLBACK_COVER_BASE_PATH}/cover-${String(index).padStart(3, '0')}.svg`;
};

const isFallbackCoverPath = (url) => String(url || '').includes(`${FALLBACK_COVER_BASE_PATH}/cover-`);

const getSupabaseClient = () => {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
};

const API_BASE_XHS = 'https://api.justoneapi.com';
const API_BASE_TIKHUB = 'https://api.tikhub.io';
const TIKHUB_SEARCH_PATH_DEFAULT = '/api/v1/xiaohongshu/web_v2/fetch_search_notes';
const DEFAULT_TIMEOUT_MS = 15000;

const buildXhsImageUrl = (fileid) => {
  if (!fileid) return '';
  return `https://sns-img-bd.xhscdn.com/${fileid}?imageView2/2/w/660/format/jpg/q/75`;
};

const convertToJpg = (url) => (url || '').replaceAll('format/heif', 'format/jpg');

const extractCoverUrl = (cover) => {
  if (!cover) return '';
  if (typeof cover === 'string') return convertToJpg(cover);
  if (cover.fileid) return buildXhsImageUrl(cover.fileid);
  const url = cover.url_size_large || cover.url || cover.url_default || cover.url_pre || cover.url_original;
  return convertToJpg(url || '');
};

const mapSearchResult = (note) => {
  const publishTimeTag = note.corner_tag_info?.find(tag => tag.type === 'publish_time');
  const coverFromNote = extractCoverUrl(note.cover);
  const coverIndex = Number.isFinite(Number(note.cover_image_index)) ? Number(note.cover_image_index) : 0;
  const coverImg = note.images_list?.[coverIndex] || note.images_list?.[0];
  const coverFromImages = coverImg?.fileid
    ? buildXhsImageUrl(coverImg.fileid)
    : convertToJpg(coverImg?.url_size_large || coverImg?.url || '');
  const coverImage = coverFromNote || coverFromImages;

  const images = (note.images_list || [])
    .map(img => {
      if (img.fileid) return buildXhsImageUrl(img.fileid);
      return convertToJpg(img.url_size_large || img.url);
    })
    .filter(Boolean);

  return {
    noteId: note.id,
    title: note.title || '',
    desc: note.desc || '',
    author: note.user?.nickname || '',
    authorAvatar: note.user?.images || '',
    coverImage,
    images,
    metrics: {
      likes: note.liked_count || 0,
      bookmarks: note.collected_count || 0,
      comments: note.comments_count || 0,
      shares: note.shared_count || 0,
    },
    publishTime: publishTimeTag?.text || '',
    xsecToken: note.xsec_token || '',
    platform: 'Xiaohongshu',
    sourceUrl: `https://www.xiaohongshu.com/discovery/item/${note.id}?xsec_token=${encodeURIComponent(note.xsec_token || '')}`,
  };
};

const mapTwitterSearchResult = (tweet, userById, mediaByKey) => {
  const user = userById.get(tweet.author_id) || {};
  const mediaKeys = tweet.attachments?.media_keys || [];
  const images = mediaKeys
    .map(key => mediaByKey.get(key))
    .filter(m => m && (m.type === 'photo' || m.type === 'animated_gif' || m.type === 'video'))
    .map(m => m.url || m.preview_image_url)
    .filter(Boolean);

  const sourceUrl = user.username
    ? `https://twitter.com/${user.username}/status/${tweet.id}`
    : `https://twitter.com/i/web/status/${tweet.id}`;
  const coverImage = images[0] || getFallbackCoverPath(sourceUrl || tweet.id || user.username || '');

  return {
    noteId: tweet.id,
    title: '',
    desc: tweet.text || '',
    author: user.username || user.name || '',
    authorAvatar: user.profile_image_url || '',
    coverImage,
    images,
    metrics: {
      likes: tweet.public_metrics?.like_count || 0,
      bookmarks: tweet.public_metrics?.bookmark_count || 0,
      comments: tweet.public_metrics?.reply_count || 0,
      shares: tweet.public_metrics?.retweet_count || 0,
      quotes: tweet.public_metrics?.quote_count || 0,
    },
    metricsRaw: tweet.public_metrics || {},
    publishTime: tweet.created_at || '',
    xsecToken: '',
    platform: 'Twitter',
    sourceUrl,
  };
};

const fetchJson = async (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = await response.json();
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const parseMaybeJson = (value) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const extractTikhubSearchNotes = (payload) => {
  const wrapper = parseMaybeJson(payload?.data);
  if (!wrapper || typeof wrapper !== 'object') return [];

  const candidates = [
    wrapper?.items,
    wrapper?.data?.items,
    wrapper?.notes,
    wrapper?.note_list,
    wrapper?.feeds
  ];
  const list = candidates.find(Array.isArray) || [];

  return list
    .map((item) => (item && typeof item === 'object' && item.note ? item.note : item))
    .filter((note) => note && typeof note === 'object' && note.id);
};

const searchXiaohongshuViaJustOne = async (keyword, page, sort, noteType, noteTime, token, limit, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  let url = `${API_BASE_XHS}/api/xiaohongshu/search-note/v2?token=${token}&keyword=${encodeURIComponent(keyword)}&page=${page}&sort=${sort}&noteType=${noteType}`;
  if (noteTime) {
    url += `&noteTime=${encodeURIComponent(noteTime)}`;
  }

  const { data } = await fetchJson(url, {}, timeoutMs);

  if (data.code !== 0) {
    throw new Error(data.message || `Search API error (code: ${data.code})`);
  }

  const items = data.data?.items || [];
  let notes = items
    .filter(item => item.model_type === 'note' && item.note)
    .map(item => mapSearchResult(item.note));

  if (limit && Number.isFinite(Number(limit))) {
    notes = notes.slice(0, Number(limit));
  }

  return notes;
};

const searchXiaohongshuViaTikhub = async (keyword, page, sort, noteType, noteTime, token, limit, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const params = new URLSearchParams({
    keyword: String(keyword || ''),
    page: String(page || 1),
    sort: String(sort || 'general'),
    noteType: String(noteType || '_0')
  });
  if (noteTime) params.set('noteTime', String(noteTime));

  const path = process.env.TIKHUB_XHS_SEARCH_PATH || TIKHUB_SEARCH_PATH_DEFAULT;
  const endpoint = `${API_BASE_TIKHUB}${path}?${params.toString()}`;

  const { response, data } = await fetchJson(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  }, timeoutMs);
  if (!response.ok) {
    throw new Error(data?.message_zh || data?.message || `TikHub API error: ${response.status}`);
  }
  if (data?.code !== 200) {
    throw new Error(data?.message_zh || data?.message || `TikHub API error (code: ${data?.code})`);
  }

  let notes = extractTikhubSearchNotes(data).map(mapSearchResult);
  if (limit && Number.isFinite(Number(limit))) {
    notes = notes.slice(0, Number(limit));
  }
  return notes;
};

const searchXiaohongshu = async (keyword, page, sort, noteType, noteTime, options) => {
  const { justOneToken, tikhubToken, limit, timeoutMs = DEFAULT_TIMEOUT_MS } = options || {};
  const preferredProvider = String(process.env.XHS_SEARCH_PROVIDER || 'auto').toLowerCase();
  const providers = [];
  if (preferredProvider === 'tikhub') {
    if (tikhubToken) providers.push('tikhub');
    if (justOneToken) providers.push('justone');
  } else if (preferredProvider === 'justone') {
    if (justOneToken) providers.push('justone');
    if (tikhubToken) providers.push('tikhub');
  } else {
    if (justOneToken) providers.push('justone');
    if (tikhubToken) providers.push('tikhub');
  }

  let lastErr = null;
  for (const provider of providers) {
    try {
      if (provider === 'justone') {
        return await searchXiaohongshuViaJustOne(keyword, page, sort, noteType, noteTime, justOneToken, limit, timeoutMs);
      }
      if (provider === 'tikhub') {
        return await searchXiaohongshuViaTikhub(keyword, page, sort, noteType, noteTime, tikhubToken, limit, timeoutMs);
      }
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('All Xiaohongshu providers failed');
};

const buildTwitterQuery = (keywords, opts) => {
  const safe = keywords
    .filter(Boolean)
    .map(k => `"${k.replace(/"/g, '')}"`);
  const orQuery = safe.length > 0 ? `(${safe.join(' OR ')})` : '';

  const requireTerms = opts?.requireTerms || [];
  const requireQuery = requireTerms.length > 0
    ? `(${requireTerms.map(t => `"${t.replace(/"/g, '')}"`).join(' OR ')})`
    : '';

  const pieces = [orQuery, requireQuery, 'has:media', '-is:retweet', '-is:reply'].filter(Boolean);
  return pieces.join(' ').trim();
};

const searchTwitterByQuery = async (query, limit, bearerToken, sortOrder = 'relevancy') => {
  const maxResults = Math.min(Math.max(Number(limit) || 20, 10), 100);
  const endpoint = `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=${maxResults}&sort_order=${encodeURIComponent(sortOrder)}&tweet.fields=created_at,public_metrics,author_id,attachments&expansions=author_id,attachments.media_keys&user.fields=username,name,profile_image_url&media.fields=type,url,preview_image_url`;

  const { response, data } = await fetchJson(endpoint, {
    headers: {
      'Authorization': `Bearer ${bearerToken}`
    }
  });
  if (!response.ok || data.errors) {
    const message = data.errors?.[0]?.message || `X API error: ${response.status}`;
    throw new Error(message);
  }

  const tweets = data.data || [];
  const users = data.includes?.users || [];
  const media = data.includes?.media || [];

  const userById = new Map(users.map(u => [u.id, u]));
  const mediaByKey = new Map(media.map(m => [m.media_key, m]));

  return tweets.map(tweet => mapTwitterSearchResult(tweet, userById, mediaByKey));
};

const searchTwitter = async (keywordsOrKeyword, limit, bearerToken, queryOpts) => {
  const keywords = Array.isArray(keywordsOrKeyword) ? keywordsOrKeyword : [keywordsOrKeyword];
  const query = buildTwitterQuery(keywords, queryOpts);
  return searchTwitterByQuery(query, limit, bearerToken, 'relevancy');
};

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const host = req.headers?.host || 'localhost';
  const requestUrl = new URL(req.url || '/', `https://${host}`);
  const getQueryParam = (key) => requestUrl.searchParams.get(key);

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const token = req.headers['x-cron-secret'] || getQueryParam('token');
    if (token !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    const runStartedAt = Date.now();
    const isNearTimeout = () => (Date.now() - runStartedAt) >= SOFT_TIMEOUT_GUARD_MS;

    const overrideDays = Number(getQueryParam('days'));
    const overrideTwitterDays = Number(getQueryParam('twitter_days'));
    const overrideMin = Number(getQueryParam('min'));
    const overrideTrustedMin = Number(getQueryParam('trusted_min'));
    const overrideLimit = Number(getQueryParam('limit'));
    const overrideTasks = Number(getQueryParam('tasks'));
    const overrideParallel = String(getQueryParam('parallel') || '').toLowerCase();
    const overrideSplit = String(getQueryParam('split') || '').toLowerCase();
    const hasOverrideSplit = overrideSplit !== '';
    const overridePlatform = String(getQueryParam('platform') || '').toLowerCase();
    const rebuildRaw = String(getQueryParam('rebuild') || '').toLowerCase();
    const rebuildOnly = rebuildRaw === '1' || rebuildRaw === 'true';

    const effectiveRecentDays = Number.isFinite(overrideDays) && overrideDays > 0 ? overrideDays : RECENT_DAYS;
    const effectiveTwitterDays = Number.isFinite(overrideTwitterDays) && overrideTwitterDays > 0 ? overrideTwitterDays : TWITTER_RECENT_DAYS;
    let effectiveMinInteraction = Number.isFinite(overrideMin) && overrideMin >= 0 ? overrideMin : DEFAULT_MIN_INTERACTION;
    let effectiveTrustedMinInteraction = Number.isFinite(overrideTrustedMin) && overrideTrustedMin >= 0
      ? overrideTrustedMin
      : DEFAULT_TRUSTED_MIN_INTERACTION;
    const effectiveLimit = Number.isFinite(overrideLimit) && overrideLimit > 0 ? overrideLimit : DEFAULT_LIMIT;
    const effectiveMaxTasks = Number.isFinite(overrideTasks) && overrideTasks > 0 ? overrideTasks : MAX_TASKS_PER_RUN;
    const parallel = overrideParallel === '1' || overrideParallel === 'true';
    let effectiveSplit = overrideSplit === '1' || overrideSplit === 'true';
    const effectivePlatforms = overridePlatform === 'twitter'
      ? ['twitter']
      : overridePlatform === 'xiaohongshu' || overridePlatform === 'xhs'
        ? ['xiaohongshu']
        : DEFAULT_PLATFORMS;
    const justOneToken = process.env.JUSTONEAPI_TOKEN;
    const tikhubToken = process.env.TIKHUB_API_TOKEN;
    const xBearerToken = process.env.X_API_BEARER_TOKEN;

    if (rebuildOnly) {
      const snapshotId = new Date().toISOString();
      const snapshotTag = `snapshot:${snapshotId}`;

      const { data: trendRows, error: trendError } = await supabase
        .from('knowledge_cards')
        .select('id, tags')
        .eq('is_trending', true);

      if (trendError) {
        throw new Error(trendError.message || 'Failed to load trending cards');
      }

      let updatedExisting = 0;
      for (const row of trendRows || []) {
        const tags = Array.isArray(row.tags) ? row.tags : [];
        const mergedTags = tags.includes(snapshotTag)
          ? tags
          : Array.from(new Set([...tags, snapshotTag]));
        const { error: updateError } = await supabase
          .from('knowledge_cards')
          .update({ tags: mergedTags, is_trending: true })
          .eq('id', row.id);
        if (updateError) {
          throw new Error(updateError.message || 'Failed to update trending snapshot tags');
        }
        updatedExisting += 1;
      }

      // Keep only the latest 5 snapshots (re-read to include the new snapshot tag)
      const { data: refreshedRows, error: refreshError } = await supabase
        .from('knowledge_cards')
        .select('id, tags')
        .eq('is_trending', true);

      if (refreshError) {
        throw new Error(refreshError.message || 'Failed to reload trending cards');
      }

      const snapshotToIds = new Map();
      for (const row of refreshedRows || []) {
        const tags = Array.isArray(row.tags) ? row.tags : [];
        const snap = tags.find(t => typeof t === 'string' && t.startsWith('snapshot:')) || 'snapshot:legacy';
        if (!snapshotToIds.has(snap)) snapshotToIds.set(snap, []);
        snapshotToIds.get(snap).push(row.id);
      }
      const snapshots = Array.from(snapshotToIds.keys()).sort((a, b) => {
        if (a === 'snapshot:legacy') return 1;
        if (b === 'snapshot:legacy') return -1;
        return a > b ? -1 : a < b ? 1 : 0;
      });
      const keep = new Set(snapshots.slice(0, 5));
      const idsToDelete = [];
      for (const [snap, ids] of snapshotToIds.entries()) {
        if (!keep.has(snap)) idsToDelete.push(...ids);
      }
      if (idsToDelete.length > 0) {
        const { error: cleanupError } = await supabase
          .from('knowledge_cards')
          .delete()
          .in('id', idsToDelete);
        if (cleanupError) {
          throw new Error(cleanupError.message || 'Failed to cleanup old snapshots');
        }
      }

      return res.status(200).json({
        mode: 'rebuild',
        updatedExisting,
        totalTrending: (refreshedRows || []).length,
        snapshot: snapshotTag
      });
    }

    if ((!justOneToken && !tikhubToken) && !xBearerToken) {
      return res.status(500).json({ error: 'No upstream API tokens configured' });
    }

    const { data: settingRows, error: settingsError } = await supabase
      .from('monitor_settings')
      .select('key, value')
      .in('key', ['min_engagement', 'trusted_min_engagement', 'split_keywords', 'twitter_split_keywords']);
    if (settingsError) {
      console.warn('[cron-monitor] failed to read monitor_settings:', settingsError.message || settingsError);
    }
    const settingsMap = new Map((settingRows || []).map((row) => [row.key, row.value]));
    const dbMinRaw = Number(settingsMap.get('min_engagement'));
    const dbTrustedMinRaw = Number(settingsMap.get('trusted_min_engagement'));
    const dbSplitRaw = String(settingsMap.get('split_keywords') || settingsMap.get('twitter_split_keywords') || '').toLowerCase();
    if (!(Number.isFinite(overrideMin) && overrideMin >= 0)) {
      effectiveMinInteraction = Number.isFinite(dbMinRaw) && dbMinRaw >= 0
        ? dbMinRaw
        : DEFAULT_MIN_INTERACTION;
    }
    if (!(Number.isFinite(overrideTrustedMin) && overrideTrustedMin >= 0)) {
      effectiveTrustedMinInteraction = Number.isFinite(dbTrustedMinRaw) && dbTrustedMinRaw >= 0
        ? dbTrustedMinRaw
        : DEFAULT_TRUSTED_MIN_INTERACTION;
    }
    if (!hasOverrideSplit) {
      effectiveSplit = dbSplitRaw === '1' || dbSplitRaw === 'true';
    }

    const { data: keywordRows, error: keywordError } = await supabase
      .from('quality_keywords')
      .select('keyword, type');
    if (keywordError) {
      console.warn('[cron-monitor] failed to read quality_keywords:', keywordError.message || keywordError);
    }
    const positiveKeywords = (keywordRows || [])
      .filter(k => k?.type === 'positive' && k?.keyword)
      .map(k => String(k.keyword).trim())
      .filter(Boolean);
    const blacklistKeywords = (keywordRows || [])
      .filter(k => k?.type === 'blacklist' && k?.keyword)
      .map(k => String(k.keyword).trim())
      .filter(Boolean);
    const effectivePositiveKeywords = positiveKeywords.length > 0 ? positiveKeywords : QUALITY_FALLBACK_POSITIVE;
    const effectiveBlacklistKeywords = blacklistKeywords.length > 0 ? blacklistKeywords : QUALITY_FALLBACK_BLACKLIST;

    const { data: trustedRows, error: trustedError } = await supabase
      .from('trusted_accounts')
      .select('handle, platform')
      .eq('platform', 'twitter');
    if (trustedError) {
      console.warn('[cron-monitor] failed to read trusted_accounts:', trustedError.message || trustedError);
    }
    const trustedHandles = (trustedRows || [])
      .map(row => String(row?.handle || '').replace(/^@+/, '').trim().toLowerCase())
      .filter(Boolean);
    const trustedHandleSet = new Set(trustedHandles);

    // Fixed keyword-pool mode: always run against DEFAULT_MONITOR_KEYWORDS
    const keywordJobs = DEFAULT_MONITOR_KEYWORDS.map(keyword => ({
      keyword,
      platforms: effectivePlatforms
    }));
    const tasksToRun = effectiveSplit ? keywordJobs : keywordJobs.slice(0, effectiveMaxTasks);
    const twitterKeywordPool = DEFAULT_MONITOR_KEYWORDS.slice(0, effectiveMaxTasks);
    const twitterSplitKeywordPool = [...DEFAULT_MONITOR_KEYWORDS];
    const twitterQueryOpts = {
      requireTerms: TWITTER_REQUIRE_TERMS
    };

    const allResults = [];
    const platformStats = [];
    const platformErrors = [];
    const platformTotals = {
      twitter: { fetched: 0, output: 0 },
      xiaohongshu: { fetched: 0, output: 0 }
    };
    const platformFunnel = {
      twitter: { fetched: 0, afterMinInteraction: 0, afterRecent: 0, afterAI: 0, afterQuality: 0 },
      xiaohongshu: { fetched: 0, afterMinInteraction: 0, afterRecent: 0, afterAI: 0, afterQuality: 0 }
    };
    const twitterSamples = [];
    const funnel = {
      fetched: 0,
      afterMinInteraction: 0,
      afterRecent: 0,
      afterAI: 0,
      afterQuality: 0,
      candidates: 0
    };
    const engagementDebug = [];
    let runtimeGuardTriggered = false;
    const snapshotId = new Date().toISOString();
    const snapshotTag = `snapshot:${snapshotId}`;
    const updatedTasks = [];

    let twitterQueried = false;
    let trustedQueryRan = false;

    for (const task of tasksToRun) {
      if (isNearTimeout()) {
        runtimeGuardTriggered = true;
        console.warn('[cron-monitor] runtime guard triggered before processing all tasks');
        break;
      }
      const platforms = (task.platforms && task.platforms.length > 0) ? task.platforms : DEFAULT_PLATFORMS;
      const runOne = async (p) => {
        const platformName = p === 'Twitter' || p === 'twitter' ? 'twitter' : 'xiaohongshu';
        try {
          if (platformName === 'twitter') {
            if (twitterQueried) {
              return [];
            }
            if (!xBearerToken) {
              platformErrors.push({ platform: 'twitter', error: 'X API Bearer Token not configured' });
              return [];
            }
            let keywordResults = [];
            if (effectiveSplit) {
              const runKeywordSearch = async (keyword) => {
                try {
                  return await searchTwitter([keyword], effectiveLimit, xBearerToken, twitterQueryOpts);
                } catch (err) {
                  platformErrors.push({
                    platform: 'twitter',
                    error: `split-keyword "${keyword}": ${err.message || 'Unknown error'}`
                  });
                  return [];
                }
              };

              if (parallel) {
                const splitResponses = await Promise.all(twitterSplitKeywordPool.map(runKeywordSearch));
                keywordResults = splitResponses.flat();
              } else {
                for (const keyword of twitterSplitKeywordPool) {
                  const oneKeywordResults = await runKeywordSearch(keyword);
                  keywordResults.push(...oneKeywordResults);
                }
              }
            } else {
              keywordResults = await searchTwitter(twitterKeywordPool, effectiveLimit, xBearerToken, twitterQueryOpts);
            }
            let trustedResults = [];
            if (!trustedQueryRan && trustedHandles.length > 0) {
              trustedQueryRan = true;
              const trustedQuery = `(${trustedHandles.map(handle => `from:${handle}`).join(' OR ')}) -is:retweet -is:reply`;
              try {
                const trustedLimit = Math.min(Math.max(effectiveLimit * Math.min(trustedHandles.length, 3), 10), 100);
                trustedResults = await searchTwitterByQuery(trustedQuery, trustedLimit, xBearerToken, 'recency');
              } catch (trustedErr) {
                platformErrors.push({
                  platform: 'twitter',
                  error: `trusted-feed: ${trustedErr.message || 'Unknown error'}`
                });
              }
            }
            const results = [...keywordResults, ...trustedResults];
            for (const item of results) {
              const author = String(item?.author || '').toLowerCase();
              if (trustedHandleSet.has(author)) {
                item._fromTrustedAccount = true;
              }
            }
            twitterQueried = true;
            platformStats.push({
              platform: 'twitter',
              count: results.length,
              keywordCount: keywordResults.length,
              trustedCount: trustedResults.length,
              split: effectiveSplit,
              keywordTasks: effectiveSplit ? twitterSplitKeywordPool.length : twitterKeywordPool.length
            });
            platformTotals.twitter.fetched += results.length;
            return results;
          }
          if (!justOneToken && !tikhubToken) {
            platformErrors.push({ platform: 'xiaohongshu', error: 'Xiaohongshu provider token not configured' });
            return [];
          }
          const xhsRetries = effectiveSplit ? 1 : XHS_RETRIES;
          const xhsDelay = effectiveSplit ? 250 : XHS_DELAY_MS;
          const xhsTimeoutMs = effectiveSplit ? 8000 : DEFAULT_TIMEOUT_MS;
          let results = [];
          let lastError = null;
          for (let attempt = 0; attempt <= xhsRetries; attempt += 1) {
            try {
              results = await searchXiaohongshu(task.keyword, 1, 'popularity_descending', '_0', undefined, {
                justOneToken,
                tikhubToken,
                limit: effectiveLimit,
                timeoutMs: xhsTimeoutMs
              });
              lastError = null;
              break;
            } catch (err) {
              lastError = err;
              await sleep(xhsDelay);
            }
          }
          if (lastError) {
            throw lastError;
          }
          // Rate-limit between XHS calls to reduce timeouts
          await sleep(xhsDelay);
          platformStats.push({ platform: 'xiaohongshu', count: results.length });
          platformTotals.xiaohongshu.fetched += results.length;
          return results;
        } catch (err) {
          platformErrors.push({ platform: platformName, error: err.message || 'Unknown error' });
          return [];
        }
      };

      let responses = [];
      if (parallel) {
        responses = await Promise.all(platforms.map(runOne));
      } else {
        for (const p of platforms) {
          responses.push(await runOne(p));
        }
      }

      let results = responses.flat();
      funnel.fetched += results.length;
      for (const item of results) {
        if (item.platform === 'Twitter') platformFunnel.twitter.fetched += 1;
        if (item.platform === 'Xiaohongshu') platformFunnel.xiaohongshu.fetched += 1;
        if (item.platform === 'Twitter' && twitterSamples.length < 5 && item.sourceUrl) {
          twitterSamples.push({
            url: item.sourceUrl,
            text: item.desc?.slice(0, 120) || '',
            metrics: item.metricsRaw || item.metrics || {}
          });
        }
      }

      const minValue = effectiveMinInteraction;
      if (minValue > 0) {
        results = results.filter((r) => {
          const interaction = computeInteraction(r);
          const isTrusted = Boolean(r._fromTrustedAccount);
          const appliedMin = isTrusted ? effectiveTrustedMinInteraction : minValue;
          const passed = interaction >= appliedMin;
          if (engagementDebug.length < 40) {
            engagementDebug.push({
              platform: r.platform,
              author: r.author || '',
              trustedBypass: false,
              isTrusted,
              interaction,
              minValue: appliedMin,
              passed,
              url: r.sourceUrl || ''
            });
          }
          return passed;
        });
      }
      funnel.afterMinInteraction += results.length;
      for (const item of results) {
        if (item.platform === 'Twitter') platformFunnel.twitter.afterMinInteraction += 1;
        if (item.platform === 'Xiaohongshu') platformFunnel.xiaohongshu.afterMinInteraction += 1;
      }

      results = results.filter((r) => {
        const windowDays = r.platform === 'Twitter' ? effectiveTwitterDays : effectiveRecentDays;
        return isRecentEnough(r.publishTime, windowDays);
      });
      funnel.afterRecent += results.length;
      for (const item of results) {
        if (item.platform === 'Twitter') platformFunnel.twitter.afterRecent += 1;
        if (item.platform === 'Xiaohongshu') platformFunnel.xiaohongshu.afterRecent += 1;
      }
      results = results.filter((r) => isAIRelevant(`${r.title || ''}\n${r.desc || ''}`));
      funnel.afterAI += results.length;
      for (const item of results) {
        if (item.platform === 'Twitter') platformFunnel.twitter.afterAI += 1;
        if (item.platform === 'Xiaohongshu') platformFunnel.xiaohongshu.afterAI += 1;
      }

      results = results.filter((r) => {
        const interaction = computeInteraction(r);
        if (interaction >= HIGH_ENGAGEMENT_QUALITY_BYPASS) {
          return true;
        }
        return passesQualityFilter(r, effectivePositiveKeywords, effectiveBlacklistKeywords);
      });
      funnel.afterQuality += results.length;
      for (const item of results) {
        if (item.platform === 'Twitter') platformFunnel.twitter.afterQuality += 1;
        if (item.platform === 'Xiaohongshu') platformFunnel.xiaohongshu.afterQuality += 1;
      }

      allResults.push(...results);
      for (const item of results) {
        if (item.platform === 'Twitter') platformTotals.twitter.output += 1;
        if (item.platform === 'Xiaohongshu') platformTotals.xiaohongshu.output += 1;
      }

      // No tracking_tasks updates in keyword-pool mode
    }

    const uniqueByUrl = new Map();
    for (const r of allResults) {
      if (r?.sourceUrl) uniqueByUrl.set(r.sourceUrl, r);
    }
    const candidates = Array.from(uniqueByUrl.values());
    funnel.candidates = candidates.length;
    let fallbackCoverCount = 0;
    for (const item of candidates) {
      if (item?.platform !== 'Twitter') continue;
      if (!item.coverImage) {
        const seed = item.sourceUrl || item.noteId || `${item.author || ''}-${item.publishTime || ''}`;
        item.coverImage = getFallbackCoverPath(seed);
      }
      if (isFallbackCoverPath(item.coverImage)) {
        fallbackCoverCount += 1;
      }
    }

    if (candidates.length === 0) {
      console.log('[cron-monitor] no candidates after filters', {
        effectiveMinInteraction,
        effectiveTrustedMinInteraction,
        positiveKeywords: effectivePositiveKeywords.length,
        blacklistKeywords: effectiveBlacklistKeywords.length,
        trustedHandles: trustedHandles.length,
        fallbackCoverCount,
        funnel
      });
      console.log('[cron-monitor] engagement debug sample', engagementDebug.slice(0, 10));
      return res.status(200).json({
        inserted: 0,
        updatedTasks: updatedTasks.length,
        effective: {
          minInteraction: effectiveMinInteraction,
          trustedMinInteraction: effectiveTrustedMinInteraction,
          qualityBypassInteraction: HIGH_ENGAGEMENT_QUALITY_BYPASS,
          split: effectiveSplit,
          qualityPositiveCount: effectivePositiveKeywords.length,
          qualityBlacklistCount: effectiveBlacklistKeywords.length,
          trustedHandles: trustedHandles.length
        },
        funnel,
        platformFunnel,
        platformStats,
        fallbackCoverCount,
        runtimeMs: Date.now() - runStartedAt,
        runtimeGuardTriggered,
        engagementDebug: engagementDebug.slice(0, 20),
        platformErrors
      });
    }

    const candidateUrls = candidates.map(c => c.sourceUrl).filter(Boolean);
    const candidateNorms = new Map(
      candidates
        .map(c => [normalizeSourceUrl(c.sourceUrl), c])
        .filter(([k]) => k)
    );

    const { data: existingRows, error: existingError } = await supabase
      .from('knowledge_cards')
      .select('id, source_url')
      .eq('is_trending', true);

    if (existingError) {
      throw new Error(existingError.message || 'Failed to check duplicates');
    }

    const existingNorms = new Set((existingRows || []).map(r => normalizeSourceUrl(r.source_url)));
    const toInsert = candidates
      .filter(c => !existingNorms.has(normalizeSourceUrl(c.sourceUrl)))
      .map(c => buildTrendingRow(c, snapshotTag));
    let updatedExisting = 0;

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('knowledge_cards')
        .insert(toInsert);
      if (insertError) {
        throw new Error(insertError.message || 'Failed to insert trending cards');
      }
    }

    if (candidateUrls.length > 0) {
      // Roll forward snapshot tag on existing rows that match current candidates
      const { data: existingCards, error: existingCardsError } = await supabase
        .from('knowledge_cards')
        .select('id, tags, source_url')
        .eq('is_trending', true);

      if (existingCardsError) {
        throw new Error(existingCardsError.message || 'Failed to load existing trending cards');
      }

      for (const row of existingCards || []) {
        const candidate = candidateNorms.get(normalizeSourceUrl(row.source_url));
        if (!candidate) continue;
        const updatedRow = buildTrendingRow(candidate, snapshotTag);
        const tags = Array.isArray(row.tags) ? row.tags : [];
        const mergedTags = updatedRow.tags?.length
          ? Array.from(new Set([...updatedRow.tags, ...tags]))
          : tags;
        const { error: updateError } = await supabase
          .from('knowledge_cards')
          .update({
            title: updatedRow.title,
            source_url: updatedRow.source_url,
            platform: updatedRow.platform,
            author: updatedRow.author,
            date: updatedRow.date,
            cover_image: updatedRow.cover_image,
            metrics: updatedRow.metrics,
            content_type: updatedRow.content_type,
            raw_content: updatedRow.raw_content,
            ai_analysis: updatedRow.ai_analysis,
            tags: mergedTags,
            user_notes: updatedRow.user_notes,
            collections: updatedRow.collections,
            is_trending: true
          })
          .eq('id', row.id);
        if (updateError) {
          throw new Error(updateError.message || 'Failed to update existing trending cards');
        }
        updatedExisting += 1;
      }
    }

    // Keep only the latest 5 snapshots of trending data
    const { data: trendRows, error: trendError } = await supabase
      .from('knowledge_cards')
      .select('id, tags')
      .eq('is_trending', true);

    if (trendError) {
      throw new Error(trendError.message || 'Failed to load trending snapshots');
    }

    const snapshotToIds = new Map();
    for (const row of trendRows || []) {
      const tags = Array.isArray(row.tags) ? row.tags : [];
      const snap = tags.find(t => typeof t === 'string' && t.startsWith('snapshot:')) || 'snapshot:legacy';
      if (!snapshotToIds.has(snap)) snapshotToIds.set(snap, []);
      snapshotToIds.get(snap).push(row.id);
    }

    const snapshots = Array.from(snapshotToIds.keys()).sort((a, b) => {
      if (a === 'snapshot:legacy') return 1;
      if (b === 'snapshot:legacy') return -1;
      return a > b ? -1 : a < b ? 1 : 0;
    });

    const keep = new Set(snapshots.slice(0, 5));
    const idsToDelete = [];
    for (const [snap, ids] of snapshotToIds.entries()) {
      if (!keep.has(snap)) idsToDelete.push(...ids);
    }

    if (idsToDelete.length > 0) {
      const { error: cleanupError } = await supabase
        .from('knowledge_cards')
        .delete()
        .in('id', idsToDelete);
      if (cleanupError) {
        throw new Error(cleanupError.message || 'Failed to cleanup old snapshots');
      }
    }

    // Skip tracking_tasks updates in keyword-pool mode

    console.log('[cron-monitor] engagement debug sample', engagementDebug.slice(0, 10));

    return res.status(200).json({
      inserted: toInsert.length,
      updatedExisting,
      updatedTasks: updatedTasks.length,
      candidates: candidates.length,
      tasksRun: tasksToRun.length,
      effective: {
        days: effectiveRecentDays,
        minInteraction: effectiveMinInteraction,
        trustedMinInteraction: effectiveTrustedMinInteraction,
        qualityBypassInteraction: HIGH_ENGAGEMENT_QUALITY_BYPASS,
        limit: effectiveLimit,
        tasks: effectiveMaxTasks,
        parallel,
        split: effectiveSplit,
        twitter_days: effectiveTwitterDays,
        twitter_require_terms: TWITTER_REQUIRE_TERMS,
        qualityPositiveCount: effectivePositiveKeywords.length,
        qualityBlacklistCount: effectiveBlacklistKeywords.length,
        trustedHandles: trustedHandles.length
      },
      funnel,
      platformStats,
      platformTotals,
      platformFunnel,
      twitterSamples,
      fallbackCoverCount,
      runtimeMs: Date.now() - runStartedAt,
      runtimeGuardTriggered,
      engagementDebug: engagementDebug.slice(0, 20),
      platformErrors
    });
  } catch (err) {
    console.error('Cron monitor error:', err);
    return res.status(500).json({ error: err.message || 'Cron monitor failed' });
  }
}
