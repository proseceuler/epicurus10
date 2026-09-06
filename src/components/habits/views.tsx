import { Fragment, useEffect, useState, type Dispatch, SetStateAction } from 'react';
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
    <div className="flex min-h-[calc(100vh-7rem)] w-full items-start justify-center pt-3 lg:pt-5">
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-center gap-6 px-3 lg:gap-10">
        <div className="w-[340px] shrink-0 sm:w-[430px] lg:w-[540px] xl:w-[580px]">
          <BlackHole className="aspect-square w-full bg-transparent" />
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

export function TrackView({
  habits, weeks, days, done, today, year, month, showAdd, draft, setDraft, setShowAdd, onToggle, onAdd, onRemove, life,
}: {
  habits: Habit[];
  weeks: DayCell[][];
  days: DayCell[];
  done: Set<string>;
  today: string;
  year: number;
  month: number;
  showAdd: boolean;
  draft: { name: string; emoji: string; goal: string };
  setDraft: Dispatch<SetStateAction<{ name: string; emoji: string; goal: string }>>;
  setShowAdd: (v: boolean) => void;
  onToggle: (habitId: string, dateStr: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  life: number;
}) {
  const monthWave = days.map((d) => rateOn(habits, d.dateStr, done));
  const n = Math.max(weeks.length, 1);
  const grid = {
    display: 'grid',
    gridTemplateColumns: `minmax(210px, 260px) repeat(${n}, minmax(140px, 1fr))`,
    minWidth: 210 + n * 140,
  } as const;
  const lifeSeries = lastNDays(48).map((d) => rateOn(habits, d, done));

  return (
    <div className="space-y-2 pb-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setShowAdd(true)} className="text-[11px] text-zinc-500 underline">+ Add habit</button>
        <p className="text-[10px] text-zinc-500">{year}/{MONTHS[month].slice(0, 3)}</p>
      </div>

      {showAdd ? (
        <div className="flex items-center gap-1.5">
          <input value={draft.emoji} onChange={(e) => setDraft((d) => ({ ...d, emoji: e.target.value }))} className="w-10 border border-zinc-200 bg-white px-1.5 py-1 text-center text-sm" />
          <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Habit name" className="min-w-0 flex-1 border border-zinc-200 bg-white px-2 py-1 text-[12px]" />
          <input value={draft.goal} onChange={(e) => setDraft((d) => ({ ...d, goal: e.target.value }))} className="w-12 border border-zinc-200 bg-white px-1.5 py-1 text-center text-[12px]" />
          <button type="button" onClick={onAdd} className="bg-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-50">Add</button>
          <button type="button" onClick={() => setShowAdd(false)} className="text-[11px] text-zinc-500">Cancel</button>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <div style={grid}>
          <div className="flex items-end px-2 pb-1">
            <span className="text-[13px] font-semibold text-zinc-700">Habits</span>
          </div>
          <div style={{ gridColumn: '2 / -1' }}>
            <AreaChart values={monthWave} height={96} />
          </div>

          <div className="border-b border-zinc-200" />
          {weeks.map((_, wi) => (
            <div key={`wh-${wi}`} className="border-b border-zinc-200 py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Week {wi + 1}</div>
          ))}

          <div className="border-b border-zinc-200" />
          {weeks.map((week, wi) => (
            <div key={`wd-${wi}`} className="grid grid-cols-7 border-b border-zinc-200">
              {Array.from({ length: 7 }, (_, wd) => {
                const cell = week.find((d) => d.weekdayIdx === wd);
                return (
                  <div key={wd} className="px-0 py-0.5 text-center">
                    <div className="text-[8px] font-medium text-zinc-500">{WEEKDAYS[wd]}</div>
                    <div className="text-[9px] tabular-nums text-zinc-400">{cell ? cell.day : ''}</div>
                  </div>
                );
              })}
            </div>
          ))}

          {habits.map((h) => (
            <div key={h.id} className="contents">
              <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-2 py-1">
                <span className="truncate text-[12px] text-zinc-700">{h.emoji} {h.name}</span>
                <button type="button" onClick={() => onRemove(h.id)} className="text-[10px] text-zinc-400 hover:text-zinc-700">×</button>
              </div>
              {weeks.map((week, wi) => (
                <div key={`${h.id}-${wi}`} className="grid grid-cols-7 border-b border-zinc-100">
                  {Array.from({ length: 7 }, (_, wd) => {
                    const cell = week.find((d) => d.weekdayIdx === wd);
                    if (!cell) return <div key={wd} />;
                    const on = isDone(done, h.id, cell.dateStr);
                    const isToday = cell.dateStr === today;
                    return (
                      <div key={cell.dateStr} className="flex items-center justify-center py-1">
                        <button type="button" onClick={() => onToggle(h.id, cell.dateStr)} className={`inline-block h-[12px] w-[12px] ${isToday ? 'ring-1 ring-zinc-600' : ''}`} style={{ background: on ? '#3f3f46' : 'transparent', border: '1px solid #71717a' }} aria-label={`${h.name} ${cell.dateStr}`} />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}

          <div className="border-b border-zinc-200 px-2 py-1 text-[9px] uppercase tracking-wider text-zinc-400">Daily %</div>
          {weeks.map((week, wi) => (
            <div key={`dp-${wi}`} className="grid grid-cols-7 border-b border-zinc-200">
              {Array.from({ length: 7 }, (_, wd) => {
                const cell = week.find((d) => d.weekdayIdx === wd);
                if (!cell) return <div key={wd} />;
                const pct = rateOn(habits, cell.dateStr, done);
                const tone = dayTone(pct);
                return (
                  <div key={cell.dateStr} className="flex items-center justify-center py-0.5">
                    <span className="flex h-[16px] w-full items-center justify-center text-[8px] font-semibold tabular-nums" style={{ background: tone.bg, color: tone.fg }}>{Math.round(pct * 100)}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={grid} className="items-start">
          <div className="px-2 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Lifetime Progress</p>
            <div className="mx-auto mt-1 w-[176px]"><BlackHole className="aspect-square w-full bg-transparent" /></div>
            <p className="mt-1 text-center text-[22px] font-semibold tabular-nums text-zinc-800">{life.toFixed(2)}%</p>
            <div className="mx-auto mt-1 flex h-8 w-[176px] items-end gap-px">
              {lifeSeries.map((v, i) => (
                <div key={i} className="flex-1 bg-zinc-800" style={{ height: `${Math.max(6, Math.round(v * 100))}%`, opacity: 0.25 + v * 0.75 }} />
              ))}
            </div>
          </div>
          {weeks.map((week, wi) => {
            const wp = weekPct(habits, week, done);
            const slots = Math.max(1, habits.length * week.length);
            const got = week.reduce((s, d) => s + habits.filter((h) => isDone(done, h.id, d.dateStr)).length, 0);
            const spark = week.map((d) => rateOn(habits, d.dateStr, done));
            const prev = wi > 0 ? weekPct(habits, weeks[wi - 1], done) : wp;
            const delta = wp - prev;
            const up = delta >= 0;
            return (
              <div key={`wc-${wi}`} className="border-l border-zinc-100 px-2 pt-3">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">Weekly Completion %</p>
                <div className="mt-1 flex items-start justify-between gap-2">
                  <p className="text-[26px] font-semibold leading-none tabular-nums text-zinc-800">{Math.round(wp * 100)}%</p>
                  <Spark values={spark} width={64} />
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px]">
                  <span className="tabular-nums text-zinc-500">({got}/{slots})</span>
                  <span className={`tabular-nums ${up ? 'text-emerald-600' : 'text-red-500'}`}>{up ? '▲' : '▼'} {Math.abs(Math.round(delta * 100))}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { DashView, InsightsView } from './views-rest';
