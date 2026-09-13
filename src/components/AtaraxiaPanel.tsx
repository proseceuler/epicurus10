import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { PageId } from '@/components/AppLayout';
import { getLoop, ringsFor, weekMarks, LOOP_CHANGED } from '@/lib/loop';
import { getXP, recentAwards, xpForNextLevel, XP_CHANGED, todayIso } from '@/lib/xp';
import { titleForLevel } from '@/lib/progress';
import { X } from 'lucide-react';

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

  const bar = xpForNextLevel(getXP());
  const loop = getLoop();
  const rings = ringsFor();
  const marks = weekMarks(loop);
  const log = recentAwards(5);
  const closed = [rings.floor, rings.focus, rings.school].filter(Boolean).length;
  const sunday = new Date().getDay() === 0;
  void tick;

  const go = (page: PageId) => {
    onClose();
    navigate(page);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button type="button" aria-label="Close progress" className="fixed inset-0 z-[60] cursor-default bg-zinc-900/10" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div className="glass glass-shadow-lg fixed right-3 top-16 z-[61] w-[min(100vw-1.5rem,22rem)] overflow-hidden rounded-2xl" initial={reduce ? false : { opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ duration: 0.18 }}>
            <div className="flex items-start justify-between border-b border-zinc-200/70 px-4 py-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Ataraxia</p>
                <p className="mt-0.5 text-sm font-semibold text-zinc-800">Level {bar.level} · {titleForLevel(bar.level)}</p>
                <p className="text-[11px] tabular-nums text-zinc-500">{bar.into} / {bar.span}</p>
              </div>
              <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="px-4 pt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200/80">
                <div className="h-full rounded-full bg-zinc-800 transition-[width] duration-300" style={{ width: `${Math.round(bar.progress * 100)}%` }} />
              </div>
            </div>
            <div className="px-4 py-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Today</p>
                <p className="text-[11px] tabular-nums text-zinc-500">{closed} / 3</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <RingButton label="floor" hint="habit · task · cards" filled={rings.floor} onClick={() => go(rings.floor ? 'habits' : 'todos')} />
                <RingButton label="focus" hint="15 min+" filled={rings.focus} onClick={() => go('pomodoro')} />
                <RingButton label="school" hint="grade · attend" filled={rings.school} onClick={() => go(rings.school ? 'grades' : 'classhub')} />
              </div>
            </div>
            <div className="px-4 pb-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Streak</p>
                <p className="text-[11px] text-zinc-600">{loop.paused ? 'paused' : `${loop.streak} day${loop.streak === 1 ? '' : 's'}`}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {marks.map((on, i) => (
                  <span key={i} className={`h-2 flex-1 rounded-full ${on ? 'bg-zinc-800' : 'bg-zinc-200'}`} />
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-zinc-500">{loop.freezeReady ? 'freeze ready' : loop.freezeSpentWeek ? 'freeze spent' : 'freeze after 5 days this week'}</p>
            </div>
            <div className="border-t border-zinc-200/70 px-4 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">This week</p>
              {log.length === 0 && <p className="text-xs text-zinc-400">Nothing counted yet. Close a ring.</p>}
              {log.map((row) => (
                <div key={`${row.key}-${row.at}`} className="flex items-center justify-between py-0.5 text-[12px]">
                  <span className="truncate text-zinc-600">{row.label}</span>
                  <span className="tabular-nums text-zinc-800">+{row.delta}</span>
                </div>
              ))}
              {sunday && <p className="mt-2 text-[11px] text-zinc-500">Sunday recap is on Home.</p>}
              <p className="mt-2 text-[10px] text-zinc-400">{todayIso()}</p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function RingButton({ label, hint, filled, onClick }: { label: string; hint: string; filled: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-2 hover:bg-zinc-100/80">
      <span className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-[10px] font-semibold ${filled ? 'border-zinc-800 bg-zinc-800 text-white' : 'border-zinc-300 text-zinc-400'}`}>{filled ? '●' : ''}</span>
      <span className="text-[11px] font-medium capitalize text-zinc-700">{label}</span>
      <span className="text-[9px] leading-tight text-zinc-400">{hint}</span>
    </button>
  );
}
