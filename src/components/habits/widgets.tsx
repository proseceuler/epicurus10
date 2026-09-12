import { useId, type ReactNode } from 'react';
import type { Habit } from '@/lib/types';
import { WEEKDAYS, monthDays, isDone, lastNDays } from '@/lib/habit-stats';

export function Card({
  title, children, className = '', pad = true, variant = 'flat',
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  pad?: boolean;
  variant?: 'box' | 'flat';
}) {
  return (
    <section className={`ht-sheet ${pad ? 'p-1.5' : 'p-0'} ${className}`}>
      {title ? <h3 className="ht-label mb-1.5 text-zinc-500">{title}</h3> : null}
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

export function countOn(habits: Habit[], dateStr: string, done: Set<string>) {
  return habits.filter((h) => isDone(done, h.id, dateStr)).length;
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
  return `hsl(0 0% ${16 + x * 78}%)`;
}

export function corrFill(v: number) {
  return heatGrey((v + 1) / 2);
}

function toPts(values: number[], w: number, h: number, pad: number) {
  const n = Math.max(values.length - 1, 1);
  return values.map((v, i) => ({
    x: (i / n) * w,
    y: h - Math.max(0, Math.min(1, v)) * (h - pad * 2) - pad,
  }));
}

export function curvePath(values: number[], w: number, h: number, pad = 4) {
  const p = toPts(values, w, h, pad);
  if (!p.length) return '';
  if (p.length === 1) return `M${p[0].x.toFixed(1)},${p[0].y.toFixed(1)}`;
  let d = `M${p[0].x.toFixed(1)},${p[0].y.toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

export function AreaChart({
  values, labels, height = 92, width = 280, fill = true, ink = true,
}: {
  values: number[];
  labels?: string[];
  height?: number;
  width?: number;
  fill?: boolean;
  ink?: boolean;
}) {
  const id = `htA${useId().replace(/:/g, '')}`;
  const w = width;
  const h = height;
  const path = curvePath(values, w, h, 6);
  const stroke = ink ? '#18181b' : '#f4f4f5';
  const stop = ink ? '#18181b' : '#e4e4e7';
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stop} stopOpacity={ink ? 0.28 : 0.42} />
            <stop offset="100%" stopColor={stop} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {path && fill ? <path className="ht-chart-fill" d={`${path} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} /> : null}
        {path ? <path className="ht-chart-line" d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" pathLength={1} /> : null}
      </svg>
      {labels?.length ? (
        <div className="mt-0.5 flex justify-between text-[8px] text-zinc-500">
          {labels.filter((_, i) => i === 0 || i === labels.length - 1 || i === Math.floor(labels.length / 2)).map((l, i) => <span key={`${l}-${i}`}>{l}</span>)}
        </div>
      ) : null}
    </div>
  );
}

export function MultiArea({
  series, height = 120, ink = true,
}: {
  series: { values: number[]; color?: string }[];
  height?: number;
  ink?: boolean;
}) {
  const w = 320, h = height;
  const colors = ink
    ? ['#18181b', '#71717a', '#a1a1aa']
    : ['#fafafa', '#a1a1aa', '#71717a'];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      {series.map((s, i) => {
        const p = curvePath(s.values, w, h, 6);
        if (!p) return null;
        return (
          <path
            key={i}
            d={p}
            fill="none"
            className="ht-chart-line"
            pathLength={1}
            stroke={s.color ?? colors[i % colors.length]}
            strokeWidth={i === 0 ? 1.9 : 1.4}
            strokeDasharray={i === 2 ? '5 4' : undefined}
            style={{ animationDelay: `${i * 80}ms` }}
          />
        );
      })}
    </svg>
  );
}

export function DualArea({ a, b, height = 88, ink = true }: { a: number[]; b: number[]; height?: number; ink?: boolean }) {
  const id = useId().replace(/:/g, '');
  const w = 280, h = height;
  const pa = curvePath(a, w, h, 6);
  const pb = curvePath(b, w, h, 6);
  const hi = ink ? '#18181b' : '#fafafa';
  const lo = ink ? '#71717a' : '#a1a1aa';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`${id}a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={hi} stopOpacity="0.28" />
          <stop offset="100%" stopColor={hi} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lo} stopOpacity="0.22" />
          <stop offset="100%" stopColor={lo} stopOpacity="0" />
        </linearGradient>
      </defs>
      {pb ? <path className="ht-chart-fill" d={`${pb} L${w},${h} L0,${h} Z`} fill={`url(#${id}b)`} /> : null}
      {pa ? <path className="ht-chart-fill" d={`${pa} L${w},${h} L0,${h} Z`} fill={`url(#${id}a)`} style={{ animationDelay: '80ms' }} /> : null}
      {pb ? <path className="ht-chart-line" d={pb} fill="none" stroke={lo} strokeWidth="1.4" pathLength={1} /> : null}
      {pa ? <path className="ht-chart-line" d={pa} fill="none" stroke={hi} strokeWidth="1.8" pathLength={1} style={{ animationDelay: '80ms' }} /> : null}
    </svg>
  );
}

export function MiniArea({ values, height = 72, ink = true }: { values: number[]; height?: number; ink?: boolean }) {
  return <AreaChart values={values} height={height} ink={ink} />;
}

export function Spark({ values, width = 56, ink = true }: { values: number[]; width?: number; ink?: boolean }) {
  const w = width, h = 16;
  const path = curvePath(values, w, h, 2);
  if (!path) return null;
  return <svg viewBox={`0 0 ${w} ${h}`} className="h-4" style={{ width }}><path className="ht-chart-line" d={path} fill="none" stroke={ink ? '#18181b' : '#d4d4d8'} strokeWidth="1.3" strokeLinecap="round" pathLength={1} /></svg>;
}

export function BarRow({
  items, height = 96, gap = 'gap-1', labelEvery = 1, showValue = false, raw = false,
}: {
  items: { key: string; value: number; label: string }[];
  height?: number;
  gap?: string;
  labelEvery?: number;
  showValue?: boolean;
  raw?: boolean;
}) {
  const max = Math.max(1, ...items.map((it) => it.value));
  return (
    <div className={`flex items-end ${gap}`} style={{ height }}>
      {items.map((it, i) => {
        const h = raw ? it.value / max : it.value;
        return (
          <div key={it.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5" style={{ height: '100%' }}>
            {showValue ? <span className="text-[8px] tabular-nums text-zinc-500">{raw ? it.value.toFixed(1) : Math.round(it.value * 100)}</span> : null}
            <div className="ht-chart-bar w-[70%] bg-zinc-800" style={{ height: `${Math.max(8, h * 100)}%`, opacity: 0.28 + h * 0.72, animationDelay: `${i * 28}ms` }} />
            {i % labelEvery === 0 ? <span className="max-w-full truncate text-[8px] text-zinc-500">{it.label}</span> : <span className="h-2.5" />}
          </div>
        );
      })}
    </div>
  );
}

export function MiniBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-200">
      <div className="ht-chart-bar-x h-full bg-zinc-700" style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
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
  const r = 38;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className="flex flex-col items-center">
      <svg className="h-[88px] w-[88px] -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#d4d4d8" strokeWidth="9" />
        <circle className="ht-chart-ring" cx="50" cy="50" r={r} fill="none" stroke="#18181b" strokeWidth="9" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" style={{ ['--ring-c' as string]: String(c), ['--ring-off' as string]: String(off) }} />
      </svg>
      <p className="-mt-[58px] mb-[38px] text-[18px] font-semibold tabular-nums text-zinc-800">{Math.round(value)}%</p>
      {caption ? <p className="text-[10px] text-zinc-500">{caption}</p> : null}
    </div>
  );
}

export function AlertRow({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'pending' | 'na' }) {
  const chip =
    tone === 'ok'
      ? 'bg-emerald-500 text-white'
      : tone === 'na'
        ? 'bg-red-500 text-white'
        : 'bg-amber-400 text-zinc-900';
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-[11px] lg:text-[12px]">
      <span className="min-w-0 truncate text-zinc-500">{label}</span>
      <span className={`shrink-0 px-1.5 py-0.5 text-[10px] font-semibold ${chip}`}>{value}</span>
    </div>
  );
}

export function ScatterTrend({ xs, ys }: { xs: number[]; ys: number[] }) {
  const n = Math.min(xs.length, ys.length);
  const w = 240, h = 100, p = 8;
  const series = Array.from({ length: n }, (_, i) => ({ x: xs[i] ?? 0, y: ys[i] ?? 0 }));
  const line = curvePath(series.map((s) => s.y), w, h, p);
  const X = (v: number) => p + Math.max(0, Math.min(1, v)) * (w - p * 2);
  const Y = (v: number) => h - p - Math.max(0, Math.min(1, v)) * (h - p * 2);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[100px] w-full">
      {line ? <path className="ht-chart-line" d={line} fill="none" stroke="#71717a" strokeWidth="1.3" pathLength={1} /> : null}
      {series.map((s, i) => <circle className="ht-chart-dot" key={i} cx={X(s.x)} cy={Y(s.y)} r="2.4" fill="#18181b" opacity="0.8" style={{ animationDelay: `${i * 18}ms` }} />)}
    </svg>
  );
}
