import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { SUBJECTS, NUM_TERMS, type Assessment, type Todo, type PomodoroSession } from '@/lib/types';
import { computeFinalGrade, computeGeneralAverage, computeTermGrade } from '@/lib/gradeUtils';
import { Card, EmptyState, SubjectBadge, gradeColor } from '@/components/kit';
import type { PageId } from '@/components/AppLayout';
import { usePomodoro } from '@/context/PomodoroContext';
import { Calendar, BookOpen } from 'lucide-react';

const SIGIL_KEY = 'epicure-ascii-sigil';

const DEFAULT_SIGIL = `
      .·:·.
    ·´     \`·
   /    ∧    \\
  |   /   \\   |
  |   \\   /   |
   \\   \\_/   /
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

export default function DashboardPage({ navigate }: { navigate: (p: PageId) => void }) {
  const pomodoro = usePomodoro();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [sessions, setSessions] = useState<PomodoroSession[]>([]);
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
    const [{ data: aData }, { data: tData }, { data: sData }] = await Promise.all([
      supabase.from('assessments').select('*'),
      supabase.from('todos').select('*').order('created_at', { ascending: false }),
      supabase.from('pomodoro_sessions').select('*'),
    ]);
    if (aData) setAssessments(aData as Assessment[]);
    if (tData) setTodos(tData as Todo[]);
    if (sData) setSessions(sData as PomodoroSession[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

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
    .slice(0, 5);

  const currentTerm = (() => {
    const month = new Date().getMonth();
    if (month >= 5 && month <= 9) return 1;
    if (month >= 10 || month <= 1) return 2;
    return 3;
  })();

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="font-mono text-xs tracking-[0.3em] text-[#5c6168]">LOADING</span>
      </div>
    );
  }

  return (
    <div>
      <section className={`hud-hero mb-10 ${awake ? 'hud-awake' : ''}`}>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-14">
          <div className="min-w-0 flex-1">
            {editingSigil ? (
              <div>
                <textarea
                  defaultValue={sigil}
                  rows={10}
                  className="w-full resize-y rounded-lg bg-transparent p-2 font-mono text-[11px] leading-[1.15] text-[#9aa8ab] outline-none"
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
                className="hud-sigil block text-left"
              >
                <pre className="select-none font-mono text-[11px] leading-[1.15] sm:text-[12px]">{sigil}</pre>
              </button>
            )}
          </div>

          <div className="font-mono text-[12px] leading-6 text-[#8b8f96] lg:min-w-[280px] lg:pt-2">
            <p className="text-[#d7d8dc]">
              user<span className="text-[#5c6168]">@</span>{host}
            </p>
            <p className="text-[#3f4349]">{'─'.repeat(22)}</p>
            <StatRow label="OS" value="epicure 10.2" />
            <StatRow label="STREAK" value={`${streak}d`} />
            <StatRow label="TERM" value={`T${currentTerm} / ${NUM_TERMS}`} />
            <StatRow label="FOCUS" value={focusLabel} />
            <StatRow label="GPA" value={gpa} />
            <StatRow label="TASKS" value={`${activeTodos.length} open`} />
            <StatRow label="KERNEL" value={`${SUBJECTS.length} subjects`} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => navigate('grades')} className="font-mono text-[11px] tracking-wide text-[#7a8a8c] hover:text-[#c5d4d6]">
                → grades
              </button>
              <button type="button" onClick={() => navigate('pomodoro')} className="font-mono text-[11px] tracking-wide text-[#7a8a8c] hover:text-[#c5d4d6]">
                → focus
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="mb-10 grid grid-cols-2 gap-x-8 gap-y-6 lg:grid-cols-4">
        <QuietStat label="GPA" value={gpa} onOpen={() => navigate('grades')} />
        <QuietStat label="PENDING" value={String(activeTodos.length)} onOpen={() => navigate('todos')} />
        <QuietStat label="FOCUS" value={focusLabel} onOpen={() => navigate('pomodoro')} />
        <QuietStat label="TERM" value={`T${currentTerm}`} onOpen={() => navigate('grades')} />
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <Card className="p-0">
          <div className="mb-5 flex items-baseline justify-between">
            <h3 className="font-mono text-[11px] tracking-[0.22em] text-[#8b8f96]">SUBJECT GRADES</h3>
            <button onClick={() => navigate('grades')} className="font-mono text-[10px] text-[#5c6168] hover:text-[#c9cbd0]">all →</button>
          </div>
          {assessments.length === 0 ? (
            <EmptyState icon={BookOpen} title="No grades yet" subtitle="Add your assessment scores to see your grades here." />
          ) : (
            <div className="space-y-1">
              {SUBJECTS.map((s) => {
                const fg = computeFinalGrade(s.key, assessments);
                const tg = computeTermGrade(s.key, currentTerm, assessments);
                return (
                  <button key={s.key} onClick={() => navigate('grades')} className="group flex w-full items-center justify-between rounded-md px-1 py-2 transition-colors hover:bg-white/3">
                    <SubjectBadge shortName={s.shortName} />
                    <div className="flex items-center gap-4 font-mono">
                      <span className="text-[11px] text-[#5c6168]">T{currentTerm}: {tg !== null ? tg.toFixed(1) : '—'}</span>
                      <span className={`text-sm ${gradeColor(fg)}`}>{fg !== null ? fg.toFixed(2) : '—'}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-0">
          <div className="mb-5 flex items-baseline justify-between">
            <h3 className="font-mono text-[11px] tracking-[0.22em] text-[#8b8f96]">UPCOMING</h3>
            <button onClick={() => navigate('calendar')} className="font-mono text-[10px] text-[#5c6168] hover:text-[#c9cbd0]">calendar →</button>
          </div>
          {upcomingTodos.length === 0 ? (
            <EmptyState icon={Calendar} title="No upcoming deadlines" subtitle="Add due dates to your tasks to see them here." />
          ) : (
            <div className="space-y-1">
              {upcomingTodos.map((todo) => {
                const dDate = new Date(todo.due_date! + 'T00:00:00');
                const daysAway = Math.ceil((dDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={todo.id} className="flex items-center gap-3 rounded-md px-1 py-2">
                    <div className="w-10 shrink-0 font-mono">
                      <div className="text-[9px] uppercase tracking-wider text-[#5c6168]">{dDate.toLocaleDateString('en-US', { month: 'short' })}</div>
                      <div className="text-sm text-[#d7d8dc]">{dDate.getDate()}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-[#c9cbd0]">{todo.title}</p>
                      <span className="font-mono text-[10px] text-[#5c6168]">{daysAway <= 0 ? 'today' : daysAway === 1 ? 'tomorrow' : `${daysAway}d`}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="inline-block w-[7.5rem] text-[#5c6168]">{label}:</span>
      <span className="text-[#c9cbd0]">{value}</span>
    </p>
  );
}

function QuietStat({ label, value, onOpen }: { label: string; value: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group text-left">
      <div className="mb-1 font-mono text-[10px] tracking-[0.22em] text-[#5c6168]">{label}</div>
      <div className="font-mono text-2xl text-[#e4e5e8]">{value}</div>
    </button>
  );
}
