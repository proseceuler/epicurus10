import type { CalendarEvent } from '@/lib/calendarStore';
import type { Todo, KanbanTask } from '@/lib/types';
import { iso, parse, eventFill, type DragPayload } from '@/pages/calendar/model';

function prettyTime(t?: string | null) {
  if (!t) return '';
  const [hs, ms] = t.slice(0, 5).split(':').map(Number);
  const h = hs || 0;
  const suffix = h < 12 ? 'am' : 'pm';
  const hr = ((h + 11) % 12) + 1;
  return ms ? `${hr}:${String(ms).padStart(2, '0')}${suffix}` : `${hr}${suffix}`;
}

export function MonthGrid({
  currentDate,
  todayStr,
  selectedDay,
  events,
  todos,
  kanban,
  monthDrag,
  monthDragRef,
  setMonthDrag,
  setSelectedDay,
  setCurrentDate,
  openForm,
  openEvent,
  dropOn,
  readDrag,
  writeDrag,
}: {
  currentDate: Date;
  todayStr: string;
  selectedDay: string | null;
  events: CalendarEvent[];
  todos: Todo[];
  kanban: KanbanTask[];
  monthDrag: { start: string; end: string } | null;
  monthDragRef: React.MutableRefObject<{ start: string; end: string } | null>;
  setMonthDrag: (v: { start: string; end: string } | null) => void;
  setSelectedDay: (iso: string) => void;
  setCurrentDate: (d: Date) => void;
  openForm: (date: string, timed?: { start: string; end?: string }, endDate?: string) => void;
  openEvent: (e: CalendarEvent) => void;
  dropOn: (payload: DragPayload | null, date: string, time?: string) => void;
  readDrag: (e: React.DragEvent) => DragPayload | null;
  writeDrag: (e: React.DragEvent, payload: DragPayload) => void;
}) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lo = monthDrag ? (monthDrag.start <= monthDrag.end ? monthDrag.start : monthDrag.end) : '';
  const hi = monthDrag ? (monthDrag.start <= monthDrag.end ? monthDrag.end : monthDrag.start) : '';

  return (
    <>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="py-1 text-center text-xs font-medium text-zinc-400">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dayDate = new Date(year, month, day);
          const dayIso = iso(dayDate);
          const isToday = dayDate.toDateString() === todayStr;
          const isSelected = selectedDay === dayIso;
          const inRange = Boolean(monthDrag && dayIso >= lo && dayIso <= hi);
          const dayEvents = events.filter((e) => e.start_date <= dayIso && e.end_date >= dayIso);
          const due = [
            ...todos.filter((t) => t.due_date === dayIso),
            ...kanban.filter((t) => t.due_date === dayIso && t.status !== 'done'),
          ];
          return (
            <div
              key={dayIso}
              onClick={() => setSelectedDay(dayIso)}
              onDoubleClick={() => openForm(dayIso)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); void dropOn(readDrag(e), dayIso); }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                if ((e.target as HTMLElement).closest('[data-cal-chip]')) return;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                setMonthDrag({ start: dayIso, end: dayIso });
              }}
              onPointerEnter={() => {
                const cur = monthDragRef.current;
                if (!cur) return;
                setMonthDrag({ ...cur, end: dayIso });
              }}
              onPointerUp={(e) => {
                const cur = monthDragRef.current;
                if (!cur) return;
                try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
                const a = cur.start <= cur.end ? cur.start : cur.end;
                const b = cur.start <= cur.end ? cur.end : cur.start;
                setMonthDrag(null);
                setSelectedDay(a);
                setCurrentDate(parse(a));
                if (a !== b) openForm(a, undefined, b);
              }}
              className={`min-h-[72px] cursor-pointer rounded-xl border p-1 text-left text-xs ${inRange ? 'border-zinc-800 bg-zinc-900/10' : isSelected ? 'border-zinc-800 bg-white/70' : isToday ? 'border-zinc-800 bg-zinc-100/50' : 'border-zinc-200/30 hover:bg-white/40'}`}
            >
              <div className={`text-right font-medium ${isToday ? 'text-zinc-900' : 'text-zinc-500'}`}>{day}</div>
              {dayEvents.slice(0, 2).map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  data-cal-chip
                  draggable
                  onDragStart={(drag) => writeDrag(drag, { kind: 'event', id: ev.id })}
                  onClick={(e) => { e.stopPropagation(); openEvent(ev); }}
                  className="mt-0.5 block w-full truncate rounded px-1 py-0.5 text-left text-[10px] text-white"
                  style={{ background: eventFill(ev.kind, ev.color) }}
                  title={ev.all_day ? ev.title : `${prettyTime(ev.start_time)} ${ev.title}`}
                >
                  {ev.all_day || ev.start_date !== ev.end_date ? ev.title : `${prettyTime(ev.start_time)} ${ev.title}`}
                </button>
              ))}
              {due.slice(0, 2).map((item) => (
                <div key={item.id} className="mt-0.5 truncate rounded bg-zinc-200/70 px-1 py-0.5 text-[10px] text-zinc-600">{item.title}</div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
