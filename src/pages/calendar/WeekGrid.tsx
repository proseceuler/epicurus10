import { KIND_STYLE, SOURCE_STYLE } from '@/lib/calendarTheme';
import type { CalendarEvent } from '@/lib/calendarStore';
import type { Todo, KanbanTask, Note, Habit } from '@/lib/types';
import { iso, addOneHour, labelToMinutes, packTimed, type Density, type DragPayload } from '@/pages/calendar/model';

type Props = {
  rangeDays: Date[];
  slots: { h: number; m: number; label: string }[];
  density: Density;
  eventsForDay: (dayIso: string) => CalendarEvent[];
  todosForDay: (dayIso: string) => Todo[];
  kanbanForDay: (dayIso: string) => KanbanTask[];
  notesForDay: (dayIso: string) => Note[];
  habitsForDay: (dayIso: string) => Habit[];
  slotDrag: { dayIso: string; start: string; end: string } | null;
  slotDragRef: React.MutableRefObject<{ dayIso: string; start: string; end: string } | null>;
  setSlotDrag: (v: { dayIso: string; start: string; end: string } | null) => void;
  openForm: (date: string, timed?: { start: string; end?: string }, endDate?: string) => void;
  openEvent: (e: CalendarEvent) => void;
  dropOn: (payload: DragPayload | null, date: string, time?: string) => void;
  readDrag: (e: React.DragEvent) => DragPayload | null;
  writeDrag: (e: React.DragEvent, payload: DragPayload) => void;
  setSelectedDay: (iso: string) => void;
  todayStr: string;
};

export function WeekGrid(p: Props) {
  const stepMin = p.slots.length >= 2 ? Math.max(15, labelToMinutes(p.slots[1].label) - labelToMinutes(p.slots[0].label)) : 30;
  const rowH = p.density === 'compact' ? 36 : 48;
  const inSlotRange = (dayIso: string, label: string) => {
    if (!p.slotDrag || p.slotDrag.dayIso !== dayIso) return false;
    const a = labelToMinutes(p.slotDrag.start);
    const b = labelToMinutes(p.slotDrag.end);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const t = labelToMinutes(label);
    return t >= lo && t <= hi;
  };

  const AllDayCell = ({ dayIso }: { dayIso: string }) => {
    const evs = p.eventsForDay(dayIso).filter((e) => e.all_day);
    const dueTodos = p.todosForDay(dayIso);
    const dueKanban = p.kanbanForDay(dayIso);
    return (
      <div className="min-h-[52px] space-y-0.5 border-l border-zinc-100 p-1" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void p.dropOn(p.readDrag(e), dayIso); }} onDoubleClick={() => p.openForm(dayIso)}>
        {evs.map((e) => (
          <button key={e.id} type="button" draggable onDragStart={(ev) => p.writeDrag(ev, { kind: 'event', id: e.id })} onClick={() => p.openEvent(e)} className={`block w-full truncate rounded px-1 py-0.5 text-left text-[10px] ${KIND_STYLE[e.kind] ?? KIND_STYLE.event}`}>{e.title}</button>
        ))}
        {dueTodos.map((t) => (
          <div key={`td-${t.id}`} draggable onDragStart={(ev) => p.writeDrag(ev, { kind: 'todo', id: t.id })} className={`truncate rounded px-1 py-0.5 text-[10px] ${SOURCE_STYLE.todo} ${t.completed ? 'line-through opacity-50' : ''}`}>To-do - {t.title}</div>
        ))}
        {dueKanban.map((t) => (
          <div key={`kb-${t.id}`} draggable onDragStart={(ev) => p.writeDrag(ev, { kind: 'kanban', id: t.id })} className={`truncate rounded px-1 py-0.5 text-[10px] ${SOURCE_STYLE.kanban}`}>Board - {t.title}</div>
        ))}
      </div>
    );
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]" style={{ display: 'grid', gridTemplateColumns: `3.25rem repeat(${p.rangeDays.length}, minmax(0, 1fr))` }}>
        <div />
        {p.rangeDays.map((d) => {
          const dayIso = iso(d);
          return (
            <button key={dayIso} type="button" onClick={() => p.setSelectedDay(dayIso)} onDoubleClick={() => p.openForm(dayIso)} className={`px-1 pb-2 text-center text-xs font-medium ${d.toDateString() === p.todayStr ? 'text-zinc-900' : 'text-zinc-500'}`}>
              {d.toLocaleDateString('en-US', { weekday: 'short' })} {d.getDate()}
            </button>
          );
        })}
        <div className="flex items-end pb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">All day</div>
        {p.rangeDays.map((d) => <AllDayCell key={`all-${iso(d)}`} dayIso={iso(d)} />)}
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: 'min(42rem, calc(100vh - 14rem))' }}>
        <div className="min-w-[560px]" style={{ display: 'grid', gridTemplateColumns: `3.25rem repeat(${p.rangeDays.length}, minmax(0, 1fr))` }}>
          {p.slots.map((slot) => (
            <div key={slot.label} className="contents">
              <div className="border-t border-zinc-100 pr-1 text-right text-[10px] leading-none text-zinc-400" style={{ height: rowH, paddingTop: 4 }}>{slot.m === 0 ? slot.label : ''}</div>
              {p.rangeDays.map((d) => {
                const dayIso = iso(d);
                const selected = inSlotRange(dayIso, slot.label);
                return (
                  <div
                    key={`${dayIso}-${slot.label}`}
                    className={`border-l border-t border-zinc-100 p-0.5 select-none ${selected ? 'bg-zinc-900/10' : ''}`}
                    style={{ minHeight: rowH, height: rowH }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); void p.dropOn(p.readDrag(e), dayIso, slot.label); }}
                    onDoubleClick={() => p.openForm(dayIso, { start: slot.label })}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      if ((e.target as HTMLElement).closest('button')) return;
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      p.setSlotDrag({ dayIso, start: slot.label, end: slot.label });
                    }}
                    onPointerEnter={() => {
                      const cur = p.slotDragRef.current;
                      if (!cur || cur.dayIso !== dayIso) return;
                      p.setSlotDrag({ ...cur, end: slot.label });
                    }}
                    onPointerUp={(e) => {
                      const cur = p.slotDragRef.current;
                      if (!cur || cur.dayIso !== dayIso) return;
                      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
                      const a = labelToMinutes(cur.start);
                      const b = labelToMinutes(cur.end);
                      const start = a <= b ? cur.start : cur.end;
                      const end = a <= b ? cur.end : cur.start;
                      p.setSlotDrag(null);
                      p.openForm(dayIso, { start, end: addOneHour(end) });
                    }}
                  />
                );
              })}
            </div>
          ))}
          {p.rangeDays.map((d, di) => {
            const dayIso = iso(d);
            const gridStart = 6 * 60;
            const gridEnd = 22 * 60;
            const packed = packTimed(p.eventsForDay(dayIso).filter((e) => !e.all_day));
            return (
              <div key={`overlay-${dayIso}`} className="pointer-events-none relative" style={{ gridColumn: di + 2, gridRow: `1 / span ${p.slots.length}` }}>
                {packed.map((e) => {
                  const s = Math.max(gridStart, Math.min(e.startMin, gridEnd - 15));
                  const en = Math.max(s + 15, Math.min(e.endMin, gridEnd));
                  const top = ((s - gridStart) / stepMin) * rowH;
                  const height = Math.max(rowH - 2, ((en - s) / stepMin) * rowH - 2);
                  const width = `calc(${100 / e.cols}% - 4px)`;
                  const left = `calc(${(100 / e.cols) * e.col}% + 2px)`;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      draggable
                      onDragStart={(ev) => p.writeDrag(ev, { kind: 'event', id: e.id })}
                      onClick={() => {
                        const full = p.eventsForDay(dayIso).find((x) => x.id === e.id);
                        if (full) p.openEvent(full);
                      }}
                      className={`pointer-events-auto absolute z-10 overflow-hidden rounded px-1 py-0.5 text-left text-[10px] leading-tight ${KIND_STYLE[e.kind] ?? KIND_STYLE.event}`}
                      style={{ top, height, left, width }}
                      title={`${(e.start_time || '').slice(0, 5)}${e.end_time ? `-${e.end_time.slice(0, 5)}` : ''} ${e.title}`}
                    >
                      <span className="font-medium">{e.title}</span>
                      <span className="ml-1 opacity-70">{(e.start_time || '').slice(0, 5)}{e.end_time ? `-${e.end_time.slice(0, 5)}` : ''}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
