const SEMANTIC_CATEGORY_IMAGE = 'Image Gen';
const SEMANTIC_CATEGORY_VIDEO = 'Video Gen';
const SEMANTIC_CATEGORY_VIBE = 'Vibe Coding';

const IMAGE_KEYWORDS = [
  'image', 'img', 'photo', 'picture', '图', '图片', '绘画', '生图', '海报', '头像',
  'midjourney', 'mj', 'stable diffusion', 'sd', 'comfyui', 'flux', 'krea',
  'lora', 'controlnet', 'upscale', 'magnific', 'dalle', 'ideogram'
];

const VIDEO_KEYWORDS = [
  'video', '视频', 'animation', '动画', '短片', '剪辑', '镜头', '分镜',
  'runway', 'gen-3', 'gen3', 'kling', '可灵', 'pika', 'sora', 'veo', 'luma', 'hailuo'
];

const VIBE_KEYWORDS = [
  'code', 'coding', '程序', '编程', '开发', '工程', 'repo', 'github', 'git',
  'cursor', 'claude code', 'vibe coding', 'vscode', 'ide', 'agent', 'workflow',
  '自动化', '前端', '后端', 'python', 'node', 'typescript', 'react', 'next.js'
];

const SEMANTIC_POOLS = {
  [SEMANTIC_CATEGORY_IMAGE]: [
    '/dashboard-fallbacks/semantic-image-gen.svg',
  ],
  [SEMANTIC_CATEGORY_VIDEO]: [
    '/dashboard-fallbacks/semantic-video-gen.svg',
  ],
  [SEMANTIC_CATEGORY_VIBE]: [
    '/dashboard-fallbacks/semantic-vibe-coding.svg',
  ],
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

const scoreKeywords = (text, keywords) => keywords.reduce((acc, keyword) => (
  text.includes(keyword) ? acc + 1 : acc
), 0);

export const extractHashtagsFromText = (text) => {
  const source = String(text || '');
  if (!source) return [];
  const matches = source.match(/#[^\s#]+/g) || [];
  return Array.from(new Set(matches.map((item) => item.slice(1).trim()).filter(Boolean)));
};

export const inferSemanticCategory = (text) => {
  const source = String(text || '').toLowerCase();
  if (!source.trim()) return '';

  const imageScore = scoreKeywords(source, IMAGE_KEYWORDS);
  const videoScore = scoreKeywords(source, VIDEO_KEYWORDS);
  const vibeScore = scoreKeywords(source, VIBE_KEYWORDS);

  if (videoScore >= imageScore && videoScore >= vibeScore && videoScore > 0) {
    return SEMANTIC_CATEGORY_VIDEO;
  }
  if (imageScore >= videoScore && imageScore >= vibeScore && imageScore > 0) {
    return SEMANTIC_CATEGORY_IMAGE;
  }
  if (vibeScore > 0) {
    return SEMANTIC_CATEGORY_VIBE;
  }
  return '';
};

const normalizeCategoryHint = (categoryHint) => {
  const value = String(categoryHint || '').trim();
  if (value === SEMANTIC_CATEGORY_IMAGE || value === SEMANTIC_CATEGORY_VIDEO || value === SEMANTIC_CATEGORY_VIBE) {
    return value;
  }
  return '';
};

export const pickSemanticCover = ({ text = '', seed = '', categoryHint = '' } = {}) => {
  const normalizedHint = normalizeCategoryHint(categoryHint);
  const category = normalizedHint || inferSemanticCategory(text) || SEMANTIC_CATEGORY_VIBE;
  const pool = SEMANTIC_POOLS[category] || SEMANTIC_POOLS[SEMANTIC_CATEGORY_VIBE];
  const index = hashSeed(seed || text || category) % pool.length;
  return {
    category,
    coverImage: pool[index],
    coverImageSource: 'semantic_pool'
  };
};

export const SEMANTIC_CATEGORIES = [
  SEMANTIC_CATEGORY_IMAGE,
  SEMANTIC_CATEGORY_VIDEO,
  SEMANTIC_CATEGORY_VIBE
];
