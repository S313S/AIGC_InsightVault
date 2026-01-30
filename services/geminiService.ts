// import { GoogleGenAI } from "@google/genai"; // SDK not needed in browser
import { AIAnalysis, KnowledgeCard } from "../types";

// Vite uses import.meta.env for environment variables
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

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
    throw error;
  }
};

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
  // If no API key locally AND running locally, use mock
  // But strictly, we check if we can make the call. 
  // For Vercel, the key is on server, so client might not have it.
  // But we use the proxy now.

  try {
    const responseText = await callProxyAPI({
      mode: 'analysis',
      message: content
    });

    return JSON.parse(responseText);

  } catch (error) {
    console.error("Analysis Failed:", error);

    // Fallback Mock Data
    return {
      summary: "Could not connect to AI service. Using simulated analysis.",
      usageScenarios: ["Demo Scenario 1", "Demo Scenario 2"],
      coreKnowledge: ["Key insight about " + (toolName || "AI")],
      extractedPrompts: ["/imagine prompt: A futuristic demo"]
    };
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