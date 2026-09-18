import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { PageId } from '@/components/AppLayout';
import { getLoop, ringsFor, weekMarks, LOOP_CHANGED } from '@/lib/loop';
import { allAwards, recentAwards, xpForNextLevel, XP_CHANGED } from '@/lib/xp';
import {
  earnedSigils,
  formatMinutes,
  getPraxis,
  PRAXIS_CHANGED,
  reflectionFor,
  saveReflection,
  seasonLedger,
  SIGIL_CATALOG,
  titleForLevel,
  vigilProgress,
  weekFocusMinutes,
} from '@/lib/praxis';
import { motionTransition, overlayPresence, sheetMotion } from '@/lib/motion';
import { BodyPortal, OverlayScrim } from '@/components/MotionUI';
import { X } from 'lucide-react';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const RING_META = [
  { id: 'floor' as const, label: 'Floor', hint: 'habit · task · cards', stroke: '#18181b', r: 54, pageOn: 'habits' as PageId, pageOff: 'todos' as PageId },
  { id: 'focus' as const, label: 'Focus', hint: 'session depth', stroke: '#3f3f46', r: 40, pageOn: 'pomodoro' as PageId, pageOff: 'pomodoro' as PageId },
  { id: 'school' as const, label: 'School', hint: 'grade · attend', stroke: '#71717a', r: 26, pageOn: 'grades' as PageId, pageOff: 'classhub' as PageId },
];

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
  const [note, setNote] = useState('');

  useEffect(() => {
    const sync = () => setTick((n) => n + 1);
    window.addEventListener(XP_CHANGED, sync);
    window.addEventListener(LOOP_CHANGED, sync);
    window.addEventListener(PRAXIS_CHANGED, sync);
    return () => {
      window.removeEventListener(XP_CHANGED, sync);
      window.removeEventListener(LOOP_CHANGED, sync);
      window.removeEventListener(PRAXIS_CHANGED, sync);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setNote(reflectionFor());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const bar = xpForNextLevel();
  const loop = getLoop();
  const praxis = getPraxis();
  const rings = ringsFor();
  const marks = weekMarks(loop);
  const ledger = useMemo(() => allAwards(), [tick]);
  const recent = seasonLedger(recentAwards(8)).filter((row) => row.date >= praxis.seasonStart);
  const closed = [rings.floor, rings.focus, rings.school].filter(Boolean).length;
  const focusWeek = weekFocusMinutes(ledger);
  const sigils = earnedSigils(loop, ledger);
  const vigil = vigilProgress(loop);
  void tick;

  const go = (page: PageId) => {
    onClose();
    navigate(page);
  };

  return (
    <BodyPortal>
      <AnimatePresence>
        {open && (
          <motion.div key="praxis-root" className="fixed inset-0 z-[60] flex items-center justify-center p-4" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 1 }} transition={overlayPresence(reduce)}>
            <OverlayScrim onClose={onClose} />
            <motion.div
              role="dialog"
              aria-label="Praxis"
              className="epic-glass-sheet relative z-[61] flex max-h-[min(90vh,44rem)] w-[min(100vw-2rem,28rem)] flex-col overflow-hidden"
              initial={reduce ? false : sheetMotion.initial}
              animate={sheetMotion.animate}
              exit={sheetMotion.exit}
              transition={motionTransition(reduce, 0.34)}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between border-b border-zinc-200/50 px-5 py-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Praxis</p>
                  <p className="mt-1 text-base font-semibold tracking-tight text-zinc-800">
                    Level {bar.level} · {titleForLevel(bar.level)}
                  </p>
                  <p className="text-[11px] tabular-nums text-zinc-500">
                    Season {praxis.seasonIndex} · {bar.into} / {bar.span}
                  </p>
                </div>
                <button type="button" onClick={onClose} className="rounded-md p-1.5 text-zinc-500 hover:bg-white/40">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="px-5 pt-4">
                  <div className="h-1 overflow-hidden rounded-full bg-zinc-200/70">
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
                    <p className="text-[11px] tabular-nums text-zinc-500">{closed} / 3</p>
                  </div>
                  <SharedRings rings={rings} reduce={!!reduce} onSelect={(id) => {
                    const meta = RING_META.find((r) => r.id === id)!;
                    go(rings[id] ? meta.pageOn : meta.pageOff);
                  }} />
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {RING_META.map((r) => (
                      <button key={r.id} type="button" onClick={() => go(rings[r.id] ? r.pageOn : r.pageOff)} className="text-center">
                        <p className="text-[11px] font-medium text-zinc-700">{r.label}</p>
                        <p className="text-[9px] text-zinc-400">{r.hint}</p>
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-center text-[11px] tabular-nums text-zinc-500">
                    This week · {formatMinutes(focusWeek)} focus
                  </p>
                </div>

                {sigils.length > 0 && (
                  <div className="px-5 pb-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Marks</p>
                    <div className="flex flex-wrap gap-2">
                      {SIGIL_CATALOG.filter((s) => sigils.includes(s.id)).map((s) => (
                        <span key={s.id} title={s.label} className="inline-flex h-8 w-8 items-center justify-center rounded-lg glass text-sm text-zinc-700">
                          {s.glyph}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="px-5 pb-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Thread</p>
                    <p className="text-[11px] text-zinc-600">{loop.paused ? 'softened' : `${loop.streak} day${loop.streak === 1 ? '' : 's'}`}</p>
                  </div>
                  <div className="flex items-end gap-1.5">
                    {marks.map((on, i) => (
                      <div key={i} className="flex flex-1 flex-col items-center gap-1">
                        <motion.span
                          className={`h-8 w-full rounded-sm ${on ? 'bg-zinc-800' : 'bg-zinc-200/80'}`}
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
                    {!praxis.prefs.freezeEnabled
                      ? 'Freeze is off. A miss softens the thread.'
                      : loop.freezeReady
                        ? 'Freeze ready — a missed day will spend it.'
                        : loop.freezeSpentWeek
                          ? 'Freeze already spent this week.'
                          : 'Freeze unlocks after 5 counted days this week.'}
                  </p>
                  {praxis.prefs.vigilsEnabled && (
                    <p className="mt-1 text-[11px] text-zinc-500">Vigil {vigil.closed} / {vigil.goal} closed days this week.</p>
                  )}
                </div>

                <div className="border-t border-zinc-200/50 px-5 py-4">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Ledger</p>
                  {recent.length === 0 && <p className="text-xs text-zinc-400">Nothing in this season yet.</p>}
                  {recent.map((row, i) => (
                    <motion.div
                      key={`${row.key}-${row.at}`}
                      className="flex items-center justify-between py-1 text-[12px]"
                      initial={reduce ? false : { opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ ...motionTransition(reduce, 0.22), delay: 0.03 * i }}
                    >
                      <span className="min-w-0 truncate text-zinc-600">
                        {row.label.replace(/_/g, ' ')}
                        {row.intensity === 'light' ? ' · light' : ''}
                      </span>
                      <span className="tabular-nums text-zinc-800">+{row.delta}</span>
                    </motion.div>
                  ))}
                  {praxis.archives.length > 0 && (
                    <p className="mt-2 text-[11px] text-zinc-400">
                      {praxis.archives.length} archived season{praxis.archives.length === 1 ? '' : 's'}.
                    </p>
                  )}
                </div>

                <div className="border-t border-zinc-200/50 px-5 py-4">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Attend</p>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onBlur={() => saveReflection(note)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    placeholder="One line for today (optional)"
                    className="w-full rounded-xl glass-input px-3 py-2 text-[12px] text-zinc-700 placeholder:text-zinc-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-px border-t border-zinc-200/50 bg-white/20">
                {([['habits', 'Habits'], ['pomodoro', 'Focus'], ['grades', 'Grades']] as [PageId, string][]).map(([id, label]) => (
                  <button key={id} type="button" onClick={() => go(id)} className="bg-white/40 px-2 py-2.5 text-[11px] font-medium text-zinc-600 hover:bg-white/70 hover:text-zinc-900">
                    {label}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </BodyPortal>
  );
}

function SharedRings({
  rings,
  reduce,
  onSelect,
}: {
  rings: { floor: boolean; focus: boolean; school: boolean };
  reduce: boolean;
  onSelect: (id: 'floor' | 'focus' | 'school') => void;
}) {
  return (
    <div className="flex justify-center">
      <svg viewBox="0 0 140 140" className="h-40 w-40">
        {RING_META.map((ring, i) => {
          const on = rings[ring.id];
          return (
            <g key={ring.id}>
              <circle cx="70" cy="70" r={ring.r} fill="none" stroke="rgba(24,24,27,0.12)" strokeWidth="8" />
              <motion.circle
                cx="70"
                cy="70"
                r={ring.r}
                fill="none"
                stroke={ring.stroke}
                strokeWidth="8"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray="1 1"
                transform="rotate(-90 70 70)"
                initial={reduce ? false : { strokeDashoffset: 1 }}
                animate={{ strokeDashoffset: on ? 0 : 0.999 }}
                transition={{ duration: reduce ? 0 : 0.7, delay: 0.08 * i, ease: [0.32, 0.72, 0, 1] }}
                className="cursor-pointer"
                onClick={() => onSelect(ring.id)}
              />
              <circle cx="70" cy="70" r={ring.r} fill="transparent" className="cursor-pointer" onClick={() => onSelect(ring.id)} />
            </g>
          );
        })}
        <text x="70" y="74" textAnchor="middle" className="fill-zinc-500" fontSize="11" fontWeight="600">
          {['floor', 'focus', 'school'].filter((id) => rings[id as keyof typeof rings]).length}/3
        </text>
      </svg>
    </div>
  );
}
