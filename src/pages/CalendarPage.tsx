import { useState, useEffect, useCallback } from 'react';
import { MotionOverlay } from '@/components/MotionUI';
import { DateField, TimeField } from '@/components/fields';
import { supabase } from '@/lib/supabase';
import { SUBJECTS, type Todo, type KanbanTask, type SubjectKey } from '@/lib/types';
import {
  getCalendarEvents, addCalendarEvent, deleteCalendarEvent, updateCalendarEvent,
  seedDepEdCalendarIfNeeded, CALENDAR_EVENTS_UPDATED, type CalendarEvent,
} from '@/lib/calendarStore';
import { confirmDelete } from '@/lib/confirm';
import { Card, PageHeader, Button, Input, Select } from '@/components/kit';
import { KINDS, KIND_STYLE, SOURCE_STYLE } from '@/lib/calendarTheme';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, X, Trash2 } from 'lucide-react';

export type { CalendarEvent };

type CalView = 'month' | 'week' | 'day';
const iso = (d: Date) => d.toLocaleDateString('en-CA');
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate() - x.getDay()); return x; };

const emptyDraft = (date: string) => ({
  id: '', title: '', description: '', start_date: date, end_date: date,
  all_day: true, start_time: '', end_time: '', kind: 'event', subject_key: '',
});

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalView>('week');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [kanban, setKanban] = useState<KanbanTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(iso(new Date()));
  const [draft, setDraft] = useState(emptyDraft(iso(new Date())));
  const [showForm, setShowForm] = useState(false);

  const loadData = useCallback(async () => {
    const [todoRes, kanbanRes] = await Promise.all([
      supabase.from('todos').select('*'),
      supabase.from('kanban_tasks').select('*'),
    ]);
    setTodos((todoRes.data ?? []) as Todo[]);
    setKanban((kanbanRes.data ?? []) as KanbanTask[]);
    seedDepEdCalendarIfNeeded();
    setEvents(getCalendarEvents());
    setLoading(false);
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => {
    const sync = () => setEvents(getCalendarEvents());
    window.addEventListener(CALENDAR_EVENTS_UPDATED, sync);
    return () => window.removeEventListener(CALENDAR_EVENTS_UPDATED, sync);
  }, []);

  const today = new Date();
  const todayStr = today.toDateString();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const eventsForDay = (dayIso: string) => events.filter((e) => e.start_date <= dayIso && e.end_date >= dayIso);

  const openForm = (date: string) => { setDraft(emptyDraft(date)); setSelectedDay(date); setShowForm(true); };
  const openEvent = (e: CalendarEvent) => {
    setDraft({
      id: e.id, title: e.title, description: e.description || '',
      start_date: e.start_date, end_date: e.end_date, all_day: e.all_day,
      start_time: e.start_time || '', end_time: e.end_time || '',
      kind: e.kind, subject_key: e.subject_key || '',
    });
    setShowForm(true);
  };

  const saveEvent = async () => {
    const title = draft.title.trim();
    if (!title) return;
    const payload = {
      title, description: draft.description,
      start_date: draft.start_date,
      end_date: draft.end_date < draft.start_date ? draft.start_date : draft.end_date,
      all_day: draft.all_day || !draft.start_time,
      start_time: draft.all_day ? null : draft.start_time || null,
      end_time: draft.all_day ? null : draft.end_time || null,
      kind: draft.kind as CalendarEvent['kind'],
      subject_key: (draft.subject_key || null) as SubjectKey | null,
      linked_todo_id: null, linked_note_id: null, linked_habit_id: null, linked_kanban_id: null,
    };
    if (draft.id) updateCalendarEvent(draft.id, payload);
    else addCalendarEvent(payload);
    setEvents(getCalendarEvents());
    setShowForm(false);
  };

  const deleteEvent = async (id: string) => {
    const ev = events.find((e) => e.id === id);
    if (!(await confirmDelete(ev?.title || 'this event'))) return;
    deleteCalendarEvent(id);
    setEvents(getCalendarEvents());
    setShowForm(false);
  };

  const shift = (dir: number) => {
    if (view === 'month') setCurrentDate(new Date(year, month + dir, 1));
    else if (view === 'week') setCurrentDate(addDays(currentDate, dir * 7));
    else setCurrentDate(addDays(currentDate, dir));
  };

  const rangeDays = view === 'day'
    ? [new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate())]
    : view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(currentDate), i))
    : [];

  const headerLabel = view === 'month' ? monthName
    : view === 'week' ? `Week of ${startOfWeek(currentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  if (loading) return <div className="flex items-center justify-center py-20"><CalendarIcon className="h-8 w-8 animate-pulse text-zinc-300" /></div>;

  return (
    <div>
      <PageHeader title="Calendar" action={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-white/70 p-0.5">
            {(['month', 'week', 'day'] as CalView[]).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)} className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize ${view === v ? 'bg-zinc-900 text-white' : 'text-zinc-600'}`}>{v}</button>
            ))}
          </div>
          <Button onClick={() => openForm(selectedDay)}><Plus className="h-4 w-4" /> New event</Button>
        </div>
      } />
      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-zinc-800">{headerLabel}</h3>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => shift(-1)} className="rounded-lg p-1.5 hover:bg-zinc-200/50"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => setCurrentDate(new Date())} className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200/50">Today</button>
            <button type="button" onClick={() => shift(1)} className="rounded-lg p-1.5 hover:bg-zinc-200/50"><ChevronRight className="h-4 w-4" /></button>
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
                const dayEvents = eventsForDay(dayIso);
                return (
                  <button key={day} type="button" onClick={() => setSelectedDay(dayIso)} onDoubleClick={() => openForm(dayIso)}
                    className={`min-h-[72px] rounded-xl border p-1 text-left text-xs ${selectedDay === dayIso ? 'border-zinc-800 bg-white/70' : isToday ? 'border-zinc-800 bg-zinc-100/50' : 'border-zinc-200/30 hover:bg-white/40'}`}>
                    <div className={`text-right font-medium ${isToday ? 'text-zinc-900' : 'text-zinc-500'}`}>{day}</div>
                    {dayEvents.slice(0, 3).map((e) => (
                      <div key={e.id} onClick={(ev) => { ev.stopPropagation(); openEvent(e); }} className={`mt-0.5 truncate rounded px-1 py-0.5 text-[10px] ${KIND_STYLE[e.kind] ?? KIND_STYLE.event}`}>{e.title}</div>
                    ))}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {(view === 'week' || view === 'day') && (
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${rangeDays.length}, minmax(0, 1fr))` }}>
            {rangeDays.map((d) => {
              const dayIso = iso(d);
              return (
                <div key={dayIso} className="min-h-[220px] rounded-xl border border-zinc-200/60 p-2">
                  <button type="button" onClick={() => setSelectedDay(dayIso)} onDoubleClick={() => openForm(dayIso)} className={`mb-2 w-full text-left text-xs font-medium ${d.toDateString() === todayStr ? 'text-zinc-900' : 'text-zinc-500'}`}>
                    {d.toLocaleDateString('en-US', { weekday: 'short' })} {d.getDate()}
                  </button>
                  {eventsForDay(dayIso).map((e) => (
                    <button key={e.id} type="button" onClick={() => openEvent(e)} className={`mb-1 block w-full truncate rounded px-1.5 py-1 text-left text-[11px] ${KIND_STYLE[e.kind] ?? KIND_STYLE.event}`}>
                      {e.title}{e.start_time ? ` · ${e.start_time}` : ''}
                    </button>
                  ))}
                  {todos.filter((t) => t.due_date === dayIso).map((t) => (
                    <div key={t.id} className={`mb-1 truncate rounded px-1.5 py-1 text-[11px] ${SOURCE_STYLE.todo}`}>To-do · {t.title}</div>
                  ))}
                  {kanban.filter((t) => t.due_date === dayIso && t.status !== 'done').map((t) => (
                    <div key={t.id} className={`mb-1 truncate rounded px-1.5 py-1 text-[11px] ${SOURCE_STYLE.kanban}`}>Board · {t.title}</div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <MotionOverlay open={showForm} onClose={() => setShowForm(false)}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-zinc-800">{draft.id ? 'Edit event' : 'New event'}</h3>
          <button type="button" onClick={() => setShowForm(false)} className="rounded-lg p-1 hover:bg-zinc-200/60"><X className="h-4 w-4 text-zinc-500" /></button>
        </div>
        <div className="space-y-3">
          <Input value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} placeholder="Event title" />
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
