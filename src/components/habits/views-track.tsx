import type { Dispatch, SetStateAction } from 'react';
import type { Habit } from '@/lib/types';
import BlackHole from '@/components/habits/BlackHole';
import { AreaChart, Spark, rateOn } from '@/components/habits/widgets';
import { MONTHS, WEEKDAYS, isDone, lastNDays, type DayCell } from '@/lib/habit-stats';

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

function dayTone(pct: number) {
  if (pct >= 0.85) return { bg: '#22c55e', fg: '#fff' };
  if (pct >= 0.7) return { bg: '#84cc16', fg: '#18181b' };
  if (pct >= 0.5) return { bg: '#eab308', fg: '#18181b' };
  if (pct >= 0.3) return { bg: '#f97316', fg: '#fff' };
  if (pct > 0) return { bg: '#ef4444', fg: '#fff' };
  return { bg: '#f4f4f5', fg: '#a1a1aa' };
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
    gridTemplateColumns: `minmax(210px, 260px) repeat(${n}, minmax(148px, 1fr))`,
    minWidth: 210 + n * 148,
  } as const;
  const lifeSeries = lastNDays(48).map((d) => rateOn(habits, d, done));

  return (
    <div className="space-y-2 pb-6">
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
          <div className="flex items-end px-2 pb-1">
            <span className="text-[13px] font-semibold text-zinc-700">Habits</span>
          </div>
          <div style={{ gridColumn: '2 / -1' }}>
            <AreaChart values={monthWave} height={96} />
          </div>

          <div className="border-b border-zinc-200" />
          {weeks.map((_, wi) => (
            <div key={`wh-${wi}`} className="border-b border-zinc-200 py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Week {wi + 1}</div>
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
                        <button type="button" onClick={() => onToggle(h.id, cell.dateStr)} className={`inline-block h-[12px] w-[12px] ${isToday ? 'ring-1 ring-zinc-600' : ''}`} style={{ background: on ? '#3f3f46' : 'transparent', border: '1px solid #71717a' }} aria-label={`${h.name} ${cell.dateStr}`} />
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
                    <span className="flex h-[16px] w-full items-center justify-center text-[8px] font-semibold tabular-nums" style={{ background: tone.bg, color: tone.fg }}>{Math.round(pct * 100)}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={grid} className="items-start">
          <div className="px-2 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Lifetime Progress</p>
            <div className="mx-auto mt-1 w-[176px] overflow-visible"><BlackHole variant="track" className="aspect-square w-full bg-transparent" /></div>
            <p className="mt-1 text-center text-[22px] font-semibold tabular-nums text-zinc-800">{life.toFixed(2)}%</p>
            <div className="mx-auto mt-1 flex h-8 w-[176px] items-end gap-px">
              {lifeSeries.map((v, i) => (
                <div key={i} className="flex-1 bg-zinc-800" style={{ height: `${Math.max(6, Math.round(v * 100))}%`, opacity: 0.25 + v * 0.75 }} />
              ))}
            </div>
          </div>
          {weeks.map((week, wi) => {
            const wp = weekPct(habits, week, done);
            const slots = Math.max(1, habits.length * week.length);
            const got = week.reduce((s, d) => s + habits.filter((h) => isDone(done, h.id, d.dateStr)).length, 0);
            const spark = week.map((d) => rateOn(habits, d.dateStr, done));
            const prev = wi > 0 ? weekPct(habits, weeks[wi - 1], done) : wp;
            const delta = wp - prev;
            const up = delta >= 0;
            return (
              <div key={`wc-${wi}`} className="border-l border-zinc-100 px-2 pt-3">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">Weekly Completion %</p>
                <div className="mt-1 flex items-start justify-between gap-2">
                  <p className="text-[26px] font-semibold leading-none tabular-nums text-zinc-800">{Math.round(wp * 100)}%</p>
                  <Spark values={spark} width={64} />
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px]">
                  <span className="tabular-nums text-zinc-500">({got}/{slots})</span>
                  <span className={`tabular-nums ${up ? 'text-emerald-600' : 'text-red-500'}`}>{up ? '▲' : '▼'} {Math.abs(Math.round(delta * 100))}%</span>
                </div>
                <table className="mt-2 w-full border-collapse text-[10px]">
                  <thead>
                    <tr className="border-b border-zinc-200">
                      <th className="py-0.5 text-left font-medium text-zinc-500">Habits</th>
                      <th className="py-0.5 text-right font-medium text-zinc-500">Weekly %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {habits.map((h) => {
                      const p = habitPct(h, week, done);
                      const tone = dayTone(p);
                      return (
                        <tr key={h.id} className="border-b border-zinc-100">
                          <td className="truncate py-0.5 pr-1 text-zinc-700">{h.emoji} {h.name}</td>
                          <td className="py-0.5 text-right tabular-nums" style={{ background: tone.bg, color: tone.fg }}>{Math.round(p * 100)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
