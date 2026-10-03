import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { SUBJECTS, type PomodoroSession } from '@/lib/types';
import { Card, PageHeader, EmptyState } from '@/components/kit';
import { MotionSwap } from '@/components/MotionUI';
import { onDataChanged } from '@/lib/assistant/sync';
import { BarChart3, Clock, Flame, Target } from 'lucide-react';
import { BarChart } from '@/charts/bar-chart';
import { Bar } from '@/charts/bar';
import { BarXAxis } from '@/charts/bar-x-axis';
import { Grid } from '@/charts/grid';
import { ChartTooltip } from '@/charts/tooltip';
import { AreaChart, Area } from '@/charts/area-chart';
import { XAxis } from '@/charts/x-axis';

function isoFromDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AnalyticsPage({ embedded = false }: { embedded?: boolean }) {
  const [sessions, setSessions] = useState<PomodoroSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'week' | 'month'>('week');
  const [chartMode, setChartMode] = useState<'bar' | 'area'>('bar');

  const loadSessions = useCallback(async () => {
    const { data } = await supabase.from('pomodoro_sessions').select('*').order('completed_at', { ascending: false });
    if (data) setSessions(data as PomodoroSession[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => onDataChanged(() => { void loadSessions(); }), [loadSessions]);

  const focusSessions = sessions.filter((s) => s.session_type === 'focus');
  const now = new Date();
  const days = range === 'week' ? 7 : 30;
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - days + 1);
  startDate.setHours(0, 0, 0, 0);

  const chartRows = useMemo(() => {
    const byDay: Record<string, number> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      byDay[isoFromDate(d)] = 0;
    }
    focusSessions.forEach((s) => {
      const key = isoFromDate(new Date(s.completed_at));
      if (key in byDay) byDay[key] += s.duration_minutes;
    });
    const todayIso = isoFromDate(now);
    return Object.entries(byDay).map(([iso, minutes]) => {
      const d = new Date(`${iso}T12:00:00`);
      const label = range === 'week'
        ? d.toLocaleDateString('en-US', { weekday: 'short' })
        : String(d.getDate());
      return {
        iso,
        name: label,
        date: d,
        minutes,
        isToday: iso === todayIso,
      };
    });
  }, [focusSessions, days, range, startDate, now]);

  const dayValues = chartRows.map((r) => r.minutes);
  const totalMinutes = dayValues.reduce((sum, v) => sum + v, 0);
  const totalSessions = focusSessions.filter((s) => new Date(s.completed_at) >= startDate).length;

  const bySubject: Record<string, number> = {};
  focusSessions
    .filter((s) => new Date(s.completed_at) >= startDate)
    .forEach((s) => {
      const key = s.subject_key ?? 'general';
      bySubject[key] = (bySubject[key] ?? 0) + s.duration_minutes;
    });

  const subjectEntries = Object.entries(bySubject).sort((a, b) => b[1] - a[1]);
  const totalSubjectMinutes = subjectEntries.reduce((sum, [, v]) => sum + v, 0);

  let streak = 0;
  const todayIso = isoFromDate(now);
  for (let i = 0; i < 365; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = isoFromDate(d);
    const row = chartRows.find((r) => r.iso === key);
    const mins = row
      ? row.minutes
      : focusSessions
          .filter((s) => isoFromDate(new Date(s.completed_at)) === key)
          .reduce((sum, s) => sum + s.duration_minutes, 0);
    if (mins > 0) streak++;
    else if (i > 0 || key !== todayIso) break;
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><BarChart3 className="h-8 w-8 animate-pulse text-zinc-300" /></div>;
  }

  return (
    <div>
      {!embedded && <PageHeader title="Focus Analytics" />}
      <div className="mb-6 flex flex-wrap items-center justify-end gap-2">
        <div className="flex gap-1 rounded-xl p-1 glass">
          <button type="button" onClick={() => setChartMode('bar')} className={`rounded-lg px-3 py-1 text-sm font-medium ${chartMode === 'bar' ? 'bg-zinc-900 text-white' : 'text-zinc-500'}`}>Bars</button>
          <button type="button" onClick={() => setChartMode('area')} className={`rounded-lg px-3 py-1 text-sm font-medium ${chartMode === 'area' ? 'bg-zinc-900 text-white' : 'text-zinc-500'}`}>Trend</button>
        </div>
        <div className="flex gap-1 rounded-xl p-1 glass">
          <button type="button" onClick={() => setRange('week')} className={`rounded-lg px-3 py-1 text-sm font-medium ${range === 'week' ? 'bg-zinc-900 text-white' : 'text-zinc-500'}`}>Week</button>
          <button type="button" onClick={() => setRange('month')} className={`rounded-lg px-3 py-1 text-sm font-medium ${range === 'month' ? 'bg-zinc-900 text-white' : 'text-zinc-500'}`}>Month</button>
        </div>
      </div>

      <MotionSwap id={`${range}-${chartMode}`}>
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="p-4">
            <div className="mb-1 flex items-center gap-2"><Clock className="h-4 w-4 text-zinc-500" /><span className="text-xs text-zinc-500">Total Focus Time</span></div>
            <div className="text-2xl font-bold text-zinc-800">{Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m</div>
          </Card>
          <Card className="p-4">
            <div className="mb-1 flex items-center gap-2"><Target className="h-4 w-4 text-zinc-500" /><span className="text-xs text-zinc-500">Focus Sessions</span></div>
            <div className="text-2xl font-bold text-zinc-800">{totalSessions}</div>
          </Card>
          <Card className="p-4">
            <div className="mb-1 flex items-center gap-2"><Flame className="h-4 w-4 text-zinc-500" /><span className="text-xs text-zinc-500">Day Streak</span></div>
            <div className="text-2xl font-bold text-zinc-800">{streak}</div>
          </Card>
          <Card className="p-4">
            <div className="mb-1 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-zinc-500" /><span className="text-xs text-zinc-500">Daily Average</span></div>
            <div className="text-2xl font-bold text-zinc-800">{Math.round(totalMinutes / days)}m</div>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card className="p-6">
              <h3 className="mb-4 font-semibold text-zinc-800">Daily Focus Time</h3>
              {totalMinutes === 0 ? (
                <EmptyState icon={BarChart3} title="No focus data yet" subtitle="Complete a pomodoro session to see your analytics here." />
              ) : chartMode === 'bar' ? (
                <div className="w-full">
                  <BarChart data={chartRows} xDataKey="name" aspectRatio="2 / 1" margin={{ top: 16, right: 12, bottom: 28, left: 12 }} animationDuration={900} barWidth={range === 'week' ? 28 : 12}>
                    <Grid horizontal fadeHorizontal />
                    <Bar dataKey="minutes" fill="var(--chart-line-primary)" lineCap="round" />
                    <BarXAxis />
                    <ChartTooltip rows={(point) => [{ label: 'Focus', value: `${Number(point.minutes ?? 0)}m`, color: 'var(--chart-line-primary)' }]} />
                  </BarChart>
                </div>
              ) : (
                <div className="w-full">
                  <AreaChart data={chartRows} xDataKey="date" aspectRatio="2 / 1" margin={{ top: 16, right: 12, bottom: 28, left: 12 }} animationDuration={900}>
                    <Grid horizontal />
                    <Area dataKey="minutes" fill="var(--chart-line-primary)" fillOpacity={0.32} stroke="var(--chart-line-primary)" strokeWidth={2} fadeEdges />
                    <XAxis numTicks={range === 'week' ? 7 : 6} />
                    <ChartTooltip rows={(point) => [{ label: 'Focus', value: `${Number(point.minutes ?? 0)}m`, color: 'var(--chart-line-primary)' }]} />
                  </AreaChart>
                </div>
              )}
            </Card>
          </div>

          <Card className="p-5">
            <h3 className="mb-4 font-semibold text-zinc-800">By Subject</h3>
            {subjectEntries.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-400">No data yet</p>
            ) : (
              <div className="space-y-3">
                {subjectEntries.map(([key, minutes]) => {
                  const subj = SUBJECTS.find((s) => s.key === key);
                  const pct = totalSubjectMinutes > 0 ? (minutes / totalSubjectMinutes) * 100 : 0;
                  return (
                    <div key={key}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm font-medium text-zinc-600">{subj ? subj.shortName : 'General'}</span>
                        <span className="text-xs tabular-nums text-zinc-400">{minutes}m</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-zinc-200/50">
                        <div className="h-full rounded-full bg-zinc-900 transition-[width] duration-300" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </MotionSwap>
    </div>
  );
}
