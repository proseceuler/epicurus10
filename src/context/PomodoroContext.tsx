import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { PomodoroSettings, SubjectKey } from '@/lib/types';

type SessionType = 'focus' | 'short_break' | 'long_break';

interface PomodoroState {
  isRunning: boolean;
  timeLeft: number;
  sessionType: SessionType;
  settings: PomodoroSettings | null;
  dockOpen: boolean;
  isFloating: boolean;
  completedFocus: number;
  activeSubject: SubjectKey | null;
  linkedTodoId: string | null;
  lastCompletedAt: string | null;
  setSessionContext: (subject: SubjectKey | null, todoId: string | null) => void;
  updateSettings: (updates: Partial<PomodoroSettings>) => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
  switchType: (type: SessionType) => void;
  setDockOpen: (open: boolean) => void;
  snapBack: () => void;
  floatAway: () => void;
  getDuration: (type: SessionType) => number;
}

/** Live timer snapshot shared across tabs / same-origin windows. */
interface LiveSnapshot {
  endsAt: number | null;
  timeLeft: number;
  isRunning: boolean;
  sessionType: SessionType;
  completedFocus: number;
  updatedAt: number;
}

const LIVE_KEY = 'epicure:pomodoro-live';
const CHANNEL = 'epicure-pomodoro';

const PomodoroContext = createContext<PomodoroState | undefined>(undefined);

function readLive(): LiveSnapshot | null {
  try {
    const raw = localStorage.getItem(LIVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LiveSnapshot;
  } catch {
    return null;
  }
}

function writeLive(snap: LiveSnapshot) {
  try {
    localStorage.setItem(LIVE_KEY, JSON.stringify(snap));
  } catch { /* ignore */ }
}

function remainingFromEndsAt(endsAt: number | null, fallback: number): number {
  if (endsAt == null) return fallback;
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}

export function PomodoroProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PomodoroSettings | null>(null);
  const [sessionType, setSessionType] = useState<SessionType>('focus');
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [completedFocus, setCompletedFocus] = useState(0);
  const [activeSubject, setActiveSubject] = useState<SubjectKey | null>(null);
  const [linkedTodoId, setLinkedTodoId] = useState<string | null>(null);
  const [lastCompletedAt, setLastCompletedAt] = useState<string | null>(null);
  const [dockOpen, setDockOpen] = useState(false);
  const [isFloating, setIsFloating] = useState(false);

  /** Authoritative end timestamp while running; null when paused/idle. */
  const endsAtRef = useRef<number | null>(null);
  const completingRef = useRef(false);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const selfWriteRef = useRef(false);

  const publish = useCallback((partial?: Partial<LiveSnapshot>) => {
    const snap: LiveSnapshot = {
      endsAt: endsAtRef.current,
      timeLeft: partial?.timeLeft ?? remainingFromEndsAt(endsAtRef.current, timeLeft),
      isRunning: partial?.isRunning ?? (endsAtRef.current != null),
      sessionType: partial?.sessionType ?? sessionType,
      completedFocus: partial?.completedFocus ?? completedFocus,
      updatedAt: Date.now(),
      ...partial,
    };
    selfWriteRef.current = true;
    writeLive(snap);
    try {
      bcRef.current?.postMessage(snap);
    } catch { /* ignore */ }
    queueMicrotask(() => { selfWriteRef.current = false; });
  }, [timeLeft, sessionType, completedFocus]);

  const applyRemote = useCallback((snap: LiveSnapshot) => {
    if (!snap || typeof snap.updatedAt !== 'number') return;
    endsAtRef.current = snap.endsAt;
    setSessionType(snap.sessionType);
    setCompletedFocus(snap.completedFocus);
    setIsRunning(!!snap.isRunning && snap.endsAt != null);
    const left = snap.isRunning && snap.endsAt != null
      ? remainingFromEndsAt(snap.endsAt, snap.timeLeft)
      : snap.timeLeft;
    setTimeLeft(left);
  }, []);

  // Restore live state on mount + subscribe to other tabs
  useEffect(() => {
    const existing = readLive();
    if (existing) {
      if (existing.isRunning && existing.endsAt && existing.endsAt > Date.now()) {
        applyRemote(existing);
      } else if (!existing.isRunning && existing.timeLeft > 0) {
        applyRemote({ ...existing, isRunning: false, endsAt: null });
      }
    }

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(CHANNEL);
      bcRef.current = bc;
      bc.onmessage = (ev) => {
        if (selfWriteRef.current) return;
        if (ev.data && typeof ev.data === 'object') applyRemote(ev.data as LiveSnapshot);
      };
    } catch { /* BroadcastChannel unavailable */ }

    const onStorage = (e: StorageEvent) => {
      if (e.key !== LIVE_KEY || !e.newValue || selfWriteRef.current) return;
      try {
        applyRemote(JSON.parse(e.newValue) as LiveSnapshot);
      } catch { /* ignore */ }
    };
    window.addEventListener('storage', onStorage);

    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      const live = readLive();
      if (live) applyRemote(live);
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVis);
      try { bc?.close(); } catch { /* ignore */ }
      bcRef.current = null;
    };
  }, [applyRemote]);

  useEffect(() => {
    supabase.from('pomodoro_settings').select('*').maybeSingle().then(({ data }) => {
      if (data) {
        setSettings(data as PomodoroSettings);
        const live = readLive();
        if (!live?.isRunning) {
          setTimeLeft((data as PomodoroSettings).focus_duration * 60);
        }
      } else {
        supabase.from('pomodoro_settings').insert({
          focus_duration: 25, short_break_duration: 5, long_break_duration: 15, sessions_before_long_break: 4,
          ambient_volume: 0.5, ambient_type: 'rain',
        }).select().single().then(({ data: created }) => {
          if (created) {
            setSettings(created as PomodoroSettings);
            const live = readLive();
            if (!live?.isRunning) setTimeLeft(25 * 60);
          }
        });
      }
    });
  }, []);

  const getDuration = useCallback((type: SessionType): number => {
    if (!settings) return 25 * 60;
    if (type === 'focus') return settings.focus_duration * 60;
    if (type === 'short_break') return settings.short_break_duration * 60;
    return settings.long_break_duration * 60;
  }, [settings]);

  const handleComplete = useCallback(async () => {
    if (completingRef.current) return;
    completingRef.current = true;
    endsAtRef.current = null;
    setIsRunning(false);

    try {
      if (sessionType === 'focus') {
        const newCount = completedFocus + 1;
        setCompletedFocus(newCount);
        await supabase.from('pomodoro_sessions').insert({
          subject_key: activeSubject,
          linked_todo_id: linkedTodoId,
          duration_minutes: settings?.focus_duration ?? 25,
          session_type: 'focus',
        });
        setLastCompletedAt(new Date().toISOString());
        const nextType: SessionType = newCount % (settings?.sessions_before_long_break ?? 4) === 0 ? 'long_break' : 'short_break';
        const nextLeft = getDuration(nextType);
        setSessionType(nextType);
        setTimeLeft(nextLeft);
        publish({ endsAt: null, isRunning: false, timeLeft: nextLeft, sessionType: nextType, completedFocus: newCount });
      } else {
        await supabase.from('pomodoro_sessions').insert({
          subject_key: activeSubject,
          linked_todo_id: linkedTodoId,
          duration_minutes: sessionType === 'short_break' ? settings?.short_break_duration ?? 5 : settings?.long_break_duration ?? 15,
          session_type: sessionType,
        });
        setLastCompletedAt(new Date().toISOString());
        const nextLeft = getDuration('focus');
        setSessionType('focus');
        setTimeLeft(nextLeft);
        publish({ endsAt: null, isRunning: false, timeLeft: nextLeft, sessionType: 'focus' });
      }
    } finally {
      completingRef.current = false;
    }
  }, [sessionType, completedFocus, settings, getDuration, activeSubject, linkedTodoId, publish]);

  // Tick from endsAt so every device/tab shows the same remaining time
  useEffect(() => {
    if (!isRunning || endsAtRef.current == null) return;
    const tick = () => {
      const left = remainingFromEndsAt(endsAtRef.current, 0);
      setTimeLeft(left);
      if (left <= 0) {
        handleComplete();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [isRunning, handleComplete]);

  const start = useCallback(() => {
    const left = timeLeft > 0 ? timeLeft : getDuration(sessionType);
    const endsAt = Date.now() + left * 1000;
    endsAtRef.current = endsAt;
    setTimeLeft(left);
    setIsRunning(true);
    publish({ endsAt, isRunning: true, timeLeft: left, sessionType });
  }, [timeLeft, sessionType, getDuration, publish]);

  const pause = useCallback(() => {
    const left = remainingFromEndsAt(endsAtRef.current, timeLeft);
    endsAtRef.current = null;
    setTimeLeft(left);
    setIsRunning(false);
    publish({ endsAt: null, isRunning: false, timeLeft: left, sessionType });
  }, [timeLeft, sessionType, publish]);

  const reset = useCallback(() => {
    endsAtRef.current = null;
    const left = getDuration(sessionType);
    setIsRunning(false);
    setTimeLeft(left);
    publish({ endsAt: null, isRunning: false, timeLeft: left, sessionType });
  }, [getDuration, sessionType, publish]);

  const switchType = useCallback((type: SessionType) => {
    endsAtRef.current = null;
    const left = getDuration(type);
    setIsRunning(false);
    setSessionType(type);
    setTimeLeft(left);
    publish({ endsAt: null, isRunning: false, timeLeft: left, sessionType: type });
  }, [getDuration, publish]);

  const setSessionContext = useCallback((subject: SubjectKey | null, todoId: string | null) => {
    setActiveSubject(subject);
    setLinkedTodoId(todoId);
  }, []);

  const updateSettings = useCallback((updates: Partial<PomodoroSettings>) => {
    setSettings((current) => current ? { ...current, ...updates } : current);
  }, []);

  const floatAway = useCallback(() => setIsFloating(true), []);
  const snapBack = useCallback(() => setIsFloating(false), []);

  return (
    <PomodoroContext.Provider value={{
      isRunning, timeLeft, sessionType, settings, dockOpen, isFloating, completedFocus,
      activeSubject, linkedTodoId, lastCompletedAt, setSessionContext, updateSettings,
      start, pause, reset, switchType, setDockOpen, snapBack, floatAway, getDuration,
    }}>
      {children}
    </PomodoroContext.Provider>
  );
}

export function usePomodoro() {
  const ctx = useContext(PomodoroContext);
  if (!ctx) throw new Error('usePomodoro must be used within PomodoroProvider');
  return ctx;
}
