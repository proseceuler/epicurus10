import { Fragment, useEffect, useState, type Dispatch, SetStateAction } from 'react';
import type { Habit, HabitCompletion, Todo } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import BlackHole from '@/components/habits/BlackHole';
import {
  AlertRow, AreaChart, BarRow, DualArea, HeatDays, HeatRatio, MiniBar, MultiArea, Ring, ScatterTrend, Sheet, Spark,
  chunkWeekly, countOn, dailyVector, habitWeekSeries, heatGrey, corrFill, rateOn,
} from '@/components/habits/widgets';
import {
  MONTHS, WEEKDAYS, isDone, lastNDays, pearson, monthDays, type DayCell,
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

function weekChunks(weeks: number) {
  const days = lastNDays(weeks * 7);
  const out: string[][] = [];
  for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
  return out;
}

export function HomeView({
  habits, done, today, life, todayLeft, dailyScores, completions, onGo,
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

  return (
    <div className="grid grid-cols-12 items-start gap-x-4 gap-y-4">
      <div className="col-span-12 sm:col-span-4 lg:col-span-3">
        <BlackHole className="mx-auto aspect-square w-full max-w-[260px]" percent={life} />
        <p className="mt-1 text-center text-[10px] text-zinc-500">{completions.length} lifetime logs</p>
      </div>
      <div className="col-span-12 grid grid-cols-12 gap-x-4 gap-y-4 sm:col-span-8 lg:col-span-9">
        <div className="col-span-12 md:col-span-3">
          <p className="ht-label mb-2">Quick Actions</p>
          <ul className="space-y-2 text-[13px] text-zinc-700">
            {links.map((l) => (
              <li key={l.view}>
                <button type="button" onClick={() => onGo(l.view)} className="underline decoration-zinc-400 underline-offset-4 hover:text-zinc-950">{l.label}</button>
              </li>
            ))}
          </ul>
        </div>
        <div className="col-span-12 md:col-span-5">
          <p className="ht-label mb-1">Completion %</p>
          <p className="mb-0.5 text-[10px] text-zinc-500">Last 12 weeks</p>
          <AreaChart values={wave.slice(-12)} labels={waveLabels} height={88} />
        </div>
        <div className="col-span-12 md:col-span-4">
          <p className="ht-label mb-1">Alerts</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Daily Tasks</p>
          <AlertRow label="Done today's Habits?" value={todayLeft.length ? 'Pending' : 'Done'} tone={todayLeft.length ? 'pending' : 'ok'} />
          <AlertRow label="Today's Habit Completion %" value={`${Math.round(todayScore * 100)}%`} tone={todayScore >= 1 ? 'ok' : 'pending'} />
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Weekly Tasks</p>
          <AlertRow label="Done Top Priorities?" value={!priorities.length ? 'N/A' : prioDone ? 'Done' : 'Pending'} tone={!priorities.length || !prioDone ? 'pending' : 'ok'} />
          <AlertRow label="Done Top 3 Tasks?" value={!top3.length ? 'N/A' : top3Done ? 'Done' : 'Pending'} tone={!top3.length || !top3Done ? 'pending' : 'ok'} />
        </div>
        <div className="col-span-12 md:col-span-4">
          <p className="ht-label mb-1">Daily Score Distribution</p>
          <BarRow items={dist} height={96} showValue />
        </div>
        <div className="col-span-12 md:col-span-4">
          <p className="ht-label mb-1">Trend</p>
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-2 gap-y-1 text-[11px]">
            <span className="text-[9px] uppercase tracking-wider text-zinc-500">Habit</span>
            <span className="text-[9px] uppercase tracking-wider text-zinc-500">MTD</span>
            <span className="text-[9px] uppercase tracking-wider text-zinc-500">MoM</span>
            <span className="text-[9px] uppercase tracking-wider text-zinc-500">12w</span>
            {habits.map((h) => {
              const { mtd, mom } = momDelta(h, done);
              const up = mom >= 0;
              return (
                <Fragment key={h.id}>
                  <span className="truncate text-zinc-700">{h.emoji} {h.name}</span>
                  <span className="tabular-nums text-zinc-600">{Math.round(mtd * 100)}%</span>
                  <span className={`tabular-nums ${up ? 'text-zinc-700' : 'text-zinc-500'}`}>{up ? '▲' : '▼'}{Math.abs(Math.round(mom * 100))}</span>
                  <span><Spark values={habitWeekSeries(h.id, done)} width={56} /></span>
                </Fragment>
              );
            })}
          </div>
        </div>
        <div className="col-span-12 md:col-span-4">
          <p className="ht-label mb-1">Progress</p>
          <Ring value={(monthDone / monthSlots) * 100} caption={`${monthDone}/${monthSlots} Habits Done`} />
          <p className="ht-label mt-2 mb-1">This Month's Daily Performance % Trend</p>
          <BarRow items={monthBars} height={72} labelEvery={3} />
        </div>
      </div>
    </div>
  );
}
