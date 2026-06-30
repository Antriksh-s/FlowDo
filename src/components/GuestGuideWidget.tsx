import React, { useState } from 'react';
import { Sparkles, Compass, Lightbulb, Zap, ArrowRight, HelpCircle, Eye, RefreshCw, Layers } from 'lucide-react';

interface GuestGuideWidgetProps {
  onLoadDemoData: () => void;
  onNavigateToTab: (tab: 'dashboard' | 'engine') => void;
  onOpenMorningStandup: () => void;
  onOpenEveningStandup: () => void;
  currentTab: string;
}

export default function GuestGuideWidget({
  onLoadDemoData,
  onNavigateToTab,
  onOpenMorningStandup,
  onOpenEveningStandup,
  currentTab,
}: GuestGuideWidgetProps) {
  const [activeTip, setActiveTip] = useState<number>(0);
  const [demoLoaded, setDemoLoaded] = useState<boolean>(false);

  const guideSteps = [
    {
      title: "1. Decompose Complex Tasks",
      icon: <Layers className="w-4 h-4 text-blue-600" />,
      description: "Click the 'Sandbox' button or open the 'Planner' tab to input complex projects. Watch the AI planner decompose goals into action steps.",
      actionLabel: "Try Planner Tab",
      action: () => onNavigateToTab('engine')
    },
    {
      title: "2. Circadian Energy Calibration",
      icon: <Zap className="w-4 h-4 text-emerald-600" />,
      description: "Enter your wakeup hour, drag tasks on the calendar timeline, or log hourly energy levels to find your perfect cognitive peak zones.",
      actionLabel: "View Timeline",
      action: () => onNavigateToTab('dashboard')
    },
    {
      title: "3. Daily Standups & AI Coaching",
      icon: <Sparkles className="w-4 h-4 text-indigo-600" />,
      description: "Perform your Morning Triage to realign tasks, and complete your Evening Standup to log focus challenges. The AI adapts Future scheduling to match your past performance.",
      actionLabel: "Try Morning Standup",
      action: () => onOpenMorningStandup()
    }
  ];

  const handleLoadDemo = () => {
    onLoadDemoData();
    setDemoLoaded(true);
  };

  return (
    <div className="bg-gradient-to-br from-indigo-50/50 via-white to-blue-50/30 border-2 border-indigo-100 rounded-3xl p-5 shadow-xs relative overflow-hidden flex flex-col gap-4">
      {/* Background soft glow */}
      <div className="absolute -top-10 -right-10 w-24 h-24 bg-blue-400/10 rounded-full blur-2xl pointer-events-none"></div>
      
      <div className="flex items-center gap-2 border-b border-indigo-100/60 pb-3">
        <div className="p-1.5 bg-indigo-100/50 rounded-xl text-indigo-600">
          <Compass className="w-4.5 h-4.5 animate-spin-slow" />
        </div>
        <div>
          <h4 className="text-xs font-bold text-indigo-950 font-display uppercase tracking-wider">Guest Workspace Tour</h4>
          <span className="text-[9px] text-indigo-500 font-mono font-bold uppercase block mt-0.5">Local-first sandbox</span>
        </div>
      </div>

      <p className="text-xs text-slate-600 leading-relaxed font-medium">
        Welcome to your raw, clean FlowDo environment. Guest mode is running completely inside your browser using local storage fallback.
      </p>

      {/* Accordion Guide Steps */}
      <div className="flex flex-col gap-2.5">
        {guideSteps.map((step, idx) => {
          const isSelected = activeTip === idx;
          return (
            <div 
              key={idx}
              className={`border rounded-2xl transition-all duration-200 ${
                isSelected 
                  ? 'bg-white border-indigo-200 shadow-xs p-3.5' 
                  : 'bg-slate-50/60 border-slate-100 hover:border-slate-200 hover:bg-slate-50 p-2.5 cursor-pointer'
              }`}
              onClick={() => setActiveTip(idx)}
            >
              <div className="flex items-center gap-2.5">
                {step.icon}
                <span className="text-xs font-bold text-slate-800 font-display">{step.title}</span>
              </div>
              
              {isSelected && (
                <div className="mt-2.5 space-y-3 animate-fade-in">
                  <p className="text-xxs text-slate-500 leading-relaxed font-semibold">
                    {step.description}
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      step.action();
                    }}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                  >
                    <span>{step.actionLabel}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Demo dataset loader */}
      <div className="bg-slate-50/80 border border-slate-200/60 p-3.5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1.5">
        <div className="space-y-0.5">
          <span className="text-[10px] font-bold text-slate-700 block">Want a quick test drive?</span>
          <span className="text-[9px] text-slate-400 font-semibold block leading-tight">Instantly populate beautiful mockup tasks and events.</span>
        </div>
        <button
          onClick={handleLoadDemo}
          disabled={demoLoaded}
          className={`shrink-0 flex items-center justify-center gap-1.5 text-xxs font-bold uppercase tracking-wider px-3.5 py-2 rounded-xl transition-all shadow-2xs cursor-pointer ${
            demoLoaded
              ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
              : 'bg-white hover:bg-indigo-50 text-indigo-600 border border-indigo-200 hover:border-indigo-300'
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${demoLoaded ? '' : 'animate-spin-slow'}`} />
          <span>{demoLoaded ? 'Demo Loaded' : 'Load Demo'}</span>
        </button>
      </div>
    </div>
  );
}
