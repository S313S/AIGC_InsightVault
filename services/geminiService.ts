// import { GoogleGenAI } from "@google/genai"; // SDK not needed in browser
import { AIAnalysis, KnowledgeCard } from "../types";

// Vite uses import.meta.env for environment variables
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_REST_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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

  const systemInstruction = `
你是「Insight Vault 知识助手」，一个专业、友好的 AI 助理。

【重要】回复格式要求：
- 默认使用清晰、易读的中文表达
- 当用户明确要求使用 Markdown（例如提到“markdown格式”“列表”“标题”“代码块”）时，必须使用标准 Markdown 输出
- 在不影响准确性的前提下，优先使用结构化格式（标题、列表、引用）提升可读性
- 引用知识库内容时，可写成“根据笔记《标题》中的描述...”

你的职责：
帮助用户检索和理解他们收藏的 AI 工具知识库。严格基于提供的 CONTEXT 回答，不编造信息。

回答风格：
像一位资深行业专家在和同事聊天，自然、专业、有温度。保持简洁，切中要点。
  `.trim();

  const prompt = `Context:\n${context || ''}\n\nUser Question: ${message}`;

  return {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] }
  };
};

const callGeminiREST = async (payload: { mode: string; message: string; context?: string }) => {
  if (!API_KEY) {
    throw new Error('Missing VITE_GEMINI_API_KEY for direct Gemini call');
  }

  const requestBody = buildPromptPayload(payload);

  const response = await fetch(`${GEMINI_REST_ENDPOINT}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
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
const callProxyAPI = async (payload: any) => {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `API Error: ${response.status}`);
    }

    const data = await response.json();
    return data.result;
  } catch (error) {
    console.error("Proxy API Error:", error);
    // In dev, allow direct Gemini call if proxy is unreachable
    if (import.meta.env.DEV && API_KEY) {
      return callGeminiREST(payload);
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

const parseAIResponse = (responseText: string): AIAnalysis => {
  try {
    // Attempt to extract JSON if it's wrapped in code blocks
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || responseText.match(/```\n([\s\S]*?)\n```/);
    const jsonString = jsonMatch ? jsonMatch[1] : responseText;
    return normalizeAIAnalysis(JSON.parse(jsonString));
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    // Fallback if JSON parsing fails
    return normalizeAIAnalysis({
      summary: "Could not generate structured summary. Please check API key or content.",
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

    return normalizeAIAnalysis(JSON.parse(responseText));

  } catch (error) {
    console.error("Analysis Failed:", error);

    // Fallback Mock Data
    return normalizeAIAnalysis({
      summary: "Could not connect to AI service. Using simulated analysis.",
      usageScenarios: ["Demo Scenario 1", "Demo Scenario 2"],
      coreKnowledge: ["Key insight about " + (toolName || "AI")],
      extractedPrompts: ["/imagine prompt: A futuristic demo"]
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

export const queryKnowledgeBase = async (query: string, cards: KnowledgeCard[]): Promise<string> => {

  // 1. Context Construction
  const context = cards.slice(0, 20).map(c => `
    [ID: ${c.id}]
    Title: ${c.title}
    Platform: ${c.platform}
    Summary: ${c.aiAnalysis.summary}
    Core Knowledge: ${c.aiAnalysis.coreKnowledge.join(', ')}
    Prompts: ${c.aiAnalysis.extractedPrompts.join(', ')}
  `).join('\n---\n');

  try {
    const responseText = await callProxyAPI({
      mode: 'chat',
      message: query,
      context: context
    });

    return responseText || "I couldn't generate a response.";

  } catch (error) {
    console.error("Chat Error:", error);
    const { isQuotaExceeded, retrySeconds } = parseGeminiErrorInfo(error);
    if (isQuotaExceeded) {
      return `当前 AI 服务请求额度已达到上限（429）。${retrySeconds ? `请约 ${retrySeconds} 秒后重试，` : '请稍后重试，'}或在 Gemini 控制台提升配额后再试。`;
    }
    return "抱歉，我暂时无法连接 AI 服务。请检查网络，或稍后重试。";
  }
};
