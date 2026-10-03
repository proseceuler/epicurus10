import { useMemo } from 'react';
import { getLoop, type DayRings, type LoopState } from '@/lib/loop';
import { getPraxis, SEASON_DAYS } from '@/lib/praxis';
import { todayIso } from '@/lib/xp';
import {
  HeatmapChart,
  HeatmapCells,
  HeatmapTooltip,
  HeatmapLegend,
  HeatmapXAxis,
  HeatmapYAxis,
  type HeatmapColumn,
} from '@/charts/heatmap';

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return todayIso(d);
}

function intensity(day: DayRings | undefined): number {
  if (!day) return 0;
  return [day.floor, day.focus, day.school].filter(Boolean).length;
}

function buildSeasonColumns(loop: LoopState, seasonStart: string, today: string): HeatmapColumn[] {
  const end = today < addDays(seasonStart, SEASON_DAYS - 1) ? today : addDays(seasonStart, SEASON_DAYS - 1);
  const startDow = new Date(`${seasonStart}T12:00:00`).getDay();
  const pad = startDow === 0 ? 6 : startDow - 1;
  const gridStart = addDays(seasonStart, -pad);
  const days: { date: Date; count: number }[] = [];
  let cur = gridStart;
  while (true) {
    const future = cur > today;
    const inSeason = cur >= seasonStart && cur <= end;
    const count = future || !inSeason ? 0 : intensity(loop.days[cur]);
    days.push({ date: new Date(`${cur}T12:00:00`), count });
    if (cur >= end && days.length % 7 === 0) break;
    cur = addDays(cur, 1);
    if (days.length > 140) break;
  }
  while (days.length % 7 !== 0) {
    const d = addDays(todayIso(days[days.length - 1].date), 1);
    days.push({ date: new Date(`${d}T12:00:00`), count: 0 });
  }
  const columns: HeatmapColumn[] = [];
  for (let w = 0; w < days.length / 7; w++) {
    const slice = days.slice(w * 7, w * 7 + 7);
    columns.push({
      bin: w,
      bins: slice.map((cell, i) => ({ bin: i, date: cell.date, count: cell.count })),
    });
  }
  return columns;
}

export function PraxisHeatmap({ loop: loopProp, className = '' }: { loop?: LoopState; className?: string }) {
  const loop = loopProp ?? getLoop();
  const praxis = getPraxis();
  const today = todayIso();
  const data = useMemo(() => buildSeasonColumns(loop, praxis.seasonStart, today), [loop.days, praxis.seasonStart, today]);
  const closed = data.reduce((n, col) => n + col.bins.filter((b) => b.count >= 3).length, 0);
  const active = data.reduce((n, col) => n + col.bins.filter((b) => b.count > 0).length, 0);

  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Season map</p>
        <p className="text-[11px] tabular-nums text-zinc-500">{closed} closed · {active} active</p>
      </div>
      <div className="w-full overflow-x-auto">
        <HeatmapChart data={data} layout="fluid" weekStartDay={1} gap={3} margin={{ top: 8, right: 4, bottom: 20, left: 18 }} animationDuration={700}>
          <HeatmapCells />
          <HeatmapYAxis />
          <HeatmapXAxis />
          <HeatmapTooltip />
          <HeatmapLegend />
        </HeatmapChart>
      </div>
      <p className="mt-1 text-[10px] tabular-nums text-zinc-500">
        Season {praxis.seasonIndex} from {praxis.seasonStart} · intensity = rings closed (0–3)
      </p>
    </div>
  );
}
