import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini API Client using standard environment variables hook
const geminiApiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (geminiApiKey && geminiApiKey !== 'MY_GEMINI_API_KEY') {
  ai = new GoogleGenAI({
    apiKey: geminiApiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Multi-Provider Unified LLM Interface (Refactored to route to Gemini and other providers)
interface LlmCallOptions {
  provider: 'gemini' | 'openai' | 'anthropic' | 'deepseek';
  systemInstruction?: string;
  prompt?: string;
  messages?: Array<{ role: 'user' | 'system' | 'assistant'; content: string }>;
  responseSchema?: any; // Structured outputs
  apiKeys: {
    gemini?: string;
    openai?: string; // Kept in interface for client compatibility, ignored internally
    anthropic?: string;
    deepseek?: string;
  };
}

async function callLlm(options: LlmCallOptions): Promise<string> {
  const { provider, systemInstruction, prompt, messages, responseSchema, apiKeys } = options;

  // We are completely migrating away from OpenAI. Seamlessly route any OpenAI request to Google Gemini
  const activeProvider = provider === 'openai' ? 'gemini' : provider;

  if (activeProvider === 'anthropic') {
    const key = apiKeys.anthropic;
    if (!key) throw new Error("Anthropic API Key is missing");

    const messagesArray = [{ role: "user", content: prompt || "" }];
    const requestBody: any = {
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4000,
      messages: messagesArray,
    };
    if (systemInstruction) {
      requestBody.system = systemInstruction;
    }
    if (responseSchema) {
      messagesArray[0].content += `\n\nIMPORTANT: You must respond ONLY with a raw JSON object conforming exactly to this JSON schema: ${JSON.stringify(responseSchema)}. Do not write any other introductory or explanatory text.`;
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(requestBody)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API returned status ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data.content?.[0]?.text || "";
  }

  if (activeProvider === 'deepseek') {
    const key = apiKeys.deepseek;
    if (!key) throw new Error("DeepSeek API Key is missing");

    const messagesArray = [];
    if (systemInstruction) {
      messagesArray.push({ role: "system", content: systemInstruction });
    }
    messagesArray.push({ role: "user", content: prompt || "" });

    const requestBody: any = {
      model: "deepseek-chat",
      messages: messagesArray,
    };
    if (responseSchema) {
      messagesArray[0].content += `\n\nIMPORTANT: You must respond ONLY with a raw JSON object conforming exactly to this JSON schema: ${JSON.stringify(responseSchema)}. Do not write any other introductory or explanatory text.`;
    }

    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`DeepSeek API returned status ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }

  // --- GOOGLE GEMINI (AI STUDIO) UTILITY ---
  // Resolve key from VITE_GEMINI_API_KEY or GEMINI_API_KEY
  const activeKey = apiKeys.gemini || process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || geminiApiKey;
  if (!activeKey || activeKey === 'MY_GEMINI_API_KEY') {
    throw new Error("Gemini API Key is missing or default");
  }

  // Dynamically initialize client to verify active credentials dynamically on every request
  const geminiClient = new GoogleGenAI({
    apiKey: activeKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build-dynamic',
      },
    },
  });

  const config: any = {};
  
  // Payload Conversion / Mapping (OpenAI messages to Gemini parameters)
  let contents: any = prompt || "";
  let finalSystemInstruction = systemInstruction || "";

  if (messages && messages.length > 0) {
    const systemMsg = messages.find(m => m.role === 'system');
    if (systemMsg) {
      finalSystemInstruction = systemMsg.content;
    }

    const nonSystem = messages.filter(m => m.role !== 'system');
    if (nonSystem.length > 0) {
      contents = nonSystem.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));
    }
  }

  if (finalSystemInstruction) {
    config.systemInstruction = finalSystemInstruction;
  }
  if (responseSchema) {
    config.responseMimeType = 'application/json';
    config.responseSchema = responseSchema;
  }

  try {
    // Hardcoded default model target is gemini-2.5-flash for maximum free tier efficiency and volume
    const response = await geminiClient.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config,
    });

    return response.text?.trim() || "";
  } catch (err: any) {
    const is429 = (err: any) => {
      const errMsg = String(err.message || err).toLowerCase();
      return (
        errMsg.includes('429') ||
        errMsg.includes('resource_exhausted') ||
        errMsg.includes('resource_exhaust') ||
        errMsg.includes('rate limit') ||
        err.status === 429 ||
        err.statusCode === 429
      );
    };

    if (is429(err)) {
      console.warn("Google Gemini API returned 429 (Rate Limit Exceeded). Bubbling up 429 rate limit exception for client-side override/BYOK...");
      const rateLimitError = new Error("Google Gemini API Rate Limit Exceeded (429 / RESOURCE_EXHAUSTED). Please configure your own API key in settings.");
      (rateLimitError as any).status = 429;
      throw rateLimitError;
    }

    throw err;
  }
}


// Helper to perform Tavily Web Search
async function performSearch(query: string, searchKey?: string): Promise<{ results: string; sources: Array<{label: string, url: string}> }> {
  let searchRaw = "";
  let sources: Array<{label: string, url: string}> = [];

  if (searchKey && searchKey !== 'MY_SEARCH_API_KEY' && searchKey !== '') {
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: searchKey,
          query: query,
          max_results: 3,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          searchRaw = data.results.map((r: any) => r.content).join('\n');
          sources = data.results.map((r: any) => ({
            label: r.title || 'Web Reference',
            url: r.url,
          }));
        }
      }
    } catch (e) {
      console.error('Tavily Search API Error:', e);
    }
  }

  return { results: searchRaw, sources };
}

// Helper to generate suggestions/best practices for a single micro-step
async function getBestPracticesForStep(
  stepTitle: string,
  searchQuery: string,
  searchKey?: string,
  provider?: string,
  apiKeys?: any
): Promise<{ suggestions: string; sources: Array<{label: string, url: string}>; isFallback: boolean }> {
  let { results: searchRaw, sources } = await performSearch(searchQuery, searchKey);
  let isFallback = false;

  if (!searchRaw) {
    isFallback = true;
    const lower = stepTitle.toLowerCase();
    if (lower.includes('audit') || lower.includes('research') || lower.includes('competitor') || lower.includes('gather')) {
      searchRaw = `* **Standard SWOT Matrix**: Analyze competitor positioning across Core strengths, Weaknesses, Industry opportunities, and Threats.
* **MECE Framework**: Ensure your requirements gather is Mutually Exclusive and Collectively Exhaustive.
* **User Review Mining**: Scan competitor app store reviews or forums to pinpoint friction points.`;
      sources = [
        { label: 'Competitor Analysis Guide (Offline)', url: 'https://www.interaction-design.org' },
        { label: 'UX Research Fundamentals (Offline)', url: 'https://www.nngroup.com' },
      ];
    } else if (lower.includes('draft') || lower.includes('outline') || lower.includes('spec') || lower.includes('architecture')) {
      searchRaw = `* **RFC-style Documenting**: Format key technical deliverables with structured headings: Objective, Architecture, Trade-offs, and Security.
* **Executive Summary First**: Keep top-level business outcomes upfront to align diverse stakeholders.
* **Define Boundary Conditions**: Explicitly list what is out-of-scope to avoid scope creep.`;
      sources = [
        { label: 'Technical Spec PRD Templates (Offline)', url: 'https://github.com' },
        { label: 'Product Plan Strategy Guide (Offline)', url: 'https://www.productplan.com' },
      ];
    } else if (lower.includes('security') || lower.includes('compliance') || lower.includes('privacy') || lower.includes('masking') || lower.includes('key')) {
      searchRaw = `* **PII Redaction Protocols**: Run standard regex pipelines locally to mask user details before any third-party dispatch.
* **Secure Secret Storage**: Store sensitive keys in environment files; never hardcode credentials into active files.
* **OWASP API Security Top 10**: Follow standard guidelines regarding token auth, rate limiting, and input sanitization.`;
      sources = [
        { label: 'OWASP Security Guidelines (Offline)', url: 'https://owasp.org' },
        { label: 'GCP Best Practices for Secrets (Offline)', url: 'https://cloud.google.com' },
      ];
    } else {
      searchRaw = `* **Atomize Milestones**: Keep micro-steps strictly bounded within 15-30 minute focused execution slots.
* **Single-Tasking Zone**: Mute non-essential notifications and set a timer to focus solely on this specific step.
* **High-Level OKR Check**: Continuously cross-reference step objectives with your global milestone target.`;
      sources = [
        { label: 'Circadian Energy Maximization (Offline)', url: 'https://hbr.org' },
      ];
    }
  }

  const activeProvider = (provider as any) || 'gemini';
  const hasKeys = apiKeys && (apiKeys.gemini || apiKeys.openai || apiKeys.anthropic || apiKeys.deepseek);

  const canUseLlm = hasKeys || (activeProvider === 'gemini' && !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');

  // If dynamic keys or server env keys are active, let's ask LLM to polish search results
  if (canUseLlm) {
    try {
      const polishedResponse = await callLlm({
        provider: activeProvider,
        prompt: `Based on the following web search results, write 2-3 extremely clear, highly focused, and actionable best practices, frameworks, or tips for this micro-step: "${stepTitle}".
Keep your response concise, styled in Markdown bullet points. Do not write any intro, outro, or conversational filler. Simply return the bullet points directly.

Web Search Results:
${searchRaw}`,
        apiKeys: apiKeys || {},
      });
      if (polishedResponse) {
        return {
          suggestions: polishedResponse.trim(),
          sources,
          isFallback,
        };
      }
    } catch (e) {
      console.error('LLM Suggestion Formatting Error:', e);
    }
  }

  // Otherwise return plain formatted bullets
  return {
    suggestions: searchRaw,
    sources,
    isFallback,
  };
}

// Main decomposition API
app.get('/api/proxy-ical', async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'iCal URL is required' });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({ error: `Failed to fetch calendar: ${response.statusText}` });
    }
    const text = await response.text();
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.send(text);
  } catch (err: any) {
    console.error('Error proxying iCal link:', err);
    res.status(500).json({ error: err.message || 'Failed to proxy iCal URL' });
  }
});

function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function checkOverlap(startTimeStr: string, durationMinutes: number, fixedTasks: any[], events: any[]) {
  const start = timeToMinutes(startTimeStr);
  const end = start + durationMinutes;

  const allBlocks = [
    ...(fixedTasks || []).map((ft: any) => ({ start: timeToMinutes(ft.startTime), end: timeToMinutes(ft.endTime), startTime: ft.startTime, endTime: ft.endTime, title: ft.title })),
    ...(events || []).map((e: any) => ({ start: timeToMinutes(e.startTime), end: timeToMinutes(e.endTime), startTime: e.startTime, endTime: e.endTime, title: e.title }))
  ];

  for (const block of allBlocks) {
    if (start < block.end && end > block.start) {
      return block; // Returns the overlapping block
    }
  }
  return null;
}

function findFirstFreeSlot(durationMinutes: number, fixedTasks: any[], events: any[], wakeHour: number): string {
  for (let h = wakeHour; h < 22; h++) {
    const timeStr = `${h.toString().padStart(2, '0')}:00`;
    if (!checkOverlap(timeStr, durationMinutes, fixedTasks, events)) {
      return timeStr;
    }
  }
  return '11:00'; // Hard fallback
}

const FREE_DAILY_LIMIT = 100;

app.post('/api/decompose', async (req, res) => {
  const { title, description, dailyAiCallsCount, fixedTasks = [], events = [], habitProfile = [], wakeHour = 7 } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  // Support keys and provider from headers for user-provided API keys
  const clientProvider = (req.headers['x-ai-provider'] || 'gemini') as 'gemini' | 'openai' | 'anthropic' | 'deepseek';
  const clientGeminiKey = req.headers['x-gemini-api-key'] as string;
  const clientAnthropicKey = req.headers['x-anthropic-api-key'] as string;
  const clientDeepseekKey = req.headers['x-deepseek-api-key'] as string;
  const clientSearchKey = req.headers['x-search-api-key'] as string;

  // Seamlessly map client-side OpenAI choices to Gemini backend integrations
  const activeProvider = clientProvider === 'openai' ? 'gemini' : clientProvider;

  // Use client key if provided; otherwise, fall back to server-side environment keys (AI as a service)
  const apiKeys = {
    gemini: (clientGeminiKey && clientGeminiKey.trim() !== 'MY_GEMINI_API_KEY' && clientGeminiKey.trim() !== '') ? clientGeminiKey.trim() : (process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || geminiApiKey),
    anthropic: (clientAnthropicKey && clientAnthropicKey.trim() !== '') ? clientAnthropicKey.trim() : process.env.ANTHROPIC_API_KEY,
    deepseek: (clientDeepseekKey && clientDeepseekKey.trim() !== '') ? clientDeepseekKey.trim() : process.env.DEEPSEEK_API_KEY,
  };

  const activeSearchKey = (clientSearchKey && clientSearchKey.trim() !== 'MY_SEARCH_API_KEY' && clientSearchKey.trim() !== '') ? clientSearchKey.trim() : process.env.SEARCH_API_KEY;

  const isAiAvailable = (activeProvider === 'gemini' && !!apiKeys.gemini && apiKeys.gemini !== 'MY_GEMINI_API_KEY') ||
                        (activeProvider === 'anthropic' && !!apiKeys.anthropic) ||
                        (activeProvider === 'deepseek' && !!apiKeys.deepseek);

  const isSearchAvailable = !!(activeSearchKey && activeSearchKey !== 'MY_SEARCH_API_KEY' && activeSearchKey !== '');

  let resultTask: any = null;

  if (isAiAvailable) {
    try {
      let retries = 3;
      let attempt = 0;
      let parsed: any = null;
      let overlapBlock: any = null;
      let correctivePrompt = '';

      while (attempt < retries) {
        attempt++;
        const systemInstruction = `You are the Core Scheduler Agent. Decompose the high-level task/milestone into exactly 3 sequential, atomic micro-steps for our daily focus schedule.
You must ALSO recommend a start time ("scheduledTime") for this task.

You must strictly schedule around the user's pre-existing timeline.
Strict Hierarchy:
1. ABSOLUTE CONSTRAINTS: You CANNOT overlap or overwrite any fixed routine blocks or locked iCal calendar events.
2. SYSTEM ADJUSTMENTS: You must respect the user's Behavioral Habit Profile boundaries (e.g. fatigue windows, peak hours, sleep/wake hours).
3. DYNAMIC ALLOCATION: Fit the task (total duration of its micro-steps combined) into the remaining free intervals of the day.

User's Wake Hour: ${wakeHour}:00 AM
User's Behavioral Habit Profile: ${JSON.stringify(habitProfile)}
Existing Calendar holds (DO NOT OVERLAP THESE):
- Fixed/Routine Tasks: ${JSON.stringify(fixedTasks.map((t: any) => ({ title: t.title, startTime: t.startTime, endTime: t.endTime })))}
- Pre-scheduled Tasks: ${JSON.stringify(events.map((e: any) => ({ title: e.title, startTime: e.startTime, endTime: e.endTime })))}

${correctivePrompt}`;

        const prompt = `Decompose the task: "${title}" (${description || ''}). Recommend a safe, non-overlapping start time "scheduledTime" strictly avoiding pre-existing calendar holds. Ensure the response conforms exactly to the requested JSON schema.`;

        const responseText = await callLlm({
          provider: activeProvider,
          systemInstruction,
          prompt,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              energyCost: { type: Type.STRING, description: 'High, Medium, or Low' },
              scheduledTime: { type: Type.STRING, description: 'HH:MM' },
              microSteps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    estimatedMinutes: { type: Type.INTEGER },
                    energyRequired: { type: Type.STRING, description: 'High, Medium, or Low' },
                    draftContent: { type: Type.STRING },
                    searchQuery: { type: Type.STRING, description: 'A highly specific search query to get web tips' },
                  },
                  required: ['title', 'estimatedMinutes', 'energyRequired', 'draftContent', 'searchQuery'],
                },
              },
            },
            required: ['title', 'description', 'energyCost', 'scheduledTime', 'microSteps'],
          },
          apiKeys,
        });

        let cleanText = responseText.trim();
        if (cleanText.startsWith('```json')) {
          cleanText = cleanText.replace(/^```json/, '').replace(/```$/, '').trim();
        } else if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/^```/, '').replace(/```$/, '').trim();
        }
        parsed = JSON.parse(cleanText);
        if (!parsed.scheduledTime || !parsed.microSteps || parsed.microSteps.length === 0) {
          continue;
        }

        // Validate scheduledTime format and calculate total duration
        const totalDuration = parsed.microSteps.reduce((acc: number, step: any) => acc + (step.estimatedMinutes || 20), 0);
        overlapBlock = checkOverlap(parsed.scheduledTime, totalDuration, fixedTasks, events);

        if (!overlapBlock) {
          // Success! Non-overlapping slot found
          resultTask = parsed;
          break;
        } else {
          console.warn(`[3-Step Scheduler] Overlap detected on attempt ${attempt}. Scheduled: ${parsed.scheduledTime} (duration: ${totalDuration}m) overlaps with "${overlapBlock.title}" (${overlapBlock.startTime} - ${overlapBlock.endTime}). Retrying...`);
          correctivePrompt = `CRITICAL WARNING: Your previously recommended start time of "${parsed.scheduledTime}" for this task (total duration ${totalDuration} minutes) overlapped with the existing event: "${overlapBlock.title}" from ${overlapBlock.startTime} to ${overlapBlock.endTime}. You MUST recommend a different start time that is completely free of any overlap.`;
        }
      }

      if (!resultTask && parsed) {
        // Hard fallback to first free slot
        const totalDuration = parsed.microSteps.reduce((acc: number, step: any) => acc + (step.estimatedMinutes || 20), 0);
        parsed.scheduledTime = findFirstFreeSlot(totalDuration, fixedTasks, events, wakeHour);
        resultTask = parsed;
      }
    } catch (e: any) {
      console.error('LLM Decomposition Error:', e);
      const is429 = (err: any) => {
        const errMsg = String(err.message || err).toLowerCase();
        return (
          errMsg.includes('429') ||
          errMsg.includes('resource_exhausted') ||
          errMsg.includes('resource_exhaust') ||
          errMsg.includes('rate limit') ||
          err.status === 429 ||
          err.statusCode === 429
        );
      };
      if (is429(e)) {
        console.warn("Google Gemini API returned 429 (Rate Limit Exceeded) in decompose. Prompting user for BYOK...");
        return res.status(429).json({
          error: 'RESOURCE_EXHAUSTED',
          message: 'Google Gemini API Rate Limit Exceeded (429). Please configure your personal Gemini API key in settings override.'
        });
      }
    }
  }

  // Local Offline Fallback Model if AI is unavailable or failed
  if (!resultTask) {
    const lower = title.toLowerCase();
    let energyCost: 'High' | 'Medium' | 'Low' = 'Medium';
    let microSteps = [];

    if (lower.includes('competitor') || lower.includes('campaign') || lower.includes('marketing')) {
      energyCost = 'Medium';
      microSteps = [
        {
          title: 'Gather and Audit Competitor Campaign References',
          estimatedMinutes: 20,
          energyRequired: 'Medium' as const,
          draftContent: '# Competitor Campaign Baseline\n- Competitor A strategy summary:\n- Identified channels:\n- Slogans and visual motifs used:',
          searchQuery: 'Competitor marketing campaign analysis best practices swot',
        },
        {
          title: 'Draft Core Campaign Positioning & Messaging Outline',
          estimatedMinutes: 30,
          energyRequired: 'High' as const,
          draftContent: '# Campaign Positioning Brief\n- Target Audience:\n- Primary Value Prop:\n- Core Messaging Pillars:\n- Call to Actions:',
          searchQuery: 'How to write a brand campaign positioning brief templates',
        },
        {
          title: 'Verify Brand Consistency & Compliance Checklist',
          estimatedMinutes: 15,
          energyRequired: 'Low' as const,
          draftContent: '# Brand Compliance Check\n- Tone of voice checklist:\n- Legal clearances needed:\n- Visual logo sizing requirements verified:',
          searchQuery: 'Marketing compliance checklist brand guidelines',
        },
      ];
    } else if (lower.includes('exam') || lower.includes('prep') || lower.includes('study') || lower.includes('slide')) {
      energyCost = 'High';
      microSteps = [
        {
          title: 'Review Syllabus & Categorize High-Weight Concepts',
          estimatedMinutes: 20,
          energyRequired: 'Medium' as const,
          draftContent: '# Exam Topics Prioritization\n- Primary concepts (High weight):\n- Secondary concepts (Medium weight):\n- Reference text chapters:',
          searchQuery: 'How to study for university exams active recall method',
        },
        {
          title: 'Deconstruct Lecture Slides & Write Summary Outlines',
          estimatedMinutes: 40,
          energyRequired: 'High' as const,
          draftContent: '# Key Lecture Summaries\n- Lecture 1 Core Takeaways:\n- Lecture 2 Formulations:\n- Frequently confused terms definition:',
          searchQuery: 'How to make revision notes effectively university',
        },
        {
          title: 'Run Active Recall Practice Questions & Mock Test',
          estimatedMinutes: 15,
          energyRequired: 'Medium' as const,
          draftContent: '# Practice Session Results\n- Questions attempted:\n- Success Rate:\n- Concepts needing immediate review:',
          searchQuery: 'Active recall spaced repetition practice templates',
        },
      ];
    } else if (lower.includes('onboarding') || lower.includes('ux') || lower.includes('wireframe') || lower.includes('optimize')) {
      energyCost = 'High';
      microSteps = [
        {
          title: 'Map User Onboarding Funnels & Identify Drop-offs',
          estimatedMinutes: 20,
          energyRequired: 'Medium' as const,
          draftContent: '# Onboarding Funnel Audit\n- Current step count:\n- Drop-off rate at step 2:\n- Hypothesized friction points:',
          searchQuery: 'User onboarding UX drop off points optimization best practices',
        },
        {
          title: 'Draft Wireframe Concepts for Simplified Flow',
          estimatedMinutes: 45,
          energyRequired: 'High' as const,
          draftContent: '# Onboarding Wireframe Specs\n- Screen 1 (Simplified signup):\n- Screen 2 (Interactive onboarding helper):\n- Layout grid requirements:',
          searchQuery: 'Wireframing mobile app onboarding best patterns',
        },
        {
          title: 'Review WCAG Contrast & Accessibility Standards',
          estimatedMinutes: 15,
          energyRequired: 'Low' as const,
          draftContent: '# Accessibility Compliance Audit\n- Focus states color contrast check:\n- Screen reader alt text for images:\n- Keyboard navigation feasibility:',
          searchQuery: 'WCAG 2.1 color contrast ratios accessibility checklist',
        },
      ];
    } else {
      // Default standard fallback
      energyCost = 'Medium';
      microSteps = [
        {
          title: 'Information Gathering & Initial Requirements Audit',
          estimatedMinutes: 20,
          energyRequired: 'Medium' as const,
          draftContent: '# Core Requirements Summary\n- Deliverables:\n- Deadlines:\n- Known dependencies & resources:',
          searchQuery: 'How to gather product requirements checklist',
        },
        {
          title: 'Draft Executive Outline & Build Core Content Structure',
          estimatedMinutes: 35,
          energyRequired: 'High' as const,
          draftContent: '# Draft Outlines & Content Blocks\n- Heading 1:\n- Content body points:\n- Intended summaries:',
          searchQuery: 'Technical writing executive summary outline templates',
        },
        {
          title: 'Refining Polish & Final Quality Assurance Compliance Checklist',
          estimatedMinutes: 15,
          energyRequired: 'Low' as const,
          draftContent: '# Final QA Checklist\n- Typos & proofreading check:\n- Structural alignment check:\n- Deliverable successfully signed off:',
          searchQuery: 'Proofreading content checklist technical specs',
        },
      ];
    }

    resultTask = {
      title,
      description: description || `Task decomposed offline from: "${title}"`,
      energyCost,
      microSteps,
      scheduledTime: findFirstFreeSlot(60, fixedTasks, events, wakeHour),
    };
  }

  // Enrich each micro-step with online best practices using the search query
  const enrichedSteps = [];
  for (let step of resultTask.microSteps) {
    const { suggestions, sources, isFallback } = await getBestPracticesForStep(
      step.title,
      step.searchQuery || step.title,
      activeSearchKey,
      clientProvider,
      apiKeys
    );

    // Formulate final format matching our client's expectations
    enrichedSteps.push({
      id: `ms-dyn-${Math.random().toString(36).substr(2, 9)}`,
      title: step.title,
      estimatedMinutes: step.estimatedMinutes || 20,
      energyRequired: step.energyRequired || 'Medium',
      status: 'todo',
      draftContent: step.draftContent || '',
      resources: [
        ...sources.map((s, idx) => ({
          id: `res-dyn-${Date.now()}-${idx}`,
          label: s.label,
          url: s.url,
          type: 'search' as const,
        })),
      ],
      suggestions, // Web search suggestions
      isFallback, // Flag indicating if we fallback to offline tips
    });
  }

  const finalTask = {
    id: `t-dyn-${Date.now()}`,
    title: resultTask.title,
    description: resultTask.description,
    deadline: 'Today, 6:00 PM',
    energyCost: resultTask.energyCost,
    status: 'pending',
    category: 'AI Decoded',
    scheduledTime: resultTask.scheduledTime || '11:00',
    microSteps: enrichedSteps,
    // Add flags about keys so the frontend can notify users beautifully!
    aiMeta: {
      geminiFallback: !isAiAvailable,
      searchFallback: !isSearchAvailable,
    },
  };

  res.json(finalTask);
});

app.post('/api/evening-reflection', async (req, res) => {
  const { rating, challenges = [], rawInput = '', completedTasks = [], uncompletedTasks = [] } = req.body;

  const clientProvider = (req.headers['x-ai-provider'] || 'gemini') as 'gemini' | 'openai' | 'anthropic' | 'deepseek';
  const clientGeminiKey = req.headers['x-gemini-api-key'] as string;
  const clientAnthropicKey = req.headers['x-anthropic-api-key'] as string;
  const clientDeepseekKey = req.headers['x-deepseek-api-key'] as string;

  const activeProvider = clientProvider === 'openai' ? 'gemini' : clientProvider;

  const apiKeys = {
    gemini: (clientGeminiKey && clientGeminiKey.trim() !== 'MY_GEMINI_API_KEY' && clientGeminiKey.trim() !== '') ? clientGeminiKey.trim() : (process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || geminiApiKey),
    anthropic: (clientAnthropicKey && clientAnthropicKey.trim() !== '') ? clientAnthropicKey.trim() : process.env.ANTHROPIC_API_KEY,
    deepseek: (clientDeepseekKey && clientDeepseekKey.trim() !== '') ? clientDeepseekKey.trim() : process.env.DEEPSEEK_API_KEY,
  };

  const isAiAvailable = (activeProvider === 'gemini' && !!apiKeys.gemini && apiKeys.gemini !== 'MY_GEMINI_API_KEY') ||
                        (activeProvider === 'anthropic' && !!apiKeys.anthropic) ||
                        (activeProvider === 'deepseek' && !!apiKeys.deepseek);

  if (!isAiAvailable) {
    const defaultFeedback = `Good job reflecting on your day! ${
      challenges.length > 0 ? `To bypass your noted challenges (${challenges.join(', ')}), try building in 15-minute buffers after core intensive work blocks tomorrow.` : "Keep up the fantastic focus momentum!"
    }`;
    return res.json({ feedback: defaultFeedback });
  }

  try {
    const systemInstruction = `You are a warm, professional, high-performance Focus Coach.
The user is filling out their Evening Standup. Your goal is to analyze their day, offer highly actionable cognitive strategies, and explain how they can adjust their schedule tomorrow to avoid their specific challenges.

Keep your response to 2-3 sentences. It must be encouraging, clear, and highly focused on feedforward actions.`;

    const prompt = `Today's Metrics:
Rating: ${rating}/5
Focus/Energy Challenges: ${challenges.join(', ')}
User's Reflection notes: "${rawInput}"
Completed Tasks: ${completedTasks.join(', ') || 'None'}
Remaining Tasks: ${uncompletedTasks.join(', ') || 'None'}

Provide personalized coaching feedback. Mention how they can adjust their calendar tomorrow to sidestep these specific pitfalls.`;

    const responseText = await callLlm({
      provider: activeProvider,
      systemInstruction,
      prompt,
      apiKeys,
    });

    res.json({ feedback: responseText.trim() });
  } catch (err) {
    console.error("Evening reflection API error:", err);
    res.status(500).json({ error: "Failed to generate coaching suggestions." });
  }
});

app.post('/api/refine-schedule', async (req, res) => {
  const { tasks = [], events = [], fixedTasks = [], userPrompt, habitProfile = [], wakeHour = 7, dailyAiCallsCount, pastReflections = [] } = req.body;
  if (!userPrompt) {
    return res.status(400).json({ error: 'User prompt is required' });
  }

  // Support keys and provider from headers for user-provided API keys
  const clientProvider = (req.headers['x-ai-provider'] || 'gemini') as 'gemini' | 'openai' | 'anthropic' | 'deepseek';
  const clientGeminiKey = req.headers['x-gemini-api-key'] as string;
  const clientAnthropicKey = req.headers['x-anthropic-api-key'] as string;
  const clientDeepseekKey = req.headers['x-deepseek-api-key'] as string;

  // Seamlessly map client-side OpenAI choices to Gemini backend integrations
  const activeProvider = clientProvider === 'openai' ? 'gemini' : clientProvider;

  // Use client key if provided; otherwise, fall back to server-side environment keys (AI as a service)
  const apiKeys = {
    gemini: (clientGeminiKey && clientGeminiKey.trim() !== 'MY_GEMINI_API_KEY' && clientGeminiKey.trim() !== '') ? clientGeminiKey.trim() : (process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || geminiApiKey),
    anthropic: (clientAnthropicKey && clientAnthropicKey.trim() !== '') ? clientAnthropicKey.trim() : process.env.ANTHROPIC_API_KEY,
    deepseek: (clientDeepseekKey && clientDeepseekKey.trim() !== '') ? clientDeepseekKey.trim() : process.env.DEEPSEEK_API_KEY,
  };

  const isAiAvailable = (activeProvider === 'gemini' && !!apiKeys.gemini && apiKeys.gemini !== 'MY_GEMINI_API_KEY') ||
                        (activeProvider === 'anthropic' && !!apiKeys.anthropic) ||
                        (activeProvider === 'deepseek' && !!apiKeys.deepseek);

  if (!isAiAvailable) {
    // Elegant local fallback logic
    const lowerPrompt = userPrompt.toLowerCase();
    const updatedTasks: any[] = [];
    const updatedEvents: any[] = [];
    let detectedPattern = "Keep a rest slot right after intensive meetings";

    // Let's look for specific times mentioned, like 10:30, 11:30, 9:00, etc.
    const timeMatch = userPrompt.match(/(\d{1,2}):(\d{2})/);
    let targetTime = "10:30";
    if (timeMatch) {
      targetTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
    } else if (lowerPrompt.includes("11")) {
      targetTime = "11:00";
    } else if (lowerPrompt.includes("10")) {
      targetTime = "10:30";
    }

    // Identify which task to reschedule
    let targetTaskId = "t1"; // Strategy Proposal ID by default
    const matchedTask = tasks.find((t: any) => {
      const titleLower = t.title.toLowerCase();
      return titleLower.split(' ').some((word: string) => word.length > 3 && lowerPrompt.includes(word));
    });
    if (matchedTask) {
      targetTaskId = matchedTask.id;
    }

    // Update that task
    updatedTasks.push({ id: targetTaskId, scheduledTime: targetTime });

    // Also update the corresponding event if it is connected
    const connectedEvent = events.find((e: any) => e.connectedTaskId === targetTaskId || e.id === 'e3');
    if (connectedEvent) {
      // Parse targetTime and add 1.5 hours duration
      const [h, m] = targetTime.split(':').map(Number);
      const endH = (h + 1) + Math.floor((m + 30) / 60);
      const endM = (m + 30) % 60;
      const endTimeStr = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
      updatedEvents.push({
        id: connectedEvent.id,
        startTime: targetTime,
        endTime: endTimeStr,
        title: connectedEvent.title
      });
    }

    if (lowerPrompt.includes("coffee") || lowerPrompt.includes("energy") || lowerPrompt.includes("peak")) {
      detectedPattern = "Align strategic tasks with morning peak energy hours";
    } else if (lowerPrompt.includes("meeting") || lowerPrompt.includes("rest") || lowerPrompt.includes("buffer")) {
      detectedPattern = "Insert a 30-minute buffer block after high-drain events";
    }

    const coachingSummary = `I have adjusted your schedule! ${matchedTask ? `"${matchedTask.title}"` : 'Your strategic task'} has been scheduled at ${targetTime} to match your peak cognitive energy window, right after your morning routines.`;

    return res.json({
      updatedTasks,
      updatedEvents: events.map((e: any) => {
        const updated = updatedEvents.find((ue: any) => ue.id === e.id);
        return updated ? { ...e, startTime: updated.startTime, endTime: updated.endTime, title: updated.title } : e;
      }),
      detectedPattern,
      coachingSummary
    });
  }

  try {
    let retries = 3;
    let attempt = 0;
    let parsed: any = null;
    let correctivePrompt = '';

    while (attempt < retries) {
      attempt++;
      const systemInstruction = `You are the Core Schedule Adjustment Agent.
The user wants to adjust their daily focus schedule.

Strict Hierarchy for adjusting:
1. ABSOLUTE CONSTRAINTS: You CANNOT move, overlap, or overwrite any fixed routine blocks or locked iCal meetings (fixedTasks). They are non-negotiable anchors.
2. SYSTEM ADJUSTMENTS: You must respect the user's Behavioral Habit Profile boundaries (e.g. fatigue windows, peak hours, sleep/wake hours).
3. DYNAMIC ALLOCATION: You can move or reschedule other tasks and scheduled events to satisfy the user's request, but ONLY into the remaining free intervals of the day.

User Wake Hour: ${wakeHour}:00 AM
User's Behavioral Habit Profile: ${JSON.stringify(habitProfile)}
Locked Daily Routines & iCal Meetings (DO NOT TOUCH):
${JSON.stringify(fixedTasks.map((t: any) => ({ id: t.id, title: t.title, startTime: t.startTime, endTime: t.endTime })))}

Current Tasks to schedule:
${JSON.stringify(tasks.map((t: any) => ({ id: t.id, title: t.title, scheduledTime: t.scheduledTime, duration: 60 })))}

Current Scheduled Events:
${JSON.stringify(events.map((e: any) => ({ id: e.id, title: e.title, startTime: e.startTime, endTime: e.endTime, connectedTaskId: e.connectedTaskId })))}

${pastReflections && pastReflections.length > 0 ? `
Historical Focus Challenges & Reflections Memory:
${JSON.stringify(pastReflections.slice(-5).map((r: any) => ({
  date: r.date,
  rating: r.rating,
  challenges: r.challenges,
  rawInput: r.rawInput
})))}

CRITICAL ADAPTATION DIRECTIVE:
Analyze the past challenges above (such as fatigue, distraction slumps, underestimating duration, meeting overloads).
When adjusting/scheduling:
- Proactively leave buffer blocks or move high-energy tasks away from times where they noted "Afternoon Energy Slump" or "Social Media / Distraction".
- If they tend to underestimate task durations, expand task allocations by 15-30 minutes.
- Explicitly mention in the coachingSummary how you have used this memory to sidestep their past challenges (e.g., "Given your previous logs showing fatigue in the afternoon, I rescheduled your strategy slot...").
` : ''}

${correctivePrompt}

In addition to shifting the schedule:
1. Evaluate the user's request. Does this adjustment reveal an underlying habit, fatigue pattern, or preference (e.g., "Move my coding block to the evening" implies they prefer late focus)? If a clear behavioral rule is detected, extract it as a single, clean, human-readable behavioral rule/tip (e.g. "Move heavy coding blocks to evenings when cognitive peak shifts" or "Keep a rest slot right after intensive meetings"). If no pattern is detected, set "detectedPattern" to null.
2. Provide a conversational, encouraging coaching summary explaining what changes you made, why they fit their circadian peak/energy profile (or why they are helpful), and some friendly motivational tips for focus. Keep it to 2-3 sentences max.
3. If the user mentions a new task or event to add, you can create a new ID (e.g. "t-dyn-" followed by a timestamp/random string) and return it in "updatedTasks" or "updatedEvents" with its "title" and "description" fields.

You must return a JSON response matching this schema:
{
  "updatedTasks": [
    { "id": "t-id", "scheduledTime": "HH:MM", "title": "Optional new task title", "description": "Optional new task description" }
  ],
  "updatedEvents": [
    { "id": "e-id", "startTime": "HH:MM", "endTime": "HH:MM", "title": "Updated Title" }
  ],
  "detectedPattern": "Extracted behavioral rule or null",
  "coachingSummary": "A friendly, brief coaching briefing of the schedule realignment."
}`;

      const prompt = `Adjust the schedule based on user instruction: "${userPrompt}"`;

      const responseText = await callLlm({
        provider: activeProvider,
        systemInstruction,
        prompt,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            updatedTasks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  scheduledTime: { type: Type.STRING },
                  title: { type: Type.STRING, description: 'Optional new task title' },
                  description: { type: Type.STRING, description: 'Optional new task description' }
                },
                required: ['id', 'scheduledTime'],
              },
            },
            updatedEvents: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  startTime: { type: Type.STRING },
                  endTime: { type: Type.STRING },
                  title: { type: Type.STRING },
                },
                required: ['id', 'startTime', 'endTime', 'title'],
              },
            },
            detectedPattern: { type: Type.STRING, description: 'A short string behavioral rule, or null' },
            coachingSummary: { type: Type.STRING, description: 'Brief explanation of changes and focus coaching' }
          },
          required: ['updatedTasks', 'updatedEvents', 'detectedPattern', 'coachingSummary'],
        },
        apiKeys,
      });

      let cleanText = responseText.trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.replace(/^```json/, '').replace(/```$/, '').trim();
      } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```/, '').replace(/```$/, '').trim();
      }
      parsed = JSON.parse(cleanText);

      // Post-processing: Bi-directional synchronization between updatedTasks and updatedEvents
      const finalUpdatedTasks = [...(parsed.updatedTasks || [])];
      const finalUpdatedEvents = [...(parsed.updatedEvents || [])];

      // 1. Sync Task reschedules to their connected Calendar Events
      for (const ut of parsed.updatedTasks || []) {
        const connectedEvt = events.find((e: any) => e.connectedTaskId === ut.id);
        if (connectedEvt) {
          const alreadyInEvents = finalUpdatedEvents.find((ue: any) => ue.id === connectedEvt.id);
          const origDuration = Math.max(30, timeToMinutes(connectedEvt.endTime) - timeToMinutes(connectedEvt.startTime));
          const newStart = ut.scheduledTime;
          const newEnd = minutesToTime(timeToMinutes(newStart) + origDuration);
          
          if (alreadyInEvents) {
            alreadyInEvents.startTime = newStart;
            alreadyInEvents.endTime = newEnd;
          } else {
            finalUpdatedEvents.push({
              id: connectedEvt.id,
              startTime: newStart,
              endTime: newEnd,
              title: connectedEvt.title
            });
          }
        }
      }

      // 2. Sync Event reschedules to their connected Tasks
      for (const ue of parsed.updatedEvents || []) {
        const sourceEvt = events.find((e: any) => e.id === ue.id);
        if (sourceEvt && sourceEvt.connectedTaskId) {
          const alreadyInTasks = finalUpdatedTasks.find((ut: any) => ut.id === sourceEvt.connectedTaskId);
          if (alreadyInTasks) {
            alreadyInTasks.scheduledTime = ue.startTime;
          } else {
            finalUpdatedTasks.push({
              id: sourceEvt.connectedTaskId,
              scheduledTime: ue.startTime
            });
          }
        }
      }

      parsed.updatedTasks = finalUpdatedTasks;
      parsed.updatedEvents = finalUpdatedEvents;

      // Validation loop: check if any updatedTask or updatedEvent overlaps with fixedTasks
      let hasOverlap = false;
      let overlapDetails = '';

      for (const ut of parsed.updatedTasks || []) {
        // find full task info for duration
        const taskInfo = tasks.find((t: any) => t.id === ut.id);
        const duration = taskInfo ? taskInfo.microSteps?.reduce((acc: number, step: any) => acc + (step.estimatedMinutes || 20), 0) || 60 : 60;
        const overlap = checkOverlap(ut.scheduledTime, duration, fixedTasks, []);
        if (overlap) {
          hasOverlap = true;
          overlapDetails = `Task "${taskInfo?.title || ut.id}" rescheduled to ${ut.scheduledTime} overlaps with locked block "${overlap.title}" (${overlap.startTime} - ${overlap.endTime})`;
          break;
        }
      }

      if (!hasOverlap) {
        for (const ue of parsed.updatedEvents || []) {
          const duration = timeToMinutes(ue.endTime) - timeToMinutes(ue.startTime);
          const overlap = checkOverlap(ue.startTime, duration > 0 ? duration : 60, fixedTasks, []);
          if (overlap) {
            hasOverlap = true;
            overlapDetails = `Event "${ue.title}" rescheduled to ${ue.startTime} - ${ue.endTime} overlaps with locked block "${overlap.title}" (${overlap.startTime} - ${overlap.endTime})`;
            break;
          }
        }
      }

      if (!hasOverlap) {
        // Re-merge with existing event data so we keep all non-time properties, BUT do not lose newly-added events
        const mergedEvents = events.map((e: any) => {
          const updated = parsed.updatedEvents?.find((ue: any) => ue.id === e.id);
          return updated ? { ...e, startTime: updated.startTime, endTime: updated.endTime, title: updated.title } : e;
        });
        const newEvents = (parsed.updatedEvents || []).filter((ue: any) => !events.some((e: any) => e.id === ue.id));

        return res.json({
          updatedTasks: parsed.updatedTasks,
          updatedEvents: [...mergedEvents, ...newEvents],
          detectedPattern: parsed.detectedPattern,
          coachingSummary: parsed.coachingSummary
        });
      } else {
        console.warn(`[Adjustment Scheduler] Overlap detected on attempt ${attempt}: ${overlapDetails}. Retrying adjustment...`);
        correctivePrompt = `CRITICAL WARNING: Your previous adjustment choice had an overlap with a locked calendar block: ${overlapDetails}. You MUST adjust the times so they never overlap with any fixed/routine tasks or locked iCal meetings.`;
      }
    }
      return res.status(400).json({ error: 'AI adjustment could not find an overlap-free schedule after 3 attempts due to layout conflicts.' });
    } catch (err: any) {
      console.error('Error during schedule adjustment:', err);
      const is429 = (err: any) => {
        const errMsg = String(err.message || err).toLowerCase();
        return (
          errMsg.includes('429') ||
          errMsg.includes('resource_exhausted') ||
          errMsg.includes('resource_exhaust') ||
          errMsg.includes('rate limit') ||
          err.status === 429 ||
          err.statusCode === 429
        );
      };
      if (is429(err)) {
        console.warn("Google Gemini API returned 429 (Rate Limit Exceeded) in refine-schedule. Prompting user for BYOK...");
        return res.status(429).json({
          error: 'RESOURCE_EXHAUSTED',
          message: 'Google Gemini API Rate Limit Exceeded (429). Please configure your personal Gemini API key in settings override.'
        });
      }
      return res.status(400).json({ error: err.message || 'AI adjustment failed. Please check your API key or network connection.' });
    }
});

app.post('/api/intelligent-reschedule', async (req, res) => {
  const { tasks = [], events = [], fixedTasks = [], morningTriage = '', habitProfile = [], wakeHour = 7 } = req.body;

  // Support keys and provider from headers
  const clientProvider = (req.headers['x-ai-provider'] || 'gemini') as 'gemini' | 'openai' | 'anthropic' | 'deepseek';
  const clientGeminiKey = req.headers['x-gemini-api-key'] as string;
  const clientAnthropicKey = req.headers['x-anthropic-api-key'] as string;
  const clientDeepseekKey = req.headers['x-deepseek-api-key'] as string;

  const activeProvider = clientProvider === 'openai' ? 'gemini' : clientProvider;

  const apiKeys = {
    gemini: (clientGeminiKey && clientGeminiKey.trim() !== 'MY_GEMINI_API_KEY' && clientGeminiKey.trim() !== '') ? clientGeminiKey.trim() : (process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || geminiApiKey),
    anthropic: (clientAnthropicKey && clientAnthropicKey.trim() !== '') ? clientAnthropicKey.trim() : process.env.ANTHROPIC_API_KEY,
    deepseek: (clientDeepseekKey && clientDeepseekKey.trim() !== '') ? clientDeepseekKey.trim() : process.env.DEEPSEEK_API_KEY,
  };

  const isAiAvailable = (activeProvider === 'gemini' && !!apiKeys.gemini && apiKeys.gemini !== 'MY_GEMINI_API_KEY') ||
                        (activeProvider === 'anthropic' && !!apiKeys.anthropic) ||
                        (activeProvider === 'deepseek' && !!apiKeys.deepseek);

  if (!isAiAvailable) {
    // Local fallback: identify any active tasks, shift if they overlap with anything. If they exceed 22:00, add to nextDayTasks
    const updatedTasks: any[] = [];
    const updatedEvents: any[] = [];
    const nextDayTasks: any[] = [];
    
    const parseTimeToMinutes = (tStr: string) => {
      const [h, m] = tStr.split(':').map(Number);
      return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
    };

    const minutesToTime = (m: number) => {
      const h = Math.floor(m / 60) % 24;
      const mins = m % 60;
      return `${h.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    };

    // Find any tasks overlapping with meetings, fixed routine, or OOO
    let currentFreePointer = wakeHour * 60 + 60; // start 1 hr after waking

    for (const t of tasks) {
      if (t.status === 'completed') continue;
      
      const duration = t.microSteps && t.microSteps.length > 0
        ? t.microSteps.reduce((sum: number, ms: any) => sum + (ms.estimatedMinutes || 20), 0)
        : 60;

      // Find first free slot for duration that doesn't overlap with locked meetings/OOO
      let slotFound = false;
      while (!slotFound && currentFreePointer < 24 * 60) {
        const slotStart = currentFreePointer;
        const slotEnd = slotStart + duration;

        // Check if overlaps with fixed tasks
        const overlapFixed = fixedTasks.some((ft: any) => {
          const ftStart = parseTimeToMinutes(ft.startTime);
          const ftEnd = parseTimeToMinutes(ft.endTime);
          return slotStart < ftEnd && slotEnd > ftStart;
        });

        // Check if overlaps with meetings or OOO
        const overlapEvent = events.some((e: any) => {
          if (e.connectedTaskId === t.id) return false;
          if (e.type !== 'meeting' && !e.title.includes('Out of Office') && !e.title.includes('🛑')) return false;
          const eStart = parseTimeToMinutes(e.startTime);
          const eEnd = parseTimeToMinutes(e.endTime);
          return slotStart < eEnd && slotEnd > eStart;
        });

        if (!overlapFixed && !overlapEvent) {
          slotFound = true;
          if (slotEnd > 22 * 60) {
            // Move to next day!
            nextDayTasks.push({
              id: t.id,
              title: t.title,
              reason: "Day is fully packed, moved to tomorrow to ensure quality execution."
            });
          } else {
            const scheduledTime = minutesToTime(slotStart);
            updatedTasks.push({ id: t.id, scheduledTime });
            
            // Sync with existing calendar event
            const connectedEvt = events.find((e: any) => e.connectedTaskId === t.id);
            if (connectedEvt) {
              updatedEvents.push({
                id: connectedEvt.id,
                startTime: scheduledTime,
                endTime: minutesToTime(slotEnd),
                title: connectedEvt.title
              });
            }
            currentFreePointer = slotEnd + 30; // 30-min buffer
          }
        } else {
          currentFreePointer += 15; // slide by 15 mins
        }
      }
    }

    return res.json({
      updatedTasks,
      updatedEvents: events.map((e: any) => {
        const updated = updatedEvents.find((ue: any) => ue.id === e.id);
        return updated ? { ...e, startTime: updated.startTime, endTime: updated.endTime, title: updated.title } : e;
      }),
      nextDayTasks,
      coachingSummary: "Calculated conflict-free agenda using standard safety-biorhythms."
    });
  }

  try {
    const systemInstruction = `You are the Elite AI Scheduling Agent.
Your job is to reschedule the user's focus tasks and meetings for today to resolve overlaps, optimize the flow, and respect Out-Of-Office (work halt) blocks.

INPUT CONTEXTS PROVIDED:
1. Active Tasks: List of tasks with estimated durations (microSteps duration or 60 minutes default).
2. Calendar Events: List of meetings, OOO, and calendar blocks.
3. Locked Routine blocks: (fixedTasks).
4. Morning Triage standup: Notes/transcript explaining user constraints, priority tasks, and coffee/energy timings.
5. Wake Hour: Hour the user woke up.
6. Habit Biorhythm preferences.

STRICT RESCHEDULING RULES:
1. Chronological Dependencies & Sequence Constraints:
   - Identify dependencies, pre-requisites, and sequence constraints from the Morning Triage (e.g., "I need to prepare the monthly report before meeting with boss", "do task X before event Y").
   - These sequencing requirements are ABSOLUTE. You MUST schedule the preparation task strictly BEFORE the dependent event or meeting.
   - If a new block (such as an Out of Office block or meeting) overlaps or conflicts:
     - First, try to fit the preparation task in a free slot preceding the Out of Office or meeting.
     - Second, if there is an Out of Office block, you may allow a half-hour (30-minute) window between the Out of Office block and the dependent meeting/task to squeeze the preparation task in directly before the meet.
     - Third, if the preparation task cannot be scheduled before the dependent meeting (e.g. because of rigid block placements), you MUST reschedule or shift the dependent meeting/event to a later slot (using the updatedEvents list) so that the preparation task can happen before it.
     - Fourth, if the meeting cannot be shifted or the preparation task cannot fit today, do NOT put the preparation task after the meeting. Explain the conflict in coachingSummary and propose reschedule alternatives or suggest to the user to reschedule the meeting.
2. Out-Of-Office (OOO): If there is an 'Out of Office' or 'Work Halt' event (often starting with a stop emoji 🛑 or titled with 'Out of Office'), this is fully blocked. No tasks can be scheduled during this interval.
3. Focus optimizations: Group tasks near peak circadian energy levels if mentioned in morning triage or habit profile.
4. Next Day Postponement:
   - If some tasks do not fit in today's remaining time (up to 10 PM) due to conflicts or OOO blocks, move them to the "nextDayTasks" list.
   - A task is moved to nextDayTasks ONLY if there is simply not enough free time to complete it today without creating overlaps.
   - ALWAYS explain clearly in the "coachingSummary" why a task had to be postponed to the next day, and state that we are asking the user for their final consent/approval before finalizing this change.

You must return a JSON response matching this schema:
{
  "updatedTasks": [
    { "id": "t-id", "scheduledTime": "HH:MM" }
  ],
  "updatedEvents": [
    { "id": "e-id", "startTime": "HH:MM", "endTime": "HH:MM", "title": "Updated Title" }
  ],
  "nextDayTasks": [
    { "id": "t-id", "title": "Task Title", "reason": "Specific reason why this task must be postponed to the next day" }
  ],
  "coachingSummary": "A brief explanation of how the schedule has been optimized and what was shifted."
}`;

    const prompt = `Reschedule today's agenda.
Tasks: ${JSON.stringify(tasks)}
Events: ${JSON.stringify(events)}
Routine Blocks (Fixed): ${JSON.stringify(fixedTasks)}
Morning Triage Context: ${morningTriage}
Wake Hour: ${wakeHour}
Habit Profile: ${JSON.stringify(habitProfile)}`;

    const responseText = await callLlm({
      provider: activeProvider,
      systemInstruction,
      prompt,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          updatedTasks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                scheduledTime: { type: Type.STRING },
              },
              required: ['id', 'scheduledTime'],
            },
          },
          updatedEvents: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                startTime: { type: Type.STRING },
                endTime: { type: Type.STRING },
                title: { type: Type.STRING },
              },
              required: ['id', 'startTime', 'endTime', 'title'],
            },
          },
          nextDayTasks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                reason: { type: Type.STRING },
              },
              required: ['id', 'title', 'reason'],
            },
          },
          coachingSummary: { type: Type.STRING },
        },
        required: ['updatedTasks', 'updatedEvents', 'nextDayTasks', 'coachingSummary'],
      },
      apiKeys,
    });

    let cleanText = responseText.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```/, '').replace(/```$/, '').trim();
    }
    const parsed = JSON.parse(cleanText);

    return res.json(parsed);
  } catch (err: any) {
    console.error('Error during intelligent reschedule:', err);
    return res.status(500).json({ error: err.message || 'Intelligent rescheduling failed.' });
  }
});

// Serve static build or delegate to Vite in development
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[FlowDo Backend] Server running on http://0.0.0.0:${PORT}`);
  });
}

start();
