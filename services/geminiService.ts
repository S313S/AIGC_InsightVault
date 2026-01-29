import { GoogleGenAI } from "@google/genai";
import { AIAnalysis, KnowledgeCard } from "../types";

// Vite uses import.meta.env for environment variables
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const parseAIResponse = (responseText: string): AIAnalysis => {
  try {
    // Attempt to extract JSON if it's wrapped in code blocks
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || responseText.match(/```\n([\s\S]*?)\n```/);
    const jsonString = jsonMatch ? jsonMatch[1] : responseText;
    return JSON.parse(jsonString);
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    // Fallback if JSON parsing fails
    return {
      summary: "Could not generate structured summary. Please check API key or content.",
      usageScenarios: [],
      coreKnowledge: [],
      extractedPrompts: []
    };
  }
};

export const analyzeContentWithGemini = async (content: string, toolName?: string): Promise<AIAnalysis> => {
  if (!API_KEY) {
    console.warn("No API Key found (VITE_GEMINI_API_KEY). Returning mock analysis.");
    return {
      summary: "API Key missing. This is a simulated summary for the demo.",
      usageScenarios: ["Demo Scenario 1", "Demo Scenario 2"],
      coreKnowledge: ["Key insight about " + (toolName || "AI")],
      extractedPrompts: ["/imagine prompt: A futuristic demo"]
    };
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  const prompt = `
    Analyze the following social media post content about AI tools.
    Extract the following information in strict JSON format:
    1. "summary": A concise summary of the post (max 100 words).
    2. "usageScenarios": A list of specific use cases mentioned or implied.
    3. "coreKnowledge": Key insights, tips, or methodologies.
    4. "extractedPrompts": Any exact prompt text found in the content. If none, return an empty array.

    Content: "${content}"
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash', // Switched to stable model
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            usageScenarios: { type: "array", items: { type: "string" } },
            coreKnowledge: { type: "array", items: { type: "string" } },
            extractedPrompts: { type: "array", items: { type: "string" } },
          }
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
    throw new Error("No response text");

  } catch (error) {
    console.error("Gemini API Error:", error);
    return {
      summary: "Error analyzing content.",
      usageScenarios: [],
      coreKnowledge: [],
      extractedPrompts: []
    };
  }
};

export const queryKnowledgeBase = async (query: string, cards: KnowledgeCard[]): Promise<string> => {
  if (!API_KEY) {
    return "I am running in demo mode without an API Key. I can see you have " + cards.length + " items in your vault, but I cannot process them deeply. Please connect an API key to chat with your knowledge base.";
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  // 1. Context Construction (simplified for demo)
  // in a real app, we might use RAG (Retrieval Augmented Generation) to select only relevant cards.
  const context = cards.slice(0, 20).map(c => `
    [ID: ${c.id}]
    Title: ${c.title}
    Platform: ${c.platform}
    Summary: ${c.aiAnalysis.summary}
    Core Knowledge: ${c.aiAnalysis.coreKnowledge.join(', ')}
    Prompts: ${c.aiAnalysis.extractedPrompts.join(', ')}
  `).join('\n---\n');

  const systemInstruction = `
    You are the 'Insight Vault Assistant'. Your goal is to help the user navigate their collection of AI knowledge.
    Use the provided CONTEXT (Knowledge Cards) to answer the user's question.
    
    Rules:
    1. Only use information from the provided Context.
    2. If the answer is not in the context, state that clearly and suggest they add more content.
    3. When citing a specific insight, mention the Title of the card.
    4. Be concise and helpful.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash', // Switched to stable model
      contents: `Context:\n${context}\n\nUser Question: ${query}`,
      config: {
        systemInstruction: systemInstruction,
      }
    });

    return response.text || "I couldn't generate a response.";
  } catch (error) {
    console.error("Chat Error:", error);
    return "Sorry, I encountered an error talking to the AI service.";
  }
};