import { Task, CalendarEvent } from './types';

export const INITIAL_TASKS: Task[] = [
  {
    id: 't1',
    title: 'Draft Q3 Product Strategy Proposal',
    description: 'Create high-level strategic roadmap for FlowDo launch, detailing agent orchestration and security protocols.',
    deadline: 'Today, 5:00 PM',
    energyCost: 'High',
    status: 'in_progress',
    category: 'Strategy',
    scheduledTime: '10:30',
    microSteps: [
      {
        id: 'ms1',
        title: 'Gather core requirements & OKR alignment',
        estimatedMinutes: 20,
        energyRequired: 'Medium',
        status: 'done',
        draftContent: 'Strategic Goals:\n1. Align FlowDo roadmap with Google Ecosystem OKRs (Tasks API, Calendar API integration).\n2. Maintain 100% open-source core middleware stack (FastAPI, PGVector).\n3. Implement local-first PII masking pipeline.',
        resources: [
          { id: 'r1', label: 'Company OKR document', url: '#', type: 'document' },
          { id: 'r2', label: 'FlowDo Product Spec Draft', url: '#', type: 'document' }
        ],
        suggestions: `* **Actionable alignment**: Cross-reference each objective with direct company key results to guarantee clear ownership.
* **Requirements baseline**: Draft standard boundary constraints specifying exactly what remains out of scope.`
      },
      {
        id: 'ms2',
        title: 'Outline Agent Architecture (Planner, Fetcher, Traffic Controller)',
        estimatedMinutes: 30,
        energyRequired: 'High',
        status: 'todo',
        draftContent: 'Multi-Agent Framework:\n- Orchestrator: LangGraph or AutoGen\n- Planner Agent: Dynamic decomposition of tasks using Gemini 1.5 Pro.\n- Fetcher Agent: Pre-fills context by reading GDrive assets with search-grounding.\n- Energy Controller Agent: Map tasks to high-biorhythm energy hours.',
        resources: [
          { id: 'r3', label: 'LangGraph State Schema', url: 'https://github.com/langchain-ai/langgraph', type: 'link' },
          { id: 'r4', label: 'Gemini 1.5 Pro SDK Docs', url: 'https://ai.google.dev', type: 'link' }
        ],
        suggestions: `* **Asymmetric Orchestration**: Use a state machine orchestration pattern (like LangGraph) rather than simple linear routing.
* **Strict Type Safety**: Declare explicit schemas for inter-agent context transitions to prevent message drift.`
      },
      {
        id: 'ms3',
        title: 'Draft Security & Privacy Appendices',
        estimatedMinutes: 20,
        energyRequired: 'Low',
        status: 'todo',
        draftContent: 'OAuth2 Implementation & Local Masking Protocols:\n- Session tokens encrypted using AES-256.\n- Presidio-based local PII mask before API dispatch.',
        resources: [
          { id: 'r5', label: 'GCP OAuth2 Best Practices', url: '#', type: 'document' }
        ],
        suggestions: `* **Zero Trust Token Auditing**: Implement short-lived OAuth session tokens with strict token invalidation.
* **On-device Masking**: Run local regular expression filters to strip API keys, phone numbers, and addresses from payloads.`
      }
    ]
  },
  {
    id: 't2',
    title: 'Research Competitors & Grounding Patterns',
    description: 'Analyze alternative agentic platforms to identify gaps in energy-aware scheduling.',
    deadline: 'Tomorrow, 12:00 PM',
    energyCost: 'Medium',
    status: 'pending',
    category: 'Research',
    scheduledTime: '13:30',
    microSteps: [
      {
        id: 'ms2-1',
        title: 'Query search-grounding for energy-scheduling research papers',
        estimatedMinutes: 15,
        energyRequired: 'Medium',
        status: 'todo',
        draftContent: 'Search Queries:\n- "energy aware task scheduling algorithms"\n- "human circadian rhythms productivity calendar optimization"\n- "agentic workflows for autonomous time blocking"',
        resources: [
          { id: 'r2-1', label: 'Google Search Grounding', url: 'https://www.google.com', type: 'search' }
        ]
      },
      {
        id: 'ms2-2',
        title: 'Synthesize core takeaways into visual bento layout',
        estimatedMinutes: 25,
        energyRequired: 'Medium',
        status: 'todo',
        draftContent: '',
        resources: []
      }
    ]
  },
  {
    id: 't3',
    title: 'Prepare Presentation Slides for Demo Day',
    description: 'Assemble key value proposition slides and design wireframe showcases for visual impact.',
    deadline: 'In 2 days',
    energyCost: 'High',
    status: 'pending',
    category: 'Design',
    scheduledTime: '16:00',
    microSteps: [
      {
        id: 'ms3-1',
        title: 'Establish color palette and font selections',
        estimatedMinutes: 15,
        energyRequired: 'Low',
        status: 'done',
        draftContent: 'Aesthetics:\n- Typeface: Space Grotesk (headings), Inter (body), JetBrains Mono (data)\n- Base Slate: Primary Emerald accent (#10B981) for battery charge indicators.',
        resources: []
      },
      {
        id: 'ms3-2',
        title: 'Generate custom illustrations or mock layouts',
        estimatedMinutes: 30,
        energyRequired: 'High',
        status: 'todo',
        draftContent: 'Recommended prompts for Gemini Imagen 3: "Minimalist bento grid of AI productivity task calendar schedule, soft emerald energy wave outline, vector icon, flat aesthetic."',
        resources: [
          { id: 'r3-2', label: 'Imagen 3 Prompt Guide', url: '#', type: 'link' }
        ]
      }
    ]
  }
];

export const INITIAL_CALENDAR_EVENTS: CalendarEvent[] = [
  {
    id: 'e1',
    title: 'Routine: Morning Ritual & Energize',
    startTime: '08:00',
    endTime: '09:00',
    type: 'routine',
    energyImpact: 'recharge'
  },
  {
    id: 'e2',
    title: 'Weekly Leadership Alignment Sync',
    startTime: '09:00',
    endTime: '10:00',
    type: 'meeting',
    energyImpact: 'drain'
  },
  {
    id: 'e3',
    title: 'FlowDo Core Architecture Brainstorming',
    startTime: '10:30',
    endTime: '12:00',
    type: 'task',
    energyImpact: 'neutral',
    connectedTaskId: 't1'
  },
  {
    id: 'e4',
    title: 'Routine: Mid-day Recharge & Walk',
    startTime: '12:00',
    endTime: '13:00',
    type: 'routine',
    energyImpact: 'recharge'
  },
  {
    id: 'e5',
    title: 'Task Focus: Competitive Landscape',
    startTime: '13:30',
    endTime: '14:30',
    type: 'task',
    energyImpact: 'neutral',
    connectedTaskId: 't2'
  },
  {
    id: 'e6',
    title: 'Review: Project Steering Committee Sync',
    startTime: '15:00',
    endTime: '16:00',
    type: 'meeting',
    energyImpact: 'drain'
  }
];

export const BIORHYTHM_HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 8:00 to 22:00

// Generate an energy score (0 to 100) based on typical human biorhythms with an afternoon dip
export function getEnergyForHour(hour: number): number {
  // Typical: peaks around 10-11 AM, dips around 2-3 PM, secondary peak at 6-7 PM, decline after
  if (hour >= 8 && hour < 12) {
    // Rise from 60 to 90
    return Math.round(60 + (hour - 8) * 10);
  } else if (hour >= 12 && hour < 15) {
    // Dip from 90 to 45
    return Math.round(90 - (hour - 12) * 15);
  } else if (hour >= 15 && hour < 19) {
    // Rise to secondary peak of 75
    return Math.round(45 + (hour - 15) * 10);
  } else {
    // Fast decline from 75 to 25
    return Math.round(75 - (hour - 19) * 12);
  }
}
