import type { Habit } from '@/lib/types';
import { BarRow, DualArea, MultiArea, ScatterTrend, dailyVector, heatGrey, corrFill, rateOn } from '@/components/habits/widgets';
import { WEEKDAYS, isDone, lastNDays, pearson, type DayCell } from '@/lib/habit-stats';

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

export function InsightsView({ habits, days, weeks, done }: { habits: Habit[]; days: DayCell[]; weeks: DayCell[][]; done: Set<string>; }) {
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
            <div className="mt-0.5 flex gap-4 text-[10px] text-zinc-500"><span>── Recent 7 weeks</span><span className="text-zinc-400">── Prior 7 weeks</span></div>
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
          <div><p className="ht-label">Most correlated</p><p className="font-semibold text-zinc-800">{most.a && most.b ? `${most.a} × ${most.b}` : '—'}</p><p className="tabular-nums text-zinc-600">{most.v > -2 ? most.v.toFixed(2) : '—'}</p></div>
          <div><p className="ht-label">Least correlated</p><p className="font-semibold text-zinc-800">{least.a && least.b ? `${least.a} × ${least.b}` : '—'}</p><p className="tabular-nums text-zinc-600">{least.v < 2 ? least.v.toFixed(2) : '—'}</p></div>
          <div><p className="ht-label">Highest %</p><p className="font-semibold text-zinc-800">{bestH ? `${bestH.h.emoji} ${bestH.h.name}` : '—'}</p><p className="tabular-nums text-zinc-600">{bestH ? `${Math.round(bestH.pct * 100)}%` : '—'}</p></div>
          <div><p className="ht-label">Lowest %</p><p className="font-semibold text-zinc-800">{worstH ? `${worstH.h.emoji} ${worstH.h.name}` : '—'}</p><p className="tabular-nums text-zinc-600">{worstH ? `${Math.round(worstH.pct * 100)}%` : '—'}</p></div>
        </div>
        <div className="overflow-x-auto">
          <table className="ht-table border-collapse text-[10px] tabular-nums">
            <thead><tr><th className="px-1 py-1 text-left text-zinc-500" />{habits.map((h) => <th key={h.id} className="px-1 py-1 text-center text-zinc-500">{h.emoji}</th>)}</tr></thead>
            <tbody>
              {habits.map((h, i) => (
                <tr key={h.id}>
                  <td className="truncate px-1 py-1 text-zinc-600">{h.name}</td>
                  {habits.map((__, j) => { const v = corr[i]?.[j] ?? 0; return <td key={`${i}-${j}`} className="h-9 w-9 px-1 py-1 text-center" style={{ background: i === j ? heatGrey(1) : corrFill(v), color: Math.abs(v) > 0.45 ? '#18181b' : '#3f3f46' }}>{v.toFixed(2)}</td>; })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div><p className="ht-label mb-1">Best habit vs overall</p><DualArea a={bestSeries} b={scores} height={110} /><ScatterTrend xs={bestSeries} ys={scores} /></div>
          <div><p className="ht-label mb-1">Worst habit vs overall</p><DualArea a={worstSeries} b={scores} height={110} /><ScatterTrend xs={worstSeries} ys={scores} /></div>
        </div>
      </section>
    </div>
  );
}
