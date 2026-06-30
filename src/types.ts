export interface Resource {
  id: string;
  label: string;
  url: string;
  type: 'document' | 'search' | 'link' | 'calendar';
}

export interface MicroStep {
  id: string;
  title: string;
  estimatedMinutes: number;
  energyRequired: 'High' | 'Medium' | 'Low';
  status: 'todo' | 'done';
  draftContent?: string;
  resources: Resource[];
  suggestions?: string; // Fetched actionable web tips
  isFallback?: boolean; // True if fallback guidelines are displayed
}

export interface Task {
  id: string;
  title: string;
  description: string;
  deadline: string; // ISO date or descriptive
  energyCost: 'High' | 'Medium' | 'Low';
  status: 'pending' | 'in_progress' | 'completed';
  microSteps: MicroStep[];
  category: string;
  scheduledTime?: string; // e.g. "14:30"
  aiMeta?: {
    geminiFallback: boolean;
    searchFallback: boolean;
  };
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  type: 'meeting' | 'task' | 'routine';
  energyImpact: 'drain' | 'recharge' | 'neutral';
  connectedTaskId?: string;
}

export interface FixedTask {
  id: string;
  title: string;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
}

export interface AgentLog {
  id: string;
  agentName: 'Planner Agent' | 'Context Fetcher Agent' | 'Energy Controller Agent' | 'System';
  message: string;
  timestamp: string;
  type: 'info' | 'success' | 'working' | 'alert';
}

export interface EveningReflection {
  id: string;
  date: string; // ISO date string "YYYY-MM-DD"
  timestamp: number;
  rating: number; // 1-5 rating
  challenges: string[]; // Selectable chips: e.g. ["distracted", "fatigue"]
  rawInput: string; // Free text how his day went
  completedTaskIds: string[];
  uncompletedTaskIds: string[];
  coachingFeedback?: string; // AI generated suggestions
}

