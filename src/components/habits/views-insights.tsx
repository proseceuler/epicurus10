import type { Habit } from '@/lib/types';
import {
  BarRow, DualArea, MultiArea, heatGrey, corrFill, rateOn,
} from '@/components/habits/widgets';
import {
  WEEKDAYS, isDone, lastNDays, pearson, type DayCell,
} from '@/lib/habit-stats';

const HCOLORS = ['#22c55e', '#eab308', '#f97316', '#22d3ee', '#ef4444', '#a855f7', '#3b82f6', '#2563eb', '#ec4899', '#f59e0b', '#14b8a6', '#84cc16'];

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
function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function linreg(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return { a: 0, b: 0, r2: 0 };
  const x = xs.slice(0, n);
  const y = ys.slice(0, n);
  const mx = mean(x);
  const my = mean(y);
  let num = 0, den = 0, ssy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    den += (x[i] - mx) ** 2;
    ssy += (y[i] - my) ** 2;
  }
  const b = den ? num / den : 0;
  const a = my - b * mx;
  const r2 = ssy && den ? (num * num) / (den * ssy) : 0;
  return { a, b, r2 };
}
function ColorDual({ a, b, color, height = 160 }: { a: number[]; b: number[]; color: string; height?: number }) {
  const w = 280, h = height;
  const toPts = (values: number[]) => {
    const n = Math.max(values.length - 1, 1);
    return values.map((v, i) => ({ x: (i / n) * w, y: h - Math.max(0, Math.min(1, v)) * (h - 12) - 6 }));
  };
  const path = (values: number[]) => {
    const p = toPts(values);
    if (!p.length) return '';
    let d = `M${p[0].x.toFixed(1)},${p[0].y.toFixed(1)}`;
    for (let i = 1; i < p.length; i++) d += ` L${p[i].x.toFixed(1)},${p[i].y.toFixed(1)}`;
    return d;
  };
  const pa = path(a), pb = path(b);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" preserveAspectRatio="none">
      {pb ? <path d={`${pb} L${w},${h} L0,${h} Z`} fill={color} opacity="0.18" /> : null}
      {pa ? <path d={`${pa} L${w},${h} L0,${h} Z`} fill={color} opacity="0.42" /> : null}
      {pb ? <path d={pb} fill="none" stroke={color} strokeWidth="1.4" opacity="0.55" /> : null}
      {pa ? <path d={pa} fill="none" stroke={color} strokeWidth="2" /> : null}
    </svg>
  );
}
function ScatterReg({ xs, ys, color = '#18181b', height = 160, labelX, labelY }: { xs: number[]; ys: number[]; color?: string; height?: number; labelX?: string; labelY?: string }) {
  const n = Math.min(xs.length, ys.length);
  const w = 280, h = height, p = 18;
  const X = (v: number) => p + Math.max(0, Math.min(1, v)) * (w - p * 2);
  const Y = (v: number) => h - p - Math.max(0, Math.min(1, v)) * (h - p * 2);
  const { a, b, r2 } = linreg(xs.slice(0, n), ys.slice(0, n));
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
        <line x1={p} y1={h - p} x2={w - p} y2={h - p} stroke="#e4e4e7" />
        <line x1={p} y1={p} x2={p} y2={h - p} stroke="#e4e4e7" />
        <line x1={X(0)} y1={Y(a)} x2={X(1)} y2={Y(a + b)} stroke={color} strokeWidth="1.6" />
        {Array.from({ length: n }, (_, i) => (
          <circle key={i} cx={X(xs[i] ?? 0)} cy={Y(ys[i] ?? 0)} r={i === 0 ? 4.2 : 2.6} fill={i === 0 ? color : '#18181b'} opacity={i === 0 ? 1 : 0.7} />
        ))}
      </svg>
      <div className="mt-0.5 flex justify-between text-[9px] text-zinc-500">
        <span>{labelX ?? 'x'}</span><span>R2 {r2.toFixed(3)}</span><span>{labelY ?? 'y'}</span>
      </div>
    </div>
  );
}

export function InsightsView({ habits, days, weeks, done }: { habits: Habit[]; days: DayCell[]; weeks: DayCell[][]; done: Set<string> }) {
  const scores = days.map((d) => rateOn(habits, d.dateStr, done));
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
  let most = { ai: 0, bi: 1, a: '', b: '', v: -2 };
  let least = { ai: 0, bi: 1, a: '', b: '', v: 2 };
  habits.forEach((ha, i) => {
    habits.forEach((hb, j) => {
      if (i >= j) return;
      const v = corr[i]?.[j] ?? 0;
      if (v > most.v) most = { ai: i, bi: j, a: ha.name, b: hb.name, v };
      if (v < least.v) least = { ai: i, bi: j, a: ha.name, b: hb.name, v };
    });
  });
  const partners = habits.map((_, i) => {
    let bestJ = i === 0 ? 1 : 0, worstJ = bestJ, bestV = -2, worstV = 2;
    habits.forEach((__, j) => {
      if (i === j) return;
      const v = corr[i]?.[j] ?? 0;
      if (v > bestV) { bestV = v; bestJ = j; }
      if (v < worstV) { worstV = v; worstJ = j; }
    });
    const pcts = weeks.map((w) => habitPct(habits[i], w, done));
    return { bestJ, worstJ, bestV, worstV, hi: pcts.length ? Math.max(...pcts) : 0, lo: pcts.length ? Math.min(...pcts) : 0 };
  });
  const daySeries = WEEKDAYS.map((_, wd) => days.filter((d) => d.weekdayIdx === wd).map((d) => rateOn(habits, d.dateStr, done)));
  const nAlign = Math.min(...daySeries.map((s) => s.length), 12) || 0;
  const aligned = daySeries.map((s) => s.slice(-nAlign));
  const dayCorr: number[][] = WEEKDAYS.map((_, i) => WEEKDAYS.map((__, j) => (i === j ? 1 : pearson(aligned[i] ?? [], aligned[j] ?? []))));
  let dayMost = { ai: 0, bi: 1, v: -2 };
  let dayLeast = { ai: 0, bi: 1, v: 2 };
  WEEKDAYS.forEach((_, i) => {
    WEEKDAYS.forEach((__, j) => {
      if (i >= j) return;
      const v = dayCorr[i]?.[j] ?? 0;
      if (v > dayMost.v) dayMost = { ai: i, bi: j, v };
      if (v < dayLeast.v) dayLeast = { ai: i, bi: j, v };
    });
  });
  const dayPartners = WEEKDAYS.map((_, i) => {
    let bestJ = i === 0 ? 1 : 0, worstJ = bestJ, bestV = -2, worstV = 2;
    WEEKDAYS.forEach((__, j) => {
      if (i === j) return;
      const v = dayCorr[i]?.[j] ?? 0;
      if (v > bestV) { bestV = v; bestJ = j; }
      if (v < worstV) { worstV = v; worstJ = j; }
    });
    const vals = aligned[i] ?? [];
    return { bestJ, worstJ, bestV, worstV, hi: vals.length ? Math.max(...vals) : 0, lo: vals.length ? Math.min(...vals) : 0 };
  });
  const fourteen = weekChunks(14);
  const priorWeeks = fourteen.slice(0, 7);
  const recentWeeks = fourteen.slice(7, 14);
  const habitTrend = (h: Habit, chunks: string[][]) => chunks.map((chunk) => (chunk.length ? chunk.filter((d) => isDone(done, h.id, d)).length / chunk.length : 0));
  const overallTrend = (chunks: string[][]) => chunks.map((chunk) => (chunk.length && habits.length ? chunk.reduce((s, d) => s + rateOn(habits, d, done), 0) / chunk.length : 0));
  const trendMeta = habits.map((h) => {
    const recent = mean(habitTrend(h, recentWeeks));
    const prior = mean(habitTrend(h, priorWeeks));
    const delta = recent - prior;
    const kind: 'pos' | 'neg' | 'neu' = Math.abs(delta) < 0.02 ? 'neu' : delta > 0 ? 'pos' : 'neg';
    return { h, recent, prior, delta, kind };
  });
  const posN = trendMeta.filter((t) => t.kind === 'pos').length;
  const negN = trendMeta.filter((t) => t.kind === 'neg').length;
  const neuN = trendMeta.filter((t) => t.kind === 'neu').length;
  const overallRecent = mean(overallTrend(recentWeeks));
  const bestIdx = Math.max(0, bestH ? habits.findIndex((h) => h.id === bestH.h.id) : 0);
  const worstIdx = Math.max(0, worstH ? habits.findIndex((h) => h.id === worstH.h.id) : 0);
  const bestSeries = series[bestIdx] ?? [];
  const worstSeries = series[worstIdx] ?? [];
  const Call = ({ title, name, pct, cap }: { title: string; name: string; pct: number; cap: string }) => (
    <div className="min-h-[92px] border border-zinc-200 px-3 py-3">
      <p className="text-[9px] uppercase tracking-wider text-zinc-500">{title}</p>
      <p className="mt-1 text-[16px] font-semibold leading-tight text-zinc-800">{name}</p>
      <p className="mt-0.5 text-[18px] font-semibold tabular-nums text-zinc-800">{Math.round(pct * 100)}%</p>
      <p className="text-[10px] text-zinc-500">{cap}</p>
    </div>
  );
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return (
    <div className="space-y-12 pb-12">
      <section>
        <p className="mb-4 text-center text-[18px] font-semibold text-zinc-800">7-Week Habit Trend (Prior vs Recent)</p>
        <div className="grid grid-cols-12 items-start gap-5">
          <div className="col-span-12 grid grid-cols-2 gap-4 md:grid-cols-3 xl:col-span-8">
            {habits.map((h, i) => {
              const meta = trendMeta[i];
              const color = HCOLORS[i % HCOLORS.length];
              const up = (meta?.delta ?? 0) >= 0;
              return (
                <div key={h.id} className="flex flex-col border border-zinc-200 p-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="truncate text-[12px] font-semibold text-zinc-800">{h.emoji} {h.name}</p>
                    <div className="flex items-center gap-2 text-[8px] text-zinc-500">
                      <span className="inline-flex items-center gap-1"><i className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} /> current 7 wk</span>
                      <span className="inline-flex items-center gap-1 opacity-60"><i className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} /> prior 7 wk</span>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1">
                    <ColorDual a={habitTrend(h, recentWeeks)} b={habitTrend(h, priorWeeks)} color={color} height={Math.max(72, Math.min(140, 200 - habits.length * 8))} />
                  </div>
                  <p className="mt-1 text-[10px] text-zinc-500">Past 7 Wk Avg{' '}<span className={`font-semibold tabular-nums ${up ? 'text-emerald-600' : 'text-red-500'}`}>{up ? '\u25b2' : '\u25bc'} {Math.abs(Math.round((meta?.recent ?? 0) * 1000) / 10)}%</span></p>
                </div>
              );
            })}
          </div>
          <div className="col-span-12 xl:col-span-4">
            <div className="border border-zinc-200 p-3">
              <p className="ht-label mb-1">Overall</p>
              <div className="mb-1 flex gap-3 text-[9px] text-zinc-500"><span>current 7 wk</span><span className="opacity-60">prior 7 wk</span></div>
              <ColorDual a={overallTrend(recentWeeks)} b={overallTrend(priorWeeks)} color="#a1a1aa" height={220} />
              <div className="mt-3 space-y-1 text-[12px]">
                <div className="flex items-center justify-between border-b border-zinc-100 py-1"><span className="text-zinc-500">Past 7 Wk Avg</span><span className="font-semibold tabular-nums text-zinc-800">{Math.round(overallRecent * 1000) / 10}%</span></div>
                <div className="flex items-center justify-between border-b border-zinc-100 py-1"><span className="text-emerald-600">Positive Habits</span><span className="font-semibold tabular-nums text-emerald-600">{posN}</span></div>
                <div className="flex items-center justify-between border-b border-zinc-100 py-1"><span className="text-red-500">Negative Habits</span><span className="font-semibold tabular-nums text-red-500">{negN}</span></div>
                <div className="flex items-center justify-between py-1"><span className="text-orange-500">Neutral Habits</span><span className="font-semibold tabular-nums text-orange-500">{neuN}</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section>
        <p className="mb-4 text-center text-[18px] font-semibold text-zinc-800">Best and Worst Habits</p>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 grid grid-cols-2 gap-3 md:grid-cols-3 xl:col-span-4">
            <Call title="Best Habit So Far" name={bestH ? `${bestH.h.emoji} ${bestH.h.name}` : '-'} pct={bestH?.pct ?? 0} cap="highest completion %" />
            <Call title="Worst Habit So Far" name={worstH ? `${worstH.h.emoji} ${worstH.h.name}` : '-'} pct={worstH?.pct ?? 0} cap="lowest completion %" />
            <Call title="Best Week so Far" name={bestW ? `WEEK ${bestW.i + 1}` : '-'} pct={bestW?.pct ?? 0} cap="highest weekly completion" />
            <Call title="Worst Week so Far" name={worstW ? `WEEK ${worstW.i + 1}` : '-'} pct={worstW?.pct ?? 0} cap="lowest weekly completion" />
            <Call title="Best Day (So Far)" name={bestD ? `${WEEKDAYS[bestD.d.weekdayIdx]} ${bestD.d.day}` : '-'} pct={bestD?.pct ?? 0} cap="best daily score" />
            <Call title="Worst Day (So Far)" name={worstD ? `${WEEKDAYS[worstD.d.weekdayIdx]} ${worstD.d.day}` : '-'} pct={worstD?.pct ?? 0} cap="lowest daily score" />
          </div>
          <div className="col-span-12 space-y-5 xl:col-span-8">
            <div>
              <p className="ht-label mb-1">Best vs worst habit vs overall</p>
              <MultiArea series={[{ values: bestSeries }, { values: worstSeries }, { values: scores }]} height={220} />
              <div className="mt-0.5 flex gap-4 text-[10px] text-zinc-500"><span>Best habit</span><span>Worst habit</span><span>Overall</span></div>
            </div>
            <div>
              <p className="ht-label mb-1">Weekly Score Distribution</p>
              <BarRow items={weekRates.map((w) => ({ key: `w${w.i}`, value: w.pct, label: `W${w.i + 1}` }))} height={160} showValue />
            </div>
            <div>
              <p className="ht-label mb-1">Best week vs worst week vs average</p>
              <MultiArea series={[{ values: weeks[bestW?.i ?? 0]?.map((d) => rateOn(habits, d.dateStr, done)) ?? [] }, { values: weeks[worstW?.i ?? 0]?.map((d) => rateOn(habits, d.dateStr, done)) ?? [] }, { values: weeks.map(() => avgW) }]} height={180} />
            </div>
          </div>
        </div>
      </section>
      <section>
        <p className="mb-4 text-center text-[18px] font-semibold text-zinc-800">Habit Correlation (Weekly)</p>
        <div className="overflow-x-auto">
          <table className="ht-table w-full border-collapse text-[10px] tabular-nums">
            <thead>
              <tr>
                <th className="px-1 py-1 text-left text-zinc-500" />
                {habits.map((h) => <th key={h.id} className="px-1 py-1 text-center text-zinc-500">{h.emoji}</th>)}
                <th className="px-1 py-1 text-left text-emerald-700">Best Corr.</th>
                <th className="px-1 py-1 text-left text-red-600">Least Corr.</th>
                <th className="px-1 py-1 text-right text-zinc-500">Highest %</th>
                <th className="px-1 py-1 text-right text-zinc-500">Lowest %</th>
              </tr>
            </thead>
            <tbody>
              {habits.map((h, i) => {
                const p = partners[i];
                return (
                  <tr key={h.id}>
                    <td className="truncate px-1 py-1 text-zinc-600">{h.name}</td>
                    {habits.map((__, j) => {
                      const v = corr[i]?.[j] ?? 0;
                      return <td key={`${i}-${j}`} className="h-8 min-w-[36px] px-1 py-1 text-center" style={{ background: i === j ? heatGrey(1) : corrFill(v), color: Math.abs(v) > 0.45 ? '#18181b' : '#3f3f46' }}>{Math.round(v * 100)}%</td>;
                    })}
                    <td className="px-1 py-1 text-zinc-700">{habits[p?.bestJ ?? 0]?.name ?? '-'}</td>
                    <td className="px-1 py-1 text-zinc-700">{habits[p?.worstJ ?? 0]?.name ?? '-'}</td>
                    <td className="px-1 py-1 text-right font-medium text-emerald-700">{Math.round((p?.hi ?? 0) * 100)}%</td>
                    <td className="px-1 py-1 text-right font-medium text-red-600">{Math.round((p?.lo ?? 0) * 100)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-8 overflow-x-auto">
          <p className="ht-label mb-2">Days x Days</p>
          <table className="ht-table w-full border-collapse text-[10px] tabular-nums">
            <thead>
              <tr>
                <th className="px-1 py-1 text-left text-zinc-500" />
                {dayNames.map((d) => <th key={d} className="px-1 py-1 text-center text-zinc-500">{d}</th>)}
                <th className="px-1 py-1 text-left text-emerald-700">Best Corr.</th>
                <th className="px-1 py-1 text-left text-red-600">Least Corr.</th>
                <th className="px-1 py-1 text-right text-zinc-500">Highest %</th>
                <th className="px-1 py-1 text-right text-zinc-500">Lowest %</th>
              </tr>
            </thead>
            <tbody>
              {WEEKDAYS.map((_, i) => {
                const p = dayPartners[i];
                return (
                  <tr key={i}>
                    <td className="px-1 py-1 text-zinc-600">{dayNames[i]}</td>
                    {WEEKDAYS.map((__, j) => {
                      const v = dayCorr[i]?.[j] ?? 0;
                      return <td key={`${i}-${j}`} className="h-8 min-w-[40px] px-1 py-1 text-center" style={{ background: i === j ? heatGrey(1) : corrFill(v), color: Math.abs(v) > 0.45 ? '#18181b' : '#3f3f46' }}>{Math.round(v * 100)}%</td>;
                    })}
                    <td className="px-1 py-1 text-zinc-700">{dayNames[p?.bestJ ?? 0]}</td>
                    <td className="px-1 py-1 text-zinc-700">{dayNames[p?.worstJ ?? 0]}</td>
                    <td className="px-1 py-1 text-right font-medium text-emerald-700">{Math.round((p?.hi ?? 0) * 100)}%</td>
                    <td className="px-1 py-1 text-right font-medium text-red-600">{Math.round((p?.lo ?? 0) * 100)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-8 grid grid-cols-12 gap-5">
          {[
            { title: 'Best Habit Correlation', sub: most.a && most.b ? `${most.a} x ${most.b} · ${Math.round(most.v * 100)}%` : '-', a: series[most.ai] ?? [], b: series[most.bi] ?? [], c: '#16a34a', lx: most.a, ly: most.b },
            { title: 'Worst Habit Correlation', sub: least.a && least.b ? `${least.a} x ${least.b} · ${Math.round(least.v * 100)}%` : '-', a: series[least.ai] ?? [], b: series[least.bi] ?? [], c: '#dc2626', lx: least.a, ly: least.b },
            { title: 'Best Days Correlation', sub: `${dayNames[dayMost.ai]} x ${dayNames[dayMost.bi]} · ${Math.round(dayMost.v * 100)}%`, a: aligned[dayMost.ai] ?? [], b: aligned[dayMost.bi] ?? [], c: '#16a34a', lx: dayNames[dayMost.ai], ly: dayNames[dayMost.bi] },
            { title: 'Worst Days Correlation', sub: `${dayNames[dayLeast.ai]} x ${dayNames[dayLeast.bi]} · ${Math.round(dayLeast.v * 100)}%`, a: aligned[dayLeast.ai] ?? [], b: aligned[dayLeast.bi] ?? [], c: '#dc2626', lx: dayNames[dayLeast.ai], ly: dayNames[dayLeast.bi] },
          ].map((block) => (
            <div key={block.title} className="col-span-12 xl:col-span-6">
              <p className="mb-2 text-[12px] font-semibold text-zinc-800">{block.title}<span className="ml-2 text-[11px] font-normal text-zinc-500">{block.sub}</span></p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="ht-label mb-1">Curve</p>
                  <DualArea a={block.a} b={block.b} height={150} />
                  <div className="mt-0.5 flex gap-3 text-[9px] text-zinc-500"><span>{block.lx || 'A'}</span><span>{block.ly || 'B'}</span></div>
                </div>
                <div>
                  <p className="ht-label mb-1">Correlation + trendline</p>
                  <ScatterReg xs={block.a} ys={block.b} color={block.c} height={150} labelX={block.lx} labelY={block.ly} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
