import type { CalendarEvent } from '@/lib/calendarStore';
import type { Todo, KanbanTask } from '@/lib/types';
import { iso, parse, addDays, startOfWeek, eventFill, type DragPayload } from '@/pages/calendar/model';

function prettyTime(t?: string | null) {
  if (!t) return '';
  const [hs, ms] = t.slice(0, 5).split(':').map(Number);
  const h = hs || 0;
  const suffix = h < 12 ? 'am' : 'pm';
  const hr = ((h + 11) % 12) + 1;
  return ms ? `${hr}:${String(ms).padStart(2, '0')}${suffix}` : `${hr}${suffix}`;
}

type Lane = { id: string; title: string; startCol: number; span: number; fill: string; row: number };

function weekLanes(week: Date[], events: CalendarEvent[]): Lane[] {
  const weekStart = iso(week[0]);
  const weekEnd = iso(week[6]);
  const overlapping = events
    .filter((e) => e.start_date <= weekEnd && e.end_date >= weekStart)
    .sort((a, b) => {
      const aSpan = a.end_date.localeCompare(a.start_date);
      const bSpan = b.end_date.localeCompare(b.start_date);
      if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
      if (aSpan !== bSpan) return bSpan - aSpan;
      return a.start_date.localeCompare(b.start_date) || (a.start_time || '').localeCompare(b.start_time || '');
    });

  const used: { col: number; end: number }[][] = [];
  const lanes: Lane[] = [];

  for (const ev of overlapping) {
    const startIdx = Math.max(0, week.findIndex((d) => iso(d) >= ev.start_date));
    const lastIdx = week.reduce((acc, d, i) => (iso(d) <= ev.end_date ? i : acc), startIdx);
    const span = Math.max(1, lastIdx - startIdx + 1);
    const multi = ev.all_day || ev.start_date !== ev.end_date;
    if (!multi) continue;
    let row = used.findIndex((rowSlots) => rowSlots.every((s) => lastIdx < s.col || startIdx > s.end));
    if (row < 0) {
      used.push([]);
      row = used.length - 1;
    }
    used[row].push({ col: startIdx, end: lastIdx });
    lanes.push({
      id: ev.id,
      title: ev.title || '(No title)',
      startCol: startIdx,
      span,
      fill: eventFill(ev.kind, ev.color),
      row,
    });
  }
  return lanes;
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
  const first = startOfWeek(new Date(year, month, 1));
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const weeks = Array.from({ length: 6 }, (_, i) => days.slice(i * 7, i * 7 + 7));
  const lo = monthDrag ? (monthDrag.start <= monthDrag.end ? monthDrag.start : monthDrag.end) : '';
  const hi = monthDrag ? (monthDrag.start <= monthDrag.end ? monthDrag.end : monthDrag.start) : '';

  return (
    <>
      <div className="mb-px grid grid-cols-7 border-b border-zinc-200">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="py-1 text-center text-[11px] font-medium uppercase tracking-wide text-zinc-400">{d}</div>
        ))}
      </div>
      <div className="grid grid-rows-6 overflow-hidden rounded-lg border border-zinc-200">
        {weeks.map((week, wi) => {
          const lanes = weekLanes(week, events);
          const laneH = Math.max(1, lanes.reduce((m, l) => Math.max(m, l.row + 1), 0));
          return (
            <div key={wi} className="relative grid min-h-[108px] grid-cols-7 border-t border-zinc-200 first:border-t-0">
              {week.map((d) => {
                const dayIso = iso(d);
                const inMonth = d.getMonth() === month;
                const isToday = d.toDateString() === todayStr;
                const isSelected = selectedDay === dayIso;
                const inRange = Boolean(monthDrag && dayIso >= lo && dayIso <= hi);
                const timed = events.filter((e) => !e.all_day && e.start_date === e.end_date && e.start_date === dayIso);
                const due = [
                  ...todos.filter((t) => t.due_date === dayIso),
                  ...kanban.filter((t) => t.due_date === dayIso && t.status !== 'done'),
                ];
                return (
                  <div
                    key={dayIso}
                    className={`relative min-h-[108px] border-l border-zinc-100 first:border-l-0 ${inRange ? 'bg-blue-50/80' : isSelected ? 'bg-white' : isToday ? 'bg-zinc-50' : 'bg-white'} ${inMonth ? '' : 'bg-zinc-50/70'}`}
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
                      else setSelectedDay(a);
                    }}
                    onDoubleClick={() => openForm(dayIso)}
                    onClick={() => setSelectedDay(dayIso)}
                  >
                    <div className="flex justify-end px-1.5 pt-1">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-medium ${isToday ? 'bg-blue-600 text-white' : inMonth ? 'text-zinc-700' : 'text-zinc-400'}`}>{d.getDate()}</span>
                    </div>
                    <div className="space-y-0.5 px-1 pb-1" style={{ marginTop: 28 + laneH * 20 }}>
                      {timed.slice(0, 3).map((ev) => (
                        <button
                          key={ev.id}
                          type="button"
                          data-cal-chip
                          draggable
                          onDragStart={(drag) => writeDrag(drag, { kind: 'event', id: ev.id })}
                          onClick={(e) => { e.stopPropagation(); openEvent(ev); }}
                          className="flex w-full items-center gap-1 truncate text-left text-[11px] text-zinc-700"
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: eventFill(ev.kind, ev.color) }} />
                          <span className="truncate">{prettyTime(ev.start_time)} {ev.title || '(No title)'}</span>
                        </button>
                      ))}
                      {due.slice(0, 2).map((item) => (
                        <div key={item.id} className="truncate rounded bg-zinc-100 px-1 text-[10px] text-zinc-600">{item.title}</div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="pointer-events-none absolute inset-x-0 top-7 z-10 px-0.5">
                {lanes.map((lane) => (
                  <button
                    key={lane.id}
                    type="button"
                    data-cal-chip
                    draggable
                    onDragStart={(drag) => writeDrag(drag, { kind: 'event', id: lane.id })}
                    onClick={(e) => {
                      e.stopPropagation();
                      const ev = events.find((x) => x.id === lane.id);
                      if (ev) openEvent(ev);
                    }}
                    className="pointer-events-auto absolute truncate rounded-sm px-1.5 py-0.5 text-left text-[11px] font-medium leading-4 text-white shadow-sm"
                    style={{
                      top: lane.row * 20,
                      left: `calc(${(lane.startCol / 7) * 100}% + 2px)`,
                      width: `calc(${(lane.span / 7) * 100}% - 4px)`,
                      background: lane.fill,
                    }}
                  >
                    {lane.title}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
