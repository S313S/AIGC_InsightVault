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

const toInt = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};
const MAX_INLINE_IMAGES = toInt(process.env.GEMINI_MAX_INLINE_IMAGES, 7);
const MAX_IMAGE_BYTES = toInt(process.env.GEMINI_MAX_IMAGE_BYTES, 5 * 1024 * 1024);
const MAX_TOTAL_IMAGE_BYTES = toInt(process.env.GEMINI_MAX_TOTAL_IMAGE_BYTES, 18 * 1024 * 1024);

const normalizeImageUrls = (value) => {
    if (!Array.isArray(value)) return [];
    const shouldSkip = (url) => {
        const u = String(url || '').trim().toLowerCase();
        if (!u) return true;
        if (u.includes('/fallback-covers/cover-')) return true;
        if (/\/fallback-covers\/cover-\d{3}\.svg(\?|#|$)/i.test(u)) return true;
        if (u.includes('dashscope') || u.includes('bailian')) return true;
        if (u.includes('aliyuncs.com') && (u.includes('dashscope') || u.includes('generated') || u.includes('aigc'))) return true;
        return false;
    };
    return Array.from(new Set(
        value
            .map((v) => String(v || '').trim())
            .filter(Boolean)
            .filter((url) => /^https?:\/\//i.test(url))
            .filter((url) => !shouldSkip(url))
    ));
};

const buildImageInlineParts = async (imageUrls) => {
    const parts = [];
    let total = 0;
    const skipped = {
        overMaxInlineImages: 0,
        fetchFailed: 0,
        badHttpStatus: 0,
        nonImageMime: 0,
        emptyBuffer: 0,
        overSingleImageBytes: 0,
        overTotalImageBytes: 0,
    };

    for (const imageUrl of imageUrls) {
        if (parts.length >= MAX_INLINE_IMAGES) {
            skipped.overMaxInlineImages += 1;
            continue;
        }

        try {
            const resp = await fetch(imageUrl);
            if (!resp.ok) {
                skipped.badHttpStatus += 1;
                continue;
            }
            const mimeType = String(resp.headers.get('content-type') || '').split(';')[0].trim() || 'image/jpeg';
            if (!mimeType.startsWith('image/')) {
                skipped.nonImageMime += 1;
                continue;
            }
            const buffer = Buffer.from(await resp.arrayBuffer());
            if (!buffer.length) {
                skipped.emptyBuffer += 1;
                continue;
            }
            if (buffer.length > MAX_IMAGE_BYTES) {
                skipped.overSingleImageBytes += 1;
                continue;
            }
            if (total + buffer.length > MAX_TOTAL_IMAGE_BYTES) {
                skipped.overTotalImageBytes += 1;
                continue;
            }
            total += buffer.length;
            parts.push({
                inlineData: {
                    mimeType,
                    data: buffer.toString('base64')
                }
            });
        } catch {
            // Ignore single-image failure and continue with remaining images.
            skipped.fetchFailed += 1;
        }
    }
    return {
        parts,
        stats: {
            inputCount: imageUrls.length,
            sentCount: parts.length,
            totalBytes: total,
            skipped,
        },
    };
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

    const { message, context, mode, imageUrls } = req.body;
    const requestId = req.headers['x-vercel-id']
        || req.headers['x-request-id']
        || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Server API key configuration missing' });
    }

    try {
        const ai = new GoogleGenAI({ apiKey });

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
      `;

            const normalizedImageUrls = normalizeImageUrls(imageUrls);
            const inlineImage = await buildImageInlineParts(normalizedImageUrls);
            const inlineImageParts = inlineImage.parts;
            console.info('[analysis-image-debug]', {
                requestId,
                rawCount: Array.isArray(imageUrls) ? imageUrls.length : 0,
                normalizedCount: normalizedImageUrls.length,
                inlineCount: inlineImageParts.length,
                inlineStats: inlineImage.stats,
                maxInlineImages: MAX_INLINE_IMAGES,
                maxImageBytes: MAX_IMAGE_BYTES,
                maxTotalImageBytes: MAX_TOTAL_IMAGE_BYTES
            });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{
                    role: 'user',
                    parts: [
                        ...inlineImageParts,
                        { text: prompt }
                    ]
                }],
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

        } else if (mode === 'prompt_check') {
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
      `;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
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

数量口径规则（必须遵守）：
- CONTEXT 里会提供 Scope Meta 信息（TOTAL_NOTES / ANALYZED_NOTES）
- 当用户询问“有多少条笔记/内容”时，必须回答 TOTAL_NOTES
- 当用户询问“你分析了多少条”时，回答 ANALYZED_NOTES，并可补充“为保证速度仅对前 ANALYZED_NOTES 条做深度分析”

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
