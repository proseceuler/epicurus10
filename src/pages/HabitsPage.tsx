import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Habit, HabitCompletion } from '@/lib/types';
import { HomeView, TrackView, DashView, InsightsView, type View } from '@/components/habits/views';
import {
  MONTHS, monthDays, doneSet, isDone, todayIso, lastNDays, lifetimePct,
} from '@/lib/habit-stats';

const VIEWS: { id: View; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'track', label: 'Tracker' },
  { id: 'dash', label: 'Dashboard' },
  { id: 'insights', label: 'Insights' },
];
const DEFAULT_HABITS = [
  { name: 'Woke up at 05:00', emoji: '⏰', goal_target: 30 },
  { name: 'Gym', emoji: '💪', goal_target: 25 },
  { name: 'Reading / Learning', emoji: '📚', goal_target: 30 },
  { name: 'Project Work', emoji: '🧬', goal_target: 20 },
];

function dedupeHabits(list: Habit[]) {
  const seenId = new Set<string>();
  const seenName = new Set<string>();
  const out: Habit[] = [];
  for (const h of list) {
    const key = (h.name ?? '').trim().toLowerCase();
    if (seenId.has(h.id) || seenName.has(key)) continue;
    seenId.add(h.id); seenName.add(key); out.push(h);
  }
  return out;
}

export default function HabitsPage() {
  const [view, setView] = useState<View>('home');
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ name: '', emoji: '✅', goal: '30' });
  const seeded = useRef(false);
  const today = todayIso();
  const done = useMemo(() => doneSet(completions), [completions]);

  const load = useCallback(async () => {
    const [{ data: hData }, { data: cData }] = await Promise.all([
      supabase.from('habits').select('*').order('created_at', { ascending: true }),
      supabase.from('habit_completions').select('*'),
    ]);
    if (hData) {
      const list = dedupeHabits(hData as Habit[]);
      if (list.length === 0 && !seeded.current) {
        seeded.current = true;
        const inserts: Habit[] = [];
        for (const h of DEFAULT_HABITS) {
          const { data } = await supabase.from('habits').insert({ name: h.name, emoji: h.emoji, goal_target: h.goal_target, color: 'zinc' }).select().single();
          if (data) inserts.push(data as Habit);
        }
        setHabits(dedupeHabits(inserts));
      } else setHabits(list);
    }
    if (cData) setCompletions(cData as HabitCompletion[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const days = useMemo(() => monthDays(year, month), [year, month]);
  const weeks = useMemo(() => {
    const n = days.length ? days[days.length - 1].weekNum + 1 : 0;
    return Array.from({ length: n }, (_, i) => days.filter((d) => d.weekNum === i));
  }, [days]);

  const toggle = async (habitId: string, dateStr: string) => {
    const existing = completions.find((c) => c.habit_id === habitId && c.completion_date === dateStr);
    if (existing) {
      await supabase.from('habit_completions').delete().eq('id', existing.id);
      setCompletions((cur) => cur.filter((c) => c.id !== existing.id));
    } else {
      const { data } = await supabase.from('habit_completions').insert({ habit_id: habitId, completion_date: dateStr }).select().single();
      if (data) setCompletions((cur) => [...cur, data as HabitCompletion]);
    }
  };

  const addHabit = async () => {
    if (!draft.name.trim()) return;
    const { data } = await supabase.from('habits').insert({ name: draft.name.trim(), emoji: draft.emoji || '✅', goal_target: parseInt(draft.goal) || 30, color: 'zinc' }).select().single();
    if (data) {
      setHabits((cur) => dedupeHabits([...cur, data as Habit]));
      setDraft({ name: '', emoji: '✅', goal: '30' });
      setShowAdd(false);
    }
  };

  const removeHabit = async (id: string) => {
    await supabase.from('habit_completions').delete().eq('habit_id', id);
    await supabase.from('habits').delete().eq('id', id);
    setHabits((cur) => cur.filter((h) => h.id !== id));
    setCompletions((cur) => cur.filter((c) => c.habit_id !== id));
  };

  const life = lifetimePct(habits, completions);
  const todayLeft = habits.filter((h) => !isDone(done, h.id, today));
  const last14 = lastNDays(14);
  const dailyScores = last14.map((d) => ({ date: d, score: habits.length ? habits.filter((h) => isDone(done, h.id, d)).length / habits.length : 0 }));

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-xs text-zinc-500">Loading tracker…</div>;
  }

  return (
    <div className="ht-shell -mx-1 rounded-2xl bg-zinc-950 px-2.5 py-2.5 text-zinc-100 pb-16">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
        <h2 className="text-[15px] font-semibold tracking-tight">Habit Tracker</h2>
        <div className="flex items-center gap-1">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" onClick={() => setView(v.id)} className={`rounded px-2 py-0.5 text-[11px] font-medium ${view === v.id ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}`}>{v.label}</button>
          ))}
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="rounded bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-200">
            {MONTHS.map((m, i) => <option key={m} value={i}>{m.slice(0, 3)}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-200">
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      {view === 'home' && <HomeView habits={habits} done={done} today={today} life={life} todayLeft={todayLeft} dailyScores={dailyScores} completions={completions} onGo={setView} />}
      {view === 'track' && <TrackView habits={habits} weeks={weeks} days={days} done={done} today={today} year={year} showAdd={showAdd} draft={draft} setDraft={setDraft} setShowAdd={setShowAdd} onToggle={toggle} onAdd={() => void addHabit()} onRemove={removeHabit} life={life} />}
      {view === 'dash' && <DashView habits={habits} days={days} weeks={weeks} done={done} monthLabel={`${MONTHS[month]} ${year}`} />}
      {view === 'insights' && <InsightsView habits={habits} days={days} weeks={weeks} done={done} />}
    </div>
  );
}
