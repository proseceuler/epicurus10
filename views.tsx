import { Fragment, type Dispatch, SetStateAction } from 'react';
import type { Habit, HabitCompletion } from '@/lib/types';
import BlackHole from '@/components/habits/BlackHole';
import {
  AlertRow, AreaChart, BarRow, Card, DualArea, HeatDays, HeatGrid, HeatRatio, MiniBar, Ring, ScatterTrend, Spark, Sheet,
  chunkWeekly, dailyVector, habitWeekSeries, heatGrey, corrFill, rateOn, countOn,
} from '@/components/habits/widgets';
import {
  MONTHS, WEEKDAYS, isDone, lastNDays, pearson, monthDays, type DayCell,
} from '@/lib/habit-stats';

export type View = 'home' | 'track' | 'dash' | 'insights';

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

function momDelta(h: Habit, done: Set<string>) {
  const now = new Date();
  const tm = monthDays(now.getFullYear(), now.getMonth());
  const lmMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const lmYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const lm = monthDays(lmYear, lmMonth);
  return { mtd: habitPct(h, tm, done), mom: habitPct(h, tm, done) - habitPct(h, lm, done) };
}

export function HomeView({
  habits, done, today, life, todayLeft, dailyScores, completions, onGo,
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
  const last84 = lastNDays(84);
  const weekly = chunkWeekly(habits, done, last84);
  const daily = dailyScores.map((d) => d.score);
  const wave = daily.some((v) => v > 0) ? daily : weekly;
  const waveLabels = daily.some((v) => v > 0)
    ? [dailyScores[0]?.date.slice(5) ?? '', dailyScores[Math.floor(dailyScores.length / 2)]?.date.slice(5) ?? '', dailyScores.at(-1)?.date.slice(5) ?? '']
    : last84.filter((_, i) => i % 7 === 0).map((d) => d.slice(5));
  const todayScore = rateOn(habits, today, done);
  const dist = lastNDays(14).map((d) => ({ key: d, value: rateOn(habits, d, done), label: d.slice(8) }));
  const monthDaysNow = monthDays(new Date().getFullYear(), new Date().getMonth());
  const monthDone = habits.reduce((s, h) => s + monthDaysNow.filter((d) => isDone(done, h.id, d.dateStr)).length, 0);
  const monthSlots = Math.max(1, habits.length * monthDaysNow.length);
  const links: { label: string; view: View }[] = [
    { label: '+ Update Habit Tracker', view: 'track' },
    { label: '+ Habit Dashboard', view: 'dash' },
    { label: '+ Habit Insights', view: 'insights' },
  ];

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      <div className="shrink-0 lg:w-[44%] xl:w-[46%]">
        <BlackHole className="aspect-square w-full min-h-[460px]" percent={life} ink />
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-6 gap-2">
        <Card title="Quick Actions" variant="flat" className="col-span-6 sm:col-span-2">
          <ul className="space-y-5 text-[13px] text-zinc-700">
            {links.map((l) => (
              <li key={l.view}>
                <button type="button" onClick={() => onGo(l.view)} className="underline decoration-zinc-400 underline-offset-4 hover:text-zinc-950">{l.label}</button>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Completion %" variant="flat" className="col-span-6 sm:col-span-2">
          <AreaChart values={wave} labels={waveLabels} height={128} ink />
        </Card>
        <Card title="Alerts" variant="flat" className="col-span-6 sm:col-span-2">
          <AlertRow label="Done today's Habits?" value={todayLeft.length ? 'Pending' : 'Done'} tone={todayLeft.length ? 'pending' : 'ok'} />
          <AlertRow label="Today's Habit Completion" value={`${Math.round(todayScore * 100)}%`} tone={todayScore >= 1 ? 'ok' : 'pending'} />
          <AlertRow label="Open habits left" value={String(todayLeft.length)} tone={todayLeft.length ? 'pending' : 'ok'} />
          <p className="mt-2 text-[10px] text-zinc-400">{completions.length} lifetime logs · {life.toFixed(1)}%</p>
        </Card>
        <Card title="Daily Score Distribution" variant="flat" className="col-span-6 md:col-span-3">
          <BarRow items={dist} height={140} showValue labelEvery={2} />
        </Card>
        <Card title="Trend" variant="flat" className="col-span-6 md:col-span-3">
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-2 gap-y-1.5 text-[11px]">
            <span className="text-[9px] uppercase tracking-wider text-zinc-500">Habit</span>
            <span className="text-[9px] uppercase tracking-wider text-zinc-500">MTD</span>
            <span className="text-[9px] uppercase tracking-wider text-zinc-500">MoM</span>
            <span className="text-[9px] uppercase tracking-wider text-zinc-500">12w</span>
            {habits.map((h) => {
              const { mtd, mom } = momDelta(h, done);
              const up = mom >= 0;
              return (
                <Fragment key={h.id}>
                  <span className="truncate text-zinc-700">{h.emoji} {h.name}</span>
                  <span className="tabular-nums text-zinc-500">{Math.round(mtd * 100)}%</span>
                  <span className="tabular-nums text-zinc-700">{up ? '▲' : '▼'}{Math.abs(Math.round(mom * 100))}</span>
                  <span><Spark values={habitWeekSeries(h.id, done)} width={72} ink /></span>
                </Fragment>
              );
            })}
          </div>
        </Card>
        <Card title="Progress (this month)" variant="flat" className="col-span-6">
          <div className="flex items-center gap-4">
            <Ring value={(monthDone / monthSlots) * 100} caption={`${monthDone}/${monthSlots} Habits Done`} />
            <div className="min-w-0 flex-1">
              <AreaChart values={daily} height={56} ink />
            </div>
          </div>
        </Card>
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
  setShowAdd: (v: boolean) => void;
  onToggle: (habitId: string, dateStr: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  life: number;
}) {
  const monthWave = days.map((d) => rateOn(habits, d.dateStr, done));
  const nWeeks = Math.max(weeks.length, 1);
  const weekCols = `minmax(108px, 132px) repeat(${nWeeks}, minmax(0, 1fr))`;

  return (
    <div className="pb-10">
      <AreaChart
        values={monthWave}
        labels={days.filter((_, i) => i === 0 || i === Math.floor(days.length / 2) || i === days.length - 1).map((d) => String(d.day))}
        height={168}
        ink
      />

      <div className="mt-3" style={{ display: 'grid', gridTemplateColumns: weekCols, columnGap: 6 }}>
        <div />
        {weeks.map((_, wi) => (
          <p key={wi} className="text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Week {wi + 1}</p>
        ))}

        <div />
        {weeks.map((week, wi) => (
          <div key={`hd-${wi}`} className="grid" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
            {Array.from({ length: 7 }, (_, wd) => {
              const cell = week.find((d) => d.weekdayIdx === wd);
              return (
                <div key={wd} className="text-center leading-tight">
                  <div className="text-[8px] text-zinc-500">{WEEKDAYS[wd]}</div>
                  <div className="text-[9px] tabular-nums text-zinc-600">{cell ? cell.day : ''}</div>
                </div>
              );
            })}
          </div>
        ))}

        {habits.map((h) => (
          <Fragment key={h.id}>
            <div className="flex h-8 items-center justify-between gap-1 pr-2">
              <span className="truncate text-[11px] text-zinc-700">{h.emoji} {h.name}</span>
              <button type="button" onClick={() => onRemove(h.id)} className="text-[9px] text-zinc-400 hover:text-zinc-700">×</button>
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="grid h-8 items-center" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                {Array.from({ length: 7 }, (_, wd) => {
                  const cell = week.find((d) => d.weekdayIdx === wd);
                  if (!cell) return <div key={wd} />;
                  const on = isDone(done, h.id, cell.dateStr);
                  const isToday = cell.dateStr === today;
                  return (
                    <button
                      key={cell.dateStr}
                      type="button"
                      onClick={() => onToggle(h.id, cell.dateStr)}
                      className={`mx-auto h-[18px] w-[18px] rounded-[2px] ${isToday ? 'ring-1 ring-zinc-800' : ''}`}
                      style={{ background: on ? '#18181b' : 'transparent', border: '1px solid #52525b' }}
                      aria-label={`${h.name} ${cell.dateStr}`}
                    />
                  );
                })}
              </div>
            ))}
          </Fragment>
        ))}

        <div />
        {weeks.map((week, wi) => {
          const pct = weekPct(habits, week, done);
          return (
            <div key={`bar-${wi}`} className="h-1.5 overflow-hidden rounded-full bg-zinc-200">
              <div className="h-full bg-zinc-800" style={{ width: `${Math.round(pct * 100)}%` }} />
            </div>
          );
        })}
      </div>

      {showAdd ? (
        <div className="mt-3 flex items-center gap-1.5">
          <input value={draft.emoji} onChange={(e) => setDraft((d) => ({ ...d, emoji: e.target.value }))} className="w-10 rounded border border-zinc-200 bg-white px-1.5 py-1 text-center text-sm" />
          <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Habit name" className="min-w-0 flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-[12px]" />
          <input value={draft.goal} onChange={(e) => setDraft((d) => ({ ...d, goal: e.target.value }))} className="w-12 rounded border border-zinc-200 bg-white px-1.5 py-1 text-center text-[12px]" />
          <button type="button" onClick={onAdd} className="rounded bg-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-50">Add</button>
          <button type="button" onClick={() => setShowAdd(false)} className="text-[11px] text-zinc-500">Cancel</button>
        </div>
      ) : (
        <button type="button" onClick={() => setShowAdd(true)} className="mt-3 text-[11px] text-zinc-500 underline">+ Add habit</button>
      )}

      <div className="mt-5" style={{ display: 'grid', gridTemplateColumns: weekCols, columnGap: 6 }}>
        <div />
        {weeks.map((week, wi) => {
          const pct = weekPct(habits, week, done);
          return (
            <div key={`wc-${wi}`}>
              <p className="text-[9px] uppercase tracking-wider text-zinc-500">Weekly Completion %</p>
              <p className="text-2xl font-semibold tabular-nums text-zinc-800">{Math.round(pct * 100)}%</p>
              <AreaChart values={week.map((d) => rateOn(habits, d.dateStr, done))} height={48} ink />
            </div>
          );
        })}
      </div>

      <div className="mt-4" style={{ display: 'grid', gridTemplateColumns: weekCols, columnGap: 6 }}>
        <div />
        {weeks.map((week, wi) => (
          <div key={`wh-${wi}`}>
            <p className="mb-1 text-[9px] uppercase tracking-wider text-zinc-500">Weekly Habit Completion %</p>
            {habits.map((h) => {
              const pct = habitPct(h, week, done);
              return (
                <div key={h.id} className="flex items-center gap-1 text-[10px]">
                  <span className="w-[42%] truncate text-zinc-600">{h.name}</span>
                  <span className="w-7 tabular-nums text-zinc-700">{Math.round(pct * 100)}</span>
                  <MiniBar value={pct} />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-end gap-4">
        <div>
          <p className="ht-label mb-1 text-zinc-500">Lifetime Progress</p>
          <BlackHole className="h-28 w-28" percent={life} ink />
        </div>
        <p className="pb-2 text-[11px] text-zinc-500">{year}/{MONTHS[month].slice(0, 3)}</p>
      </div>
    </div>
  );
}

export function DashView({
  habits, days, weeks, done, monthLabel, year = new Date().getFullYear(),
}: {
  habits: Habit[];
  days: DayCell[];
  weeks: DayCell[][];
  done: Set<string>;
  monthLabel: string;
  year?: number;
}) {
  const monthScores = dailyVector(habits, days, done);
  const weekdayAvg = WEEKDAYS.map((_, wd) => {
    const subset = days.filter((d) => d.weekdayIdx === wd);
    if (!subset.length) return 0;
    return subset.reduce((s, d) => s + countOn(habits, d.dateStr, done), 0) / subset.length;
  });
  const weekCols = weeks.map((_, i) => ({ key: String(i), label: `W${i + 1}` }));
  const last7 = days.slice(-7);

  return (
    <div className="space-y-8 pb-8">
      <section>
        <p className="mb-2 text-[15px] font-semibold text-zinc-800">Monthly Overview</p>
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 lg:col-span-4">
            <p className="ht-label mb-1">Monthly Habits Count (Day Breakdown)</p>
            <Sheet
              rows={MONTHS.map((m, i) => ({ key: String(i), label: m.slice(0, 3) }))}
              cols={WEEKDAYS.map((d, i) => ({ key: String(i), label: d }))}
              showAvgSum
              value={(row, col) => {
                const cells = monthDays(year, Number(row)).filter((d) => d.weekdayIdx === Number(col));
                return cells.reduce((s, d) => s + countOn(habits, d.dateStr, done), 0);
              }}
            />
            <p className="ht-label mt-3 mb-1">Avg Completed Habits by Day of Week</p>
            <BarRow items={WEEKDAYS.map((d, i) => ({ key: `${d}${i}`, value: weekdayAvg[i], label: d }))} height={110} showValue raw />
          </div>
          <div className="col-span-12 lg:col-span-5">
            <p className="ht-label mb-1">{monthLabel} · Completion % by Habits</p>
            <HeatGrid habits={habits} cols={days.map((d) => ({ dateStr: d.dateStr, day: d.day }))} done={done} showPct cell={15} />
            <p className="ht-label mt-3 mb-1">Monthly Habit Completion %</p>
            <BarRow items={habits.map((h) => ({ key: h.id, value: habitPct(h, days, done), label: h.emoji }))} height={110} showValue />
          </div>
          <div className="col-span-12 lg:col-span-3">
            <p className="ht-label mb-1">Daily Completion % Score</p>
            <HeatDays habits={habits} days={days} done={done} showLabel />
            <p className="ht-label mt-3 mb-1">Daily score distribution</p>
            <BarRow items={days.map((d, i) => ({ key: d.dateStr, value: monthScores[i] ?? 0, label: String(d.day) }))} height={110} labelEvery={3} />
          </div>
        </div>
      </section>

      <section>
        <p className="mb-2 text-[15px] font-semibold text-zinc-800">Weekly Overview</p>
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 lg:col-span-3">
            <p className="ht-label mb-1">Weekly Completed Habits (Day Breakdown)</p>
            <Sheet
              rows={weeks.map((_, i) => ({ key: String(i), label: `W${i + 1}` }))}
              cols={WEEKDAYS.map((d, i) => ({ key: String(i), label: d }))}
              showAvgSum
              value={(row, col) => {
                const cell = weeks[Number(row)]?.find((d) => d.weekdayIdx === Number(col));
                return cell ? countOn(habits, cell.dateStr, done) : 0;
              }}
            />
          </div>
          <div className="col-span-12 lg:col-span-6">
            <p className="ht-label mb-1">Weekly Completion % by Habits</p>
            <HeatRatio
              rows={habits.map((h) => ({ key: h.id, label: `${h.emoji} ${h.name}` }))}
              cols={weekCols}
              value={(hid, col) => habitPct(habits.find((h) => h.id === hid), weeks[Number(col)] ?? [], done)}
            />
          </div>
          <div className="col-span-12 lg:col-span-3">
            <p className="ht-label mb-1">Daily Completion % Score across each Week</p>
            <HeatDays habits={habits} days={days} done={done} showLabel />
          </div>
        </div>
      </section>
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
  const scores = dailyVector(habits, days, done);
  const habitRates = habits.map((h) => ({ h, pct: habitPct(h, days, done) }));
  const bestH = habitRates.reduce((a, b) => (b.pct > a.pct ? b : a), habitRates[0]);
  const worstH = habitRates.reduce((a, b) => (b.pct < a.pct ? b : a), habitRates[0]);
  const dayRates = days.map((d, i) => ({ d, pct: scores[i] ?? 0 }));
  const bestD = dayRates.reduce((a, b) => (b.pct > a.pct ? b : a), dayRates[0]);
  const worstD = dayRates.reduce((a, b) => (b.pct < a.pct ? b : a), dayRates[0]);
  const weekRates = weeks.map((w, i) => ({ i, pct: weekPct(habits, w, done) }));
  const bestW = weekRates.reduce((a, b) => (b.pct > a.pct ? b : a), weekRates[0]);
  const worstW = weekRates.reduce((a, b) => (b.pct < a.pct ? b : a), weekRates[0]);
  const series = habits.map((h) => days.map((d) => (isDone(done, h.id, d.dateStr) ? 1 : 0)));
  const corr: number[][] = habits.map((_, i) => habits.map((__, j) => (i === j ? 1 : pearson(series[i] ?? [], series[j] ?? []))));
  const bestIdx = Math.max(0, bestH ? habits.findIndex((h) => h.id === bestH.h.id) : 0);
  const worstIdx = Math.max(0, worstH ? habits.findIndex((h) => h.id === worstH.h.id) : 0);
  const byWeekday = WEEKDAYS.map((_, wd) => days.filter((d) => d.weekdayIdx === wd).map((d) => rateOn(habits, d.dateStr, done)));
  const dayCorr = WEEKDAYS.map((_, i) => WEEKDAYS.map((__, j) => (i === j ? 1 : pearson(byWeekday[i] ?? [], byWeekday[j] ?? []))));
  const avgWeek = weekRates.length ? weekRates.reduce((s, w) => s + w.pct, 0) / weekRates.length : 0;

  const recentDays = lastNDays(49);
  const priorDays = lastNDays(98).slice(0, 49);
  const recentOverall = chunkWeekly(habits, done, recentDays);
  const priorOverall = chunkWeekly(habits, done, priorDays);

  const pairs = habits.flatMap((h, i) => habits.map((o, j) => (i >= j ? null : ({ a: h, b: o, v: corr[i]?.[j] ?? 0 })))).filter(Boolean) as { a: Habit; b: Habit; v: number }[];
  const most = [...pairs].sort((x, y) => y.v - x.v).slice(0, 5);
  const least = [...pairs].sort((x, y) => x.v - y.v).slice(0, 5);

  const Call = ({ title, name, pct, cap }: { title: string; name: string; pct: number; cap: string }) => (
    <div className="mb-2 border-b border-zinc-200 pb-2">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{title}</p>
      <p className="text-[15px] font-semibold leading-tight text-zinc-800">{name}</p>
      <p className="text-[12px] font-semibold tabular-nums text-zinc-600">{Math.round(pct * 100)}%</p>
      <p className="text-[10px] text-zinc-400">{cap}</p>
    </div>
  );

  return (
    <div className="-mx-1 flex snap-x snap-mandatory gap-6 overflow-x-auto pb-8">
      <section className="w-[min(100%,1100px)] shrink-0 snap-start">
        <p className="mb-2 text-[15px] font-semibold text-zinc-800">7-Week Habit Trend (Prior vs Recent)</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <Card title="Overall" variant="flat" className="col-span-2">
            <DualArea a={recentOverall} b={priorOverall} height={140} ink />
            <p className="mt-1 text-[10px] text-zinc-500">solid = recent 7w · faint = prior 7w</p>
          </Card>
          {habits.map((h) => {
            const rec = chunkWeekly([{ ...h }] as Habit[], done, recentDays);
            const pri = chunkWeekly([{ ...h }] as Habit[], done, priorDays);
            const recAvg = rec.length ? rec.reduce((s, v) => s + v, 0) / rec.length : 0;
            const priAvg = pri.length ? pri.reduce((s, v) => s + v, 0) / pri.length : 0;
            const delta = recAvg - priAvg;
            return (
              <Card key={h.id} title={`${h.emoji} ${h.name}`} variant="flat">
                <DualArea a={rec} b={pri} height={88} ink />
                <p className="text-[10px] tabular-nums text-zinc-500">
                  Past 7w avg {Math.round(priAvg * 100)}% {delta >= 0 ? '▲' : '▼'}{Math.abs(Math.round(delta * 100))}
                </p>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="w-[min(100%,1100px)] shrink-0 snap-start">
        <p className="mb-2 text-[15px] font-semibold text-zinc-800">Best & Worst Habits</p>
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-3">
            <Call title="Best Habit So Far" name={bestH ? `${bestH.h.emoji} ${bestH.h.name}` : '—'} pct={bestH?.pct ?? 0} cap="highest completion %" />
            <Call title="Worst Habit So Far" name={worstH ? `${worstH.h.emoji} ${worstH.h.name}` : '—'} pct={worstH?.pct ?? 0} cap="lowest completion %" />
            <Call title="Best Week so Far" name={bestW ? `WEEK ${bestW.i + 1}` : '—'} pct={bestW?.pct ?? 0} cap="highest weekly completion" />
            <Call title="Worst Week so Far" name={worstW ? `WEEK ${worstW.i + 1}` : '—'} pct={worstW?.pct ?? 0} cap="lowest weekly completion" />
            <Call title="Best Day (So Far)" name={bestD ? `${WEEKDAYS[bestD.d.weekdayIdx]} ${bestD.d.day}` : '—'} pct={bestD?.pct ?? 0} cap="best daily score" />
            <Call title="Worst Day (So Far)" name={worstD ? `${WEEKDAYS[worstD.d.weekdayIdx]} ${worstD.d.day}` : '—'} pct={worstD?.pct ?? 0} cap="lowest daily score" />
          </div>
          <div className="col-span-12 space-y-3 md:col-span-9">
            <Card title="Best vs worst vs overall" variant="flat">
              <DualArea a={series[bestIdx] ?? []} b={scores} height={140} ink />
              <AreaChart values={series[worstIdx] ?? []} height={48} ink />
            </Card>
            <Card title="Weekly Score Distribution" variant="flat">
              <BarRow items={weekRates.map((w) => ({ key: `w${w.i}`, value: w.pct, label: `W${w.i + 1}` }))} height={100} showValue />
            </Card>
            <Card title="Best / worst week vs average" variant="flat">
              <DualArea
                a={weekRates.map((w) => w.pct)}
                b={weekRates.map(() => avgWeek)}
                height={110}
                ink
              />
            </Card>
          </div>
        </div>
      </section>

      <section className="w-[min(100%,1100px)] shrink-0 snap-start">
        <p className="mb-2 text-[15px] font-semibold text-zinc-800">Habits Correlation (Weekly)</p>
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 lg:col-span-8">
            <div className="overflow-x-auto">
              <div className="min-w-max">
                <div className="flex gap-px pl-16">
                  {habits.map((h) => <div key={h.id} className="w-9 text-center text-[8px] text-zinc-500">{h.emoji}</div>)}
                </div>
                {habits.map((h, i) => (
                  <div key={h.id} className="flex items-center gap-px">
                    <div className="w-16 truncate text-[9px] text-zinc-500">{h.name}</div>
                    {habits.map((__, j) => {
                      const v = corr[i]?.[j] ?? 0;
                      return (
                        <div key={`${i}-${j}`} className="flex h-9 w-9 items-center justify-center rounded-[2px] text-[8px] tabular-nums" style={{ background: i === j ? heatGrey(1) : corrFill(v), color: Math.abs(v) > 0.35 ? '#18181b' : '#e4e4e7' }}>
                          {Math.round(((v + 1) / 2) * 100)}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <p className="ht-label mt-4 mb-1">Day × day correlation</p>
            <div className="flex gap-px pl-8">
              {WEEKDAYS.map((d, i) => <div key={i} className="w-9 text-center text-[8px] text-zinc-500">{d}</div>)}
            </div>
            {WEEKDAYS.map((d, i) => (
              <div key={i} className="flex items-center gap-px">
                <div className="w-8 text-[9px] text-zinc-500">{d}</div>
                {WEEKDAYS.map((__, j) => {
                  const v = dayCorr[i]?.[j] ?? 0;
                  return <div key={j} className="flex h-9 w-9 items-center justify-center rounded-[2px] text-[8px] tabular-nums" style={{ background: corrFill(v), color: Math.abs(v) > 0.35 ? '#18181b' : '#e4e4e7' }}>{Math.round(((v + 1) / 2) * 100)}</div>;
                })}
              </div>
            ))}
          </div>
          <div className="col-span-12 space-y-3 text-[11px] lg:col-span-4">
            <div>
              <p className="ht-label mb-1">Most Corr</p>
              {most.map((p) => (
                <div key={`${p.a.id}-${p.b.id}`} className="flex justify-between gap-2 text-zinc-700">
                  <span className="truncate">{p.a.name} · {p.b.name}</span>
                  <span className="tabular-nums">{Math.round(((p.v + 1) / 2) * 100)}%</span>
                </div>
              ))}
            </div>
            <div>
              <p className="ht-label mb-1">Least Corr</p>
              {least.map((p) => (
                <div key={`${p.a.id}-${p.b.id}`} className="flex justify-between gap-2 text-zinc-700">
                  <span className="truncate">{p.a.name} · {p.b.name}</span>
                  <span className="tabular-nums">{Math.round(((p.v + 1) / 2) * 100)}%</span>
                </div>
              ))}
            </div>
            <Card title="Best Habit Correlation" variant="flat">
              <DualArea a={series[bestIdx] ?? []} b={scores} height={72} ink />
              <ScatterTrend xs={series[bestIdx] ?? []} ys={scores} />
            </Card>
            <Card title="Worst Habit Correlation" variant="flat">
              <DualArea a={series[worstIdx] ?? []} b={scores} height={72} ink />
              <ScatterTrend xs={series[worstIdx] ?? []} ys={scores} />
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
