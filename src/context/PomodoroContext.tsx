import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

type SessionType = 'focus' | 'short_break' | 'long_break';
type SubjectKey = string;

interface PomodoroSettings {
  id?: string;
  focus_minutes: number;
  short_break_minutes: number;
  long_break_minutes: number;
  sessions_before_long: number;
}

interface LiveSnapshot {
  endsAt: number | null;
  timeLeft: number;
  isRunning: boolean;
  sessionType: SessionType;
  completedFocus: number;
  updatedAt: number;
}

interface PomodoroContextValue {
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

const PomodoroContext = createContext<PomodoroContextValue | null>(null);

const LIVE_KEY = 'epicure:pomodoro-live';
const CHANNEL = 'epicure-pomodoro';
const ROOM = 'default';
const API = `/api/public/pomodoro-live?room=${ROOM}`;
const POLL_MS = 1200;

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

async function fetchRemote(): Promise<LiveSnapshot | null> {
  try {
    const res = await fetch(API, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { snapshot?: LiveSnapshot | null };
    return data.snapshot ?? null;
  } catch {
    return null;
  }
}

async function pushRemote(snap: LiveSnapshot) {
  try {
    await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snap),
    });
  } catch { /* offline — local/tab sync still works */ }
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

  const endsAtRef = useRef<number | null>(null);
  const completingRef = useRef(false);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const selfWriteRef = useRef(false);
  const lastRemoteAtRef = useRef(0);
  const timeLeftRef = useRef(timeLeft);
  const sessionTypeRef = useRef(sessionType);
  const completedFocusRef = useRef(completedFocus);
  timeLeftRef.current = timeLeft;
  sessionTypeRef.current = sessionType;
  completedFocusRef.current = completedFocus;

  const getDuration = useCallback((type: SessionType) => {
    if (!settings) {
      return type === 'focus' ? 25 * 60 : type === 'short_break' ? 5 * 60 : 15 * 60;
    }
    if (type === 'focus') return settings.focus_minutes * 60;
    if (type === 'short_break') return settings.short_break_minutes * 60;
    return settings.long_break_minutes * 60;
  }, [settings]);

  const publish = useCallback((partial?: Partial<LiveSnapshot>) => {
    const snap: LiveSnapshot = {
      endsAt: endsAtRef.current,
      timeLeft: partial?.timeLeft ?? remainingFromEndsAt(endsAtRef.current, timeLeftRef.current),
      isRunning: partial?.isRunning ?? (endsAtRef.current != null),
      sessionType: partial?.sessionType ?? sessionTypeRef.current,
      completedFocus: partial?.completedFocus ?? completedFocusRef.current,
      updatedAt: Date.now(),
      ...partial,
    };
    if (partial?.endsAt !== undefined) snap.endsAt = partial.endsAt;
    if (partial?.isRunning !== undefined) snap.isRunning = partial.isRunning;
    if (partial?.timeLeft !== undefined) snap.timeLeft = partial.timeLeft;

    selfWriteRef.current = true;
    writeLive(snap);
    try {
      bcRef.current?.postMessage(snap);
    } catch { /* ignore */ }
    void pushRemote(snap);
    lastRemoteAtRef.current = snap.updatedAt;
    queueMicrotask(() => { selfWriteRef.current = false; });
  }, []);

  const applyRemote = useCallback((snap: LiveSnapshot) => {
    if (!snap || typeof snap.updatedAt !== 'number') return;
    if (snap.updatedAt <= lastRemoteAtRef.current) return;
    lastRemoteAtRef.current = snap.updatedAt;
    endsAtRef.current = snap.endsAt;
    setSessionType(snap.sessionType);
    setCompletedFocus(snap.completedFocus);
    setIsRunning(!!snap.isRunning && snap.endsAt != null);
    const left = snap.isRunning && snap.endsAt != null
      ? remainingFromEndsAt(snap.endsAt, snap.timeLeft)
      : snap.timeLeft;
    setTimeLeft(left);
  }, []);

  useEffect(() => {
    const existing = readLive();
    if (existing) {
      if (existing.isRunning && existing.endsAt && existing.endsAt > Date.now()) {
        applyRemote(existing);
      } else if (!existing.isRunning && existing.timeLeft > 0) {
        applyRemote({ ...existing, isRunning: false, endsAt: null });
      }
    }

    void fetchRemote().then((remote) => {
      if (remote) applyRemote(remote);
    });

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = (ev) => {
        if (selfWriteRef.current) return;
        const snap = ev.data as LiveSnapshot;
        applyRemote(snap);
        writeLive(snap);
      };
      bcRef.current = bc;
    } catch { /* BroadcastChannel unavailable */ }

    const onStorage = (e: StorageEvent) => {
      if (e.key !== LIVE_KEY || !e.newValue || selfWriteRef.current) return;
      try {
        applyRemote(JSON.parse(e.newValue) as LiveSnapshot);
      } catch { /* ignore */ }
    };
    window.addEventListener('storage', onStorage);

    let pollId: ReturnType<typeof setInterval> | null = null;
    const startPoll = () => {
      if (pollId) return;
      pollId = setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        void fetchRemote().then((remote) => {
          if (remote) applyRemote(remote);
        });
      }, POLL_MS);
    };
    const stopPoll = () => {
      if (pollId) { clearInterval(pollId); pollId = null; }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void fetchRemote().then((remote) => {
          if (remote) applyRemote(remote);
        });
        startPoll();
      } else {
        stopPoll();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    startPoll();

    return () => {
      stopPoll();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('storage', onStorage);
      bc?.close();
      bcRef.current = null;
    };
  }, [applyRemote]);

  useEffect(() => {
    supabase.from('pomodoro_settings').select('*').maybeSingle().then(({ data }) => {
      if (data) {
        setSettings(data as PomodoroSettings);
        setTimeLeft(((data as PomodoroSettings).focus_minutes || 25) * 60);
      } else {
        supabase.from('pomodoro_settings').insert({
          focus_minutes: 25,
          short_break_minutes: 5,
          long_break_minutes: 15,
          sessions_before_long: 4,
        }).then(({ data: created }) => {
          if (created) setSettings(created as PomodoroSettings);
          else setSettings({
            focus_minutes: 25,
            short_break_minutes: 5,
            long_break_minutes: 15,
            sessions_before_long: 4,
          });
        });
      }
    });
  }, []);

  const handleComplete = useCallback(() => {
    if (completingRef.current) return;
    completingRef.current = true;
    endsAtRef.current = null;
    setIsRunning(false);
    setLastCompletedAt(new Date().toISOString());

    if (sessionTypeRef.current === 'focus') {
      const newCount = completedFocusRef.current + 1;
      setCompletedFocus(newCount);
      const beforeLong = settings?.sessions_before_long ?? 4;
      const nextType: SessionType = newCount % beforeLong === 0 ? 'long_break' : 'short_break';
      const nextLeft = getDuration(nextType);
      setSessionType(nextType);
      setTimeLeft(nextLeft);
      publish({
        endsAt: null,
        isRunning: false,
        timeLeft: nextLeft,
        sessionType: nextType,
        completedFocus: newCount,
      });
    } else {
      const nextLeft = getDuration('focus');
      setSessionType('focus');
      setTimeLeft(nextLeft);
      publish({ endsAt: null, isRunning: false, timeLeft: nextLeft, sessionType: 'focus' });
    }
    queueMicrotask(() => { completingRef.current = false; });
  }, [getDuration, publish, settings]);

  useEffect(() => {
    if (!isRunning || endsAtRef.current == null) return;
    const tick = () => {
      const left = remainingFromEndsAt(endsAtRef.current, 0);
      setTimeLeft(left);
      if (left <= 0) handleComplete();
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [isRunning, handleComplete]);

  const start = useCallback(() => {
    const left = timeLeftRef.current > 0 ? timeLeftRef.current : getDuration(sessionTypeRef.current);
    const endsAt = Date.now() + left * 1000;
    endsAtRef.current = endsAt;
    setTimeLeft(left);
    setIsRunning(true);
    publish({ endsAt, isRunning: true, timeLeft: left, sessionType: sessionTypeRef.current });
  }, [getDuration, publish]);

  const pause = useCallback(() => {
    const left = remainingFromEndsAt(endsAtRef.current, timeLeftRef.current);
    endsAtRef.current = null;
    setTimeLeft(left);
    setIsRunning(false);
    publish({ endsAt: null, isRunning: false, timeLeft: left, sessionType: sessionTypeRef.current });
  }, [publish]);

  const reset = useCallback(() => {
    endsAtRef.current = null;
    const left = getDuration(sessionTypeRef.current);
    setIsRunning(false);
    setTimeLeft(left);
    publish({ endsAt: null, isRunning: false, timeLeft: left, sessionType: sessionTypeRef.current });
  }, [getDuration, publish]);

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
    setSettings((current) => (current ? { ...current, ...updates } : current));
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
