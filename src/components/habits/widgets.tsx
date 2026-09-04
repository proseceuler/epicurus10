import type { ReactNode } from 'react';
import type { Habit } from '@/lib/types';
import { WEEKDAYS, monthDays, isDone, greyFill, lastNDays } from '@/lib/habit-stats';

export function Card({ title, children, className = '', pad = true }: { title?: string; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`ht-card ${pad ? 'p-2.5' : 'p-0'} ${className}`}>
      {title ? <h3 className="ht-label mb-2">{title}</h3> : null}
      {children}
    </section>
  );
}

export function dailyVector(habits: Habit[], days: ReturnType<typeof monthDays>, done: Set<string>) {
  if (!habits.length) return days.map(() => 0);
  return days.map((d) => habits.filter((h) => isDone(done, h.id, d.dateStr)).length / habits.length);
}

export function rateOn(habits: Habit[], dateStr: string, done: Set<string>) {
  if (!habits.length) return 0;
  return habits.filter((h) => isDone(done, h.id, dateStr)).length / habits.length;
}

export function habitWeekSeries(habitId: string, done: Set<string>, weeks = 12) {
  const days = lastNDays(weeks * 7);
  const out: number[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const slice = days.slice(i, i + 7);
    out.push(slice.filter((d) => isDone(done, habitId, d)).length / Math.max(slice.length, 1));
  }
  return out;
}

export function heatGrey(t: number) {
  const x = Math.max(0, Math.min(1, t));
  const l = 18 + x * 78;
  return `hsl(0 0% ${l}%)`;
}

export function corrFill(v: number) {
  if (v >= 0.62) return `rgba(251,146,60,${0.35 + (v - 0.62) * 1.1})`;
  if (v <= -0.35) return `rgba(52,211,153,${0.28 + Math.abs(v) * 0.5})`;
  return heatGrey((v + 1) / 2);
}

export function HeatGrid({
  habits, cols, done, showPct = false, cell = 16, numbers = false,
}: {
  habits: Habit[];
  cols: { dateStr: string; day?: number; label?: string }[];
  done: Set<string>;
  showPct?: boolean;
  cell?: number;
  numbers?: boolean;
}) {
  const totals = cols.map((c) => (habits.length ? habits.filter((h) => isDone(done, h.id, c.dateStr)).length / habits.length : 0));
  return (
    <div className="overflow-x-auto">
      <div className="min-w-max">
        <div className="flex gap-px" style={{ paddingLeft: 92 }}>
          {cols.map((c) => (
            <div key={c.dateStr} className="text-center text-[8px] text-zinc-500" style={{ width: cell }}>{c.label ?? c.day}</div>
          ))}
          {showPct ? <div className="w-8 text-center text-[8px] text-zinc-500">%</div> : null}
        </div>
        {habits.map((h) => {
          const pct = cols.length ? cols.filter((c) => isDone(done, h.id, c.dateStr)).length / cols.length : 0;
          return (
            <div key={h.id} className="flex items-center gap-px">
              <div className="w-[90px] truncate pr-1 text-[10px] text-zinc-400">{h.emoji} {h.name}</div>
              {cols.map((c) => {
                const on = isDone(done, h.id, c.dateStr);
                return (
                  <div
                    key={c.dateStr}
                    className="flex items-center justify-center rounded-[2px] text-[7px] tabular-nums text-zinc-300"
                    style={{ width: cell, height: cell, background: on ? heatGrey(0.92) : 'transparent', border: on ? '0' : '1px solid #3f3f46' }}
                  >{numbers ? (on ? '1' : '') : null}</div>
                );
              })}
              {showPct ? <div className="w-8 text-right text-[9px] tabular-nums text-zinc-400">{Math.round(pct * 100)}</div> : null}
            </div>
          );
        })}
        <div className="mt-px flex items-center gap-px">
          <div className="w-[90px] text-[9px] text-zinc-500">Overall</div>
          {totals.map((t, i) => (
            <div key={cols[i].dateStr} className="flex items-center justify-center rounded-[2px] text-[7px] tabular-nums text-zinc-200" style={{ width: cell, height: cell, background: heatGrey(t) }}>
              {Math.round(t * 100)}
            </div>
          ))}
          {showPct ? <div className="w-8" /> : null}
        </div>
      </div>
    </div>
  );
}

export function HeatRatio({
  rows, cols, value, cell = 22,
}: {
  rows: { key: string; label: string }[];
  cols: { key: string; label: string }[];
  value: (row: string, col: string) => number;
  cell?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-max">
        <div className="flex gap-px" style={{ paddingLeft: 84 }}>
          {cols.map((c) => <div key={c.key} className="text-center text-[8px] text-zinc-500" style={{ width: cell }}>{c.label}</div>)}
        </div>
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-px">
            <div className="w-[80px] truncate pr-1 text-[10px] text-zinc-400">{r.label}</div>
            {cols.map((c) => {
              const v = value(r.key, c.key);
              return (
                <div key={c.key} className="flex items-center justify-center rounded-[2px] text-[8px] tabular-nums" style={{ width: cell, height: cell, background: heatGrey(v), color: v > 0.55 ? '#18181b' : '#e4e4e7' }}>
                  {Math.round(v * 100)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function HeatDays({ habits, days, done, showLabel = false }: { habits: Habit[]; days: ReturnType<typeof monthDays>; done: Set<string>; showLabel?: boolean }) {
  const byWeek: Record<number, typeof days> = {};
  days.forEach((d) => { (byWeek[d.weekNum] ??= []).push(d); });
  return (
    <div className="space-y-0.5">
      {showLabel ? <div className="flex gap-px pl-6">{WEEKDAYS.map((d, i) => <div key={i} className="w-5 text-center text-[8px] text-zinc-500">{d}</div>)}</div> : null}
      {Object.values(byWeek).map((week, i) => (
        <div key={i} className="flex items-center gap-px">
          {showLabel ? <div className="w-6 text-[8px] text-zinc-500">W{i + 1}</div> : null}
          {Array.from({ length: 7 }, (_, wd) => {
            const cell = week.find((d) => d.weekdayIdx === wd);
            if (!cell) return <div key={wd} className="h-5 w-5" />;
            const pct = rateOn(habits, cell.dateStr, done);
            return <div key={cell.dateStr} className="flex h-5 w-5 items-center justify-center rounded-[2px] text-[7px] tabular-nums text-zinc-200" style={{ background: heatGrey(pct) }}>{Math.round(pct * 100)}</div>;
          })}
        </div>
      ))}
    </div>
  );
}

function linePath(values: number[], w: number, h: number, pad = 4) {
  if (!values.length) return '';
  return values.map((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * w;
    const y = h - Math.max(0, Math.min(1, v)) * (h - pad * 2) - pad;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export function AreaChart({ values, labels, height = 92 }: { values: number[]; labels?: string[]; height?: number }) {
  const w = 280;
  const h = height;
  const path = linePath(values, w, h, 6);
  const last = values.length ? ((values.length - 1) / Math.max(values.length - 1, 1)) * w : w;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
        <defs>
          <linearGradient id="htArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e4e4e7" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#e4e4e7" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {path ? <path d={`${path} L${last},${h} L0,${h} Z`} fill="url(#htArea)" /> : null}
        {path ? <path d={path} fill="none" stroke="#fafafa" strokeWidth="1.6" /> : null}
      </svg>
      {labels?.length ? (
        <div className="mt-0.5 flex justify-between text-[8px] text-zinc-500">
          {labels.filter((_, i) => i === 0 || i === labels.length - 1 || i === Math.floor(labels.length / 2)).map((l) => <span key={l}>{l}</span>)}
        </div>
      ) : null}
    </div>
  );
}

export function MiniArea({ values, height = 72 }: { values: number[]; height?: number }) {
  return <AreaChart values={values} height={height} />;
}

export function Spark({ values, width = 56 }: { values: number[]; width?: number }) {
  const w = width, h = 16;
  const path = linePath(values, w, h, 2);
  if (!path) return null;
  return <svg viewBox={`0 0 ${w} ${h}`} className="h-4" style={{ width }}><path d={path} fill="none" stroke="#d4d4d8" strokeWidth="1.2" /></svg>;
}

export function BarRow({
  items, height = 96, gap = 'gap-1', labelEvery = 1, showValue = false,
}: {
  items: { key: string; value: number; label: string }[];
  height?: number;
  gap?: string;
  labelEvery?: number;
  showValue?: boolean;
}) {
  return (
    <div className={`flex items-end ${gap}`} style={{ height }}>
      {items.map((it, i) => (
        <div key={it.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5" style={{ height: '100%' }}>
          {showValue ? <span className="text-[8px] tabular-nums text-zinc-500">{Math.round(it.value * 100)}</span> : null}
          <div className="w-full rounded-[2px] bg-zinc-200" style={{ height: `${Math.max(6, it.value * 100)}%`, opacity: 0.3 + it.value * 0.7 }} />
          {i % labelEvery === 0 ? <span className="max-w-full truncate text-[8px] text-zinc-500">{it.label}</span> : <span className="h-2.5" />}
        </div>
      ))}
    </div>
  );
}

export function MiniBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800">
      <div className="h-full bg-zinc-200" style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, opacity: 0.35 + value * 0.65 }} />
    </div>
  );
}

export function chunkWeekly(habits: Habit[], done: Set<string>, range: string[]) {
  const out: number[] = [];
  for (let i = 0; i < range.length; i += 7) {
    const slice = range.slice(i, i + 7);
    const slots = slice.length * Math.max(habits.length, 1);
    const got = slice.reduce((s, d) => s + habits.filter((h) => isDone(done, h.id, d)).length, 0);
    out.push(slots ? got / slots : 0);
  }
  return out;
}

export function Ring({ value, caption }: { value: number; caption?: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className="flex flex-col items-center">
      <svg className="h-[92px] w-[92px] -rotate-90" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r={r} fill="none" stroke="#3f3f46" strokeWidth="8" />
        <circle cx="45" cy="45" r={r} fill="none" stroke="#e4e4e7" strokeWidth="8" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="butt" />
      </svg>
      <p className="-mt-[62px] mb-[42px] text-[18px] font-semibold tabular-nums text-zinc-50">{Math.round(value)}%</p>
      {caption ? <p className="text-[10px] text-zinc-500">{caption}</p> : null}
    </div>
  );
}

export function AlertRow({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'pending' }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
      <span className="text-zinc-400">{label}</span>
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone === 'ok' ? 'bg-emerald-500 text-white' : 'bg-orange-500 text-white'}`}>{value}</span>
    </div>
  );
}

export function ScatterTrend({ xs, ys }: { xs: number[]; ys: number[] }) {
  const n = Math.min(xs.length, ys.length);
  const w = 220, h = 88, p = 8;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
  const den = n * sxx - sx * sx;
  const slope = den ? (n * sxy - sx * sy) / den : 0;
  const intercept = n ? (sy - slope * sx) / n : 0;
  const x0 = 0, x1 = 1;
  const y0 = intercept;
  const y1 = intercept + slope;
  const X = (v: number) => p + v * (w - p * 2);
  const Y = (v: number) => h - p - Math.max(0, Math.min(1, v)) * (h - p * 2);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[88px] w-full">
      <line x1={X(x0)} y1={Y(y0)} x2={X(x1)} y2={Y(y1)} stroke="#a1a1aa" strokeWidth="1.2" />
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} cx={X(xs[i] ?? 0)} cy={Y(ys[i] ?? 0)} r="2.3" fill="#e4e4e7" opacity="0.8" />
      ))}
    </svg>
  );
}
