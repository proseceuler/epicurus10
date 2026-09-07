import { useEffect, useMemo, useState } from 'react';
import { getXP } from '@/lib/xp';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

export type RecapStats = {
  focusLabel: string;
  streak: number;
  habitsToday: number;
  habitsTotal: number;
  openTasks: number;
  tasksDoneWeek?: number;
  focusMinutes: number;
};

const KEY = 'epicure:sunday-recap:v1';

function weekKey(d = new Date()) {
  // ISO-ish week id for "already shown this Sunday session window"
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  // week starting Monday
  const day = (t.getDay() + 6) % 7;
  t.setDate(t.getDate() - day);
  return t.toISOString().slice(0, 10);
}

export function shouldShowSundayRecap() {
  if (typeof window === 'undefined') return false;
  if (new Date().getDay() !== 0) return false; // Sunday only
  try {
    return localStorage.getItem(KEY) !== weekKey();
  } catch {
    return true;
  }
}

export function markSundayRecapSeen() {
  try {
    localStorage.setItem(KEY, weekKey());
  } catch {
    /* ignore */
  }
}

export default function WeeklyRecapSlideshow({
  stats,
  onClose,
}: {
  stats: RecapStats;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const xp = getXP();

  const slides = useMemo(
    () => [
      {
        title: 'Week in review',
        body: 'A quick look at how you showed up this week.',
        metric: null as string | null,
      },
      {
        title: 'Focus time',
        body: 'Deep work logged across the last 7 days.',
        metric: stats.focusLabel,
      },
      {
        title: 'Habit streak',
        body: 'Consecutive days with habits completed.',
        metric: `${stats.streak}d`,
      },
      {
        title: 'Habits today',
        body: 'Check-ins on the board right now.',
        metric: stats.habitsTotal ? `${stats.habitsToday}/${stats.habitsTotal}` : '—',
      },
      {
        title: 'Open work',
        body: 'Tasks still waiting on you.',
        metric: String(stats.openTasks),
      },
      {
        title: 'Level progress',
        body: 'XP from habits, tasks, and reviews.',
        metric: `Lv ${xp.level} · ${xp.xp} XP`,
      },
    ],
    [stats, xp.level, xp.xp],
  );

  const slide = slides[i];

  const close = () => {
    markSundayRecapSeen();
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') setI((v) => Math.min(slides.length - 1, v + 1));
      if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm">
      <div className="glass relative w-full max-w-md overflow-hidden rounded-3xl p-6 shadow-2xl">
        <button
          type="button"
          onClick={close}
          className="absolute right-3 top-3 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Sunday recap</p>
        <h2 className="mt-2 text-xl font-semibold text-zinc-900">{slide.title}</h2>
        <p className="mt-1 text-sm text-zinc-500">{slide.body}</p>
        {slide.metric != null && (
          <p className="mt-8 text-center text-4xl font-semibold tabular-nums tracking-tight text-zinc-900">
            {slide.metric}
          </p>
        )}
        <div className="mt-10 flex items-center justify-between">
          <button
            type="button"
            disabled={i === 0}
            onClick={() => setI((v) => v - 1)}
            className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex gap-1.5">
            {slides.map((_, idx) => (
              <span
                key={idx}
                className={`h-1.5 w-1.5 rounded-full ${idx === i ? 'bg-zinc-900' : 'bg-zinc-300'}`}
              />
            ))}
          </div>
          {i < slides.length - 1 ? (
            <button
              type="button"
              onClick={() => setI((v) => v + 1)}
              className="flex items-center gap-1 rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={close}
              className="rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
