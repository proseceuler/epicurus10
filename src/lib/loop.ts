/** Daily rings + single streak with a weekly freeze. */

import { todayIso } from '@/lib/xp';

export type RingId = 'floor' | 'focus' | 'school';

export type DayRings = { floor: boolean; focus: boolean; school: boolean };

export type LoopState = {
  days: Record<string, DayRings>;
  streak: number;
  lastActive: string | null;
  freezeReady: boolean;
  freezeSpentWeek: string | null;
  paused: boolean;
};

const KEY = 'epicure:loop:v1';
export const LOOP_CHANGED = 'epicure-loop-changed';

const EMPTY: DayRings = { floor: false, focus: false, school: false };

function isBrowser() {
  return typeof window !== 'undefined';
}

export function mondayIso(iso = todayIso()) {
  const d = new Date(`${iso}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return todayIso(d);
}

function load(): LoopState {
  if (!isBrowser()) {
    return { days: {}, streak: 0, lastActive: null, freezeReady: false, freezeSpentWeek: null, paused: false };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as LoopState;
      return {
        days: p.days && typeof p.days === 'object' ? p.days : {},
        streak: Math.max(0, Math.floor(Number(p.streak) || 0)),
        lastActive: typeof p.lastActive === 'string' ? p.lastActive : null,
        freezeReady: !!p.freezeReady,
        freezeSpentWeek: typeof p.freezeSpentWeek === 'string' ? p.freezeSpentWeek : null,
        paused: !!p.paused,
      };
    }
  } catch {
    /* ignore */
  }
  return { days: {}, streak: 0, lastActive: null, freezeReady: false, freezeSpentWeek: null, paused: false };
}

function save(state: LoopState) {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(LOOP_CHANGED));
}

export function getLoop(): LoopState {
  return reconcile(load());
}

function prevIso(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return todayIso(d);
}

function counted(day: DayRings | undefined) {
  return !!(day && (day.floor || day.focus || day.school));
}

function reconcile(state: LoopState): LoopState {
  const today = todayIso();
  const week = mondayIso(today);
  if (state.freezeSpentWeek && state.freezeSpentWeek !== week) {
    state = { ...state, freezeSpentWeek: null };
  }

  const weekDays: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(`${week}T12:00:00`);
    d.setDate(d.getDate() + i);
    const iso = todayIso(d);
    if (iso > today) break;
    weekDays.push(iso);
  }
  const countedThisWeek = weekDays.filter((iso) => iso !== today && counted(state.days[iso])).length;
  if (!state.freezeReady && state.freezeSpentWeek !== week && countedThisWeek >= 5) {
    state = { ...state, freezeReady: true };
  }

  if (!state.lastActive) return state;
  if (state.lastActive >= today) return { ...state, paused: false };

  let cursor = state.lastActive;
  let streak = state.streak;
  let freezeReady = state.freezeReady;
  let freezeSpentWeek = state.freezeSpentWeek;
  let paused = state.paused;

  while (cursor < prevIso(today)) {
    const next = (() => {
      const d = new Date(`${cursor}T12:00:00`);
      d.setDate(d.getDate() + 1);
      return todayIso(d);
    })();
    if (counted(state.days[next])) {
      cursor = next;
      continue;
    }
    const nextWeek = mondayIso(next);
    if (freezeReady && freezeSpentWeek !== nextWeek) {
      freezeReady = false;
      freezeSpentWeek = nextWeek;
      cursor = next;
      continue;
    }
    streak = 0;
    paused = true;
    cursor = next;
  }

  if (cursor < today && !counted(state.days[today])) {
    const y = prevIso(today);
    if (cursor < y && !counted(state.days[y])) {
      const yWeek = mondayIso(y);
      if (freezeReady && freezeSpentWeek !== yWeek) {
        freezeReady = false;
        freezeSpentWeek = yWeek;
        cursor = y;
        paused = false;
      } else if (cursor < y) {
        streak = 0;
        paused = true;
      }
    }
  }

  const nextState = { ...state, streak, lastActive: cursor, freezeReady, freezeSpentWeek, paused };
  save(nextState);
  return nextState;
}

export function closeRing(ring: RingId, date = todayIso()): { state: LoopState; first: boolean; dayComplete: boolean } {
  const state = reconcile(load());
  const day = { ...(state.days[date] || EMPTY) };
  const first = !day[ring];
  day[ring] = true;
  const days = { ...state.days, [date]: day };
  let streak = state.streak;
  let lastActive = state.lastActive;
  let paused = state.paused;
  if (date === todayIso() && counted(day) && lastActive !== date) {
    if (lastActive === prevIso(date) || !lastActive) streak = (lastActive ? streak : 0) + 1;
    else streak = streak > 0 && lastActive === prevIso(date) ? streak + 1 : 1;
    lastActive = date;
    paused = false;
  }
  const next = { ...state, days, streak, lastActive, paused };
  save(next);
  const d = next.days[date];
  return { state: next, first, dayComplete: !!(d.floor && d.focus && d.school) };
}

export function ringsFor(date = todayIso()): DayRings {
  return getLoop().days[date] || EMPTY;
}

export function weekMarks(state = getLoop()): boolean[] {
  const week = mondayIso();
  const today = todayIso();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${week}T12:00:00`);
    d.setDate(d.getDate() + i);
    const iso = todayIso(d);
    if (iso > today) return false;
    return counted(state.days[iso]);
  });
}

export function ringForType(type: string): RingId | null {
  if (type === 'focus_session') return 'focus';
  if (type === 'grade_log' || type === 'class_attend') return 'school';
  if (
    type === 'habit_complete' ||
    type === 'todo_complete' ||
    type === 'flashcard_review' ||
    type === 'kanban_done' ||
    type === 'class_attend'
  ) {
    return 'floor';
  }
  return null;
}
