import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { type Habit, type HabitCompletion, type WellnessLog } from '@/lib/types';
import { Button, Input } from '@/components/ui';
import {
  Plus, Trash2, Check, Flame, Trophy, Moon, Smile,
} from 'lucide-react';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DEFAULT_HABITS = [
  { name: 'Woke up at 05:00', emoji: '⏰', goal_target: 30 },
  { name: 'Gym', emoji: '💪', goal_target: 25 },
  { name: 'Reading / Learning', emoji: '📚', goal_target: 30 },
  { name: 'Project Work', emoji: '🧬', goal_target: 20 },
];

interface DayInfo {
  day: number;
  dateStr: string;
  weekdayIdx: number; // 0=Mon
  weekNum: number;
}

export default function HabitsPage() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [wellness, setWellness] = useState<WellnessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [showAddForm, setShowAddForm] = useState(false);
  const [newHabit, setNewHabit] = useState({ name: '', emoji: '✅', goal: '30' });

  const loadData = useCallback(async () => {
    const [{ data: hData }, { data: cData }, { data: wData }] = await Promise.all([
      supabase.from('habits').select('*').order('created_at', { ascending: true }),
      supabase.from('habit_completions').select('*'),
      supabase.from('wellness_log').select('*'),
    ]);
    if (hData) {
      const habitsData = hData as Habit[];
      if (habitsData.length === 0) {
        const inserts = await Promise.all(
          DEFAULT_HABITS.map((h) =>
            supabase.from('habits').insert({ name: h.name, emoji: h.emoji, goal_target: h.goal_target, color: 'zinc' }).select().single()
          )
        );
        const valid = inserts.filter((r) => r.data).map((r) => r.data as Habit);
        setHabits(valid);
      } else {
        setHabits(habitsData);
      }
    }
    if (cData) setCompletions(cData as HabitCompletion[]);
    if (wData) setWellness(wData as WellnessLog[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Build calendar grid: figure out which week each day belongs to
  // using a Monday-first week system
  const { monthDays, weeks, weekdayHeaders } = useMemo(() => {
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const firstDay = new Date(selectedYear, selectedMonth, 1);
    const firstDow = firstDay.getDay(); // 0=Sun
    const firstWeekdayIdx = firstDow === 0 ? 6 : firstDow - 1; // Mon=0

    // Build leading empty slots + day slots
    const slots: (DayInfo | null)[] = [];
    for (let i = 0; i < firstWeekdayIdx; i++) slots.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(selectedYear, selectedMonth, d);
      const dow = date.getDay();
      const weekdayIdx = dow === 0 ? 6 : dow - 1;
      const slotIdx = slots.length;
      const weekNum = Math.floor(slotIdx / 7);
      slots.push({ day: d, dateStr: date.toISOString().split('T')[0], weekdayIdx, weekNum });
    }
    // Pad trailing
    while (slots.length % 7 !== 0) slots.push(null);

    const numWeeks = slots.length / 7;
    const weekArr = Array.from({ length: numWeeks }, (_, i) => i);

    // Build header: for each week, show weekday labels with day numbers
    const headers = weekArr.map((weekIdx) => {
      const weekSlots = slots.slice(weekIdx * 7, weekIdx * 7 + 7);
      return WEEKDAY_LABELS.map((wd, i) => {
        const slot = weekSlots[i];
        return { label: wd, day: slot?.day ?? null, dateStr: slot?.dateStr ?? null };
      });
    });

    // monthDays: all non-null slots
    const md = slots.filter((s): s is DayInfo => s !== null);

    return { monthDays: md, weeks: weekArr, weekdayHeaders: headers };
  }, [selectedYear, selectedMonth]);

  // Build per-week day arrays for rendering
  const weekDayArrays = useMemo(() => {
    return weeks.map((weekIdx) => {
      const days = monthDays.filter((d) => d.weekNum === weekIdx);
      // Fill to 7 slots aligned by weekdayIdx
      const arr: (DayInfo | null)[] = Array(7).fill(null);
      days.forEach((d) => { arr[d.weekdayIdx] = d; });
      return arr;
    });
  }, [weeks, monthDays]);

  const isDone = (habitId: string, dateStr: string) =>
    completions.some((c) => c.habit_id === habitId && c.completion_date === dateStr);

  const toggleCompletion = async (habitId: string, dateStr: string) => {
    const existing = completions.find((c) => c.habit_id === habitId && c.completion_date === dateStr);
    if (existing) {
      await supabase.from('habit_completions').delete().eq('id', existing.id);
      setCompletions(completions.filter((c) => c.id !== existing.id));
    } else {
      const { data } = await supabase.from('habit_completions').insert({
        habit_id: habitId, completion_date: dateStr,
      }).select().single();
      if (data) setCompletions([...completions, data as HabitCompletion]);
    }
  };

  // Per-habit stats for this month
  const habitStats = habits.map((habit) => {
    const monthCompletions = monthDays.filter((d) => isDone(habit.id, d.dateStr)).length;
    const goal = habit.goal_target;
    const left = Math.max(0, goal - monthCompletions);
    const pct = goal > 0 ? Math.min((monthCompletions / goal) * 100, 100) : 0;
    const streak = getStreak(habit.id, completions);
    const bestStreak = getBestStreak(habit.id, completions);
    return { habit, completed: monthCompletions, goal, left, pct, streak, bestStreak };
  });

  const totalGoal = habitStats.reduce((sum, s) => sum + s.goal, 0);
  const totalCompleted = habitStats.reduce((sum, s) => sum + s.completed, 0);
  const totalLeft = Math.max(0, totalGoal - totalCompleted);
  const overallPct = totalGoal > 0 ? Math.min((totalCompleted / totalGoal) * 100, 100) : 0;

  const dailyProgress = monthDays.map((d) => {
    const count = habits.filter((h) => isDone(h.id, d.dateStr)).length;
    return { day: d.day, count, max: habits.length };
  });

  const weeklyProgress = weeks.map((weekIdx) => {
    const weekDays = monthDays.filter((d) => d.weekNum === weekIdx);
    const count = weekDays.filter((d) => habits.some((h) => isDone(h.id, d.dateStr))).length;
    return { week: weekIdx + 1, count, max: weekDays.length * habits.length };
  });

  const leaderboard = habits.map((habit) => {
    const count = completions.filter((c) => c.habit_id === habit.id).length;
    return { habit, count };
  }).sort((a, b) => b.count - a.count).slice(0, 10);

  const getWellnessForDay = (dateStr: string) => wellness.find((w) => w.log_date === dateStr);
  const updateWellness = async (dateStr: string, field: 'mood' | 'sleep_hours', value: number) => {
    const existing = getWellnessForDay(dateStr);
    if (existing) {
      const updated = { ...existing, [field]: value };
      await supabase.from('wellness_log').update({ [field]: value }).eq('id', existing.id);
      setWellness(wellness.map((w) => w.id === existing.id ? updated : w));
    } else {
      const { data } = await supabase.from('wellness_log').insert({
        log_date: dateStr, [field]: value,
      }).select().single();
      if (data) setWellness([...wellness, data as WellnessLog]);
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const todayWellness = getWellnessForDay(todayStr);

  const moodData = monthDays.map((d) => {
    const w = getWellnessForDay(d.dateStr);
    return w?.mood ?? 0;
  });
  const sleepData = monthDays.map((d) => {
    const w = getWellnessForDay(d.dateStr);
    return w?.sleep_hours ?? 0;
  });

  const addHabit = async () => {
    if (!newHabit.name.trim()) return;
    const { data } = await supabase.from('habits').insert({
      name: newHabit.name.trim(),
      emoji: newHabit.emoji || '✅',
      goal_target: parseInt(newHabit.goal) || 30,
      color: 'zinc',
    }).select().single();
    if (data) {
      setHabits([...habits, data as Habit]);
      setNewHabit({ name: '', emoji: '✅', goal: '30' });
      setShowAddForm(false);
    }
  };

  const deleteHabit = async (id: string) => {
    await supabase.from('habit_completions').delete().eq('habit_id', id);
    await supabase.from('habits').delete().eq('id', id);
    setHabits(habits.filter((h) => h.id !== id));
    setCompletions(completions.filter((c) => c.habit_id !== id));
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Check className="w-8 h-8 text-zinc-300 animate-pulse" /></div>;
  }

  const donutRadius = 40;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const donutOffset = donutCircumference * (1 - overallPct / 100);

  return (
    <div className="bg-zinc-900 rounded-3xl p-4 lg:p-6 text-zinc-200">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row gap-4 mb-6">
        <div className="flex items-center gap-3 shrink-0">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="px-3 py-2 bg-zinc-800 text-zinc-200 rounded-lg text-sm border border-zinc-700"
          >
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="px-3 py-2 bg-zinc-800 text-zinc-200 rounded-lg text-sm border border-zinc-700"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>{m}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-4 flex-1 min-w-0">
          <div className="flex-1 bg-zinc-800 rounded-xl p-3 min-w-0">
            <p className="text-[10px] text-zinc-400 mb-2 uppercase tracking-wider">Daily Progress ({monthDays.length} days)</p>
            <div className="flex items-end gap-[2px] h-12">
              {dailyProgress.map((d) => {
                const h = d.max > 0 ? (d.count / d.max) * 100 : 0;
                return (
                  <div key={d.day} className="flex-1 rounded-sm transition-all min-w-[3px]"
                    style={{ height: `${Math.max(h, 2)}%`, backgroundColor: d.count > 0 ? '#e4e4e7' : '#3f3f46' }}
                  />
                );
              })}
            </div>
          </div>
          <div className="flex-1 bg-zinc-800 rounded-xl p-3 min-w-0">
            <p className="text-[10px] text-zinc-400 mb-2 uppercase tracking-wider">Weekly Trend</p>
            <div className="flex items-end gap-1 h-12">
              {weeklyProgress.map((w) => {
                const h = w.max > 0 ? (w.count / w.max) * 100 : 0;
                return (
                  <div key={w.week} className="flex-1 rounded-sm transition-all min-w-[8px]"
                    style={{ height: `${Math.max(h, 5)}%`, backgroundColor: w.count > 0 ? '#a1a1aa' : '#3f3f46' }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="bg-zinc-800 rounded-xl p-3 space-y-1">
            <div className="flex items-center justify-between gap-4 text-xs">
              <span className="text-zinc-400">Goal</span>
              <span className="text-zinc-200 font-semibold">{totalGoal}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-xs">
              <span className="text-zinc-400">Completed</span>
              <span className="text-white font-semibold">{totalCompleted}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-xs">
              <span className="text-zinc-400">Left</span>
              <span className="text-zinc-300 font-semibold">{totalLeft}</span>
            </div>
          </div>
          <div className="relative w-24 h-24 shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r={donutRadius} fill="none" stroke="#3f3f46" strokeWidth="8" />
              <circle cx="50" cy="50" r={donutRadius} fill="none" stroke="#e4e4e7" strokeWidth="8"
                strokeLinecap="round" strokeDasharray={donutCircumference} strokeDashoffset={donutOffset}
                style={{ transition: 'stroke-dashoffset 0.5s' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold text-white">{Math.round(overallPct)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Habit Grid */}
      <div className="bg-zinc-800 rounded-2xl overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr className="border-b border-zinc-700">
                <th className="sticky left-0 z-10 bg-zinc-800 px-3 py-2 text-left text-xs text-zinc-400 uppercase tracking-wider" style={{ width: '140px', minWidth: '140px' }}>
                  Habit
                </th>
                {weeks.map((weekIdx) => (
                  <th key={weekIdx} className="px-1 pb-0 text-center" style={{ width: `${7 * 28 + 12}px` }}>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Week {weekIdx + 1}</div>
                    <div className="flex gap-[2px] justify-center">
                      {weekdayHeaders[weekIdx].map((hdr, i) => (
                        <div key={i} className="w-6 text-[9px] text-zinc-500 text-center leading-tight">
                          <div>{hdr.label}</div>
                          <div className={hdr.day ? 'text-zinc-400' : 'text-zinc-700'}>{hdr.day ?? ''}</div>
                        </div>
                      ))}
                    </div>
                  </th>
                ))}
                <th className="px-3 py-2 text-right text-xs text-zinc-400 uppercase tracking-wider sticky right-0 z-10 bg-zinc-800" style={{ width: '180px', minWidth: '180px' }}>
                  Analysis
                </th>
              </tr>
            </thead>
            <tbody>
              {habitStats.map(({ habit, completed, goal, left, pct, streak, bestStreak }) => (
                <tr key={habit.id} className="border-b border-zinc-700/50 group">
                  <td className="sticky left-0 z-10 bg-zinc-800 px-3 py-2 group-hover:bg-zinc-700/30">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{habit.emoji}</span>
                      <span className="text-xs text-zinc-200 truncate">{habit.name}</span>
                      <button
                        onClick={() => deleteHabit(habit.id)}
                        className="text-zinc-600 hover:text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                  {weekDayArrays.map((weekDays, weekIdx) => (
                    <td key={weekIdx} className="px-1 py-1">
                      <div className="flex gap-[2px] justify-center">
                        {weekDays.map((dayInfo, i) => {
                          if (!dayInfo) return <div key={i} className="w-6 h-6" />;
                          const done = isDone(habit.id, dayInfo.dateStr);
                          const isToday = dayInfo.dateStr === todayStr;
                          return (
                            <button
                              key={i}
                              onClick={() => toggleCompletion(habit.id, dayInfo.dateStr)}
                              className={`w-6 h-6 rounded-md flex items-center justify-center transition-all ${
                                done
                                  ? 'bg-zinc-200 text-zinc-900'
                                  : 'bg-zinc-700/50 text-zinc-500 hover:bg-zinc-600/50'
                              } ${isToday ? 'ring-1 ring-zinc-400' : ''}`}
                            >
                              {done && <Check className="w-3 h-3" />}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  ))}
                  <td className="px-3 py-2 sticky right-0 z-10 bg-zinc-800 group-hover:bg-zinc-700/30">
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-2 text-[10px] text-zinc-500">
                        <span className="flex items-center gap-0.5"><Flame className="w-2.5 h-2.5" />{streak}</span>
                        <span>best: {bestStreak}</span>
                      </div>
                      <div className="flex items-center justify-end gap-2 text-xs mt-0.5">
                        <span className="text-zinc-400">G:{goal}</span>
                        <span className="text-white font-bold">{completed}</span>
                        <span className="text-zinc-300">L:{left}</span>
                      </div>
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <div className="h-1.5 w-20 bg-zinc-700 rounded-full overflow-hidden">
                          <div className="h-full bg-zinc-300 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[9px] text-zinc-400 tabular-nums w-7 text-right">{Math.round(pct)}%</span>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showAddForm ? (
          <div className="p-3 flex items-center gap-2 border-t border-zinc-700">
            <input
              value={newHabit.emoji}
              onChange={(e) => setNewHabit({ ...newHabit, emoji: e.target.value })}
              className="w-10 px-1 py-1.5 bg-zinc-700 rounded-lg text-sm text-center text-zinc-200 border border-zinc-600 focus:outline-none focus:border-zinc-400"
              placeholder="emoji"
            />
            <input
              value={newHabit.name}
              onChange={(e) => setNewHabit({ ...newHabit, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && addHabit()}
              className="flex-1 px-2 py-1.5 bg-zinc-700 rounded-lg text-sm text-zinc-200 border border-zinc-600 focus:outline-none focus:border-zinc-400"
              placeholder="Habit name"
              autoFocus
            />
            <input
              value={newHabit.goal}
              onChange={(e) => setNewHabit({ ...newHabit, goal: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && addHabit()}
              type="number"
              className="w-12 px-1 py-1.5 bg-zinc-700 rounded-lg text-sm text-center text-zinc-200 border border-zinc-600 focus:outline-none focus:border-zinc-400"
              placeholder="Goal"
            />
            <Button onClick={addHabit} size="sm">Add</Button>
            <Button onClick={() => setShowAddForm(false)} variant="ghost" size="sm">Cancel</Button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full p-3 flex items-center justify-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/30 transition-all border-t border-zinc-700"
          >
            <Plus className="w-4 h-4" /> Add Habit
          </button>
        )}
      </div>

      {/* Wellness + Leaderboard */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-zinc-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Smile className="w-4 h-4 text-zinc-400" />
            <h3 className="text-sm font-semibold text-zinc-200">Daily Wellness — {MONTHS[selectedMonth]}</h3>
          </div>

          {/* Daily mood/sleep dropdowns for each day of the month */}
          <div className="overflow-x-auto mb-4">
            <div className="flex gap-1 min-w-max pb-2">
              {monthDays.map((d) => {
                const w = getWellnessForDay(d.dateStr);
                const isToday = d.dateStr === todayStr;
                return (
                  <div key={d.dateStr} className={`flex flex-col items-center gap-1 p-1.5 rounded-lg ${isToday ? 'bg-zinc-700/40 ring-1 ring-zinc-500' : ''}`}>
                    <span className="text-[9px] text-zinc-500">{d.day}</span>
                    <select
                      value={w?.mood ?? ''}
                      onChange={(e) => updateWellness(d.dateStr, 'mood', parseInt(e.target.value) || 0)}
                      className="w-10 px-0.5 py-0.5 bg-zinc-700 rounded text-[10px] text-zinc-200 border border-zinc-600 focus:outline-none focus:border-zinc-400 cursor-pointer"
                    >
                      <option value="">—</option>
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    <select
                      value={w?.sleep_hours ?? ''}
                      onChange={(e) => updateWellness(d.dateStr, 'sleep_hours', parseFloat(e.target.value) || 0)}
                      className="w-10 px-0.5 py-0.5 bg-zinc-700 rounded text-[10px] text-zinc-200 border border-zinc-600 focus:outline-none focus:border-zinc-400 cursor-pointer"
                    >
                      <option value="">—</option>
                      {[3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((n) => (
                        <option key={n} value={n}>{n}h</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-zinc-900 rounded-xl p-3">
            <div className="flex items-center gap-4 mb-2">
              <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                <span className="w-3 h-0.5 bg-zinc-300 rounded" /> Mood (1-10)
              </span>
              <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                <span className="w-3 h-0.5 bg-zinc-500 rounded" style={{ borderTop: '1px dashed #71717a' }} /> Sleep (hrs)
              </span>
            </div>
            <DualAxisChart moodData={moodData} sleepData={sleepData} days={monthDays.length} />
          </div>
        </div>

        <div className="bg-zinc-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4 text-zinc-400" />
            <h3 className="text-sm font-semibold text-zinc-200">Top 10 Habits</h3>
          </div>
          <div className="space-y-2">
            {leaderboard.map((entry, i) => (
              <div key={entry.habit.id} className="flex items-center gap-2 text-sm">
                <span className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold ${
                  i === 0 ? 'bg-zinc-200 text-zinc-900' : i < 3 ? 'bg-zinc-400 text-zinc-900' : 'bg-zinc-700 text-zinc-400'
                }`}>{i + 1}</span>
                <span className="text-sm">{entry.habit.emoji}</span>
                <span className="flex-1 text-zinc-300 truncate text-xs">{entry.habit.name}</span>
                <span className="text-zinc-400 text-xs tabular-nums">{entry.count}x</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-1">
        {MONTHS.map((m, i) => (
          <button
            key={m}
            onClick={() => setSelectedMonth(i)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              selectedMonth === i ? 'bg-zinc-200 text-zinc-900' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50'
            }`}
          >
            {m.slice(0, 3)}
          </button>
        ))}
      </div>
    </div>
  );
}

function getStreak(habitId: string, completions: HabitCompletion[]): number {
  const dates = completions
    .filter((c) => c.habit_id === habitId)
    .map((c) => c.completion_date)
    .sort((a, b) => b.localeCompare(a));

  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dStr = d.toISOString().split('T')[0];
    if (dates.includes(dStr)) streak++;
    else if (i > 0) break;
  }
  return streak;
}

function getBestStreak(habitId: string, completions: HabitCompletion[]): number {
  const dates = completions
    .filter((c) => c.habit_id === habitId)
    .map((c) => c.completion_date)
    .sort((a, b) => a.localeCompare(b));

  if (dates.length === 0) return 0;
  let best = 1;
  let current = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + 'T00:00:00');
    const curr = new Date(dates[i] + 'T00:00:00');
    const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    if (diff === 1) { current++; best = Math.max(best, current); }
    else current = 1;
  }
  return best;
}

function DualAxisChart({ moodData, sleepData, days }: { moodData: number[]; sleepData: number[]; days: number }) {
  const width = 600;
  const height = 120;
  const padding = 20;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  const moodPoints = moodData.map((val, i) => {
    const x = padding + (i / Math.max(days - 1, 1)) * chartW;
    const y = padding + chartH - (val / 10) * chartH;
    return `${x},${y}`;
  });

  const sleepPoints = sleepData.map((val, i) => {
    const x = padding + (i / Math.max(days - 1, 1)) * chartW;
    const y = padding + chartH - (val / 12) * chartH;
    return `${x},${y}`;
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-24">
      {[0, 0.5, 1].map((t) => (
        <line key={t} x1={padding} x2={width - padding}
          y1={padding + chartH * t} y2={padding + chartH * t}
          stroke="#3f3f46" strokeWidth="0.5" />
      ))}
      <polyline points={moodPoints.join(' ')} fill="none" stroke="#e4e4e7" strokeWidth="1.5" />
      <polyline points={sleepPoints.join(' ')} fill="none" stroke="#71717a" strokeWidth="1.5" strokeDasharray="3,2" />
      <text x={4} y={padding + 4} fontSize="8" fill="#a1a1aa">Mood</text>
      <text x={4} y={height - 4} fontSize="8" fill="#71717a">Sleep</text>
    </svg>
  );
}
