import { addDays, isDone } from '@/lib/habit-stats';
import type { Habit } from '@/lib/types';

export default function CheckOffBar({
  habits, done, today, onToggle,
}: {
  habits: Habit[];
  done: Set<string>;
  today: string;
  onToggle: (habitId: string, dateStr: string) => void;
}) {
  const cols = [
    { label: 'Yesterday', date: addDays(today, -1) },
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: addDays(today, 1) },
  ];
  return (
    <div className="mb-3 overflow-x-auto rounded-xl border border-zinc-200 bg-white/80 px-3 py-2">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Check off — previous, today, next</p>
      <div className="grid grid-cols-[minmax(7rem,1fr)_repeat(3,2.25rem)] items-center gap-y-1 text-[12px]">
        <span />
        {cols.map((c) => (
          <span key={c.date} className="text-center text-[9px] uppercase tracking-wide text-zinc-500">{c.label}</span>
        ))}
        {habits.map((h) => (
          <span key={h.id} className="contents">
            <span className="truncate pr-2 text-zinc-700">{h.emoji} {h.name}</span>
            {cols.map((c) => {
              const on = isDone(done, h.id, c.date);
              return (
                <button
                  key={c.date}
                  type="button"
                  onClick={() => onToggle(h.id, c.date)}
                  className={`mx-auto h-4 w-4 ${c.date === today ? 'ring-1 ring-zinc-600' : ''}`}
                  style={{ background: on ? '#3f3f46' : 'transparent', border: '1px solid #71717a' }}
                  aria-label={`${on ? 'Uncheck' : 'Check'} ${h.name} ${c.label}`}
                />
              );
            })}
          </span>
        ))}
      </div>
    </div>
  );
}
