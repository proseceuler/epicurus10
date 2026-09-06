import type { Habit } from '@/lib/types';
import { BarRow, rateOn, countOn } from '@/components/habits/widgets';
import {
  MONTHS, WEEKDAYS, monthDays, weekdayIdx, type DayCell, isDone,
} from '@/lib/habit-stats';

function habitPct(h: Habit | undefined, days: { dateStr: string }[], done: Set<string>) {
  if (!h || !days.length) return 0;
  return days.filter((d) => isDone(done, h.id, d.dateStr)).length / days.length;
}

export function DashView({
  habits, done, monthLabel, year = new Date().getFullYear(),
}: {
  habits: Habit[];
  days: DayCell[];
  weeks: DayCell[][];
  done: Set<string>;
  monthLabel: string;
  year?: number;
}) {
  const now = new Date();
  const lastMonth = year < now.getFullYear() ? 11 : year > now.getFullYear() ? -1 : now.getMonth();
  const months = Array.from({ length: Math.max(0, lastMonth + 1) }, (_, m) => ({
    i: m,
    label: MONTHS[m].slice(0, 3),
    days: monthDays(year, m),
  }));
  const yearDates: string[] = [];
  months.forEach((m) => m.days.forEach((d) => yearDates.push(d.dateStr)));
  const yWeeks: string[][] = [];
  let bucket: string[] = [];
  yearDates.forEach((d) => {
    if (weekdayIdx(d) === 0 && bucket.length) {
      yWeeks.push(bucket);
      bucket = [];
    }
    bucket.push(d);
  });
  if (bucket.length) yWeeks.push(bucket);

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const sd = (xs: number[]) => {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length);
  };
  const bins = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const binOf = (pct: number) => {
    const x = Math.max(0, Math.min(1, pct));
    return Math.max(0, Math.min(9, Math.ceil(x * 10) - 1));
  };

  const monthWeekdayCount = (mi: number, wd: number) => {
    const subset = months[mi]?.days.filter((d) => d.weekdayIdx === wd) ?? [];
    if (!subset.length) return 0;
    return mean(subset.map((d) => countOn(habits, d.dateStr, done)));
  };
  const habitMonthPct = (h: Habit, mi: number) => habitPct(h, months[mi]?.days ?? [], done);
  const monthBinCount = (mi: number, bi: number) => {
    const days = months[mi]?.days ?? [];
    return days.filter((d) => binOf(rateOn(habits, d.dateStr, done)) === bi).length;
  };
  const weekDayCount = (wi: number, wd: number) => {
    const days = yWeeks[wi] ?? [];
    const cell = days.find((d) => weekdayIdx(d) === wd);
    if (!cell) return null;
    return countOn(habits, cell, done);
  };
  const habitWeekPct = (h: Habit, wi: number) => {
    const days = (yWeeks[wi] ?? []).map((dateStr) => ({ dateStr }));
    return habitPct(h, days, done);
  };
  const weekBinCount = (wi: number, bi: number) => {
    const days = yWeeks[wi] ?? [];
    return days.filter((d) => binOf(rateOn(habits, d, done)) === bi).length;
  };

  const habitMonthSeries = habits.map((h) => months.map((m) => habitMonthPct(h, m.i)));
  const habitWeekSeriesVals = habits.map((h) => yWeeks.map((_, i) => habitWeekPct(h, i)));
  const habitMean = habitMonthSeries.map(mean);
  const habitSd = habitMonthSeries.map(sd);
  const habitWeekMean = habitWeekSeriesVals.map(mean);
  const habitWeekSd = habitWeekSeriesVals.map(sd);

  const monthDist = bins.map((b, i) => ({
    key: String(b),
    value: months.reduce((s, m) => s + monthBinCount(m.i, i), 0),
    label: `${b}%`,
  }));
  const weekDist = bins.map((b, i) => ({
    key: `w${b}`,
    value: yWeeks.reduce((s, _, wi) => s + weekBinCount(wi, i), 0),
    label: `${b}%`,
  }));

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="space-y-10 pb-10">
      <section>
        <p className="mb-3 text-center text-[18px] font-semibold text-zinc-800">Monthly Overview · {monthLabel}</p>
        <div className="grid grid-cols-12 items-start gap-x-4 gap-y-7">
          <div className="col-span-12 lg:col-span-3">
            <p className="ht-label mb-1">Monthly Completed Habits (Day Breakdown)</p>
            <HeatSheet compact rows={months.map((m) => ({ key: String(m.i), label: m.label }))} cols={[...dayNames.map((d, i) => ({ key: String(i), label: d })), { key: 'tot', label: 'Total' }]} value={(r, c) => { const mi = Number(r); if (c === 'tot') return WEEKDAYS.reduce((s, _, wd) => s + monthWeekdayCount(mi, wd), 0); return monthWeekdayCount(mi, Number(c)); }} max={Math.max(1, habits.length * 5)} digits={1} showAvg showSum />
            <p className="ht-label mt-4 mb-1">Average Completed Habits by Day of Week</p>
            <BarRow items={dayNames.map((d, i) => ({ key: `aw${i}`, value: months.length ? mean(months.map((m) => monthWeekdayCount(m.i, i))) : 0, label: d }))} height={88} showValue raw />
          </div>
          <div className="col-span-12 lg:col-span-6">
            <p className="ht-label mb-1">Monthly Completion % by Habits</p>
            <HeatSheet rows={months.map((m) => ({ key: String(m.i), label: m.label }))} cols={[...habits.map((h) => ({ key: h.id, label: `${h.emoji} ${h.name}` })), { key: 'ovr', label: 'Overall' }]} value={(r, c) => { const mi = Number(r); if (c === 'ovr') { const days = months[mi]?.days ?? []; return days.length ? mean(days.map((d) => rateOn(habits, d.dateStr, done))) : 0; } const h = habits.find((x) => x.id === c); return h ? habitMonthPct(h, mi) : 0; }} max={1} pct digits={0} />
            <p className="ht-label mt-4 mb-1">Monthly Habit Completion % · Avg and SD</p>
            <CompareBars items={habits.map((h, i) => ({ label: h.emoji, a: habitMean[i] ?? 0, b: habitSd[i] ?? 0 }))} />
          </div>
          <div className="col-span-12 lg:col-span-3">
            <p className="ht-label mb-1">Daily Completion % Score across each Month</p>
            <HeatSheet compact rows={months.map((m) => ({ key: String(m.i), label: m.label }))} cols={bins.map((b) => ({ key: String(b), label: `${b}%` }))} value={(r, c) => monthBinCount(Number(r), bins.indexOf(Number(c)))} max={Math.max(1, ...months.map((m) => Math.max(1, ...bins.map((_, i) => monthBinCount(m.i, i)))))} digits={0} showAvg showSum />
            <p className="ht-label mt-4 mb-1">Daily Completion % Distribution Score</p>
            <BarRow items={monthDist} height={96} showValue raw />
          </div>
        </div>
      </section>
      <section>
        <p className="mb-3 text-center text-[18px] font-semibold text-zinc-800">Weekly Overview · {year}</p>
        <div className="grid grid-cols-12 items-start gap-x-4 gap-y-7">
          <div className="col-span-12 lg:col-span-3">
            <p className="ht-label mb-1">Weekly Completed Habits (Day Breakdown)</p>
            <HeatSheet compact rows={yWeeks.map((_, i) => ({ key: String(i), label: `WEEK ${i + 1}` }))} cols={[...dayNames.map((d, i) => ({ key: String(i), label: d })), { key: 'avg', label: 'Avg' }]} value={(r, c) => { const wi = Number(r); if (c === 'avg') { const vals = WEEKDAYS.map((_, wd) => weekDayCount(wi, wd)).filter((v): v is number => v != null); return vals.length ? mean(vals) : 0; } return weekDayCount(wi, Number(c)) ?? 0; }} max={Math.max(1, habits.length)} digits={0} />
            <p className="ht-label mt-3 mb-1">Avg habits completed / week</p>
            <BarRow items={yWeeks.map((_, i) => { const vals = WEEKDAYS.map((_, wd) => weekDayCount(i, wd)).filter((v): v is number => v != null); return { key: `wca${i}`, value: vals.length ? mean(vals) : 0, label: `W${i + 1}` }; })} height={90} showValue raw labelEvery={2} />
          </div>
          <div className="col-span-12 lg:col-span-6">
            <p className="ht-label mb-1">Weekly Completion % by Habits</p>
            <HeatSheet rows={yWeeks.map((_, i) => ({ key: String(i), label: `WEEK ${i + 1}` }))} cols={[...habits.map((h) => ({ key: h.id, label: `${h.emoji} ${h.name}` })), { key: 'ovr', label: 'Overall' }]} value={(r, c) => { const wi = Number(r); if (c === 'ovr') { const days = yWeeks[wi] ?? []; return days.length ? mean(days.map((d) => rateOn(habits, d, done))) : 0; } const h = habits.find((x) => x.id === c); return h ? habitWeekPct(h, wi) : 0; }} max={1} pct digits={0} />
            <p className="ht-label mt-3 mb-1">Avg weekly completion % by habit · Avg and SD</p>
            <CompareBars items={habits.map((h, i) => ({ label: h.emoji, a: habitWeekMean[i] ?? 0, b: habitWeekSd[i] ?? 0 }))} />
          </div>
          <div className="col-span-12 lg:col-span-3">
            <p className="ht-label mb-1">Daily Completion % Score across each Week</p>
            <HeatSheet compact rows={yWeeks.map((_, i) => ({ key: String(i), label: `WEEK ${i + 1}` }))} cols={bins.map((b) => ({ key: String(b), label: `${b}%` }))} value={(r, c) => weekBinCount(Number(r), bins.indexOf(Number(c)))} max={Math.max(1, ...yWeeks.map((_, i) => Math.max(1, ...bins.map((__, bi) => weekBinCount(i, bi)))))} digits={0} />
            <p className="ht-label mt-3 mb-1">Daily Completion % Distribution Score</p>
            <BarRow items={weekDist} height={90} showValue raw />
          </div>
        </div>
      </section>
    </div>
  );
}

function heatRYG(t: number) {
  const x = Math.max(0, Math.min(1, t));
  if (x <= 0) return { bg: '#f4f4f5', fg: '#a1a1aa' };
  if (x < 0.25) return { bg: '#ef4444', fg: '#fff' };
  if (x < 0.45) return { bg: '#f97316', fg: '#fff' };
  if (x < 0.62) return { bg: '#eab308', fg: '#18181b' };
  if (x < 0.82) return { bg: '#84cc16', fg: '#18181b' };
  return { bg: '#22c55e', fg: '#fff' };
}

function HeatSheet({
  rows, cols, value, max = 1, pct = false, digits = 0, showAvg = false, showSum = false, compact = false,
}: {
  rows: { key: string; label: string }[];
  cols: { key: string; label: string }[];
  value: (row: string, col: string) => number;
  max?: number;
  pct?: boolean;
  digits?: number;
  showAvg?: boolean;
  showSum?: boolean;
  compact?: boolean;
}) {
  const grid = rows.map((r) => cols.map((c) => value(r.key, c.key)));
  const cap = Math.max(max, ...grid.flat(), 0.0001);
  const fmt = (v: number) => (pct ? `${Math.round(v * 100)}%` : digits ? v.toFixed(digits) : String(Math.round(v)));
  const colAvg = cols.map((_, j) => (rows.length ? grid.reduce((s, row) => s + row[j], 0) / rows.length : 0));
  const colSum = cols.map((_, j) => grid.reduce((s, row) => s + row[j], 0));
  return (
    <div className="overflow-x-auto">
      <table className={`ht-table w-full border-collapse tabular-nums ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
        <thead>
          <tr>
            <th className="px-1 py-0.5 text-left font-medium text-zinc-500" />
            {cols.map((c) => <th key={c.key} className="px-0.5 py-0.5 text-center font-medium text-zinc-500">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key}>
              <td className="truncate px-1 py-0.5 text-left text-zinc-600">{r.label}</td>
              {grid[i].map((v, j) => {
                const tone = heatRYG(pct ? v : v / cap);
                return (
                  <td key={cols[j].key} className="px-0.5 py-0.5 text-center" style={{ background: tone.bg, color: tone.fg }}>
                    {fmt(v)}
                  </td>
                );
              })}
            </tr>
          ))}
          {showAvg ? (
            <tr>
              <td className="px-1 py-0.5 text-zinc-500">Avg</td>
              {colAvg.map((v, j) => <td key={`a${j}`} className="px-0.5 py-0.5 text-center text-zinc-700">{fmt(v)}</td>)}
            </tr>
          ) : null}
          {showSum ? (
            <tr>
              <td className="px-1 py-0.5 text-zinc-500">Sum</td>
              {colSum.map((v, j) => <td key={`s${j}`} className="px-0.5 py-0.5 text-center font-medium text-zinc-800">{pct ? fmt(v) : v.toFixed(digits)}</td>)}
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function CompareBars({ items }: { items: { label: string; a: number; b: number }[] }) {
  return (
    <div className="flex items-end gap-2" style={{ height: 96 }}>
      {items.map((it) => (
        <div key={it.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5" style={{ height: '100%' }}>
          <div className="flex w-full items-end justify-center gap-0.5" style={{ height: '78%' }}>
            <div className="w-[42%] bg-zinc-800" style={{ height: `${Math.max(6, it.a * 100)}%` }} title={`Avg ${Math.round(it.a * 100)}%`} />
            <div className="w-[42%] bg-zinc-400" style={{ height: `${Math.max(4, it.b * 200)}%` }} title={`SD ${Math.round(it.b * 100)}`} />
          </div>
          <span className="text-[8px] text-zinc-500">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

export { InsightsView } from './views-insights';
