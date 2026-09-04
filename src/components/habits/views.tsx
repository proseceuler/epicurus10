import { Fragment, type Dispatch, SetStateAction } from 'react';
import type { Habit, HabitCompletion } from '@/lib/types';
import BlackHole from '@/components/habits/BlackHole';
import {
  AlertRow, AreaChart, BarRow, Card, HeatDays, HeatGrid, HeatRatio, MiniBar, Ring, ScatterTrend, Spark,
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
  const weekLabels = last84.filter((_, i) => i % 7 === 0).map((d) => d.slice(5));
  const todayScore = rateOn(habits, today, done);
  const dist = lastNDays(7).map((d) => ({ key: d, value: rateOn(habits, d, done), label: d.slice(8) }));
  const monthDaysNow = monthDays(new Date().getFullYear(), new Date().getMonth());
  const monthDone = habits.reduce((s, h) => s + monthDaysNow.filter((d) => isDone(done, h.id, d.dateStr)).length, 0);
  const monthSlots = Math.max(1, habits.length * monthDaysNow.length);
  const links: { label: string; view: View }[] = [
    { label: '+ Update Habit Tracker', view: 'track' },
    { label: '+ Habit Dashboard', view: 'dash' },
    { label: '+ Habit Insights', view: 'insights' },
  ];

  return (
    <div className="flex flex-col gap-2 lg:flex-row">
      <Card className="flex shrink-0 flex-col items-center justify-center lg:w-[240px]">
        <BlackHole className="h-[220px] w-[220px]" percent={life} />
        <p className="mt-1 text-center text-[10px] text-zinc-500">{completions.length} lifetime logs</p>
      </Card>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <Card title="Quick Actions">
            <ul className="space-y-6 text-[13px]">
              {links.map((l) => (
                <li key={l.view}>
                  <button type="button" onClick={() => onGo(l.view)} className="text-zinc-300 underline decoration-zinc-600 underline-offset-4 hover:text-zinc-50">{l.label}</button>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Completion %">
            <AreaChart values={weekly} labels={weekLabels} height={96} />
          </Card>
          <Card title="Alerts">
            <AlertRow label="Done today's Habits?" value={todayLeft.length ? 'Pending' : 'Done'} tone={todayLeft.length ? 'pending' : 'ok'} />
            <AlertRow label="Today's Habit Completion" value={`${Math.round(todayScore * 100)}%`} tone={todayScore >= 1 ? 'ok' : 'pending'} />
            <AlertRow label="Open habits left" value={String(todayLeft.length)} tone={todayLeft.length ? 'pending' : 'ok'} />
          </Card>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <Card title="Daily Score Distribution">
            <BarRow items={dist} height={108} showValue />
          </Card>
          <Card title="Trend">
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-2 gap-y-1 text-[11px]">
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
                    <span className={`tabular-nums ${up ? 'text-emerald-400' : 'text-orange-400'}`}>{up ? '▲' : '▼'}{Math.abs(Math.round(mom * 100))}</span>
                    <span><Spark values={habitWeekSeries(h.id, done)} /></span>
                  </Fragment>
                );
              })}
            </div>
          </Card>
          <Card title="Progress (this month)">
            <Ring value={(monthDone / monthSlots) * 100} caption={`${monthDone}/${monthSlots} Habits Done`} />
            <div className="mt-2 flex justify-center">
              <Spark values={dailyScores.map((d) => d.score)} width={140} />
            </div>
          </Card>
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
  setShowAdd: (v: boolean) => void;
  onToggle: (habitId: string, dateStr: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  life: number;
}) {
  return (
    <div className="ht-card p-2">
      <div className="flex gap-2">
        <div className="w-[132px] shrink-0">
          <p className="text-[12px] font-semibold tracking-wide text-zinc-100">HABIT TRACKER</p>
          <button type="button" onClick={() => setShowAdd(true)} className="text-[10px] text-zinc-500 underline">+ Add habit</button>
          <p className="mt-2 text-[10px] text-zinc-500">{year}/{MONTHS[month].slice(0, 3)}</p>
          <p className="mt-3 text-[9px] uppercase tracking-wider text-zinc-500">Habits</p>
          <div className="mt-1">
            {habits.map((h) => (
              <div key={h.id} className="flex h-7 items-center justify-between gap-1">
                <span className="truncate text-[11px] text-zinc-300">{h.name}</span>
                <button type="button" onClick={() => onRemove(h.id)} className="text-[9px] text-zinc-600 hover:text-zinc-300">×</button>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <p className="ht-label mb-1">Lifetime Progress</p>
            <BlackHole className="mx-auto h-28 w-28" percent={life} />
            <div className="mt-1 flex justify-center">
              <Spark values={days.map((d) => rateOn(habits, d.dateStr, done))} width={110} />
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="min-w-max">
            <div className="mb-1 flex gap-3">
              {weeks.map((week, wi) => (
                <div key={wi} className="text-center">
                  <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-400">Week {wi + 1}</p>
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
                          className={`m-[3px] h-[18px] w-[18px] rounded-[2px] ${isToday ? 'ring-1 ring-zinc-400' : ''}`}
                          style={{ background: on ? '#e4e4e7' : 'transparent', border: '1px solid #71717a' }}
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
                  <div key={wi} className="h-1.5 overflow-hidden rounded-full bg-zinc-800" style={{ width: 7 * 28 }}>
                    <div className="h-full bg-zinc-200" style={{ width: `${Math.round(pct * 100)}%`, opacity: 0.25 + pct * 0.75 }} />
                  </div>
                );
              })}
            </div>
          </div>
          {showAdd ? (
            <div className="mt-2 flex items-center gap-1.5">
              <input value={draft.emoji} onChange={(e) => setDraft((d) => ({ ...d, emoji: e.target.value }))} className="w-10 rounded bg-zinc-900 px-1.5 py-1 text-center text-sm" />
              <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Habit name" className="min-w-0 flex-1 rounded bg-zinc-900 px-2 py-1 text-[12px] text-zinc-100" />
              <input value={draft.goal} onChange={(e) => setDraft((d) => ({ ...d, goal: e.target.value }))} className="w-12 rounded bg-zinc-900 px-1.5 py-1 text-center text-[12px]" />
              <button type="button" onClick={onAdd} className="rounded bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-950">Add</button>
              <button type="button" onClick={() => setShowAdd(false)} className="text-[11px] text-zinc-500">Cancel</button>
            </div>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
            {weeks.map((week, wi) => {
              const pct = weekPct(habits, week, done);
              const spark = week.map((d) => rateOn(habits, d.dateStr, done));
              return (
                <Card key={wi} title="Weekly Completion %">
                  <p className="text-xl font-semibold tabular-nums text-zinc-50">{Math.round(pct * 100)}%</p>
                  <Spark values={spark} width={90} />
                  <p className="text-[10px] text-zinc-500">Week {wi + 1} · {week.length} days</p>
                </Card>
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            {weeks.map((week, wi) => (
              <Card key={wi} title={`Week ${wi + 1}`}>
                <div className="space-y-1">
                  {habits.map((h) => {
                    const pct = habitPct(h, week, done);
                    return (
                      <div key={h.id} className="flex items-center gap-2 text-[11px]">
                        <span className="w-20 truncate text-zinc-400">{h.name}</span>
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
    <div className="space-y-3">
      <p className="text-[13px] font-semibold text-zinc-800">Monthly Overview</p>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <Card title={`${monthLabel} · by habit`}>
          <HeatGrid habits={habits} cols={days.map((d) => ({ dateStr: d.dateStr, day: d.day }))} done={done} showPct cell={14} />
        </Card>
        <Card title="Habit × week %">
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
        <Card title="Daily completion %">
          <HeatDays habits={habits} days={days} done={done} showLabel />
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Card title="Average completed by day of week">
          <BarRow items={WEEKDAYS.map((d, i) => ({ key: `${d}${i}`, value: weekdayAvg[i], label: d }))} height={100} showValue />
        </Card>
        <Card title="Monthly habit completion %">
          <BarRow items={habits.map((h) => ({ key: h.id, value: habitPct(h, days, done), label: h.emoji }))} height={100} showValue />
        </Card>
      </div>

      <p className="pt-1 text-[13px] font-semibold text-zinc-800">Weekly Overview</p>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <Card title="This week · by habit">
          <HeatGrid habits={habits} cols={last7.map((d) => ({ dateStr: d.dateStr, day: d.day, label: `${WEEKDAYS[d.weekdayIdx]}${d.day}` }))} done={done} showPct cell={22} numbers />
        </Card>
        <Card title="Weekly completion %">
          <BarRow items={weeks.map((w, i) => ({ key: `w${i}`, value: weekPct(habits, w, done), label: `W${i + 1}` }))} height={120} showValue />
        </Card>
        <Card title="Week score grid">
          <HeatDays habits={habits} days={last7} done={done} showLabel />
        </Card>
      </div>
      <Card title="Daily score this month">
        <BarRow items={days.map((d, i) => ({ key: d.dateStr, value: monthScores[i] ?? 0, label: String(d.day) }))} height={88} labelEvery={2} />
      </Card>
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

  const Call = ({ title, name, pct, cap }: { title: string; name: string; pct: number; cap: string }) => (
    <Card title={title} className="mb-2">
      <p className="text-[16px] font-semibold leading-tight text-zinc-50">{name}</p>
      <p className={`text-[13px] font-semibold tabular-nums ${pct >= 0.6 ? 'text-emerald-400' : 'text-orange-400'}`}>{Math.round(pct * 100)}%</p>
      <p className="text-[10px] text-zinc-500">{cap}</p>
    </Card>
  );

  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
      <div className="lg:col-span-3">
        <Call title="Best Habit So Far" name={bestH ? `${bestH.h.emoji} ${bestH.h.name}` : '—'} pct={bestH?.pct ?? 0} cap="highest completion %" />
        <Call title="Worst Habit So Far" name={worstH ? `${worstH.h.emoji} ${worstH.h.name}` : '—'} pct={worstH?.pct ?? 0} cap="lowest completion %" />
        <Call title="Best Week so Far" name={bestW ? `WEEK ${bestW.i + 1}` : '—'} pct={bestW?.pct ?? 0} cap="highest weekly completion" />
        <Call title="Worst Week so Far" name={worstW ? `WEEK ${worstW.i + 1}` : '—'} pct={worstW?.pct ?? 0} cap="lowest weekly completion" />
        <Call title="Best Day (So Far)" name={bestD ? `${WEEKDAYS[bestD.d.weekdayIdx]} ${bestD.d.day}` : '—'} pct={bestD?.pct ?? 0} cap="best daily score" />
        <Call title="Worst Day (So Far)" name={worstD ? `${WEEKDAYS[worstD.d.weekdayIdx]} ${worstD.d.day}` : '—'} pct={worstD?.pct ?? 0} cap="lowest daily score" />
      </div>
      <div className="space-y-2 lg:col-span-9">
        <Card title="Habits Correlation (Weekly)">
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
        <Card title="Day × day correlation">
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
        <Card title="Weekly Score Distribution">
          <BarRow items={weekRates.map((w) => ({ key: `w${w.i}`, value: w.pct, label: `W${w.i + 1}` }))} height={110} showValue />
        </Card>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Card title="Best Habit Correlation">
            <ScatterTrend xs={series[bestIdx] ?? []} ys={scores} />
          </Card>
          <Card title="Worst Habit Correlation">
            <ScatterTrend xs={series[worstIdx] ?? []} ys={scores} />
          </Card>
          <Card title="Best Days Correlation">
            <ScatterTrend xs={scores} ys={[...scores].sort((a, b) => a - b)} />
          </Card>
          <Card title="Worst Days Correlation">
            <ScatterTrend xs={dayRates.map((d) => d.d.weekdayIdx / 6)} ys={scores} />
          </Card>
        </div>
      </div>
    </div>
  );
}
