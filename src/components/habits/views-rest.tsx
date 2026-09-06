import { type Dispatch, SetStateAction } from 'react';
import type { Habit } from '@/lib/types';
import BlackHole from '@/components/habits/BlackHole';
import {
  AreaChart, BarRow, DualArea, HeatDays, HeatRatio, MultiArea, ScatterTrend, Sheet,
  countOn, dailyVector, heatGrey, corrFill, rateOn,
} from '@/components/habits/widgets';
import {
  MONTHS, WEEKDAYS, isDone, lastNDays, pearson, type DayCell,
} from '@/lib/habit-stats';

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

function weekChunks(weeks: number) {
  const days = lastNDays(weeks * 7);
  const out: string[][] = [];
  for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
  return out;
}

function dayTone(pct: number) {
  if (pct >= 0.85) return { bg: '#22c55e', fg: '#fff' };
  if (pct >= 0.7) return { bg: '#84cc16', fg: '#18181b' };
  if (pct >= 0.5) return { bg: '#eab308', fg: '#18181b' };
  if (pct >= 0.3) return { bg: '#f97316', fg: '#fff' };
  if (pct > 0) return { bg: '#ef4444', fg: '#fff' };
  return { bg: '#f4f4f5', fg: '#a1a1aa' };
}

function barColor(pct: number) {
  if (pct >= 0.7) return '#22c55e';
  if (pct >= 0.4) return '#eab308';
  return '#ef4444';
}

function CompBar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="w-7 shrink-0 text-right text-[10px] tabular-nums text-zinc-700">{pct}%</span>
      <div className="h-2 min-w-0 flex-1 bg-zinc-100">
        <div className="h-full" style={{ width: `${pct}%`, background: barColor(value) }} />
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
    gridTemplateColumns: `minmax(200px, 240px) repeat(${n}, minmax(132px, 1fr))`,
    minWidth: 200 + n * 132,
  } as const;
  const lifePct = Math.max(0, Math.min(100, life));

  return (
    <div className="space-y-3 pb-6">
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
          <div className="flex items-end border-b border-zinc-200 px-2 pb-2">
            <span className="text-[13px] font-semibold text-zinc-700">Habits</span>
          </div>
          <div className="border-b border-zinc-200" style={{ gridColumn: '2 / -1' }}>
            <AreaChart values={monthWave} height={92} />
          </div>

          <div className="border-b border-zinc-100" />
          {weeks.map((_, wi) => (
            <div key={`wh-${wi}`} className="border-b border-zinc-100 py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Week {wi + 1}
            </div>
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
                        <button
                          type="button"
                          onClick={() => onToggle(h.id, cell.dateStr)}
                          className={`inline-block h-[13px] w-[13px] ${isToday ? 'ring-1 ring-zinc-600' : ''}`}
                          style={{ background: on ? '#3f3f46' : 'transparent', border: '1px solid #71717a' }}
                          aria-label={`${h.name} ${cell.dateStr}`}
                        />
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
                    <span
                      className="flex h-[16px] w-full items-center justify-center text-[8px] font-semibold tabular-nums"
                      style={{ background: tone.bg, color: tone.fg }}
                    >
                      {Math.round(pct * 100)}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={grid} className="items-start">
          <div className="px-2 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Lifetime Progress</p>
            <div className="mx-auto mt-1 w-[168px]">
              <BlackHole className="aspect-square w-full bg-transparent" />
            </div>
            <p className="mt-1 text-center text-[22px] font-semibold tabular-nums text-zinc-800">{life.toFixed(2)}%</p>
            <div className="mx-auto mt-1 h-1.5 w-[168px] bg-zinc-200">
              <div className="h-full bg-zinc-800" style={{ width: `${lifePct}%` }} />
            </div>
          </div>

          {weeks.map((week, wi) => {
            const wp = weekPct(habits, week, done);
            return (
              <div key={`wc-${wi}`} className="border-l border-zinc-100 px-2 pt-2">
                <div className="mb-1.5 flex items-end justify-between gap-2">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">Weekly Completion %</p>
                  <p className="text-[20px] font-semibold leading-none tabular-nums text-zinc-800">{Math.round(wp * 100)}%</p>
                </div>
                <div className="ht-table w-full text-[10px]">
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(72px,0.9fr)] border-b border-zinc-200 pb-0.5 text-[8px] font-semibold uppercase tracking-wider text-zinc-500">
                    <span>Habits</span>
                    <span>Weekly Completion %</span>
                  </div>
                  {habits.map((h) => {
                    const pct = habitPct(h, week, done);
                    return (
                      <div key={h.id} className="grid grid-cols-[minmax(0,1fr)_minmax(72px,0.9fr)] items-center gap-1 border-b border-zinc-100 py-1">
                        <span className="truncate text-zinc-700">{h.emoji} {h.name}</span>
                        <CompBar value={pct} />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
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
