import type { Dispatch, SetStateAction } from 'react';
import type { Habit, HabitCompletion } from '@/lib/types';
import BlackHole from '@/components/habits/BlackHole';
import {
  AlertRow, BarRow, HeatDays, HeatGrid, LinePair, MiniArea, Ring, Scatter, Spark, Stat, dailyVector,
} from '@/components/habits/widgets';
import {
  WEEKDAYS, isDone, lastNDays, pearson, greyFill, type DayCell,
} from '@/lib/habit-stats';

export type View = 'home' | 'track' | 'dash' | 'insights';

function Panel({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-zinc-800 bg-zinc-950/80 p-2.5 ${className}`}>
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">{title}</h3>
      {children}
    </section>
  );
}

function weekPct(habits: Habit[], week: DayCell[], done: Set<string>) {
  if (!habits.length || !week.length) return 0;
  const slots = habits.length * week.length;
  const got = week.reduce((s, d) => s + habits.filter((h) => isDone(done, h.id, d.dateStr)).length, 0);
  return slots ? got / slots : 0;
}

function habitPct(h: Habit, days: DayCell[], done: Set<string>) {
  if (!days.length) return 0;
  return days.filter((d) => isDone(done, h.id, d.dateStr)).length / days.length;
}

function dayPct(habits: Habit[], dateStr: string, done: Set<string>) {
  if (!habits.length) return 0;
  return habits.filter((h) => isDone(done, h.id, dateStr)).length / habits.length;
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
  const last7 = lastNDays(7);
  const weekScore = habits.length
    ? last7.reduce((s, d) => s + dayPct(habits, d, done), 0) / last7.length
    : 0;
  const todayScore = dayPct(habits, today, done);
  const bestDay = dailyScores.reduce((a, b) => (b.score > a.score ? b : a), dailyScores[0] ?? { date: today, score: 0 });
  const worstDay = dailyScores.reduce((a, b) => (b.score < a.score ? b : a), dailyScores[0] ?? { date: today, score: 0 });
  const todayDone = habits.length - todayLeft.length;

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
      <Panel title="Lifetime Progress" className="md:col-span-4">
        <BlackHole className="mx-auto h-40 w-40" percent={life} />
        <p className="mt-1 text-center text-[10px] text-zinc-500">{completions.length} logs</p>
      </Panel>
      <Panel title="Quick Actions" className="md:col-span-4">
        <div className="space-y-1 text-[11px]">
          <button type="button" onClick={() => onGo('track')} className="flex w-full items-center justify-between rounded-md bg-zinc-900 px-2 py-1.5 text-left text-zinc-200 hover:bg-zinc-800">
            <span>Log today</span><span className="text-zinc-500">{todayDone}/{habits.length}</span>
          </button>
          <button type="button" onClick={() => onGo('dash')} className="flex w-full items-center justify-between rounded-md bg-zinc-900 px-2 py-1.5 text-left text-zinc-200 hover:bg-zinc-800">
            <span>Open dashboard</span><span className="text-zinc-500">heatmaps</span>
          </button>
          <button type="button" onClick={() => onGo('insights')} className="flex w-full items-center justify-between rounded-md bg-zinc-900 px-2 py-1.5 text-left text-zinc-200 hover:bg-zinc-800">
            <span>View insights</span><span className="text-zinc-500">trends</span>
          </button>
        </div>
      </Panel>
      <Panel title="Alerts" className="md:col-span-4">
        <div className="space-y-1 text-[11px]">
          <AlertRow label="Today" value={`${todayDone}/${habits.length}`} tone={todayLeft.length ? 'pending' : 'ok'} />
          <AlertRow label="Week avg" value={`${Math.round(weekScore * 100)}%`} tone={weekScore >= 0.6 ? 'ok' : 'pending'} />
          <AlertRow label="Left today" value={todayLeft.length ? todayLeft.map((h) => h.emoji).join(' ') : 'clear'} tone={todayLeft.length ? 'pending' : 'ok'} />
        </div>
      </Panel>
      <Panel title="Daily Score Distribution" className="md:col-span-8">
        <BarRow items={dailyScores.map((d) => ({ key: d.date, value: d.score, label: d.date.slice(8) }))} height={88} labelEvery={2} />
      </Panel>
      <Panel title="Completion" className="md:col-span-4">
        <Ring value={todayScore * 100} label="today" />
        <div className="mt-2">
          <Ring value={life} label="lifetime" />
        </div>
      </Panel>
      <Panel title="Trend" className="md:col-span-12">
        <div className="grid grid-cols-2 gap-2 text-[11px] md:grid-cols-4">
          <Stat label="Best day" value={bestDay.date.slice(5)} meta={`${Math.round(bestDay.score * 100)}%`} />
          <Stat label="Lowest day" value={worstDay.date.slice(5)} meta={`${Math.round(worstDay.score * 100)}%`} />
          <Stat label="Habits" value={String(habits.length)} meta="active" />
          <Stat label="Week" value={`${Math.round(weekScore * 100)}%`} meta="avg" />
        </div>
      </Panel>
    </div>
  );
}

export function TrackView({
  habits, weeks, days, done, today, year, showAdd, draft, setDraft, setShowAdd, onToggle, onAdd, onRemove, life,
}: {
  habits: Habit[];
  weeks: DayCell[][];
  days: DayCell[];
  done: Set<string>;
  today: string;
  year: number;
  showAdd: boolean;
  draft: { name: string; emoji: string; goal: string };
  setDraft: Dispatch<SetStateAction<{ name: string; emoji: string; goal: string }>>;
  setShowAdd: (v: boolean) => void;
  onToggle: (habitId: string, dateStr: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  life: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
      <div className="lg:col-span-9">
        <div className="overflow-x-auto rounded-xl border border-zinc-800 p-2">
          <div className="min-w-max">
            <div className="mb-1 flex items-end gap-3 pl-[132px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-0.5">
                  <div className="flex">
                    {Array.from({ length: 7 }, (_, wd) => {
                      const cell = week.find((d) => d.weekdayIdx === wd);
                      return (
                        <div key={wd} className="w-7 text-center text-[8px] text-zinc-500">
                          {cell ? cell.day : ''}
                        </div>
                      );
                    })}
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full bg-zinc-200" style={{ width: `${Math.round(weekPct(habits, week, done) * 100)}%`, opacity: 0.35 + weekPct(habits, week, done) * 0.65 }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mb-0.5 flex gap-3 pl-[132px]">
              {weeks.map((_, wi) => (
                <div key={wi} className="flex">
                  {WEEKDAYS.map((d, i) => <div key={i} className="w-7 text-center text-[8px] text-zinc-600">{d}</div>)}
                </div>
              ))}
            </div>
            {habits.map((h) => (
              <div key={h.id} className="flex items-center gap-3 py-px">
                <div className="flex w-[120px] shrink-0 items-center gap-1">
                  <span className="w-[92px] truncate text-[11px] text-zinc-300">{h.emoji} {h.name}</span>
                  <button type="button" onClick={() => onRemove(h.id)} className="text-[9px] text-zinc-600 hover:text-zinc-300">×</button>
                </div>
                {weeks.map((week, wi) => (
                  <div key={wi} className="flex">
                    {Array.from({ length: 7 }, (_, wd) => {
                      const cell = week.find((d) => d.weekdayIdx === wd);
                      if (!cell) return <div key={wd} className="h-7 w-7" />;
                      const on = isDone(done, h.id, cell.dateStr);
                      const isToday = cell.dateStr === today;
                      return (
                        <button
                          key={cell.dateStr}
                          type="button"
                          onClick={() => onToggle(h.id, cell.dateStr)}
                          className={`m-0.5 h-6 w-6 rounded-[3px] ${isToday ? 'ring-1 ring-zinc-400' : ''}`}
                          style={{ background: on ? greyFill(1) : 'transparent', border: on ? '1px solid #d4d4d8' : '1px solid #3f3f46' }}
                          aria-label={`${h.name} ${cell.dateStr}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          {showAdd ? (
            <>
              <input value={draft.emoji} onChange={(e) => setDraft((d) => ({ ...d, emoji: e.target.value }))} className="w-10 rounded bg-zinc-900 px-1.5 py-1 text-center text-sm" />
              <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Habit name" className="min-w-0 flex-1 rounded bg-zinc-900 px-2 py-1 text-[12px] text-zinc-100" />
              <input value={draft.goal} onChange={(e) => setDraft((d) => ({ ...d, goal: e.target.value }))} className="w-12 rounded bg-zinc-900 px-1.5 py-1 text-center text-[12px]" />
              <button type="button" onClick={onAdd} className="rounded bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-950">Add</button>
              <button type="button" onClick={() => setShowAdd(false)} className="text-[11px] text-zinc-500">Cancel</button>
            </>
          ) : (
            <button type="button" onClick={() => setShowAdd(true)} className="rounded border border-zinc-800 px-2 py-1 text-[11px] text-zinc-300">+ Habit</button>
          )}
          <span className="ml-auto text-[10px] text-zinc-600">{year} · {days.length} days</span>
        </div>
      </div>
      <Panel title="Lifetime Progress" className="lg:col-span-3">
        <BlackHole className="mx-auto h-44 w-44" percent={life} />
        <div className="mt-2 space-y-1">
          {habits.slice(0, 6).map((h) => {
            const pct = habitPct(h, days, done);
            return (
              <div key={h.id}>
                <div className="mb-0.5 flex justify-between text-[10px] text-zinc-400">
                  <span className="truncate">{h.emoji} {h.name}</span>
                  <span className="tabular-nums">{Math.round(pct * 100)}%</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full bg-zinc-200" style={{ width: `${Math.round(pct * 100)}%`, opacity: 0.35 + pct * 0.65 }} />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
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
  const habitMonth = habits.map((h) => ({ key: h.id, value: habitPct(h, days, done), label: h.emoji }));
  const weekScores = weeks.map((w, i) => ({ key: `w${i}`, value: weekPct(habits, w, done), label: `W${i + 1}` }));
  const last7 = days.slice(-7);

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-zinc-400">{monthLabel}</p>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
        <Panel title="Monthly heatmap" className="lg:col-span-7">
          <HeatGrid habits={habits} cols={days} done={done} showPct />
        </Panel>
        <Panel title="Monthly completion %" className="lg:col-span-5">
          <BarRow items={habitMonth} height={110} />
        </Panel>
        <Panel title="Daily score distribution" className="lg:col-span-8">
          <BarRow items={days.map((d, i) => ({ key: d.dateStr, value: monthScores[i] ?? 0, label: String(d.day) }))} height={88} labelEvery={3} />
        </Panel>
        <Panel title="Month intensity" className="lg:col-span-4">
          <HeatDays habits={habits} days={days} done={done} showLabel />
        </Panel>
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
        <Panel title="Weekly heatmap" className="lg:col-span-7">
          <HeatGrid habits={habits} cols={last7} done={done} showPct />
        </Panel>
        <Panel title="Weekly completion %" className="lg:col-span-5">
          <BarRow items={weekScores} height={96} />
        </Panel>
      </div>
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
  const bestH = habitRates.reduce((a, b) => (b.pct > a.pct ? b : a), habitRates[0]);
  const worstH = habitRates.reduce((a, b) => (b.pct < a.pct ? b : a), habitRates[0]);
  const dayRates = days.map((d, i) => ({ d, pct: scores[i] ?? 0 }));
  const bestD = dayRates.reduce((a, b) => (b.pct > a.pct ? b : a), dayRates[0]);
  const worstD = dayRates.reduce((a, b) => (b.pct < a.pct ? b : a), dayRates[0]);
  const weekRates = weeks.map((w, i) => ({ i, pct: weekPct(habits, w, done) }));
  const bestW = weekRates.reduce((a, b) => (b.pct > a.pct ? b : a), weekRates[0]);
  const worstW = weekRates.reduce((a, b) => (b.pct < a.pct ? b : a), weekRates[0]);

  const series = habits.map((h) => days.map((d) => (isDone(done, h.id, d.dateStr) ? 1 : 0)));
  const corr: number[][] = habits.map((_, i) => habits.map((__, j) => (i === j ? 1 : pearson(series[i] ?? [], series[j] ?? []))));

  const bestIdx = bestH ? habits.findIndex((h) => h.id === bestH.h.id) : 0;
  const worstIdx = worstH ? habits.findIndex((h) => h.id === worstH.h.id) : 0;

  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
      <Panel title="Best habit" className="lg:col-span-3">
        <p className="text-[13px] font-medium text-zinc-100">{bestH ? `${bestH.h.emoji} ${bestH.h.name}` : '—'}</p>
        <p className="text-[11px] tabular-nums text-zinc-400">{bestH ? `${Math.round(bestH.pct * 100)}%` : ''}</p>
      </Panel>
      <Panel title="Needs work" className="lg:col-span-3">
        <p className="text-[13px] font-medium text-zinc-100">{worstH ? `${worstH.h.emoji} ${worstH.h.name}` : '—'}</p>
        <p className="text-[11px] tabular-nums text-zinc-400">{worstH ? `${Math.round(worstH.pct * 100)}%` : ''}</p>
      </Panel>
      <Panel title="Best day / week" className="lg:col-span-3">
        <p className="text-[13px] text-zinc-100">{bestD ? bestD.d.dateStr.slice(5) : '—'} · {bestD ? Math.round(bestD.pct * 100) : 0}%</p>
        <p className="text-[11px] text-zinc-400">W{(bestW?.i ?? 0) + 1} · {bestW ? Math.round(bestW.pct * 100) : 0}%</p>
      </Panel>
      <Panel title="Lowest day / week" className="lg:col-span-3">
        <p className="text-[13px] text-zinc-100">{worstD ? worstD.d.dateStr.slice(5) : '—'} · {worstD ? Math.round(worstD.pct * 100) : 0}%</p>
        <p className="text-[11px] text-zinc-400">W{(worstW?.i ?? 0) + 1} · {worstW ? Math.round(worstW.pct * 100) : 0}%</p>
      </Panel>
      <Panel title="Weekly score trend" className="lg:col-span-7">
        <MiniArea values={weekRates.map((w) => w.pct)} height={88} />
        <div className="mt-1 flex gap-2">
          {weekRates.map((w) => <Spark key={w.i} values={weeks[w.i]?.map((d) => dayPct(habits, d.dateStr, done)) ?? []} />)}
        </div>
      </Panel>
      <Panel title="Habit correlation" className="lg:col-span-5">
        <div className="overflow-x-auto">
          <div className="min-w-max">
            <div className="flex gap-px pl-16">
              {habits.map((h) => <div key={h.id} className="w-5 text-center text-[8px] text-zinc-500">{h.emoji}</div>)}
            </div>
            {habits.map((h, i) => (
              <div key={h.id} className="flex items-center gap-px">
                <div className="w-16 truncate text-[9px] text-zinc-500">{h.emoji} {h.name}</div>
                {habits.map((__, j) => {
                  const v = (corr[i]?.[j] ?? 0);
                  const t = (v + 1) / 2;
                  return <div key={`${i}-${j}`} className="h-5 w-5 rounded-[2px]" style={{ background: greyFill(t) }} title={`${v.toFixed(2)}`} />;
                })}
              </div>
            ))}
          </div>
        </div>
      </Panel>
      <Panel title="Best habit vs day score" className="lg:col-span-6">
        <Scatter a={series[bestIdx]} b={scores} />
        <LinePair a={series[bestIdx] ?? []} b={scores} />
      </Panel>
      <Panel title="Lowest habit vs day score" className="lg:col-span-6">
        <Scatter a={series[worstIdx]} b={scores} />
        <LinePair a={series[worstIdx] ?? []} b={scores} />
      </Panel>
    </div>
  );
}
