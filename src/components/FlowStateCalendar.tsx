import React, { useState } from 'react';
import { Calendar, Zap, Sun, Moon, Activity, Lock, Plus, Trash2, ShieldAlert, Mic, Sparkles, Maximize2, X } from 'lucide-react';
import { Task, CalendarEvent, FixedTask } from '../types';
import { getEnergyForHour } from '../data';
import { classifyActivity, getCategoryStyles, ActivityClassification } from '../lib/activityClassifier';

interface FlowStateCalendarProps {
  tasks: Task[];
  events: CalendarEvent[];
  fixedTasks: FixedTask[];
  setFixedTasks: React.Dispatch<React.SetStateAction<FixedTask[]>>;
  onShiftTasks: () => void;
  wakeHour: number;
  setWakeHour: (hour: number) => void;
  simulatedHour: number;
  setSimulatedHour: (hour: number) => void;
  onScheduleTaskAtHour: (title: string, timeOrHour: string | number) => void;
  getCalibratedEnergy?: (hour: number) => number;
  hourlyFeelings?: Record<number, 'high' | 'medium' | 'low'>;
  setTasks?: React.Dispatch<React.SetStateAction<Task[]>>;
  setEvents?: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
  clientGeminiApiKey?: string;
  habitProfile?: string[];
  onLearnPattern?: (pattern: string) => void;
  aiProvider?: string;
  clientOpenaiApiKey?: string;
  clientAnthropicApiKey?: string;
  clientDeepseekApiKey?: string;
  usage?: { dailyAiCallsCount: number; lastResetDate: string };
  setUsage?: React.Dispatch<React.SetStateAction<{ dailyAiCallsCount: number; lastResetDate: string }>>;
}

export default function FlowStateCalendar({
  tasks,
  events,
  fixedTasks,
  setFixedTasks,
  onShiftTasks,
  wakeHour,
  setWakeHour,
  simulatedHour,
  setSimulatedHour,
  onScheduleTaskAtHour,
  getCalibratedEnergy: propGetCalibratedEnergy,
  hourlyFeelings,
  setTasks,
  setEvents,
  clientGeminiApiKey = '',
  habitProfile = [],
  onLearnPattern,
  aiProvider = 'gemini',
  clientOpenaiApiKey = '',
  clientAnthropicApiKey = '',
  clientDeepseekApiKey = '',
  usage,
  setUsage
}: FlowStateCalendarProps) {
  // Time conversion and option generation utilities for 15/30-minute intervals
  const timeToMinutes = (timeStr: string): number => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const minutesToTime = (mins: number): string => {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const generateTimeOptions = (startHour: number, endHour: number) => {
    const options: string[] = [];
    for (let h = startHour; h < endHour; h++) {
      for (const m of ['00', '15', '30', '45']) {
        options.push(`${h.toString().padStart(2, '0')}:${m}`);
      }
    }
    options.push(`${endHour.toString().padStart(2, '0')}:00`);
    return options;
  };

  const [circadianOptimized, setCircadianOptimized] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [schedulingTime, setSchedulingTime] = useState<string | null>(null);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isExpandedModalOpen, setIsExpandedModalOpen] = useState(false);

  const [dismissedRestHours, setDismissedRestHours] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('flow_dismissed_rest_hours');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [dismissedGymHours, setDismissedGymHours] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('flow_dismissed_gym_hours');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [resizingItem, setResizingItem] = useState<{ id: string; type: string; startMin: number; initialHeight: number; initialY: number } | null>(null);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<any | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editTypeSpecific, setEditTypeSpecific] = useState('');

  React.useEffect(() => {
    if (selectedItem) {
      setEditTitle(selectedItem.title);
      setEditStartTime(selectedItem.startTime);
      setEditEndTime(selectedItem.endTime);
      if (selectedItem.type === 'event') {
        setEditTypeSpecific(selectedItem.originalItem.type);
      } else if (selectedItem.type === 'task') {
        setEditTypeSpecific(selectedItem.originalItem.category);
      } else {
        setEditTypeSpecific('');
      }
    }
  }, [selectedItem]);

  const handleDeleteTask = (taskId: string) => {
    if (setTasks) {
      setTasks(prev => prev.filter(t => t.id !== taskId));
    }
  };

  const handleDeleteEvent = (eventId: string) => {
    if (setEvents) {
      setEvents(prev => prev.filter(e => e.id !== eventId));
    }
  };

  const handleDeleteFixedTask = (fixedTaskId: string) => {
    if (setFixedTasks) {
      setFixedTasks(prev => prev.filter(f => f.id !== fixedTaskId));
    }
  };

  const handleSaveEditedItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    const { id, type } = selectedItem;

    if (type === 'task' && setTasks) {
      const taskId = id.replace('t-', '');
      setTasks(prev => prev.map(t => {
        if (t.id === taskId) {
          const newStartMins = timeToMinutes(editStartTime);
          const newEndMins = timeToMinutes(editEndTime);
          const duration = Math.max(15, newEndMins - newStartMins);
          
          let updated = { ...t, title: editTitle, scheduledTime: editStartTime, category: editTypeSpecific };
          const currentSum = updated.microSteps?.reduce((sum, ms) => sum + (ms.estimatedMinutes || 20), 0) || 60;
          const diff = duration - currentSum;
          if (updated.microSteps && updated.microSteps.length > 0) {
            updated.microSteps = updated.microSteps.map((ms, idx) => {
              if (idx === 0) {
                return { ...ms, estimatedMinutes: Math.max(5, (ms.estimatedMinutes || 20) + diff) };
              }
              return ms;
            });
          } else {
            updated.microSteps = [{
              id: 'ms-fallback-' + Date.now(),
              title: 'General Focus Step',
              estimatedMinutes: duration,
              energyRequired: 'Medium',
              status: 'todo',
              resources: []
            }];
          }
          return updated;
        }
        return t;
      }));
    } else if (type === 'event' && setEvents) {
      const eventId = id.replace('e-', '');
      setEvents(prev => prev.map(e => {
        if (e.id === eventId) {
          return { 
            ...e, 
            title: editTitle, 
            startTime: editStartTime, 
            endTime: editEndTime, 
            type: (editTypeSpecific || e.type) as 'meeting' | 'routine' | 'task'
          };
        }
        return e;
      }));
    } else if (type === 'fixed' && setFixedTasks) {
      const fixedTaskId = id.replace('f-', '');
      setFixedTasks(prev => prev.map(f => {
        if (f.id === fixedTaskId) {
          return { ...f, title: editTitle, startTime: editStartTime, endTime: editEndTime };
        }
        return f;
      }));
    }
    setSelectedItem(null);
  };

  React.useEffect(() => {
    if (!resizingItem) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - resizingItem.initialY;
      const newHeightPixels = resizingItem.initialHeight + deltaY;
      const newDurationMinutes = Math.round((newHeightPixels * 60) / 80);
      const snappedDuration = Math.max(15, Math.round(newDurationMinutes / 15) * 15);
      
      const newEndMin = resizingItem.startMin + snappedDuration;
      const newEndTime = minutesToTime(newEndMin);

      if (resizingItem.type === 'task' && setTasks) {
        const taskId = resizingItem.id.replace('t-', '');
        setTasks(prev => prev.map(t => {
          if (t.id === taskId) {
            const updated = { ...t };
            const currentSum = updated.microSteps?.reduce((sum, ms) => sum + (ms.estimatedMinutes || 20), 0) || 60;
            const diff = snappedDuration - currentSum;
            if (updated.microSteps && updated.microSteps.length > 0) {
              updated.microSteps = updated.microSteps.map((ms, idx) => {
                if (idx === 0) {
                  return { ...ms, estimatedMinutes: Math.max(5, (ms.estimatedMinutes || 20) + diff) };
                }
                return ms;
              });
            } else {
              updated.microSteps = [{
                id: 'ms-fallback-' + Date.now(),
                title: 'General Focus Step',
                estimatedMinutes: snappedDuration,
                energyRequired: 'Medium',
                status: 'todo',
                resources: []
              }];
            }
            return updated;
          }
          return t;
        }));
      } else if (resizingItem.type === 'event' && setEvents) {
        const eventId = resizingItem.id.replace('e-', '');
        setEvents(prev => prev.map(evt => {
          if (evt.id === eventId) {
            return { ...evt, endTime: newEndTime };
          }
          return evt;
        }));
      } else if (resizingItem.type === 'fixed' && setFixedTasks) {
        const fixedTaskId = resizingItem.id.replace('f-', '');
        setFixedTasks(prev => prev.map(f => {
          if (f.id === fixedTaskId) {
            return { ...f, endTime: newEndTime };
          }
          return f;
        }));
      }
    };

    const handleMouseUp = () => {
      setResizingItem(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingItem, setTasks, setEvents, setFixedTasks]);

  const [dragOverZone, setDragOverZone] = useState<string | null>(null);

  const handleResizeStart = (e: React.MouseEvent, item: any) => {
    e.stopPropagation();
    e.preventDefault();
    setResizingItem({
      id: item.id,
      type: item.type,
      startMin: item.startMin,
      initialHeight: (item.endMin - item.startMin) * (80 / 60),
      initialY: e.clientY
    });
  };

  const handleDragStart = (e: React.DragEvent, item: any) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({
      id: item.id,
      type: item.type,
      startMin: item.startMin,
      endMin: item.endMin
    }));
    e.dataTransfer.effectAllowed = 'move';
    // Visual styling for dragged element
    e.currentTarget.classList.add('opacity-40');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('opacity-40');
  };

  const handleDropOnTime = (e: React.DragEvent, hour: number, minutesStr: '00' | '30') => {
    e.preventDefault();
    setDragOverZone(null);

    try {
      const dataStr = e.dataTransfer.getData('text/plain');
      if (!dataStr) return;
      const dragData = JSON.parse(dataStr);
      const { id, type, startMin, endMin } = dragData;

      const dropMins = hour * 60 + (minutesStr === '30' ? 30 : 0);
      const originalDuration = endMin - startMin;

      const newStartTime = minutesToTime(dropMins);
      const newEndTime = minutesToTime(dropMins + originalDuration);

      if (type === 'task' && setTasks) {
        const taskId = id.replace('t-', '');
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, scheduledTime: newStartTime } : t));
      } else if (type === 'event' && setEvents) {
        const eventId = id.replace('e-', '');
        setEvents(prev => prev.map(e => e.id === eventId ? { ...e, startTime: newStartTime, endTime: newEndTime } : e));
      } else if (type === 'fixed' && setFixedTasks) {
        const fixedTaskId = id.replace('f-', '');
        setFixedTasks(prev => prev.map(f => f.id === fixedTaskId ? { ...f, startTime: newStartTime, endTime: newEndTime } : f));
      }
    } catch (err) {
      console.error('Error during drag-and-drop reschedule:', err);
    }
  };

  const handleDropOnItem = (e: React.DragEvent, targetStartMin: number) => {
    e.preventDefault();
    try {
      const dataStr = e.dataTransfer.getData('text/plain');
      if (!dataStr) return;
      const dragData = JSON.parse(dataStr);
      const { id, type, startMin, endMin } = dragData;

      const originalDuration = endMin - startMin;
      const newStartTime = minutesToTime(targetStartMin);
      const newEndTime = minutesToTime(targetStartMin + originalDuration);

      if (type === 'task' && setTasks) {
        const taskId = id.replace('t-', '');
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, scheduledTime: newStartTime } : t));
      } else if (type === 'event' && setEvents) {
        const eventId = id.replace('e-', '');
        setEvents(prev => prev.map(e => e.id === eventId ? { ...e, startTime: newStartTime, endTime: newEndTime } : e));
      } else if (type === 'fixed' && setFixedTasks) {
        const fixedTaskId = id.replace('f-', '');
        setFixedTasks(prev => prev.map(f => f.id === fixedTaskId ? { ...f, startTime: newStartTime, endTime: newEndTime } : f));
      }
    } catch (err) {
      console.error('Error dropping on item:', err);
    }
  };

  const dynamicHours = Array.from({ length: 15 }, (_, i) => wakeHour + i);

  // Routine blocks form states
  const [newTitle, setNewTitle] = useState('🍳 Breakfast');
  const [customTitle, setCustomTitle] = useState('');
  const [newStart, setNewStart] = useState(`${wakeHour.toString().padStart(2, '0')}:00`);
  const [newEnd, setNewEnd] = useState(`${(wakeHour + 1).toString().padStart(2, '0')}:00`);
  const [errorMsg, setErrorMsg] = useState('');

  const [refinementText, setRefinementText] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const handleRefineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refinementText.trim() || isRefining) return;

    setIsRefining(true);
    setFeedbackMsg({ text: '🧠 Communicating with Core Scheduler Agent...', type: 'info' });
    try {
      const response = await fetch('/api/refine-schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ai-provider': aiProvider,
          'x-gemini-api-key': clientGeminiApiKey?.trim() || '',
          'x-openai-api-key': clientOpenaiApiKey?.trim() || '',
          'x-anthropic-api-key': clientAnthropicApiKey?.trim() || '',
          'x-deepseek-api-key': clientDeepseekApiKey?.trim() || '',
        },
        body: JSON.stringify({
          tasks,
          events,
          fixedTasks,
          userPrompt: refinementText,
          habitProfile,
          wakeHour,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || errData.message || 'Failed to refine schedule');
      }

      const data = await response.json();
      if (data.updatedTasks && setTasks) {
        setTasks(prev => prev.map(t => {
          const updated = data.updatedTasks.find((ut: any) => ut.id === t.id);
          return updated ? { ...t, scheduledTime: updated.scheduledTime } : t;
        }));
      }
      if (data.updatedEvents && setEvents) {
        setEvents(data.updatedEvents);
      }
      if (data.detectedPattern && onLearnPattern) {
        onLearnPattern(data.detectedPattern);
      }

      setRefinementText('');
      setFeedbackMsg({ text: '✨ Schedule refined and timeline updated seamlessly!', type: 'success' });
      setTimeout(() => setFeedbackMsg(null), 5000);
    } catch (err: any) {
      console.error(err);
      setFeedbackMsg({ text: `⚠️ Adjustment failed: ${err.message || 'Error communicating with server'}`, type: 'error' });
      setTimeout(() => setFeedbackMsg(null), 6000);
    } finally {
      setIsRefining(false);
    }
  };

  React.useEffect(() => {
    const startStr = `${wakeHour.toString().padStart(2, '0')}:00`;
    const endStr = `${(wakeHour + 1).toString().padStart(2, '0')}:00`;
    setNewStart(startStr);
    setNewEnd(endStr);
  }, [wakeHour]);

  React.useEffect(() => {
    const startMins = timeToMinutes(newStart);
    const endMins = timeToMinutes(newEnd);
    if (!isNaN(startMins) && !isNaN(endMins) && startMins >= endMins) {
      const nextMins = Math.min(startMins + 30, 24 * 60);
      setNewEnd(minutesToTime(nextMins));
    }
  }, [newStart]);

  // Clear overlap errors as soon as user updates any field, allowing continuous editing
  React.useEffect(() => {
    setErrorMsg('');
  }, [newStart, newEnd, newTitle, customTitle]);

  // Calibrate hourly energy scores depending on Wake Hour
  const getCalibratedEnergy = (hour: number): number => {
    if (propGetCalibratedEnergy) {
      return propGetCalibratedEnergy(hour);
    }
    const shift = wakeHour - 8;
    const adjustedHour = hour - shift;
    return getEnergyForHour(adjustedHour);
  };

  // Generate SVG path for the Biorhythm Curve
  const generateSvgPath = (): string => {
    const points = dynamicHours.map((hour, idx) => {
      const x = (idx / (dynamicHours.length - 1)) * 100; // Percentage width
      const energy = getCalibratedEnergy(hour);
      const y = 100 - energy; // Convert score to coordinate
      return `${x},${y}`;
    });
    return `M ${points.join(' L ')}`;
  };

  // Check if there is an event at a specific hour
  const getEventForHourBlock = (hour: number) => {
    return events.find(e => {
      const startH = parseInt(e.startTime.split(':')[0]);
      const endH = parseInt(e.endTime.split(':')[0]);
      return hour >= startH && hour < endH;
    });
  };

  // Check if any fixed tasks are active or overlap with a specific hour block
  const getFixedTasksForHourBlock = (hour: number) => {
    const startMins = hour * 60;
    const endMins = (hour + 1) * 60;
    return fixedTasks.filter(f => {
      const fStart = timeToMinutes(f.startTime);
      const fEnd = timeToMinutes(f.endTime);
      return fStart < endMins && fEnd > startMins;
    });
  };

  const handleShiftToggle = () => {
    setCircadianOptimized(!circadianOptimized);
    onShiftTasks();
  };

  const handleAddFixedTask = (e: React.FormEvent) => {
    e.preventDefault();
    const startMins = timeToMinutes(newStart);
    const endMins = timeToMinutes(newEnd);

    if (startMins >= endMins) {
      setErrorMsg('End time must be strictly after start time.');
      return;
    }

    const finalTitle = newTitle === '💻 Custom' ? (customTitle || 'Custom Routine') : newTitle;

    // Check for overlap in routines using minutes from midnight for perfect accuracy
    const isOverlapping = fixedTasks.some(f => {
      const fStart = timeToMinutes(f.startTime);
      const fEnd = timeToMinutes(f.endTime);
      return (startMins < fEnd && endMins > fStart);
    });

    if (isOverlapping) {
      setErrorMsg('This slot overlaps with an existing locked routine.');
      return;
    }

    setErrorMsg('');
    const newRoutine: FixedTask = {
      id: 'f-dyn-' + Date.now(),
      title: finalTitle,
      startTime: newStart,
      endTime: newEnd
    };

    setFixedTasks(prev => [...prev, newRoutine].sort((a, b) => a.startTime.localeCompare(b.startTime)));
    setCustomTitle('');
  };

  const handleRemoveFixedTask = (id: string) => {
    setFixedTasks(prev => prev.filter(f => f.id !== id));
  };

  const handleInjectRestBuffer = (hr: number) => {
    const startStr = `${hr.toString().padStart(2, '0')}:00`;
    const endStr = `${hr.toString().padStart(2, '0')}:15`;
    
    if (fixedTasks.some(t => t.startTime === startStr && t.title.includes('Rest & Rehydrate'))) {
      return;
    }
    
    const newBuffer: FixedTask = {
      id: `f-buffer-${hr}-${Date.now()}`,
      title: '💧 Rest & Rehydrate Buffer',
      startTime: startStr,
      endTime: endStr
    };
    setFixedTasks(prev => [...prev, newBuffer].sort((a, b) => a.startTime.localeCompare(b.startTime)));
    if (onShiftTasks) onShiftTasks();
  };

  interface VisualItem {
    id: string;
    type: 'fixed' | 'event' | 'task';
    title: string;
    startTime: string;
    endTime: string;
    originalItem: any;
    startMin: number;
    endMin: number;
  }

  interface LayoutItem extends VisualItem {
    left: number;
    width: number;
  }

  const visualItems: VisualItem[] = [];

  fixedTasks.forEach(f => {
    visualItems.push({
      id: `f-${f.id}`,
      type: 'fixed',
      title: f.title,
      startTime: f.startTime,
      endTime: f.endTime,
      originalItem: f,
      startMin: timeToMinutes(f.startTime),
      endMin: timeToMinutes(f.endTime)
    });
  });

  events.forEach(e => {
    visualItems.push({
      id: `e-${e.id}`,
      type: 'event',
      title: e.title,
      startTime: e.startTime,
      endTime: e.endTime,
      originalItem: e,
      startMin: timeToMinutes(e.startTime),
      endMin: timeToMinutes(e.endTime)
    });
  });

  tasks.forEach(t => {
    if (t.scheduledTime) {
      const sMin = timeToMinutes(t.scheduledTime);
      const duration = t.microSteps && t.microSteps.length > 0 
        ? t.microSteps.reduce((sum, ms) => sum + (ms.estimatedMinutes || 20), 0)
        : 60;
      const eMin = sMin + duration;
      visualItems.push({
        id: `t-${t.id}`,
        type: 'task',
        title: t.title,
        startTime: t.scheduledTime,
        endTime: minutesToTime(eMin),
        originalItem: t,
        startMin: sMin,
        endMin: eMin
      });
    }
  });

  const calendarStartMin = wakeHour * 60;
  const calendarEndMin = (wakeHour + 15) * 60;

  const visibleItems = visualItems.filter(item => {
    return item.startMin < calendarEndMin && item.endMin > calendarStartMin;
  }).sort((a, b) => a.startMin - b.startMin || (b.endMin - b.startMin) - (a.endMin - a.startMin));

  const layoutItems: LayoutItem[] = [];
  const clusters: VisualItem[][] = [];

  visibleItems.forEach(item => {
    let joinedCluster = false;
    for (const cluster of clusters) {
      const overlaps = cluster.some(cItem => item.startMin < cItem.endMin && item.endMin > cItem.startMin);
      if (overlaps) {
        cluster.push(item);
        joinedCluster = true;
        break;
      }
    }
    if (!joinedCluster) {
      clusters.push([item]);
    }
  });

  clusters.forEach(cluster => {
    const colList: VisualItem[][] = [];
    cluster.forEach(item => {
      let placed = false;
      for (let i = 0; i < colList.length; i++) {
        const col = colList[i];
        const hasOverlap = col.some(cItem => item.startMin < cItem.endMin && item.endMin > cItem.startMin);
        if (!hasOverlap) {
          col.push(item);
          placed = true;
          break;
        }
      }
      if (!placed) {
        colList.push([item]);
      }
    });

    const colsCount = colList.length;
    colList.forEach((col, colIdx) => {
      col.forEach(item => {
        layoutItems.push({
          ...item,
          left: (colIdx / colsCount) * 100,
          width: (1 / colsCount) * 100
        });
      });
    });
  });

  const getEnergyColor = (score: number) => {
    if (score >= 75) return 'text-blue-700 bg-blue-50/40 border-blue-100/70';
    if (score >= 50) return 'text-emerald-700 bg-emerald-50/40 border-emerald-100/70';
    return 'text-amber-700 bg-amber-50/40 border-amber-100/50';
  };

  return (
    <div id="flowstate-calendar-container" className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-slate-800 font-sans w-full h-full lg:h-full min-h-[600px] lg:min-h-0">
      {/* Calendar Timeline - 7 cols */}
      <div id="calendar-timeline-panel" className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full min-h-0">
        {/* Google Calendar-Style Date Selector & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 p-0.5 rounded-lg">
              <button
                onClick={() => {
                  setSelectedDate(new Date());
                  setSimulatedHour(wakeHour);
                }}
                className="px-2.5 py-1 text-xs font-semibold rounded-md text-slate-700 hover:bg-white hover:shadow-sm transition-all cursor-pointer"
                title="Reset to today's date"
              >
                Today
              </button>
              <div className="h-4 w-[1px] bg-slate-200 my-auto"></div>
              <button
                onClick={() => {
                  const prevDay = new Date(selectedDate);
                  prevDay.setDate(prevDay.getDate() - 1);
                  setSelectedDate(prevDay);
                }}
                className="p-1 text-slate-600 hover:bg-white hover:shadow-sm rounded-md transition-all cursor-pointer font-bold text-xs"
                title="Go back 1 day"
              >
                ‹
              </button>
              <button
                onClick={() => {
                  const nextDay = new Date(selectedDate);
                  nextDay.setDate(nextDay.getDate() + 1);
                  setSelectedDate(nextDay);
                }}
                className="p-1 text-slate-600 hover:bg-white hover:shadow-sm rounded-md transition-all cursor-pointer font-bold text-xs"
                title="Go forward 1 day"
              >
                ›
              </button>
            </div>
            <span className="text-sm font-extrabold text-slate-800 font-display">
              {selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="toggle-circadian-btn"
              onClick={handleShiftToggle}
              className={`text-[10px] px-3 py-1.5 rounded-full border font-bold uppercase tracking-wider transition-all duration-300 flex items-center gap-1.5 ${
                circadianOptimized
                  ? 'bg-blue-50 border-blue-200 text-blue-600'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800'
              }`}
            >
              <Zap className={`w-3.5 h-3.5 ${circadianOptimized ? 'text-blue-600 animate-pulse' : 'text-slate-400'}`} />
              <span>{circadianOptimized ? 'Circadian Sync ACTIVE' : 'Circadian Sync OFF'}</span>
            </button>
          </div>
        </div>

        {/* Google Calendar Column Header Day Bubble */}
        <div className="flex items-center pl-16 border-b border-slate-100 pb-3 mb-2 shrink-0">
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {selectedDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
            </span>
            <span className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-md mt-0.5 shadow-blue-500/15">
              {selectedDate.getDate()}
            </span>
          </div>
          <span className="ml-4 text-xxs text-slate-400 font-semibold tracking-wider uppercase font-mono bg-slate-50 border border-slate-150 px-2 py-0.5 rounded-md">
            Day View • GMT-07
          </span>
          <button
            type="button"
            onClick={() => setIsExpandedModalOpen(true)}
            className="ml-auto flex items-center gap-1.5 text-[10px] font-bold text-slate-600 hover:text-blue-600 bg-slate-50 border border-slate-200 hover:border-blue-300 hover:bg-blue-50 px-2.5 py-1 rounded-lg transition-all cursor-pointer shadow-2xs"
            title="Expand calendar to full screen single view without scrolling"
          >
            <Maximize2 className="w-3 h-3" />
            <span>Expand Calendar</span>
          </button>
        </div>

        {/* Hour-by-hour continuous grid layout */}
        <div className="flex-1 overflow-y-auto h-[500px] lg:h-[calc(100vh-320px)] min-h-[350px] pr-1 border border-slate-200 rounded-2xl scrollbar-thin relative bg-white" id="calendar-timeline-scroll-container">
          <div className="relative w-full" style={{ height: '1200px' }}>
            {/* 1. Background click grid */}
            <div className="absolute inset-x-0 top-0 bottom-0 divide-y divide-slate-100">
              {dynamicHours.map((hour) => {
                const energy = getCalibratedEnergy(hour);
                const isSimulatedTime = hour === simulatedHour;
                const energyStyle = getEnergyColor(energy);

                // Gym/recovery logic
                const prevHour = hour - 1;
                const prevRoutines = getFixedTasksForHourBlock(prevHour);
                const prevEvent = getEventForHourBlock(prevHour);
                const hasPrevPhysicalExhaustion = prevRoutines.some(r => classifyActivity(r.title) === 'Physical Exhaustion') ||
                                                  (prevEvent && classifyActivity(prevEvent.title) === 'Physical Exhaustion');

                const isSchedulingThisHour = schedulingTime && parseInt(schedulingTime.split(':')[0], 10) === hour;

                return (
                  <div
                    key={hour}
                    id={`calendar-hour-row-${hour}`}
                    className={`flex items-stretch transition-all duration-150 relative ${
                      isSimulatedTime ? 'bg-blue-50/10' : ''
                    }`}
                    style={{ height: '80px' }}
                  >
                    {/* Hour indicator column */}
                    <div className="w-16 text-right pr-4 text-[10px] font-mono font-bold text-slate-400 select-none border-r border-slate-150 flex flex-col justify-center shrink-0 bg-slate-50/40">
                      <span>{hour.toString().padStart(2, '0')}:00</span>
                      {isSimulatedTime && (
                        <span className="text-[8px] text-red-500 font-black tracking-wider uppercase mt-0.5">NOW</span>
                      )}
                    </div>

                    {/* Energy score indicator column */}
                    <div className="flex items-center px-3 shrink-0 border-r border-slate-100 bg-slate-50/10">
                      <div className={`w-18 rounded-lg px-1.5 py-1.5 border flex flex-col items-center justify-center text-center leading-none ${energyStyle}`} title="Simulated body energy state during this hour">
                        <span className="text-[10px] font-bold uppercase tracking-wider">⚡ {energy}%</span>
                        <span className="text-[7px] opacity-90 font-bold uppercase tracking-wide mt-0.5">
                          {energy >= 75 ? 'Peak Focus' : energy >= 50 ? 'Sub-Focus' : 'Recovery'}
                        </span>
                      </div>
                    </div>

                    {/* Right-side cells (either form or clickable time slots) */}
                    <div className="flex-1 relative flex flex-col justify-center h-full">
                      {isSchedulingThisHour ? (
                        <div className="absolute inset-y-1 inset-x-2 z-30">
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (quickTaskTitle.trim() && quickTaskTitle !== 'Listening...' && schedulingTime) {
                                onScheduleTaskAtHour(quickTaskTitle.trim(), schedulingTime);
                                setSchedulingTime(null);
                                setQuickTaskTitle('');
                              }
                            }}
                            className="flex items-center gap-2 w-full h-full bg-blue-50/95 border border-blue-300 rounded-xl px-3 py-1 animate-fade-in shadow-md"
                          >
                            <div className="flex-1 flex flex-col justify-center gap-1">
                              <span className="text-[8px] font-mono font-bold text-blue-600 uppercase tracking-wider leading-none">
                                Add Focus Block @ {schedulingTime}
                              </span>
                              <input
                                type="text"
                                autoFocus
                                placeholder="Type task..."
                                value={quickTaskTitle}
                                onChange={(e) => setQuickTaskTitle(e.target.value)}
                                className="w-full bg-white border border-slate-250 rounded-md px-2 py-1 text-xs text-slate-700 focus:outline-none focus:border-blue-500"
                              />
                            </div>
                            
                            <button
                              type="button"
                              onClick={() => {
                                const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                                if (!SpeechRecognition) {
                                  setIsListening(true);
                                  setQuickTaskTitle('Listening...');
                                  setTimeout(() => {
                                    const presets = [
                                      'Design new UI components',
                                      'Review pull requests',
                                      'Prepare slide deck for client meeting',
                                      'Write system architectural document',
                                      'Optimize database queries'
                                    ];
                                    const randomPreset = presets[Math.floor(Math.random() * presets.length)];
                                    setQuickTaskTitle(randomPreset);
                                    setIsListening(false);
                                  }, 1500);
                                  return;
                                }
                                try {
                                  const recognition = new SpeechRecognition();
                                  recognition.lang = 'en-US';
                                  recognition.interimResults = false;
                                  recognition.maxAlternatives = 1;
                                  recognition.onstart = () => {
                                    setIsListening(true);
                                    setQuickTaskTitle('Listening...');
                                  };
                                  recognition.onerror = () => {
                                    setIsListening(false);
                                    setQuickTaskTitle('');
                                    alert('Voice error. Type instead.');
                                  };
                                  recognition.onend = () => {
                                    setIsListening(false);
                                  };
                                  recognition.onresult = (event: any) => {
                                    const transcript = event.results[0][0].transcript;
                                    if (transcript) setQuickTaskTitle(transcript);
                                  };
                                  recognition.start();
                                } catch (e) {
                                  console.error(e);
                                  setIsListening(false);
                                }
                              }}
                              className={`p-1.5 rounded-lg border transition-all shrink-0 ${
                                isListening
                                  ? 'bg-red-50 border-red-200 text-red-600 animate-pulse'
                                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-blue-600'
                              }`}
                            >
                              <Mic className="w-3 h-3" />
                            </button>

                            <button
                              type="submit"
                              disabled={!quickTaskTitle.trim() || quickTaskTitle === 'Listening...'}
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                            >
                              Add
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSchedulingTime(null);
                                setQuickTaskTitle('');
                              }}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium shrink-0"
                            >
                              Cancel
                            </button>
                          </form>
                        </div>
                      ) : (
                        // If it is suggested rest block
                        hourlyFeelings && hourlyFeelings[hour] === 'low' && !dismissedRestHours.includes(hour) ? (
                          <div className="absolute inset-y-1 inset-x-2 z-10 bg-emerald-50/90 border border-emerald-100 rounded-xl p-2 flex items-center justify-between gap-3 text-xs animate-fade-in shadow-xs">
                            <div className="flex items-center gap-2 truncate">
                              <span className="text-sm select-none">
                                {hour === 12 || hour === 13 ? '🥗' : hour === 14 || hour === 15 ? '😴' : hour >= 18 ? '🚶' : '🧘'}
                              </span>
                              <div className="truncate">
                                <span className="font-bold text-emerald-800 block leading-tight text-[11px]">Rest & Recharge Slot Suggested</span>
                                <span className="text-[9px] text-slate-500 font-medium leading-tight block truncate mt-0.5">
                                  {hour === 12 || hour === 13 ? 'Time for a healthy meal & nutrition break.' :
                                   hour === 14 || hour === 15 ? 'Take a soothing 20m power nap or listen to relaxing music.' :
                                   hour >= 18 ? 'Go for a nature walk, read a book or do sleep prep.' : 
                                   'Practice mindfulness meditation & deep breathing.'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => {
                                  setSchedulingTime(`${hour.toString().padStart(2, '0')}:00`);
                                  setQuickTaskTitle('');
                                }}
                                className="text-[9px] bg-white text-emerald-700 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded font-bold uppercase transition-all shadow-xs shrink-0 cursor-pointer"
                                title="Override rest suggestion to schedule a task"
                              >
                                + Focus Block
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteConfirmItem({
                                    id: `suggested-rest-${hour}`,
                                    type: 'suggested-rest',
                                    title: `Rest & Recharge Slot (Hour ${hour}:00)`,
                                    hour: hour
                                  });
                                }}
                                className="p-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-all duration-150 cursor-pointer flex items-center justify-center shrink-0"
                                title="Dismiss suggestion"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          // Normal empty space split into half hour clickable zones
                          <div className="h-full w-full flex flex-col">
                            {/* Gym recovery buffer notice at the very top of hour if applicable */}
                            {hasPrevPhysicalExhaustion && !dismissedGymHours.includes(hour) && (
                              <div className="absolute left-2 right-2 top-1.5 z-10 p-1 bg-amber-50 border border-amber-200 text-[9px] text-amber-800 rounded-md flex items-center justify-between gap-1.5 font-semibold animate-pulse shadow-2xs">
                                <span className="flex items-center gap-1">🏋️ Gym recovery buffer suggested.</span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={() => handleInjectRestBuffer(hour)}
                                    className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-1.5 py-0.5 rounded text-[8px] cursor-pointer transition-all active:scale-95 shrink-0"
                                  >
                                    + Add 15m Buffer
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDeleteConfirmItem({
                                        id: `suggested-gym-${hour}`,
                                        type: 'suggested-gym',
                                        title: `Gym recovery buffer (Hour ${hour}:00)`,
                                        hour: hour
                                      });
                                    }}
                                    className="p-0.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded transition-all cursor-pointer shrink-0"
                                    title="Dismiss buffer suggestion"
                                  >
                                    <Trash2 className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Top Half (:00 to :30) */}
                            <button
                              onClick={() => {
                                setSchedulingTime(`${hour.toString().padStart(2, '0')}:00`);
                                setQuickTaskTitle('');
                              }}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                              }}
                              onDragEnter={() => setDragOverZone(`${hour}:00`)}
                              onDragLeave={() => setDragOverZone(null)}
                              onDrop={(e) => handleDropOnTime(e, hour, '00')}
                              className={`h-1/2 w-full text-left flex items-center justify-between text-slate-400 text-xxs italic px-3 border-b border-dashed border-slate-100/50 transition-all group cursor-pointer ${
                                dragOverZone === `${hour}:00` ? 'bg-blue-100/80 border-blue-400 font-bold text-blue-700' : 'hover:bg-slate-50/80'
                              }`}
                            >
                              <span className={`${dragOverZone === `${hour}:00` ? 'opacity-100 text-blue-700 font-semibold' : 'opacity-0 group-hover:opacity-100'} font-medium transition-all text-slate-500 flex items-center gap-1`}>
                                <Plus className="w-2.5 h-2.5" /> {dragOverZone === `${hour}:00` ? 'Drop to Reschedule block here' : `${hour.toString().padStart(2, '0')}:00 — Schedule Focus Block`}
                              </span>
                            </button>

                            {/* Bottom Half (:30 to :00) */}
                            <button
                              onClick={() => {
                                setSchedulingTime(`${hour.toString().padStart(2, '0')}:30`);
                                setQuickTaskTitle('');
                              }}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                              }}
                              onDragEnter={() => setDragOverZone(`${hour}:30`)}
                              onDragLeave={() => setDragOverZone(null)}
                              onDrop={(e) => handleDropOnTime(e, hour, '30')}
                              className={`h-1/2 w-full text-left flex items-center justify-between text-slate-400 text-xxs italic px-3 transition-all group cursor-pointer ${
                                dragOverZone === `${hour}:30` ? 'bg-blue-100/80 border-blue-400 font-bold text-blue-700' : 'hover:bg-slate-50/80'
                              }`}
                            >
                              <span className={`${dragOverZone === `${hour}:30` ? 'opacity-100 text-blue-700 font-semibold' : 'opacity-0 group-hover:opacity-100'} font-medium transition-all text-slate-500 flex items-center gap-1`}>
                                <Plus className="w-2.5 h-2.5" /> {dragOverZone === `${hour}:30` ? 'Drop to Reschedule block here' : `${hour.toString().padStart(2, '0')}:30 — Schedule Focus Block`}
                              </span>
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 2. Absolute overlay for items */}
            <div className="absolute inset-y-0 right-0 pointer-events-none" style={{ left: '160px' }}>
              {layoutItems.map((item) => {
                const isFixed = item.type === 'fixed';
                const isEvent = item.type === 'event';
                const isTask = item.type === 'task';

                const category = isTask
                  ? classifyActivity(item.title, item.originalItem.description)
                  : classifyActivity(item.title);
                const catStyles = getCategoryStyles(category);

                const isIcal = isFixed && item.originalItem.id.startsWith('f-ical-');
                const isHighLoadOver90 = category === 'High Cognitive Load' && (item.endMin - item.startMin) > 90;

                const hour = Math.floor(item.startMin / 60);
                const prevHour = hour - 1;
                const prevRoutines = getFixedTasksForHourBlock(prevHour);
                const prevEvent = getEventForHourBlock(prevHour);
                const hasPrevMindfulRecovery = prevRoutines.some(r => classifyActivity(r.title) === 'Mindful Recovery') ||
                                               (prevEvent && classifyActivity(prevEvent.title) === 'Mindful Recovery');

                const itemHeight = (item.endMin - item.startMin) * (80 / 60);
                const showMinimalDetails = itemHeight < 35;
                const showCompactDetails = itemHeight >= 35 && itemHeight < 60;

                if (showMinimalDetails) {
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className="absolute pointer-events-auto cursor-pointer hover:scale-[1.02] transition-transform duration-100 group/item"
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, item)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(e) => handleDropOnItem(e, item.startMin)}
                      style={{
                        top: `${(item.startMin - calendarStartMin) * (80 / 60)}px`,
                        height: `${(item.endMin - item.startMin) * (80 / 60)}px`,
                        left: `${item.left}%`,
                        width: `${item.width}%`,
                        padding: '1px'
                      }}
                    >
                      <div className={`px-2 py-0.5 rounded-lg border-l-[3px] border text-[10px] font-bold flex items-center justify-between h-full shadow-2xs relative group hover:shadow transition-all ${
                        category !== 'Routine/Buffer'
                          ? `${catStyles.bg} ${catStyles.border} ${catStyles.text}`
                          : isFixed && isIcal
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                            : isEvent && item.originalItem.type === 'meeting'
                              ? 'bg-rose-50 border-rose-300 text-rose-700'
                              : isEvent && item.originalItem.type === 'routine'
                                ? 'bg-slate-50 border-slate-300 text-slate-600'
                                : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      }`} title={`${item.title} (${item.startTime} - ${item.endTime})`}>
                        <span className="truncate flex items-center gap-1">
                          {isFixed && <Lock className="w-2.5 h-2.5 shrink-0 text-slate-400" />}
                          {item.title}
                        </span>
                        <div className="flex items-center gap-1 shrink-0 ml-1">
                          <span className="font-mono text-[8px] opacity-75">
                            {item.startTime}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmItem(item);
                            }}
                            className="opacity-0 group-hover/item:opacity-100 p-0.5 bg-rose-100 hover:bg-rose-200 text-rose-600 rounded transition-opacity duration-100 cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                      
                      {/* Resize Handle */}
                      <div
                        className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize z-20"
                        onMouseDown={(e) => handleResizeStart(e, item)}
                      />
                    </div>
                  );
                }

                if (showCompactDetails) {
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className="absolute pointer-events-auto cursor-pointer hover:scale-[1.02] transition-transform duration-100 group/item"
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, item)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(e) => handleDropOnItem(e, item.startMin)}
                      style={{
                        top: `${(item.startMin - calendarStartMin) * (80 / 60)}px`,
                        height: `${(item.endMin - item.startMin) * (80 / 60)}px`,
                        left: `${item.left}%`,
                        width: `${item.width}%`,
                        padding: '2px'
                      }}
                    >
                      <div className={`p-1.5 rounded-xl border-l-[4px] border text-xxs font-bold flex flex-col justify-between h-full shadow-xs relative group hover:shadow transition-all ${
                        category !== 'Routine/Buffer'
                          ? `${catStyles.bg} ${catStyles.border} ${catStyles.text}`
                          : isFixed && isIcal
                            ? 'bg-indigo-50 border-indigo-400 text-indigo-800'
                            : isEvent && item.originalItem.type === 'meeting'
                              ? 'bg-rose-50 border-rose-400 text-rose-800'
                              : isEvent && item.originalItem.type === 'routine'
                                ? 'bg-slate-50 border-slate-300 text-slate-700'
                                : 'bg-emerald-50 border-emerald-400 text-emerald-800'
                      }`} title={`${item.title} (${item.startTime} - ${item.endTime})`}>
                        <div className="flex items-center justify-between w-full truncate gap-2 leading-none">
                          <span className="truncate flex items-center gap-1.5">
                            {isFixed && <Lock className="w-2.5 h-2.5 shrink-0 text-slate-400" />}
                            {item.title}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="font-mono text-[8px] opacity-85">{item.startTime}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmItem(item);
                              }}
                              className="opacity-0 group-hover/item:opacity-100 p-0.5 bg-rose-100 hover:bg-rose-200 text-rose-600 rounded transition-opacity duration-100 cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Resize Handle */}
                      <div
                        className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize z-20"
                        onMouseDown={(e) => handleResizeStart(e, item)}
                      />
                    </div>
                  );
                }

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className="absolute pointer-events-auto animate-fade-in cursor-pointer hover:scale-[1.01] transition-transform duration-100 group/item"
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, item)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => handleDropOnItem(e, item.startMin)}
                    style={{
                      top: `${(item.startMin - calendarStartMin) * (80 / 60)}px`,
                      height: `${(item.endMin - item.startMin) * (80 / 60)}px`,
                      left: `${item.left}%`,
                      width: `${item.width}%`,
                      padding: '2px'
                    }}
                  >
                    <div className={`p-2.5 rounded-xl border-l-[4px] border text-xs font-semibold flex flex-col justify-between h-full shadow-sm relative overflow-hidden group hover:shadow-md transition-all ${
                      category !== 'Routine/Buffer'
                        ? `${catStyles.bg} ${catStyles.border} ${catStyles.text}`
                        : isFixed
                          ? isIcal
                            ? 'bg-indigo-50/95 border-indigo-500 text-indigo-900'
                            : 'bg-slate-50/95 border-slate-400 text-slate-800'
                          : isEvent
                            ? item.originalItem.type === 'meeting'
                              ? 'bg-rose-50/95 border-rose-500 text-rose-900'
                              : item.originalItem.type === 'routine'
                                ? 'bg-slate-50/95 border-slate-400 text-slate-800'
                                : 'bg-emerald-50/95 border-emerald-500 text-emerald-900'
                            : 'bg-blue-50/95 border-blue-500 text-blue-900'
                    }`}>
                      <div>
                        <div className="flex items-center justify-between font-bold text-[11px] flex-wrap gap-2">
                          <span className="flex items-center gap-1.5 truncate">
                            {isFixed && <Lock className={`w-3.5 h-3.5 shrink-0 ${isIcal ? 'text-indigo-400' : 'text-slate-400'}`} />}
                            {isTask && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>}
                            <span className="truncate">{item.title}</span>
                          </span>
                          <div className="flex items-center gap-1 flex-wrap">
                            {category !== 'Routine/Buffer' && (
                              <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${catStyles.badge}`}>
                                {category}
                              </span>
                            )}
                            {hasPrevMindfulRecovery && (
                              <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500 text-white animate-pulse">
                                🚀 Peak Cognitive Window Open
                              </span>
                            )}
                            {isTask && (
                              <span className="text-[8px] font-bold uppercase tracking-widest bg-blue-100 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded">Focus Block</span>
                            )}
                            <span className="text-[9px] font-mono opacity-80 bg-white/50 border border-black/5 px-1 py-0.5 rounded">{item.startTime} - {item.endTime}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmItem(item);
                              }}
                              className="opacity-0 group-hover/item:opacity-100 p-1 bg-rose-100 hover:bg-rose-200 text-rose-600 rounded-md transition-all duration-150 cursor-pointer"
                              title="Delete block manually"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {isHighLoadOver90 && (
                          <div className="mt-1.5 p-1.5 bg-rose-100 border border-rose-300 text-[9px] text-rose-800 rounded-md flex items-center gap-1.5 font-bold">
                            <span>🧠 Neural fatigue warning: Break recommended (exceeds 90m)</span>
                          </div>
                        )}

                        {isIcal && category === 'Routine/Buffer' && (
                          <p className="text-[9px] text-indigo-700/80 font-semibold mt-1 leading-none">
                            Imported Locked Meeting Block
                          </p>
                        )}

                        {isEvent && (
                          <p className="text-[9px] opacity-80 font-medium mt-1 leading-normal">
                            {item.originalItem.type === 'meeting' ? '⚠️ Social energy drain. Rest recommended afterwards.' : 'Habit hold block.'}
                          </p>
                        )}

                        {isTask && (
                          <p className="text-[9px] text-slate-500 font-medium mt-1 leading-normal">Circadian Optimized slot based on cognitive capacity score.</p>
                        )}
                      </div>
                    </div>

                    {/* Resize Handle */}
                    <div
                      className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize z-30 flex items-center justify-center group/resize"
                      onMouseDown={(e) => handleResizeStart(e, item)}
                    >
                      <div className="w-8 h-1 bg-slate-300 rounded group-hover/resize:bg-blue-400 opacity-0 group-hover/resize:opacity-100 transition-all"></div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 3. Google Calendar Red Time indicator bar */}
            {dynamicHours.includes(simulatedHour) && (
              <div
                className="absolute left-16 right-0 h-[2px] bg-red-500 z-20 flex items-center pointer-events-none transition-all duration-300"
                style={{ top: `${(simulatedHour - wakeHour) * 80}px` }}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1 border border-white shadow-md"></div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Energy Curve & Biorhythms Panel - 5 cols */}
      <div id="biorhythm-analysis-panel" className="lg:col-span-5 flex flex-col gap-4 overflow-y-auto h-[500px] lg:h-[calc(100vh-230px)] pr-1 scrollbar-thin min-h-0">

        {/* Locked Daily Routines Manager Card */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-600" />
              <h4 className="text-sm font-bold font-display text-slate-800">Locked Daily Routines</h4>
            </div>
            <span className="text-[9px] font-mono bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full font-bold">
              {fixedTasks.length} Locked
            </span>
          </div>

          <p className="text-[10px] text-slate-500 leading-normal font-medium">
            Lock times for key daily habits as absolute calendar holds that AI dynamic scheduling will respect.
          </p>

          {/* Active Routines List */}
          <div className="space-y-1.5 max-h-[110px] overflow-y-auto pr-1">
            {fixedTasks.map((f) => {
              const isIcal = f.id.startsWith('f-ical-');
              return (
                <div key={f.id} className={`flex items-center justify-between p-1.5 rounded-xl border text-[11px] ${
                  isIcal ? 'bg-indigo-50/50 border-indigo-100' : 'bg-slate-50 border-slate-150'
                }`}>
                  <div className="flex items-center gap-1.5 font-semibold text-slate-700 min-w-0">
                    <Lock className={`w-3 h-3 shrink-0 ${isIcal ? 'text-indigo-400' : 'text-slate-400'}`} />
                    <span className={`truncate ${isIcal ? 'text-indigo-950 font-bold' : ''}`}>{f.title}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`font-mono text-[9px] px-1.5 py-0.5 border rounded-md ${
                      isIcal ? 'bg-white border-indigo-100 text-indigo-800 font-bold' : 'bg-white border-slate-200 text-slate-500'
                    }`}>
                      {f.startTime} - {f.endTime}
                    </span>
                    <button
                      onClick={() => handleRemoveFixedTask(f.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title={isIcal ? "Remove Imported Calendar Block" : "Remove Routine Block"}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
            {fixedTasks.length === 0 && (
              <div className="text-center py-3 text-slate-400 italic text-[11px]">
                No active routine holds. Click below to add one.
              </div>
            )}
          </div>

          {/* Inline Form to Add Routine */}
          <form onSubmit={handleAddFixedTask} className="border-t border-slate-100 pt-2.5 space-y-2.5">
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-6">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Activity</label>
                <select
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs text-slate-700 outline-none focus:border-blue-500 focus:bg-white cursor-pointer"
                >
                  <option value="🍳 Breakfast">🍳 Breakfast</option>
                  <option value="🍽️ Lunch Break">🍽️ Lunch Break</option>
                  <option value="🥣 Dinner Hold">🥣 Dinner Hold</option>
                  <option value="🏋️ Gym / Workout">🏋️ Gym / Workout</option>
                  <option value="🚗 Daily Commute">🚗 Daily Commute</option>
                  <option value="💻 Custom">💻 Custom...</option>
                </select>
              </div>

              <div className="col-span-3">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">From</label>
                <select
                  value={newStart}
                  onChange={(e) => setNewStart(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs text-slate-700 outline-none focus:border-blue-500 focus:bg-white font-mono cursor-pointer"
                >
                  {generateTimeOptions(wakeHour, 24).slice(0, -1).map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-3">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">To</label>
                <select
                  value={newEnd}
                  onChange={(e) => setNewEnd(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs text-slate-700 outline-none focus:border-blue-500 focus:bg-white font-mono cursor-pointer"
                >
                  {(() => {
                    const startMins = timeToMinutes(newStart);
                    const allOptions = generateTimeOptions(wakeHour, 24);
                    return allOptions
                      .filter(opt => timeToMinutes(opt) > startMins)
                      .map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ));
                  })()}
                </select>
              </div>
            </div>

            {newTitle === '💻 Custom' && (
              <div className="animate-fade-in">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Custom Name</label>
                <input
                  type="text"
                  placeholder="e.g. 🧘 Yoga / Meditation"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-700 outline-none focus:border-blue-500 focus:bg-white font-medium"
                />
              </div>
            )}

            {errorMsg && (
              <div className="flex items-center justify-between gap-1.5 text-rose-600 bg-rose-50 border border-rose-100 p-2 rounded-xl text-[10px] font-bold animate-fade-in">
                <div className="flex items-center gap-1.5 min-w-0">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0 animate-pulse text-rose-500" />
                  <span className="truncate">{errorMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMsg('')}
                  className="text-rose-400 hover:text-rose-600 font-bold px-1 rounded hover:bg-rose-100/50 transition-colors shrink-0"
                  title="Dismiss error message"
                >
                  ✕
                </button>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 px-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer font-display"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Lock Routine Block</span>
            </button>
          </form>
        </div>
      </div>

      {/* Google Calendar Edit Details Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in pointer-events-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col animate-scale-up">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></span>
                <h3 className="text-sm font-bold text-slate-850 font-display">Edit Calendar Block</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 hover:bg-slate-100 rounded-full transition-all text-xs"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveEditedItem} className="p-6 space-y-4">
              {/* Title input */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                  placeholder="Event or Task Title"
                />
              </div>

              {/* Start & End Times */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Start Time</label>
                  <select
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white font-mono transition-all cursor-pointer"
                  >
                    {generateTimeOptions(wakeHour, 24).slice(0, -1).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">End Time</label>
                  <select
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white font-mono transition-all cursor-pointer"
                  >
                    {(() => {
                      const startMins = timeToMinutes(editStartTime);
                      return generateTimeOptions(wakeHour, 24)
                        .filter(opt => timeToMinutes(opt) > startMins)
                        .map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ));
                    })()}
                  </select>
                </div>
              </div>

              {/* Type-specific inputs */}
              {selectedItem.type === 'event' && (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Event Type</label>
                  <select
                    value={editTypeSpecific}
                    onChange={(e) => setEditTypeSpecific(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
                  >
                    <option value="meeting">Meeting (Social / Social Drain)</option>
                    <option value="routine">Routine Hold (Habit block)</option>
                    <option value="task">Focus Block Task</option>
                  </select>
                </div>
              )}

              {selectedItem.type === 'task' && (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Focus Category</label>
                  <select
                    value={editTypeSpecific}
                    onChange={(e) => setEditTypeSpecific(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
                  >
                    <option value="Work">💼 Work / Professional</option>
                    <option value="Personal">🏡 Personal / Admin</option>
                    <option value="Health">💪 Health / Fitness</option>
                    <option value="Leisure">🎮 Leisure / Hobby</option>
                  </select>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirmItem(selectedItem);
                  }}
                  className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Block</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedItem(null)}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Confirmation Dialog */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in pointer-events-auto">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-100 p-6 flex flex-col animate-scale-up gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-50 rounded-xl text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1 text-left">
                <h3 className="text-sm font-bold text-slate-850 font-display">
                  {deleteConfirmItem.type.startsWith('suggested-') ? 'Dismiss suggestion?' : 'Delete calendar block?'}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed font-sans">
                  {deleteConfirmItem.type.startsWith('suggested-') ? (
                    <span>Are you sure you want to dismiss the suggestion <strong className="text-slate-700">"{deleteConfirmItem.title}"</strong>?</span>
                  ) : (
                    <span>Are you sure you want to permanently delete <strong className="text-slate-700">"{deleteConfirmItem.title}"</strong>? This action cannot be undone.</span>
                  )}
                </p>
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-50">
              <button
                type="button"
                onClick={() => setDeleteConfirmItem(null)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold transition-all cursor-pointer font-sans"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const { id, type } = deleteConfirmItem;
                  if (type === 'task') handleDeleteTask(id.replace('t-', ''));
                  else if (type === 'event') handleDeleteEvent(id.replace('e-', ''));
                  else if (type === 'fixed') handleDeleteFixedTask(id.replace('f-', ''));
                  else if (type === 'suggested-rest') {
                    setDismissedRestHours(prev => {
                      const updated = [...prev, deleteConfirmItem.hour];
                      localStorage.setItem('flow_dismissed_rest_hours', JSON.stringify(updated));
                      return updated;
                    });
                  } else if (type === 'suggested-gym') {
                    setDismissedGymHours(prev => {
                      const updated = [...prev, deleteConfirmItem.hour];
                      localStorage.setItem('flow_dismissed_gym_hours', JSON.stringify(updated));
                      return updated;
                    });
                  }
                  
                  setDeleteConfirmItem(null);
                  if (selectedItem && selectedItem.id === id) {
                    setSelectedItem(null);
                  }
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer font-sans"
              >
                {deleteConfirmItem.type.startsWith('suggested-') ? 'Dismiss' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expanded Full Screen Calendar Modal */}
      {isExpandedModalOpen && (
        <div className="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 md:p-6">
          <div className="bg-slate-50 w-full h-full max-w-7xl max-h-[92vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200/80 animate-fade-in relative text-slate-800">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-white border-b border-slate-200/80 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-850 font-display flex items-center gap-2">
                    Full-Day Flow Visualizer
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">No Scrolling View</span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Whole day representation automatically adjusted to fit your viewport without scrolling.</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {/* Calendar details badge */}
                <div className="hidden sm:flex items-center pl-4 border-l border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                    {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                </div>
                
                <button
                  type="button"
                  onClick={() => setIsExpandedModalOpen(false)}
                  className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer flex items-center justify-center"
                  title="Close Full Screen"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Calendar Area */}
            <div className="flex-1 p-6 flex flex-col min-h-0 bg-slate-50/50">
              <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col p-5 min-h-0 relative">
                
                {/* Hour-by-hour single screen layout (non-scrollable!) */}
                <div className="flex-1 relative w-full h-full min-h-0 select-none" id="expanded-calendar-grid-container">
                  
                  {/* Background Grid */}
                  <div className="absolute inset-x-0 top-0 bottom-0 flex flex-col">
                    {dynamicHours.map((hour) => {
                      const energy = getCalibratedEnergy ? getCalibratedEnergy(hour) : getEnergyForHour(hour);
                      const isSimulatedTime = hour === simulatedHour;
                      const energyStyle = getEnergyColor(hour);
                      
                      const isSchedulingThisHour = schedulingTime && parseInt(schedulingTime.split(':')[0], 10) === hour;

                      return (
                        <div
                          key={hour}
                          style={{ height: `${100 / 15}%` }}
                          className={`flex items-stretch border-b border-slate-100 relative group/row ${
                            isSimulatedTime ? 'bg-blue-50/10' : ''
                          }`}
                        >
                          {/* Hour Indicator */}
                          <div className="w-14 sm:w-16 text-right pr-3 sm:pr-4 text-[9px] sm:text-[10px] font-mono font-bold text-slate-400 select-none border-r border-slate-150 flex flex-col justify-center shrink-0 bg-slate-50/40">
                            <span>{hour.toString().padStart(2, '0')}:00</span>
                            {isSimulatedTime && (
                              <span className="text-[7px] text-red-500 font-black tracking-wider uppercase mt-0.5">NOW</span>
                            )}
                          </div>

                          {/* Energy Score Bubble */}
                          <div className="flex items-center px-2 sm:px-3 shrink-0 border-r border-slate-100 bg-slate-50/10">
                            <div className={`w-14 sm:w-16 rounded-md py-0.5 border flex flex-col items-center justify-center text-center leading-none ${energyStyle}`} title="Energy Level">
                              <span className="text-[9px] font-bold">⚡{energy}%</span>
                            </div>
                          </div>

                          {/* Clickable Area split into top and bottom half hour */}
                          <div className="flex-1 relative flex flex-col h-full justify-between">
                            {isSchedulingThisHour ? (
                              <div className="absolute inset-y-0.5 inset-x-1 sm:inset-x-2 z-30 flex items-center">
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    if (quickTaskTitle.trim() && quickTaskTitle !== 'Listening...' && schedulingTime) {
                                      onScheduleTaskAtHour(quickTaskTitle.trim(), schedulingTime);
                                      setSchedulingTime(null);
                                      setQuickTaskTitle('');
                                    }
                                  }}
                                  className="flex items-center gap-1.5 w-full h-full bg-blue-50/95 border border-blue-300 rounded-lg px-2 py-0.5 shadow-md"
                                >
                                  <input
                                    type="text"
                                    autoFocus
                                    placeholder="Task title..."
                                    value={quickTaskTitle}
                                    onChange={(e) => setQuickTaskTitle(e.target.value)}
                                    className="flex-1 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xxs font-medium text-slate-700 focus:outline-none"
                                  />
                                  <button
                                    type="submit"
                                    className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold shrink-0 cursor-pointer"
                                  >
                                    Add
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSchedulingTime(null);
                                      setQuickTaskTitle('');
                                    }}
                                    className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[10px] font-medium shrink-0 cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </form>
                              </div>
                            ) : (
                              <div className="h-full w-full flex flex-col">
                                {/* Top half hour block */}
                                <button
                                  onClick={() => {
                                    setSchedulingTime(`${hour.toString().padStart(2, '0')}:00`);
                                    setQuickTaskTitle('');
                                  }}
                                  className="h-1/2 w-full text-left flex items-center px-2 sm:px-3 text-slate-400 text-[9px] hover:bg-slate-50/80 transition-colors group cursor-pointer border-b border-dashed border-slate-100/40"
                                >
                                  <span className="opacity-0 group-hover/row:opacity-100 text-slate-400 font-medium transition-opacity flex items-center gap-1">
                                    <Plus className="w-2.5 h-2.5 text-slate-400" />
                                    {hour.toString().padStart(2, '0')}:00
                                  </span>
                                </button>

                                {/* Bottom half hour block */}
                                <button
                                  onClick={() => {
                                    setSchedulingTime(`${hour.toString().padStart(2, '0')}:30`);
                                    setQuickTaskTitle('');
                                  }}
                                  className="h-1/2 w-full text-left flex items-center px-2 sm:px-3 text-slate-400 text-[9px] hover:bg-slate-50/80 transition-colors group cursor-pointer"
                                >
                                  <span className="opacity-0 group-hover/row:opacity-100 text-slate-400 font-medium transition-opacity flex items-center gap-1">
                                    <Plus className="w-2.5 h-2.5 text-slate-400" />
                                    {hour.toString().padStart(2, '0')}:30
                                  </span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Absolute overlays for calendar blocks */}
                  <div className="absolute inset-y-0 right-0 pointer-events-none" style={{ left: '136px' }}>
                    {layoutItems.map((item) => {
                      const isFixed = item.type === 'fixed';
                      const isEvent = item.type === 'event';
                      const isTask = item.type === 'task';

                      const category = isTask
                        ? classifyActivity(item.title, item.originalItem.description)
                        : classifyActivity(item.title);
                      const catStyles = getCategoryStyles(category);

                      const isIcal = isFixed && item.originalItem.id.startsWith('f-ical-');

                      // Duration of block in minutes
                      const durationMins = item.endMin - item.startMin;
                      const topPercent = ((item.startMin - calendarStartMin) / 900) * 100;
                      const heightPercent = (durationMins / 900) * 100;

                      // In a super compact view, we adjust styling
                      const isVeryCompact = durationMins <= 30;

                      return (
                        <div
                          key={item.id}
                          onClick={() => setSelectedItem(item)}
                          className="absolute pointer-events-auto cursor-pointer hover:scale-[1.01] transition-transform duration-100"
                          style={{
                            top: `${topPercent}%`,
                            height: `${heightPercent}%`,
                            left: `${item.left}%`,
                            width: `${item.width}%`,
                            padding: '1.5px'
                          }}
                        >
                          <div className={`px-2 rounded-lg border-l-[3px] border font-sans flex flex-col justify-center h-full shadow-2xs relative hover:shadow transition-all ${
                            category !== 'Routine/Buffer'
                              ? `${catStyles.bg} ${catStyles.border} ${catStyles.text}`
                              : isFixed && isIcal
                                ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                : isEvent && item.originalItem.type === 'meeting'
                                  ? 'bg-rose-50 border-rose-300 text-rose-700'
                                  : isEvent && item.originalItem.type === 'routine'
                                    ? 'bg-slate-50 border-slate-300 text-slate-600'
                                    : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                          }`} title={`${item.title} (${item.startTime} - ${item.endTime})`}>
                            
                            {isVeryCompact ? (
                              <div className="flex items-center justify-between text-[9px] font-bold truncate leading-tight">
                                <span className="truncate flex items-center gap-1">
                                  {isFixed && <Lock className="w-2 h-2 shrink-0 text-slate-400" />}
                                  {item.title}
                                </span>
                                <span className="text-[8px] opacity-75 font-mono shrink-0 ml-1">
                                  {item.startTime}
                                </span>
                              </div>
                            ) : (
                              <div className="flex flex-col h-full justify-center">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold truncate flex items-center gap-1 leading-tight">
                                    {isFixed && <Lock className="w-2.5 h-2.5 shrink-0 text-slate-400" />}
                                    {item.title}
                                  </span>
                                  <span className="text-[8px] opacity-75 font-mono shrink-0 ml-1">
                                    {item.startTime} - {item.endTime}
                                  </span>
                                </div>
                                {durationMins > 45 && item.originalItem?.description && (
                                  <p className="text-[8px] opacity-80 mt-0.5 truncate leading-normal">
                                    {item.originalItem.description}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                </div>

              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
