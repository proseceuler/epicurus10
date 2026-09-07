import { useState, useEffect, useCallback, useRef } from 'react';
import { MotionCollapse, MotionOverlay } from '@/components/MotionUI';
import { DateField, TimeField } from '@/components/fields';
import { supabase } from '@/lib/supabase';
import { SUBJECTS, type Todo, type KanbanTask, type SubjectKey, type Note, type Habit, type HabitCompletion } from '@/lib/types';
import {
  getCalendarEvents,
  addCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
  seedDepEdCalendarIfNeeded,
  CALENDAR_EVENTS_UPDATED,
  type CalendarEvent,
} from '@/lib/calendarStore';
import { parseNaturalWhen } from '@/lib/parseWhen';
import { confirmDelete } from '@/lib/confirm';
import { pushScheduleToLinked, scheduleTodo, scheduleKanban } from '@/lib/calendarSync';
import { Card, PageHeader, EmptyState, Button, Input, Select } from '@/components/kit';
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, X, Trash2,
  Link2, CheckSquare, FolderTree, Sparkles,
} from 'lucide-react';

export type { CalendarEvent };

type CalView = 'month' | 'week' | 'day';
type Density = 'compact' | 'comfortable';
type DragPayload =
  | { kind: 'event'; id: string }
  | { kind: 'todo'; id: string }
  | { kind: 'kanban'; id: string }
  | { kind: 'note'; id: string }
  | { kind: 'habit'; id: string };

const KINDS = [
  { value: 'event', label: 'Event' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'exam', label: 'Exam' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'holiday', label: 'Holiday / No class' },
];

const KIND_STYLE: Record<string, string> = {
  event: 'bg-zinc-800 text-white',
  deadline: 'bg-amber-500/90 text-white',
  exam: 'bg-rose-500/85 text-white',
  reminder: 'bg-sky-500/80 text-white',
  holiday: 'bg-emerald-500/75 text-white',
};

const SOURCE_STYLE = {
  event: 'bg-zinc-800 text-white',
  todo: 'border border-sky-400/80 bg-sky-50 text-sky-800',
  kanban: 'border border-amber-400/80 bg-amber-50 text-amber-800',
  note: 'border border-violet-400/70 bg-violet-50 text-violet-800',
  habit: 'border border-emerald-400/70 bg-emerald-50 text-emerald-800',
};

const iso = (d: Date) => d.toLocaleDateString('en-CA');
const parse = (s: string) => new Date(s + 'T00:00:00');
const pad = (n: number) => String(n).padStart(2, '0');
const hm = (h: number, m = 0) => `${pad(h)}:${pad(m)}`;
const addOneHour = (label: string) => {
  const [hs, ms] = label.split(':').map(Number);
  const total = (hs || 0) * 60 + (ms || 0) + 60;
  return hm(Math.min(23, Math.floor(total / 60)), total % 60);
};
const labelToMinutes = (label: string) => {
  const [hs, ms] = label.split(':').map(Number);
  return (hs || 0) * 60 + (ms || 0);
};

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const emptyDraft = (date: string) => ({
  id: '' as string,
  title: '',
  description: '',
  start_date: date,
  end_date: date,
  all_day: true,
  start_time: '',
  end_time: '',
  kind: 'event',
  subject_key: '',
  linked_todo_id: '',
  linked_note_id: '',
  linked_habit_id: '',
  linked_kanban_id: '',
});

type Draft = ReturnType<typeof emptyDraft>;

function applyTitleParse(current: Draft, raw: string): Draft {
  const parsed = parseNaturalWhen(raw);
  const extracted = parsed.title.trim() !== raw.trim() || !parsed.all_day;
  if (!extracted) return { ...current, title: raw };
  return {
    ...current,
    title: raw,
    start_date: parsed.start_date || current.start_date,
    end_date: parsed.end_date || parsed.start_date || current.end_date,
    all_day: parsed.all_day,
    start_time: parsed.all_day ? current.start_time : (parsed.start_time || current.start_time),
    end_time: parsed.all_day ? current.end_time : (parsed.end_time || current.end_time),
  };
}

function detectedHint(title: string) {
  const parsed = parseNaturalWhen(title);
  if (parsed.title.trim() === title.trim() && parsed.all_day) return '';
  const time = parsed.all_day ? 'all day' : `${parsed.start_time || ''}${parsed.end_time ? `–${parsed.end_time}` : ''}`;
  return `Detected ${parsed.start_date} · ${time}`;
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalView>('week');
  const [density, setDensity] = useState<Density>('comfortable');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [kanban, setKanban] = useState<KanbanTask[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(iso(new Date()));
  const [draft, setDraft] = useState(emptyDraft(iso(new Date())));
  const [showForm, setShowForm] = useState(false);
  const [showLinks, setShowLinks] = useState(false);
  const [slotDrag, setSlotDrag] = useState<{ dayIso: string; start: string; end: string } | null>(null);
  const [monthDrag, setMonthDrag] = useState<{ start: string; end: string } | null>(null);
  const slotDragRef = useRef(slotDrag);
  const monthDragRef = useRef(monthDrag);
  slotDragRef.current = slotDrag;
  monthDragRef.current = monthDrag;

  const loadData = useCallback(async () => {
    const [todoRes, kanbanRes, noteRes, habitRes, doneRes] = await Promise.all([
      supabase.from('todos').select('*'),
      supabase.from('kanban_tasks').select('*'),
      supabase.from('notes').select('*').order('updated_at', { ascending: false }).limit(80),
      supabase.from('habits').select('*'),
      supabase.from('habit_completions').select('*'),
    ]);
    setTodos((todoRes.data ?? []) as Todo[]);
    setKanban((kanbanRes.data ?? []) as KanbanTask[]);
    setNotes((noteRes.data ?? []) as Note[]);
    setHabits((habitRes.data ?? []) as Habit[]);
    setCompletions((doneRes.data ?? []) as HabitCompletion[]);
    seedDepEdCalendarIfNeeded();
    setEvents(getCalendarEvents());
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const sync = () => setEvents(getCalendarEvents());
    window.addEventListener(CALENDAR_EVENTS_UPDATED, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CALENDAR_EVENTS_UPDATED, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const today = new Date();
  const todayStr = today.toDateString();
  const todayIso = iso(today);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const eventsForDay = (dayIso: string) =>
    events.filter((e) => e.start_date <= dayIso && e.end_date >= dayIso);
  const todosForDay = (dayIso: string) => todos.filter((t) => t.due_date === dayIso);
  const kanbanForDay = (dayIso: string) => kanban.filter((t) => t.due_date === dayIso && t.status !== 'done');
  const notesForDay = (dayIso: string) =>
    notes.filter((n) => (n.updated_at || '').slice(0, 10) === dayIso).slice(0, 4);
  const habitsForDay = (dayIso: string) => {
    if (dayIso !== todayIso) return [] as Habit[];
    return habits.filter((h) => !completions.some((c) => c.habit_id === h.id && c.completion_date === dayIso));
  };

  const openForm = (date: string, timed?: { start: string; end?: string }, endDate?: string) => {
    const next = emptyDraft(date);
    if (endDate) next.end_date = endDate;
    if (timed) {
      next.all_day = false;
      const start = timed.start;
      const end = timed.end || addOneHour(start);
      const sMin = labelToMinutes(start);
      const eMin = labelToMinutes(end);
      next.start_time = start;
      next.end_time = eMin > sMin ? end : addOneHour(start);
    }
    setDraft(next);
    setSelectedDay(date);
    setShowLinks(false);
    setShowForm(true);
  };

  const openEvent = (e: CalendarEvent) => {
    setDraft({
      id: e.id,
      title: e.title,
      description: e.description || '',
      start_date: e.start_date,
      end_date: e.end_date,
      all_day: e.all_day,
      start_time: e.start_time || '',
      end_time: e.end_time || '',
      kind: e.kind,
      subject_key: e.subject_key || '',
      linked_todo_id: e.linked_todo_id || '',
      linked_note_id: e.linked_note_id || '',
      linked_habit_id: e.linked_habit_id || '',
      linked_kanban_id: e.linked_kanban_id || '',
    });
    setShowLinks(Boolean(e.linked_todo_id || e.linked_note_id || e.linked_habit_id || e.linked_kanban_id));
    setShowForm(true);
  };

  const saveEvent = async () => {
    const parsed = parseNaturalWhen(draft.title);
    const title = parsed.title.trim() || draft.title.trim();
    if (!title) return;
    const startTime = draft.all_day ? null : (draft.start_time || parsed.start_time);
    const endTime = draft.all_day ? null : (draft.end_time || parsed.end_time);
    const startDate = draft.start_date || parsed.start_date;
    const payload = {
      title,
      description: draft.description,
      start_date: startDate,
      end_date: (draft.end_date < startDate ? startDate : draft.end_date) || startDate,
      all_day: draft.all_day || !startTime,
      start_time: startTime,
      end_time: endTime,
      kind: draft.kind as CalendarEvent['kind'],
      subject_key: (draft.subject_key || null) as SubjectKey | null,
      linked_todo_id: draft.linked_todo_id || null,
      linked_note_id: draft.linked_note_id || null,
      linked_habit_id: draft.linked_habit_id || null,
      linked_kanban_id: draft.linked_kanban_id || null,
    };
    const saved = draft.id ? updateCalendarEvent(draft.id, payload) : addCalendarEvent(payload);
    if (saved) await pushScheduleToLinked(saved);
    setEvents(getCalendarEvents());
    await loadData();
    setShowForm(false);
  };

  const deleteEvent = async (id: string) => {
    const ev = events.find((e) => e.id === id);
    if (!(await confirmDelete(ev?.title || 'this event'))) return;
    deleteCalendarEvent(id);
    setEvents(getCalendarEvents());
    if (draft.id === id) setShowForm(false);
  };

  const dropOn = async (payload: DragPayload | null, date: string, time?: string) => {
    if (!payload) return;
    const allDay = !time;
    const start = time || null;
    const [h, m] = (time || '09:00').split(':').map(Number);
    const end = time ? hm(Math.min(23, h + 1), m) : null;
    if (payload.kind === 'event') {
      const ev = events.find((e) => e.id === payload.id);
      if (!ev) return;
      const span = Math.max(0, (parse(ev.end_date).getTime() - parse(ev.start_date).getTime()) / 86400000);
      const endDate = iso(addDays(parse(date), span));
      const next = updateCalendarEvent(payload.id, {
        start_date: date,
        end_date: endDate,
        all_day: allDay,
        start_time: start,
        end_time: allDay ? null : (ev.end_time && !allDay ? ev.end_time : end),
      });
      if (next) await pushScheduleToLinked(next);
    } else if (payload.kind === 'todo') {
      const todo = todos.find((t) => t.id === payload.id);
      if (!todo) return;
      await scheduleTodo(todo.id, todo.title, date, allDay, start, end, todo.calendar_event_id, todo.subject_key);
    } else if (payload.kind === 'kanban') {
      const card = kanban.find((t) => t.id === payload.id);
      if (!card) return;
      await scheduleKanban(card.id, card.title, date, card.linked_event_id, card.subject_key);
      if (time) {
        const ev = getCalendarEvents().find((e) => e.linked_kanban_id === card.id);
        if (ev) {
          const next = updateCalendarEvent(ev.id, { all_day: false, start_time: start, end_time: end });
          if (next) await pushScheduleToLinked(next);
        }
      }
    } else if (payload.kind === 'note') {
      const note = notes.find((n) => n.id === payload.id);
      if (!note) return;
      addCalendarEvent({
        title: note.title, description: '', start_date: date, end_date: date,
        all_day: allDay, start_time: start, end_time: end, kind: 'reminder', subject_key: null,
        linked_todo_id: null, linked_note_id: note.id, linked_habit_id: null, linked_kanban_id: null,
      });
    } else if (payload.kind === 'habit') {
      const habit = habits.find((h) => h.id === payload.id);
      if (!habit) return;
      addCalendarEvent({
        title: habit.name, description: '', start_date: date, end_date: date,
        all_day: allDay, start_time: start, end_time: end, kind: 'reminder', subject_key: null,
        linked_todo_id: null, linked_note_id: null, linked_habit_id: habit.id, linked_kanban_id: null,
      });
    }
    setEvents(getCalendarEvents());
    await loadData();
  };

  const readDrag = (e: React.DragEvent): DragPayload | null => {
    try {
      const raw = e.dataTransfer.getData('application/x-epicure-cal') || e.dataTransfer.getData('text/plain');
      return raw ? (JSON.parse(raw) as DragPayload) : null;
    } catch {
      return null;
    }
  };
  const writeDrag = (e: React.DragEvent, payload: DragPayload) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-epicure-cal', JSON.stringify(payload));
    e.dataTransfer.setData('text/plain', JSON.stringify(payload));
  };

  const upcomingTodos = todos.filter((t) => !t.completed && t.due_date && parse(t.due_date) >= new Date(todayStr)).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')).slice(0, 10);
  const upcomingKanban = kanban.filter((t) => t.status !== 'done' && t.due_date && parse(t.due_date) >= new Date(todayStr)).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')).slice(0, 8);
  const upcomingEvents = events.filter((e) => e.end_date >= todayIso).sort((a, b) => a.start_date.localeCompare(b.start_date)).slice(0, 8);

  const stepMin = density === 'comfortable' ? 15 : 60;
  const slots: { h: number; m: number; label: string }[] = [];
  for (let h = 6; h < 22; h++) {
    for (let m = 0; m < 60; m += stepMin) slots.push({ h, m, label: hm(h, m) });
  }

  const rangeDays = view === 'day'
    ? [new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate())]
    : view === 'week'
      ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(currentDate), i))
      : [];

  const shift = (dir: number) => {
    if (view === 'month') setCurrentDate(new Date(year, month + dir, 1));
    else if (view === 'week') setCurrentDate(addDays(currentDate, dir * 7));
    else setCurrentDate(addDays(currentDate, dir));
  };

  const headerLabel = view === 'month'
    ? monthName
    : view === 'week'
      ? `Week of ${startOfWeek(currentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      : currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const hint = detectedHint(draft.title);
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (loading) {
    return <div className="flex items-center justify-center py-20"><CalendarIcon className="w-8 h-8 text-zinc-300 animate-pulse" /></div>;
  }

  const AllDayCell = ({ dayIso }: { dayIso: string }) => {
    const evs = eventsForDay(dayIso).filter((e) => e.all_day);
    const dueTodos = todosForDay(dayIso);
    const dueKanban = kanbanForDay(dayIso);
    const dayNotes = notesForDay(dayIso);
    const dayHabits = habitsForDay(dayIso);
    return (
      <div className="min-h-[52px] space-y-0.5 border-l border-zinc-100 p-1" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void dropOn(readDrag(e), dayIso); }} onDoubleClick={() => openForm(dayIso)}>
        {evs.map((e) => (
          <button key={e.id} type="button" draggable onDragStart={(ev) => writeDrag(ev, { kind: 'event', id: e.id })} onClick={() => openEvent(e)} className={`block w-full truncate rounded px-1 py-0.5 text-left text-[10px] ${KIND_STYLE[e.kind] ?? KIND_STYLE.event}`}>{e.title}</button>
        ))}
        {dueTodos.map((t) => (
          <div key={`td-${t.id}`} draggable onDragStart={(ev) => writeDrag(ev, { kind: 'todo', id: t.id })} className={`truncate rounded px-1 py-0.5 text-[10px] ${SOURCE_STYLE.todo} ${t.completed ? 'line-through opacity-50' : ''}`}>To-do · {t.title}</div>
        ))}
        {dueKanban.map((t) => (
          <div key={`kb-${t.id}`} draggable onDragStart={(ev) => writeDrag(ev, { kind: 'kanban', id: t.id })} className={`truncate rounded px-1 py-0.5 text-[10px] ${SOURCE_STYLE.kanban}`}>Board · {t.title}</div>
        ))}
        {dayNotes.map((n) => (
          <div key={`nt-${n.id}`} draggable onDragStart={(ev) => writeDrag(ev, { kind: 'note', id: n.id })} className={`truncate rounded px-1 py-0.5 text-[10px] ${SOURCE_STYLE.note}`}>Note · {n.title}</div>
        ))}
        {dayHabits.map((h) => (
          <div key={`hb-${h.id}`} draggable onDragStart={(ev) => writeDrag(ev, { kind: 'habit', id: h.id })} className={`truncate rounded px-1 py-0.5 text-[10px] ${SOURCE_STYLE.habit}`}>Habit · {h.name}</div>
        ))}
      </div>
    );
  };

  const inSlotRange = (dayIso: string, label: string) => {
    if (!slotDrag || slotDrag.dayIso !== dayIso) return false;
    const a = labelToMinutes(slotDrag.start);
    const b = labelToMinutes(slotDrag.end);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const t = labelToMinutes(label);
    return t >= lo && t <= hi;
  };

  const TimedCell = ({ dayIso, label }: { dayIso: string; label: string }) => {
    const rowH = density === 'compact' ? 'min-h-[22px]' : 'min-h-[32px]';
    const selected = inSlotRange(dayIso, label);
    return (
      <div
        className={`${rowH} border-l border-t border-zinc-100 p-0.5 select-none ${selected ? 'bg-zinc-900/10' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void dropOn(readDrag(e), dayIso, label); }}
        onDoubleClick={() => openForm(dayIso, { start: label })}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if ((e.target as HTMLElement).closest('button')) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setSlotDrag({ dayIso, start: label, end: label });
        }}
        onPointerEnter={() => {
          const cur = slotDragRef.current;
          if (!cur || cur.dayIso !== dayIso) return;
          setSlotDrag({ ...cur, end: label });
        }}
        onPointerUp={(e) => {
          const cur = slotDragRef.current;
          if (!cur || cur.dayIso !== dayIso) return;
          try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
          const a = labelToMinutes(cur.start);
          const b = labelToMinutes(cur.end);
          const start = a <= b ? cur.start : cur.end;
          const end = a <= b ? cur.end : cur.start;
          setSlotDrag(null);
          openForm(dayIso, { start, end: addOneHour(end) });
        }}
      />
    );
  };

  return (
    <div>
      <PageHeader title="Calendar" action={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-white/70 p-0.5">
            {(['month', 'week', 'day'] as CalView[]).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)} className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize ${view === v ? 'bg-zinc-900 text-white' : 'text-zinc-600'}`}>{v}</button>
            ))}
          </div>
          {view !== 'month' && (
            <div className="flex rounded-xl bg-white/70 p-0.5">
              {(['compact', 'comfortable'] as Density[]).map((d) => (
                <button key={d} type="button" onClick={() => setDensity(d)} className={`rounded-lg px-2 py-1 text-xs capitalize ${density === d ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>{d === 'compact' ? 'Compact' : 'Comfortable'}</button>
              ))}
            </div>
          )}
          <Button onClick={() => openForm(selectedDay || todayIso)}><Plus className="w-4 h-4" /> New event</Button>
        </div>
      } />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-zinc-800">{headerLabel}</h3>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => shift(-1)} className="rounded-lg p-1.5 hover:bg-zinc-200/50"><ChevronLeft className="h-4 w-4 text-zinc-600" /></button>
                <button type="button" onClick={() => setCurrentDate(new Date())} className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200/50">Today</button>
                <button type="button" onClick={() => shift(1)} className="rounded-lg p-1.5 hover:bg-zinc-200/50"><ChevronRight className="h-4 w-4 text-zinc-600" /></button>
              </div>
            </div>
            {view === 'month' && (
              <>
                <div className="mb-1 grid grid-cols-7 gap-1">{weekDays.map((d) => <div key={d} className="py-1 text-center text-xs font-medium text-zinc-400">{d}</div>)}</div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dayDate = new Date(year, month, day);
                    const dayIso = iso(dayDate);
                    const isToday = dayDate.toDateString() === todayStr;
                    const isSelected = selectedDay === dayIso;
                    const dayEvents = eventsForDay(dayIso);
                    const due = [...todosForDay(dayIso), ...kanbanForDay(dayIso)];
                    return (
                      <button key={day} type="button"
                        onClick={() => setSelectedDay(dayIso)}
                        onDoubleClick={() => openForm(dayIso)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); void dropOn(readDrag(e), dayIso); }}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
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
                          if (a !== b) openForm(a, undefined, b);
                        }}
                        className={`min-h-[72px] rounded-xl border p-1 text-left text-xs ${
                          (monthDrag && dayIso >= (monthDrag.start <= monthDrag.end ? monthDrag.start : monthDrag.end) && dayIso <= (monthDrag.start <= monthDrag.end ? monthDrag.end : monthDrag.start))
                            ? 'border-zinc-800 bg-zinc-900/10'
                            : isSelected ? 'border-zinc-800 bg-white/70' : isToday ? 'border-zinc-800 bg-zinc-100/50' : 'border-zinc-200/30 hover:bg-white/40'
                        }`}>
                        <div className={`text-right font-medium ${isToday ? 'text-zinc-900' : 'text-zinc-500'}`}>{day}</div>
                        {dayEvents.slice(0, 2).map((e) => <div key={e.id} className={`mt-0.5 truncate rounded px-1 py-0.5 text-[10px] ${KIND_STYLE[e.kind] ?? KIND_STYLE.event}`}>{e.title}</div>)}
                        {due.slice(0, 2).map((d) => <div key={d.id} className="mt-0.5 truncate rounded bg-zinc-200/70 px-1 py-0.5 text-[10px] text-zinc-600">{d.title}</div>)}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {(view === 'week' || view === 'day') && (
              <div className="overflow-x-auto">
                <div className="min-w-[560px]" style={{ display: 'grid', gridTemplateColumns: `3.25rem repeat(${rangeDays.length}, minmax(0, 1fr))` }}>
                  <div />
                  {rangeDays.map((d) => {
                    const dayIso = iso(d);
                    return (
                      <button key={dayIso} type="button" onClick={() => setSelectedDay(dayIso)} onDoubleClick={() => openForm(dayIso)} className={`px-1 pb-2 text-center text-xs font-medium ${d.toDateString() === todayStr ? 'text-zinc-900' : 'text-zinc-500'}`}>
                        {d.toLocaleDateString('en-US', { weekday: 'short' })} {d.getDate()}
                      </button>
                    );
                  })}
                  <div className="flex items-end pb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">All day</div>
                  {rangeDays.map((d) => <AllDayCell key={`all-${iso(d)}`} dayIso={iso(d)} />)}
                </div>
                <div className={density === 'compact' ? 'overflow-hidden' : 'max-h-[28rem] overflow-y-auto'} style={density === 'compact' ? { maxHeight: 'min(26rem, calc(100vh - 22rem))' } : undefined}>
                  <div className="min-w-[560px]" style={{ display: 'grid', gridTemplateColumns: `3.25rem repeat(${rangeDays.length}, minmax(0, 1fr))` }}>
                    {slots.map((slot) => (
                      <div key={slot.label} className="contents">
                        <div className={`border-t border-zinc-100 pr-1 text-right text-[10px] text-zinc-400 ${density === 'compact' ? 'h-[22px] leading-[22px]' : 'h-8 leading-8'}`}>{slot.m === 0 ? slot.label : ''}</div>
                        {rangeDays.map((d) => <TimedCell key={`${iso(d)}-${slot.label}`} dayIso={iso(d)} label={slot.label} />)}
                      </div>
                    ))}
                    {rangeDays.map((d, di) => {
                      const dayIso = iso(d);
                      const rowH = density === 'compact' ? 22 : 32;
                      const gridStart = 6 * 60;
                      const gridEnd = 22 * 60;
                      const timed = eventsForDay(dayIso).filter((e) => !e.all_day);
                      return (
                        <div
                          key={`overlay-${dayIso}`}
                          className="pointer-events-none relative"
                          style={{ gridColumn: di + 2, gridRow: `1 / span ${slots.length}` }}
                        >
                          {timed.map((e) => {
                            const start = labelToMinutes((e.start_time || '06:00').slice(0, 5));
                            const rawEnd = e.end_time ? labelToMinutes(e.end_time.slice(0, 5)) : start + 60;
                            const s = Math.max(gridStart, Math.min(start, gridEnd - 15));
                            const en = Math.max(s + 15, Math.min(rawEnd <= start ? start + 60 : rawEnd, gridEnd));
                            const top = ((s - gridStart) / stepMin) * rowH;
                            const height = Math.max(rowH - 2, ((en - s) / stepMin) * rowH - 2);
                            return (
                              <button
                                key={e.id}
                                type="button"
                                draggable
                                onDragStart={(ev) => writeDrag(ev, { kind: 'event', id: e.id })}
                                onClick={() => openEvent(e)}
                                className={`pointer-events-auto absolute left-0.5 right-0.5 z-10 overflow-hidden rounded px-1 py-0.5 text-left text-[10px] leading-tight ${KIND_STYLE[e.kind] ?? KIND_STYLE.event}`}
                                style={{ top, height }}
                                title={`${(e.start_time || '').slice(0, 5)}${e.end_time ? `–${e.end_time.slice(0, 5)}` : ''} ${e.title}`}
                              >
                                <span className="font-medium">{e.title}</span>
                                <span className="ml-1 opacity-70">{(e.start_time || '').slice(0, 5)}{e.end_time ? `–${e.end_time.slice(0, 5)}` : ''}</span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="mb-1 font-semibold text-zinc-800">Upcoming</h3>
            <p className="mb-3 text-[11px] text-zinc-400">Drag onto the grid to time-block.</p>
            <div className="space-y-1.5">
              {upcomingEvents.map((e) => (
                <div key={e.id} draggable onDragStart={(ev) => writeDrag(ev, { kind: 'event', id: e.id })} onClick={() => { setCurrentDate(parse(e.start_date)); setSelectedDay(e.start_date); openEvent(e); }} className="flex cursor-grab items-center gap-2 rounded-lg p-2 hover:bg-white/50">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${e.kind === 'exam' ? 'bg-rose-500' : e.kind === 'deadline' ? 'bg-amber-500' : 'bg-zinc-700'}`} />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-zinc-700">{e.title}</p><p className="text-[11px] text-zinc-400">{e.start_date}{e.start_time ? ` · ${e.start_time}` : ' · all day'}</p></div>
                </div>
              ))}
              {upcomingTodos.map((t) => (
                <div key={`ut-${t.id}`} draggable onDragStart={(ev) => writeDrag(ev, { kind: 'todo', id: t.id })} className="flex cursor-grab items-center gap-2 rounded-lg p-2 hover:bg-white/50">
                  <CheckSquare className="h-3.5 w-3.5 shrink-0 text-sky-600" />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-zinc-700">{t.title}</p><p className="text-[11px] text-sky-700/80">To-do · {t.due_date}</p></div>
                </div>
              ))}
              {upcomingKanban.map((t) => (
                <div key={`uk-${t.id}`} draggable onDragStart={(ev) => writeDrag(ev, { kind: 'kanban', id: t.id })} className="flex cursor-grab items-center gap-2 rounded-lg p-2 hover:bg-white/50">
                  <FolderTree className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-zinc-700">{t.title}</p><p className="text-[11px] text-amber-700/80">Kanban · {t.due_date}</p></div>
                </div>
              ))}
              {upcomingEvents.length + upcomingTodos.length + upcomingKanban.length === 0 && (
                <EmptyState icon={CalendarIcon} title="Nothing upcoming" subtitle="Add a due date or event." />
              )}
            </div>
          </Card>
        </div>
      </div>
      <MotionOverlay open={showForm} onClose={() => setShowForm(false)}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-zinc-800">{draft.id ? 'Edit event' : 'New event'}</h3>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg p-1 hover:bg-zinc-200/60"><X className="h-4 w-4 text-zinc-500" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <Input value={draft.title} onChange={(v) => setDraft(applyTitleParse(draft, v))} placeholder="Chemistry Exam 2pm to 4pm on Sept 17" />
                {hint && <p className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500"><Sparkles className="h-3 w-3" /> {hint}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1 block text-xs text-zinc-500">Starts</label><DateField value={draft.start_date} onChange={(v) => setDraft({ ...draft, start_date: v, end_date: draft.end_date < v ? v : draft.end_date })} /></div>
                <div><label className="mb-1 block text-xs text-zinc-500">Ends</label><DateField value={draft.end_date} onChange={(v) => setDraft({ ...draft, end_date: v })} /></div>
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-600"><input type="checkbox" checked={draft.all_day} onChange={(e) => setDraft({ ...draft, all_day: e.target.checked })} /> All day</label>
              {!draft.all_day && (
                <div className="grid grid-cols-2 gap-3">
                  <TimeField value={draft.start_time} onChange={(v) => setDraft({ ...draft, start_time: v })} />
                  <TimeField value={draft.end_time} onChange={(v) => setDraft({ ...draft, end_time: v })} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Select value={draft.kind} onChange={(v) => setDraft({ ...draft, kind: v })} options={KINDS} />
                <Select value={draft.subject_key} onChange={(v) => setDraft({ ...draft, subject_key: v })} options={[{ value: '', label: 'No subject' }, ...SUBJECTS.map((s) => ({ value: s.key, label: s.name }))]} />
              </div>
              <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Details (optional)" rows={2} className="glass-input w-full resize-none rounded-xl px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400" />
              <div>
                <button type="button" onClick={() => setShowLinks((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100">
                  <Link2 className="h-3.5 w-3.5" /> {showLinks ? 'Hide linked items' : 'Link an existing item'}
                </button>
                <MotionCollapse open={showLinks}>
                  <div className="mt-2 space-y-2">
                    <Select value={draft.linked_todo_id} onChange={(v) => setDraft({ ...draft, linked_todo_id: v })} options={[{ value: '', label: 'To-do…' }, ...todos.map((t) => ({ value: t.id, label: t.title }))]} />
                    <Select value={draft.linked_kanban_id} onChange={(v) => setDraft({ ...draft, linked_kanban_id: v })} options={[{ value: '', label: 'Kanban card…' }, ...kanban.map((t) => ({ value: t.id, label: t.title }))]} />
                    <Select value={draft.linked_note_id} onChange={(v) => setDraft({ ...draft, linked_note_id: v })} options={[{ value: '', label: 'Note…' }, ...notes.map((n) => ({ value: n.id, label: n.title }))]} />
                    <Select value={draft.linked_habit_id} onChange={(v) => setDraft({ ...draft, linked_habit_id: v })} options={[{ value: '', label: 'Habit…' }, ...habits.map((h) => ({ value: h.id, label: h.name }))]} />
                  </div>
                </MotionCollapse>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                {draft.id && <Button variant="ghost" onClick={() => void deleteEvent(draft.id)}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>}
                <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button onClick={() => void saveEvent()}>Save</Button>
              </div>
            </div>
      </MotionOverlay>
    </div>
  );
}
