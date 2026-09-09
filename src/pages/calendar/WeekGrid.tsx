import { useState } from 'react';
import type { CalendarEvent } from '@/lib/calendarStore';
import type { Todo, KanbanTask, Note, Habit } from '@/lib/types';
import { iso, addOneHour, hm, packTimed, eventFill, EVENT_COLORS, type Density, type DragPayload } from '@/pages/calendar/model';

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

const GRID_START = 6 * 60;
const GRID_END = 22 * 60;
const HOURS = Array.from({ length: (GRID_END - GRID_START) / 60 }, (_, i) => 6 + i);

function hourLabel(h: number) {
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function prettyTime(t?: string | null) {
  if (!t) return '';
  const [hs, ms] = t.slice(0, 5).split(':').map(Number);
  const h = hs || 0;
  const suffix = h < 12 ? 'am' : 'pm';
  const hr = ((h + 11) % 12) + 1;
  return ms ? `${hr}:${String(ms).padStart(2, '0')}${suffix}` : `${hr}${suffix}`;
}

function snapLabel(min: number) {
  const clamped = Math.max(GRID_START, Math.min(GRID_END - 15, Math.round(min / 15) * 15));
  return hm(Math.floor(clamped / 60), clamped % 60);
}

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
  const hourH = p.density === 'compact' ? 40 : 52;
  const gridH = HOURS.length * hourH;
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; colorOpen?: boolean } | null>(null);

  const minutesFromY = (el: HTMLElement, clientY: number) => {
    const rect = el.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    return GRID_START + (y / hourH) * 60;
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]" style={{ display: 'grid', gridTemplateColumns: `3.25rem repeat(${p.rangeDays.length}, minmax(0, 1fr))` }}>
        <div />
        {p.rangeDays.map((d) => {
          const dayIso = iso(d);
          const today = d.toDateString() === p.todayStr;
          return (
            <button key={dayIso} type="button" onClick={() => p.setSelectedDay(dayIso)} onDoubleClick={() => p.openForm(dayIso)} className="px-1 pb-2 text-center">
              <div className={`text-[11px] font-medium uppercase tracking-wide ${today ? 'text-blue-600' : 'text-zinc-500'}`}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
              <div className={`mx-auto mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${today ? 'bg-blue-600 text-white' : 'text-zinc-800'}`}>{d.getDate()}</div>
            </button>
          );
        })}

        <div className="flex items-center justify-end pr-2 text-[10px] font-medium uppercase tracking-wide text-zinc-400">All day</div>
        {p.rangeDays.map((d) => {
          const dayIso = iso(d);
          const chips = [
            ...p.eventsForDay(dayIso).filter((e) => e.all_day).map((e) => ({ id: `ev-${e.id}`, label: e.title, cls: KIND_STYLE[e.kind] ?? KIND_STYLE.event, drag: { kind: 'event' as const, id: e.id }, onClick: () => p.openEvent(e) })),
            ...p.todosForDay(dayIso).map((t) => ({ id: `td-${t.id}`, label: t.title, cls: SOURCE_STYLE.todo, drag: { kind: 'todo' as const, id: t.id } })),
            ...p.kanbanForDay(dayIso).map((t) => ({ id: `kb-${t.id}`, label: t.title, cls: SOURCE_STYLE.kanban, drag: { kind: 'kanban' as const, id: t.id } })),
            ...p.notesForDay(dayIso).map((n) => ({ id: `nt-${n.id}`, label: n.title, cls: SOURCE_STYLE.note, drag: { kind: 'note' as const, id: n.id } })),
            ...p.habitsForDay(dayIso).map((h) => ({ id: `hb-${h.id}`, label: h.name, cls: SOURCE_STYLE.habit, drag: { kind: 'habit' as const, id: h.id } })),
          ];
          const shown = chips.slice(0, 2);
          const extra = chips.length - shown.length;
          return (
            <div
              key={`all-${dayIso}`}
              className="min-h-[28px] max-h-[44px] overflow-hidden border-l border-zinc-200/80 px-1 py-0.5"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); void p.dropOn(p.readDrag(e), dayIso); }}
              onDoubleClick={() => p.openForm(dayIso)}
            >
              {shown.map((c) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={(ev) => p.writeDrag(ev, c.drag)}
                  onClick={'onClick' in c ? c.onClick : undefined}
                  className={`mb-0.5 truncate rounded px-1 py-px text-[10px] leading-4 ${c.cls}`}
                >
                  {c.label}
                </div>
              ))}
              {extra > 0 && <div className="px-1 text-[10px] text-zinc-500">+{extra} more</div>}
            </div>
          );
        })}
      </div>

      <div className="max-h-[min(32rem,calc(100vh-18rem))] overflow-auto">
        <div className="min-w-[640px]" style={{ display: 'grid', gridTemplateColumns: `3.25rem repeat(${p.rangeDays.length}, minmax(0, 1fr))` }}>
          <div className="relative" style={{ height: gridH }}>
            {HOURS.map((h) => (
              <div key={h} className="absolute right-1 -translate-y-1/2 text-[10px] text-zinc-400" style={{ top: ((h * 60 - GRID_START) / 60) * hourH }}>
                {hourLabel(h)}
              </div>
            ))}
          </div>

          {p.rangeDays.map((d) => {
            const dayIso = iso(d);
            const timed = p.eventsForDay(dayIso).filter((e) => !e.all_day);
            const packed = packTimed(timed);
            const isToday = d.toDateString() === p.todayStr;
            const now = new Date();
            const nowMin = now.getHours() * 60 + now.getMinutes();
            const showNow = isToday && nowMin >= GRID_START && nowMin <= GRID_END;
            const drag = p.slotDrag?.dayIso === dayIso ? p.slotDrag : null;
            const dragTop = drag ? ((Math.min(labelToMin(drag.start), labelToMin(drag.end)) - GRID_START) / 60) * hourH : 0;
            const dragH = drag ? (Math.abs(labelToMin(drag.end) - labelToMin(drag.start)) / 60) * hourH + hourH / 4 : 0;

            return (
              <div
                key={dayIso}
                className="relative border-l border-zinc-200/80"
                style={{ height: gridH }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void p.dropOn(p.readDrag(e), dayIso, snapLabel(minutesFromY(e.currentTarget, e.clientY)));
                }}
                onDoubleClick={(e) => {
                  if ((e.target as HTMLElement).closest('button')) return;
                  const start = snapLabel(minutesFromY(e.currentTarget, e.clientY));
                  p.openForm(dayIso, { start, end: addOneHour(start) });
                }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  if ((e.target as HTMLElement).closest('button')) return;
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  const start = snapLabel(minutesFromY(e.currentTarget, e.clientY));
                  p.setSlotDrag({ dayIso, start, end: start });
                }}
                onPointerMove={(e) => {
                  const cur = p.slotDragRef.current;
                  if (!cur || cur.dayIso !== dayIso) return;
                  p.setSlotDrag({ ...cur, end: snapLabel(minutesFromY(e.currentTarget, e.clientY)) });
                }}
                onPointerUp={(e) => {
                  const cur = p.slotDragRef.current;
                  if (!cur || cur.dayIso !== dayIso) return;
                  try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
                  const a = labelToMin(cur.start);
                  const b = labelToMin(cur.end);
                  const start = a <= b ? cur.start : cur.end;
                  const end = a <= b ? cur.end : cur.start;
                  p.setSlotDrag(null);
                  p.openForm(dayIso, { start, end: addOneHour(end) });
                }}
              >
                {HOURS.map((h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-zinc-100" style={{ top: ((h * 60 - GRID_START) / 60) * hourH, height: hourH }} />
                ))}
                {drag && (
                  <div className="pointer-events-none absolute inset-x-1 rounded bg-blue-500/15 ring-1 ring-blue-400/40" style={{ top: dragTop, height: Math.max(8, dragH) }} />
                )}
                {showNow && (
                  <div className="pointer-events-none absolute left-0 right-0 z-20" style={{ top: ((nowMin - GRID_START) / 60) * hourH }}>
                    <span className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-rose-500" />
                    <div className="h-px bg-rose-500" />
                  </div>
                )}
                {packed.map((block) => {
                  const ev = timed.find((e) => e.id === block.id);
                  if (!ev) return null;
                  const s = Math.max(GRID_START, Math.min(block.startMin, GRID_END - 15));
                  const en = Math.max(s + 15, Math.min(block.endMin, GRID_END));
                  const top = ((s - GRID_START) / 60) * hourH;
                  const height = Math.max(16, ((en - s) / 60) * hourH - 2);
                  const gap = 3;
                  const widthPct = 100 / block.cols;
                  const leftPct = (block.col / block.cols) * 100;
                  const fill = eventFill(ev.kind, ev.color);
                  const range = `${prettyTime(ev.start_time)}${ev.end_time ? ` – ${prettyTime(ev.end_time)}` : ''}`;
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      draggable
                      onDragStart={(dragEv) => p.writeDrag(dragEv, { kind: 'event', id: ev.id })}
                      onClick={() => p.openEvent(ev)}
                      onContextMenu={(ctx) => {
                        ctx.preventDefault();
                        setMenu({ id: ev.id, x: ctx.clientX, y: ctx.clientY });
                      }}
                      className="absolute z-10 overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[11px] leading-tight text-white shadow-sm"
                      style={{
                        top,
                        height,
                        left: `calc(${leftPct}% + ${block.col === 0 ? 4 : gap}px)`,
                        width: `calc(${widthPct}% - ${gap + 4}px)`,
                        background: fill,
                      }}
                      title={`${range} ${ev.title}`}
                    >
                      <div className="truncate font-semibold">{ev.title || '(No title)'}</div>
                      {height > 28 && <div className="truncate opacity-85">{range}</div>}
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

function labelToMin(label: string) {
  const [hs, ms] = label.split(':').map(Number);
  return (hs || 0) * 60 + (ms || 0);
}
