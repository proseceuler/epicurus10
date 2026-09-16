import { Fragment, useEffect, useMemo, useState, type Dispatch, SetStateAction } from 'react';
import type { Habit, HabitCompletion, Todo } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import BlackHole from '@/components/habits/BlackHole';
import {
  AreaChart,
  BarChart,
  Heatmap,
  ProgressRing,
} from '@/components/habits/charts';
import {
  completionRate,
  dayKey,
  doneSet,
  isDone,
  monthDays,
  monthMatrix,
  scoreSeries,
  streakFor,
  todayIso,
  weekdayAvg,
  weekKey,
} from '@/lib/habit-stats';

export type View = 'home' | 'track' | 'dash' | 'insights';

type Go = (v: View) => void;

function AlertRow({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'pending' | 'na' }) {
  const cls =
    tone === 'ok'
      ? 'bg-emerald-50 text-emerald-700'
      : tone === 'pending'
        ? 'bg-zinc-100 text-zinc-600'
        : 'bg-zinc-50 text-zinc-400';
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-[11px] text-zinc-600">{label}</span>
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{value}</span>
    </div>
  );
}

export function HomeView({
  habits,
  completions,
  todos,
  onGo,
}: {
  habits: Habit[];
  completions: HabitCompletion[];
  todos: Todo[];
  onGo: Go;
}) {
  const done = useMemo(() => doneSet(completions), [completions]);
  const today = todayIso();
  const todayLeft = habits.filter((h) => !isDone(done, h.id, today));
  const todayScore = habits.length ? (habits.length - todayLeft.length) / habits.length : 0;

  const wave = useMemo(() => {
    const days = monthDays(new Date().getFullYear(), new Date().getMonth());
    return days.map((d) => {
      if (!habits.length) return 0;
      const n = habits.filter((h) => isDone(done, h.id, d)).length;
      return n / habits.length;
    });
  }, [habits, done]);

  const waveLabels = useMemo(() => {
    const days = monthDays(new Date().getFullYear(), new Date().getMonth());
    return days.map((d) => d.slice(8));
  }, []);

  const links = [
    { label: '+ Update Habit Tracker', view: 'track' as const },
    { label: '+ Habit Dashboard', view: 'dash' as const },
    { label: '+ Habit Insights', view: 'insights' as const },
  ];

  const priorities = todos.filter((t) => t.priority === 'urgent_important' && !t.completed);
  const prioDone = priorities.length === 0;
  const top3 = todos.filter((t) => !t.completed).slice(0, 3);
  const top3Done = top3.length ? top3.every((t) => t.completed) : false;

  const alertTone = (empty: boolean, doneFlag: boolean): 'ok' | 'pending' | 'na' => {
    if (empty) return 'na';
    return doneFlag ? 'ok' : 'pending';
  };

  const monthDone = habits.length
    ? habits.reduce((acc, h) => acc + (isDone(done, h.id, today) ? 1 : 0), 0)
    : 0;

  return (
    <div className="flex h-full w-full items-center justify-center overflow-visible">
      <div className="mx-auto flex h-full w-full max-w-[1440px] items-center justify-center gap-6 px-3 lg:gap-10">
        <div className="w-[300px] shrink-0 sm:w-[360px] lg:w-[440px] xl:w-[520px] overflow-visible">
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
              <AreaChart values={wave.slice(-12)} labels={waveLabels.slice(-12)} height={78} />
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
              <BarChart
                values={weekdayAvg(habits, done).map((v) => Math.round(v * 100))}
                labels={['F', 'S', 'S', 'M', 'T', 'W', 'T']}
                height={72}
              />
            </div>
            <div className="min-w-0">
              <p className="ht-label mb-1">Trend</p>
              <div className="space-y-1 text-[11px]">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 text-[9px] font-semibold uppercase tracking-wide text-zinc-400">
                  <span>Habit</span><span>MTD %</span><span>MoM %</span><span>12 wk</span>
                </div>
                {habits.slice(0, 6).map((h) => {
                  const st = streakFor(h.id, done);
                  return (
                    <div key={h.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-2">
                      <span className="truncate text-zinc-700">{h.icon ? `${h.icon} ` : ''}{h.name}</span>
                      <span className="tabular-nums text-zinc-500">0%</span>
                      <span className="tabular-nums text-zinc-500">▲ 0%</span>
                      <span className="h-1 w-8 rounded bg-zinc-200" />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="min-w-0">
              <p className="ht-label mb-1">Progress (Sep)</p>
              <div className="flex flex-col items-start gap-2">
                <ProgressRing value={todayScore} size={88} />
                <p className="text-[10px] text-zinc-500">{monthDone}/{Math.max(habits.length, 1) * 30} Habits Done</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
