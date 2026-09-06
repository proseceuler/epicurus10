import type { Dispatch, SetStateAction } from 'react';
import type { Habit, HabitCompletion } from '@/lib/types';
import {
  WEEKDAYS,
  isDone,
  greyFill,
  pearson,
  lastNDays,
  type DayCell,
} from '@/lib/habit-stats';
import BlackHole from '@/components/habits/BlackHole';
import { Plus, Trash2, Check } from 'lucide-react';

export type View = 'home' | 'track' | 'dash' | 'insights';

export function HomeView({
  habits,
  done,
  today,
  life,
  todayLeft,
  dailyScores,
  completions,
  onGo,
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
  const doneToday = habits.length - todayLeft.length;
  const recent = lastNDays(7);

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="glass flex flex-col items-center justify-center rounded-2xl p-6">
        <BlackHole className="h-44 w-44" percent={life} ink />
        <p className="mt-2 text-xs text-zinc-500">Lifetime completion</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => onGo('track')} className="rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white">
            Open tracker
          </button>
          <button type="button" onClick={() => onGo('insights')} className="rounded-xl border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50">
            Insights
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="glass rounded-2xl p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-800">Today</h3>
            <span className="text-xs tabular-nums text-zinc-500">{doneToday}/{habits.length}</span>
          </div>
          {habits.length === 0 ? (
            <p className="text-xs text-zinc-400">No habits yet — add some in Tracker.</p>
          ) : (
            <ul className="space-y-1.5">
              {habits.map((h) => {
                const ok = isDone(done, h.id, today);
                return (
                  <li key={h.id} className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm ${ok ? 'bg-zinc-100 text-zinc-500' : 'text-zinc-800'}`}>
                    <span className="text-base">{h.emoji || '✅'}</span>
                    <span className={`flex-1 truncate ${ok ? 'line-through' : ''}`}>{h.name}</span>
                    {ok ? <Check className="h-3.5 w-3.5 text-zinc-600" /> : <span className="text-[10px] text-zinc-400">pending</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="glass rounded-2xl p-4">
          <h3 className="mb-2 text-sm font-semibold text-zinc-800">Last 7 days</h3>
          <div className="flex items-end gap-1.5">
            {dailyScores.slice(-7).map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-md bg-zinc-900/80" style={{ height: `${Math.max(4, d.score * 48)}px` }} title={`${d.date}: ${Math.round(d.score * 100)}%`} />
                <span className="text-[9px] text-zinc-400">{d.date.slice(8)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-zinc-400">{completions.length} total check-ins logged</p>
        </div>

        <div className="glass rounded-2xl p-4">
          <h3 className="mb-2 text-sm font-semibold text-zinc-800">This week</h3>
          <div className="space-y-2">
            {habits.slice(0, 6).map((h) => {
              const hits = recent.filter((d) => isDone(done, h.id, d)).length;
              return (
                <div key={h.id} className="flex items-center gap-2 text-xs">
                  <span>{h.emoji}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-700">{h.name}</span>
                  <div className="flex gap-0.5">
                    {recent.map((d) => (
                      <span key={d} className={`h-2 w-2 rounded-sm ${isDone(done, h.id, d) ? 'bg-zinc-800' : 'bg-zinc-200'}`} />
                    ))}
                  </div>
                  <span className="w-6 text-right tabular-nums text-zinc-500">{hits}/7</span>
                </div>
              );
            })}
          </div>
        </div>
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
  setShowAdd: Dispatch<SetStateAction<boolean>>;
  onToggle: (habitId: string, dateStr: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  life: number;
}) {
  void year; void month; void life;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">Click a cell to toggle · {days.length} days in view</p>
        <button type="button" onClick={() => setShowAdd(true)} className="flex items-center gap-1 rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white">
          <Plus className="h-3.5 w-3.5" /> Add habit
        </button>
      </div>
      {showAdd && (
        <div className="glass flex flex-wrap items-end gap-2 rounded-2xl p-3">
          <label className="text-xs text-zinc-500">Emoji<input value={draft.emoji} onChange={(e) => setDraft((d) => ({ ...d, emoji: e.target.value }))} className="mt-1 block w-14 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm" /></label>
          <label className="min-w-[10rem] flex-1 text-xs text-zinc-500">Name<input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && onAdd()} placeholder="Habit name" className="mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm" /></label>
          <label className="text-xs text-zinc-500">Goal / mo<input value={draft.goal} onChange={(e) => setDraft((d) => ({ ...d, goal: e.target.value }))} className="mt-1 block w-16 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm" /></label>
          <button type="button" onClick={onAdd} className="rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white">Save</button>
          <button type="button" onClick={() => setShowAdd(false)} className="rounded-xl px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100">Cancel</button>
        </div>
      )}
      <div className="glass overflow-x-auto rounded-2xl p-3">
        <table className="w-full min-w-[640px] border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white/90 px-2 py-1.5 text-left font-medium text-zinc-600">Habit</th>
              {days.map((d) => (
                <th key={d.dateStr} className={`px-0.5 py-1 text-center font-normal ${d.dateStr === today ? 'text-zinc-900' : 'text-zinc-400'}`}>
                  <div className="text-[9px]">{WEEKDAYS[d.weekdayIdx]}</div>
                  <div className="tabular-nums">{d.day}</div>
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {habits.map((h) => {
              const monthHits = days.filter((d) => isDone(done, h.id, d.dateStr)).length;
              return (
                <tr key={h.id} className="border-t border-zinc-100">
                  <td className="sticky left-0 z-10 bg-white/90 px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span>{h.emoji || '✅'}</span>
                      <span className="max-w-[8rem] truncate font-medium text-zinc-800">{h.name}</span>
                      <span className="tabular-nums text-[10px] text-zinc-400">{monthHits}/{h.goal_target || days.length}</span>
                    </div>
                  </td>
                  {days.map((d) => {
                    const ok = isDone(done, h.id, d.dateStr);
                    return (
                      <td key={d.dateStr} className="px-0.5 py-1 text-center">
                        <button type="button" onClick={() => onToggle(h.id, d.dateStr)} className={`mx-auto h-5 w-5 rounded-md border transition-colors ${ok ? 'border-zinc-800 bg-zinc-800' : 'border-zinc-200 bg-white hover:border-zinc-400'} ${d.dateStr === today ? 'ring-1 ring-zinc-400 ring-offset-1' : ''}`} aria-label={`${h.name} ${d.dateStr}`} />
                      </td>
                    );
                  })}
                  <td className="px-1">
                    <button type="button" onClick={() => onRemove(h.id)} className="rounded p-1 text-zinc-300 hover:bg-red-50 hover:text-red-500" title="Remove habit"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              );
            })}
            {habits.length === 0 && (
              <tr><td colSpan={days.length + 2} className="px-2 py-8 text-center text-zinc-400">No habits yet. Add one to start tracking.</td></tr>
            )}
          </tbody>
        </table>
        <span className="sr-only">{weeks.length} weeks</span>
      </div>
    </div>
  );
}

export function DashView({
  habits, days, weeks, done, monthLabel, year,
}: {
  habits: Habit[];
  days: DayCell[];
  weeks: DayCell[][];
  done: Set<string>;
  monthLabel: string;
  year: number;
}) {
  void year;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-800">{monthLabel}</h3>
        <span className="text-xs text-zinc-500">{habits.length} habits</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {habits.map((h) => {
          const hits = days.filter((d) => isDone(done, h.id, d.dateStr)).length;
          const goal = h.goal_target || days.length || 1;
          const pct = Math.min(100, (hits / goal) * 100);
          return (
            <div key={h.id} className="glass rounded-2xl p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-lg">{h.emoji || '✅'}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-800">{h.name}</p>
                  <p className="text-[10px] text-zinc-400">{hits} / {goal} this month</p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-zinc-700">{pct.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full rounded-full bg-zinc-800 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-3 flex flex-wrap gap-0.5">
                {days.map((d) => (
                  <span key={d.dateStr} className={`h-2.5 w-2.5 rounded-sm ${isDone(done, h.id, d.dateStr) ? 'bg-zinc-800' : 'bg-zinc-200'}`} title={d.dateStr} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="glass rounded-2xl p-4">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Weekly intensity</h4>
        <div className="space-y-2">
          {weeks.map((week, wi) => {
            const score = habits.length && week.length
              ? week.reduce((acc, d) => acc + habits.filter((h) => isDone(done, h.id, d.dateStr)).length / habits.length, 0) / week.length
              : 0;
            return (
              <div key={wi} className="flex items-center gap-2 text-xs">
                <span className="w-14 text-zinc-400">Week {wi + 1}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                  <div className="h-full rounded-full bg-zinc-700" style={{ width: `${Math.round(score * 100)}%` }} />
                </div>
                <span className="w-8 text-right tabular-nums text-zinc-500">{Math.round(score * 100)}%</span>
              </div>
            );
          })}
        </div>
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
  void weeks;
  const series = habits.map((h) => days.map((d) => (isDone(done, h.id, d.dateStr) ? 1 : 0)));
  const pairs: { a: Habit; b: Habit; r: number }[] = [];
  for (let i = 0; i < habits.length; i++) {
    for (let j = i + 1; j < habits.length; j++) {
      pairs.push({ a: habits[i], b: habits[j], r: pearson(series[i], series[j]) });
    }
  }
  pairs.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
  const byWeekday = WEEKDAYS.map((_, wi) => {
    const subset = days.filter((d) => d.weekdayIdx === wi);
    if (!subset.length || !habits.length) return 0;
    const hits = subset.reduce((acc, d) => acc + habits.filter((h) => isDone(done, h.id, d.dateStr)).length, 0);
    return hits / (subset.length * habits.length);
  });
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="glass rounded-2xl p-4">
        <h3 className="mb-3 text-sm font-semibold text-zinc-800">Weekday pattern</h3>
        <div className="flex items-end gap-2" style={{ height: 120 }}>
          {byWeekday.map((v, i) => (
            <div key={WEEKDAYS[i]} className="flex flex-1 flex-col items-center justify-end gap-1">
              <div className="w-full max-w-[2rem] rounded-t-md bg-zinc-800" style={{ height: `${Math.max(4, v * 100)}px` }} />
              <span className="text-[10px] text-zinc-500">{WEEKDAYS[i]}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-zinc-400">Share of habits completed on each weekday this month.</p>
      </div>
      <div className="glass rounded-2xl p-4">
        <h3 className="mb-3 text-sm font-semibold text-zinc-800">Habit correlations</h3>
        {pairs.length === 0 ? (
          <p className="text-xs text-zinc-400">Need at least two habits with data.</p>
        ) : (
          <ul className="space-y-2">
            {pairs.slice(0, 8).map((p) => (
              <li key={`${p.a.id}-${p.b.id}`} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-zinc-700">{p.a.emoji} {p.a.name}<span className="mx-1 text-zinc-300">×</span>{p.b.emoji} {p.b.name}</span>
                <span className={`tabular-nums font-medium ${p.r > 0.3 ? 'text-zinc-800' : p.r < -0.3 ? 'text-zinc-500' : 'text-zinc-400'}`}>{p.r >= 0 ? '+' : ''}{p.r.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[10px] text-zinc-400">Pearson r over this month (−1 to +1).</p>
      </div>
      <div className="glass rounded-2xl p-4 lg:col-span-2">
        <h3 className="mb-3 text-sm font-semibold text-zinc-800">Heat calendar</h3>
        <div className="flex flex-wrap gap-1">
          {days.map((d) => {
            const t = habits.length ? habits.filter((h) => isDone(done, h.id, d.dateStr)).length / habits.length : 0;
            return (
              <div key={d.dateStr} title={`${d.dateStr}: ${Math.round(t * 100)}%`} className="flex h-8 w-8 items-center justify-center rounded-md text-[10px] tabular-nums text-zinc-600" style={{ background: greyFill(t) }}>
                {d.day}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
