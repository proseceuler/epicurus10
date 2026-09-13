import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { PageId } from '@/components/AppLayout';
import { getLoop, ringsFor, weekMarks, LOOP_CHANGED } from '@/lib/loop';
import { getXP, recentAwards, xpForNextLevel, XP_CHANGED, todayIso } from '@/lib/xp';
import { titleForLevel } from '@/lib/progress';
import { fadeMotion, motionTransition, sheetMotion } from '@/lib/motion';
import { X } from 'lucide-react';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function AtaraxiaPanel({
  open,
  onClose,
  navigate,
}: {
  open: boolean;
  onClose: () => void;
  navigate: (p: PageId) => void;
}) {
  const reduce = useReducedMotion();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const sync = () => setTick((n) => n + 1);
    window.addEventListener(XP_CHANGED, sync);
    window.addEventListener(LOOP_CHANGED, sync);
    return () => {
      window.removeEventListener(XP_CHANGED, sync);
      window.removeEventListener(LOOP_CHANGED, sync);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const bar = xpForNextLevel(getXP());
  const loop = getLoop();
  const rings = ringsFor();
  const marks = weekMarks(loop);
  const log = recentAwards(7);
  const closed = [rings.floor, rings.focus, rings.school].filter(Boolean).length;
  const sunday = new Date().getDay() === 0;
  const todayXp = useMemo(() => log.filter((row) => row.date === todayIso()).reduce((s, r) => s + r.delta, 0), [log, tick]);
  void tick;

  const nextHint = !rings.floor
    ? { label: 'Close floor', detail: 'One habit, task, or due card.', page: 'todos' as PageId }
    : !rings.focus
      ? { label: 'Close focus', detail: 'Sit for 15 minutes.', page: 'pomodoro' as PageId }
      : !rings.school
        ? { label: 'Close school', detail: 'Log a score or mark attend.', page: 'grades' as PageId }
        : { label: 'Day complete', detail: 'Nothing left on the three rings.', page: 'dashboard' as PageId };

  const go = (page: PageId) => {
    onClose();
    navigate(page);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="ataraxia-root"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          initial={reduce ? false : fadeMotion.initial}
          animate={fadeMotion.animate}
          exit={fadeMotion.exit}
          transition={motionTransition(reduce, 0.22)}
        >
          <motion.button
            type="button"
            aria-label="Close progress"
            className="absolute inset-0 bg-zinc-900/35 backdrop-blur-sm"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-label="Ataraxia"
            className="glass glass-shadow-lg relative z-[61] flex max-h-[min(88vh,40rem)] w-[min(100vw-2rem,28rem)] flex-col overflow-hidden rounded-lg border border-zinc-200/80"
            initial={reduce ? false : sheetMotion.initial}
            animate={sheetMotion.animate}
            exit={sheetMotion.exit}
            transition={motionTransition(reduce, 0.34)}
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              className="flex items-start justify-between border-b border-zinc-200/70 px-5 py-4"
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={motionTransition(reduce, 0.28)}
            >
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Ataraxia</p>
                <p className="mt-1 text-base font-semibold tracking-tight text-zinc-800">
                  Level {bar.level} · {titleForLevel(bar.level)}
                </p>
                <p className="text-[11px] tabular-nums text-zinc-500">
                  {bar.into} / {bar.span} · {Math.round(bar.progress * 100)}%
                </p>
              </div>
              <button type="button" onClick={onClose} className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100">
                <X className="h-4 w-4" />
              </button>
            </motion.div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="px-5 pt-4">
                <div className="h-1 overflow-hidden rounded-none bg-zinc-200/80">
                  <motion.div
                    className="h-full bg-zinc-800"
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: `${Math.round(bar.progress * 100)}%` }}
                    transition={motionTransition(reduce, 0.45)}
                  />
                </div>
              </div>

              <div className="px-5 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Today</p>
                  <p className="text-[11px] tabular-nums text-zinc-500">{closed} / 3 · +{todayXp} today</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <RingButton label="Floor" hint="habit · task · cards" filled={rings.floor} delay={0.04} reduce={!!reduce} onClick={() => go(rings.floor ? 'habits' : 'todos')} />
                  <RingButton label="Focus" hint="15 min+" filled={rings.focus} delay={0.1} reduce={!!reduce} onClick={() => go('pomodoro')} />
                  <RingButton label="School" hint="grade · attend" filled={rings.school} delay={0.16} reduce={!!reduce} onClick={() => go(rings.school ? 'grades' : 'classhub')} />
                </div>
              </div>

              <motion.button
                type="button"
                onClick={() => go(nextHint.page)}
                className="mx-5 mb-4 flex w-[calc(100%-2.5rem)] items-center justify-between rounded-md border border-zinc-200/80 bg-white/50 px-3 py-2.5 text-left"
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={motionTransition(reduce, 0.3)}
                whileTap={reduce ? undefined : { scale: 0.98 }}
              >
                <span>
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Next</span>
                  <span className="text-sm font-medium text-zinc-800">{nextHint.label}</span>
                  <span className="mt-0.5 block text-[11px] text-zinc-500">{nextHint.detail}</span>
                </span>
                <span className="text-[11px] text-zinc-400">open</span>
              </motion.button>

              <div className="px-5 pb-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Streak</p>
                  <p className="text-[11px] text-zinc-600">{loop.paused ? 'paused' : `${loop.streak} day${loop.streak === 1 ? '' : 's'}`}</p>
                </div>
                <div className="flex items-end gap-1.5">
                  {marks.map((on, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1">
                      <motion.span
                        className={`h-8 w-full ${on ? 'bg-zinc-800' : 'bg-zinc-200'}`}
                        initial={reduce ? false : { scaleY: 0.3, opacity: 0 }}
                        animate={{ scaleY: 1, opacity: 1 }}
                        transition={{ ...motionTransition(reduce, 0.28), delay: 0.04 * i }}
                        style={{ transformOrigin: 'bottom' }}
                      />
                      <span className="text-[9px] text-zinc-400">{DAYS[i]}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">
                  {loop.freezeReady ? 'Freeze ready — a missed day will spend it.' : loop.freezeSpentWeek ? 'Freeze already spent this week.' : 'Freeze unlocks after 5 counted days this week.'}
                </p>
              </div>

              <div className="border-t border-zinc-200/70 px-5 py-4">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Ledger</p>
                {log.length === 0 && <p className="text-xs text-zinc-400">Nothing counted yet. Close a ring.</p>}
                {log.map((row, i) => (
                  <motion.div
                    key={`${row.key}-${row.at}`}
                    className="flex items-center justify-between py-1 text-[12px]"
                    initial={reduce ? false : { opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...motionTransition(reduce, 0.22), delay: 0.03 * i }}
                  >
                    <span className="truncate text-zinc-600">{row.label.replace(/_/g, ' ')}</span>
                    <span className="tabular-nums text-zinc-800">+{row.delta}</span>
                  </motion.div>
                ))}
                {sunday && <p className="mt-2 text-[11px] text-zinc-500">Sunday recap is on Home.</p>}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-px border-t border-zinc-200/70 bg-zinc-100/80">
              {(
                [
                  ['habits', 'Habits'],
                  ['pomodoro', 'Focus'],
                  ['grades', 'Grades'],
                ] as [PageId, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => go(id)}
                  className="bg-white/80 px-2 py-2.5 text-[11px] font-medium text-zinc-600 hover:bg-white hover:text-zinc-900"
                >
                  {label}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RingButton({
  label,
  hint,
  filled,
  delay,
  reduce,
  onClick,
}: {
  label: string;
  hint: string;
  filled: boolean;
  delay: number;
  reduce: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-md px-1 py-2 hover:bg-zinc-100/80"
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.28, delay, ease: [0.32, 0.72, 0, 1] }}
      whileTap={reduce ? undefined : { scale: 0.96 }}
    >
      <motion.span
        className={`flex h-12 w-12 items-center justify-center rounded-md border-2 text-[11px] font-semibold ${
          filled ? 'border-zinc-800 bg-zinc-800 text-white' : 'border-zinc-300 text-zinc-400'
        }`}
        animate={filled && !reduce ? { scale: [0.92, 1.06, 1] } : { scale: 1 }}
        transition={{ duration: 0.36 }}
      >
        {filled ? 'done' : ''}
      </motion.span>
      <span className="text-[11px] font-medium text-zinc-700">{label}</span>
      <span className="text-[9px] leading-tight text-zinc-400">{hint}</span>
    </motion.button>
  );
}
