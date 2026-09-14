import { Fragment, useEffect, useMemo, useState, type Dispatch, SetStateAction } from 'react';
import type { Habit, HabitCompletion, Todo } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import BlackHole from '@/components/habits/BlackHole';
import {
  AlertRow, AreaChart, BarRow, Ring, Spark,
  chunkWeekly, habitWeekSeries, rateOn,
} from '@/components/habits/widgets';
import {
  MONTHS, WEEKDAYS, isDone, lastNDays, monthDays, type DayCell,
} from '@/lib/habit-stats';

export type View = 'home' | 'track' | 'dash' | 'insights';

function weekPct(habits: Habit[], week: DayCell[], done: Set<string>) {
  if (!habits.length || !week.length) return 0;
  const slots = habits.length * week.length;
  const got = week.reduce((s, d) => s + habits.filter((h) => isDone(done, h.id, d.dateStr)).length, 0);
  return slots ? got / slots : 0;
}

function habitPct(h: Habit | undefined, days: { dateStr: string }[], done: Set<string>) {
  if (!h || !days.length) return 0;
  return days.filter((d) => isDone(done, h.id, d.dateStr)).length / days.length;
}

function momDelta(h: Habit, done: Set<string>) {
  const now = new Date();
  const tm = monthDays(now.getFullYear(), now.getMonth());
  const lmMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const lmYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const lm = monthDays(lmYear, lmMonth);
  return { mtd: habitPct(h, tm, done), mom: habitPct(h, tm, done) - habitPct(h, lm, done) };
}

function dayTone(pct: number) {
  if (pct >= 0.85) return { bg: '#22c55e', fg: '#fff' };
  if (pct >= 0.7) return { bg: '#84cc16', fg: '#18181b' };
  if (pct >= 0.5) return { bg: '#eab308', fg: '#18181b' };
  if (pct >= 0.3) return { bg: '#f97316', fg: '#fff' };
  if (pct > 0) return { bg: '#ef4444', fg: '#fff' };
  return { bg: '#f4f4f5', fg: '#a1a1aa' };
}

export function HomeView({
  habits, done, today, todayLeft, dailyScores, onGo,
}: {
  habits: Habit[];
  done: Set<string>;
  today: string;
  life: number;
  todayLeft: Habit[];
  dailyScores: { date: string; score: number }[];
  completions: HabitCompletion[];
  onGo: (v: View) => void;
}) {
  const [todos, setTodos] = useState<Todo[]>([]);
  useEffect(() => {
    void supabase.from('todos').select('*').then(({ data }) => {
      if (data) setTodos(data as Todo[]);
    });
  }, []);

  const last84 = lastNDays(84);
  const weekly = chunkWeekly(habits, done, last84);
  const daily = dailyScores.map((d) => d.score);
  const wave = weekly.some((v) => v > 0) ? weekly : daily;
  const waveLabels = last84.filter((_, i) => i % 7 === 0).map((d) => d.slice(5)).slice(-12);
  const todayScore = rateOn(habits, today, done);
  const last7 = lastNDays(7);
  const dist = last7.map((d) => ({ key: d, value: rateOn(habits, d, done), label: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(`${d}T00:00:00`).getDay()] }));
  const monthDaysNow = monthDays(new Date().getFullYear(), new Date().getMonth());
  const monthDone = habits.reduce((s, h) => s + monthDaysNow.filter((d) => isDone(done, h.id, d.dateStr)).length, 0);
  const monthSlots = Math.max(1, habits.length * monthDaysNow.length);
  const monthBars = monthDaysNow.map((d) => ({ key: d.dateStr, value: rateOn(habits, d.dateStr, done), label: String(d.day) }));
  const monthName = MONTHS[new Date().getMonth()];
  const links: { label: string; view: View }[] = [
    { label: '+ Update Habit Tracker', view: 'track' },
    { label: '+ Habit Dashboard', view: 'dash' },
    { label: '+ Habit Insights', view: 'insights' },
  ];

  const priorities = todos.filter((t) => t.priority === 'urgent_important');
  const top3 = [...todos].sort((a, b) => {
    const rank = (p: Todo['priority']) =>
      p === 'urgent_important' ? 0 : p === 'not_urgent_important' ? 1 : p === 'urgent_not_important' ? 2 : 3;
    return rank(a.priority) - rank(b.priority);
  }).slice(0, 3);
  const prioDone = priorities.length ? priorities.every((t) => t.completed) : false;
  const top3Done = top3.length ? top3.every((t) => t.completed) : false;

  const alertTone = (empty: boolean, doneFlag: boolean): 'ok' | 'pending' | 'na' => {
    if (empty) return 'na';
    return doneFlag ? 'ok' : 'pending';
  };

  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden">
      <div className="mx-auto flex h-full w-full max-w-[1440px] items-center justify-center gap-6 px-3 lg:gap-10">
        <div className="w-[300px] shrink-0 sm:w-[360px] lg:w-[440px] xl:w-[520px]">
          <BlackHole variant="home" className="aspect-square w-full bg-transparent" />
        </div>
        <div className="min-w-0 max-w-[860px] flex-1">
          <div className="grid grid-cols-3 items-start gap-x-6 gap-y-5 lg:gap-x-8 lg:gap-y-6">
            <div className="min-w-0">
              <p className="ht-label mb-2">Quick Actions</p>
              <ul className="space-y-1.5 text-[13px] leading-snug text-zinc-700">
                {links.map((l) => (
                  <li key={l.view}>
                    <button type="button" onClick={() => onGo(l.view)} className="text-left underline decoration-zinc-400 underline-offset-4 hover:text-zinc-950">{l.label}</button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-w-0">
              <p className="ht-label mb-0.5">Completion %</p>
              <p className="mb-1 text-[9px] text-zinc-500">Last 12 Weeks Completion</p>
              <AreaChart values={wave.slice(-12)} labels={waveLabels} height={78} />
            </div>
            <div className="min-w-0">
              <p className="ht-label mb-0.5">Alerts</p>
              <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-500">Daily Tasks</p>
              <AlertRow label="Done today's Habits?" value={todayLeft.length ? 'Pending' : 'Done'} tone={todayLeft.length ? 'pending' : 'ok'} />
              <AlertRow label="Today's Habit Completion %" value={`${Math.round(todayScore * 100)}%`} tone={todayScore >= 0.8 ? 'ok' : 'pending'} />
              <p className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-500">Weekly Tasks</p>
              <AlertRow label="Done Top Priorities?" value={!priorities.length ? 'N/A' : prioDone ? 'Done' : 'Pending'} tone={alertTone(!priorities.length, prioDone)} />
              <AlertRow label="Done Top 3 Tasks?" value={!top3.length ? 'N/A' : top3Done ? 'Done' : 'Pending'} tone={alertTone(!top3.length, top3Done)} />
            </div>
            <div className="min-w-0">
              <p className="ht-label mb-1">Daily Score Distribution</p>
              <BarRow items={dist} height={84} showValue />
            </div>
            <div className="min-w-0">
              <p className="ht-label mb-1">Trend</p>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-2 gap-y-1 text-[11px]">
                <span className="text-[8px] uppercase tracking-wider text-zinc-500">Habit</span>
                <span className="text-[8px] uppercase tracking-wider text-zinc-500">MTD %</span>
                <span className="text-[8px] uppercase tracking-wider text-zinc-500">MoM %</span>
                <span className="text-[8px] uppercase tracking-wider text-zinc-500">12 Wk</span>
                {habits.map((h) => {
                  const { mtd, mom } = momDelta(h, done);
                  const up = mom >= 0;
                  return (
                    <Fragment key={h.id}>
                      <span className="truncate text-zinc-700">{h.emoji} {h.name}</span>
                      <span className="tabular-nums text-zinc-600">{Math.round(mtd * 100)}%</span>
                      <span className={`tabular-nums ${up ? 'text-emerald-600' : 'text-red-500'}`}>{up ? '▲' : '▼'} {Math.abs(Math.round(mom * 100))}%</span>
                      <span><Spark values={habitWeekSeries(h.id, done)} width={48} /></span>
                    </Fragment>
                  );
                })}
              </div>
            </div>
            <div className="min-w-0">
              <p className="ht-label mb-1">Progress ({monthName.slice(0, 3)})</p>
              <Ring value={(monthDone / monthSlots) * 100} caption={`${monthDone}/${monthSlots} Habits Done`} />
              <p className="ht-label mt-1.5 mb-0.5">{monthName.slice(0, 3)}'s Daily Performance % Trend</p>
              <BarRow items={monthBars} height={44} labelEvery={5} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
