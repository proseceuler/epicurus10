import type { Habit } from '@/lib/types';
import { WEEKDAYS, monthDays, isDone, greyFill } from '@/lib/habit-stats';

export function dailyVector(habits: Habit[], days: ReturnType<typeof monthDays>, done: Set<string>) {
  if (!habits.length) return days.map(() => 0);
  return days.map((d) => habits.filter((h) => isDone(done, h.id, d.dateStr)).length / habits.length);
}

export function HeatGrid({ habits, cols, done, showPct = false }: { habits: Habit[]; cols: { dateStr: string; day: number }[]; done: Set<string>; showPct?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-max">
        <div className="flex gap-px pl-24">
          {cols.map((c) => <div key={c.dateStr} className="w-4 text-center text-[8px] text-zinc-500">{c.day}</div>)}
          {showPct ? <div className="w-7 text-center text-[8px] text-zinc-500">%</div> : null}
        </div>
        {habits.map((h) => {
          const pct = cols.length ? cols.filter((c) => isDone(done, h.id, c.dateStr)).length / cols.length : 0;
          return (
            <div key={h.id} className="flex items-center gap-px">
              <div className="w-24 truncate pr-1 text-[10px] text-zinc-400">{h.emoji} {h.name}</div>
              {cols.map((c) => {
                const on = isDone(done, h.id, c.dateStr);
                return <div key={c.dateStr} className="h-4 w-4 rounded-[2px]" style={{ background: on ? greyFill(1) : 'transparent', border: on ? undefined : '1px solid #3f3f46' }} />;
              })}
              {showPct ? <div className="w-7 text-right text-[9px] tabular-nums text-zinc-400">{Math.round(pct * 100)}</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HeatDays({ habits, days, done, showLabel = false }: { habits: Habit[]; days: ReturnType<typeof monthDays>; done: Set<string>; showLabel?: boolean }) {
  const byWeek: Record<number, typeof days> = {};
  days.forEach((d) => { (byWeek[d.weekNum] ??= []).push(d); });
  return (
    <div className="space-y-0.5">
      {showLabel ? <div className="flex gap-px pl-6">{WEEKDAYS.map((d, i) => <div key={i} className="w-4 text-center text-[8px] text-zinc-500">{d}</div>)}</div> : null}
      {Object.values(byWeek).map((week, i) => (
        <div key={i} className="flex items-center gap-px">
          {showLabel ? <div className="w-6 text-[8px] text-zinc-500">W{i + 1}</div> : null}
          {Array.from({ length: 7 }, (_, wd) => {
            const cell = week.find((d) => d.weekdayIdx === wd);
            if (!cell) return <div key={wd} className="h-4 w-4" />;
            const pct = habits.length ? habits.filter((h) => isDone(done, h.id, cell.dateStr)).length / habits.length : 0;
            return <div key={cell.dateStr} className="h-4 w-4 rounded-[2px]" style={{ background: greyFill(pct) }} title={`${cell.dateStr} ${Math.round(pct * 100)}%`} />;
          })}
        </div>
      ))}
    </div>
  );
}

export function MiniArea({ values, height = 72 }: { values: number[]; height?: number }) {
  const w = 220, h = height;
  if (!values.length) return <div className="h-10" />;
  const pts = values.map((v, i) => `${(i / Math.max(values.length - 1, 1)) * w},${h - v * (h - 6) - 3}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
      <polygon fill="rgba(228,228,231,0.12)" points={`0,${h} ${pts} ${w},${h}`} />
      <polyline fill="none" stroke="#e4e4e7" strokeWidth="1.4" points={pts} />
    </svg>
  );
}

export function Spark({ values }: { values: number[] }) {
  const w = 56, h = 14;
  if (!values.length) return null;
  const pts = values.map((v, i) => `${(i / Math.max(values.length - 1, 1)) * w},${h - v * (h - 2) - 1}`).join(' ');
  return <svg viewBox={`0 0 ${w} ${h}`} className="h-3.5 w-14"><polyline fill="none" stroke="#d4d4d8" strokeWidth="1.1" points={pts} /></svg>;
}

export function BarRow({ items, height = 96, gap = 'gap-1', labelEvery = 1 }: { items: { key: string; value: number; label: string }[]; height?: number; gap?: string; labelEvery?: number }) {
  return (
    <div className={`flex items-end ${gap}`} style={{ height }}>
      {items.map((it, i) => (
        <div key={it.key} className="flex min-w-0 flex-1 flex-col items-center gap-0.5" style={{ height: '100%' }}>
          <div className="mt-auto w-full rounded-[2px] bg-zinc-200" style={{ height: `${Math.max(4, it.value * 100)}%`, opacity: 0.28 + it.value * 0.72 }} />
          {i % labelEvery === 0 ? <span className="max-w-full truncate text-[8px] text-zinc-500">{it.label}</span> : <span className="h-2.5" />}
        </div>
      ))}
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

export function Ring({ value, label }: { value: number; label: string }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className="flex items-center gap-3">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#27272a" strokeWidth="6" />
        <circle cx="40" cy="40" r={r} fill="none" stroke="#e4e4e7" strokeWidth="6" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" />
      </svg>
      <div>
        <p className="text-lg font-semibold tabular-nums">{Math.round(value)}%</p>
        <p className="text-[10px] text-zinc-500">{label}</p>
      </div>
    </div>
  );
}

export function AlertRow({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'pending' }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-zinc-400">{label}</span>
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${tone === 'ok' ? 'bg-zinc-200 text-zinc-950' : 'bg-zinc-800 text-zinc-200'}`}>{value}</span>
    </div>
  );
}

export function Stat({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <div className="border-b border-zinc-900 py-1 last:border-0">
      <p className="text-[9px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="truncate text-[12px] text-zinc-100">{value} <span className="text-zinc-500">{meta}</span></p>
    </div>
  );
}

export function Scatter({ a, b }: { a?: number[]; b: number[] }) {
  const xs = a && a.length ? a : b;
  const w = 220, h = 90;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full">
      {xs.map((x, i) => <circle key={i} cx={8 + x * (w - 16)} cy={h - 8 - (b[i] ?? 0) * (h - 16)} r="2.2" fill="#e4e4e7" opacity="0.7" />)}
    </svg>
  );
}

export function LinePair({ a, b }: { a: number[]; b: number[] }) {
  const w = 220, h = 72;
  const n = Math.max(a.length, b.length, 2);
  const line = (vals: number[]) => vals.map((v, i) => `${(i / Math.max(n - 1, 1)) * w},${h - (v ?? 0) * (h - 8) - 4}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[72px] w-full">
      <polyline fill="none" stroke="#a1a1aa" strokeWidth="1.2" points={line(b)} />
      <polyline fill="none" stroke="#fafafa" strokeWidth="1.5" points={line(a)} />
    </svg>
  );
}
