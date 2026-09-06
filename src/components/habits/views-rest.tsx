import type { Habit } from '@/lib/types';
import {
  BarRow, countOn, rateOn,
} from '@/components/habits/widgets';
import {
  MONTHS, WEEKDAYS, monthDays, weekdayIdx, type DayCell,
} from '@/lib/habit-stats';

function habitPct(h: Habit | undefined, days: { dateStr: string }[], done: Set<string>) {
  if (!h || !days.length) return 0;
  return days.filter((d) => d.dateStr && days).length && h ? days.filter((d) => true).length && 0 : 0;
}
