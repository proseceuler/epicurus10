import { useMemo, useState } from 'react';
import { getLoop, type DayRings, type LoopState } from '@/lib/loop';
import { getPraxis, SEASON_DAYS } from '@/lib/praxis';
import { todayIso } from '@/lib/xp';

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return todayIso(d);
}

function intensity(day: DayRings | undefined): 0 | 1 | 2 | 3 {
  if (!day) return 0;
  const n = [day.floor, day.focus, day.school].filter(Boolean).length;
  return n as 0 | 1 | 2 | 3;
}

/** Zinc scale — empty → full closed day */
const FILLS = [
  'bg-zinc-100',
  'bg-zinc-300',
  'bg-zinc-500',
  'bg-zinc-900',
] as const;

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function PraxisHeatmap({
  loop: loopProp,
  className = '',
}: {
  loop?: LoopState;
  className?: string;
}) {
  const loop = loopProp ?? getLoop();
  const praxis = getPraxis();
  const today = todayIso();
  const [hover, setHover] = useState<{ iso: string; level: number } | null>(null);

  const { cells, weeks } = useMemo(() => {
    const start = praxis.seasonStart;
    const end = today < addDays(start, SEASON_DAYS - 1) ? today : addDays(start, SEASON_DAYS - 1);
    // pad to Monday of season start week
    const startDow = new Date(`${start}T12:00:00`).getDay();
    const pad = startDow === 0 ? 6 : startDow - 1;
    const gridStart = addDays(start, -pad);

    const list: { iso: string; inSeason: boolean; level: 0 | 1 | 2 | 3; future: boolean }[] = [];
    let cur = gridStart;
    // enough weeks to cover season through end
    while (cur <= end || list.length % 7 !== 0) {
      const future = cur > today;
      const inSeason = cur >= start && cur <= end;
      const level = future || !inSeason ? 0 : intensity(loop.days[cur]);
      list.push({ iso: cur, inSeason, level, future });
      cur = addDays(cur, 1);
      if (list.length > 140) break; // safety
    }
    // complete last week
    while (list.length % 7 !== 0) {
      list.push({ iso: cur, inSeason: false, level: 0, future: true });
      cur = addDays(cur, 1);
    }
    const weekCount = list.length / 7;
    const byWeek: typeof list[] = [];
    for (let w = 0; w < weekCount; w++) byWeek.push(list.slice(w * 7, w * 7 + 7));
    return { cells: list, weeks: byWeek };
  }, [loop.days, praxis.seasonStart, today]);

  const closed = cells.filter((c) => c.inSeason && !c.future && c.level === 3).length;
  const active = cells.filter((c) => c.inSeason && !c.future && c.level > 0).length;
  const seasonDays = cells.filter((c) => c.inSeason && !c.future).length;

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Season map</p>
        <p className="text-[11px] tabular-nums text-zinc-500">
          {closed} closed · {active} active · {seasonDays}d
        </p>
      </div>

      <div className="flex gap-1">
        <div className="flex flex-col gap-[3px] pr-1 pt-0">
          {WEEKDAYS.map((d, i) => (
            <span key={`${d}-${i}`} className="flex h-[11px] items-center text-[8px] leading-none text-zinc-400">
              {i % 2 === 0 ? d : ''}
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 gap-[3px] overflow-x-auto pb-1">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((cell) => {
                const tip = hover?.iso === cell.iso;
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    disabled={!cell.inSeason || cell.future}
                    onMouseEnter={() => setHover({ iso: cell.iso, level: cell.level })}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover({ iso: cell.iso, level: cell.level })}
                    onBlur={() => setHover(null)}
                    title={cell.inSeason ? `${cell.iso} · ${cell.level}/3 rings` : undefined}
                    className={`h-[11px] w-[11px] rounded-[2px] transition-opacity ${
                      !cell.inSeason || cell.future
                        ? 'bg-transparent opacity-30'
                        : FILLS[cell.level]
                    } ${tip ? 'ring-1 ring-zinc-900 ring-offset-1' : ''}`}
                    aria-label={cell.inSeason ? `${cell.iso}, ${cell.level} of 3 rings` : undefined}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[10px] tabular-nums text-zinc-500">
          {hover
            ? `${hover.iso} · ${hover.level}/3`
            : `Season ${praxis.seasonIndex} from ${praxis.seasonStart}`}
        </p>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-zinc-400">Less</span>
          {FILLS.map((c, i) => (
            <span key={i} className={`h-[9px] w-[9px] rounded-[2px] ${c}`} />
          ))}
          <span className="text-[9px] text-zinc-400">More</span>
        </div>
      </div>
    </div>
  );
}
