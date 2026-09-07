import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  SUBJECTS,
  NUM_TERMS,
  type Assessment,
  type Todo,
  type PomodoroSession,
  type Habit,
  type HabitCompletion,
} from '@/lib/types';
import { computeFinalGrade, computeGeneralAverage, computeTermGrade } from '@/lib/gradeUtils';
import { Card, EmptyState, SubjectBadge, gradeColor } from '@/components/kit';
import type { PageId } from '@/components/AppLayout';
import { usePomodoro } from '@/context/PomodoroContext';
import { doneSet, isDone, monthDays, todayIso } from '@/lib/habit-stats';
import { Calendar, BookOpen, Flame, CheckSquare, Clock, Target } from 'lucide-react';

const SIGIL_KEY = 'epicure-ascii-sigil';

const DEFAULT_SIGIL = `
      .·:·.
    ·´     \`·
   /    ∧    \\
  |   /   \   |
  |   \   /   |
   \   \_/   /
    \`·.   .·´
       \`·´
`.trimEnd();

function computeStreak(sessions: PomodoroSession[]): number {
  const days = new Set(
    sessions
      .filter((s) => s.session_type === 'focus')
      .map((s) => new Date(s.completed_at).toDateString()),
  );
  if (days.size === 0) return 0;
  let streak = 0;
  const cursor = new Date();
  if (!days.has(cursor.toDateString())) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(cursor.toDateString())) return 0;
  }
  while (days.has(cursor.toDateString())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Consecutive days where every habit was completed. */
function computeHabitStreak(
  habits: { id: string }[],
  done: Set<string>,
): { current: number; best: number } {
  if (!habits.length) return { current: 0, best: 0 };
  const dayComplete = (dateStr: string) => habits.every((h) => done.has(`${h.id}|${dateStr}`));
  const iso = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  let best = 0;
  let run = 0;
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  // scan last 365 days for best + current
  for (let i = 0; i < 365; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() - i);
    if (dayComplete(iso(d))) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  // current: from today (or yesterday if today incomplete)
  let current = 0;
  const cursor = new Date(start);
  if (!dayComplete(iso(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!dayComplete(iso(cursor))) return { current: 0, best };
  }
  while (dayComplete(iso(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { current, best: Math.max(best, current) };
}

/** Official DepEd SY 2026–2027 term windows (Order No. 009, s. 2026). */
function termWeekProgress(term: number): { week: number; total: number; pct: number; label: string } {
  const now = new Date();
  // T1: Jun 8 – Sep 15, 2026 | T2: Sep 16 – Dec 18, 2026 | T3: Jan 4 – Apr 8, 2027
  const windows: Record<number, [Date, Date]> = {
    1: [new Date(2026, 5, 8), new Date(2026, 8, 15)],
    2: [new Date(2026, 8, 16), new Date(2026, 11, 18)],
    3: [new Date(2027, 0, 4), new Date(2027, 3, 8)],
  };
  const pair = windows[term] || windows[1];
  const start = pair[0];
  const end = pair[1];
  const totalMs = Math.max(1, end.getTime() - start.getTime());
  const elapsed = Math.min(totalMs, Math.max(0, now.getTime() - start.getTime()));
  const totalWeeks = Math.max(1, Math.round(totalMs / (7 * 86400000)));
  const week = Math.min(totalWeeks, Math.max(1, Math.floor(elapsed / (7 * 86400000)) + 1));
  const pct = Math.round((elapsed / totalMs) * 100);
  return { week, total: totalWeeks, pct, label: `Week ${week}/${totalWeeks}` };
}

function currentDepEdTerm(now = new Date()): number {
  const t = now.getTime();
  if (t < new Date(2026, 8, 16).getTime()) return 1; // before T2 start
  if (t < new Date(2027, 0, 4).getTime()) return 2;
  return 3;
}

function useMilitaryClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const dateLabel = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return { time: `${hh}:${mm}:${ss}`, dateLabel };
}

export default function DashboardPage({ navigate }: { navigate: (p: PageId) => void }) {
  const pomodoro = usePomodoro();
  const clock = useMilitaryClock();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [sessions, setSessions] = useState<PomodoroSession[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [sigil, setSigil] = useState(() => {
    try {
      return localStorage.getItem(SIGIL_KEY) || DEFAULT_SIGIL;
    } catch {
      return DEFAULT_SIGIL;
    }
  });
  const [editingSigil, setEditingSigil] = useState(false);
  const [awake, setAwake] = useState(false);

  const loadData = useCallback(async () => {
    const [
      { data: aData },
      { data: tData },
      { data: sData },
      { data: hData },
      { data: cData },
    ] = await Promise.all([
      supabase.from('assessments').select('*'),
      supabase.from('todos').select('*').order('created_at', { ascending: false }),
      supabase.from('pomodoro_sessions').select('*'),
      supabase.from('habits').select('*').order('created_at', { ascending: true }),
      supabase.from('habit_completions').select('*'),
    ]);
    if (aData) setAssessments(aData as Assessment[]);
    if (tData) setTodos(tData as Todo[]);
    if (sData) setSessions(sData as PomodoroSession[]);
    if (hData) setHabits(hData as Habit[]);
    if (cData) setCompletions(cData as HabitCompletion[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const generalAverage = computeGeneralAverage(assessments);
  const activeTodos = todos.filter((t) => !t.completed);
  const todayStr = new Date().toDateString();
  const todayFocus = sessions
    .filter((s) => s.session_type === 'focus' && new Date(s.completed_at).toDateString() === todayStr)
    .reduce((sum, s) => sum + s.duration_minutes, 0);
  const streak = useMemo(() => computeStreak(sessions), [sessions]);

  const upcomingTodos = activeTodos
    .filter((t) => t.due_date)
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
    .slice(0, 6);

  const deadlineCount = activeTodos.filter((t) => {
    if (!t.due_date) return false;
    const d = new Date(t.due_date + 'T00:00:00');
    const diff = Math.ceil((d.getTime() - Date.now()) / 86400000);
    return diff >= 0 && diff <= 7;
  }).length;

  const currentTerm = currentDepEdTerm();

  const done = useMemo(() => doneSet(completions), [completions]);
  const monthCells = useMemo(() => {
    const n = new Date();
    return monthDays(n.getFullYear(), n.getMonth());
  }, []);
  const monthDone = useMemo(
    () => habits.reduce((s, h) => s + monthCells.filter((d) => isDone(done, h.id, d.dateStr)).length, 0),
    [habits, monthCells, done],
  );
  const monthSlots = Math.max(1, habits.length * monthCells.length);
  const monthPct = habits.length ? (monthDone / monthSlots) * 100 : 0;
  const todayHabitDone = habits.filter((h) => isDone(done, h.id, todayIso())).length;
  const habitStreak = useMemo(() => computeHabitStreak(habits, done), [habits, done]);
  const termProg = useMemo(() => termWeekProgress(currentTerm), [currentTerm]);

  const weakSubjects = useMemo(() => {
    return SUBJECTS.map((s) => {
      const fg = computeFinalGrade(s.key, assessments);
      const tg = computeTermGrade(s.key, currentTerm, assessments);
      return { subject: s, fg, tg };
    })
      .filter((x) => x.fg !== null)
      .sort((a, b) => (a.fg ?? 100) - (b.fg ?? 100))
      .slice(0, 4);
  }, [assessments, currentTerm]);

  const gradedCount = useMemo(
    () => SUBJECTS.filter((s) => computeFinalGrade(s.key, assessments) !== null).length,
    [assessments],
  );

  const weekFocus = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return sessions
      .filter((s) => s.session_type === 'focus' && new Date(s.completed_at) >= start)
      .reduce((sum, s) => sum + s.duration_minutes, 0);
  }, [sessions]);

  useEffect(() => {
    if (pomodoro.isRunning || pomodoro.lastCompletedAt) {
      setAwake(true);
      const t = window.setTimeout(() => setAwake(false), 2200);
      return () => window.clearTimeout(t);
    }
  }, [pomodoro.isRunning, pomodoro.lastCompletedAt, streak]);

  const saveSigil = (value: string) => {
    const next = value.trim() || DEFAULT_SIGIL;
    setSigil(next);
    try {
      localStorage.setItem(SIGIL_KEY, next);
    } catch {
      /* ignore */
    }
    setEditingSigil(false);
  };

  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const gpa = generalAverage !== null ? generalAverage.toFixed(2) : '—';
  const focusLabel = `${Math.floor(todayFocus / 60)}h ${todayFocus % 60}m`;
  const weekFocusLabel = `${Math.floor(weekFocus / 60)}h ${weekFocus % 60}m`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="font-mono text-xs tracking-[0.3em] text-[#5c6168]">LOADING</span>
      </div>
    );
  }

  return (
    <div>
      <section className={`hud-hero mb-8 ${awake ? 'hud-awake' : ''}`}>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-14">
          <div className="min-w-0 flex-1">
            {editingSigil ? (
              <div>
                <textarea
                  defaultValue={sigil}
                  rows={10}
                  className="hud-sigil-frame w-full resize-y rounded-lg bg-transparent p-2 font-mono text-[11px] leading-[1.15] text-zinc-700 outline-none"
                  autoFocus
                  onBlur={(e) => saveSigil(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditingSigil(false);
                  }}
                />
                <p className="mt-1 font-mono text-[10px] text-[#5c6168]">click away to save · original glyph only</p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditingSigil(true)}
                title="Customize sigil"
                className="hud-sigil hud-sigil-frame block w-full text-left"
              >
                <pre className="select-none font-mono leading-[1.12] text-[clamp(10px,1.6vw,16px)]">{sigil}</pre>
              </button>
            )}
          </div>

          <div className="font-mono text-[12px] leading-6 text-zinc-600 lg:min-w-[300px] lg:pt-2">
            <div className="mb-3 flex items-baseline gap-3">
              <span className="text-3xl font-semibold tabular-nums tracking-tight text-zinc-900">{clock.time}</span>
              <span className="text-[11px] uppercase tracking-wider text-zinc-500">{clock.dateLabel}</span>
            </div>
            <p className="text-zinc-800">
              user<span className="text-zinc-500">@</span>
              {host}
            </p>
            <p className="text-zinc-400">{'─'.repeat(22)}</p>
            <StatRow label="OS" value="epicure 10.2" />
            <StatRow label="STREAK" value={`${streak}d`} />
            <StatRow label="TERM" value={`T${currentTerm} / ${NUM_TERMS}`} />
            <StatRow label="FOCUS" value={focusLabel} />
            <StatRow label="GPA" value={gpa} />
            <StatRow label="TASKS" value={`${activeTodos.length} open`} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate('grades')}
                className="font-mono text-[11px] tracking-wide text-zinc-600 hover:text-zinc-900"
              >
                → grades
              </button>
              <button
                type="button"
                onClick={() => navigate('habits')}
                className="font-mono text-[11px] tracking-wide text-zinc-600 hover:text-zinc-900"
              >
                → habits
              </button>
              <button
                type="button"
                onClick={() => navigate('todos')}
                className="font-mono text-[11px] tracking-wide text-zinc-600 hover:text-zinc-900"
              >
                → tasks
              </button>
            </div>
          </div>
        </div>
      </section>

            {/* Insight strip — no GPA/Baon duplicates */}
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <InsightTile
          icon={Flame}
          label="Streak"
          value={`${habitStreak.current}d`}
          hint={`Best: ${habitStreak.best}d`}
          onOpen={() => navigate('habits')}
        />
        <InsightTile
          icon={CheckSquare}
          label="Deadlines"
          value={String(deadlineCount)}
          hint="Due in the next 7 days"
          onOpen={() => navigate('todos')}
        />
        <InsightTile
          icon={Clock}
          label="Focus (7d)"
          value={weekFocusLabel}
          hint={`Today ${focusLabel}`}
          onOpen={() => navigate('pomodoro')}
        />
        <InsightTile
          icon={Target}
          label="Term progress"
          value={termProg.label}
          hint={`${termProg.pct}% through T${currentTerm}`}
          onOpen={() => navigate('grades')}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-800">Weak subjects</h3>
            <button type="button" onClick={() => navigate('grades')} className="text-xs text-zinc-500 hover:text-zinc-800">
              Grades →
            </button>
          </div>
          {weakSubjects.length === 0 ? (
            <EmptyState icon={BookOpen} title="No grades yet" subtitle="Add assessments to surface weak spots." />
          ) : (
            <div className="space-y-1">
              {weakSubjects.map(({ subject, fg, tg }) => (
                <button
                  key={subject.key}
                  type="button"
                  onClick={() => navigate('grades')}
                  className="group flex w-full items-center justify-between rounded-md px-1 py-2 transition-colors hover:bg-white/40"
                >
                  <SubjectBadge shortName={subject.shortName} />
                  <div className="flex items-center gap-3 font-mono">
                    <span className="text-[11px] text-zinc-500">
                      T{currentTerm}: {tg !== null ? tg.toFixed(1) : '—'}
                    </span>
                    <span className={`text-sm ${gradeColor(fg)}`}>
                      {fg !== null ? fg.toFixed(2) : '—'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-800">Upcoming</h3>
            <button type="button" onClick={() => navigate('calendar')} className="text-xs text-zinc-500 hover:text-zinc-800">
              Calendar →
            </button>
          </div>
          {upcomingTodos.length === 0 ? (
            <EmptyState icon={Calendar} title="No upcoming deadlines" subtitle="Add due dates to your tasks to see them here." />
          ) : (
            <div className="space-y-1">
              {upcomingTodos.map((todo) => {
                const dDate = new Date(todo.due_date! + 'T00:00:00');
                const daysAway = Math.ceil((dDate.getTime() - Date.now()) / 86400000);
                return (
                  <div key={todo.id} className="flex items-center gap-3 rounded-md px-1 py-2">
                    <div className="w-10 shrink-0 font-mono">
                      <div className="text-[9px] uppercase tracking-wider text-zinc-500">
                        {dDate.toLocaleDateString('en-US', { month: 'short' })}
                      </div>
                      <div className="text-sm text-zinc-800">{dDate.getDate()}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-zinc-800">{todo.title}</p>
                      <span className="font-mono text-[10px] text-zinc-500">
                        {daysAway <= 0 ? 'today' : daysAway === 1 ? 'tomorrow' : `${daysAway}d`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-800">Today</h3>
            <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
              <Flame className="h-3 w-3" />
              {streak}d streak
            </span>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-zinc-200/50 bg-white/40 px-3 py-3">
              <p className="text-xs font-medium text-zinc-500">Habits today</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">
                {habits.length ? `${todayHabitDone}/${habits.length}` : '—'}
              </p>
              <p className="text-[11px] text-zinc-500">
                {habits.length
                  ? `${Math.round((todayHabitDone / Math.max(habits.length, 1)) * 100)}% complete`
                  : 'Add habits to track'}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200/50 bg-white/40 px-3 py-3">
              <p className="text-xs font-medium text-zinc-500">Focus today</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">{focusLabel}</p>
              <p className="text-[11px] text-zinc-500">{weekFocusLabel} this week</p>
            </div>
            <div className="rounded-xl border border-zinc-200/50 bg-white/40 px-3 py-3">
              <p className="text-xs font-medium text-zinc-500">Open tasks</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">{activeTodos.length}</p>
              <p className="text-[11px] text-zinc-500">{deadlineCount} due within 7 days</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="inline-block w-[7.5rem] text-zinc-500">{label}:</span>
      <span className="text-zinc-800">{value}</span>
    </p>
  );
}

function InsightTile({
  icon: Icon,
  label,
  value,
  hint,
  onOpen,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string;
  hint: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="glass group rounded-2xl p-4 text-left transition-colors hover:bg-white/50"
    >
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-zinc-500" />
        <span className="text-xs font-medium text-zinc-500">{label}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums text-zinc-900">{value}</div>
      <div className="mt-1 text-[11px] text-zinc-500">{hint}</div>
    </button>
  );
}
