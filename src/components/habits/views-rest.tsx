import type { Habit } from '@/lib/types';
import { BarRow, countOn, rateOn } from '@/components/habits/widgets';
import { MONTHS, WEEKDAYS, isDone, monthDays, weekdayIdx, type DayCell } from '@/lib/habit-stats';

function habitPct(h: Habit | undefined, days: { dateStr: string }[], done: Set<string>) {
  if (!h || !days.length) return 0;
  return days.filter((d) => isDone(done, h.id, d.dateStr)).length / days.length;
}

export function DashView({
  habits, done, monthLabel, year = new Date().getFullYear(),
}: {
  habits: Habit[];
  days?: DayCell[];
  weeks?: DayCell[][];
  done: Set<string>;
  monthLabel: string;
  year?: number;
}) {
  const now = new Date();
  const lastMonth = year < now.getFullYear() ? 11 : year > now.getFullYear() ? -1 : now.getMonth();
  const months = Array.from({ length: Math.max(0, lastMonth + 1) }, (_, m) => ({
    i: m, label: MONTHS[m].slice(0, 3), days: monthDays(year, m),
  }));
  const yearDates: string[] = [];
  months.forEach((m) => m.days.forEach((d) => yearDates.push(d.dateStr)));
  const yWeeks: string[][] = [];
  let bucket: string[] = [];
  yearDates.forEach((d) => {
    if (weekdayIdx(d) === 0 && bucket.length) { yWeeks.push(bucket); bucket = []; }
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
  const binOf = (pct: number) => Math.max(0, Math.min(9, Math.ceil(Math.max(0, Math.min(1, pct)) * 10) - 1));
  const monthWeekdayCount = (mi: number, wd: number) => {
    const subset = months[mi]?.days.filter((d) => d.weekdayIdx === wd) ?? [];
    if (!subset.length) return 0;
    return mean(subset.map((d) => countOn(habits, d.dateStr, done)));
  };
  const habitMonthPct = (h: Habit, mi: number) => habitPct(h, months[mi]?.days ?? [], done);
  const monthBinCount = (mi: number, bi: number) => (months[mi]?.days ?? []).filter((d) => binOf(rateOn(habits, d.dateStr, done)) === bi).length;
  const weekDayCount = (wi: number, wd: number) => {
    const cell = (yWeeks[wi] ?? []).find((d) => weekdayIdx(d) === wd);
    return cell == null ? null : countOn(habits, cell, done);
  };
  const habitWeekPct = (h: Habit, wi: number) => habitPct(h, (yWeeks[wi] ?? []).map((dateStr) => ({ dateStr })), done);
  const weekBinCount = (wi: number, bi: number) => (yWeeks[wi] ?? []).filter((d) => binOf(rateOn(habits, d, done)) === bi).length;
  const weekdayPctYear = WEEKDAYS.map((_, wd) => {
    const subset = yearDates.filter((d) => weekdayIdx(d) === wd);
    return subset.length ? mean(subset.map((d) => rateOn(habits, d, done))) : 0;
  });
  const habitAvgs = habits.map((h) => months.map((m) => habitMonthPct(h, m.i)));
  const habitMean = habitAvgs.map(mean);
  const habitSd = habitAvgs.map(sd);
  const daysFull = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return (
    <div className="space-y-10 pb-10">
      <section>
        <p className="mb-3 text-[13px] font-semibold text-zinc-800">Monthly Overview · {monthLabel}</p>
        <div className="grid grid-cols-12 items-start gap-x-5 gap-y-8">
          <div className="col-span-12 xl:col-span-6">
            <p className="ht-label mb-1">Monthly Habits Count (day breakdown)</p>
            <HeatSheet rows={months.map((m) => ({ key: String(m.i), label: m.label }))} cols={[...daysFull.map((d, i) => ({ key: String(i), label: d })), { key: 'tot', label: 'Total' }]} value={(r, c) => { const mi = Number(r); return c === 'tot' ? WEEKDAYS.reduce((s, _, wd) => s + monthWeekdayCount(mi, wd), 0) : monthWeekdayCount(mi, Number(c)); }} max={Math.max(1, habits.length * 7)} digits={1} showAvg showSum />
            <p className="ht-label mt-4 mb-1">Avg completed habits by weekday</p>
            <BarRow items={daysFull.map((d, i) => ({ key: `aw${i}`, value: months.length ? mean(months.map((m) => monthWeekdayCount(m.i, i))) : 0, label: d }))} height={88} showValue raw />
          </div>
          <div className="col-span-12 xl:col-span-6">
            <p className="ht-label mb-1">Monthly Habits Count by habit</p>
            <HeatSheet rows={habits.map((h) => ({ key: h.id, label: `${h.emoji} ${h.name}` }))} cols={[...months.map((m) => ({ key: String(m.i), label: m.label })), { key: 'avg', label: 'Avg' }, { key: 'sd', label: 'SD' }]} value={(r, c) => { const h = habits.find((x) => x.id === r); if (!h) return 0; const series = months.map((m) => habitMonthPct(h, m.i)); if (c === 'avg') return mean(series); if (c === 'sd') return sd(series); return habitMonthPct(h, Number(c)); }} max={1} pct />
            <p className="ht-label mt-4 mb-1">Monthly Habit Completion % · Avg & SD</p>
            <CompareBars items={habits.map((h, i) => ({ label: h.emoji, a: habitMean[i] ?? 0, b: habitSd[i] ?? 0 }))} />
          </div>
          <div className="col-span-12 xl:col-span-7">
            <p className="ht-label mb-1">Daily completion % score</p>
            <HeatSheet rows={months.map((m) => ({ key: String(m.i), label: m.label }))} cols={bins.map((b) => ({ key: String(b), label: `${b}%` }))} value={(r, c) => monthBinCount(Number(r), bins.indexOf(Number(c)))} max={Math.max(1, ...months.map((m) => Math.max(1, ...bins.map((_, i) => monthBinCount(m.i, i)))))} showAvg showSum />
          </div>
          <div className="col-span-12 xl:col-span-5">
            <p className="ht-label mb-1">Daily completion % by weekday</p>
            <HBar items={daysFull.map((d, i) => ({ label: d, value: weekdayPctYear[i] ?? 0 }))} />
          </div>
        </div>
      </section>
      <section>
        <p className="mb-3 text-[13px] font-semibold text-zinc-800">Weekly Overview · {year}</p>
        <div className="grid grid-cols-12 items-start gap-x-5 gap-y-8">
          <div className="col-span-12 xl:col-span-4">
            <p className="ht-label mb-1">Weekly Completed Habits (Day breakdown)</p>
            <HeatSheet rows={yWeeks.map((_, i) => ({ key: String(i), label: `Week ${i + 1}` }))} cols={[...daysFull.map((d, i) => ({ key: String(i), label: d })), { key: 'avg', label: 'Avg' }]} value={(r, c) => { const wi = Number(r); if (c === 'avg') { const vals = WEEKDAYS.map((_, wd) => weekDayCount(wi, wd)).filter((v): v is number => v != null); return vals.length ? mean(vals) : 0; } return weekDayCount(wi, Number(c)) ?? 0; }} max={Math.max(1, habits.length)} />
            <p className="ht-label mt-3 mb-1">Avg habits completed / week</p>
            <BarRow items={yWeeks.map((_, i) => { const vals = WEEKDAYS.map((_, wd) => weekDayCount(i, wd)).filter((v): v is number => v != null); return { key: `wca${i}`, value: vals.length ? mean(vals) : 0, label: `W${i + 1}` }; })} height={90} showValue raw labelEvery={2} />
          </div>
          <div className="col-span-12 xl:col-span-4">
            <p className="ht-label mb-1">Weekly Completion % by Habits</p>
            <HeatSheet rows={habits.map((h) => ({ key: h.id, label: `${h.emoji} ${h.name}` }))} cols={yWeeks.map((_, i) => ({ key: String(i), label: `W${i + 1}` }))} value={(r, c) => { const h = habits.find((x) => x.id === r); return h ? habitWeekPct(h, Number(c)) : 0; }} max={1} pct />
            <p className="ht-label mt-3 mb-1">Avg weekly completion % by habit</p>
            <BarRow items={habits.map((h) => ({ key: h.id, value: mean(yWeeks.map((_, i) => habitWeekPct(h, i))), label: h.emoji }))} height={90} showValue />
          </div>
          <div className="col-span-12 xl:col-span-4">
            <p className="ht-label mb-1">Daily Completion % score across each week</p>
            <HeatSheet rows={yWeeks.map((_, i) => ({ key: String(i), label: `Week ${i + 1}` }))} cols={bins.map((b) => ({ key: String(b), label: `${b}%` }))} value={(r, c) => weekBinCount(Number(r), bins.indexOf(Number(c)))} max={Math.max(1, ...yWeeks.map((_, i) => Math.max(1, ...bins.map((__, bi) => weekBinCount(i, bi)))))} />
            <p className="ht-label mt-3 mb-1">Weekly daily-score average</p>
            <BarRow items={yWeeks.map((w, i) => ({ key: `wds${i}`, value: w.length ? mean(w.map((d) => rateOn(habits, d, done))) : 0, label: `W${i + 1}` }))} height={90} showValue labelEvery={2} />
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

function HeatSheet({ rows, cols, value, max = 1, pct = false, digits = 0, showAvg = false, showSum = false }: { rows: { key: string; label: string }[]; cols: { key: string; label: string }[]; value: (row: string, col: string) => number; max?: number; pct?: boolean; digits?: number; showAvg?: boolean; showSum?: boolean; }) {
  const grid = rows.map((r) => cols.map((c) => value(r.key, c.key)));
  const cap = Math.max(max, ...grid.flat(), 0.0001);
  const fmt = (v: number) => (pct ? `${Math.round(v * 100)}%` : digits ? v.toFixed(digits) : String(Math.round(v)));
  const colAvg = cols.map((_, j) => (rows.length ? grid.reduce((s, row) => s + row[j], 0) / rows.length : 0));
  const colSum = cols.map((_, j) => grid.reduce((s, row) => s + row[j], 0));
  return (
    <div className="overflow-x-auto">
      <table className="ht-table w-full border-collapse text-[10px] tabular-nums">
        <thead><tr><th className="px-1 py-0.5 text-left font-medium text-zinc-500" />{cols.map((c) => <th key={c.key} className="px-1 py-0.5 text-center font-medium text-zinc-500">{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key}>
              <td className="truncate px-1 py-0.5 text-left text-zinc-600">{r.label}</td>
              {grid[i].map((v, j) => { const tone = heatRYG(pct ? v : v / cap); return <td key={cols[j].key} className="px-1 py-0.5 text-center" style={{ background: tone.bg, color: tone.fg }}>{fmt(v)}</td>; })}
            </tr>
          ))}
          {showAvg ? <tr><td className="px-1 py-0.5 text-zinc-500">Avg</td>{colAvg.map((v, j) => <td key={`a${j}`} className="px-1 py-0.5 text-center text-zinc-700">{fmt(v)}</td>)}</tr> : null}
          {showSum ? <tr><td className="px-1 py-0.5 text-zinc-500">Sum</td>{colSum.map((v, j) => <td key={`s${j}`} className="px-1 py-0.5 text-center font-medium text-zinc-800">{pct ? fmt(v) : v.toFixed(digits)}</td>)}</tr> : null}
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
            <div className="w-[42%] bg-zinc-800" style={{ height: `${Math.max(6, it.a * 100)}%` }} />
            <div className="w-[42%] bg-zinc-400" style={{ height: `${Math.max(4, it.b * 200)}%` }} />
          </div>
          <span className="text-[8px] text-zinc-500">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

function HBar({ items }: { items: { label: string; value: number }[] }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between pl-10 text-[8px] text-zinc-400"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2">
          <span className="w-8 shrink-0 text-right text-[10px] text-zinc-500">{it.label}</span>
          <div className="h-3 flex-1 bg-zinc-100"><div className="h-full bg-zinc-800" style={{ width: `${Math.round(Math.max(0, Math.min(1, it.value)) * 100)}%` }} /></div>
          <span className="w-8 text-[10px] tabular-nums text-zinc-600">{Math.round(it.value * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

export { InsightsView } from './views-insights';
