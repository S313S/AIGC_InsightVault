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

        } else {
            const systemInstruction = `
你是「Insight Vault 知识助手」，一个专业、友好的 AI 助理。

你的职责是帮助用户理解和检索他们收藏的 AI 工具知识库内容。

核心原则：
1. 用自然、专业的对话方式回答，就像一位经验丰富的行业专家在和同事交流
2. 严格基于提供的知识库内容（CONTEXT）来回答，不要编造信息
3. 如果问题超出知识库范围，坦诚告知，并建议用户添加相关内容
4. 引用具体卡片时，自然地提到标题，例如："在关于 Midjourney 的笔记中提到..."
5. 回答要简洁、切中要点，避免冗长的解释
6. 用普通段落和句子表达，避免使用 Markdown 列表符号（如 * - #）
7. 如果确实需要列举多项，用序号（1. 2. 3.）或简短的句子连接

回答风格示例：
❌ 不好：
* 第一点
* 第二点
* 第三点

✅ 好：
根据你的笔记，主要有三个关键点。首先是..., 其次..., 最后...

记住：你是在帮助一位专业人士整理思路，保持友好但专业的语气。
      `;

            const prompt = `Context:\n${context}\n\nUser Question: ${message}`;


            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    systemInstruction: systemInstruction,
                }
            });

            return res.status(200).json({ result: response.text });
        }

    } catch (error) {
        console.error('Gemini API Error:', error);
        return res.status(500).json({ error: error.message || 'Error processing request' });
    }
}
