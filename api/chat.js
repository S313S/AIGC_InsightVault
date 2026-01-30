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
                model: 'gemini-1.5-flash',
                contents: prompt,
                config: { responseMimeType: "application/json" }
            });

            return res.status(200).json({ result: response.text });

        } else {
            const systemInstruction = `
        You are the 'Insight Vault Assistant'. Your goal is to help the user navigate their collection of AI knowledge.
        Use the provided CONTEXT (Knowledge Cards) to answer the user's question.
        
        Rules:
        1. Only use information from the provided Context.
        2. If the answer is not in the context, state that clearly and suggest they add more content.
        3. When citing a specific insight, mention the Title of the card.
        4. Be concise and helpful.
      `;

            const prompt = `Context:\n${context}\n\nUser Question: ${message}`;

            const response = await ai.models.generateContent({
                model: 'gemini-1.5-flash',
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
