import { KnowledgeCard, Platform, ContentType, TrackingTask, TaskStatus, Collection } from './types';

// Helper to pre-assign collections for demo purposes
// c1: AIGC Tools & Env Setup
// c2: Usage Tips & Tricks
// c3: Real-world Scenarios

export const INITIAL_DATA: KnowledgeCard[] = [
  {
    id: '1',
    title: 'Midjourney v6.1 Photorealism Guide',
    sourceUrl: '#',
    platform: Platform.Twitter,
    author: 'AI_Artist_X',
    date: '2025-01-20',
    coverImage: 'https://picsum.photos/400/300?random=1',
    metrics: { likes: 3400, bookmarks: 1200, comments: 450 },
    contentType: ContentType.PromptShare,
    rawContent: "Midjourney v6.1 is absolutely insane for street photography. The key is to use raw style and low stylize values. Here is my workflow...",
    tags: ['Image Gen', 'Midjourney'],
    userNotes: "## Experiment Idea\nTry this with the new *Niji 6* model as well. \n\n**Key takeaways:**\n- Low stylize is better for realism\n- Raw mode removes the 'AI look'",
    collections: ['c2', 'c3'], 
    aiAnalysis: {
      summary: "A detailed guide on achieving photorealistic street photography results using Midjourney v6.1. Emphasizes specific parameter tuning like '--style raw' and low '--s' values.",
      usageScenarios: ["Street photography generation", "Realistic stock photo creation"],
      coreKnowledge: ["Use --style raw for less artistic interference", "Keep --stylize between 50-100"],
      extractedPrompts: [
        "/imagine prompt: candid street photography of a busy tokyo intersection at rainy night, neon reflections, shot on 35mm kodak portra 400, cinematic lighting, hyperrealistic --ar 16:9 --style raw --s 50 --v 6.1",
        "/imagine prompt: portrait of an elderly man playing chess in a park, natural sunlight, depth of field, f/1.8, detailed texture --style raw"
      ]
    }
  },
  {
    id: '2',
    title: 'Claude Code: New Vibe Coding Capabilities',
    sourceUrl: '#',
    platform: Platform.Xiaohongshu,
    author: 'TechDaily',
    date: '2025-01-22',
    coverImage: 'https://picsum.photos/400/300?random=2',
    metrics: { likes: 8500, bookmarks: 5000, comments: 900 },
    contentType: ContentType.ToolReview,
    rawContent: "Claude 3.5 Sonnet just got a huge update for coding. It's now called 'Claude Code' in some circles. It can refactor entire codebases...",
    tags: ['Vibe Coding', 'Claude'],
    userNotes: "",
    collections: ['c1'],
    aiAnalysis: {
      summary: "Review of the new 'Claude Code' capabilities, highlighting its ability to handle large-context refactoring and 'vibe coding' where it matches the project's existing style perfectly.",
      usageScenarios: ["Refactoring legacy code", "Generating boilerplate matching project patterns"],
      coreKnowledge: ["Claude 3.5 has improved context window", "Better at inferring style from existing files"],
      extractedPrompts: []
    }
  },
  {
    id: '3',
    title: 'VEO3 Video Generation consistent characters',
    sourceUrl: '#',
    platform: Platform.Twitter,
    author: 'VideoAI_Pro',
    date: '2025-01-23',
    coverImage: 'https://picsum.photos/400/300?random=3',
    metrics: { likes: 1200, bookmarks: 800, comments: 120 },
    contentType: ContentType.PromptShare,
    rawContent: "Finally figured out character consistency in VEO3! You need to seed the character face first.",
    tags: ['Video Gen', 'VEO3'],
    userNotes: "",
    collections: ['c2', 'c3'],
    aiAnalysis: {
      summary: "Tutorial on maintaining character consistency in VEO3 video generation models by using specific seed techniques.",
      usageScenarios: ["Short film production", "Character animation"],
      coreKnowledge: ["Seed locking is essential", "Use image prompts alongside text"],
      extractedPrompts: [
        "A cyberpunk detective walking through fog, maintaining character face [Image Reference], cinematic camera movement --video_seed 12345"
      ]
    }
  },
  {
    id: '4',
    title: 'Top 10 AI Design Tools for 2026',
    sourceUrl: '#',
    platform: Platform.Manual,
    author: 'DesignWeekly',
    date: '2025-01-24',
    coverImage: 'https://picsum.photos/400/300?random=4',
    metrics: { likes: 150, bookmarks: 400, comments: 10 },
    contentType: ContentType.ToolReview,
    rawContent: "The landscape has changed. Here are the tools you need: Midjourney, Keling, Jimeng, and the new Adobe Firefly Video...",
    tags: ['Image Gen', 'Video Gen', 'Review'],
    userNotes: "",
    collections: ['c1'],
    aiAnalysis: {
      summary: "A curation of the top 10 design tools for 2026, comparing generation speeds and quality.",
      usageScenarios: ["Tool selection for agencies", "Workflow optimization"],
      coreKnowledge: ["Keling is winning on video speed", "Midjourney still leads on static texture"],
      extractedPrompts: []
    }
  },
  // --- NEW ADDED DATA (ID 5-12) ---
  {
    id: '5',
    title: 'DeepSeek-R1 vs OpenAI o1: Coding Benchmark',
    sourceUrl: '#',
    platform: Platform.Twitter,
    author: 'Code_Benchmarks',
    date: '2025-01-25',
    coverImage: 'https://picsum.photos/400/300?random=5',
    metrics: { likes: 9200, bookmarks: 3100, comments: 600 },
    contentType: ContentType.ToolReview,
    rawContent: "I ran DeepSeek-R1 through the standard SWE-bench. The results are surprising given the cost difference...",
    tags: ['Vibe Coding', 'DeepSeek', 'Review'],
    collections: ['c1'], // Added to Tools
    aiAnalysis: {
      summary: "Comparative analysis of DeepSeek-R1 and OpenAI o1 on coding benchmarks, focusing on cost-efficiency vs raw performance.",
      usageScenarios: ["Choosing backend LLMs", "Cost optimization for startups"],
      coreKnowledge: ["DeepSeek is 10x cheaper for similar reasoning tasks", "o1 still wins on highly complex architecture design"],
      extractedPrompts: []
    }
  },
  {
    id: '6',
    title: 'ComfyUI Flux Workflow for Consistent IP',
    sourceUrl: '#',
    platform: Platform.Xiaohongshu,
    author: 'Comfy_Wizard',
    date: '2025-01-26',
    coverImage: 'https://picsum.photos/400/300?random=6',
    metrics: { likes: 1500, bookmarks: 8900, comments: 200 },
    contentType: ContentType.PromptShare,
    rawContent: "This node setup allows you to swap clothes while keeping the character face 100% consistent using Flux LoRA.",
    tags: ['Image Gen', 'ComfyUI', 'Flux'],
    collections: ['c2'], // Added to Tips
    aiAnalysis: {
      summary: "A complex ComfyUI workflow sharing focusing on Identity Preservation (IP) using Flux models.",
      usageScenarios: ["Virtual try-on", "Game character asset creation"],
      coreKnowledge: ["Use IP-Adapter with Flux requires specific attention masking", "ControlNet strength should be 0.8"],
      extractedPrompts: ["(workflow json excluded for brevity)"]
    }
  },
  {
    id: '7',
    title: 'Legal Document Analysis using Gemini 2.0',
    sourceUrl: '#',
    platform: Platform.Manual,
    author: 'LegalTech_Daily',
    date: '2025-01-26',
    coverImage: 'https://picsum.photos/400/300?random=7',
    metrics: { likes: 300, bookmarks: 150, comments: 20 },
    contentType: ContentType.ToolReview,
    rawContent: "We tested Gemini 2.0 Flash on a 500-page contract. The context window handling is superior to GPT-4.",
    tags: ['Text Gen', 'Gemini', 'Productivity'],
    collections: ['c3'], // Added to Scenarios
    aiAnalysis: {
      summary: "Case study on using large context windows for legal discovery.",
      usageScenarios: ["Contract review", "Summarizing massive PDFs"],
      coreKnowledge: ["Gemini's 1M context window removes the need for RAG in small docs", "Accuracy remains high at the end of context"],
      extractedPrompts: []
    }
  },
  {
    id: '8',
    title: 'Cinematic Lighting Prompts for Magnific AI',
    sourceUrl: '#',
    platform: Platform.Twitter,
    author: 'Visual_Director',
    date: '2025-01-27',
    coverImage: 'https://picsum.photos/400/300?random=8',
    metrics: { likes: 4500, bookmarks: 2200, comments: 150 },
    contentType: ContentType.PromptCollection,
    rawContent: "Don't just upscale. Hallucinate details with these lighting prompts in Magnific.",
    tags: ['Image Gen', 'Magnific', 'Upscaling'],
    collections: ['c2'], // Added to Tips
    aiAnalysis: {
      summary: "List of descriptors to use during the upscaling process to add cinematic texture.",
      usageScenarios: ["Restoring old photos", "High-end print production"],
      coreKnowledge: ["Creativity slider needs to be > 30% to see lighting changes", "Use keywords like 'volumetric fog' and 'rembrandt lighting'"],
      extractedPrompts: ["Detailed pores, volumetric lighting, god rays, 8k texture, shot on IMAX"]
    }
  },
  {
    id: '9',
    title: 'Building a Local RAG with Ollama & Llama 3',
    sourceUrl: '#',
    platform: Platform.Manual,
    author: 'OpenSource_Dev',
    date: '2025-01-27',
    coverImage: 'https://picsum.photos/400/300?random=9',
    metrics: { likes: 6700, bookmarks: 3400, comments: 550 },
    contentType: ContentType.ToolReview,
    rawContent: "Stop paying for API credits. Here is how to set up a private RAG pipeline on your MacBook M3.",
    tags: ['Vibe Coding', 'LocalLLM', 'Ollama'],
    collections: ['c1', 'c2'], // Added to Tools AND Tips
    aiAnalysis: {
      summary: "Technical tutorial on setting up a local retrieval-augmented generation system.",
      usageScenarios: ["Private data search", "Offline documentation helper"],
      coreKnowledge: ["Ollama serves the model API locally", "Use LangChain for the retrieval logic"],
      extractedPrompts: []
    }
  },
  {
    id: '10',
    title: 'Fashion eCommerce: AI Model Swap Guide',
    sourceUrl: '#',
    platform: Platform.Xiaohongshu,
    author: 'Ecomm_AI',
    date: '2025-01-28',
    coverImage: 'https://picsum.photos/400/300?random=21',
    metrics: { likes: 12000, bookmarks: 8000, comments: 1200 },
    contentType: ContentType.PromptShare,
    rawContent: "How to reduce photography costs by 90% using Krea AI for model swapping.",
    tags: ['Image Gen', 'Krea', 'Business'],
    collections: ['c3'], // Added to Scenarios
    aiAnalysis: {
      summary: "Guide for eCommerce brands to use AI for catalogue imagery.",
      usageScenarios: ["Product catalog generation", "Localization of models"],
      coreKnowledge: ["Krea Real-time allows for instant posing feedback", "Keep background simple for better blends"],
      extractedPrompts: ["A fashion model wearing [Product], studio lighting, solid grey background, high fashion pose"]
    }
  },
  {
    id: '11',
    title: 'Sora vs Gen-3 vs Kling: The Ultimate Showdown',
    sourceUrl: '#',
    platform: Platform.Twitter,
    author: 'Video_Benchmarker',
    date: '2025-01-28',
    coverImage: 'https://picsum.photos/400/300?random=22',
    metrics: { likes: 8900, bookmarks: 2100, comments: 400 },
    contentType: ContentType.ToolReview,
    rawContent: "I generated the same prompt on all 3 major video models. Kling wins on motion, Gen-3 on texture.",
    tags: ['Video Gen', 'Review', 'Kling'],
    collections: ['c1'], // Added to Tools
    aiAnalysis: {
      summary: "Head-to-head comparison of top video generation models.",
      usageScenarios: ["Selecting the right tool for VFX", "Social media video creation"],
      coreKnowledge: ["Kling handles large motion best", "Gen-3 has the most realistic textures"],
      extractedPrompts: ["A drone shot flying through a narrow canyon in Utah, golden hour, 4k, cinematic motion"]
    }
  },
  {
    id: '12',
    title: 'System Prompts for Senior Developer Persona',
    sourceUrl: '#',
    platform: Platform.Manual,
    author: 'Prompt_Engineer',
    date: '2025-01-29',
    coverImage: 'https://picsum.photos/400/300?random=23',
    metrics: { likes: 2500, bookmarks: 1800, comments: 90 },
    contentType: ContentType.PromptCollection,
    rawContent: "Stop using default chatGPT. Paste this system prompt to get code reviews that actually catch bugs.",
    tags: ['Vibe Coding', 'Prompt'],
    collections: ['c2', 'c3'], // Added to Tips AND Scenarios
    aiAnalysis: {
      summary: "A robust system prompt designed to make LLMs act like a principal engineer.",
      usageScenarios: ["Code review", "Architecture planning"],
      coreKnowledge: ["Instruct the model to critique before coding", "Force the model to cite best practices"],
      extractedPrompts: ["You are a Principal Software Engineer at a FAANG company. Review the following code for: 1. Security vulnerabilities. 2. Performance bottlenecks. 3. Maintainability. Be harsh but constructive."]
    }
  }
];

export const INITIAL_TASKS: TrackingTask[] = [
  {
    id: 't1',
    keywords: 'Claude 3.5 Sonnet Coding',
    platforms: [Platform.Twitter],
    dateRange: { start: '2025-12-01', end: '2026-01-31' },
    status: TaskStatus.Running,
    itemsFound: 124,
    lastRun: 'Just now'
  },
  {
    id: 't2',
    keywords: 'Midjourney --v 7.0 leaks',
    platforms: [Platform.Twitter, Platform.Xiaohongshu],
    dateRange: { start: '2025-10-01', end: '2025-12-31' },
    status: TaskStatus.Completed,
    itemsFound: 45,
    lastRun: '2 hours ago'
  }
];

// Data found by crawlers but not yet "Saved" to the vault
// EXPANDED MOCK DATA FOR DASHBOARD DEMO
export const TRENDING_DATA: KnowledgeCard[] = [
  {
    id: 't-1',
    title: 'BREAKING: OpenAI Sora 2.0 leaked capabilities',
    sourceUrl: '#',
    platform: Platform.Twitter,
    author: 'Insider_AI',
    date: 'Just now',
    coverImage: 'https://picsum.photos/400/300?random=10',
    metrics: { likes: 15400, bookmarks: 4000, comments: 2200 },
    contentType: ContentType.ToolReview,
    rawContent: "Sora 2.0 allows for real-time physics editing...",
    tags: ['Video Gen', 'Sora', 'Leak'],
    aiAnalysis: { summary: "Leak suggests Sora 2.0 will include physics editing.", usageScenarios: [], coreKnowledge: [], extractedPrompts: [] }
  },
  {
    id: 't-2',
    title: 'ComfyUI New Node for ControlNet Speedup',
    sourceUrl: '#',
    platform: Platform.Xiaohongshu,
    author: 'ComfyMaster',
    date: '15m ago',
    coverImage: 'https://picsum.photos/400/300?random=11',
    metrics: { likes: 8500, bookmarks: 200, comments: 40 },
    contentType: ContentType.ToolReview,
    rawContent: "New node dropped. Makes controlnet stacking 2x faster.",
    tags: ['Image Gen', 'ComfyUI'],
    aiAnalysis: { summary: "Performance update for ComfyUI ControlNet nodes.", usageScenarios: [], coreKnowledge: [], extractedPrompts: [] }
  },
  {
    id: 't-3',
    title: 'Runway Gen-3 Alpha Prompt Guide for VFX',
    sourceUrl: '#',
    platform: Platform.Twitter,
    author: 'Motion_Design',
    date: '1h ago',
    coverImage: 'https://picsum.photos/400/300?random=12',
    metrics: { likes: 6200, bookmarks: 900, comments: 150 },
    contentType: ContentType.PromptShare,
    rawContent: "Motion brush is key. Use these settings...",
    tags: ['Video Gen', 'Runway'],
    aiAnalysis: { summary: "Guide on using Motion Brush in Runway Gen-3.", usageScenarios: [], coreKnowledge: [], extractedPrompts: [] }
  },
  {
    id: 't-4',
    title: 'Flux.1 LoRA Training: Zero to Hero',
    sourceUrl: '#',
    platform: Platform.Manual,
    author: 'Diffusers_Guy',
    date: '2h ago',
    coverImage: 'https://picsum.photos/400/300?random=13',
    metrics: { likes: 4300, bookmarks: 800, comments: 90 },
    contentType: ContentType.ToolReview,
    rawContent: "How to train Flux LoRA under 12GB VRAM...",
    tags: ['Image Gen', 'Flux'],
    aiAnalysis: { summary: "Comprehensive guide on LoRA training for Flux.1 models.", usageScenarios: [], coreKnowledge: [], extractedPrompts: [] }
  },
  {
    id: 't-5',
    title: 'Cursor + Claude 3.7: The Ultimate Stack',
    sourceUrl: '#',
    platform: Platform.Twitter,
    author: 'CodeNinja',
    date: '3h ago',
    coverImage: 'https://picsum.photos/400/300?random=14',
    metrics: { likes: 3100, bookmarks: 500, comments: 200 },
    contentType: ContentType.ToolReview,
    rawContent: "Stop writing boilerplate. Let Cursor do it.",
    tags: ['Vibe Coding', 'Cursor'],
    aiAnalysis: { summary: "Analysis of the productivity boost using Cursor with Claude 3.7.", usageScenarios: [], coreKnowledge: [], extractedPrompts: [] }
  },
  {
    id: 't-6',
    title: 'Bolt.new vs v0.dev: Vibe Coding Battle',
    sourceUrl: '#',
    platform: Platform.Twitter,
    author: 'Frontend_Wizard',
    date: '4h ago',
    coverImage: 'https://picsum.photos/400/300?random=18',
    metrics: { likes: 5600, bookmarks: 1200, comments: 450 },
    contentType: ContentType.ToolReview,
    rawContent: "Comparison of the two leading AI web development tools.",
    tags: ['Vibe Coding', 'WebDev'],
    aiAnalysis: { summary: "Direct comparison of Bolt.new and v0.dev for frontend generation.", usageScenarios: [], coreKnowledge: [], extractedPrompts: [] }
  },
  {
    id: 't-7',
    title: 'React Agent: The Future of Vibe Coding?',
    sourceUrl: '#',
    platform: Platform.Xiaohongshu,
    author: 'JS_Lover',
    date: '6h ago',
    coverImage: 'https://picsum.photos/400/300?random=19',
    metrics: { likes: 2800, bookmarks: 400, comments: 120 },
    contentType: ContentType.ToolReview,
    rawContent: "How autonomous agents are changing React development.",
    tags: ['Vibe Coding', 'React'],
    aiAnalysis: { summary: "Exploration of autonomous React agents.", usageScenarios: [], coreKnowledge: [], extractedPrompts: [] }
  },
  {
    id: 't-8',
    title: 'Prompt Engineering for Code Generation',
    sourceUrl: '#',
    platform: Platform.Manual,
    author: 'Senior_Dev',
    date: '1d ago',
    coverImage: 'https://picsum.photos/400/300?random=20',
    metrics: { likes: 1500, bookmarks: 800, comments: 50 },
    contentType: ContentType.PromptShare,
    rawContent: "Use these system prompts to get better code from Claude.",
    tags: ['Vibe Coding', 'Prompt'],
    aiAnalysis: { summary: "Collection of system prompts for coding assistants.", usageScenarios: [], coreKnowledge: [], extractedPrompts: [] }
  },
  {
    id: 't-9',
    title: 'Midjourney --cref is a Game Changer',
    sourceUrl: '#',
    platform: Platform.Xiaohongshu,
    author: 'DesignBot',
    date: '5h ago',
    coverImage: 'https://picsum.photos/400/300?random=15',
    metrics: { likes: 11200, bookmarks: 4200, comments: 800 },
    contentType: ContentType.PromptShare,
    rawContent: "Character reference is finally stable.",
    tags: ['Image Gen', 'Midjourney'],
    aiAnalysis: { summary: "Character consistency guide using --cref.", usageScenarios: [], coreKnowledge: [], extractedPrompts: [] }
  },
  {
    id: 't-10',
    title: 'Kling AI 1.5 Update Review',
    sourceUrl: '#',
    platform: Platform.Twitter,
    author: 'AI_Video_News',
    date: '1d ago',
    coverImage: 'https://picsum.photos/400/300?random=16',
    metrics: { likes: 2100, bookmarks: 300, comments: 50 },
    contentType: ContentType.ToolReview,
    rawContent: "Kling just increased generation time to 10s...",
    tags: ['Video Gen', 'Kling'],
    aiAnalysis: { summary: "Review of Kling 1.5 update.", usageScenarios: [], coreKnowledge: [], extractedPrompts: [] }
  }
];

export const INITIAL_COLLECTIONS: Collection[] = [
  { 
    id: 'c1', 
    name: 'AIGC Tools & Env Setup', 
    coverImage: 'https://picsum.photos/200/200?random=100', 
    itemCount: 9 
  },
  { 
    id: 'c2', 
    name: 'Usage Tips & Tricks', 
    coverImage: 'https://picsum.photos/200/200?random=101', 
    itemCount: 38 
  },
  { 
    id: 'c3', 
    name: 'Real-world Scenarios', 
    coverImage: 'https://picsum.photos/200/200?random=102', 
    itemCount: 2 
  }
];