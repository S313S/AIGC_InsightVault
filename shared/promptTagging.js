export const normalizePromptList = (extractedPrompts) => {
  if (!Array.isArray(extractedPrompts)) return [];
  return extractedPrompts
    .map(item => String(item || '').trim())
    .filter(Boolean);
};

export const hasPromptEvidence = (extractedPrompts) => normalizePromptList(extractedPrompts).length > 0;

export const resolveContentTypeByPrompts = (extractedPrompts) => (
  hasPromptEvidence(extractedPrompts) ? 'PromptShare' : 'ToolReview'
);
