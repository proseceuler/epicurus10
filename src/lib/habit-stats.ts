import type { Habit, HabitCompletion } from '@/lib/types';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayIso() {
  return isoDate(new Date());
}

export function addDays(dateStr: string, n: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function weekdayIdx(dateStr: string) {
  const dow = new Date(`${dateStr}T00:00:00`).getDay();
  return dow === 0 ? 6 : dow - 1;
}

export interface DayCell {
  day: number;
  dateStr: string;
  weekdayIdx: number;
  weekNum: number;
}

export function monthDays(year: number, month: number): DayCell[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const firstWeekdayIdx = firstDow === 0 ? 6 : firstDow - 1;
  const out: DayCell[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    out.push({
      day: d,
      dateStr,
      weekdayIdx: weekdayIdx(dateStr),
      weekNum: Math.floor((firstWeekdayIdx + d - 1) / 7),
    });
  }
  return out;
}

export function doneSet(completions: HabitCompletion[]) {
  const set = new Set<string>();
  for (const c of completions) set.add(`${c.habit_id}|${c.completion_date}`);
  return set;
}

export function isDone(set: Set<string>, habitId: string, dateStr: string) {
  return set.has(`${habitId}|${dateStr}`);
}

export function dateRange(from: string, to: string) {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function lastNDays(n: number, end = todayIso()) {
  return dateRange(addDays(end, -(n - 1)), end);
}

export function weekStartMonday(dateStr: string) {
  return addDays(dateStr, -weekdayIdx(dateStr));
}

export function pearson(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += a[i]; sy += b[i];
    sxx += a[i] * a[i]; syy += b[i] * b[i];
    sxy += a[i] * b[i];
  }
  const num = n * sxy - sx * sy;
  const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  if (!den) return 0;
  return Math.max(-1, Math.min(1, num / den));
}

export function greyFill(t: number) {
  const x = Math.max(0, Math.min(1, t));
  const a = 0.08 + x * 0.82;
  return `rgba(255,255,255,${a.toFixed(3)})`;
}

export function lifetimePct(habits: Habit[], completions: HabitCompletion[]) {
  if (!habits.length) return 0;
  const dates = completions.map((c) => c.completion_date).sort();
  const start = dates[0] || todayIso();
  const days = Math.max(1, dateRange(start, todayIso()).length);
  const possible = habits.length * days;
  return Math.min(100, (completions.length / possible) * 100);
}
