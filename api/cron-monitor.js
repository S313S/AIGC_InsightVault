// Vercel Cron: periodic social monitoring and trending ingestion

import { createClient } from '@supabase/supabase-js';

const DEFAULT_MONITOR_KEYWORDS = ['AI', 'AIGC', '人工智能', '大模型', 'LLM', 'GPT', 'Claude'];
const DEFAULT_PLATFORMS = ['xiaohongshu', 'twitter'];
const DEFAULT_LIMIT = 20;

const inferCategoryTag = (text) => {
  const t = (text || '').toLowerCase();
  const imageKeywords = [
    'image', 'img', 'photo', 'picture', '图', '图片', '绘画', '生图', '海报', '头像',
    'midjourney', 'mj', 'stable diffusion', 'sd', 'comfyui', 'flux', 'krea',
    'lora', 'controlnet', 'prompt', '风格化', '修图', '上色'
  ];
  const videoKeywords = [
    'video', '视频', 'animation', '动画', '短片', '剪辑', '镜头',
    'runway', 'gen-3', 'gen3', 'kling', '可灵', 'pika', 'sora', 'veo', 'luma'
  ];
  const vibeKeywords = [
    'code', 'coding', '程序', '编程', '开发', '工程', 'repo', 'github', 'git',
    'cursor', 'claude code', 'vibe coding', 'vscode', 'ide', 'agent', 'workflow',
    '自动化', '前端', '后端', 'python', 'node', 'typescript', 'react', 'prompt engineering'
  ];

  const hasAny = (arr) => arr.some((k) => t.includes(k));
  if (hasAny(imageKeywords)) return 'Image Gen';
  if (hasAny(videoKeywords)) return 'Video Gen';
  if (hasAny(vibeKeywords)) return 'Vibe Coding';
  return '';
};

const buildTrendingRow = (result) => {
  const baseText = result.desc || result.title || '';
  const summary = baseText
    ? (baseText.length > 160 ? baseText.slice(0, 160) + '...' : baseText)
    : '暂无摘要';
  const extractedTags = (result.desc || '').match(/#[^\s#]+/g)?.map(t => t.slice(1)) || [];
  const category = inferCategoryTag(baseText);
  const tags = category ? Array.from(new Set([category, ...extractedTags])) : extractedTags;

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
    tags,
    user_notes: '',
    collections: [],
    is_trending: true,
  };
};

const buildBaseUrl = (req) => {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
};

const getSupabaseClient = () => {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
};

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const token = req.headers['x-cron-secret'] || req.query?.token;
    if (token !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    const baseUrl = buildBaseUrl(req);

    const { data: taskRows, error: taskError } = await supabase
      .from('tracking_tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (taskError) {
      throw new Error(taskError.message || 'Failed to load tasks');
    }

    const tasks = taskRows && taskRows.length > 0 ? taskRows : [{
      id: 'default',
      keywords: DEFAULT_MONITOR_KEYWORDS.join(' '),
      platforms: DEFAULT_PLATFORMS,
      config: { sort: 'popularity_descending', noteTime: '一周内' }
    }];

    const allResults = [];
    const updatedTasks = [];

    for (const task of tasks) {
      const platforms = (task.platforms && task.platforms.length > 0) ? task.platforms : DEFAULT_PLATFORMS;
      const responses = await Promise.all(
        platforms.map(async (p) => {
          const payload = {
            keyword: task.keywords,
            platform: p === 'Twitter' || p === 'twitter' ? 'twitter' : 'xiaohongshu',
            page: 1,
            sort: task.config?.sort || 'popularity_descending',
            noteType: task.config?.noteType || '_0',
            noteTime: task.config?.noteTime || undefined,
            limit: DEFAULT_LIMIT,
          };

          const resp = await fetch(`${baseUrl}/api/search-social`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await resp.json();
          if (!resp.ok) {
            throw new Error(data.error || 'Search failed');
          }
          return data.results || [];
        })
      );

      let results = responses.flat();

      const minInter = task.config?.minInteraction;
      if (minInter && !isNaN(Number(minInter))) {
        const min = Number(minInter);
        results = results.filter((r) => {
          const total = (r.metrics?.likes || 0) + (r.metrics?.bookmarks || 0) + (r.metrics?.comments || 0);
          return total >= min;
        });
      }

      allResults.push(...results);

      if (task.id !== 'default') {
        updatedTasks.push({
          id: task.id,
          keywords: task.keywords,
          platforms: task.platforms || DEFAULT_PLATFORMS,
          date_range: task.date_range || { start: '', end: '' },
          status: 'Completed',
          items_found: results.length,
          last_run: new Date().toISOString(),
          config: task.config || undefined,
        });
      }
    }

    const uniqueByUrl = new Map();
    for (const r of allResults) {
      if (r?.sourceUrl) uniqueByUrl.set(r.sourceUrl, r);
    }
    const candidates = Array.from(uniqueByUrl.values());

    if (candidates.length === 0) {
      return res.status(200).json({ inserted: 0, updatedTasks: updatedTasks.length });
    }

    const candidateUrls = candidates.map(c => c.sourceUrl).filter(Boolean);
    const { data: existingRows, error: existingError } = await supabase
      .from('knowledge_cards')
      .select('source_url')
      .in('source_url', candidateUrls);

    if (existingError) {
      throw new Error(existingError.message || 'Failed to check duplicates');
    }

    const existing = new Set((existingRows || []).map(r => r.source_url));
    const toInsert = candidates.filter(c => !existing.has(c.sourceUrl)).map(buildTrendingRow);

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('knowledge_cards')
        .insert(toInsert);
      if (insertError) {
        throw new Error(insertError.message || 'Failed to insert trending cards');
      }
    }

    if (updatedTasks.length > 0) {
      const { error: updateError } = await supabase
        .from('tracking_tasks')
        .upsert(updatedTasks);
      if (updateError) {
        throw new Error(updateError.message || 'Failed to update tasks');
      }
    }

    return res.status(200).json({
      inserted: toInsert.length,
      updatedTasks: updatedTasks.length,
      candidates: candidates.length,
    });
  } catch (err) {
    console.error('Cron monitor error:', err);
    return res.status(500).json({ error: err.message || 'Cron monitor failed' });
  }
}
