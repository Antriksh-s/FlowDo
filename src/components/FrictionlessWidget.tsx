import React, { useState } from 'react';
import { Sparkles, ExternalLink, FileText, CheckCircle2, Circle, AlertTriangle, Check, BookOpen, Lightbulb } from 'lucide-react';
import { Task } from '../types';

interface FrictionlessWidgetProps {
  task: Task;
  onStepCompleted: (taskId: string, stepId: string) => void;
}

export default function FrictionlessWidget({ task, onStepCompleted }: FrictionlessWidgetProps) {
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [draftContent, setDraftContent] = useState(task.microSteps[activeStepIdx]?.draftContent || '');
  const [activeTab, setActiveTab] = useState<'editor' | 'suggestions'>('editor');

  // Track currently selected step changes
  React.useEffect(() => {
    if (task.microSteps[activeStepIdx]) {
      setDraftContent(task.microSteps[activeStepIdx].draftContent || '');
    }
  }, [activeStepIdx, task]);

  const activeStep = task.microSteps[activeStepIdx];

  const handleStepClick = (idx: number) => {
    setActiveStepIdx(idx);
    setActiveTab('editor'); // Reset tab to editor on step shift
  };

  const handleToggleStep = (stepId: string) => {
    onStepCompleted(task.id, stepId);
  };

  return (
    <div id="frictionless-sandbox-panel" className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-slate-850 font-sans flex flex-col gap-4 relative overflow-hidden w-full">
      {/* Decorative subtle ambient light */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full filter blur-xl pointer-events-none"></div>

      {/* Top Header Row */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-bold font-display text-slate-800">Frictionless Execution Hub</h3>
        </div>
        <span className="text-[9px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100 font-bold uppercase tracking-wider font-mono">
          ⚡ Flow Focus Mode
        </span>
      </div>

      {/* Title & Overview */}
      <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[9px] font-bold text-blue-600 uppercase tracking-widest">Active Task Target</span>
          <span className="text-[10px] font-mono text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded">Due Today</span>
        </div>
        <h4 className="text-sm font-bold text-slate-800 font-display">{task.title}</h4>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed font-medium">{task.description}</p>
      </div>

      {/* Low-profile Energy Warning Banner */}
      <div className="bg-amber-50/70 border border-amber-100 px-3 py-2 rounded-xl text-[11px] flex items-center gap-2 text-amber-800 font-semibold shadow-xs">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 animate-bounce" />
        <span>Your energy is projected to dip soon. Work on the outline drafts below to protect your cognitive flow.</span>
      </div>

      {/* Two-Column Execution Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-1 items-stretch">
        
        {/* Column 1: Step Checklist Selector (col-span-5) */}
        <div className="lg:col-span-5 flex flex-col gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Micro-Step Queue:</span>
          <div className="flex flex-col gap-2">
            {task.microSteps.map((step, idx) => {
              const isActive = idx === activeStepIdx;
              const isDone = step.status === 'done';

              return (
                <div
                  key={step.id}
                  id={`micro-step-card-${step.id}`}
                  onClick={() => handleStepClick(idx)}
                  className={`w-full p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 cursor-pointer relative ${
                    isActive
                      ? 'bg-blue-50/40 border-blue-400 text-slate-850 shadow-xs'
                      : 'bg-white hover:bg-slate-50/50 border-slate-200 text-slate-600'
                  }`}
                >
                  <div
                    id={`step-toggle-${step.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleStep(step.id);
                    }}
                    className="mt-0.5 shrink-0 cursor-pointer"
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 fill-emerald-50" />
                    ) : (
                      <Circle className="w-4 h-4 text-slate-400 hover:text-blue-600 transition-colors" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-bold font-display ${isActive ? 'text-slate-800' : 'text-slate-700'} leading-tight`}>
                      {step.title}
                    </div>
                    <div className="text-[9px] text-slate-400 mt-1 font-bold uppercase tracking-wider flex items-center gap-2">
                      <span>{step.estimatedMinutes} Mins</span>
                      <span>•</span>
                      <span className={step.energyRequired === 'High' ? 'text-rose-500' : step.energyRequired === 'Medium' ? 'text-amber-500' : 'text-emerald-500'}>
                        {step.energyRequired} Energy
                      </span>
                    </div>
                  </div>
                  {isActive && (
                    <span className="absolute right-3 top-3 w-1.5 h-1.5 bg-blue-600 rounded-full"></span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Column 2: Interactive Focus Console (col-span-7) */}
        <div className="lg:col-span-7 flex flex-col bg-slate-50 rounded-xl border border-slate-200 p-4 justify-between gap-3 min-h-[250px]">
          {activeStep ? (
            <div className="flex flex-col gap-3 flex-1">
              
              {/* Context Header with Tabs */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex bg-slate-200/60 p-0.5 rounded-lg gap-0.5 shadow-inner">
                  <button
                    onClick={() => setActiveTab('editor')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                      activeTab === 'editor' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <FileText className="w-3 h-3" />
                    <span>Outline Draft</span>
                  </button>
                  {activeStep.suggestions && (
                    <button
                      onClick={() => setActiveTab('suggestions')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                        activeTab === 'suggestions' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <Lightbulb className="w-3 h-3" />
                      <span>💡 AI Web Tips</span>
                    </button>
                  )}
                </div>
                
                <span className="text-[9px] text-slate-400 font-mono font-bold uppercase">
                  Step {activeStepIdx + 1} of {task.microSteps.length}
                </span>
              </div>

              {/* Tab Contents */}
              <div className="flex-1 flex flex-col justify-between">
                {activeTab === 'editor' ? (
                  <div className="space-y-2 flex-1 flex flex-col justify-between">
                    <div>
                      <p className="text-[11px] text-slate-500 font-bold mb-1 uppercase tracking-wide">Pre-populated Context Template:</p>
                      <textarea
                        id="active-draft-text-area"
                        rows={5}
                        value={draftContent}
                        onChange={(e) => setDraftContent(e.target.value)}
                        placeholder="Structure your thoughts here..."
                        className="w-full bg-white border border-slate-200 text-slate-800 font-mono text-[11px] p-2.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 leading-relaxed shadow-xs flex-1 min-h-[110px]"
                      />
                    </div>

                    {/* Grounding Resources Row */}
                    {activeStep.resources && activeStep.resources.length > 0 && (
                      <div className="mt-1">
                        <span className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Identified Grounding Assets:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {activeStep.resources.map((res) => (
                            <a
                              key={res.id}
                              id={`resource-link-${res.id}`}
                              href={res.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] bg-white hover:bg-blue-50/50 border border-slate-200 px-2 py-1 rounded text-slate-600 hover:text-blue-600 transition-colors flex items-center gap-1 font-semibold shadow-xs"
                            >
                              <BookOpen className="w-3 h-3 text-blue-500 shrink-0" />
                              <span className="max-w-[120px] truncate">{res.label}</span>
                              <ExternalLink className="w-2.5 h-2.5 opacity-50 shrink-0 ml-0.5" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 animate-fade-in flex-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">
                      <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                      <span>Web Grounded Suggestions & Best Practices</span>
                      {activeStep.isFallback && (
                        <span className="text-[8px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-mono normal-case shrink-0">
                          Offline Best Practices
                        </span>
                      )}
                    </div>
                    <div className="bg-white border border-slate-200 p-3 rounded-lg text-xxs text-slate-600 font-medium whitespace-pre-line leading-relaxed overflow-y-auto max-h-[160px] shadow-inner">
                      {activeStep.suggestions}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Button at Bottom of Focus Console */}
              <div className="mt-2 pt-2 border-t border-slate-200">
                {activeStep.status !== 'done' ? (
                  <button
                    id="complete-active-step-btn"
                    onClick={() => handleToggleStep(activeStep.id)}
                    className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-lg text-xs transition-colors font-display cursor-pointer shadow-sm hover:scale-[1.01]"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Mark Step Complete & Sync Google Tasks</span>
                  </button>
                ) : (
                  <div className="w-full text-center py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 animate-pulse">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Micro-step Completed & Synced!</span>
                  </div>
                )}
              </div>

            </div>
          ) : (
            <p className="text-xs text-slate-400 italic text-center my-auto">Select a micro-step queue item on the left to activate the focus console.</p>
          )}
        </div>

      </div>
    </div>
  );
}
