import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
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
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  const day = (t.getDay() + 6) % 7;
  t.setDate(t.getDate() - day);
  return t.toISOString().slice(0, 10);
}

export function shouldShowSundayRecap() {
  if (typeof window === 'undefined') return false;
  if (new Date().getDay() !== 0) return false;
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

const fade = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

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
      { title: 'Week in review', body: 'A quick look at how you showed up this week.', metric: null as string | null },
      { title: 'Focus time', body: 'Deep work logged across the last 7 days.', metric: stats.focusLabel },
      { title: 'Habit streak', body: 'Consecutive days with habits completed.', metric: `${stats.streak}d` },
      { title: 'Habits today', body: 'Check-ins on the board right now.', metric: stats.habitsTotal ? `${stats.habitsToday}/${stats.habitsTotal}` : '—' },
      { title: 'Open work', body: 'Tasks still waiting on you.', metric: String(stats.openTasks) },
      { title: 'Level progress', body: 'XP from habits, tasks, and reviews.', metric: `Lv ${xp.level} · ${xp.xp} XP` },
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
    <motion.div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="glass relative w-full max-w-md overflow-hidden rounded-3xl p-6 shadow-2xl"
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.button
          type="button"
          onClick={close}
          whileTap={{ scale: 0.92 }}
          className="absolute right-3 top-3 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
        >
          <X className="h-4 w-4" />
        </motion.button>
        <motion.p
          className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          Sunday recap
        </motion.p>
        <div className="min-h-[9.5rem]">
          <AnimatePresence mode="wait">
            <motion.div key={i} initial={fade.initial} animate={fade.animate} exit={fade.exit} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
              <h2 className="mt-2 text-xl font-semibold text-zinc-900">{slide.title}</h2>
              <p className="mt-1 text-sm text-zinc-500">{slide.body}</p>
              {slide.metric != null && (
                <motion.p
                  className="mt-8 text-center text-4xl font-semibold tabular-nums tracking-tight text-zinc-900"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.08, type: 'spring', stiffness: 260, damping: 22 }}
                >
                  {slide.metric}
                </motion.p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="mt-10 flex items-center justify-between">
          <motion.button
            type="button"
            disabled={i === 0}
            onClick={() => setI((v) => v - 1)}
            whileTap={{ scale: 0.96 }}
            className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </motion.button>
          <div className="flex gap-1.5">
            {slides.map((_, idx) => (
              <motion.span
                key={idx}
                layout
                className={`h-1.5 rounded-full ${
                  idx === i ? 'w-4 bg-zinc-900' : 'w-1.5 bg-zinc-300'
                }`}
                transition={{ type: 'spring', stiffness: 320, damping: 24 }}
              />
            ))}
          </div>
          {i < slides.length - 1 ? (
            <motion.button
              type="button"
              onClick={() => setI((v) => v + 1)}
              whileTap={{ scale: 0.96 }}
              className="flex items-center gap-1 rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
            >
              Next <ChevronRight className="h-4 w-4" />
            </motion.button>
          ) : (
            <motion.button
              type="button"
              onClick={close}
              whileTap={{ scale: 0.96 }}
              className="rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
            >
              Done
            </motion.button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
