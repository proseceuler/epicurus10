import { useState } from 'react';
import type { CalendarEvent } from '@/lib/calendarStore';
import type { Todo, KanbanTask, Note, Habit } from '@/lib/types';
import { iso, addOneHour, labelToMinutes, packTimed, eventFill, EVENT_COLORS, type Density, type DragPayload } from '@/pages/calendar/model';

const KIND_STYLE: Record<string, string> = {
  event: 'bg-zinc-800 text-white',
  deadline: 'bg-amber-500/90 text-white',
  exam: 'bg-rose-500/85 text-white',
  reminder: 'bg-sky-500/80 text-white',
  holiday: 'bg-emerald-500/75 text-white',
};

const SOURCE_STYLE = {
  todo: 'border border-sky-400/80 bg-sky-50 text-sky-800',
  kanban: 'border border-amber-400/80 bg-amber-50 text-amber-800',
  note: 'border border-violet-400/70 bg-violet-50 text-violet-800',
  habit: 'border border-emerald-400/70 bg-emerald-50 text-emerald-800',
};

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
  onColor?: (id: string, color: string | null) => void;
  onDelete?: (id: string) => void;
};

export function WeekGrid(p: Props) {
  const stepMin = p.density === 'comfortable' ? 15 : 60;
  const rowH = p.density === 'compact' ? 28 : 48;
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; colorOpen?: boolean } | null>(null);
  const inSlotRange = (dayIso: string, label: string) => {
    if (!p.slotDrag || p.slotDrag.dayIso !== dayIso) return false;
    const a = labelToMinutes(p.slotDrag.start);
    const b = labelToMinutes(p.slotDrag.end);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const t = labelToMinutes(label);
    return t >= lo && t <= hi;
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
        {p.rangeDays.map((d) => {
          const dayIso = iso(d);
          const evs = p.eventsForDay(dayIso).filter((e) => e.all_day);
          const dueTodos = p.todosForDay(dayIso);
          const dueKanban = p.kanbanForDay(dayIso);
          const dayNotes = p.notesForDay(dayIso);
          const dayHabits = p.habitsForDay(dayIso);
          return (
            <div key={`all-${dayIso}`} className="min-h-[52px] space-y-0.5 border-l border-zinc-100 p-1" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void p.dropOn(p.readDrag(e), dayIso); }} onDoubleClick={() => p.openForm(dayIso)}>
              {evs.map((e) => (
                <button key={e.id} type="button" draggable onDragStart={(ev) => p.writeDrag(ev, { kind: 'event', id: e.id })} onClick={() => p.openEvent(e)} className={`block w-full truncate rounded px-1 py-0.5 text-left text-[10px] ${KIND_STYLE[e.kind] ?? KIND_STYLE.event}`}>{e.title}</button>
              ))}
              {dueTodos.map((t) => (
                <div key={`td-${t.id}`} draggable onDragStart={(ev) => p.writeDrag(ev, { kind: 'todo', id: t.id })} className={`truncate rounded px-1 py-0.5 text-[10px] ${SOURCE_STYLE.todo} ${t.completed ? 'line-through opacity-50' : ''}`}>To-do - {t.title}</div>
              ))}
              {dueKanban.map((t) => (
                <div key={`kb-${t.id}`} draggable onDragStart={(ev) => p.writeDrag(ev, { kind: 'kanban', id: t.id })} className={`truncate rounded px-1 py-0.5 text-[10px] ${SOURCE_STYLE.kanban}`}>Board - {t.title}</div>
              ))}
              {dayNotes.map((n) => (
                <div key={`nt-${n.id}`} draggable onDragStart={(ev) => p.writeDrag(ev, { kind: 'note', id: n.id })} className={`truncate rounded px-1 py-0.5 text-[10px] ${SOURCE_STYLE.note}`}>Note - {n.title}</div>
              ))}
              {dayHabits.map((h) => (
                <div key={`hb-${h.id}`} draggable onDragStart={(ev) => p.writeDrag(ev, { kind: 'habit', id: h.id })} className={`truncate rounded px-1 py-0.5 text-[10px] ${SOURCE_STYLE.habit}`}>Habit - {h.name}</div>
              ))}
            </div>
          );
        })}
      </div>
      <div className={p.density === 'compact' ? 'overflow-hidden' : 'max-h-[28rem] overflow-y-auto'} style={p.density === 'compact' ? { maxHeight: 'min(26rem, calc(100vh - 22rem))' } : undefined}>
        <div className="min-w-[560px]" style={{ display: 'grid', gridTemplateColumns: `3.25rem repeat(${p.rangeDays.length}, minmax(0, 1fr))` }}>
          {p.slots.map((slot) => (
            <div key={slot.label} className="contents">
              <div className="border-t border-zinc-100 pr-1 text-right text-[10px] text-zinc-400" style={{ height: rowH, lineHeight: `${rowH}px` }}>{slot.m === 0 ? slot.label : ''}</div>
              {p.rangeDays.map((d) => {
                const dayIso = iso(d);
                const selected = inSlotRange(dayIso, slot.label);
                return (
                  <div
                    key={`${dayIso}-${slot.label}`}
                    className={`border-l border-t border-zinc-100 p-0.5 select-none ${selected ? 'bg-zinc-900/10' : ''}`}
                    style={{ minHeight: rowH }}
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
            const timed = p.eventsForDay(dayIso).filter((e) => !e.all_day);
            const packed = packTimed(timed);
            const isToday = d.toDateString() === p.todayStr;
            const now = new Date();
            const nowMin = now.getHours() * 60 + now.getMinutes();
            const showNow = isToday && nowMin >= gridStart && nowMin <= gridEnd;
            return (
              <div key={`overlay-${dayIso}`} className="pointer-events-none relative" style={{ gridColumn: di + 2, gridRow: `1 / span ${p.slots.length}` }}>
                {showNow && (
                  <div className="pointer-events-none absolute left-0 right-0 z-20" style={{ top: ((nowMin - gridStart) / stepMin) * rowH }}>
                    <span className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-rose-500" />
                    <div className="h-px bg-rose-500" />
                  </div>
                )}
                {packed.map((block) => {
                  const ev = timed.find((e) => e.id === block.id);
                  if (!ev) return null;
                  const s = Math.max(gridStart, Math.min(block.startMin, gridEnd - 15));
                  const en = Math.max(s + 15, Math.min(block.endMin, gridEnd));
                  const top = ((s - gridStart) / stepMin) * rowH;
                  const height = Math.max(22, ((en - s) / stepMin) * rowH - 3);
                  const widthPct = 100 / block.cols;
                  const leftPct = (block.col / block.cols) * 100;
                  const fill = eventFill(ev.kind, ev.color);
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      draggable
                      onDragStart={(drag) => p.writeDrag(drag, { kind: 'event', id: ev.id })}
                      onClick={() => p.openEvent(ev)}
                      onContextMenu={(ctx) => {
                        ctx.preventDefault();
                        setMenu({ id: ev.id, x: ctx.clientX, y: ctx.clientY });
                      }}
                      className="pointer-events-auto absolute z-10 overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[11px] leading-tight text-white shadow-sm"
                      style={{ top, height, left: `calc(${leftPct}% + 2px)`, width: `calc(${widthPct}% - 4px)`, background: fill }}
                      title={`${(ev.start_time || '').slice(0, 5)}${ev.end_time ? `-${ev.end_time.slice(0, 5)}` : ''} ${ev.title}`}
                    >
                      <div className="font-semibold">{ev.title || '(No title)'}</div>
                      {height > 28 && (
                        <div className="opacity-80">
                          {(ev.start_time || '').slice(0, 5)}
                          {ev.end_time ? ` – ${ev.end_time.slice(0, 5)}` : ''}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {menu && (
        <div className="fixed inset-0 z-50" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }}>
          <div
            className="absolute w-56 overflow-hidden rounded-xl bg-white p-1.5 shadow-[0_16px_40px_rgba(24,24,27,0.18)]"
            style={{ left: Math.min(menu.x, window.innerWidth - 240), top: Math.min(menu.y, window.innerHeight - 220) }}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="flex w-full rounded-lg px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100" onClick={() => {
              const ev = p.rangeDays.flatMap((d) => p.eventsForDay(iso(d))).find((e) => e.id === menu.id);
              if (ev) p.openEvent(ev);
              setMenu(null);
            }}>Edit event</button>
            <button type="button" className="flex w-full rounded-lg px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100" onClick={() => setMenu({ ...menu, colorOpen: !menu.colorOpen })}>Change color</button>
            {menu.colorOpen && (
              <div className="grid grid-cols-7 gap-1.5 px-2 py-2">
                {EVENT_COLORS.map((hex) => (
                  <button key={hex} type="button" className="h-5 w-5 rounded-full border border-black/10" style={{ background: hex }} onClick={() => { p.onColor?.(menu.id, hex); setMenu(null); }} />
                ))}
                <button type="button" className="col-span-7 rounded-md bg-zinc-100 px-2 py-1 text-[11px] text-zinc-600" onClick={() => { p.onColor?.(menu.id, null); setMenu(null); }}>Default</button>
              </div>
            )}
            <button type="button" className="flex w-full rounded-lg px-3 py-1.5 text-left text-sm text-rose-600 hover:bg-rose-50" onClick={() => { void p.onDelete?.(menu.id); setMenu(null); }}>Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}
