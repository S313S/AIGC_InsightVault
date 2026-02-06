import { GoogleGenAI } from "@google/genai";

const wantsMarkdownOutput = (text) => {
    if (typeof text !== 'string') return false;
    return /(markdown|md格式|markdown格式|用md|用markdown|代码块|```|表格|标题|列表)/i.test(text);
};

const cleanMarkdownForPlainText = (text) => {
    if (typeof text !== 'string') return '';
    return text
        .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ''))
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`(.+?)`/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*>\s+/gm, '');
};

export default async function handler(req, res) {
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { message, context, mode } = req.body;
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Server API key configuration missing' });
    }

    try {
        const ai = new GoogleGenAI({ apiKey });

        if (mode === 'analysis') {
            const prompt = `
        Analyze the following social media post content about AI tools.
        Extract the following information in strict JSON format:
        1. "summary": A concise summary of the post (max 100 words).
        2. "usageScenarios": A list of specific use cases mentioned or implied.
        3. "coreKnowledge": Key insights, tips, or methodologies.
        4. "extractedPrompts": Any exact prompt text found in the content. If none, return an empty array.

        Content: "${message}"
      `;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { responseMimeType: "application/json" }
            });

            return res.status(200).json({ result: response.text });

        } else if (mode === 'classify') {
            const prompt = `
        You are classifying a social media post into one category.
        Allowed categories (must be exactly one of these strings):
        - "Image Gen"
        - "Video Gen"
        - "Vibe Coding"
        - "Other"

        Return strict JSON only: {"category": "<one of the allowed values>"}

        Content: "${message}"
      `;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { responseMimeType: "application/json" }
            });

            return res.status(200).json({ result: response.text });

        } else {
            const wantsMarkdown = wantsMarkdownOutput(message);
            const formatInstruction = wantsMarkdown
                ? "用户本轮明确要求 Markdown。你必须使用标准 Markdown 输出（可用标题、列表、引用、代码块）。"
                : "用户本轮未要求 Markdown。禁止输出任何 Markdown 语法符号（例如 #、*、`、>、- 列表），仅使用自然段中文。";

            const systemInstruction = `
你是「Insight Vault 知识助手」，一个专业、友好的 AI 助理。

【重要】回复格式要求：
- 默认使用清晰、易读的中文表达
- ${formatInstruction}
- 引用知识库内容时，可写成“根据笔记《标题》中的描述...”

你的职责：
帮助用户检索和理解他们收藏的 AI 工具知识库。严格基于提供的 CONTEXT 回答，不编造信息。

回答风格：
像一位资深行业专家在和同事聊天，自然、专业、有温度。保持简洁，切中要点。
      `;

            const prompt = `Context:\n${context}\n\nUser Question: ${message}`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    systemInstruction: systemInstruction,
                }
            });

            const resultText = wantsMarkdown ? response.text : cleanMarkdownForPlainText(response.text);
            return res.status(200).json({ result: resultText });
        }

    } catch (error) {
        console.error('Gemini API Error:', error);
        return res.status(500).json({ error: error.message || 'Error processing request' });
    }
}
