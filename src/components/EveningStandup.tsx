import React, { useState } from 'react';
import { Moon, Star, CheckSquare, Square, Sparkles, Smile, Frown, ShieldAlert, ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { Task, EveningReflection } from '../types';

interface EveningStandupProps {
  tasks: Task[];
  onSaveReflection: (reflection: EveningReflection) => Promise<void>;
  onClose: () => void;
  aiProvider?: string;
  clientGeminiApiKey?: string;
  clientOpenaiApiKey?: string;
  clientAnthropicApiKey?: string;
  clientDeepseekApiKey?: string;
}

export default function EveningStandup({
  tasks,
  onSaveReflection,
  onClose,
  aiProvider = 'gemini',
  clientGeminiApiKey,
  clientOpenaiApiKey,
  clientAnthropicApiKey,
  clientDeepseekApiKey,
}: EveningStandupProps) {
  const [rating, setRating] = useState<number>(4);
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>(() => 
    tasks.filter(t => t.status === 'completed').map(t => t.id)
  );
  const [selectedChallenges, setSelectedChallenges] = useState<string[]>([]);
  const [rawInput, setRawInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string>('');
  const [savedReflection, setSavedReflection] = useState<EveningReflection | null>(null);

  const challengeChips = [
    { id: 'distraction', label: '📱 Social Media / Distraction' },
    { id: 'fatigue', label: '💤 Afternoon Energy Slump' },
    { id: 'underestimate', label: '⏱️ Task Overestimated' },
    { id: 'meetings', label: '🤝 Meeting Overload' },
    { id: 'motivation', label: '🔋 Low Motivation / Procrastination' },
    { id: 'tech', label: '💻 Technical Roadblocks' },
  ];

  const toggleTaskCompleted = (taskId: string) => {
    setCompletedTaskIds(prev => 
      prev.includes(taskId) 
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  const toggleChallenge = (id: string) => {
    setSelectedChallenges(prev => 
      prev.includes(id) 
        ? prev.filter(c => c !== id)
        : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const uncompletedTaskIds = tasks.filter(t => !completedTaskIds.includes(t.id)).map(t => t.id);

    try {
      // Call server endpoint to get custom AI coaching feedback
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-ai-provider': aiProvider,
      };
      if (clientGeminiApiKey) headers['x-gemini-api-key'] = clientGeminiApiKey;
      if (clientOpenaiApiKey) headers['x-openai-api-key'] = clientOpenaiApiKey;
      if (clientAnthropicApiKey) headers['x-anthropic-api-key'] = clientAnthropicApiKey;
      if (clientDeepseekApiKey) headers['x-deepseek-api-key'] = clientDeepseekApiKey;

      const response = await fetch('/api/evening-reflection', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          rating,
          challenges: selectedChallenges.map(cid => challengeChips.find(cc => cc.id === cid)?.label || cid),
          rawInput,
          completedTasks: tasks.filter(t => completedTaskIds.includes(t.id)).map(t => t.title),
          uncompletedTasks: tasks.filter(t => uncompletedTaskIds.includes(t.id)).map(t => t.title),
        })
      });

      let aiCoaching = "";
      if (response.ok) {
        const data = await response.json();
        aiCoaching = data.feedback;
      } else {
        aiCoaching = "Awesome job reflecting on your day! To tackle your fatigue and focus challenges, consider inserting larger restorative buffers tomorrow during your transition blocks.";
      }

      setFeedback(aiCoaching);

      const reflectionObj: EveningReflection = {
        id: 'ref-' + Date.now(),
        date: new Date().toISOString().split('T')[0],
        timestamp: Date.now(),
        rating,
        challenges: selectedChallenges.map(cid => challengeChips.find(cc => cc.id === cid)?.label || cid),
        rawInput,
        completedTaskIds,
        uncompletedTaskIds,
        coachingFeedback: aiCoaching
      };

      await onSaveReflection(reflectionObj);
      setSavedReflection(reflectionObj);
    } catch (err) {
      console.error("Error submitting evening reflection:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 p-6 h-full overflow-y-auto max-h-[85vh] scrollbar-thin">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-2xl">
          <Moon className="w-5 h-5 animate-pulse" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-800 font-display uppercase tracking-wider">FlowDo Evening Standup</h3>
          <span className="text-[9px] text-slate-400 font-mono font-bold uppercase block mt-0.5">Reflect, Learn & Adaptive Scheduling</span>
        </div>
      </div>

      {!savedReflection ? (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Rating */}
          <div className="space-y-2">
            <label className="text-xxs font-bold text-slate-400 uppercase tracking-wider block">1. How was your focus & energy today?</label>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/60 p-3 rounded-2xl justify-center">
              {[1, 2, 3, 4, 5].map((val) => (
                <button
                  type="button"
                  key={val}
                  onClick={() => setRating(val)}
                  className={`p-2 rounded-xl transition-all ${
                    rating >= val ? 'text-amber-500 scale-110' : 'text-slate-300 hover:text-amber-300'
                  }`}
                >
                  <Star className="w-6 h-6 fill-current" />
                </button>
              ))}
              <span className="ml-3 text-xs font-bold text-slate-600">
                {rating === 5 ? '🚀 Stellar!' : rating === 4 ? '😊 Good' : rating === 3 ? '😐 Average' : rating === 2 ? '🥱 Distracted' : '🥵 Exhausted'}
              </span>
            </div>
          </div>

          {/* Tasks Re-check */}
          {tasks.length > 0 && (
            <div className="space-y-2">
              <label className="text-xxs font-bold text-slate-400 uppercase tracking-wider block">2. Confirm Completed Tasks</label>
              <div className="space-y-2 max-h-40 overflow-y-auto border border-slate-150 rounded-2xl p-3 bg-white scrollbar-thin">
                {tasks.map((task) => {
                  const isCompleted = completedTaskIds.includes(task.id);
                  return (
                    <div
                      key={task.id}
                      onClick={() => toggleTaskCompleted(task.id)}
                      className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-xl cursor-pointer transition-all border border-transparent hover:border-slate-100"
                    >
                      {isCompleted ? (
                        <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-300 shrink-0" />
                      )}
                      <span className={`text-xs font-medium ${isCompleted ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                        {task.title}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Distractions & Challenges */}
          <div className="space-y-2">
            <label className="text-xxs font-bold text-slate-400 uppercase tracking-wider block">3. What were the core challenges today?</label>
            <div className="flex flex-wrap gap-2">
              {challengeChips.map((chip) => {
                const isSelected = selectedChallenges.includes(chip.id);
                return (
                  <button
                    type="button"
                    key={chip.id}
                    onClick={() => toggleChallenge(chip.id)}
                    className={`text-xxs font-semibold px-3 py-2 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-red-55 border-red-200 text-red-700 shadow-3xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Raw Text reflection */}
          <div className="space-y-2">
            <label className="text-xxs font-bold text-slate-400 uppercase tracking-wider block">4. Detail your day & challenges (Optional)</label>
            <textarea
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder="e.g., I lost my focus around 2 PM and browsed Reddit because of an afternoon slump. It took me 30 minutes longer than scheduled to complete slide prep..."
              rows={3}
              className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-400 rounded-2xl p-3.5 text-xs focus:outline-none transition-all text-slate-800 placeholder:text-slate-400 font-medium leading-relaxed"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-slate-900 hover:bg-indigo-950 text-white font-bold py-3 rounded-2xl text-xs uppercase tracking-wider shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating AI Briefing...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
                <span>Save Standup & Get Feedback</span>
              </>
            )}
          </button>
        </form>
      ) : (
        <div className="space-y-5 animate-fade-in">
          <div className="bg-emerald-50 border border-emerald-100/60 p-4 rounded-2xl text-center space-y-1 shadow-2xs">
            <Smile className="w-8 h-8 text-emerald-600 mx-auto" />
            <h4 className="text-xs font-bold text-emerald-950 font-display uppercase tracking-wider">Standup Successfully Logged!</h4>
            <p className="text-[11px] text-emerald-700 font-semibold leading-relaxed">
              Your focus metrics have been securely stored. This data is now part of your adaptive scheduling memory.
            </p>
          </div>

          {feedback && (
            <div className="bg-gradient-to-r from-indigo-50/50 to-blue-50/40 border border-indigo-100 p-4.5 rounded-2xl space-y-2 shadow-3xs">
              <div className="flex items-center gap-1.5 text-indigo-800 font-bold uppercase tracking-wider text-[10px]">
                <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" />
                <span>Adaptive Coaching Feedforward</span>
              </div>
              <p className="text-slate-700 leading-relaxed font-semibold text-xs font-sans">
                {feedback}
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => {
                setSavedReflection(null);
                setRawInput('');
                setSelectedChallenges([]);
              }}
              className="flex-1 bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 font-bold py-2.5 rounded-xl text-xxs uppercase tracking-wider cursor-pointer text-center transition-all"
            >
              Log Another
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xxs uppercase tracking-wider cursor-pointer text-center transition-all"
            >
              Close Panel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
