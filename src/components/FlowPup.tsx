import React, { useState, useEffect } from 'react';
import { Sparkles, MessageSquare, X, ChevronRight, HelpCircle, AlertCircle, Heart } from 'lucide-react';
import { Task, FixedTask } from '../types';
import { classifyActivity } from '../lib/activityClassifier';

interface FlowPupProps {
  simulatedHour: number;
  tasks: Task[];
  fixedTasks: FixedTask[];
  currentEnergy: number;
  capacityPercentRemaining: number;
  capacityRemainingMinutes: number;
  currentUser: any;
}

export default function FlowPup({
  simulatedHour,
  tasks,
  fixedTasks,
  currentEnergy,
  capacityPercentRemaining,
  capacityRemainingMinutes,
  currentUser
}: FlowPupProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isMinimized, setIsMinimized] = useState(() => {
    const saved = localStorage.getItem('flow_pup_minimized');
    return saved !== 'false';
  });
  const [advice, setAdvice] = useState('');
  const [adviceType, setAdviceType] = useState<'success' | 'warning' | 'info' | 'encouragement'>('info');
  const [mood, setMood] = useState<'happy' | 'thinking' | 'sleepy' | 'alert'>('happy');

  // Custom greeting sequence states
  const [quoteQueue, setQuoteQueue] = useState<string[]>([]);
  const [queueIndex, setQueueIndex] = useState<number>(0);
  const [prevUserUid, setPrevUserUid] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('flow_pup_minimized', String(isMinimized));
  }, [isMinimized]);

  // Login sequence detector: triggers every time currentUser changes (login or load)
  useEffect(() => {
    if (currentUser) {
      const currentUid = currentUser.uid || currentUser.email || 'user';
      if (prevUserUid !== currentUid) {
        setPrevUserUid(currentUid);
        
        // 1. Energy Quote
        let energyQuote = "";
        if (currentEnergy >= 75) {
          energyQuote = "🔥 Peak focus! Devote this prime energy state to high-friction coding, complex system debugging, or platform architecture.";
        } else if (currentEnergy >= 50) {
          energyQuote = "☕ Steady state. Great for writing PR descriptions, analyzing telemetry logs, and scheduling light developer syncs.";
        } else {
          energyQuote = "🚶 Recharging state. Stand up, stretch, hydrate, and let your subconscious mind solve complex bugs offline.";
        }

        // 2. Capacity Quote
        let capacityQuote = "";
        if (capacityPercentRemaining > 15) {
          capacityQuote = `💡 Scheduling Slot Advisor: You have ${capacityPercentRemaining}% capacity (${(capacityRemainingMinutes / 60).toFixed(1)}h) left today. More tasks fit into your planner perfectly!`;
        } else {
          const lowestPriorityTask = tasks
            .filter(t => t.status !== 'completed')
            .sort((a, b) => {
              const priorityVal = (task: Task) => (task.energyCost === 'Low' ? 1 : task.energyCost === 'Medium' ? 2 : 3);
              return priorityVal(a) - priorityVal(b);
            })[0];
          if (lowestPriorityTask) {
            capacityQuote = `⚠️ Schedule is Full: You are at peak load. Avoid scheduling new items today. If an urgent task arrives, we advise replacing "${lowestPriorityTask.title}" (lowest current load).`;
          } else {
            capacityQuote = `⚠️ Schedule is Full: You are at peak load. Avoid scheduling new items today. Consider pushing low-priority tasks to tomorrow.`;
          }
        }

        setQuoteQueue([energyQuote, capacityQuote]);
        setQueueIndex(0);
        setIsMinimized(false); // Make sure FlowPup pops open for the login alerts
      }
    } else {
      setPrevUserUid(null);
    }
  }, [currentUser, prevUserUid, currentEnergy, capacityPercentRemaining, capacityRemainingMinutes, tasks]);

  // Handle active quote queue transitions every 2 minutes
  useEffect(() => {
    if (quoteQueue.length > 0) {
      setAdvice(quoteQueue[queueIndex]);
      setAdviceType(queueIndex === 0 ? 'success' : 'info');
      setMood(queueIndex === 0 ? 'alert' : 'thinking');

      // Shift the flow pup message every 2 minutes (120,000ms)
      const timer = setInterval(() => {
        setQueueIndex((prevIndex) => {
          const nextIndex = prevIndex + 1;
          if (nextIndex < quoteQueue.length) {
            return nextIndex;
          } else {
            setQuoteQueue([]); // Finished all queue items, clear out
            return 0;
          }
        });
      }, 120000); // 2 minutes

      return () => clearInterval(timer);
    }
  }, [quoteQueue, queueIndex]);

  // Compute direct, situation-aware smart advice based on current schedule and energy state
  useEffect(() => {
    // If there's an active login quote queue, do not overwrite advice
    if (quoteQueue.length > 0) return;

    // 1. Get previous hour and check for Physical Exhaustion
    const prevHour = (simulatedHour - 1 + 24) % 24;
    const hasRecentPhysicalExhaustion = fixedTasks.some(r => {
      const hStr = r.startTime.split(':')[0];
      return parseInt(hStr, 10) === prevHour && classifyActivity(r.title) === 'Physical Exhaustion';
    });

    // 2. Check for upcoming high cognitive tasks in the next 2 hours
    const upcomingHighCognitive = tasks.some(t => {
      if (!t.scheduledTime || t.status === 'completed') return false;
      const tHour = parseInt(t.scheduledTime.split(':')[0], 10);
      const isNext = tHour >= simulatedHour && tHour <= simulatedHour + 2;
      return isNext && classifyActivity(t.title, t.description) === 'High Cognitive Load';
    });

    // 3. Current hour High Cognitive block running
    const currentHighCognitiveRoutine = fixedTasks.find(r => {
      const startH = parseInt(r.startTime.split(':')[0], 10);
      const endH = parseInt(r.endTime.split(':')[0], 10);
      const active = simulatedHour >= startH && simulatedHour < endH;
      return active && classifyActivity(r.title) === 'High Cognitive Load';
    });

    // Determine advice and mood
    if (hasRecentPhysicalExhaustion) {
      setAdvice("Hey! You just finished a heavy workout block. Take 15 minutes to rehydrate and stretch before diving into focus blocks. Your brain will thank you! 💧");
      setAdviceType('encouragement');
      setMood('alert');
    } else if (currentEnergy >= 75 && upcomingHighCognitive) {
      setAdvice("Your body clock matches peak focus right now, and you've got high cognitive tasks waiting. Let's smash that high-priority task! 🚀");
      setAdviceType('success');
      setMood('happy');
    } else if (currentEnergy < 40) {
      setAdvice("I see your body energy level is dipping below 40%. Time to take a mindful break, stretch, or do a 5-minute deep breathing loop. Don't force burnout! 🔋");
      setAdviceType('warning');
      setMood('sleepy');
    } else if (currentHighCognitiveRoutine) {
      setAdvice("You are currently in a high cognitive load block. Put on some lofi, minimize phone notifications, and let's get into the Flow state. I believe in you! 🐾");
      setAdviceType('info');
      setMood('thinking');
    } else if (tasks.length === 0) {
      setAdvice("Our schedule board is entirely clear today! Ready to define a few daily goals and plan them out? Just click '+ Add Task' above! 📝");
      setAdviceType('info');
      setMood('happy');
    } else {
      // General encouraging advice
      const generalPrompts = [
        "Let's focus on one bite-sized micro-step at a time. Multi-tasking is a myth! 🐶",
        "Looking good! Daily progress is built on small, regular work. Keep updating your steps!",
        "Remember to blink, stand up for a moment, and drink some water. Let's maintain healthy posture! 🚶",
        "Your flow score increases when your scheduled slots line up with your natural energy levels! ✨"
      ];
      const index = simulatedHour % generalPrompts.length;
      setAdvice(generalPrompts[index]);
      setAdviceType('info');
      setMood('happy');
    }
  }, [simulatedHour, tasks, fixedTasks, currentEnergy, quoteQueue.length]);

  if (!isVisible) return null;

  return (
    <>
      {isMinimized ? (
        /* Minimized Floating Icon */
        <button
          onClick={() => setIsMinimized(false)}
          className="fixed bottom-6 right-6 z-50 bg-indigo-600 text-white rounded-full p-3 shadow-2xl hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2 border border-indigo-400 group cursor-pointer"
          title="Talk to FlowPup Companion"
          id="flowpup-trigger-minimized"
        >
          {/* Miniature cute dog icon */}
          <span className="text-xl animate-bounce">🐶</span>
          <span className="text-xs font-bold font-display max-w-0 overflow-hidden group-hover:max-w-[80px] transition-all duration-300 ease-out whitespace-nowrap">
            FlowPup
          </span>
          <span className="absolute -top-1 -right-1 bg-red-500 w-2.5 h-2.5 rounded-full animate-pulse"></span>
        </button>
      ) : (
        /* Expanded FlowPup Panel peeking from the right edge */
        <div
          id="flowpup-companion-panel"
          className="fixed bottom-0 right-6 z-50 flex items-end gap-3 pointer-events-none select-none max-w-md w-full"
        >
          {/* Animated Speech Bubble */}
          <div className="flex-1 pb-20 pointer-events-auto">
            <div className="bg-white border-2 border-indigo-150 rounded-2xl p-4 shadow-xl relative animate-fade-in flex flex-col gap-2">
              {/* Bubble Arrow Tail pointing down-right to the puppy */}
              <div className="absolute right-8 -bottom-3 w-5 h-5 bg-white border-r-2 border-b-2 border-indigo-150 rotate-45"></div>

              {/* Header Bar */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-full font-display flex items-center gap-1">
                    <Heart className="w-3 h-3 text-indigo-500 fill-current animate-pulse" />
                    Companion: FlowPup
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setIsMinimized(true)}
                    className="text-slate-400 hover:text-indigo-600 p-0.5 rounded hover:bg-slate-50 transition-colors cursor-pointer text-xxs font-bold uppercase tracking-wide px-1.5"
                    title="Minimize companion"
                  >
                    Minimize
                  </button>
                  <button
                    onClick={() => setIsVisible(false)}
                    className="text-slate-400 hover:text-rose-500 p-0.5 rounded hover:bg-slate-50 transition-colors cursor-pointer"
                    title="Close completely"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Message Body */}
              <div className="flex gap-2.5 items-start">
                <div className="mt-0.5 shrink-0">
                  {adviceType === 'warning' ? (
                    <div className="bg-amber-50 p-1.5 rounded-lg border border-amber-200">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                    </div>
                  ) : adviceType === 'success' ? (
                    <div className="bg-emerald-50 p-1.5 rounded-lg border border-emerald-200">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                    </div>
                  ) : (
                    <div className="bg-blue-50 p-1.5 rounded-lg border border-blue-200">
                      <MessageSquare className="w-4 h-4 text-blue-600" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                  "{advice}"
                </p>
              </div>
            </div>
          </div>

          {/* Fully Custom SVG Peeking Cute Dog with tail-wagging & ears breathing animation */}
          <div className="w-24 h-24 relative pointer-events-auto shrink-0 animate-flowpup-peek">
            <svg
              viewBox="0 0 100 100"
              className="w-full h-full overflow-visible drop-shadow-md cursor-pointer animate-flowpup-idle"
              onClick={() => setIsMinimized(true)}
              title="Click to minimize puppy companion"
            >
              {/* Tail Wagging behind */}
              <g className="animate-flowpup-tail">
                <path d="M 15,35 Q 5,15 2,25 Q 5,30 15,35" fill="#ca8a04" stroke="#854d0e" strokeWidth="1.5" />
              </g>

              {/* Dog Body / Back */}
              <path d="M 20,95 Q 25,60 55,60 Q 80,60 85,95 Z" fill="#ca8a04" stroke="#854d0e" strokeWidth="2" />
              {/* Dog Chest (White collar area) */}
              <path d="M 40,75 Q 50,68 60,75 Q 50,95 40,75 Z" fill="#fef08a" />

              {/* Paw resting on the frame bottom */}
              <g className="translate-y-2">
                <circle cx="75" cy="85" r="8" fill="#ca8a04" stroke="#854d0e" strokeWidth="2" />
                <circle cx="69" cy="81" r="3" fill="#ca8a04" />
                <circle cx="75" cy="79" r="3" fill="#ca8a04" />
                <circle cx="81" cy="81" r="3" fill="#ca8a04" />
              </g>

              {/* Head Circle */}
              <circle cx="50" cy="42" r="22" fill="#eab308" stroke="#854d0e" strokeWidth="2" />

              {/* Left Ear */}
              <path d="M 32,32 Q 22,20 20,38 Q 24,44 32,36 Z" fill="#ca8a04" stroke="#854d0e" strokeWidth="2" className="animate-flowpup-ear" />

              {/* Right Ear */}
              <path d="M 68,32 Q 78,20 80,38 Q 76,44 68,36 Z" fill="#ca8a04" stroke="#854d0e" strokeWidth="2" className="animate-flowpup-ear" />

              {/* Snout Area */}
              <ellipse cx="50" cy="49" rx="10" ry="7" fill="#fef08a" stroke="#a16207" strokeWidth="1.5" />
              {/* Cute Dog Nose */}
              <path d="M 46,47 Q 50,44 54,47 Q 50,52 46,47 Z" fill="#1e293b" />

              {/* Eyes */}
              {mood === 'sleepy' ? (
                <>
                  {/* Closed sleepy arc eyes */}
                  <path d="M 38,40 Q 42,43 44,40" fill="none" stroke="#1e293b" strokeWidth="2" />
                  <path d="M 56,40 Q 58,43 62,40" fill="none" stroke="#1e293b" strokeWidth="2" />
                </>
              ) : (
                <>
                  {/* Alert awake eyes */}
                  <circle cx="41" cy="39" r="3.5" fill="#1e293b" />
                  <circle cx="40" cy="38" r="1.2" fill="#ffffff" /> {/* Light twinkle */}

                  <circle cx="59" cy="39" r="3.5" fill="#1e293b" />
                  <circle cx="58" cy="38" r="1.2" fill="#ffffff" /> {/* Light twinkle */}
                </>
              )}

              {/* Rosy Cheeks */}
              <ellipse cx="34" cy="46" rx="3.5" ry="2" fill="#f43f5e" opacity="0.5" />
              <ellipse cx="66" cy="46" rx="3.5" ry="2" fill="#f43f5e" opacity="0.5" />

              {/* Smile Mouth Line */}
              <path d="M 48,51 Q 50,53 52,51" fill="none" stroke="#1e293b" strokeWidth="1.5" />

              {/* Cute Red Tongue peeking out for Happy mood */}
              {mood === 'happy' && (
                <path d="M 48,52 Q 50,57 52,52 Z" fill="#f43f5e" stroke="#be123c" strokeWidth="1" />
              )}
            </svg>
          </div>
        </div>
      )}
    </>
  );
}
