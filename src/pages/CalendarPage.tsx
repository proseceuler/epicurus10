import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { type Todo, type KanbanTask, type SubjectKey, type Note, type Habit, type HabitCompletion } from '@/lib/types';
import {
  getCalendarEvents, addCalendarEvent, deleteCalendarEvent, updateCalendarEvent,
  seedDepEdCalendarIfNeeded, CALENDAR_EVENTS_UPDATED, type CalendarEvent,
} from '@/lib/calendarStore';
import { parseNaturalWhen } from '@/lib/parseWhen';
import { confirmDelete } from '@/lib/confirm';
import { pushScheduleToLinked, scheduleTodo, scheduleKanban } from '@/lib/calendarSync';
import { Card, PageHeader, EmptyState, Button } from '@/components/kit';
import { KIND_STYLE } from '@/lib/calendarTheme';
import { iso, parse, hm, addOneHour, startOfWeek, addDays, emptyDraft, type CalView, type Density, type DragPayload } from '@/pages/calendar/model';
import { WeekGrid } from '@/pages/calendar/WeekGrid';
import { EventForm } from '@/pages/calendar/EventForm';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, CheckSquare, FolderTree } from 'lucide-react';

export type { CalendarEvent };

function labelToEnd(start: string, end: string) {
  const [hs, ms] = start.split(':').map(Number);
  const [he, me] = end.split(':').map(Number);
  const s = (hs || 0) * 60 + (ms || 0);
  const e = (he || 0) * 60 + (me || 0);
  return e > s ? end : addOneHour(start);
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

  useEffect(() => { void loadData(); }, [loadData]);
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

  const eventsForDay = (dayIso: string) => events.filter((e) => e.start_date <= dayIso && e.end_date >= dayIso);
  const todosForDay = (dayIso: string) => todos.filter((t) => t.due_date === dayIso);
  const kanbanForDay = (dayIso: string) => kanban.filter((t) => t.due_date === dayIso && t.status !== 'done');
  const notesForDay = (dayIso: string) => notes.filter((n) => (n.updated_at || '').slice(0, 10) === dayIso).slice(0, 4);
  const habitsForDay = (dayIso: string) => dayIso !== todayIso ? [] as Habit[] : habits.filter((h) => !completions.some((c) => c.habit_id === h.id && c.completion_date === dayIso));

  const openForm = (date: string, timed?: { start: string; end?: string }, endDate?: string) => {
    const next = emptyDraft(date);
    if (endDate) next.end_date = endDate;
    if (timed) {
      next.all_day = false;
      next.start_time = timed.start;
      next.end_time = labelToEnd(timed.start, timed.end || addOneHour(timed.start));
    }
    setDraft(next);
    setSelectedDay(date);
    setShowLinks(false);
    setShowForm(true);
  };

  const openEvent = (e: CalendarEvent) => {
    setDraft({
      id: e.id, title: e.title, description: e.description || '',
      start_date: e.start_date, end_date: e.end_date, all_day: e.all_day,
      start_time: e.start_time || '', end_time: e.end_time || '',
      kind: e.kind, subject_key: e.subject_key || '',
      linked_todo_id: e.linked_todo_id || '', linked_note_id: e.linked_note_id || '',
      linked_habit_id: e.linked_habit_id || '', linked_kanban_id: e.linked_kanban_id || '',
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
      title, description: draft.description,
      start_date: startDate,
      end_date: (draft.end_date < startDate ? startDate : draft.end_date) || startDate,
      all_day: draft.all_day || !startTime,
      start_time: startTime, end_time: endTime,
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
      const next = updateCalendarEvent(payload.id, {
        start_date: date, end_date: iso(addDays(parse(date), span)),
        all_day: allDay, start_time: start, end_time: allDay ? null : (ev.end_time && !allDay ? ev.end_time : end),
      });
      if (next) await pushScheduleToLinked(next);
    } else if (payload.kind === 'todo') {
      const todo = todos.find((t) => t.id === payload.id);
      if (todo) await scheduleTodo(todo.id, todo.title, date, allDay, start, end, todo.calendar_event_id, todo.subject_key);
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
      if (note) addCalendarEvent({ title: note.title, description: '', start_date: date, end_date: date, all_day: allDay, start_time: start, end_time: end, kind: 'reminder', subject_key: null, linked_todo_id: null, linked_note_id: note.id, linked_habit_id: null, linked_kanban_id: null });
    } else if (payload.kind === 'habit') {
      const habit = habits.find((h) => h.id === payload.id);
      if (habit) addCalendarEvent({ title: habit.name, description: '', start_date: date, end_date: date, all_day: allDay, start_time: start, end_time: end, kind: 'reminder', subject_key: null, linked_todo_id: null, linked_note_id: null, linked_habit_id: habit.id, linked_kanban_id: null });
    }
    setEvents(getCalendarEvents());
    await loadData();
  };

  const readDrag = (e: React.DragEvent): DragPayload | null => {
    try {
      const raw = e.dataTransfer.getData('application/x-epicure-cal') || e.dataTransfer.getData('text/plain');
      return raw ? (JSON.parse(raw) as DragPayload) : null;
    } catch { return null; }
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
  for (let h = 6; h < 22; h++) for (let m = 0; m < 60; m += stepMin) slots.push({ h, m, label: hm(h, m) });

  const rangeDays = view === 'day'
    ? [new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate())]
    : view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(currentDate), i)) : [];

  const shift = (dir: number) => {
    if (view === 'month') setCurrentDate(new Date(year, month + dir, 1));
    else if (view === 'week') setCurrentDate(addDays(currentDate, dir * 7));
    else setCurrentDate(addDays(currentDate, dir));
  };

  const headerLabel = view === 'month' ? currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : view === 'week' ? `Week of ${startOfWeek(currentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  if (loading) return <div className="flex items-center justify-center py-20"><CalendarIcon className="w-8 h-8 text-zinc-300 animate-pulse" /></div>;

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
                <div className="mb-1 grid grid-cols-7 gap-1">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => <div key={d} className="py-1 text-center text-xs font-medium text-zinc-400">{d}</div>)}</div>
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
                    const lo = monthDrag ? (monthDrag.start <= monthDrag.end ? monthDrag.start : monthDrag.end) : '';
                    const hi = monthDrag ? (monthDrag.start <= monthDrag.end ? monthDrag.end : monthDrag.start) : '';
                    return (
                      <button key={day} type="button"
                        onClick={() => setSelectedDay(dayIso)}
                        onDoubleClick={() => openForm(dayIso)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); void dropOn(readDrag(e), dayIso); }}
                        onPointerDown={(e) => { if (e.button !== 0) return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setMonthDrag({ start: dayIso, end: dayIso }); }}
                        onPointerEnter={() => { const cur = monthDragRef.current; if (!cur) return; setMonthDrag({ ...cur, end: dayIso }); }}
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
                        className={`min-h-[72px] rounded-xl border p-1 text-left text-xs ${monthDrag && dayIso >= lo && dayIso <= hi ? 'border-zinc-800 bg-zinc-900/10' : isSelected ? 'border-zinc-800 bg-white/70' : isToday ? 'border-zinc-800 bg-zinc-100/50' : 'border-zinc-200/30 hover:bg-white/40'}`}>
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
              <WeekGrid
                rangeDays={rangeDays} slots={slots} density={density}
                eventsForDay={eventsForDay} todosForDay={todosForDay} kanbanForDay={kanbanForDay}
                notesForDay={notesForDay} habitsForDay={habitsForDay}
                slotDrag={slotDrag} slotDragRef={slotDragRef} setSlotDrag={setSlotDrag}
                openForm={openForm} openEvent={openEvent} dropOn={dropOn}
                readDrag={readDrag} writeDrag={writeDrag} setSelectedDay={setSelectedDay} todayStr={todayStr}
              />
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
                  <span className={`h-2 w-2 shrink-0 rounded-full ${e.kind === 'exam' ? 'bg-zinc-900' : e.kind === 'deadline' ? 'bg-zinc-600' : 'bg-zinc-700'}`} />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-zinc-700">{e.title}</p><p className="text-[11px] text-zinc-400">{e.start_date}{e.start_time ? ` \u00b7 ${e.start_time}` : ' \u00b7 all day'}</p></div>
                </div>
              ))}
              {upcomingTodos.map((t) => (
                <div key={`ut-${t.id}`} draggable onDragStart={(ev) => writeDrag(ev, { kind: 'todo', id: t.id })} className="flex cursor-grab items-center gap-2 rounded-lg p-2 hover:bg-white/50">
                  <CheckSquare className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-zinc-700">{t.title}</p><p className="text-[11px] text-zinc-500">To-do \u00b7 {t.due_date}</p></div>
                </div>
              ))}
              {upcomingKanban.map((t) => (
                <div key={`uk-${t.id}`} draggable onDragStart={(ev) => writeDrag(ev, { kind: 'kanban', id: t.id })} className="flex cursor-grab items-center gap-2 rounded-lg p-2 hover:bg-white/50">
                  <FolderTree className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-zinc-700">{t.title}</p><p className="text-[11px] text-zinc-500">Kanban \u00b7 {t.due_date}</p></div>
                </div>
              ))}
              {upcomingEvents.length + upcomingTodos.length + upcomingKanban.length === 0 && (
                <EmptyState icon={CalendarIcon} title="Nothing upcoming" subtitle="Add a due date or event." />
              )}
            </div>
          </Card>
        </div>
      </div>
      <EventForm
        open={showForm} draft={draft} setDraft={setDraft}
        showLinks={showLinks} setShowLinks={setShowLinks}
        todos={todos} kanban={kanban} notes={notes} habits={habits}
        onClose={() => setShowForm(false)}
        onSave={() => void saveEvent()}
        onDelete={(id) => void deleteEvent(id)}
      />
    </div>
  );
}
