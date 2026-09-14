import { useEffect, useRef, useState } from 'react';
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

const GRID_START = 0;
const GRID_END = 24 * 60;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

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

type AllDayBar = {
  id: string;
  label: string;
  cls: string;
  startIdx: number;
  span: number;
  lane: number;
  drag: DragPayload;
  onClick?: () => void;
};

function packAllDay(items: Omit<AllDayBar, 'lane'>[]): AllDayBar[] {
  const sorted = items.slice().sort((a, b) => a.startIdx - b.startIdx || b.span - a.span);
  const lanes: number[] = [];
  return sorted.map((item) => {
    let lane = lanes.findIndex((end) => end <= item.startIdx);
    if (lane < 0) {
      lane = lanes.length;
      lanes.push(item.startIdx + item.span);
    } else {
      lanes[lane] = item.startIdx + item.span;
    }
    return { ...item, lane };
  });
}

export function WeekGrid(p: Props) {
  const hourH = p.density === 'compact' ? 40 : 52;
  const gridH = HOURS.length * hourH;
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; colorOpen?: boolean } | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const colCount = p.rangeDays.length;
  const cols = `3.25rem repeat(${colCount}, minmax(0, 1fr))`;
  const dayIsos = p.rangeDays.map((d) => iso(d));

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const now = new Date();
    const hour = Math.max(0, now.getHours() - 1);
    el.scrollTop = hour * hourH;
  }, [hourH, p.rangeDays.length]);

  const minutesFromY = (el: HTMLElement, clientY: number) => {
    const rect = el.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    return GRID_START + (y / hourH) * 60;
  };

  const allDayBars = (() => {
    const raw: Omit<AllDayBar, 'lane'>[] = [];
    const seen = new Set<string>();
    const firstIso = dayIsos[0];
    const lastIso = dayIsos[dayIsos.length - 1];
    for (const d of p.rangeDays) {
      const dayIso = iso(d);
      for (const e of p.eventsForDay(dayIso).filter((ev) => ev.all_day)) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        const startIso = e.start_date < firstIso ? firstIso : e.start_date;
        const endIso = e.end_date > lastIso ? lastIso : e.end_date;
        const startIdx = Math.max(0, dayIsos.indexOf(startIso));
        const endIdx = Math.max(startIdx, dayIsos.indexOf(endIso));
        raw.push({
          id: `ev-${e.id}`,
          label: e.title,
          cls: KIND_STYLE[e.kind] ?? KIND_STYLE.event,
          startIdx,
          span: endIdx - startIdx + 1,
          drag: { kind: 'event', id: e.id },
          onClick: () => p.openEvent(e),
        });
      }
    }
    for (let i = 0; i < p.rangeDays.length; i++) {
      const dayIso = dayIsos[i];
      for (const t of p.todosForDay(dayIso)) raw.push({ id: `td-${t.id}`, label: t.title, cls: SOURCE_STYLE.todo, startIdx: i, span: 1, drag: { kind: 'todo', id: t.id } });
      for (const t of p.kanbanForDay(dayIso)) raw.push({ id: `kb-${t.id}`, label: t.title, cls: SOURCE_STYLE.kanban, startIdx: i, span: 1, drag: { kind: 'kanban', id: t.id } });
      for (const n of p.notesForDay(dayIso)) raw.push({ id: `nt-${n.id}`, label: n.title, cls: SOURCE_STYLE.note, startIdx: i, span: 1, drag: { kind: 'note', id: n.id } });
      for (const h of p.habitsForDay(dayIso)) raw.push({ id: `hb-${h.id}`, label: h.name, cls: SOURCE_STYLE.habit, startIdx: i, span: 1, drag: { kind: 'habit', id: h.id } });
    }
    return packAllDay(raw);
  })();
  const allDayLanes = allDayBars.reduce((m, b) => Math.max(m, b.lane + 1), 1);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px] overflow-y-auto [scrollbar-gutter:stable]">
        <div style={{ display: 'grid', gridTemplateColumns: cols }}>
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
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: cols, minHeight: Math.max(28, allDayLanes * 20 + 8) }}>
          <div className="flex items-start justify-end pr-2 pt-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">All day</div>
          <div className="relative" style={{ gridColumn: `2 / span ${colCount}` }}>
            <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
              {dayIsos.map((dayIso) => (
                <div
                  key={`all-${dayIso}`}
                  className="border-l border-zinc-200/80"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); void p.dropOn(p.readDrag(e), dayIso); }}
                  onDoubleClick={() => p.openForm(dayIso)}
                />
              ))}
            </div>
            <div
              className="relative grid py-1"
              style={{
                gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${allDayLanes}, 1.15rem)`,
                rowGap: 2,
              }}
            >
              {allDayBars.map((bar) => (
                <div
                  key={bar.id}
                  draggable
                  onDragStart={(ev) => p.writeDrag(ev, bar.drag)}
                  onClick={bar.onClick}
                  className={`z-[1] mx-0.5 cursor-pointer truncate rounded px-1.5 text-[10px] leading-[1.15rem] ${bar.cls}`}
                  style={{ gridColumn: `${bar.startIdx + 1} / span ${bar.span}`, gridRow: bar.lane + 1 }}
                >
                  {bar.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div ref={scrollerRef} className="max-h-[min(32rem,calc(100vh-18rem))] overflow-auto [scrollbar-gutter:stable]">
        <div className="min-w-[640px]" style={{ display: 'grid', gridTemplateColumns: cols }}>
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
