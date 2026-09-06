import { Fragment, type Dispatch, SetStateAction } from 'react';
import type { Habit, HabitCompletion } from '@/lib/types';
import BlackHole from '@/components/habits/BlackHole';
import {
  AlertRow, AreaChart, BarRow, Card, DualArea, HeatDays, HeatGrid, HeatRatio, MiniBar, Ring, ScatterTrend, Spark,
  chunkWeekly, dailyVector, habitWeekSeries, heatGrey, corrFill, rateOn,
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
    <div className="grid grid-cols-12 items-start gap-3">
      <div className="col-span-12 flex flex-col items-center lg:col-span-4 xl:col-span-3">
        <BlackHole className="aspect-square w-full max-w-[360px] min-h-[280px]" percent={life} />
        <p className="-mt-1 text-center text-[11px] text-zinc-500">{completions.length} lifetime logs</p>
      </div>

      <Card title="Quick Actions" variant="flat" className="col-span-12 sm:col-span-4 lg:col-span-2">
        <ul className="space-y-5 text-[13px] text-zinc-700">
          {links.map((l) => (
            <li key={l.view}>
              <button type="button" onClick={() => onGo(l.view)} className="underline decoration-zinc-400 underline-offset-4 hover:text-zinc-950">{l.label}</button>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Completion %" className="col-span-12 sm:col-span-8 lg:col-span-3">
        <AreaChart values={wave} labels={waveLabels} height={118} />
      </Card>

      <Card title="Alerts" className="col-span-12 sm:col-span-6 lg:col-span-3">
        <AlertRow label="Done today's Habits?" value={todayLeft.length ? 'Pending' : 'Done'} tone={todayLeft.length ? 'pending' : 'ok'} />
        <AlertRow label="Today's Habit Completion" value={`${Math.round(todayScore * 100)}%`} tone={todayScore >= 1 ? 'ok' : 'pending'} />
        <AlertRow label="Open habits left" value={String(todayLeft.length)} tone={todayLeft.length ? 'pending' : 'ok'} />
      </Card>

      <Card title="Daily Score Distribution" className="col-span-12 md:col-span-6 lg:col-span-5">
        <BarRow items={dist} height={132} showValue labelEvery={2} />
      </Card>

      <Card title="Trend" className="col-span-12 md:col-span-6 lg:col-span-4">
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
                <span className="truncate text-zinc-300">{h.emoji} {h.name}</span>
                <span className="tabular-nums text-zinc-400">{Math.round(mtd * 100)}%</span>
                <span className="tabular-nums text-zinc-300">{up ? '▲' : '▼'}{Math.abs(Math.round(mom * 100))}</span>
                <span><Spark values={habitWeekSeries(h.id, done)} width={72} /></span>
              </Fragment>
            );
          })}
        </div>
      </Card>

      <Card title="Progress (this month)" className="col-span-12 sm:col-span-6 lg:col-span-3">
        <Ring value={(monthDone / monthSlots) * 100} caption={`${monthDone}/${monthSlots} Habits Done`} />
        <div className="mt-1">
          <AreaChart values={daily} height={36} />
        </div>
      </Card>
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

  return (
    <div className="grid grid-cols-12 items-start gap-3">
      <div className="col-span-12 flex flex-col sm:col-span-3 lg:col-span-2">
        <p className="text-[12px] font-semibold tracking-wide text-zinc-800">HABIT TRACKER</p>
        <button type="button" onClick={() => setShowAdd(true)} className="w-fit text-[10px] text-zinc-500 underline">+ Add habit</button>
        <p className="mt-2 text-[10px] text-zinc-500">{year}/{MONTHS[month].slice(0, 3)}</p>
        <p className="mt-3 text-[9px] uppercase tracking-wider text-zinc-500">Habits</p>
        <div className="mt-1">
          {habits.map((h) => (
            <div key={h.id} className="flex h-7 items-center justify-between gap-1">
              <span className="truncate text-[11px] text-zinc-700">{h.name}</span>
              <button type="button" onClick={() => onRemove(h.id)} className="text-[9px] text-zinc-400 hover:text-zinc-700">×</button>
            </div>
          ))}
        </div>
        <p className="ht-label mt-6 mb-1">Lifetime Progress</p>
        <BlackHole className="mx-auto aspect-square w-full max-w-[180px]" percent={life} />
        <AreaChart values={monthWave} height={36} />
      </div>

      <div className="col-span-12 sm:col-span-9 lg:col-span-10">
        <AreaChart values={monthWave} labels={days.filter((_, i) => i === 0 || i === days.length - 1).map((d) => String(d.day))} height={72} />
        <div className="mt-1 overflow-x-auto">
          <div className="min-w-max">
            <div className="mb-1 flex gap-3">
              {weeks.map((week, wi) => (
                <div key={wi} className="text-center">
                  <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-500">Week {wi + 1}</p>
                  <div className="flex">
                    {Array.from({ length: 7 }, (_, wd) => {
                      const cell = week.find((d) => d.weekdayIdx === wd);
                      return (
                        <div key={wd} className="w-7 text-center leading-tight">
                          <div className="text-[8px] text-zinc-500">{WEEKDAYS[wd]}</div>
                          <div className="text-[8px] text-zinc-400">{cell ? cell.day : ''}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {habits.map((h) => (
              <div key={h.id} className="flex h-7 items-center gap-3">
                {weeks.map((week, wi) => (
                  <div key={wi} className="flex">
                    {Array.from({ length: 7 }, (_, wd) => {
                      const cell = week.find((d) => d.weekdayIdx === wd);
                      if (!cell) return <div key={wd} className="h-7 w-7" />;
                      const on = isDone(done, h.id, cell.dateStr);
                      const isToday = cell.dateStr === today;
                      return (
                        <button
                          key={cell.dateStr}
                          type="button"
                          onClick={() => onToggle(h.id, cell.dateStr)}
                          className={`m-[3px] h-[18px] w-[18px] rounded-[2px] ${isToday ? 'ring-1 ring-zinc-500' : ''}`}
                          style={{ background: on ? '#3f3f46' : 'transparent', border: '1px solid #71717a' }}
                          aria-label={`${h.name} ${cell.dateStr}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            ))}
            <div className="mt-1 flex gap-3">
              {weeks.map((week, wi) => {
                const pct = weekPct(habits, week, done);
                return (
                  <div key={wi} className="h-1.5 overflow-hidden rounded-full bg-zinc-200" style={{ width: 7 * 28 }}>
                    <div className="h-full bg-zinc-700" style={{ width: `${Math.round(pct * 100)}%` }} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {showAdd ? (
          <div className="mt-2 flex items-center gap-1.5">
            <input value={draft.emoji} onChange={(e) => setDraft((d) => ({ ...d, emoji: e.target.value }))} className="w-10 rounded border border-zinc-200 bg-white px-1.5 py-1 text-center text-sm" />
            <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Habit name" className="min-w-0 flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-[12px]" />
            <input value={draft.goal} onChange={(e) => setDraft((d) => ({ ...d, goal: e.target.value }))} className="w-12 rounded border border-zinc-200 bg-white px-1.5 py-1 text-center text-[12px]" />
            <button type="button" onClick={onAdd} className="rounded bg-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-50">Add</button>
            <button type="button" onClick={() => setShowAdd(false)} className="text-[11px] text-zinc-500">Cancel</button>
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          {weeks.map((week, wi) => {
            const pct = weekPct(habits, week, done);
            const spark = week.map((d) => rateOn(habits, d.dateStr, done));
            return (
              <Card key={wi} className={wi === 1 ? 'md:col-span-1' : ''}>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Week {wi + 1}</p>
                <p className="text-2xl font-semibold tabular-nums text-zinc-50">{Math.round(pct * 100)}%</p>
                <AreaChart values={spark} height={40} />
              </Card>
            );
          })}
        </div>

        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {weeks.map((week, wi) => (
            <Card key={wi} title={`Week ${wi + 1}`}>
              <div className="space-y-1">
                {habits.map((h) => {
                  const pct = habitPct(h, week, done);
                  return (
                    <div key={h.id} className="flex items-center gap-2 text-[11px]">
                      <span className="w-24 truncate text-zinc-400">{h.name}</span>
                      <span className="w-8 tabular-nums text-zinc-300">{Math.round(pct * 100)}%</span>
                      <MiniBar value={pct} />
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DashView({
  habits, days, weeks, done, monthLabel,
}: {
  habits: Habit[];
  days: DayCell[];
  weeks: DayCell[][];
  done: Set<string>;
  monthLabel: string;
}) {
  const monthScores = dailyVector(habits, days, done);
  const weekdayAvg = WEEKDAYS.map((_, wd) => {
    const subset = days.filter((d) => d.weekdayIdx === wd);
    if (!subset.length) return 0;
    return subset.reduce((s, d) => s + rateOn(habits, d.dateStr, done), 0) / subset.length;
  });
  const weekCols = weeks.map((_, i) => ({ key: String(i), label: `W${i + 1}` }));
  const last7 = days.slice(-7);

  return (
    <div className="space-y-4">
      <p className="text-[13px] font-semibold text-zinc-800">Monthly Overview</p>
      <div className="grid grid-cols-12 gap-3">
        <Card title={`${monthLabel} · by habit`} className="col-span-12 lg:col-span-6">
          <HeatGrid habits={habits} cols={days.map((d) => ({ dateStr: d.dateStr, day: d.day }))} done={done} showPct cell={14} />
        </Card>
        <Card title="Habit × week %" className="col-span-12 sm:col-span-6 lg:col-span-3">
          <HeatRatio
            rows={habits.map((h) => ({ key: h.id, label: `${h.emoji} ${h.name}` }))}
            cols={[...weekCols, { key: 'all', label: 'All' }]}
            value={(hid, col) => {
              const habit = habits.find((h) => h.id === hid);
              if (col === 'all') return habitPct(habit, days, done);
              return habitPct(habit, weeks[Number(col)] ?? [], done);
            }}
          />
        </Card>
        <Card title="Daily completion %" className="col-span-12 sm:col-span-6 lg:col-span-3">
          <HeatDays habits={habits} days={days} done={done} showLabel />
        </Card>
        <Card title="Average completed by day of week" className="col-span-12 md:col-span-7">
          <BarRow items={WEEKDAYS.map((d, i) => ({ key: `${d}${i}`, value: weekdayAvg[i], label: d }))} height={120} showValue />
        </Card>
        <Card title="Monthly habit completion %" className="col-span-12 md:col-span-5">
          <BarRow items={habits.map((h) => ({ key: h.id, value: habitPct(h, days, done), label: h.emoji }))} height={120} showValue />
        </Card>
      </div>

      <p className="text-[13px] font-semibold text-zinc-800">Weekly Overview</p>
      <div className="grid grid-cols-12 gap-3">
        <Card title="This week · by habit" className="col-span-12 lg:col-span-4">
          <HeatGrid habits={habits} cols={last7.map((d) => ({ dateStr: d.dateStr, day: d.day, label: `${WEEKDAYS[d.weekdayIdx]}${d.day}` }))} done={done} showPct cell={22} numbers />
        </Card>
        <Card title="Weekly completion %" className="col-span-12 md:col-span-7 lg:col-span-5">
          <BarRow items={weeks.map((w, i) => ({ key: `w${i}`, value: weekPct(habits, w, done), label: `W${i + 1}` }))} height={140} showValue />
        </Card>
        <Card title="Week score" className="col-span-12 md:col-span-5 lg:col-span-3">
          <AreaChart values={weeks.map((w) => weekPct(habits, w, done))} height={88} />
          <HeatDays habits={habits} days={last7} done={done} showLabel />
        </Card>
        <Card title="Daily score this month" className="col-span-12">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            <div className="md:col-span-2">
              <AreaChart values={monthScores} height={100} labels={days.filter((_, i) => i % 7 === 0).map((d) => String(d.day))} />
            </div>
            <div className="md:col-span-3">
              <BarRow items={days.map((d, i) => ({ key: d.dateStr, value: monthScores[i] ?? 0, label: String(d.day) }))} height={100} labelEvery={2} />
            </div>
          </div>
        </Card>
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
  const bestSeries = series[bestIdx] ?? [];
  const worstSeries = series[worstIdx] ?? [];

  const Call = ({ title, name, pct, cap }: { title: string; name: string; pct: number; cap: string }) => (
    <Card title={title} className="mb-2">
      <p className="text-[16px] font-semibold leading-tight text-zinc-50">{name}</p>
      <p className="text-[13px] font-semibold tabular-nums text-zinc-300">{Math.round(pct * 100)}%</p>
      <p className="text-[10px] text-zinc-500">{cap}</p>
    </Card>
  );

  return (
    <div className="grid grid-cols-12 items-start gap-3">
      <div className="col-span-12 lg:col-span-3">
        <Call title="Best Habit So Far" name={bestH ? `${bestH.h.emoji} ${bestH.h.name}` : '—'} pct={bestH?.pct ?? 0} cap="highest completion %" />
        <Call title="Worst Habit So Far" name={worstH ? `${worstH.h.emoji} ${worstH.h.name}` : '—'} pct={worstH?.pct ?? 0} cap="lowest completion %" />
        <Call title="Best Week so Far" name={bestW ? `WEEK ${bestW.i + 1}` : '—'} pct={bestW?.pct ?? 0} cap="highest weekly completion" />
        <Call title="Worst Week so Far" name={worstW ? `WEEK ${worstW.i + 1}` : '—'} pct={worstW?.pct ?? 0} cap="lowest weekly completion" />
        <Call title="Best Day (So Far)" name={bestD ? `${WEEKDAYS[bestD.d.weekdayIdx]} ${bestD.d.day}` : '—'} pct={bestD?.pct ?? 0} cap="best daily score" />
        <Call title="Worst Day (So Far)" name={worstD ? `${WEEKDAYS[worstD.d.weekdayIdx]} ${worstD.d.day}` : '—'} pct={worstD?.pct ?? 0} cap="lowest daily score" />
      </div>

      <div className="col-span-12 grid grid-cols-12 gap-3 lg:col-span-9">
        <Card title="Habits Correlation (Weekly)" className="col-span-12 xl:col-span-7">
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
                      <div key={`${i}-${j}`} className="flex h-9 w-9 items-center justify-center rounded-[2px] text-[8px] tabular-nums" style={{ background: i === j ? heatGrey(1) : corrFill(v), color: Math.abs(v) > 0.45 ? '#18181b' : '#e4e4e7' }}>
                        {Math.round(((v + 1) / 2) * 100)}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card title="Trend — best vs rest" className="col-span-12 xl:col-span-5">
          <DualArea a={bestSeries} b={scores} height={150} />
        </Card>

        <Card title="Day × day correlation" className="col-span-12 md:col-span-6">
          <div className="flex gap-px pl-8">
            {WEEKDAYS.map((d, i) => <div key={i} className="w-9 text-center text-[8px] text-zinc-500">{d}</div>)}
          </div>
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="flex items-center gap-px">
              <div className="w-8 text-[9px] text-zinc-500">{d}</div>
              {WEEKDAYS.map((__, j) => {
                const v = dayCorr[i]?.[j] ?? 0;
                return <div key={j} className="flex h-9 w-9 items-center justify-center rounded-[2px] text-[8px] tabular-nums" style={{ background: corrFill(v), color: Math.abs(v) > 0.45 ? '#18181b' : '#e4e4e7' }}>{Math.round(((v + 1) / 2) * 100)}</div>;
              })}
            </div>
          ))}
        </Card>

        <Card title="Weekly Score Distribution" className="col-span-12 md:col-span-6">
          <BarRow items={weekRates.map((w) => ({ key: `w${w.i}`, value: w.pct, label: `W${w.i + 1}` }))} height={90} showValue />
          <AreaChart values={weekRates.map((w) => w.pct)} height={64} />
        </Card>

        <Card title="Best Habit Correlation" className="col-span-12 sm:col-span-6 lg:col-span-3">
          <DualArea a={bestSeries} b={scores} height={88} />
          <ScatterTrend xs={bestSeries} ys={scores} />
        </Card>
        <Card title="Worst Habit Correlation" className="col-span-12 sm:col-span-6 lg:col-span-3">
          <DualArea a={worstSeries} b={scores} height={88} />
          <ScatterTrend xs={worstSeries} ys={scores} />
        </Card>
        <Card title="Best Days Correlation" className="col-span-12 sm:col-span-6 lg:col-span-3">
          <AreaChart values={scores} height={72} />
          <ScatterTrend xs={scores} ys={[...scores].sort((a, b) => a - b)} />
        </Card>
        <Card title="Worst Days Correlation" className="col-span-12 sm:col-span-6 lg:col-span-3">
          <AreaChart values={dayRates.map((d) => 1 - d.pct)} height={72} />
          <ScatterTrend xs={dayRates.map((d) => d.d.weekdayIdx / 6)} ys={scores} />
        </Card>
      </div>
    </div>
  );
}
