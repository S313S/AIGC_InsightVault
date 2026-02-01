import { GoogleGenAI } from "@google/genai";

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
    const apiKey = process.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Server API key configuration missing' });
    }

    try {
        // SDK expects GEMINI_API_KEY environment variable
        process.env.GEMINI_API_KEY = apiKey;
        const ai = new GoogleGenAI({});

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

示例对比：
❌ 错误：
* 第一个工具
* 第二个工具

✅ 正确：
你的笔记里提到了两个主要工具。第一个是...，它的特点是...；第二个是...，主要用于...
      `;

            const prompt = `Context:\n${context}\n\nUser Question: ${message}`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    systemInstruction: systemInstruction,
                }
            });

            // Clean up markdown symbols from response
            let cleanedText = response.text
                .replace(/^\s*[\*\-]\s+/gm, '')  // Remove * - at line start
                .replace(/\*\*(.+?)\*\*/g, '$1')  // Remove **bold**
                .replace(/\*(.+?)\*/g, '$1')      // Remove *italic*
                .replace(/^#+\s+/gm, '')          // Remove # headers
                .replace(/`(.+?)`/g, '$1');       // Remove `code`

            return res.status(200).json({ result: cleanedText });
        }

    } catch (error) {
        console.error('Gemini API Error:', error);
        return res.status(500).json({ error: error.message || 'Error processing request' });
    }
}
