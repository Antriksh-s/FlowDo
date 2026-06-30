import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, RefreshCw, Sparkles, Check, Trash2, Keyboard, HelpCircle, AlertCircle } from 'lucide-react';
import { Task, CalendarEvent, FixedTask } from '../types';

interface MorningStandupProps {
  tasks: Task[];
  events: CalendarEvent[];
  fixedTasks: FixedTask[];
  habitProfile: string[];
  wakeHour: number;
  aiProvider: 'gemini' | 'openai' | 'anthropic' | 'deepseek';
  clientGeminiApiKey: string;
  clientOpenaiApiKey: string;
  clientAnthropicApiKey: string;
  clientDeepseekApiKey: string;
  onApplyReorganization: (
    updatedTasks: Array<{ id: string; scheduledTime: string }>,
    updatedEvents: Array<any>,
    detectedPattern: string | null
  ) => void;
}

export default function MorningStandup({
  tasks,
  events,
  fixedTasks,
  habitProfile,
  wakeHour,
  aiProvider,
  clientGeminiApiKey,
  clientOpenaiApiKey,
  clientAnthropicApiKey,
  clientDeepseekApiKey,
  onApplyReorganization
}: MorningStandupProps) {
  const [standupState, setStandupState] = useState<'idle' | 'recording' | 'transcribing' | 'completed'>('idle');
  const [transcript, setTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [analyzedResults, setAnalyzedResults] = useState<{
    updatedTasks: Array<{ id: string; scheduledTime: string }>;
    updatedEvents: Array<any>;
    detectedPattern: string | null;
  } | null>(null);

  const recognitionRef = useRef<any>(null);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setTranscript(prev => {
            const separator = prev ? ' ' : '';
            return prev + separator + finalTranscript;
          });
        }
      };

      rec.onerror = (e: any) => {
        console.error('Speech recognition error:', e);
        if (e.error === 'not-allowed') {
          setErrorMessage("Microphone access was denied. Please allow permissions or type directly.");
        } else {
          setErrorMessage(`Voice recognition helper: ${e.error}. Direct typing enabled.`);
        }
        setIsRecording(false);
      };

      rec.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = rec;
    }

    return () => {
      if (recognitionRef.current && isRecording) {
        recognitionRef.current.stop();
      }
    };
  }, [isRecording]);

  const handleStartRecording = () => {
    setErrorMessage('');
    if (recognitionRef.current) {
      setStandupState('recording');
      setIsRecording(true);
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error('Error starting recognition:', e);
      }
    } else {
      setStandupState('recording');
      setErrorMessage("Voice speech-to-text not supported in this environment. Direct keyboard input fully enabled below!");
    }
  };

  const handleStopRecording = () => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleInsertDemo = () => {
    setTranscript("Ugh, my day is a total mess. I have that Q3 Strategy Proposal due at 5 PM, but there's a heavy Leadership Sync at 9 AM and a Client Prep at 3 PM. My energy usually tanks after those reviews... Please push my hardest focus work to when my coffee actually kicks in around 10:30.");
    setErrorMessage('');
    if (standupState === 'idle') {
      setStandupState('idle');
    }
  };

  const handleClear = () => {
    setTranscript('');
    setErrorMessage('');
    setStandupState('idle');
    setAnalyzedResults(null);
  };

  const handleAnalyzeSchedule = async () => {
    if (!transcript.trim()) {
      setErrorMessage("Please speak or type some daily schedule constraints first.");
      return;
    }

    handleStopRecording();
    setStandupState('transcribing');
    setErrorMessage('');

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-ai-provider': aiProvider,
      };
      if (clientGeminiApiKey) headers['x-gemini-api-key'] = clientGeminiApiKey;
      if (clientOpenaiApiKey) headers['x-openai-api-key'] = clientOpenaiApiKey;
      if (clientAnthropicApiKey) headers['x-anthropic-api-key'] = clientAnthropicApiKey;
      if (clientDeepseekApiKey) headers['x-deepseek-api-key'] = clientDeepseekApiKey;

      const response = await fetch('/api/refine-schedule', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tasks,
          events,
          fixedTasks,
          userPrompt: transcript,
          habitProfile,
          wakeHour,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server returned status ${response.status}`);
      }

      const data = await response.json();
      setAnalyzedResults(data);
      setStandupState('completed');
    } catch (err: any) {
      console.error('Triage analysis error:', err);
      setErrorMessage(err.message || 'Failed to analyze scheduling constraints. Please try again.');
      setStandupState('idle');
    }
  };

  const handleReset = () => {
    setStandupState('idle');
    setAnalyzedResults(null);
    setErrorMessage('');
  };

  const getTaskOriginalTime = (taskId: string) => {
    const t = tasks.find(item => item.id === taskId);
    return t?.scheduledTime || 'Unscheduled';
  };

  const getTaskTitle = (taskId: string) => {
    const t = tasks.find(item => item.id === taskId);
    return t?.title || `Task #${taskId}`;
  };

  const getEventOriginalTime = (eventId: string) => {
    const e = events.find(item => item.id === eventId);
    return e ? `${e.startTime} - ${e.endTime}` : 'Unscheduled';
  };

  const getEventTitle = (eventId: string) => {
    const e = events.find(item => item.id === eventId);
    return e?.title || `Event #${eventId}`;
  };

  return (
    <div id="morning-standup-container" className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-slate-800 font-sans flex flex-col gap-4 w-full">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Mic className="w-5 h-5 text-blue-600 animate-pulse" />
          <h3 className="text-sm font-bold font-display text-slate-800">Circadian Triage Standup</h3>
        </div>
        <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider font-mono">
          Interactive voice-to-calendar
        </span>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed font-medium">
        Speak or type your scheduling updates, fatigue states, or meeting changes. FlowDo automatically recalibrates your day to fit remaining intervals.
      </p>

      {errorMessage && (
        <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 text-xxs text-rose-700 font-semibold flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Recording/Typing Area */}
      {standupState !== 'transcribing' && standupState !== 'completed' && (
        <div className="flex flex-col gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 relative shadow-inner">
            
            {/* Action buttons bar */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {isRecording ? (
                  <button
                    type="button"
                    onClick={handleStopRecording}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xxs font-bold cursor-pointer transition-colors shadow-xs"
                  >
                    <MicOff className="w-3 h-3 text-white" />
                    <span>Stop Voice</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartRecording}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xxs font-bold cursor-pointer transition-colors shadow-xs"
                  >
                    <Mic className="w-3 h-3 text-white" />
                    <span>Start Voice</span>
                  </button>
                )}
                
                <button
                  type="button"
                  onClick={handleInsertDemo}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xxs font-bold cursor-pointer transition-colors"
                >
                  <HelpCircle className="w-3 h-3 text-slate-500" />
                  <span>Try Demo briefing</span>
                </button>
              </div>

              {transcript && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                  title="Clear text"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Editable Briefing Textarea */}
            <div className="relative">
              <textarea
                value={transcript}
                onChange={(e) => {
                  setTranscript(e.target.value);
                  setErrorMessage('');
                }}
                placeholder={isRecording ? "Listening... Speak naturally or start typing here..." : "Type or speak your schedule constraints, fatigue, or meeting changes..."}
                className="w-full h-32 bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-300 resize-none font-medium leading-relaxed shadow-xs"
              />
              {isRecording && (
                <div className="absolute right-3 bottom-3 flex items-center gap-1">
                  <span className="w-2 h-2 bg-rose-500 rounded-full animate-ping"></span>
                  <span className="text-[9px] text-rose-500 font-bold uppercase tracking-wider font-mono">Live Mic</span>
                </div>
              )}
            </div>

            {/* Micro visualizer if recording */}
            {isRecording && (
              <div className="flex items-center gap-1 justify-center py-1">
                {[...Array(8)].map((_, i) => (
                  <div
                    key={i}
                    className="w-0.5 bg-rose-500 rounded-full animate-pulse"
                    style={{
                      height: `${Math.random() * 12 + 4}px`,
                      animationDelay: `${i * 0.08}s`
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleAnalyzeSchedule}
            disabled={!transcript.trim()}
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-slate-950/10"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Analyze & Recalibrate Schedule</span>
          </button>
        </div>
      )}

      {/* Analyzing/Transcribing State */}
      {standupState === 'transcribing' && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-4 animate-fade-in min-h-64 shadow-inner">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
          <div>
            <p className="text-xs font-bold text-slate-700">Circadian Model Processing...</p>
            <p className="text-[10px] text-slate-400 mt-1 uppercase font-semibold font-mono tracking-wider">
              {aiProvider === 'gemini' ? 'Gemini 3.5 Flash' : aiProvider.toUpperCase()} evaluating biorhythms
            </p>
          </div>
          <div className="max-w-xs bg-white p-3 rounded-xl border border-slate-100 text-xxs text-slate-500 italic leading-relaxed">
            "{transcript.length > 120 ? transcript.slice(0, 120) + '...' : transcript}"
          </div>
        </div>
      )}

      {/* Completed Triage State */}
      {standupState === 'completed' && analyzedResults && (
        <div className="w-full animate-fade-in flex flex-col gap-4">
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 p-3 rounded-xl text-xs text-emerald-800 font-bold shadow-2xs">
            <Sparkles className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>Circadian calibration model successfully calculated!</span>
          </div>

          {analyzedResults.coachingSummary && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50/50 border border-blue-100/70 p-3.5 rounded-xl text-xs shadow-2xs">
              <div className="flex items-center gap-1.5 text-blue-800 font-bold mb-1 uppercase tracking-wider text-[10px]">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
                <span>FlowDo Coaching Briefing</span>
              </div>
              <p className="text-slate-700 leading-relaxed font-semibold font-sans">
                {analyzedResults.coachingSummary}
              </p>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3.5 shadow-sm">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Proposed Calendar Realignments</h4>
            
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {/* Tasks visual updates */}
              {analyzedResults.updatedTasks && analyzedResults.updatedTasks.length > 0 ? (
                analyzedResults.updatedTasks.map((ut) => {
                  const original = getTaskOriginalTime(ut.id);
                  return (
                    <div key={ut.id} className="flex items-center justify-between border-b border-slate-50 pb-2 text-xxs">
                      <div className="flex flex-col max-w-[60%]">
                        <span className="font-bold text-slate-700 truncate">{getTaskTitle(ut.id)}</span>
                        <span className="text-[9px] text-slate-400 font-medium">Task Shift</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="text-slate-400 line-through">{original}</span>
                        <span className="text-slate-400">➔</span>
                        <span className="text-blue-600 font-bold">{ut.scheduledTime}</span>
                      </div>
                    </div>
                  );
                })
              ) : null}

              {/* Events visual updates */}
              {analyzedResults.updatedEvents && analyzedResults.updatedEvents.length > 0 ? (
                analyzedResults.updatedEvents.map((ue) => {
                  const original = getEventOriginalTime(ue.id);
                  const isModified = original !== `${ue.startTime} - ${ue.endTime}`;
                  if (!isModified) return null;
                  return (
                    <div key={ue.id} className="flex items-center justify-between border-b border-slate-50 pb-2 text-xxs">
                      <div className="flex flex-col max-w-[60%]">
                        <span className="font-bold text-slate-700 truncate">{getEventTitle(ue.id)}</span>
                        <span className="text-[9px] text-slate-400 font-medium">Calendar Event</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="text-slate-400 line-through">{original}</span>
                        <span className="text-slate-400">➔</span>
                        <span className="text-emerald-600 font-bold">{ue.startTime} - {ue.endTime}</span>
                      </div>
                    </div>
                  );
                })
              ) : null}

              {(!analyzedResults.updatedTasks || analyzedResults.updatedTasks.length === 0) &&
               (!analyzedResults.updatedEvents || analyzedResults.updatedEvents.length === 0) && (
                <div className="text-xxs text-slate-400 italic text-center py-2">
                  No adjustments required; current schedule is fully optimized!
                </div>
              )}
            </div>

            {/* Extracted Pattern if detected */}
            {analyzedResults.detectedPattern && (
              <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3 text-xxs mt-2">
                <span className="font-bold text-blue-800 uppercase text-[9px] tracking-wider block mb-1">💡 Detected Habit Preference</span>
                <p className="text-slate-600 leading-normal font-semibold">"{analyzedResults.detectedPattern}"</p>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              id="reset-standup-btn"
              onClick={handleReset}
              className="flex-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold py-2 px-3 rounded-xl text-xs transition-colors cursor-pointer"
            >
              Retry / Back
            </button>
            <button
              type="button"
              id="apply-standup-btn"
              onClick={() => {
                if (transcript) {
                  localStorage.setItem('flow_morning_triage_context', transcript);
                }
                onApplyReorganization(
                  analyzedResults.updatedTasks,
                  analyzedResults.updatedEvents,
                  analyzedResults.detectedPattern
                );
              }}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 font-display cursor-pointer shadow-md shadow-blue-500/10"
            >
              <Check className="w-3.5 h-3.5 text-white" />
              <span>Apply Calibration</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
