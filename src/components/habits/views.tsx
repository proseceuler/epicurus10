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
    <div className="flex items-start gap-3 lg:gap-5">
      <div className="w-[132px] shrink-0 sm:w-[148px] lg:w-[168px]">
        <BlackHole className="aspect-square w-full bg-transparent" percent={life} />
        <p className="mt-0.5 text-center text-[9px] text-zinc-500">{completions.length} lifetime logs</p>
      </div>

      <div className="min-w-0 flex-1">
        <div className="grid grid-cols-3 items-start gap-x-3 gap-y-5 lg:gap-x-5">
          <div className="min-w-0">
            <p className="ht-label mb-2">Quick Actions</p>
            <ul className="space-y-1.5 text-[12px] leading-snug text-zinc-700 lg:text-[13px]">
              {links.map((l) => (
                <li key={l.view}>
                  <button type="button" onClick={() => onGo(l.view)} className="text-left underline decoration-zinc-400 underline-offset-4 hover:text-zinc-950">{l.label}</button>
                </li>
              ))}
            </ul>
          </div>

          <div className="min-w-0">
            <p className="ht-label mb-1">Completion %</p>
            <p className="mb-0.5 text-[10px] text-zinc-500">Last 12 Weeks Completion</p>
            <AreaChart values={wave.slice(-12)} labels={waveLabels} height={72} />
          </div>

          <div className="min-w-0">
            <p className="ht-label mb-1">Alerts</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Daily Tasks</p>
            <AlertRow label="Done today's Habits?" value={todayLeft.length ? 'Pending' : 'Done'} tone={todayLeft.length ? 'pending' : 'ok'} />
            <AlertRow label="Today's Habit Completion %" value={`${Math.round(todayScore * 100)}%`} tone={todayScore >= 0.8 ? 'ok' : 'pending'} />
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Weekly Tasks</p>
            <AlertRow label="Done Top Priorities?" value={!priorities.length ? 'N/A' : prioDone ? 'Done' : 'Pending'} tone={alertTone(!priorities.length, prioDone)} />
            <AlertRow label="Done Top 3 Tasks?" value={!top3.length ? 'N/A' : top3Done ? 'Done' : 'Pending'} tone={alertTone(!top3.length, top3Done)} />
          </div>

          <div className="min-w-0">
            <p className="ht-label mb-1">Daily Score Distribution</p>
            <BarRow items={dist} height={78} showValue />
          </div>

          <div className="min-w-0">
            <p className="ht-label mb-1">Trend</p>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-1.5 gap-y-0.5 text-[11px]">
              <span className="text-[9px] uppercase tracking-wider text-zinc-500">Habit</span>
              <span className="text-[9px] uppercase tracking-wider text-zinc-500">MTD %</span>
              <span className="text-[9px] uppercase tracking-wider text-zinc-500">MoM %</span>
              <span className="text-[9px] uppercase tracking-wider text-zinc-500">12 Wk</span>
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
            <p className="ht-label mt-2 mb-1">{monthName.slice(0, 3)}'s Daily Performance % Trend</p>
            <BarRow items={monthBars} height={44} labelEvery={4} />
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
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <button type="button" onClick={() => setShowAdd(true)} className="text-[11px] text-zinc-500 underline">+ Add habit</button>
          <p className="text-[10px] text-zinc-500">{year}/{MONTHS[month].slice(0, 3)}</p>
        </div>
        <div className="min-w-[220px] max-w-md flex-1">
          <p className="ht-label mb-0.5">Month score</p>
          <AreaChart values={monthWave} labels={[String(days[0]?.day ?? ''), String(days.at(-1)?.day ?? '')]} height={56} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="ht-table w-full min-w-[720px] border-collapse text-[11px]">
          <thead>
            <tr>
              <th rowSpan={2} className="w-[148px] px-1.5 py-1 text-left font-semibold text-zinc-600">Habits</th>
              {weeks.map((_, wi) => (
                <th key={wi} colSpan={7} className="px-1 py-1 text-center font-semibold uppercase tracking-wider text-zinc-500">Week {wi + 1}</th>
              ))}
            </tr>
            <tr>
              {weeks.map((week, wi) => (
                Array.from({ length: 7 }, (_, wd) => {
                  const cell = week.find((d) => d.weekdayIdx === wd);
                  return (
                    <th key={`${wi}-${wd}`} className="px-0.5 py-0.5 text-center font-medium text-zinc-500">
                      <div className="text-[8px]">{WEEKDAYS[wd]}</div>
                      <div className="text-[9px] tabular-nums text-zinc-400">{cell ? cell.day : ''}</div>
                    </th>
                  );
                })
              ))}
            </tr>
          </thead>
          <tbody>
            {habits.map((h) => (
              <tr key={h.id}>
                <td className="px-1.5 py-0.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-zinc-700">{h.emoji} {h.name}</span>
                    <button type="button" onClick={() => onRemove(h.id)} className="text-[9px] text-zinc-400 hover:text-zinc-700">×</button>
                  </div>
                </td>
                {weeks.map((week, wi) => (
                  Array.from({ length: 7 }, (_, wd) => {
                    const cell = week.find((d) => d.weekdayIdx === wd);
                    if (!cell) return <td key={`${wi}-${wd}`} className="h-8" />;
                    const on = isDone(done, h.id, cell.dateStr);
                    const isToday = cell.dateStr === today;
                    return (
                      <td key={cell.dateStr} className="px-0.5 py-0.5 text-center">
                        <button
                          type="button"
                          onClick={() => onToggle(h.id, cell.dateStr)}
                          className={`inline-block h-[18px] w-[18px] ${isToday ? 'ring-1 ring-zinc-500' : ''}`}
                          style={{ background: on ? '#3f3f46' : 'transparent', border: '1px solid #71717a' }}
                          aria-label={`${h.name} ${cell.dateStr}`}
                        />
                      </td>
                    );
                  })
                ))}
              </tr>
            ))}
            <tr>
              <td className="px-1.5 py-1 text-[10px] uppercase tracking-wider text-zinc-500">Weekly completion %</td>
              {weeks.map((week, wi) => (
                <td key={wi} colSpan={7} className="px-1 py-1 text-center text-[12px] font-semibold tabular-nums text-zinc-800">
                  {Math.round(weekPct(habits, week, done) * 100)}%
                </td>
              ))}
            </tr>
          </tbody>
        </table>
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
        <table className="ht-table w-full min-w-[720px] border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="w-[148px] px-1.5 py-1 text-left font-semibold text-zinc-600">Weekly habit %</th>
              {weeks.map((_, wi) => (
                <th key={wi} className="px-1 py-1 text-center font-semibold text-zinc-500">Week {wi + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {habits.map((h) => (
              <tr key={h.id}>
                <td className="truncate px-1.5 py-1 text-zinc-700">{h.emoji} {h.name}</td>
                {weeks.map((week, wi) => {
                  const pct = habitPct(h, week, done);
                  return (
                    <td key={wi} className="px-1 py-1 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className="w-8 tabular-nums text-zinc-700">{Math.round(pct * 100)}%</span>
                        <MiniBar value={pct} />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <p className="ht-label mb-1">Lifetime progress</p>
        <p className="mb-1 text-[22px] font-semibold tabular-nums text-zinc-800">{life.toFixed(2)}%</p>
        <AreaChart values={monthWave} height={64} />
      </div>
    </div>
  );
}

export function DashView({
  habits, days, weeks, done, monthLabel,
}: {
  habits: Habit[];
  days: DayCell[];
  weeks: DayCell[][];
  done: Set<string>;
  monthLabel: string;
}) {
  const monthScores = dailyVector(habits, days, done);
  const weekdayAvg = WEEKDAYS.map((_, wd) => {
    const subset = days.filter((d) => d.weekdayIdx === wd);
    if (!subset.length) return 0;
    return subset.reduce((s, d) => s + countOn(habits, d.dateStr, done), 0) / subset.length;
  });
  const weekdayPct = WEEKDAYS.map((_, wd) => {
    const subset = days.filter((d) => d.weekdayIdx === wd);
    if (!subset.length) return 0;
    return subset.reduce((s, d) => s + rateOn(habits, d.dateStr, done), 0) / subset.length;
  });
  const weekCols = weeks.map((_, i) => ({ key: String(i), label: `W${i + 1}` }));
  return (
    <div className="space-y-8 pb-8">
      <section>
        <p className="mb-3 text-[13px] font-semibold text-zinc-800">Monthly Overview · {monthLabel}</p>
        <div className="grid grid-cols-12 items-start gap-x-4 gap-y-6">
          <div className="col-span-12 xl:col-span-6">
            <p className="ht-label mb-1">Monthly Habits Count (day breakdown)</p>
            <Sheet showAvgSum rows={habits.map((h) => ({ key: h.id, label: `${h.emoji} ${h.name}` }))} cols={days.map((d) => ({ key: d.dateStr, label: String(d.day) }))} value={(hid, date) => (isDone(done, hid, date) ? 1 : 0)} />
            <p className="ht-label mt-3 mb-1">Avg Completed Habits by Day of week</p>
            <BarRow items={WEEKDAYS.map((d, i) => ({ key: `${d}${i}`, value: weekdayAvg[i], label: d }))} height={130} showValue raw />
          </div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3">
            <p className="ht-label mb-1">Monthly completion % by habits</p>
            <HeatRatio rows={habits.map((h) => ({ key: h.id, label: `${h.emoji} ${h.name}` }))} cols={[...weekCols, { key: 'all', label: 'All' }]} value={(hid, col) => { const habit = habits.find((h) => h.id === hid); if (col === 'all') return habitPct(habit, days, done); return habitPct(habit, weeks[Number(col)] ?? [], done); }} />
            <p className="ht-label mt-3 mb-1">Monthly Habit Completion %</p>
            <BarRow items={habits.map((h) => ({ key: h.id, value: habitPct(h, days, done), label: h.emoji }))} height={130} showValue />
          </div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3">
            <p className="ht-label mb-1">Daily completion % score</p>
            <HeatDays habits={habits} days={days} done={done} showLabel />
            <p className="ht-label mt-3 mb-1">Daily completion % by weekday</p>
            <BarRow items={WEEKDAYS.map((d, i) => ({ key: `p${d}${i}`, value: weekdayPct[i], label: d }))} height={130} showValue />
          </div>
        </div>
      </section>
      <section>
        <p className="mb-3 text-[13px] font-semibold text-zinc-800">Weekly Overview</p>
        <div className="grid grid-cols-12 items-start gap-x-4 gap-y-6">
          <div className="col-span-12 xl:col-span-5">
            <p className="ht-label mb-1">Weekly Completed Habits (day breakdown)</p>
            {weeks.map((week, wi) => (
              <div key={wi} className="mb-3">
                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Week {wi + 1}</p>
                <Sheet rows={habits.map((h) => ({ key: h.id, label: `${h.emoji} ${h.name}` }))} cols={week.map((d) => ({ key: d.dateStr, label: `${WEEKDAYS[d.weekdayIdx]}${d.day}` }))} value={(hid, date) => (isDone(done, hid, date) ? 1 : 0)} showAvgSum />
              </div>
            ))}
          </div>
          <div className="col-span-12 md:col-span-6 xl:col-span-4">
            <p className="ht-label mb-1">Weekly Completion % by habits</p>
            <HeatRatio rows={habits.map((h) => ({ key: h.id, label: `${h.emoji} ${h.name}` }))} cols={weekCols} value={(hid, col) => habitPct(habits.find((h) => h.id === hid), weeks[Number(col)] ?? [], done)} cell={28} />
            <p className="ht-label mt-3 mb-1">Weekly completion %</p>
            <BarRow items={weeks.map((w, i) => ({ key: `w${i}`, value: weekPct(habits, w, done), label: `W${i + 1}` }))} height={140} showValue />
          </div>
          <div className="col-span-12 md:col-span-6 xl:col-span-3">
            <p className="ht-label mb-1">Daily Completion % score across each week</p>
            {weeks.map((week, wi) => (
              <div key={wi} className="mb-2">
                <p className="mb-0.5 text-[10px] text-zinc-500">Week {wi + 1}</p>
                <HeatDays habits={habits} days={week} done={done} showLabel />
              </div>
            ))}
            <p className="ht-label mt-3 mb-1">Daily score this month</p>
            <BarRow items={days.map((d, i) => ({ key: d.dateStr, value: monthScores[i] ?? 0, label: String(d.day) }))} height={110} labelEvery={2} />
          </div>
        </div>
      </section>
    </div>
  );
}

export function InsightsView({
  habits, days, weeks, done,
}: {
  habits: Habit[];
  days: DayCell[];
  weeks: DayCell[][];
  done: Set<string>;
}) {
  const scores = dailyVector(habits, days, done);
  const habitRates = habits.map((h) => ({ h, pct: habitPct(h, days, done) }));
  const ranked = [...habitRates].sort((a, b) => b.pct - a.pct);
  const bestH = ranked[0];
  const worstH = ranked[ranked.length - 1];
  const dayRates = days.map((d, i) => ({ d, pct: scores[i] ?? 0 }));
  const bestD = dayRates.reduce((a, b) => (b.pct > a.pct ? b : a), dayRates[0]);
  const worstD = dayRates.reduce((a, b) => (b.pct < a.pct ? b : a), dayRates[0]);
  const weekRates = weeks.map((w, i) => ({ i, pct: weekPct(habits, w, done) }));
  const bestW = weekRates.reduce((a, b) => (b.pct > a.pct ? b : a), weekRates[0]);
  const worstW = weekRates.reduce((a, b) => (b.pct < a.pct ? b : a), weekRates[0]);
  const avgW = weekRates.length ? weekRates.reduce((s, w) => s + w.pct, 0) / weekRates.length : 0;
  const series = habits.map((h) => days.map((d) => (isDone(done, h.id, d.dateStr) ? 1 : 0)));
  const corr: number[][] = habits.map((_, i) => habits.map((__, j) => (i === j ? 1 : pearson(series[i] ?? [], series[j] ?? []))));
  let most = { a: '', b: '', v: -2 };
  let least = { a: '', b: '', v: 2 };
  habits.forEach((ha, i) => {
    habits.forEach((hb, j) => {
      if (i >= j) return;
      const v = corr[i]?.[j] ?? 0;
      if (v > most.v) most = { a: ha.name, b: hb.name, v };
      if (v < least.v) least = { a: ha.name, b: hb.name, v };
    });
  });
  const bestIdx = Math.max(0, bestH ? habits.findIndex((h) => h.id === bestH.h.id) : 0);
  const worstIdx = Math.max(0, worstH ? habits.findIndex((h) => h.id === worstH.h.id) : 0);
  const bestSeries = series[bestIdx] ?? [];
  const worstSeries = series[worstIdx] ?? [];
  const fourteen = weekChunks(14);
  const priorWeeks = fourteen.slice(0, 7);
  const recentWeeks = fourteen.slice(7, 14);
  const habitTrend = (h: Habit, chunks: string[][]) => chunks.map((chunk) => (chunk.length ? chunk.filter((d) => isDone(done, h.id, d)).length / chunk.length : 0));
  const overallTrend = (chunks: string[][]) => chunks.map((chunk) => (chunk.length && habits.length ? chunk.reduce((s, d) => s + rateOn(habits, d, done), 0) / chunk.length : 0));
  const Call = ({ title, name, pct, cap }: { title: string; name: string; pct: number; cap: string }) => (
    <div className="border-b border-zinc-200 py-2">
      <p className="text-[9px] uppercase tracking-wider text-zinc-500">{title}</p>
      <p className="text-[15px] font-semibold leading-tight text-zinc-800">{name}</p>
      <p className="text-[13px] font-semibold tabular-nums text-zinc-700">{Math.round(pct * 100)}%</p>
      <p className="text-[10px] text-zinc-500">{cap}</p>
    </div>
  );
  return (
    <div className="ht-hscroll">
      <section className="ht-pane">
        <p className="mb-3 text-[13px] font-semibold text-zinc-800">7-Week Habit Trend (Prior vs Recent)</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="md:col-span-2 xl:col-span-3">
            <p className="ht-label mb-1">Overall</p>
            <DualArea a={overallTrend(recentWeeks)} b={overallTrend(priorWeeks)} height={160} />
            <div className="mt-0.5 flex gap-4 text-[10px] text-zinc-500">
              <span>── Recent 7 weeks</span>
              <span className="text-zinc-400">── Prior 7 weeks</span>
            </div>
          </div>
          {habits.map((h) => (
            <div key={h.id}>
              <p className="ht-label mb-1">{h.emoji} {h.name}</p>
              <DualArea a={habitTrend(h, recentWeeks)} b={habitTrend(h, priorWeeks)} height={110} />
            </div>
          ))}
        </div>
      </section>
      <section className="ht-pane">
        <p className="mb-3 text-[13px] font-semibold text-zinc-800">Best and Worst Habits</p>
        <div className="grid grid-cols-12 items-start gap-4">
          <div className="col-span-12 md:col-span-4 xl:col-span-3">
            <Call title="Best Habit So Far" name={bestH ? `${bestH.h.emoji} ${bestH.h.name}` : '—'} pct={bestH?.pct ?? 0} cap="highest completion %" />
            <Call title="Worst Habit So Far" name={worstH ? `${worstH.h.emoji} ${worstH.h.name}` : '—'} pct={worstH?.pct ?? 0} cap="lowest completion %" />
            <Call title="Best Week so Far" name={bestW ? `WEEK ${bestW.i + 1}` : '—'} pct={bestW?.pct ?? 0} cap="highest weekly completion" />
            <Call title="Worst Week so Far" name={worstW ? `WEEK ${worstW.i + 1}` : '—'} pct={worstW?.pct ?? 0} cap="lowest weekly completion" />
            <Call title="Best Day (So Far)" name={bestD ? `${WEEKDAYS[bestD.d.weekdayIdx]} ${bestD.d.day}` : '—'} pct={bestD?.pct ?? 0} cap="best daily score" />
            <Call title="Worst Day (So Far)" name={worstD ? `${WEEKDAYS[worstD.d.weekdayIdx]} ${worstD.d.day}` : '—'} pct={worstD?.pct ?? 0} cap="lowest daily score" />
          </div>
          <div className="col-span-12 md:col-span-8 xl:col-span-9">
            <p className="ht-label mb-1">Best vs worst habit vs overall</p>
            <MultiArea series={[{ values: bestSeries }, { values: worstSeries }, { values: scores }]} height={170} />
            <div className="mt-0.5 flex gap-4 text-[10px] text-zinc-500">
              <span>Best habit</span><span>Worst habit</span><span>Overall</span>
            </div>
            <p className="ht-label mt-4 mb-1">Weekly Score Distribution</p>
            <BarRow items={weekRates.map((w) => ({ key: `w${w.i}`, value: w.pct, label: `W${w.i + 1}` }))} height={120} showValue />
            <p className="ht-label mt-4 mb-1">Best week vs worst week vs average</p>
            <MultiArea series={[{ values: weeks[bestW?.i ?? 0]?.map((d) => rateOn(habits, d.dateStr, done)) ?? [] }, { values: weeks[worstW?.i ?? 0]?.map((d) => rateOn(habits, d.dateStr, done)) ?? [] }, { values: weeks.map(() => avgW) }]} height={140} />
          </div>
        </div>
      </section>
      <section className="ht-pane">
        <p className="mb-3 text-[13px] font-semibold text-zinc-800">Habit Correlation (Weekly)</p>
        <div className="mb-3 grid grid-cols-2 gap-3 text-[12px] md:grid-cols-4">
          <div>
            <p className="ht-label">Most correlated</p>
            <p className="font-semibold text-zinc-800">{most.a && most.b ? `${most.a} × ${most.b}` : '—'}</p>
            <p className="tabular-nums text-zinc-600">{most.v > -2 ? most.v.toFixed(2) : '—'}</p>
          </div>
          <div>
            <p className="ht-label">Least correlated</p>
            <p className="font-semibold text-zinc-800">{least.a && least.b ? `${least.a} × ${least.b}` : '—'}</p>
            <p className="tabular-nums text-zinc-600">{least.v < 2 ? least.v.toFixed(2) : '—'}</p>
          </div>
          <div>
            <p className="ht-label">Highest %</p>
            <p className="font-semibold text-zinc-800">{bestH ? `${bestH.h.emoji} ${bestH.h.name}` : '—'}</p>
            <p className="tabular-nums text-zinc-600">{bestH ? `${Math.round(bestH.pct * 100)}%` : '—'}</p>
          </div>
          <div>
            <p className="ht-label">Lowest %</p>
            <p className="font-semibold text-zinc-800">{worstH ? `${worstH.h.emoji} ${worstH.h.name}` : '—'}</p>
            <p className="tabular-nums text-zinc-600">{worstH ? `${Math.round(worstH.pct * 100)}%` : '—'}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="ht-table border-collapse text-[10px] tabular-nums">
            <thead>
              <tr>
                <th className="px-1 py-1 text-left text-zinc-500" />
                {habits.map((h) => <th key={h.id} className="px-1 py-1 text-center text-zinc-500">{h.emoji}</th>)}
              </tr>
            </thead>
            <tbody>
              {habits.map((h, i) => (
                <tr key={h.id}>
                  <td className="truncate px-1 py-1 text-zinc-600">{h.name}</td>
                  {habits.map((__, j) => {
                    const v = corr[i]?.[j] ?? 0;
                    return (
                      <td key={`${i}-${j}`} className="h-9 w-9 px-1 py-1 text-center" style={{ background: i === j ? heatGrey(1) : corrFill(v), color: Math.abs(v) > 0.45 ? '#18181b' : '#3f3f46' }}>
                        {v.toFixed(2)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="ht-label mb-1">Best habit vs overall</p>
            <DualArea a={bestSeries} b={scores} height={110} />
            <ScatterTrend xs={bestSeries} ys={scores} />
          </div>
          <div>
            <p className="ht-label mb-1">Worst habit vs overall</p>
            <DualArea a={worstSeries} b={scores} height={110} />
            <ScatterTrend xs={worstSeries} ys={scores} />
          </div>
        </div>
      </section>
    </div>
  );
}
