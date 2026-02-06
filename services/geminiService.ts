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
Analyze the following social media post content about AI tools.
Extract the following information in strict JSON format:
1. "summary": A concise summary of the post (max 100 words).
2. "usageScenarios": A list of specific use cases mentioned or implied.
3. "coreKnowledge": Key insights, tips, or methodologies.
4. "extractedPrompts": Any exact prompt text found in the content. If none, return an empty array.

Content: "${message}"
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
  summary: typeof analysis.summary === 'string' ? analysis.summary : String(analysis.summary || ''),
  usageScenarios: toStringArray(analysis.usageScenarios),
  coreKnowledge: toStringArray(analysis.coreKnowledge),
  extractedPrompts: toStringArray(analysis.extractedPrompts)
});

const extractLikelyJson = (text: string): string => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }
  return text;
};

const parseAIResponse = (responseText: string): AIAnalysis => {
  try {
    // Attempt to extract JSON if it's wrapped in code blocks
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || responseText.match(/```\n([\s\S]*?)\n```/);
    const candidate = jsonMatch ? jsonMatch[1] : responseText;
    const trimmed = candidate.trim();

    try {
      return normalizeAIAnalysis(JSON.parse(trimmed));
    } catch {
      const extracted = extractLikelyJson(trimmed);
      const repaired = extracted
        .replace(/,\s*([}\]])/g, '$1') // remove trailing commas
        .replace(/\u0000/g, '');
      return normalizeAIAnalysis(JSON.parse(repaired));
    }
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    // Fallback if JSON parsing fails
    return normalizeAIAnalysis({
      summary: "AI 返回内容格式异常，已跳过结构化提取。你可以重试一次，或缩短输入内容。",
      usageScenarios: [],
      coreKnowledge: [],
      extractedPrompts: []
    });
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

    return parseAIResponse(String(responseText || ''));

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
