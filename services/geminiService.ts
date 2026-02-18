// import { GoogleGenAI } from "@google/genai"; // SDK not needed in browser
import { AIAnalysis, KnowledgeCard } from "../types";
import { PROJECT_KB_CONTEXT } from "./projectKnowledge";

// Vite uses import.meta.env for environment variables
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_REST_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const wantsMarkdownOutput = (text: string) => /(markdown|md格式|markdown格式|用md|用markdown|代码块|```|表格|标题|列表)/i.test(text);

const buildPromptPayload = (payload: { mode: string; message: string; context?: string }) => {
  const { mode, message, context } = payload;

  if (mode === 'analysis') {
    const prompt = `
你是「帖子整理 Agent（小白版）」。
目标：把帖子内容翻译成通俗中文，并给出可直接上手的操作建议。

严格返回 JSON，不要返回任何额外文本，结构如下：
{
  "summary": "用通俗中文总结帖子，80-160字，避免术语堆砌",
  "usageScenarios": [
    "场景1：谁在什么情况下可以用（含1个具体动作）",
    "场景2：..."
  ],
  "coreKnowledge": [
    "知识点1：结论 + 为什么 + 怎么做（可执行）",
    "知识点2：..."
  ],
  "extractedPrompts": ["从原文中提取的提示词原文，若无则空数组"]
}

规则：
1) 必须使用简体中文。
2) 若原文是英文或中英混合，先理解后翻译成中文表达。
3) usageScenarios 至少 2 条，coreKnowledge 至少 2 条，每条要具体可执行。
4) 若内容与 AI/技术实操关系弱，也要给出“如何判断是否值得跟进”的场景与方法，不能留空。

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
  usageScenarios: toStringArray(analysis.usageScenarios).slice(0, 8),
  coreKnowledge: toStringArray(analysis.coreKnowledge).slice(0, 8),
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
      '场景：你刚接触这个主题。做法：先按帖子关键词搜3条高互动案例，对比共同步骤后再实操。',
      '场景：你想判断是否值得投入。做法：先做一次10分钟小实验，用结果决定是否继续深挖。'
    ];

  const coreKnowledge = analysis.coreKnowledge.length > 0
    ? analysis.coreKnowledge
    : [
      '先小范围验证再扩大投入：先做最小可行测试，记录输入、过程和结果，避免盲目照搬。',
      '把经验变成可复用流程：沉淀为“目标-步骤-参数-结果-复盘”五段笔记，下次可直接套用。'
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

export const analyzeContentWithGemini = async (content: string, toolName?: string): Promise<AIAnalysis> => {
  // If no API key locally AND running locally, use mock
  // But strictly, we check if we can make the call. 
  // For Vercel, the key is on server, so client might not have it.
  // But we use the proxy now.

  try {
    const responseText = await callProxyAPI({
      mode: 'analysis',
      message: content
    });

    return parseAIResponse(String(responseText || ''), content);

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
