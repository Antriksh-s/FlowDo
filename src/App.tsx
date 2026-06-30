import React, { useState, useEffect } from 'react';
import { Calendar, LayoutDashboard, Cpu, FileText, Zap, Battery, Sparkles, LogOut, CheckCircle, Info, Mic, Settings, User, Save, Check, Trash2, Plus, Minus, Clock, Brain, Lock } from 'lucide-react';
import { Task, CalendarEvent, MicroStep, FixedTask } from './types';
import { INITIAL_TASKS, INITIAL_CALENDAR_EVENTS, getEnergyForHour } from './data';
import DoEngineWidget from './components/DoEngineWidget';
import FlowStateCalendar from './components/FlowStateCalendar';
import MorningStandup from './components/MorningStandup';
import FrictionlessWidget from './components/FrictionlessWidget';
import FocusModeWidget from './components/FocusModeWidget';
import TaskFileStack from './components/TaskFileStack';
import FlowPup from './components/FlowPup';

// Firebase Imports
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import AuthModal from './components/AuthModal';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface ParsedICalEvent {
  summary: string;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  startDateStr: string; // "YYYY-MM-DD"
}

function parseICal(icsText: string, targetDate: Date): ParsedICalEvent[] {
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  
  const events: ParsedICalEvent[] = [];
  let currentEvent: { summary?: string; dtStart?: string; dtEnd?: string; rrule?: string; exdates?: string[] } | null = null;
  
  const parseDate = (rawStr: string): Date | null => {
    const m = rawStr.match(/(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2})(\d{2})Z?)?/);
    if (!m) return null;
    const [_, y, mo, d, hasTime, h, mi, s] = m;
    const year = parseInt(y, 10);
    const month = parseInt(mo, 10) - 1;
    const day = parseInt(d, 10);
    
    if (hasTime) {
      const hour = parseInt(h, 10);
      const min = parseInt(mi, 10);
      const sec = parseInt(s, 10);
      
      if (rawStr.endsWith('Z')) {
        return new Date(Date.UTC(year, month, day, hour, min, sec));
      } else {
        return new Date(year, month, day, hour, min, sec);
      }
    } else {
      return new Date(year, month, day, 0, 0, 0);
    }
  };

  const eventOccursOnDate = (startDt: Date, rruleStr: string | undefined, exdates: string[] | undefined, targetDt: Date): boolean => {
    const tY = targetDt.getFullYear();
    const tM = targetDt.getMonth();
    const tD = targetDt.getDate();

    const targetDateOnly = new Date(tY, tM, tD);
    const startDateOnly = new Date(startDt.getFullYear(), startDt.getMonth(), startDt.getDate());

    if (startDateOnly.getTime() > targetDateOnly.getTime()) {
      return false;
    }

    if (exdates && exdates.length > 0) {
      for (const ex of exdates) {
        const parts = ex.split(',');
        for (const p of parts) {
          const exDt = parseDate(p);
          if (exDt && exDt.getFullYear() === tY && exDt.getMonth() === tM && exDt.getDate() === tD) {
            return false;
          }
        }
      }
    }

    if (!rruleStr) {
      return startDateOnly.getTime() === targetDateOnly.getTime();
    }

    const rules: Record<string, string> = {};
    const parts = rruleStr.split(';');
    for (const p of parts) {
      const eqIdx = p.indexOf('=');
      if (eqIdx !== -1) {
        rules[p.substring(0, eqIdx).toUpperCase()] = p.substring(eqIdx + 1);
      }
    }

    if (rules.UNTIL) {
      const untilDt = parseDate(rules.UNTIL);
      if (untilDt) {
        const untilDateOnly = new Date(untilDt.getFullYear(), untilDt.getMonth(), untilDt.getDate());
        if (targetDateOnly.getTime() > untilDateOnly.getTime()) {
          return false;
        }
      }
    }

    const freq = rules.FREQ ? rules.FREQ.toUpperCase() : '';
    const interval = rules.INTERVAL ? parseInt(rules.INTERVAL, 10) : 1;

    if (freq === 'DAILY') {
      const diffTime = targetDateOnly.getTime() - startDateOnly.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      return diffDays % interval === 0;
    }

    if (freq === 'WEEKLY') {
      const dayMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
      const targetDay = targetDateOnly.getDay();

      let matchesDay = false;
      if (rules.BYDAY) {
        const bydays = rules.BYDAY.split(',');
        for (const bd of bydays) {
          const cleanBd = bd.substring(bd.length - 2).toUpperCase();
          if (dayMap[cleanBd] === targetDay) {
            matchesDay = true;
            break;
          }
        }
      } else {
        matchesDay = startDateOnly.getDay() === targetDay;
      }

      if (!matchesDay) return false;

      const diffTime = targetDateOnly.getTime() - startDateOnly.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      const diffWeeks = Math.floor(diffDays / 7);
      return diffWeeks % interval === 0;
    }

    if (freq === 'MONTHLY') {
      let matchesDay = false;
      if (rules.BYMONTHDAY) {
        const bymonthdays = rules.BYMONTHDAY.split(',');
        for (const bmd of bymonthdays) {
          if (parseInt(bmd, 10) === tD) {
            matchesDay = true;
            break;
          }
        }
      } else {
        matchesDay = startDateOnly.getDate() === tD;
      }

      if (!matchesDay) return false;

      const diffMonths = (tY - startDateOnly.getFullYear()) * 12 + (tM - startDateOnly.getMonth());
      return diffMonths % interval === 0;
    }

    if (freq === 'YEARLY') {
      return startDateOnly.getMonth() === tM && startDateOnly.getDate() === tD;
    }

    return startDateOnly.getTime() === targetDateOnly.getTime();
  };
  
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('BEGIN:VEVENT')) {
      currentEvent = {};
    } else if (line.startsWith('END:VEVENT')) {
      if (currentEvent && currentEvent.summary && currentEvent.dtStart) {
        const startDt = parseDate(currentEvent.dtStart);
        const endDt = currentEvent.dtEnd ? parseDate(currentEvent.dtEnd) : null;
        
        if (startDt && eventOccursOnDate(startDt, currentEvent.rrule, currentEvent.exdates, targetDate)) {
          const targetY = targetDate.getFullYear();
          const targetM = targetDate.getMonth();
          const targetD = targetDate.getDate();
          
          const shStr = startDt.getHours().toString().padStart(2, '0');
          const smStr = startDt.getMinutes().toString().padStart(2, '0');
          const startTime = `${shStr}:${smStr}`;
          
          let endTime = '';
          if (endDt) {
            const ehStr = endDt.getHours().toString().padStart(2, '0');
            const emStr = endDt.getMinutes().toString().padStart(2, '0');
            endTime = `${ehStr}:${emStr}`;
          } else {
            const eh = (startDt.getHours() + 1) % 24;
            endTime = `${eh.toString().padStart(2, '0')}:${smStr}`;
          }
          
          events.push({
            summary: currentEvent.summary,
            startTime,
            endTime,
            startDateStr: `${targetY}-${(targetM + 1).toString().padStart(2, '0')}-${targetD.toString().padStart(2, '0')}`
          });
        }
      }
      currentEvent = null;
    } else if (currentEvent) {
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        const keyPart = line.substring(0, colonIdx);
        const val = line.substring(colonIdx + 1);
        const key = keyPart.split(';')[0];
        
        if (key === 'SUMMARY') {
          currentEvent.summary = val.replace(/\\,/g, ',').replace(/\\;/g, ';').trim();
        } else if (key === 'DTSTART') {
          currentEvent.dtStart = val;
        } else if (key === 'DTEND') {
          currentEvent.dtEnd = val;
        } else if (key === 'RRULE') {
          currentEvent.rrule = val;
        } else if (key === 'EXDATE') {
          if (!currentEvent.exdates) currentEvent.exdates = [];
          currentEvent.exdates.push(val);
        }
      }
    }
  }
  return events;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'engine'>('dashboard');

  // Authentication & Firestore States
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [enterAsGuest, setEnterAsGuest] = useState<boolean>(false);
  const [isDataLoaded, setIsDataLoaded] = useState<boolean>(false);

  // Onboarding & Guest Restriction States
  const [isNewUser, setIsNewUser] = useState<boolean>(false);
  const [onboardingStep, setOnboardingStep] = useState<number>(1);
  const [onboardingWakeHour, setOnboardingWakeHour] = useState<number>(7);
  const [onboardingBreakfastStart, setOnboardingBreakfastStart] = useState<string>('08:00');
  const [onboardingBreakfastEnd, setOnboardingBreakfastEnd] = useState<string>('09:00');
  const [onboardingLunchStart, setOnboardingLunchStart] = useState<string>('12:00');
  const [onboardingLunchEnd, setOnboardingLunchEnd] = useState<string>('13:00');
  const [onboardingDinnerStart, setOnboardingDinnerStart] = useState<string>('18:00');
  const [onboardingDinnerEnd, setOnboardingDinnerEnd] = useState<string>('19:00');
  const [onboardingIcal, setOnboardingIcal] = useState<string>('');
  const [isGuestPromptOpen, setIsGuestPromptOpen] = useState<boolean>(false);
  const [guestPromptMessage, setGuestPromptMessage] = useState<string>('');

  const [tasks, setTasks] = useState<Task[]>(() => {
    const onboarded = localStorage.getItem('flow_onboarded') === 'true';
    if (onboarded) {
      const savedTasks = localStorage.getItem('flow_guest_tasks');
      if (savedTasks) {
        try {
          return JSON.parse(savedTasks);
        } catch (e) {}
      }
      return [];
    }
    return []; // Start empty for clean, friendly onboarding
  });
  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    const savedIcal = localStorage.getItem('flow_ical_url');
    if (savedIcal && savedIcal.trim()) {
      return [];
    }
    return INITIAL_CALENDAR_EVENTS;
  });
  const [wakeHour, setWakeHour] = useState<number>(() => {
    const saved = localStorage.getItem('flow_wake_hour');
    return saved ? parseInt(saved, 10) : 7;
  }); // 7:00 AM default
  const [simulatedHour, setSimulatedHour] = useState<number>(14); // 2:00 PM default (14:00)
  const [fixedTasks, setFixedTasks] = useState<FixedTask[]>(() => {
    const saved = localStorage.getItem('flow_fixed_tasks');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [
      { id: 'f1', title: '🍳 Breakfast & Energize', startTime: '08:00', endTime: '09:00' },
      { id: 'f2', title: '🍽️ Lunch Break', startTime: '12:00', endTime: '13:00' },
      { id: 'f3', title: '🏋️ Gym / Workout', startTime: '17:00', endTime: '18:00' }
    ];
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isFocusActive, setIsFocusActive] = useState<boolean>(false);
  const [isCalendarExpanded, setIsCalendarExpanded] = useState<boolean>(true);
  const [showMetrics, setShowMetrics] = useState<boolean>(false);
  const [showSandbox, setShowSandbox] = useState<boolean>(false);
  const [isTriageOpen, setIsTriageOpen] = useState<boolean>(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState<boolean>(false);
  const [isEnergyCapacityModalOpen, setIsEnergyCapacityModalOpen] = useState<boolean>(false);
  const [resetInput, setResetInput] = useState<string>('');
  const [newFixedTitle, setNewFixedTitle] = useState<string>('');
  const [newFixedStart, setNewFixedStart] = useState<string>('09:00');
  const [newFixedEnd, setNewFixedEnd] = useState<string>('10:00');
  const [haltStartHour, setHaltStartHour] = useState<number>(11);
  const [haltEndHour, setHaltEndHour] = useState<number>(14);

  const [habitProfile, setHabitProfile] = useState<string[]>(() => {
    const saved = localStorage.getItem('flow_habit_profile');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('flow_habit_profile', JSON.stringify(habitProfile));
  }, [habitProfile]);

  const [isFlowPupEnabled, setIsFlowPupEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('flow_pup_enabled');
    return saved !== 'false';
  });

  useEffect(() => {
    localStorage.setItem('flow_pup_enabled', String(isFlowPupEnabled));
  }, [isFlowPupEnabled]);

  // Load preferences from localStorage on start
  const [isOnboarded, setIsOnboarded] = useState<boolean>(() => {
    return localStorage.getItem('flow_onboarded') === 'true';
  });

  const [userName, setUserName] = useState<string>(() => {
    return localStorage.getItem('flow_user_name') || 'Productive Developer';
  });

  const [workingDays, setWorkingDays] = useState<number>(() => {
    const saved = localStorage.getItem('flow_working_days');
    return saved ? parseInt(saved, 10) : 5;
  });

  const [workingHours, setWorkingHours] = useState<number>(() => {
    const saved = localStorage.getItem('flow_working_hours');
    return saved ? parseInt(saved, 10) : 8;
  });

  const [hourlyFeelings, setHourlyFeelings] = useState<Record<number, 'high' | 'medium' | 'low'>>(() => {
    const saved = localStorage.getItem('flow_hourly_feelings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    // Default hourly feelings aligned with typical circadian peak/dip patterns
    return {
      8: 'medium',
      9: 'high',
      10: 'high',
      11: 'high',
      12: 'low',
      13: 'medium',
      14: 'low',
      15: 'medium',
      16: 'high',
      17: 'high',
      18: 'low',
      19: 'medium',
      20: 'low',
      21: 'low',
      22: 'low'
    };
  });

  // Client API keys
  const [clientGeminiApiKey, setClientGeminiApiKey] = useState<string>(() => {
    return localStorage.getItem('VITE_USER_GEMINI_KEY') || localStorage.getItem('user_gemini_api_key') || '';
  });
  const [clientSearchApiKey, setClientSearchApiKey] = useState<string>(() => {
    return localStorage.getItem('user_search_api_key') || '';
  });
  const [aiProvider, setAiProvider] = useState<'gemini' | 'openai' | 'anthropic' | 'deepseek'>('gemini');
  const [clientOpenaiApiKey, setClientOpenaiApiKey] = useState<string>(() => {
    return localStorage.getItem('user_openai_api_key') || '';
  });
  const [clientAnthropicApiKey, setClientAnthropicApiKey] = useState<string>(() => {
    return localStorage.getItem('user_anthropic_api_key') || '';
  });
  const [clientDeepseekApiKey, setClientDeepseekApiKey] = useState<string>(() => {
    return localStorage.getItem('user_deepseek_api_key') || '';
  });

  // Daily AI quota limit and usage state
  const FREE_DAILY_LIMIT = 100;
  const [usage, setUsage] = useState<{ dailyAiCallsCount: number; lastResetDate: string }>(() => {
    const saved = localStorage.getItem('flow_ai_usage');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return { dailyAiCallsCount: 0, lastResetDate: new Date().toLocaleDateString('sv-SE') };
  });

  const [isPaywallModalOpen, setIsPaywallModalOpen] = useState(false);

  const [icalUrl, setIcalUrl] = useState<string>(() => {
    return localStorage.getItem('flow_ical_url') || '';
  });
  const [isSyncingIcal, setIsSyncingIcal] = useState<boolean>(false);

  const [timezone, setTimezone] = useState<string>(() => {
    return localStorage.getItem('flow_timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  });

  // Keep state synced to localStorage
  useEffect(() => {
    localStorage.setItem('flow_ical_url', icalUrl);
  }, [icalUrl]);

  const handleSyncICal = async (urlOverride?: string) => {
    const urlToFetch = urlOverride !== undefined ? urlOverride : icalUrl;
    if (!urlToFetch || !urlToFetch.trim()) {
      // Clear any imported events if the URL is empty
      setFixedTasks(prev => prev.filter(ft => !ft.id.startsWith('f-ical-')));
      localStorage.removeItem('flow_ical_url');
      setEvents(INITIAL_CALENDAR_EVENTS); // Restore testing events when they clear the calendar!
      triggerToast("ℹ️ Calendar feed cleared (no URL specified).");
      return;
    }

    setIsSyncingIcal(true);
    try {
      const response = await fetch(`/api/proxy-ical?url=${encodeURIComponent(urlToFetch.trim())}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch iCal: ${response.statusText}`);
      }
      const icsText = await response.text();
      const parsed = parseICal(icsText, new Date());
      
      const newIcalEvents: FixedTask[] = parsed.map((e, idx) => ({
        id: `f-ical-${idx}-${Date.now()}`,
        title: `🗓️ ${e.summary}`,
        startTime: e.startTime,
        endTime: e.endTime
      }));

      setFixedTasks(prev => {
        // Keep only user-defined routines
        const userRoutines = prev.filter(ft => !ft.id.startsWith('f-ical-'));
        return [...userRoutines, ...newIcalEvents].sort((a, b) => a.startTime.localeCompare(b.startTime));
      });

      // Successfully synced real Google Calendar data, so clear the testing times (mock events)
      setEvents([]);

      localStorage.setItem('flow_ical_url', urlToFetch.trim());
      triggerToast(`✅ Sync Complete: Imported ${newIcalEvents.length} calendar meetings for today!`);
    } catch (err: any) {
      console.error('Error syncing calendar:', err);
      triggerToast(`⚠️ Sync failed: ${err.message || 'Check the URL format or connection'}`);
    } finally {
      setIsSyncingIcal(false);
    }
  };

  // Auth State Listener & Document Sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        setIsDataLoaded(false);
        if (user.displayName) {
          setUserName(user.displayName);
        } else if (user.email) {
          const fallback = user.email.split('@')[0];
          setUserName(localStorage.getItem('flow_user_name') || fallback);
        }
        try {
          const docRef = doc(db, 'users', user.uid, 'userdata', 'config');
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.userName) {
              setUserName(data.userName);
            }
            if (data.wakeupTime) {
              const h = parseInt(data.wakeupTime.split(':')[0], 10);
              if (!isNaN(h)) setWakeHour(h);
              setIsNewUser(false);
            } else {
              setIsNewUser(true);
              setTasks([]);
            }
            if (data.fixedRoutineTasks) {
              setFixedTasks(data.fixedRoutineTasks);
            }
            if (data.workingDays !== undefined) {
              setWorkingDays(data.workingDays);
            }
            if (data.workingHours !== undefined) {
              setWorkingHours(data.workingHours);
            }
            if (data.timezone !== undefined) {
              setTimezone(data.timezone);
            }
            if (data.isFlowPupEnabled !== undefined) {
              setIsFlowPupEnabled(data.isFlowPupEnabled);
            }
            if (data.importedCalendarUrl !== undefined) {
              setIcalUrl(data.importedCalendarUrl);
              if (data.importedCalendarUrl && data.importedCalendarUrl.trim() !== '') {
                setEvents([]); // Clear testing events immediately to avoid flicker
                handleSyncICal(data.importedCalendarUrl);
              }
            }
            if (data.activeTasksList) {
              setTasks(data.activeTasksList);
            } else {
              setTasks([]);
            }
            try {
              const habitProfileDocRef = doc(db, 'users', user.uid, 'userdata', 'habitProfile');
              const habitProfileSnap = await getDoc(habitProfileDocRef);
              if (habitProfileSnap.exists()) {
                const habitData = habitProfileSnap.data();
                if (habitData.rules) {
                  setHabitProfile(habitData.rules);
                }
              } else if (data.habitProfile) {
                setHabitProfile(data.habitProfile);
              } else {
                setHabitProfile([]);
              }
            } catch (err) {
              console.error("Error loading habit profile:", err);
              if (data.habitProfile) {
                setHabitProfile(data.habitProfile);
              } else {
                setHabitProfile([]);
              }
            }
            const checkAiQuotaLocal = (currentUsage: { dailyAiCallsCount: number; lastResetDate: string }) => {
              const todayStr = new Date().toLocaleDateString('sv-SE');
              if (currentUsage.lastResetDate !== todayStr) {
                return { dailyAiCallsCount: 0, lastResetDate: todayStr };
              }
              return currentUsage;
            };
            const loadedUsage = data.usage || { dailyAiCallsCount: 0, lastResetDate: '' };
            const checkedUsage = checkAiQuotaLocal(loadedUsage);
            setUsage(checkedUsage);
            if (checkedUsage.dailyAiCallsCount === 0 && loadedUsage.dailyAiCallsCount !== 0) {
              await setDoc(docRef, { usage: checkedUsage }, { merge: true });
            }
          } else {
            // First time login - initialize Document as a new user
            setIsNewUser(true);
            setTasks([]);
          }
        } catch (err) {
          console.error("Error fetching user configs from Firestore:", err);
          setIsNewUser(true);
          setTasks([]);
          handleFirestoreError(err, OperationType.GET, `users/${user.uid}/userdata/config`);
        } finally {
          setIsDataLoaded(true);
        }
      } else {
        setCurrentUser(null);
        setIsDataLoaded(true);
      }
    });
    return () => unsubscribe();
  }, []);

  // Sync back to Firestore on state updates
  useEffect(() => {
    if (!currentUser || !isDataLoaded || isNewUser) return;

    const saveData = async () => {
      try {
        const docRef = doc(db, 'users', currentUser.uid, 'userdata', 'config');
        const wakeupTimeStr = `${wakeHour.toString().padStart(2, '0')}:00`;
        await setDoc(docRef, {
          wakeupTime: wakeupTimeStr,
          fixedRoutineTasks: fixedTasks,
          importedCalendarUrl: icalUrl,
          activeTasksList: tasks,
          userName: userName,
          usage: usage,
          habitProfile: habitProfile,
          workingDays: workingDays,
          workingHours: workingHours,
          timezone: timezone,
          isFlowPupEnabled: isFlowPupEnabled
        }, { merge: true });

        // Also write to a separate habitProfile document
        const habitDocRef = doc(db, 'users', currentUser.uid, 'userdata', 'habitProfile');
        await setDoc(habitDocRef, { rules: habitProfile }, { merge: true });
      } catch (err) {
        console.error("Error writing user configs to Firestore:", err);
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}/userdata/config`);
      }
    };

    const timeoutId = setTimeout(() => {
      saveData();
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [tasks, fixedTasks, wakeHour, icalUrl, currentUser, isDataLoaded, isNewUser, userName, usage, habitProfile, workingDays, workingHours, timezone, isFlowPupEnabled]);

  const handleSignOut = async () => {
    try {
      await auth.signOut();
      // Wipe the local UI state
      setTasks(INITIAL_TASKS);
      setFixedTasks([
        { id: 'f1', title: '🍳 Breakfast & Energize', startTime: '08:00', endTime: '09:00' },
        { id: 'f2', title: '🍽️ Lunch Break', startTime: '12:00', endTime: '13:00' },
        { id: 'f3', title: '🏋️ Gym / Workout', startTime: '17:00', endTime: '18:00' }
      ]);
      setWakeHour(7);
      setIcalUrl('');
      setEnterAsGuest(false);
      setIsNewUser(false);
      triggerToast("Logged out successfully. State reset.");
    } catch (err: any) {
      console.error(err);
      triggerToast(`Error logging out: ${err.message}`);
    }
  };

  // Load and refresh iCal on mount
  useEffect(() => {
    const savedIcal = localStorage.getItem('flow_ical_url');
    if (savedIcal && savedIcal.trim()) {
      handleSyncICal(savedIcal);
    }
  }, []);

  const checkGuestRestriction = (featureName: string) => {
    if (!currentUser && enterAsGuest) {
      setGuestPromptMessage(`To use ${featureName}, please sign in or register an account. Guest mode is locally focused and doesn't support cloud credentials or calendar syncing.`);
      setIsGuestPromptOpen(true);
      return true; // Restricted
    }
    return false; // Allowed
  };

  const handleCompleteOnboarding = async () => {
    const newFixedRoutines: FixedTask[] = [
      { id: 'f_breakfast', title: '🍳 Breakfast & Routine', startTime: onboardingBreakfastStart, endTime: onboardingBreakfastEnd },
      { id: 'f_lunch', title: '🍽️ Lunch Break', startTime: onboardingLunchStart, endTime: onboardingLunchEnd },
      { id: 'f_dinner', title: '🍲 Dinner & Wind-down', startTime: onboardingDinnerStart, endTime: onboardingDinnerEnd }
    ];

    setWakeHour(onboardingWakeHour);
    setFixedTasks(newFixedRoutines);
    setTasks([]); // Clean slate empty tasks!

    if (currentUser) {
      try {
        const docRef = doc(db, 'users', currentUser.uid, 'userdata', 'config');
        const wakeupTimeStr = `${onboardingWakeHour.toString().padStart(2, '0')}:00`;
        await setDoc(docRef, {
          wakeupTime: wakeupTimeStr,
          fixedRoutineTasks: newFixedRoutines,
          importedCalendarUrl: onboardingIcal,
          activeTasksList: []
        });
        setIsNewUser(false);
        triggerToast("🎉 Onboarding complete! Cloud profile synced.");
        if (onboardingIcal && onboardingIcal.trim() !== '') {
          handleSyncICal(onboardingIcal);
        }
      } catch (err: any) {
        console.error("Error saving onboarding details to Firestore:", err);
        triggerToast(`⚠️ Failed to sync cloud config: ${err.message}`);
        setIsNewUser(false);
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}/userdata/config`);
      }
    } else {
      localStorage.setItem('flow_onboarded', 'true');
      localStorage.setItem('flow_wake_hour', onboardingWakeHour.toString());
      localStorage.setItem('flow_fixed_tasks', JSON.stringify(newFixedRoutines));
      localStorage.setItem('flow_guest_tasks', JSON.stringify([]));
      setIsNewUser(false);
      triggerToast("🎉 Onboarding complete! Guest workspace activated.");
    }
  };

  // Guest State Storage Synchronizers
  useEffect(() => {
    if (!currentUser && enterAsGuest) {
      localStorage.setItem('flow_guest_tasks', JSON.stringify(tasks));
    }
  }, [tasks, currentUser, enterAsGuest]);

  useEffect(() => {
    if (!currentUser && enterAsGuest) {
      localStorage.setItem('flow_fixed_tasks', JSON.stringify(fixedTasks));
    }
  }, [fixedTasks, currentUser, enterAsGuest]);

  useEffect(() => {
    if (!currentUser && enterAsGuest) {
      localStorage.setItem('flow_wake_hour', wakeHour.toString());
    }
  }, [wakeHour, currentUser, enterAsGuest]);

  useEffect(() => {
    localStorage.setItem('flow_user_name', userName);
  }, [userName]);

  useEffect(() => {
    localStorage.setItem('flow_working_days', workingDays.toString());
  }, [workingDays]);

  useEffect(() => {
    localStorage.setItem('flow_working_hours', workingHours.toString());
  }, [workingHours]);

  useEffect(() => {
    localStorage.setItem('flow_hourly_feelings', JSON.stringify(hourlyFeelings));
  }, [hourlyFeelings]);

  useEffect(() => {
    localStorage.setItem('user_gemini_api_key', clientGeminiApiKey);
    localStorage.setItem('VITE_USER_GEMINI_KEY', clientGeminiApiKey);
  }, [clientGeminiApiKey]);

  useEffect(() => {
    localStorage.setItem('flow_ai_usage', JSON.stringify(usage));
  }, [usage]);

  useEffect(() => {
    localStorage.setItem('user_search_api_key', clientSearchApiKey);
  }, [clientSearchApiKey]);

  useEffect(() => {
    localStorage.setItem('ai_provider', aiProvider);
  }, [aiProvider]);

  useEffect(() => {
    localStorage.setItem('user_openai_api_key', clientOpenaiApiKey);
  }, [clientOpenaiApiKey]);

  useEffect(() => {
    localStorage.setItem('user_anthropic_api_key', clientAnthropicApiKey);
  }, [clientAnthropicApiKey]);

  useEffect(() => {
    localStorage.setItem('user_deepseek_api_key', clientDeepseekApiKey);
  }, [clientDeepseekApiKey]);

  useEffect(() => {
    localStorage.setItem('flow_timezone', timezone);
  }, [timezone]);

  // Helper to get current hour in a specific timezone
  const getCurrentHourInTimezone = (tz: string): number => {
    try {
      const options: Intl.DateTimeFormatOptions = {
        timeZone: tz,
        hour: '2-digit',
        hour12: false
      };
      const formatter = new Intl.DateTimeFormat('en-US', options);
      const parts = formatter.formatToParts(new Date());
      const hourPart = parts.find(part => part.type === 'hour');
      if (hourPart) {
        let hr = parseInt(hourPart.value, 10);
        if (!isNaN(hr)) return hr;
      }
    } catch (e) {
      console.error('Error calculating hour in timezone:', e);
    }
    return new Date().getHours();
  };

  // Sync simulated hour with timezone hour on start or timezone shift
  useEffect(() => {
    const tzHour = getCurrentHourInTimezone(timezone);
    const minH = wakeHour;
    const maxH = wakeHour + 14;
    const clampedH = Math.max(minH, Math.min(maxH, tzHour));
    setSimulatedHour(clampedH);
  }, [timezone, wakeHour]);

  // Clamp simulatedHour when wakeHour shifts, avoiding drag lag
  useEffect(() => {
    setSimulatedHour(prev => {
      if (prev < wakeHour) return wakeHour;
      if (prev > wakeHour + 14) return wakeHour + 14;
      return prev;
    });
  }, [wakeHour]);

  // Shift routines and calendar events proportionally when the user explicitly updates their wake hour calibration
  const handleUpdateWakeHour = (newWakeHour: number) => {
    setWakeHour(newWakeHour);
    
    setFixedTasks(prev => {
      return prev.map(item => {
        if (item.title.includes('Breakfast') || item.id === 'f1' || item.id === 'f_breakfast') {
          const start = newWakeHour + 1;
          const end = newWakeHour + 2;
          return {
            ...item,
            startTime: `${start.toString().padStart(2, '0')}:00`,
            endTime: `${end.toString().padStart(2, '0')}:00`
          };
        }
        if (item.title.includes('Lunch') || item.id === 'f2' || item.id === 'f_lunch') {
          const start = newWakeHour + 5;
          const end = newWakeHour + 6;
          return {
            ...item,
            startTime: `${start.toString().padStart(2, '0')}:00`,
            endTime: `${end.toString().padStart(2, '0')}:00`
          };
        }
        if (item.title.includes('Gym') || item.title.includes('Workout') || item.title.includes('Dinner') || item.id === 'f3' || item.id === 'f_dinner') {
          const start = newWakeHour + 10;
          const end = newWakeHour + 11;
          return {
            ...item,
            startTime: `${start.toString().padStart(2, '0')}:00`,
            endTime: `${end.toString().padStart(2, '0')}:00`
          };
        }
        return item;
      });
    });

    setEvents(prev => {
      return prev.map(evt => {
        if (evt.id === 'e1' || evt.title.includes('Morning Ritual') || evt.title.includes('Breakfast')) {
          const start = newWakeHour + 1;
          const end = newWakeHour + 2;
          return {
            ...evt,
            startTime: `${start.toString().padStart(2, '0')}:00`,
            endTime: `${end.toString().padStart(2, '0')}:00`
          };
        }
        if (evt.id === 'e4' || evt.title.includes('Mid-day Recharge') || evt.title.includes('Lunch')) {
          const start = newWakeHour + 5;
          const end = newWakeHour + 6;
          return {
            ...evt,
            startTime: `${start.toString().padStart(2, '0')}:00`,
            endTime: `${end.toString().padStart(2, '0')}:00`
          };
        }
        return evt;
      });
    });
  };

  // Auto-resolve overlaps between scheduled tasks and the single source of truth fixedTasks
  useEffect(() => {
    if (!isDataLoaded) return;
    
    const parseTimeToMinutes = (tStr: string) => {
      const [h, m] = tStr.split(':').map(Number);
      return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
    };

    let tasksUpdated = false;
    const updatedTasks = tasks.map(task => {
      if (!task.scheduledTime || task.status === 'completed') return task;
      
      const taskStartMin = parseTimeToMinutes(task.scheduledTime);
      const duration = task.microSteps && task.microSteps.length > 0 
        ? task.microSteps.reduce((sum, ms) => sum + (ms.estimatedMinutes || 20), 0)
        : 60;
      const taskEndMin = taskStartMin + duration;
      
      const overlaps = fixedTasks.some(ft => {
        const ftStartMin = parseTimeToMinutes(ft.startTime);
        const ftEndMin = parseTimeToMinutes(ft.endTime);
        return taskStartMin < ftEndMin && taskEndMin > ftStartMin;
      });
      
      if (overlaps) {
        tasksUpdated = true;
        return { ...task, scheduledTime: undefined };
      }
      return task;
    });
    
    if (tasksUpdated) {
      setTasks(updatedTasks);
      triggerToast("⚠️ Routine shift collision: overlapping backlog tasks released to backlog.");
    }
  }, [fixedTasks]);

  // Show a gorgeous non-intrusive toast
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Callback when a new task is parsed in the playground
  const handleTaskCreated = (newTask: Task) => {
    // Detect if task is "small" (sum of estimated minutes <= 45 mins)
    const totalMinutes = newTask.microSteps ? newTask.microSteps.reduce((sum, ms) => sum + (ms.estimatedMinutes || 20), 0) : 30;
    const isSmall = totalMinutes <= 45;
    let finalScheduledTime = newTask.scheduledTime || '11:00';
    let isAutoScheduledEarly = false;

    if (isSmall) {
      // Find the earliest slot starting from wakeHour + 1 that is free of other task calendar events
      let foundHour = wakeHour + 1; // e.g., if wake at 7, start at 8 AM
      for (let hr = wakeHour + 1; hr <= 17; hr++) {
        const isSlotBusy = events.some(e => e.startTime.startsWith(hr.toString().padStart(2, '0')));
        if (!isSlotBusy) {
          foundHour = hr;
          break;
        }
      }
      finalScheduledTime = `${foundHour.toString().padStart(2, '0')}:00`;
      newTask.scheduledTime = finalScheduledTime;
      isAutoScheduledEarly = true;
    }

    setTasks(prev => [newTask, ...prev]);

    // Add a corresponding calendar event for visualization
    const startHourInt = parseInt(finalScheduledTime.split(':')[0], 10) || 11;
    const newEvent: CalendarEvent = {
      id: 'e-dyn-' + Date.now(),
      title: newTask.title,
      startTime: finalScheduledTime,
      endTime: `${(startHourInt + 1).toString().padStart(2, '0')}:00`,
      type: 'task',
      energyImpact: 'neutral',
      connectedTaskId: newTask.id
    };
    setEvents(prev => [...prev, newEvent]);

    if (isAutoScheduledEarly) {
      triggerToast(`⚡ Small task detected (${totalMinutes}m)! Scheduled early at ${finalScheduledTime} for a quick win!`);
    } else {
      triggerToast(`Added task & scheduled slot at ${newEvent.startTime}!`);
    }
  };

  // Callback when a micro-step is ticked
  const handleStepCompleted = (taskId: string, stepId: string) => {
    let activatedFocus = false;
    setTasks(prev =>
      prev.map(t => {
        if (t.id === taskId) {
          const updatedSteps = t.microSteps.map(ms => {
            if (ms.id === stepId) {
              const newStatus = ms.status === 'todo' ? ('done' as const) : ('todo' as const);
              return { ...ms, status: newStatus };
            }
            return ms;
          });
          // Compute overall task completeness
          const allDone = updatedSteps.every(ms => ms.status === 'done');
          return {
            ...t,
            microSteps: updatedSteps,
            status: allDone ? ('completed' as const) : ('in_progress' as const)
          };
        }
        return t;
      })
    );

    // Automatically trigger Focus Mode during critical task execution periods!
    if (!isFocusActive) {
      setIsFocusActive(true);
      activatedFocus = true;
    }

    if (activatedFocus) {
      triggerToast("🎯 Critical execution period: FlowShield Focus Guard AUTO-ACTIVATED!");
    } else {
      triggerToast("Google Tasks synced! Micro-step progress captured.");
    }
  };

  const getCalibratedEnergy = (hour: number): number => {
    const feeling = hourlyFeelings[hour];
    if (feeling === 'high') return 85;
    if (feeling === 'medium') return 60;
    if (feeling === 'low') return 25;

    const shift = wakeHour - 8;
    const adjustedHour = hour - shift;
    return getEnergyForHour(adjustedHour);
  };

  const handleScheduleTaskAtHour = (title: string, timeOrHour: string | number) => {
    let formattedHour = '';
    let hour = 8;
    let mins = 0;
    if (typeof timeOrHour === 'string') {
      formattedHour = timeOrHour;
      const parts = timeOrHour.split(':');
      hour = parseInt(parts[0], 10);
      mins = parseInt(parts[1], 10) || 0;
    } else {
      formattedHour = `${timeOrHour.toString().padStart(2, '0')}:00`;
      hour = timeOrHour;
    }

    const startMinsTotal = hour * 60 + mins;
    const endMinsTotal = startMinsTotal + 60;
    const endH = Math.floor(endMinsTotal / 60) % 24;
    const endM = endMinsTotal % 60;
    const formattedEnd = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

    const newTask: Task = {
      id: 't-dyn-' + Date.now(),
      title: title,
      description: 'Quick scheduled task block matching peak energy focus patterns.',
      deadline: 'Today',
      energyCost: getCalibratedEnergy(hour) >= 75 ? 'High' : getCalibratedEnergy(hour) >= 50 ? 'Medium' : 'Low',
      status: 'pending',
      category: 'Focus',
      scheduledTime: formattedHour,
      microSteps: [
        {
          id: 'ms-dyn-' + Date.now() + '-1',
          title: 'Start active work',
          estimatedMinutes: 20,
          energyRequired: getCalibratedEnergy(hour) >= 75 ? 'High' : getCalibratedEnergy(hour) >= 50 ? 'Medium' : 'Low',
          status: 'todo',
          suggestions: '* Focused single-tasking session without social tabs.',
          resources: []
        }
      ]
    };
    setTasks(prev => [newTask, ...prev]);

    // Add corresponding calendar event
    const newEvent: CalendarEvent = {
      id: 'e-dyn-' + Date.now(),
      title: title,
      startTime: formattedHour,
      endTime: formattedEnd,
      type: 'task',
      energyImpact: 'neutral',
      connectedTaskId: newTask.id
    };
    setEvents(prev => [...prev, newEvent]);
    triggerToast(`Scheduled "${title}" at ${formattedHour}!`);
  };

  // Triggered by Morning Triage "Apply"
  const handleApplyReorganization = (
    updatedTasks: Array<{ id: string; scheduledTime: string }>,
    updatedEvents: Array<any>,
    detectedPattern: string | null
  ) => {
    if (updatedTasks && updatedTasks.length > 0) {
      setTasks(prev => {
        const updated = prev.map(t => {
          const update = updatedTasks.find(ut => ut.id === t.id);
          return update ? { ...t, scheduledTime: update.scheduledTime } : t;
        });

        // If any updated task ID is missing from the current list, restore/add it
        const missing = updatedTasks.filter(ut => !prev.some(t => t.id === ut.id));
        for (const m of missing) {
          const template = INITIAL_TASKS.find(t => t.id === m.id);
          if (template) {
            updated.push({ ...template, scheduledTime: m.scheduledTime });
          }
        }
        return updated;
      });
    }

    if (updatedEvents && updatedEvents.length > 0) {
      setEvents(prev => {
        const updated = prev.map(e => {
          const update = updatedEvents.find(ue => ue.id === e.id);
          return update ? { ...e, startTime: update.startTime, endTime: update.endTime, title: update.title } : e;
        });

        // If any updated event ID is missing from the calendar, restore/add it
        const missing = updatedEvents.filter(ue => !prev.some(e => e.id === ue.id));
        for (const m of missing) {
          const template = INITIAL_CALENDAR_EVENTS.find(e => e.id === m.id);
          if (template) {
            updated.push({ ...template, startTime: m.startTime, endTime: m.endTime, title: m.title });
          } else {
            updated.push({
              id: m.id,
              title: m.title || 'Dynamic Calibration Event',
              startTime: m.startTime,
              endTime: m.endTime,
              type: 'task',
              energyImpact: 'neutral'
            });
          }
        }
        return updated;
      });
    }

    if (detectedPattern) {
      setHabitProfile(prev => {
        if (!prev.includes(detectedPattern)) {
          return [...prev, detectedPattern];
        }
        return prev;
      });
      triggerToast(`Biorhythm calibrated! Added custom habit rule: "${detectedPattern}"`);
    } else {
      triggerToast("Biorhythm recalibrated: Hard focus shifted to peak hours.");
    }
  };

  // Triggered when dynamic shifting is activated
  const handleShiftTasks = () => {
    triggerToast("Circadian Traffic Control: shifted active blocks around meetings!");
  };

  // Calculate overall completeness stats
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;

  const currentEnergy = getCalibratedEnergy(simulatedHour);

  // Helper to estimate duration of each task
  const getTaskDuration = (task: Task) => {
    if (task.microSteps && task.microSteps.length > 0) {
      return task.microSteps.reduce((sum, ms) => sum + (ms.estimatedMinutes || 20), 0);
    }
    return 30; // default 30 mins
  };

  const getFixedTaskDuration = (ft: FixedTask) => {
    if (!ft.startTime || !ft.endTime) return 0;
    const [sh, sm] = ft.startTime.split(':').map(Number);
    const [eh, em] = ft.endTime.split(':').map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
  };

  const predefinedDailyMinutes = fixedTasks.reduce((sum, ft) => sum + getFixedTaskDuration(ft), 0);
  const plannedTaskMinutes = tasks.filter(t => t.status !== 'completed').reduce((sum, t) => sum + getTaskDuration(t), 0);
  const totalCapacityMinutes = workingHours * 60;
  const capacityRemainingMinutes = Math.max(0, totalCapacityMinutes - plannedTaskMinutes - predefinedDailyMinutes);
  const capacityPercentRemaining = Math.max(0, Math.min(100, Math.round((capacityRemainingMinutes / totalCapacityMinutes) * 100)));

  // Helper to check if a task falls within the specified halt range
  const isTaskInHaltRange = (task: Task, start: number, end: number) => {
    if (!task.scheduledTime) return false;
    const hr = parseInt(task.scheduledTime.split(':')[0], 10);
    return hr >= start && hr < end;
  };

  // List of affected tasks for OOO Halt preview
  const affectedTasksForHalt = tasks.filter(t => isTaskInHaltRange(t, haltStartHour, haltEndHour) && t.status !== 'completed');

  // Callback to reset tasks back to defaults (keeps preferences like wakeHour, simulatedHour, name, workingHours, hourlyFeelings intact)
  const handleResetTasksToDefault = () => {
    const freshTasks = JSON.parse(JSON.stringify(INITIAL_TASKS));
    const freshEvents = JSON.parse(JSON.stringify(INITIAL_CALENDAR_EVENTS));
    setTasks(freshTasks);
    setEvents(freshEvents);
    setIsPreferencesOpen(false);
    triggerToast("🕒 Planned tasks and calendar events refreshed back to blueprint defaults!");
  };

  // Callback to update a task's duration from the Energy & Capacity Advisor Modal
  const handleUpdateTaskDuration = (taskId: string, newDuration: number) => {
    const clampedDuration = Math.max(5, newDuration);
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const updated = { ...t };
        if (updated.microSteps && updated.microSteps.length > 0) {
          const currentSum = updated.microSteps.reduce((sum, ms) => sum + (ms.estimatedMinutes || 20), 0);
          const diff = clampedDuration - currentSum;
          updated.microSteps = updated.microSteps.map((ms, idx) => {
            if (idx === 0) {
              return { ...ms, estimatedMinutes: Math.max(5, (ms.estimatedMinutes || 20) + diff) };
            }
            return ms;
          });
        } else {
          updated.microSteps = [{
            id: 'ms-fallback-' + Date.now(),
            title: 'General Execution',
            estimatedMinutes: clampedDuration,
            energyRequired: 'Medium',
            status: 'todo',
            resources: []
          }];
        }
        return updated;
      }
      return t;
    }));

    // Update corresponding scheduled calendar event duration
    setEvents(prev => prev.map(evt => {
      if (evt.connectedTaskId === taskId && evt.startTime) {
        const [sh, sm] = evt.startTime.split(':').map(Number);
        const startMin = sh * 60 + sm;
        const endMin = startMin + clampedDuration;
        const eh = Math.min(23, Math.floor(endMin / 60));
        const em = Math.floor(endMin % 60);
        return {
          ...evt,
          endTime: `${eh.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}`
        };
      }
      return evt;
    }));
  };

  const handleDeleteFixedTask = (id: string) => {
    setFixedTasks(prev => prev.filter(f => f.id !== id));
    triggerToast("Routine block removed. Capacity released!");
  };

  const handleAddFixedTask = (title: string, start: string, end: string) => {
    const newFixed: FixedTask = {
      id: 'f-dyn-' + Date.now(),
      title,
      startTime: start,
      endTime: end
    };
    setFixedTasks(prev => [...prev, newFixed]);
    triggerToast(`Added custom routine block: ${title}`);
  };

  // Callback for OOO Halt - Option A: Ignore and shift to next available hours
  const handleShiftOverHalt = (start: number, end: number) => {
    const shiftAmount = end - start;
    setTasks(prev => prev.map(task => {
      if (task.scheduledTime) {
        const hr = parseInt(task.scheduledTime.split(':')[0], 10);
        const min = task.scheduledTime.split(':')[1] || '00';
        if (hr >= start && hr < end) {
          const newHr = hr + shiftAmount;
          const finalHr = newHr >= 24 ? (newHr - 24) : newHr;
          return {
            ...task,
            scheduledTime: `${finalHr.toString().padStart(2, '0')}:${min}`
          };
        }
      }
      return task;
    }));

    setEvents(prev => {
      const shifted = prev.map(evt => {
        if (evt.startTime) {
          const hr = parseInt(evt.startTime.split(':')[0], 10);
          const min = evt.startTime.split(':')[1] || '00';
          if (hr >= start && hr < end) {
            const newHr = hr + shiftAmount;
            const finalHr = newHr >= 24 ? (newHr - 24) : newHr;
            const duration = parseInt(evt.endTime.split(':')[0], 10) - hr || 1;
            const finalEndHr = (finalHr + duration) >= 24 ? 23 : (finalHr + duration);
            return {
              ...evt,
              startTime: `${finalHr.toString().padStart(2, '0')}:${min}`,
              endTime: `${finalEndHr.toString().padStart(2, '0')}:00`
            };
          }
        }
        return evt;
      });

      const haltEvent: CalendarEvent = {
        id: 'ooo-' + Date.now(),
        title: '🛑 Out of Office (Work Halt)',
        startTime: `${start.toString().padStart(2, '0')}:00`,
        endTime: `${end.toString().padStart(2, '0')}:00`,
        type: 'meeting',
        energyImpact: 'recharge'
      };
      return [...shifted, haltEvent];
    });

    triggerToast(`Emergency OOO Halt applied! Shifting affected work blocks to next available slots after ${end}:00.`);
    setIsPreferencesOpen(false);
  };

  // Callback for OOO Halt - Option B: Cancel / Postpone to a later date
  const handleCancelOrPostponeHalt = (start: number, end: number) => {
    setTasks(prev => prev.map(task => {
      if (task.scheduledTime) {
        const hr = parseInt(task.scheduledTime.split(':')[0], 10);
        if (hr >= start && hr < end) {
          return {
            ...task,
            status: 'completed',
            title: `[Postponed] ${task.title}`,
            deadline: 'Moved to next working day'
          };
        }
      }
      return task;
    }));

    setEvents(prev => {
      const filtered = prev.filter(evt => {
        if (evt.connectedTaskId) {
          const task = tasks.find(t => t.id === evt.connectedTaskId);
          if (task && task.scheduledTime) {
            const hr = parseInt(task.scheduledTime.split(':')[0], 10);
            if (hr >= start && hr < end) {
              return false;
            }
          }
        }
        return true;
      });

      const haltEvent: CalendarEvent = {
        id: 'ooo-' + Date.now(),
        title: '🛑 Out of Office (Work Halt)',
        startTime: `${start.toString().padStart(2, '0')}:00`,
        endTime: `${end.toString().padStart(2, '0')}:00`,
        type: 'meeting',
        energyImpact: 'recharge'
      };
      return [...filtered, haltEvent];
    });

    triggerToast(`Emergency OOO Halt applied! Affected deliverables moved to a later date.`);
    setIsPreferencesOpen(false);
  };

  const getBatteryBackground = (energy: number) => {
    if (energy >= 75) {
      return 'linear-gradient(90deg, rgba(16, 185, 129, 0.08) 0%, rgba(52, 211, 153, 0.22) 50%, rgba(16, 185, 129, 0.12) 100%)';
    }
    if (energy >= 50) {
      return 'linear-gradient(90deg, rgba(245, 158, 11, 0.08) 0%, rgba(251, 191, 36, 0.22) 50%, rgba(245, 158, 11, 0.14) 100%)';
    }
    return 'linear-gradient(90deg, rgba(239, 68, 68, 0.08) 0%, rgba(248, 113, 113, 0.22) 50%, rgba(239, 68, 68, 0.14) 100%)';
  };

  if (!isDataLoaded) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 selection:bg-blue-500/30 selection:text-white font-sans relative overflow-hidden">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative w-16 h-16 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-4 border-blue-600/20"></div>
            <div className="absolute inset-0 rounded-full border-4 border-t-blue-600 animate-spin"></div>
          </div>
          <div>
            <h3 className="text-md font-bold text-slate-800 font-display">Configuring Workspace</h3>
            <p className="text-xs text-slate-500 font-medium mt-1">Retrieving circadian calendar profile from cloud state...</p>
          </div>
        </div>
      </div>
    );
  }

  if (isNewUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 selection:bg-blue-500/30 selection:text-white font-sans relative overflow-hidden">
        {/* Background blobs for premium micro-wizard feel */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl translate-x-1/2 translate-y-1/2 pointer-events-none" />

        {/* Wizard Container */}
        <div className="w-full max-w-xl bg-white rounded-3xl border border-slate-200 p-8 md:p-10 shadow-xl relative z-10 animate-fade-in flex flex-col gap-8">
          
          {/* Header & Steps Indicator */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-5 shrink-0">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 text-white p-2.5 rounded-xl shadow-md shadow-blue-500/10">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 font-display">Workspace Calibration</h2>
                <p className="text-xxs text-slate-400 font-medium">Step {onboardingStep} of 3</p>
              </div>
            </div>
            
            {/* Steps Progress Pills */}
            <div className="flex items-center gap-1.5">
              {[1, 2, 3].map((step) => (
                <div
                  key={step}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    onboardingStep === step
                      ? 'w-6 bg-blue-600'
                      : onboardingStep > step
                      ? 'w-2 bg-blue-400'
                      : 'w-2 bg-slate-200'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* STEP 1: WELCOME & WAKEUP CALIBRATION */}
          {onboardingStep === 1 && (
            <div className="flex flex-col gap-5 animate-fade-in">
              <div className="space-y-1">
                <h3 className="text-md font-bold text-slate-800 font-display">☀️ Wakeup Calibration</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Your circadian rhythm determines your body's daily biological energy peaks. Tell us when your day starts to synchronize your planner.
                </p>
              </div>

              {/* Username Input Field */}
              <div className="flex flex-col gap-1.5 p-5 bg-slate-50 rounded-2xl border border-slate-150">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Your Name / Username</label>
                <input
                  type="text"
                  placeholder="Enter your name or nickname..."
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/25 transition-all font-semibold shadow-xs"
                />
              </div>

              {/* Wakeup Hour Slider */}
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-150 flex flex-col gap-4 text-center">
                <span className="text-xxs font-bold text-slate-400 uppercase tracking-wider block">Target Wakeup Time</span>
                
                {/* Sun Position Visual Indicator */}
                <div className="relative h-16 w-full bg-gradient-to-b from-blue-50 to-amber-50/40 rounded-xl overflow-hidden flex items-center justify-center border border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-3xl animate-bounce">
                      {onboardingWakeHour <= 6 ? '🌅' : onboardingWakeHour <= 8 ? '☕' : '☀️'}
                    </span>
                    <span className="text-xl font-extrabold text-slate-800 font-mono">
                      {onboardingWakeHour.toString().padStart(2, '0')}:00 AM
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xxs font-bold text-slate-400">4:00 AM</span>
                  <input
                    type="range"
                    min={4}
                    max={11}
                    value={onboardingWakeHour}
                    onChange={(e) => setOnboardingWakeHour(parseInt(e.target.value, 10))}
                    className="flex-1 accent-blue-600 cursor-pointer"
                  />
                  <span className="text-xxs font-bold text-slate-400">11:00 AM</span>
                </div>

                <p className="text-[11px] text-slate-500 italic font-medium mt-1">
                  {onboardingWakeHour <= 6
                    ? "Early Riser 🌅 – Your peak focus hours will align with the quiet early morning."
                    : onboardingWakeHour <= 8
                    ? "Optimal Flow ☕ – Standard circadian peaks will map nicely into mid-day."
                    : "Late Start 🥞 – Your peak productivity windows will shift into late afternoon."}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button
                  onClick={() => setOnboardingStep(2)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider px-6 py-3 rounded-xl transition-all cursor-pointer shadow-md shadow-blue-500/10 flex items-center gap-1.5"
                >
                  <span>Continue</span>
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: FIXED ROUTINE BLOCKS */}
          {onboardingStep === 2 && (
            <div className="flex flex-col gap-5 animate-fade-in">
              <div className="space-y-1">
                <h3 className="text-md font-bold text-slate-800 font-display">🍔 Essential Daily Routines</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Lock in your standard routine times. These are placed as immutable routine blocks on your daily schedule, preventing task manager overlays.
                </p>
              </div>

              <div className="space-y-4">
                {/* Breakfast */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🍳</span>
                    <div>
                      <span className="text-xs font-bold text-slate-700 block">Breakfast Block</span>
                      <span className="text-[10px] text-slate-400 block font-medium">Recharge and energize</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={onboardingBreakfastStart}
                      onChange={(e) => setOnboardingBreakfastStart(e.target.value)}
                      className="bg-white border border-slate-200 text-slate-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500 font-mono font-bold"
                    />
                    <span className="text-slate-400 text-xs font-bold">to</span>
                    <input
                      type="time"
                      value={onboardingBreakfastEnd}
                      onChange={(e) => setOnboardingBreakfastEnd(e.target.value)}
                      className="bg-white border border-slate-200 text-slate-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500 font-mono font-bold"
                    />
                  </div>
                </div>

                {/* Lunch */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🍽️</span>
                    <div>
                      <span className="text-xs font-bold text-slate-700 block">Lunch Break</span>
                      <span className="text-[10px] text-slate-400 block font-medium">Midday rest period</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={onboardingLunchStart}
                      onChange={(e) => setOnboardingLunchStart(e.target.value)}
                      className="bg-white border border-slate-200 text-slate-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500 font-mono font-bold"
                    />
                    <span className="text-slate-400 text-xs font-bold">to</span>
                    <input
                      type="time"
                      value={onboardingLunchEnd}
                      onChange={(e) => setOnboardingLunchEnd(e.target.value)}
                      className="bg-white border border-slate-200 text-slate-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500 font-mono font-bold"
                    />
                  </div>
                </div>

                {/* Dinner */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🍲</span>
                    <div>
                      <span className="text-xs font-bold text-slate-700 block">Dinner Block</span>
                      <span className="text-[10px] text-slate-400 block font-medium">Evening relaxation</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={onboardingDinnerStart}
                      onChange={(e) => setOnboardingDinnerStart(e.target.value)}
                      className="bg-white border border-slate-200 text-slate-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500 font-mono font-bold"
                    />
                    <span className="text-slate-400 text-xs font-bold">to</span>
                    <input
                      type="time"
                      value={onboardingDinnerEnd}
                      onChange={(e) => setOnboardingDinnerEnd(e.target.value)}
                      className="bg-white border border-slate-200 text-slate-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500 font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between pt-4 border-t border-slate-100">
                <button
                  onClick={() => setOnboardingStep(1)}
                  className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs uppercase tracking-wider px-5 py-3 rounded-xl transition-all cursor-pointer"
                >
                  Back
                </button>
                <button
                  onClick={() => setOnboardingStep(3)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider px-6 py-3 rounded-xl transition-all cursor-pointer shadow-md shadow-blue-500/10 flex items-center gap-1.5"
                >
                  <span>Continue</span>
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: OPTIONAL CALENDAR IMPORT */}
          {onboardingStep === 3 && (
            <div className="flex flex-col gap-5 animate-fade-in">
              <div className="space-y-1">
                <h3 className="text-md font-bold text-slate-800 font-display">🗓️ External Calendar Integration</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Want to bring in your existing schedule? Paste your Google Calendar Secret iCal link here (you can always skip this and add it later).
                </p>
              </div>

              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-150 flex flex-col gap-4">
                <span className="text-xxs font-bold text-slate-400 uppercase tracking-wider block">Google Calendar iCal Feed URL</span>
                
                {/* Guest Mode Special warning / guard */}
                {!currentUser && enterAsGuest ? (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex flex-col gap-2">
                    <span className="text-xxs font-extrabold text-amber-700 uppercase tracking-wider flex items-center gap-1">
                      ⚠️ Feature Restricted
                    </span>
                    <p className="text-[10px] text-amber-800 leading-normal font-medium">
                      Google Calendar iCal feeds require cloud-synchronized state storage. Please register or sign in to bypass restrictions and sync live accounts.
                    </p>
                    <button
                      onClick={() => {
                        setIsAuthModalOpen(true);
                      }}
                      className="bg-white border border-amber-200 text-amber-800 text-[10px] font-bold py-1.5 px-3 rounded-lg hover:bg-amber-100/50 transition-all cursor-pointer self-start shadow-xs"
                    >
                      Create Account / Sign In
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                    value={onboardingIcal}
                    onChange={(e) => setOnboardingIcal(e.target.value)}
                    className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-blue-500 font-mono font-bold"
                  />
                )}

                <div className="text-[10px] text-slate-400 flex items-start gap-1.5 mt-1 leading-normal">
                  <span>💡</span>
                  <span>
                    You can retrieve this from your desktop Google Calendar by going to Settings &gt; Secret address in iCal format.
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between pt-4 border-t border-slate-100">
                <button
                  onClick={() => setOnboardingStep(2)}
                  className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs uppercase tracking-wider px-5 py-3 rounded-xl transition-all cursor-pointer"
                >
                  Back
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCompleteOnboarding}
                    className="bg-white border border-slate-200 hover:border-slate-350 text-slate-600 font-bold text-xs uppercase tracking-wider px-5 py-3 rounded-xl transition-all cursor-pointer"
                  >
                    Skip for Now
                  </button>
                  <button
                    onClick={() => {
                      if (!currentUser && enterAsGuest && onboardingIcal.trim() !== '') {
                        checkGuestRestriction("Google Calendar Sync");
                      } else {
                        handleCompleteOnboarding();
                      }
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider px-6 py-3 rounded-xl transition-all cursor-pointer shadow-md shadow-blue-500/10 flex items-center gap-1.5"
                  >
                    <span>Finish Calibration</span>
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Global modals nested in context */}
        <AuthModal 
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onSuccess={(msg) => triggerToast(msg)}
        />
      </div>
    );
  }

  if (!currentUser && !enterAsGuest) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 md:p-8 relative overflow-hidden selection:bg-blue-500/20 selection:text-blue-700">
        {/* Abstract Background Accents */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl translate-x-1/2 translate-y-1/2 pointer-events-none" />

        <div className="w-full max-w-2xl bg-white border border-slate-200 shadow-xl rounded-3xl p-8 md:p-12 text-center relative z-10 animate-fade-in">
          {/* Brand Logo icon container */}
          <div className="inline-flex bg-indigo-600 p-4 rounded-2xl text-white font-black shadow-lg shadow-indigo-500/20 mb-6 hover:scale-110 transition-transform duration-300">
            <Zap className="w-10 h-10 fill-current" />
          </div>

          <h1 className="text-4xl font-extrabold font-display tracking-tight text-slate-950 mb-3">
            Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-600">FlowDo</span>
          </h1>
          <p className="text-slate-500 text-sm max-w-lg mx-auto mb-10 leading-relaxed font-medium">
            Supercharge your circadian rhythm with an intelligent task manager, routine blocker, and real-time iCal Google Calendar synchronizer built to maximize daily performance.
          </p>

          {/* Core Value Props Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10 text-left">
            <div className="p-4 bg-slate-50 border border-slate-150 rounded-2xl">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 mb-2 font-bold">
                ⚡
              </div>
              <h4 className="text-xs font-bold font-display text-slate-800 uppercase tracking-wide">Biorhythm Scheduling</h4>
              <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                Align tasks dynamically with your daily biological mental energy peaks.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-150 rounded-2xl">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 mb-2 font-bold">
                🗓️
              </div>
              <h4 className="text-xs font-bold font-display text-slate-800 uppercase tracking-wide">Google Calendar</h4>
              <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                Import secret iCal URLs as immutable routine holds that AI schedules respect.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-150 rounded-2xl">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 mb-2 font-bold">
                ☁️
              </div>
              <h4 className="text-xs font-bold font-display text-slate-800 uppercase tracking-wide">Firestore Syncing</h4>
              <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                Securely persist, edit, and synchronize your schedule in real-time across devices.
              </p>
            </div>
          </div>

          {/* Actions Stack */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-3 rounded-2xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-indigo-500/20 cursor-pointer flex items-center justify-center gap-2"
            >
              <User className="w-4 h-4" />
              <span>Sign In / Create Account</span>
            </button>

            <button
              onClick={() => {
                setEnterAsGuest(true);
                const onboarded = localStorage.getItem('flow_onboarded') === 'true';
                if (!onboarded) {
                  setIsNewUser(true);
                  setTasks([]);
                } else {
                  setIsNewUser(false);
                  const savedTasks = localStorage.getItem('flow_guest_tasks');
                  if (savedTasks) {
                    try {
                      setTasks(JSON.parse(savedTasks));
                    } catch (e) {
                      setTasks([]);
                    }
                  } else {
                    setTasks([]);
                  }
                }
                triggerToast("Entering workspace in Guest Mode. Local fallback activated.");
              }}
              className="w-full sm:w-auto bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/10 text-slate-700 font-bold px-8 py-3 rounded-2xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-xs"
            >
              Continue as Guest
            </button>
          </div>
        </div>

        <AuthModal 
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onSuccess={(msg) => triggerToast(msg)}
        />
      </div>
    );
  }

  return (
    <div id="flowdo-root-app" className="min-h-screen lg:h-screen lg:max-h-screen lg:overflow-hidden bg-slate-50 text-slate-900 flex flex-col relative selection:bg-blue-500/20 selection:text-blue-700">
      {/* Background Task File Stack Animation Backdrop */}
      <TaskFileStack tasks={tasks} />

      {/* Header Bar styled as a Battery Cylinder with dual fluid background animation layers */}
      <header
        id="app-header-bar"
        className="relative border-2 border-slate-300/80 bg-white/95 backdrop-blur-md rounded-2xl mx-6 mt-4 px-6 py-4 flex flex-col gap-4 transition-all duration-300
          after:content-[''] after:absolute after:-right-2.5 after:top-1/3 after:h-1/3 after:w-2.5 after:bg-slate-300 after:rounded-r-lg after:border-y-2 after:border-r-2 after:border-slate-300/80"
      >
        {/* Fluid Battery Charge Fill Backdrop - Body Energy */}
        <div
          className="absolute inset-y-0 left-0 -z-10 battery-fluid-fill rounded-l-[14px] transition-all duration-700"
          style={{
            width: `${currentEnergy}%`,
            background: getBatteryBackground(currentEnergy),
          }}
        >
          {/* Animated fluid wave glass shine overlay */}
          <div className="absolute inset-0 battery-glass-highlight"></div>
        </div>

        {/* Remaining Capacity Backdrop (Flowing from Right to Left in a premium soft teal/indigo overlay) */}
        <div
          className="absolute inset-y-0 right-0 -z-10 rounded-r-[14px] transition-all duration-700 bg-gradient-to-l from-indigo-500/10 via-emerald-400/5 to-transparent"
          style={{
            width: `${capacityPercentRemaining}%`,
          }}
        />

        {/* Row 1: Brand Logo, Stats, & Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            {/* Brand Logo, Title & Username Preferences Trigger */}
            <div className="flex flex-col gap-2.5 shrink-0">
              <div className="flex items-center gap-3 shrink-0">
                <div className="bg-blue-600 p-2.5 rounded-lg text-white font-black shadow-md shadow-blue-500/15 shrink-0">
                  <Zap className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <h1 className="text-xl font-bold font-display tracking-tight text-slate-850 flex items-center gap-1.5">
                    FlowDo <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-0.5 rounded-full font-mono font-medium">v1.0 Blueprint</span>
                  </h1>
                  <p className="text-xs text-slate-500 font-medium">AI Task Manager & Daily Energy Tracker</p>
                </div>
              </div>

              {/* Username Preferences Trigger & Session Control */}
              <div
                id="header-username-preferences-container"
                className="flex items-center gap-2 p-1.5 bg-slate-100 rounded-xl border border-slate-200/80 w-fit select-none"
              >
                <button
                  onClick={() => setIsPreferencesOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded-lg transition-all text-[11px] font-bold cursor-pointer"
                  title="Open Account Preferences & API Keys"
                >
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span className="truncate max-w-[150px]">{userName}</span>
                  <Settings className="w-3.5 h-3.5 text-slate-500 ml-0.5" />
                </button>
                <div className="h-4 w-[1px] bg-slate-200" />
                {currentUser ? (
                  <button
                    onClick={handleSignOut}
                    className="flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100/80"
                    title="Logout and reset local states"
                  >
                    <LogOut className="w-3 h-3 text-rose-600" />
                    <span>Logout</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setIsAuthModalOpen(true)}
                    className="flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer border border-indigo-250 bg-indigo-600 text-white hover:bg-indigo-700"
                    title="Sign in to sync your schedule to the cloud"
                  >
                    <User className="w-3 h-3" />
                    <span>Sync</span>
                  </button>
                )}
              </div>

              {/* Shifted Energy and Capacity indicator right below the username container */}
              <button
                id="energy-capacity-advisor-trigger"
                onClick={() => setIsEnergyCapacityModalOpen(true)}
                className="flex flex-wrap items-center gap-1.5 p-1 rounded-full border border-slate-200 bg-slate-50 hover:bg-slate-100 active:scale-98 transition-all shadow-sm cursor-pointer hover:shadow-md shrink-0 w-fit group"
                title="Click to view detailed Biorhythm Energy & Cognitive Capacity breakdown"
              >
                {/* Energy Indicator */}
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-xs font-bold text-[11px] bg-white transition-colors group-hover:bg-slate-50 ${
                  currentEnergy >= 75 ? 'text-emerald-700 border-emerald-100' : currentEnergy >= 50 ? 'text-amber-700 border-amber-100' : 'text-rose-700 border-rose-100'
                }`}>
                  <span className={`w-2 h-2 rounded-full animate-pulse ${
                    currentEnergy >= 75 ? 'bg-emerald-500' : currentEnergy >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}></span>
                  <span>Energy: {currentEnergy}%</span>
                </div>

                {/* Capacity Indicator */}
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-xs font-bold text-[11px] bg-white transition-colors group-hover:bg-slate-50 ${
                  capacityPercentRemaining >= 30 ? 'text-blue-700 border-blue-100' : 'text-amber-700 border-amber-100'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    capacityPercentRemaining >= 30 ? 'bg-blue-500 animate-pulse' : 'bg-amber-500'
                  }`}></span>
                  <span>Capacity: {capacityPercentRemaining}% ({(capacityRemainingMinutes / 60).toFixed(1)}h left)</span>
                </div>
              </button>
            </div>
          </div>

          {/* Right Actions: Focus Guard Toggle & Tab Selection */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            {/* Morning Triage Trigger Button */}
            <button
              id="header-morning-triage-btn"
              onClick={() => setIsTriageOpen(true)}
              className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all uppercase cursor-pointer border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 shadow-sm"
              title="Open Morning Triage Voice-to-Calendar pop-up"
            >
              <Mic className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
              <span>Morning Triage</span>
            </button>

            {/* Top Banner Focus Guard Switch */}
            <button
              id="banner-focus-shield-btn"
              onClick={() => {
                setIsFocusActive(!isFocusActive);
                triggerToast(isFocusActive ? "Focus Shield deactivated." : "Focus Shield actively shielding your day!");
              }}
              className={`flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all uppercase cursor-pointer border ${
                isFocusActive
                  ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-500/15 hover:bg-blue-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {isFocusActive ? (
                <>
                  <span className="w-2 h-2 bg-white rounded-full animate-ping shrink-0"></span>
                  <span>Shield On</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 bg-slate-400 rounded-full shrink-0"></span>
                  <span>Shield Off</span>
                </>
              )}
            </button>

            {/* Tab Selection */}
            <div className="flex bg-slate-100 border border-slate-200 p-1 rounded-xl gap-0.5 shadow-inner">
              <button
                id="tab-dashboard"
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                  activeTab === 'dashboard'
                    ? 'bg-white text-blue-600 border border-slate-200/40 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Dashboard</span>
              </button>
              <button
                id="tab-engine"
                onClick={() => setActiveTab('engine')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                  activeTab === 'engine'
                    ? 'bg-white text-blue-600 border border-slate-200/40 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Planner</span>
              </button>
            </div>
          </div>
        </div>

      </header>

      {/* Main Container Area */}
      <main id="app-main-content" className="flex-1 p-6 max-w-full mx-auto w-full flex flex-col gap-6 lg:overflow-hidden min-h-0">
        {/* Morning Triage Modal Dialog */}
        {isTriageOpen && (
          <div id="morning-triage-modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden relative">
              <button
                id="close-triage-modal-btn"
                onClick={() => setIsTriageOpen(false)}
                className="absolute top-5 right-5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold p-2 rounded-full cursor-pointer transition-all z-20 w-8 h-8 flex items-center justify-center text-xs"
                title="Close triage panel"
              >
                ✕
              </button>
              <div className="p-1">
                <MorningStandup
                  tasks={tasks}
                  events={events}
                  fixedTasks={fixedTasks}
                  habitProfile={habitProfile}
                  wakeHour={wakeHour}
                  aiProvider={aiProvider}
                  clientGeminiApiKey={clientGeminiApiKey}
                  clientOpenaiApiKey={clientOpenaiApiKey}
                  clientAnthropicApiKey={clientAnthropicApiKey}
                  clientDeepseekApiKey={clientDeepseekApiKey}
                  onApplyReorganization={(updatedTasks, updatedEvents, detectedPattern) => {
                    handleApplyReorganization(updatedTasks, updatedEvents, detectedPattern);
                    setIsTriageOpen(false);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Real-time Toast Notifications */}
        {toastMessage && (
          <div id="toast-notification-banner" className="fixed bottom-6 right-6 z-50 bg-white border border-slate-200 text-slate-800 px-4 py-3.5 rounded-xl shadow-2xl flex items-center gap-2.5 max-w-sm animate-bounce text-xs font-semibold font-display">
            <Sparkles className="w-4 h-4 text-blue-600 animate-pulse" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div id="dashboard-view-wrapper" className="flex-1 flex flex-col gap-6 min-h-0">
            {/* Minimalist Controls Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold font-display text-slate-800 tracking-tight">Today's Workspace</h2>
                <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Syncing Live
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowMetrics(prev => !prev)}
                  className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${
                    showMetrics 
                      ? 'bg-blue-50 text-blue-600 border-blue-200' 
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="View/Hide System Metrics & AI Quota"
                >
                  <Cpu className="w-4 h-4" />
                  <span>Metrics</span>
                </button>

                <button
                  onClick={() => setShowSandbox(prev => !prev)}
                  className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${
                    showSandbox 
                      ? 'bg-blue-50 text-blue-600 border-blue-200' 
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="View/Hide Sandbox & Focus Panel"
                >
                  <Zap className="w-4 h-4" />
                  <span>Focus Panel</span>
                </button>
              </div>
            </div>

            {/* Top Stat Ribbon (Shown only when toggled) */}
            {showMetrics && (
              <div id="dashboard-top-metrics" className="grid grid-cols-1 sm:grid-cols-4 gap-4 shrink-0 animate-fade-in">
                <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-xxs text-slate-400 font-mono uppercase tracking-wider block">Completed Blocks</span>
                    <span className="text-2xl font-bold font-display text-slate-800 mt-1 block">{completedCount} / {tasks.length}</span>
                  </div>
                  <CheckCircle className="w-8 h-8 text-emerald-500/20" />
                </div>

                <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-xxs text-slate-400 font-mono uppercase tracking-wider block">Tasks Being Sorted</span>
                    <span className="text-2xl font-bold font-display text-slate-800 mt-1 block">{inProgressCount} In Progress</span>
                  </div>
                  <Zap className="w-8 h-8 text-blue-600/20" />
                </div>

                <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex flex-col justify-between relative group hover:border-blue-200 transition-all">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xxs text-slate-400 font-mono uppercase tracking-wider block flex items-center gap-1.5">
                        Body Clock Match
                        <span className="cursor-pointer text-slate-400 hover:text-blue-500 transition-colors" title="Circadian Coherence explanation">
                          <Info className="w-3.5 h-3.5" />
                        </span>
                      </span>
                      <span className="text-2xl font-bold font-display text-slate-800 mt-1 block">94% Coherence</span>
                    </div>
                    <Battery className="w-8 h-8 text-blue-600/20" />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2.5 leading-relaxed border-t border-slate-150 pt-2.5">
                    <strong>Body Clock Match</strong> measures task biorhythm alignment. Peak focus windows handle peak effort.
                  </p>
                </div>

                <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex flex-col justify-between relative group hover:border-emerald-200 transition-all">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xxs text-slate-400 font-mono uppercase tracking-wider block flex items-center gap-1.5">
                        AI Copilot Service
                      </span>
                      <span className="text-xl font-bold font-display text-emerald-600 mt-1 block flex items-center gap-1">
                        ● Active & Free
                      </span>
                    </div>
                    <Cpu className="w-8 h-8 text-emerald-600/20" />
                  </div>
                  <div className="mt-2.5 border-t border-slate-150 pt-2.5">
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                      <span>Service is provided dynamically. No setup required!</span>
                      <button 
                        onClick={() => setIsPreferencesOpen(true)}
                        className="text-blue-600 hover:underline font-bold bg-transparent border-none p-0 cursor-pointer"
                      >
                        Style Prefs
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Dashboard Core Layout */}
            <div className="flex-1 flex flex-col lg:flex-row gap-6 items-stretch lg:overflow-hidden min-h-0">
              {/* Left Column: Core Work & Focus Widgets (Shown only when toggled) */}
              {showSandbox && (
                <div
                  id="main-widgets-container"
                  className="lg:w-[360px] shrink-0 lg:h-full lg:overflow-y-auto scrollbar-thin flex flex-col gap-6 pr-1 animate-fade-in"
                >
                  <div className="grid grid-cols-1 gap-6 pb-4 min-h-0">
                    {tasks.length === 0 ? (
                      <div className="bg-white border border-dashed border-slate-300 rounded-3xl p-8 text-center flex flex-col items-center justify-center gap-4 shadow-xs animate-fade-in">
                        <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-2xl font-bold animate-pulse">
                          ✨
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-slate-800 font-display">Your schedule is clear!</h4>
                          <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                            Add your first complex task in the Sandbox to watch the AI break it down.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        {tasks[0] && (
                          <FrictionlessWidget task={tasks[0]} onStepCompleted={handleStepCompleted} />
                        )}

                        <FocusModeWidget
                          isFocusActive={isFocusActive}
                          onToggleFocus={setIsFocusActive}
                          tasks={tasks}
                        />
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Central Timeline Area (Always displayed, expands to full width when sandbox is closed) */}
              <div
                id="calendar-sidebar-container"
                className="flex-1 lg:h-full bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm flex flex-col min-h-0"
              >
                <div className="flex flex-col h-full gap-4 min-h-0">
                  <div className="flex-1 flex flex-col min-h-0">
                    <FlowStateCalendar
                      tasks={tasks}
                      events={events}
                      fixedTasks={fixedTasks}
                      setFixedTasks={setFixedTasks}
                      onShiftTasks={handleShiftTasks}
                      wakeHour={wakeHour}
                      setWakeHour={handleUpdateWakeHour}
                      simulatedHour={simulatedHour}
                      setSimulatedHour={setSimulatedHour}
                      onScheduleTaskAtHour={handleScheduleTaskAtHour}
                      getCalibratedEnergy={getCalibratedEnergy}
                      hourlyFeelings={hourlyFeelings}
                      setTasks={setTasks}
                      setEvents={setEvents}
                      clientGeminiApiKey={clientGeminiApiKey}
                      habitProfile={habitProfile}
                      aiProvider={aiProvider}
                      clientOpenaiApiKey={clientOpenaiApiKey}
                      clientAnthropicApiKey={clientAnthropicApiKey}
                      clientDeepseekApiKey={clientDeepseekApiKey}
                      usage={usage}
                      setUsage={setUsage}
                      onLearnPattern={(pattern) => {
                        setHabitProfile(prev => {
                          const next = [...prev];
                          if (!next.includes(pattern)) {
                            next.push(pattern);
                          }
                          return next;
                        });
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Do Engine Tab */}
        {activeTab === 'engine' && (
          <div id="do-engine-view-wrapper" className="animate-fade-in flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto pr-1 scrollbar-thin">
            <div className="p-4 bg-blue-50 border border-blue-100/60 rounded-xl flex items-center gap-3">
              <Info className="w-5 h-5 text-blue-600 shrink-0" />
              <p className="text-xs text-blue-850 leading-relaxed">
                <strong>Planner Orchestrator:</strong> This represents the Multi-Agent Core execution environment. Type any complex, multi-layered milestone statement or select one of our pre-made strategic briefs below to watch the Planner Agent, Context Fetcher, and Energy Traffic Controller agents run visual sequence loops.
              </p>
            </div>
            <DoEngineWidget 
              onTaskCreated={handleTaskCreated} 
              usage={usage}
              setUsage={setUsage}
              clientGeminiApiKey={clientGeminiApiKey}
              onQuotaExhausted={() => setIsPaywallModalOpen(true)}
              fixedTasks={fixedTasks}
              events={events}
              habitProfile={habitProfile}
              wakeHour={wakeHour}
              aiProvider={aiProvider}
              clientOpenaiApiKey={clientOpenaiApiKey}
              clientAnthropicApiKey={clientAnthropicApiKey}
              clientDeepseekApiKey={clientDeepseekApiKey}
            />
          </div>
        )}


      </main>

      {/* Premium Preferences & Biorhythm Map Modal */}
      {isPreferencesOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in font-sans">
          <div className="w-full max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-600 animate-spin-slow" />
                <h3 className="text-md font-bold text-slate-800 font-display">Account Preferences & Circadian Map</h3>
              </div>
              <button
                onClick={() => setIsPreferencesOpen(false)}
                className="text-xs font-bold text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-6 overflow-y-auto space-y-6">
              
              {/* Part 1: Account Parameters */}
              <div className="space-y-4">
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">1. Core Account Settings</span>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xxs font-bold text-slate-400 uppercase tracking-wider">Profile Name</span>
                    <input
                      type="text"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-blue-500 font-semibold"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-xxs font-bold text-slate-400 uppercase tracking-wider">Working Days/Week</span>
                    <select
                      value={workingDays}
                      onChange={(e) => setWorkingDays(parseInt(e.target.value, 10))}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-blue-500 font-bold"
                    >
                      <option value={4}>4 Working Days</option>
                      <option value={5}>5 Working Days</option>
                      <option value={6}>6 Working Days</option>
                      <option value={7}>7 Working Days</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-xxs font-bold text-slate-400 uppercase tracking-wider">Target Daily Hours</span>
                    <select
                      value={workingHours}
                      onChange={(e) => setWorkingHours(parseInt(e.target.value, 10))}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-blue-500 font-bold"
                    >
                      <option value={4}>4 Hours/Day</option>
                      <option value={6}>6 Hours/Day</option>
                      <option value={8}>8 Hours/Day</option>
                      <option value={10}>10 Hours/Day</option>
                      <option value={12}>12 Hours/Day</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-xxs font-bold text-slate-400 uppercase tracking-wider">Preferred Timezone</span>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-blue-500 font-bold cursor-pointer"
                    >
                      <option value={Intl.DateTimeFormat().resolvedOptions().timeZone}>
                        Auto ({Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop()?.replace('_', ' ')})
                      </option>
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">New York (EST)</option>
                      <option value="America/Los_Angeles">Los Angeles (PST)</option>
                      <option value="Europe/London">London (GMT)</option>
                      <option value="Europe/Paris">Paris (CET)</option>
                      <option value="Asia/Kolkata">Kolkata (IST)</option>
                      <option value="Asia/Tokyo">Tokyo (JST)</option>
                      <option value="Asia/Singapore">Singapore (SGT)</option>
                    </select>
                  </div>
                </div>

                {/* FlowPup AI Companion Toggle */}
                <div className="flex items-center justify-between p-3.5 bg-indigo-50/40 rounded-2xl border border-indigo-100 mt-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">🐶</span>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-indigo-950 font-display">FlowPup AI Companion</span>
                      <span className="text-[10px] text-indigo-700/85 font-medium leading-normal">
                        Show a supportive, situation-aware cartoon puppy to suggest smart break alerts, hydration cues, and flow boosts.
                      </span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isFlowPupEnabled}
                      onChange={(e) => setIsFlowPupEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              </div>

              {/* Part 2: AI Copilot Service */}
              <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">2. AI Copilot Service</span>
                  <span className="text-[9px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full font-bold">
                    Powered by Google Gemini
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 leading-normal font-medium">
                  Our AI Copilot features are fully active and provided as a centralized service. If the shared service experiences quota limits or credit depletion (error 429), you can optionally provide your own personal Gemini API key below to override it and avoid interruptions:
                </p>
                <div className="flex flex-col gap-1.5 pt-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-slate-600 font-bold">Personal Gemini API Key (Optional Override)</label>
                    {clientGeminiApiKey && (
                      <button
                        onClick={() => setClientGeminiApiKey('')}
                        className="text-[9px] font-bold text-rose-500 hover:underline bg-transparent border-none p-0 cursor-pointer"
                      >
                        Clear Key
                      </button>
                    )}
                  </div>
                  <input
                    type="password"
                    placeholder={clientGeminiApiKey ? "••••••••••••••••••••••••" : "Paste your Google AI Studio API key here (AI_...)"}
                    value={clientGeminiApiKey}
                    onChange={(e) => setClientGeminiApiKey(e.target.value.trim())}
                    className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-blue-500 font-mono font-medium"
                  />
                  <span className="text-[9px] text-slate-400 leading-normal block">
                    You can generate a free Gemini API key in seconds via <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline font-bold">Google AI Studio</a>.
                  </span>
                  <div className="mt-2.5 p-3 bg-amber-50/70 rounded-xl border border-amber-200/50 text-[10px] text-amber-800 leading-normal">
                    <span className="font-bold block mb-1">⚠️ Resolving 403 API_KEY_SERVICE_BLOCKED:</span>
                    If you encounter a 403 permission block, you must verify your key's API restrictions. Go to your <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="underline font-bold text-amber-900 hover:text-amber-950">Google Cloud Console &gt; APIs &amp; Services &gt; Credentials</a>, click your API key to edit it, and under <strong className="font-semibold">API Restrictions</strong>, ensure you explicitly add/check the <strong className="font-semibold">Generative Language API</strong>.
                  </div>
                </div>
              </div>

              {/* Part 2.5: Google Calendar iCal Synchronization */}
              <div className="space-y-3 p-4 bg-indigo-50/40 rounded-2xl border border-indigo-100">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">3. Google Calendar iCal Sync (Read-Only)</span>
                  {icalUrl && (
                    <button
                      onClick={() => {
                        if (checkGuestRestriction("Google Calendar Sync")) return;
                        handleSyncICal();
                      }}
                      disabled={isSyncingIcal || (!currentUser && enterAsGuest)}
                      className="text-[9px] font-bold text-indigo-600 hover:text-indigo-800 bg-white border border-indigo-200 px-2 py-0.5 rounded-md hover:bg-indigo-50 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isSyncingIcal ? 'Syncing...' : '🔄 Refresh Now'}
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 leading-normal">
                  Import your calendar meetings for today directly into your focus schedule grid as locked blocks, preventing task manager overlays.
                </p>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">Paste Google Calendar Secret iCal Link</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder={!currentUser && enterAsGuest ? "Restricted in Guest Mode" : "https://calendar.google.com/calendar/ical/.../basic.ics"}
                      disabled={!currentUser && enterAsGuest}
                      value={!currentUser && enterAsGuest ? "" : icalUrl}
                      onChange={(e) => {
                        if (checkGuestRestriction("Google Calendar Sync")) return;
                        setIcalUrl(e.target.value);
                      }}
                      className="flex-1 bg-white border border-slate-200 text-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500 font-mono disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                    />
                    <button
                      onClick={() => {
                        if (checkGuestRestriction("Google Calendar Sync")) return;
                        handleSyncICal();
                      }}
                      disabled={isSyncingIcal || (!currentUser && enterAsGuest)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-1.5 rounded-lg transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap disabled:cursor-not-allowed"
                    >
                      {isSyncingIcal ? 'Syncing...' : 'Save & Sync'}
                    </button>
                  </div>
                </div>

                {/* Helper Tooltip Container */}
                <div className="bg-white/80 p-3 rounded-xl border border-indigo-100/60 text-[10px] text-slate-600 space-y-1 leading-normal">
                  <span className="font-bold text-indigo-600 block uppercase tracking-wider text-[8px]">💡 How to grab your Secret iCal Link:</span>
                  <ol className="space-y-1 list-decimal pl-4 text-slate-500 font-medium">
                    <li>Open <strong className="text-slate-700">Google Calendar</strong> on your desktop browser.</li>
                    <li>Hover over your calendar on the left panel, click the <strong className="text-slate-700">three dots (⋮)</strong>, and select <strong className="text-slate-700">Settings and sharing</strong>.</li>
                    <li>Scroll down to the very bottom to find the <strong className="text-slate-700">"Secret address in iCal format"</strong> section.</li>
                    <li>Copy the URL and paste it here!</li>
                  </ol>
                </div>
              </div>

              {/* Part 3: Hour-by-Hour Energy Feeling Planner */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">4. Hour-by-Hour Energy Feeling Planner</span>
                  <span className="text-[9px] text-slate-400 font-semibold font-mono">Mapped for Weekdays</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  Manually define how active, sharp, or depleted you feel during each hour of the day. Important tasks will align automatically, and restful suggestions (such as naps, nutrition, or mindfulness walks) will occupy hours marked as "Rest/No Work".
                </p>

                {/* Grid of Hours */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].map((hr) => {
                    const level = hourlyFeelings[hr] || 'medium';
                    const displayHour = hr > 12 ? `${hr - 12}:00 PM` : `${hr}:00 AM`;
                    
                    return (
                      <div key={hr} className="bg-slate-50 p-2.5 rounded-xl border border-slate-150 flex items-center justify-between gap-2.5">
                        <span className="text-xs font-bold text-slate-750 font-mono shrink-0">{displayHour}</span>
                        
                        <div className="flex bg-white/80 p-0.5 rounded-lg border border-slate-200 shrink-0">
                          {(['high', 'medium', 'low'] as const).map((lvl) => {
                            const isSel = level === lvl;
                            return (
                              <button
                                key={lvl}
                                onClick={() => {
                                  setHourlyFeelings(prev => ({
                                    ...prev,
                                    [hr]: lvl
                                  }));
                                }}
                                className={`text-[10px] px-2 py-0.5 rounded-md font-bold capitalize transition-all cursor-pointer ${
                                  isSel
                                    ? lvl === 'high'
                                      ? 'bg-emerald-500 text-white shadow-xs'
                                      : lvl === 'medium'
                                      ? 'bg-amber-500 text-white shadow-xs'
                                      : 'bg-rose-500 text-white shadow-xs'
                                    : 'text-slate-450 hover:text-slate-600'
                                }`}
                              >
                                {lvl === 'high' ? '⚡' : lvl === 'medium' ? '☕' : '🛌'}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Part 5: Emergency Operational Tools */}
              <div className="space-y-4 pt-4 border-t border-slate-200">
                <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block">5. Emergency Operational Tools</span>
                
                {/* Section A: Reset Button */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/85 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1 max-w-sm">
                    <strong className="text-xs text-slate-800 font-bold block">Reset Daily Planner Stack</strong>
                    <span className="text-[10px] text-slate-500 block leading-normal font-medium">
                      Instantly flush out all active tasks and restore the blueprint tasks and calendar slots back to original parameters. To confirm, please type <code className="bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded border border-rose-100 font-mono font-bold">reset</code> below.
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                    <input
                      type="text"
                      placeholder="Type 'reset'"
                      value={resetInput}
                      onChange={(e) => setResetInput(e.target.value)}
                      className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-750 font-bold focus:outline-none focus:border-rose-500 w-full sm:w-28 text-center"
                    />
                    <button
                      onClick={() => {
                        if (resetInput.trim().toLowerCase() === 'reset') {
                          handleResetTasksToDefault();
                          setResetInput('');
                        } else {
                          triggerToast("⚠️ Verification failed. Please type 'reset' exactly.");
                        }
                      }}
                      disabled={resetInput.trim().toLowerCase() !== 'reset'}
                      className={`shrink-0 font-bold px-4 py-2 rounded-xl text-xs transition-all cursor-pointer border ${
                        resetInput.trim().toLowerCase() === 'reset'
                          ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-600 hover:scale-[1.02]'
                          : 'bg-slate-150 text-slate-400 border-slate-200 cursor-not-allowed'
                      }`}
                    >
                      Reset Tasks
                    </button>
                  </div>
                </div>

                {/* Section B: Emergency OOO Work Halt Creator */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/85 space-y-4">
                  <div className="space-y-0.5">
                    <strong className="text-xs text-slate-800 font-bold block">Create Out-Of-Office / Emergency Work Halt</strong>
                    <span className="text-[10px] text-slate-500 block leading-normal font-medium">
                      Specify an urgent offline block. All planned execution and focus sessions crossing this time period will be automatically calculated, flagged, and rescheduled based on your constraints.
                    </span>
                  </div>

                  {/* Range inputs */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider font-mono">Halt Starts</span>
                      <select
                        value={haltStartHour}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setHaltStartHour(val);
                          if (haltEndHour <= val) setHaltEndHour(val + 1);
                        }}
                        className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-bold cursor-pointer focus:outline-none focus:border-blue-500"
                      >
                        {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map(h => (
                          <option key={h} value={h}>{h > 12 ? `${h - 12}:00 PM` : `${h}:00 AM`}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider font-mono">Halt Ends</span>
                      <select
                        value={haltEndHour}
                        onChange={(e) => setHaltEndHour(parseInt(e.target.value, 10))}
                        className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-bold cursor-pointer focus:outline-none focus:border-blue-500"
                      >
                        {[9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].filter(h => h > haltStartHour).map(h => (
                          <option key={h} value={h}>{h > 12 ? `${h - 12}:00 PM` : `${h}:00 AM`}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Impact warnings / notifications */}
                  {affectedTasksForHalt.length > 0 ? (
                    <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3.5 space-y-2.5 animate-fade-in">
                      <div className="flex items-start gap-2">
                        <span className="text-sm shrink-0 select-none">⚠️</span>
                        <div className="space-y-1">
                          <strong className="text-xs text-amber-850 font-bold block">Deliverable Conflict Warning!</strong>
                          <p className="text-[10px] text-amber-750 leading-relaxed">
                            The following active tasks fall inside your requested Out-Of-Office halt and require triage:
                          </p>
                        </div>
                      </div>

                      <ul className="list-disc pl-5 text-[10px] text-amber-850 space-y-1 font-semibold">
                        {affectedTasksForHalt.map(t => (
                          <li key={t.id}>
                            {t.title} (Scheduled: {t.scheduledTime})
                          </li>
                        ))}
                      </ul>

                      {/* Options to solve conflicts */}
                      <div className="flex flex-col gap-2 pt-1 border-t border-amber-200/40">
                        <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">Triage Decisions:</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            onClick={() => handleShiftOverHalt(haltStartHour, haltEndHour)}
                            className="bg-white hover:bg-slate-50 border border-amber-300 text-amber-850 font-bold px-3 py-2 rounded-lg text-[10px] leading-snug cursor-pointer transition-colors shadow-xs"
                          >
                            👉 <span className="underline">Ignore warning:</span> Move tasks to next available slots (push schedules forward)
                          </button>
                          <button
                            onClick={() => handleCancelOrPostponeHalt(haltStartHour, haltEndHour)}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-2 rounded-lg text-[10px] leading-snug cursor-pointer transition-colors shadow-xs"
                          >
                            🗓️ Postpone / cancel conflict deadlines to a later date
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-emerald-50/50 border border-emerald-150 p-3 rounded-xl flex items-center gap-2">
                      <span className="text-xs select-none">✅</span>
                      <span className="text-[10px] text-emerald-800 font-semibold">
                        Zero planned tasks scheduled inside this period. You can safely halt work!
                      </span>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-end shrink-0">
              <button
                onClick={() => {
                  setIsPreferencesOpen(false);
                  triggerToast("Preferences saved & synchronized! Biorhythm state updated.");
                }}
                className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-xl text-xs transition-colors cursor-pointer shadow-sm shadow-blue-500/10"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Configuration</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Energy & Cognitive Capacity Advisor Modal */}
      {isEnergyCapacityModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in font-sans">
          <div className="w-full max-w-4xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-blue-600 animate-pulse" />
                <h3 className="text-md font-bold text-slate-800 font-display">Energy & Capacity Advisor</h3>
              </div>
              <button
                onClick={() => setIsEnergyCapacityModalOpen(false)}
                className="text-xs font-bold text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg cursor-pointer animate-fade-in"
              >
                Close
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-6 overflow-y-auto space-y-6">
              
              {/* Introduction Card */}
              <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50/50 border border-blue-100 rounded-2xl flex items-start gap-3.5">
                <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <strong className="text-xs text-blue-900 font-bold block">Circadian Rhythm & Capacity Engine</strong>
                  <p className="text-[11px] text-blue-800/80 leading-relaxed font-medium">
                    This control center allows you to adjust your internal biorhythm energy calculations and daily cognitive loading capacity. 
                    Any modifications you make to the parameters here will synchronize instantly, dynamically updating your dashboard suggestions, focus warnings, and planned calendar schedules in real-time.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* COLUMN 1: CIRCADIAN ENERGY MANAGER */}
                <div className="space-y-4 border border-slate-150 p-5 rounded-2xl bg-slate-50/40">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <Zap className="w-4 h-4 text-amber-500 fill-amber-500/20" />
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">1. Circadian Energy Levels</h4>
                  </div>

                  <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                    Your current body energy is derived from a circadian rhythm curve. Adjust the parameters below to override simulated hours, wake times, and hour-by-hour circadian feelings.
                  </p>

                  {/* Simulated Hour Modifier */}
                  <div className="space-y-2 bg-white p-4 rounded-xl border border-slate-100 shadow-xxs">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Simulated Time of Day</span>
                      <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
                        {simulatedHour > 12 ? `${simulatedHour - 12}:00 PM` : simulatedHour === 12 ? '12:00 PM' : simulatedHour === 0 ? '12:00 AM' : `${simulatedHour}:00 AM`} ({simulatedHour}:00)
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="23"
                      value={simulatedHour}
                      onChange={(e) => setSimulatedHour(parseInt(e.target.value, 10))}
                      className="w-full accent-blue-600 h-1.5 bg-slate-100 rounded-lg cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-slate-400 font-bold">
                      <span>12 AM</span>
                      <span>6 AM</span>
                      <span>12 PM</span>
                      <span>6 PM</span>
                      <span>11 PM</span>
                    </div>
                  </div>

                  {/* Hourly Feeling Override */}
                  <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-100 shadow-xxs">
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                      Circadian Feeling at {simulatedHour}:00
                    </span>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-500 font-semibold">
                        Current level: <strong className="text-slate-800 capitalize">{(hourlyFeelings[simulatedHour] || 'circumstantial')}</strong>
                      </span>
                      <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-100">
                        {(['low', 'medium', 'high'] as const).map((lvl) => (
                          <button
                            key={lvl}
                            onClick={() => {
                              setHourlyFeelings(prev => ({ ...prev, [simulatedHour]: lvl }));
                              triggerToast(`Simulated biorhythm for ${simulatedHour}:00 updated to ${lvl.toUpperCase()} energy!`);
                            }}
                            className={`px-3 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${
                              hourlyFeelings[simulatedHour] === lvl
                                ? lvl === 'high'
                                  ? 'bg-emerald-500 text-white shadow-sm'
                                  : lvl === 'medium'
                                  ? 'bg-amber-500 text-white shadow-sm'
                                  : 'bg-rose-500 text-white shadow-sm'
                                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                            }`}
                          >
                            {lvl === 'high' ? '⚡ High' : lvl === 'medium' ? '☕ Med' : '🛌 Low'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-[9px] text-slate-400 leading-normal">
                      Toggle feelings to override current biorhythm scores. High equals 85% energy, Medium equals 60%, and Low sets energy to 25%.
                    </p>
                  </div>

                  {/* Circadian Wake Hour shift */}
                  <div className="space-y-2 bg-white p-4 rounded-xl border border-slate-100 shadow-xxs">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">circadian wake offset</span>
                      <span className="text-xs font-bold text-slate-700 font-mono">
                        {wakeHour}:00 AM
                      </span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="10"
                      value={wakeHour}
                      onChange={(e) => handleUpdateWakeHour(parseInt(e.target.value, 10))}
                      className="w-full accent-slate-700 h-1.5 bg-slate-100 rounded-lg cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-slate-400 font-bold">
                      <span>5:00 AM</span>
                      <span>8:00 AM</span>
                      <span>10:00 AM</span>
                    </div>
                  </div>
                </div>

                {/* COLUMN 2: COGNITIVE CAPACITY PLANNER */}
                <div className="space-y-4 border border-slate-150 p-5 rounded-2xl bg-slate-50/40">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <Battery className="w-4 h-4 text-blue-500 fill-blue-500/20" />
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">2. Cognitive Capacity Solver</h4>
                  </div>

                  {/* Math Breakdown Card */}
                  <div className="p-3.5 bg-white border border-slate-150 rounded-xl shadow-xxs space-y-2">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block font-mono">live formula math</span>
                    <div className="flex items-center justify-between text-xs text-slate-700 font-bold font-mono">
                      <span className="text-blue-600">Capacity left ({capacityPercentRemaining}%)</span>
                      <span>=</span>
                      <span>Budget ({(totalCapacityMinutes / 60).toFixed(1)}h)</span>
                      <span>-</span>
                      <span className="text-indigo-600">Predefined ({(predefinedDailyMinutes / 60).toFixed(1)}h)</span>
                      <span>-</span>
                      <span className="text-rose-600">Tasks ({(plannedTaskMinutes / 60).toFixed(1)}h)</span>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex justify-between items-center">
                      <span className="text-[10px] text-slate-500 font-semibold">Remaining Available:</span>
                      <span className="text-xs text-slate-800 font-bold font-mono">
                        {(capacityRemainingMinutes / 60).toFixed(1)} hrs ({capacityRemainingMinutes} mins)
                      </span>
                    </div>
                  </div>

                  {/* Total Daily Working Budget */}
                  <div className="space-y-2 bg-white p-4 rounded-xl border border-slate-100 shadow-xxs">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">daily working hours budget</span>
                      <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded font-mono">
                        {workingHours} Hours
                      </span>
                    </div>
                    <input
                      type="range"
                      min="2"
                      max="16"
                      value={workingHours}
                      onChange={(e) => setWorkingHours(parseInt(e.target.value, 10))}
                      className="w-full accent-blue-600 h-1.5 bg-slate-100 rounded-lg cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] text-slate-400 font-bold">
                      <span>2 hrs</span>
                      <span>8 hrs (Default)</span>
                      <span>16 hrs</span>
                    </div>
                  </div>

                  {/* Predefined Daily Tasks/Routines */}
                  <div className="space-y-2 bg-white p-4 rounded-xl border border-slate-100 shadow-xxs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">
                        Predefined Daily Routines ({fixedTasks.length})
                      </span>
                      <span className="text-[9px] text-slate-400 font-bold font-mono uppercase">
                        cost: {predefinedDailyMinutes}m
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                      {fixedTasks.map((ft) => {
                        const duration = getFixedTaskDuration(ft);
                        return (
                          <div key={ft.id} className="flex items-center justify-between bg-slate-50/70 p-2 rounded-lg border border-slate-100 text-[11px]">
                            <span className="font-semibold text-slate-700 text-xxs truncate max-w-[130px]">{ft.title}</span>
                            <div className="flex items-center gap-2 text-xxs font-mono text-slate-500">
                              <span>{ft.startTime} - {ft.endTime}</span>
                              <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-bold font-sans">
                                {duration}m
                              </span>
                              <button
                                onClick={() => handleDeleteFixedTask(ft.id)}
                                className="text-rose-500 hover:text-rose-700 cursor-pointer"
                                title="Remove predefined block"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Add Inline Routine Form */}
                    <div className="bg-indigo-50/30 p-2 rounded-xl border border-indigo-100/60 mt-2 space-y-2">
                      <span className="text-[9px] font-bold text-indigo-700 uppercase tracking-wider block">Add Custom Routine</span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          placeholder="e.g. Sync Call"
                          value={newFixedTitle}
                          onChange={(e) => setNewFixedTitle(e.target.value)}
                          className="bg-white border border-indigo-100 rounded-lg px-2 py-1 text-xxs focus:outline-none focus:border-indigo-500"
                        />
                        <div className="flex items-center gap-1.5">
                          <select
                            value={newFixedStart}
                            onChange={(e) => setNewFixedStart(e.target.value)}
                            className="bg-white border border-indigo-100 rounded-lg p-1 text-xxs text-slate-600 focus:outline-none w-full"
                          >
                            {Array.from({ length: 24 }).map((_, i) => {
                              const str = `${i.toString().padStart(2, '0')}:00`;
                              return <option key={str} value={str}>{str}</option>;
                            })}
                          </select>
                          <span className="text-slate-400 text-xxs">to</span>
                          <select
                            value={newFixedEnd}
                            onChange={(e) => setNewFixedEnd(e.target.value)}
                            className="bg-white border border-indigo-100 rounded-lg p-1 text-xxs text-slate-600 focus:outline-none w-full"
                          >
                            {Array.from({ length: 24 }).map((_, i) => {
                              const str = `${i.toString().padStart(2, '0')}:00`;
                              return <option key={str} value={str}>{str}</option>;
                            })}
                          </select>
                        </div>
                        <button
                          onClick={() => {
                            if (!newFixedTitle.trim()) {
                              triggerToast("⚠️ Please enter a routine name.");
                              return;
                            }
                            const [sh] = newFixedStart.split(':').map(Number);
                            const [eh] = newFixedEnd.split(':').map(Number);
                            if (sh >= eh) {
                              triggerToast("⚠️ Start hour must be earlier than End hour.");
                              return;
                            }
                            handleAddFixedTask(newFixedTitle, newFixedStart, newFixedEnd);
                            setNewFixedTitle('');
                          }}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1 px-3 rounded-lg text-xxs flex items-center justify-center gap-1 cursor-pointer transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Routine</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Planned Tasks Durations */}
                  <div className="space-y-2 bg-white p-4 rounded-xl border border-slate-100 shadow-xxs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block">
                        Planned Tasks Durations ({tasks.filter(t => t.status !== 'completed').length})
                      </span>
                      <span className="text-[9px] text-slate-400 font-bold font-mono uppercase">
                        cost: {plannedTaskMinutes}m
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                      {tasks.filter(t => t.status !== 'completed').map((t) => {
                        const duration = getTaskDuration(t);
                        return (
                          <div key={t.id} className="flex items-center justify-between bg-slate-50/70 p-2 rounded-lg border border-slate-100 text-[11px]">
                            <div className="truncate max-w-[150px] space-y-0.5">
                              <span className="font-semibold text-slate-700 text-xxs block truncate">{t.title}</span>
                              <span className="text-[9px] text-slate-400 font-bold">{t.category} • {t.energyCost} Load</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleUpdateTaskDuration(t.id, duration - 15)}
                                className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 cursor-pointer active:scale-90"
                                title="Decrease duration by 15 mins"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="bg-rose-50 text-rose-700 px-2 py-0.5 rounded font-bold font-mono text-xxs">
                                {duration}m
                              </span>
                              <button
                                onClick={() => handleUpdateTaskDuration(t.id, duration + 15)}
                                className="p-1 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 cursor-pointer active:scale-90"
                                title="Increase duration by 15 mins"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[9px] text-slate-400 leading-normal pt-1">
                      * Modifying the estimated duration of planned tasks here will immediately scale its time-block representation in the active calendar and release/lock capacity.
                    </p>
                  </div>

                </div>

              </div>

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-end shrink-0">
              <button
                onClick={() => {
                  setIsEnergyCapacityModalOpen(false);
                  triggerToast("Biorhythm and Cognitive loading settings applied successfully!");
                }}
                className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-xl text-xs transition-colors cursor-pointer shadow-sm shadow-blue-500/10"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Apply Loading Config</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer id="app-footer" className="border-t border-slate-200 bg-white py-6 px-6 text-center text-xs text-slate-400">
        <p>© 2026 FlowDo Inc. Designed and Optimized in full compliance with the Google AI Studio Enterprise Ecosystem Standards.</p>
      </footer>

      {/* Auth Modal overlay */}
      <AuthModal 
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={(msg) => triggerToast(msg)}
      />

      {/* Guest Mode Restriction Prompt Modal */}
      {isGuestPromptOpen && (
        <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-fade-in font-sans">
          <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-2xl relative overflow-hidden flex flex-col gap-6">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full filter blur-xl pointer-events-none"></div>
            
            <div className="text-center">
              <div className="inline-flex bg-amber-50 text-amber-600 border border-amber-100 p-3 rounded-2xl mb-3">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold font-display text-slate-800 tracking-tight">Cloud Integration Locked</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed font-medium">
                {guestPromptMessage || "This feature requires a cloud-synchronized FlowDo account. Log in or create an account to activate."}
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => {
                  setIsGuestPromptOpen(false);
                  setIsAuthModalOpen(true);
                }}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-sm cursor-pointer"
              >
                <User className="w-4 h-4" />
                <span>Sign In / Create Account</span>
              </button>
              
              <button
                onClick={() => setIsGuestPromptOpen(false)}
                className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold py-2.5 rounded-xl text-xs transition-all cursor-pointer font-semibold"
              >
                Continue in Guest Mode
              </button>
            </div>
          </div>
        </div>
      )}

      {isFlowPupEnabled && (
        <FlowPup
          simulatedHour={simulatedHour}
          tasks={tasks}
          fixedTasks={fixedTasks}
          currentEnergy={currentEnergy}
          capacityPercentRemaining={capacityPercentRemaining}
          capacityRemainingMinutes={capacityRemainingMinutes}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}
