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
- 绝对禁止使用任何 Markdown 格式符号：* - # ** __ \`
- 只用自然的中文句子和段落
- 需要列举时，用"首先...其次...此外...最后..."或者"第一...第二...第三..."
- 引用时用"根据笔记《标题》中的描述..."

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
    return "Sorry, I can't connect to the AI service right now. Please check your network or try again later.";
  }
};
