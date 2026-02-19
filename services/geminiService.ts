// import { GoogleGenAI } from "@google/genai"; // SDK not needed in browser
import { AIAnalysis, KnowledgeCard } from "../types";
import { PROJECT_KB_CONTEXT } from "./projectKnowledge";
import { filterCompletePromptsLocal, normalizePromptList } from "../shared/promptTagging.js";

// Vite uses import.meta.env for environment variables
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_REST_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const wantsMarkdownOutput = (text: string) => /(markdown|md格式|markdown格式|用md|用markdown|代码块|```|表格|标题|列表)/i.test(text);

const buildPromptPayload = (payload: { mode: string; message: string; context?: string }) => {
  const { mode, message, context } = payload;

  if (mode === 'analysis') {
    const prompt = `
你是「帖子整理 Agent」。
目标：把帖子内容整理成“简练、通俗、重点清楚”的结果，避免冗长说教。

严格返回 JSON，不要返回任何额外文本，结构如下：
{
  "summary": "一句话总结（40-90字），说清最关键结论",
  "usageScenarios": [
    "场景1（短句，可执行）",
    "场景2：..."
  ],
  "coreKnowledge": [
    "知识点1（短句，保留关键方法）",
    "知识点2：..."
  ],
  "extractedPrompts": ["从原文中提取的提示词原文，若无则空数组"]
}

规则：
1) 必须使用简体中文。
2) 若原文是英文或中英混合，先理解后翻译成中文表达。
3) summary 禁止空话套话，不重复原文，不超过 90 字。
4) usageScenarios 输出 2-3 条，每条 18-48 字，只写“谁在什么情况下怎么用”。
5) coreKnowledge 输出 2-3 条，每条 18-56 字，只保留关键结论或方法，不展开“为什么/背景故事”。
6) 若内容与 AI/技术实操关系弱，也要给出简短可执行建议，不能留空。

帖子内容：
"${message}"
    `.trim();

    return {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    };
  }

  if (mode === 'classify') {
    const prompt = `
You are classifying a social media post into one category.
Allowed categories (must be exactly one of these strings):
- "Image Gen"
- "Video Gen"
- "Vibe Coding"
- "Other"

Return strict JSON only: {"category": "<one of the allowed values>"}

Content: "${message}"
    `.trim();

    return {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    };
  }

  if (mode === 'prompt_check') {
    const prompt = `
你是「提示词完整性判定 Agent」。
任务：从给定候选列表中，筛选“完整、可复用的提示词原文”。

严格返回 JSON，不要返回任何额外文本，结构如下：
{
  "completePrompts": ["完整提示词1", "完整提示词2"]
}

判定规则：
1) 只保留完整提示词：应包含明确任务意图，通常还包含角色/风格/约束/步骤/参数等信息中的至少一种。
2) 可以是图像/视频/代码/系统提示词，但必须是可直接复用的完整表达。
3) 仅话题标签、关键词、短语、标题、占位符（如 #AI[话题]#、skills、agent）都不算完整提示词。
4) 保留原文，不要改写。
5) 若没有完整提示词，返回空数组。

帖子原文：
"${context || ''}"

候选文本：
${message}
    `.trim();

    return {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    };
  }

  const wantsMarkdown = wantsMarkdownOutput(message);
  const formatInstruction = wantsMarkdown
    ? '用户本轮明确要求 Markdown。你必须使用标准 Markdown 输出（可用标题、列表、引用、代码块）。'
    : '用户本轮未要求 Markdown。禁止输出任何 Markdown 语法符号（例如 #、*、`、>、- 列表），仅使用自然段中文。';

  const systemInstruction = `
你是「Insight Vault 知识助手」，一个专业、友好的 AI 助理。

【重要】回复格式要求：
- 默认使用清晰、易读的中文表达
- ${formatInstruction}
- 引用知识库内容时，可写成“根据笔记《标题》中的描述...”

你的职责：
帮助用户检索和理解他们收藏的 AI 工具知识库。严格基于提供的 CONTEXT 回答，不编造信息。

数量口径规则（必须遵守）：
- CONTEXT 里会提供 Scope Meta 信息（TOTAL_NOTES / ANALYZED_NOTES）
- 当用户询问“有多少条笔记/内容”时，必须回答 TOTAL_NOTES
- 当用户询问“你分析了多少条”时，回答 ANALYZED_NOTES，并可补充“为保证速度仅对前 ANALYZED_NOTES 条做深度分析”

回答风格：
像一位资深行业专家在和同事聊天，自然、专业、有温度。保持简洁，切中要点。
  `.trim();

  const prompt = `Context:\n${context || ''}\n\nUser Question: ${message}`;

  return {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] }
  };
};

const callGeminiREST = async (payload: { mode: string; message: string; context?: string }, signal?: AbortSignal) => {
  if (!API_KEY) {
    throw new Error('Missing VITE_GEMINI_API_KEY for direct Gemini call');
  }

  const requestBody = buildPromptPayload(payload);

  const response = await fetch(`${GEMINI_REST_ENDPOINT}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `Gemini REST Error: ${response.status}`;
    throw new Error(message);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) {
    throw new Error('Gemini REST returned empty response');
  }
  return text;
};

// Helper to call Vercel API
const callProxyAPI = async (payload: any, signal?: AbortSignal) => {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `API Error: ${response.status}`);
    }

    const data = await response.json();
    return data.result;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    console.error("Proxy API Error:", error);
    // In dev, allow direct Gemini call if proxy is unreachable
    if (import.meta.env.DEV && API_KEY) {
      return callGeminiREST(payload, signal);
    }
    throw error;
  }
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map(v => String(v).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/\r?\n|;|，|,/)
      .map(v => v.trim())
      .filter(Boolean);
  }
  if (value == null) return [];
  return [String(value).trim()].filter(Boolean);
};

const normalizeAIAnalysis = (analysis: Partial<AIAnalysis>): AIAnalysis => ({
  summary: typeof analysis.summary === 'string' ? analysis.summary.trim() : String(analysis.summary || '').trim(),
  usageScenarios: toStringArray(analysis.usageScenarios).slice(0, 3),
  coreKnowledge: toStringArray(analysis.coreKnowledge).slice(0, 3),
  extractedPrompts: toStringArray(analysis.extractedPrompts)
});

const ensureAnalysisCompleteness = (analysis: AIAnalysis, sourceContent: string): AIAnalysis => {
  const normalizedSource = (sourceContent || '').trim();
  const fallbackSummary = normalizedSource
    ? `这条内容主要在表达：${normalizedSource.slice(0, 120)}${normalizedSource.length > 120 ? '…' : ''}`
    : '这条内容信息较少，建议先补充帖子正文再做深入分析。';

  const usageScenarios = analysis.usageScenarios.length > 0
    ? analysis.usageScenarios
    : [
      '新手入门时，先照帖子里的一个步骤做最小实验。',
      '决定是否投入前，先用10分钟小测试验证是否有效。'
    ];

  const coreKnowledge = analysis.coreKnowledge.length > 0
    ? analysis.coreKnowledge
    : [
      '先验证再投入，别一次性把时间全砸进去。',
      '把有效做法沉淀成步骤清单，后续可直接复用。'
    ];

  return {
    summary: analysis.summary || fallbackSummary,
    usageScenarios,
    coreKnowledge,
    extractedPrompts: analysis.extractedPrompts
  };
};

const extractLikelyJson = (text: string): string => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }
  return text;
};

const parseAIResponse = (responseText: string, sourceContent: string): AIAnalysis => {
  try {
    // Attempt to extract JSON if it's wrapped in code blocks
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || responseText.match(/```\n([\s\S]*?)\n```/);
    const candidate = jsonMatch ? jsonMatch[1] : responseText;
    const trimmed = candidate.trim();

    try {
      return ensureAnalysisCompleteness(normalizeAIAnalysis(JSON.parse(trimmed)), sourceContent);
    } catch {
      const extracted = extractLikelyJson(trimmed);
      const repaired = extracted
        .replace(/,\s*([}\]])/g, '$1') // remove trailing commas
        .replace(/\u0000/g, '');
      return ensureAnalysisCompleteness(normalizeAIAnalysis(JSON.parse(repaired)), sourceContent);
    }
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    // Fallback if JSON parsing fails
    return ensureAnalysisCompleteness(normalizeAIAnalysis({
      summary: "AI 返回内容格式异常，已跳过结构化提取。你可以重试一次，或缩短输入内容。",
      usageScenarios: [],
      coreKnowledge: [],
      extractedPrompts: []
    }), sourceContent);
  }
};

const parsePromptCheckResponse = (responseText: string, fallbackCandidates: string[]): string[] => {
  try {
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || responseText.match(/```\n([\s\S]*?)\n```/);
    const candidate = (jsonMatch ? jsonMatch[1] : responseText).trim();
    const parsed = JSON.parse(extractLikelyJson(candidate));
    const complete = normalizePromptList(parsed?.completePrompts);
    return complete.length > 0 ? complete : filterCompletePromptsLocal(fallbackCandidates);
  } catch {
    return filterCompletePromptsLocal(fallbackCandidates);
  }
};

const filterCompletePromptsWithAgent = async (candidates: string[], sourceContent: string): Promise<string[]> => {
  const normalized = normalizePromptList(candidates);
  if (normalized.length === 0) return [];

  try {
    const responseText = await callProxyAPI({
      mode: 'prompt_check',
      message: JSON.stringify(normalized),
      context: sourceContent
    });
    return parsePromptCheckResponse(String(responseText || ''), normalized);
  } catch {
    return filterCompletePromptsLocal(normalized);
  }
};

const parseGeminiErrorInfo = (error: unknown): { isQuotaExceeded: boolean; retrySeconds?: number } => {
  const raw = error instanceof Error ? error.message : String(error || '');
  let statusCode: number | undefined;
  let text = raw;

  const jsonStart = raw.indexOf('{');
  if (jsonStart >= 0) {
    const maybeJson = raw.slice(jsonStart);
    try {
      const parsed = JSON.parse(maybeJson);
      const parsedError = parsed?.error ?? parsed;

      if (typeof parsedError?.code === 'number') {
        statusCode = parsedError.code;
      }
      if (typeof parsedError?.message === 'string') {
        text = `${text}\n${parsedError.message}`;
      }
    } catch {
      // ignore parse failures
    }
  }

  if (!statusCode) {
    const statusMatch = raw.match(/\b(?:API Error|status)\s*[:=]?\s*(\d{3})\b/i);
    if (statusMatch) statusCode = Number(statusMatch[1]);
  }

  const retryMatch = text.match(/retry in\s+([\d.]+)s/i) || text.match(/"retryDelay":"(\d+)s"/i);
  const retrySeconds = retryMatch ? Math.ceil(Number(retryMatch[1])) : undefined;
  const isQuotaExceeded = statusCode === 429 || /RESOURCE_EXHAUSTED|quota|rate[\s-]?limit|too many requests/i.test(text);

  return { isQuotaExceeded, retrySeconds };
};

export const analyzeContentWithGemini = async (
  content: string,
  options?: { imageUrls?: string[] },
  toolName?: string
): Promise<AIAnalysis> => {
  // If no API key locally AND running locally, use mock
  // But strictly, we check if we can make the call. 
  // For Vercel, the key is on server, so client might not have it.
  // But we use the proxy now.

  try {
    const responseText = await callProxyAPI({
      mode: 'analysis',
      message: content,
      imageUrls: (options?.imageUrls || []).filter(Boolean)
    });

    const parsed = parseAIResponse(String(responseText || ''), content);
    const completePrompts = await filterCompletePromptsWithAgent(parsed.extractedPrompts, content);
    return {
      ...parsed,
      extractedPrompts: completePrompts
    };

  } catch (error) {
    console.error("Analysis Failed:", error);
    const { isQuotaExceeded, retrySeconds } = parseGeminiErrorInfo(error);
    if (isQuotaExceeded) {
      return normalizeAIAnalysis({
        summary: `AI 请求额度已达到上限（429）。${retrySeconds ? `建议约 ${retrySeconds} 秒后重试。` : '请稍后重试。'}`,
        usageScenarios: [],
        coreKnowledge: [],
        extractedPrompts: []
      });
    }

    // Fallback message for network / server failures
    return normalizeAIAnalysis({
      summary: `暂时无法连接 AI 分析服务。请检查网络或稍后重试。${toolName ? `（来源：${toolName}）` : ''}`,
      usageScenarios: [],
      coreKnowledge: [],
      extractedPrompts: []
    });
  }
};

export const classifyContentWithGemini = async (content: string): Promise<string> => {
  try {
    const responseText = await callProxyAPI({
      mode: 'classify',
      message: content
    });

    const parsed = JSON.parse(responseText);
    return parsed?.category || '';
  } catch (error) {
    console.error("Classification Failed:", error);
    return '';
  }
};

export const queryKnowledgeBase = async (query: string, cards: KnowledgeCard[], signal?: AbortSignal): Promise<string> => {

  // 1. Context Construction
  const analyzedCards = cards;
  const context = `
    [Project Knowledge]
    ${PROJECT_KB_CONTEXT}
  \n---\n
    [Scope Meta]
    TOTAL_NOTES: ${cards.length}
    ANALYZED_NOTES: ${analyzedCards.length}
    ANALYSIS_NOTE: 本轮基于当前范围内全部内容进行分析；当数据量较大时，响应可能变慢。
  \n---\n${analyzedCards.map(c => `
    [ID: ${c.id}]
    Title: ${c.title}
    Platform: ${c.platform}
    Summary: ${c.aiAnalysis.summary}
    Core Knowledge: ${c.aiAnalysis.coreKnowledge.join(', ')}
    Prompts: ${c.aiAnalysis.extractedPrompts.join(', ')}
  `).join('\n---\n')}`;

  try {
    const responseText = await callProxyAPI({
      mode: 'chat',
      message: query,
      context: context
    }, signal);

    return responseText || "I couldn't generate a response.";

  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    console.error("Chat Error:", error);
    const { isQuotaExceeded, retrySeconds } = parseGeminiErrorInfo(error);
    if (isQuotaExceeded) {
      return `当前 AI 服务请求额度已达到上限（429）。${retrySeconds ? `请约 ${retrySeconds} 秒后重试，` : '请稍后重试，'}或在 Gemini 控制台提升配额后再试。`;
    }
    return "抱歉，我暂时无法连接 AI 服务。请检查网络，或稍后重试。";
  }
};
