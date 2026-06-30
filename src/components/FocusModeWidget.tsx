import React from 'react';
import { Shield, ShieldCheck, Bell, BellOff, CheckCircle2, Award, Zap } from 'lucide-react';
import { Task } from '../types';

interface FocusModeWidgetProps {
  isFocusActive: boolean;
  onToggleFocus: (active: boolean) => void;
  tasks: Task[];
}

export default function FocusModeWidget({
  isFocusActive,
  onToggleFocus,
  tasks
}: FocusModeWidgetProps) {
  // Extract actual completed microsteps from state to render a real, verified activity log
  const verifiedLogs = tasks.flatMap(t =>
    (t.microSteps || [])
      .filter(ms => ms.status === 'done')
      .map(ms => ({
        id: ms.id,
        taskTitle: t.title,
        stepTitle: ms.title,
        energy: ms.energyRequired || 'Low'
      }))
  );

  const activeGuardedTasksCount = tasks.filter(t => t.status === 'in_progress').length;
  const completedFocusStepsCount = verifiedLogs.length;

  return (
    <div id="focus-mode-hub-panel" className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-slate-800 font-sans flex flex-col gap-4 relative w-full">
      {/* Visual background accents */}
      {isFocusActive && (
        <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/5 rounded-full filter blur-2xl pointer-events-none animate-pulse"></div>
      )}

      {/* Title & Mode Switcher */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          {isFocusActive ? (
            <ShieldCheck className="w-5 h-5 text-blue-600 animate-pulse" />
          ) : (
            <Shield className="w-5 h-5 text-slate-400" />
          )}
          <div>
            <h3 className="text-sm font-bold font-display text-slate-800">FlowShield Focus Guard</h3>
            <p className="text-[10px] text-slate-400 font-semibold uppercase">Smart Interceptor Module</p>
          </div>
        </div>

        <button
          id="toggle-focus-mode-btn"
          onClick={() => onToggleFocus(!isFocusActive)}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all uppercase cursor-pointer ${
            isFocusActive
              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/15'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          {isFocusActive ? (
            <>
              <BellOff className="w-3.5 h-3.5 text-white" />
              <span>Shield Active</span>
            </>
          ) : (
            <>
              <Bell className="w-3.5 h-3.5 text-slate-500" />
              <span>Shield Off</span>
            </>
          )}
        </button>
      </div>

      {/* Focus Mode Explanation */}
      <p className="text-xs text-slate-500 leading-relaxed font-medium">
        FlowShield suppresses distracting notifications (social, promo, chat) during key work. Essential task-bearing requests are automatically caught and scheduled in your post-work catch-up blocks!
      </p>

      {/* Live State Info */}
      <div className="flex items-center gap-2">
        {isFocusActive ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 border border-blue-100 text-blue-700 rounded-lg text-[10px] font-bold w-full">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-ping shrink-0"></span>
            <span>Focus Shield is actively protecting your workflow.</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-150 text-slate-500 rounded-lg text-[10px] font-semibold w-full">
            <span className="w-2 h-2 bg-slate-300 rounded-full shrink-0"></span>
            <span>Shield inactive. Tap above to initiate Focus Mode.</span>
          </div>
        )}
      </div>

      {/* Verified Focus Logs Stream (State-driven) */}
      <div className="space-y-3">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Completed Focus Steps:</span>

        <div className="max-h-56 overflow-y-auto pr-1 space-y-2 scrollbar-thin">
          {verifiedLogs.length > 0 ? (
            verifiedLogs.map((log) => (
              <div
                key={log.id}
                id={`focus-log-${log.id}`}
                className="p-3 rounded-xl border border-emerald-100 bg-emerald-50/50 text-xs leading-relaxed flex items-start gap-3 animate-fade-in"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-bold text-slate-800 font-display truncate">
                      {log.taskTitle}
                    </span>
                    <span className="text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider shrink-0 font-mono">
                      {log.energy} Load
                    </span>
                  </div>
                  <p className="text-slate-600 text-xxs font-medium italic">"{log.stepTitle}"</p>
                </div>
              </div>
            ))
          ) : (
            <div className="p-5 border border-dashed border-slate-200 rounded-xl text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <Award className="w-5 h-5 text-slate-300" />
              <p className="text-xxs font-medium leading-relaxed max-w-xs">No focus steps completed yet. Complete micro-steps on your active task to log verified milestones here!</p>
            </div>
          )}
        </div>
      </div>

      {/* Focus State Metrics summary */}
      <div className="grid grid-cols-2 gap-3 mt-1 pt-3 border-t border-slate-100">
        <div className="bg-slate-50 p-2.5 rounded-xl text-center border border-slate-100">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Guarded Tasks</span>
          <span className="text-sm font-extrabold text-blue-600 mt-0.5 block">{activeGuardedTasksCount} Active</span>
        </div>
        <div className="bg-slate-50 p-2.5 rounded-xl text-center border border-slate-100">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Synced Milestones</span>
          <span className="text-sm font-extrabold text-emerald-600 mt-0.5 block">{completedFocusStepsCount} Saved</span>
        </div>
      </div>
    </div>
  );
}
