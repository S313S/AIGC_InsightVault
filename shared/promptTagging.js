export const normalizePromptList = (extractedPrompts) => {
  if (!Array.isArray(extractedPrompts)) return [];
  return extractedPrompts
    .map(item => String(item || '').trim())
    .filter(Boolean);
};

const TOPIC_TAG_ONLY_RE = /^(?:#?[^\s#]+(?:\[[^\]]+\])?#?\s*){1,6}$/u;
const PROMPT_CUE_RE = /(?:^\/imagine|^\/create|提示词|prompt\s*:|system prompt|negative prompt|act as|you are|你是|请扮演|--ar\b|--v\b|--stylize\b|--q\b|seed\b|cfg\b)/i;
const CHINESE_CHAR_RE = /[\u4e00-\u9fff]/;

const countLatinWords = (text) => (text.match(/[A-Za-z0-9][A-Za-z0-9'_-]*/g) || []).length;

export const isLikelyCompletePrompt = (candidate) => {
  const text = String(candidate || '').trim();
  if (!text) return false;
  if (TOPIC_TAG_ONLY_RE.test(text)) return false;
  if (/^\[[^\]]+\]$/.test(text)) return false;

  const charCount = text.replace(/\s+/g, '').length;
  const latinWords = countLatinWords(text);
  const hasChinese = CHINESE_CHAR_RE.test(text);
  const hasCue = PROMPT_CUE_RE.test(text);
  const hasInstructionPunctuation = /[,:;，。；\n]/.test(text);

  if (charCount < 12) return false;
  if (!hasCue && !hasInstructionPunctuation && latinWords < 10 && (!hasChinese || charCount < 20)) {
    return false;
  }

  return true;
};

export const filterCompletePromptsLocal = (extractedPrompts) => (
  normalizePromptList(extractedPrompts).filter(isLikelyCompletePrompt)
);

export const hasPromptEvidence = (extractedPrompts) => filterCompletePromptsLocal(extractedPrompts).length > 0;

export const resolveContentTypeByPrompts = (extractedPrompts) => (
  hasPromptEvidence(extractedPrompts) ? 'PromptShare' : 'ToolReview'
);
