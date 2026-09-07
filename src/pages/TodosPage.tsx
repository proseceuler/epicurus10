import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { listItemMotion, motionTransition } from '@/lib/motion';
import { supabase } from '@/lib/supabase';
import { awardXP } from '@/lib/xp';
import { SUBJECTS, type Todo, type SubjectKey } from '@/lib/types';
import { upsertLinkedCalendarEvent, deleteCalendarEvent } from '@/lib/calendarStore';
import { parseNaturalWhen } from '@/lib/parseWhen';
import { Card, PageHeader, Button, Input, Select, EmptyState, SubjectBadge } from '@/components/kit';
import { MotionOverlay } from '@/components/MotionUI';
import { CheckSquare, Plus, Trash2, Check, Circle, AlertCircle, Flag, Pencil } from 'lucide-react';

const PRIORITY_CONFIG = {
  urgent_important: { label: 'Urgent & Important', short: 'Do First', tone: 'high' as const, quadrant: 1 },
  not_urgent_important: { label: 'Important, Not Urgent', short: 'Schedule', tone: 'mid' as const, quadrant: 2 },
  urgent_not_important: { label: 'Urgent, Not Important', short: 'Delegate', tone: 'low' as const, quadrant: 3 },
  not_urgent_not_important: { label: 'Not Urgent or Important', short: 'Eliminate', tone: 'default' as const, quadrant: 4 },
} as const;

type PriorityKey = keyof typeof PRIORITY_CONFIG;
type Filter = 'all' | 'active' | 'completed' | PriorityKey;
const emptyForm = {
  title: '', subject_key: '', due_date: '', priority: 'not_urgent_important' as PriorityKey,
  all_day: true, start_time: '', end_time: '', notes: '',
};

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [form, setForm] = useState(emptyForm);
  const reduceMotion = useReducedMotion();

  const openEdit = (todo?: Todo) => {
    if (todo) {
      setEditing(todo);
      setForm({
        title: todo.title, subject_key: todo.subject_key || '', due_date: todo.due_date || '',
        priority: todo.priority as PriorityKey, all_day: todo.all_day !== false && !todo.start_time,
        start_time: todo.start_time || '', end_time: todo.end_time || '', notes: todo.notes || '',
      });
    } else { setEditing(null); setForm(emptyForm); }
    setShowForm(true);
  };

  const persistCalendar = (todo: Todo) => {
    const eventId = upsertLinkedCalendarEvent({
      existingId: todo.calendar_event_id, title: todo.title, date: todo.due_date,
      all_day: todo.all_day !== false && !todo.start_time, start_time: todo.start_time ?? null,
      end_time: todo.end_time ?? null, subject_key: todo.subject_key, kind: 'deadline', linked_todo_id: todo.id,
    });
    if (eventId !== todo.calendar_event_id) void supabase.from('todos').update({ calendar_event_id: eventId }).eq('id', todo.id);
  };

  const loadTodos = useCallback(async () => {
    const { data } = await supabase.from('todos').select('*').order('created_at', { ascending: false });
    if (data) setTodos(data as Todo[]);
    setLoading(false);
  }, []);
  useEffect(() => { loadTodos(); }, [loadTodos]);

  const saveTodo = async () => {
    if (!form.title.trim()) return;
    const parsed = parseNaturalWhen(form.title);
    const payload = {
      title: parsed.title || form.title.trim(), subject_key: form.subject_key || null,
      due_date: form.due_date || parsed.start_date || null, priority: form.priority,
      all_day: form.all_day, start_time: form.all_day ? null : (form.start_time || parsed.start_time),
      end_time: form.all_day ? null : (form.end_time || parsed.end_time), notes: form.notes || '',
    };
    if (editing) {
      const { data } = await supabase.from('todos').update(payload).eq('id', editing.id).select().single();
      if (data) { persistCalendar(data as Todo); setTodos(todos.map((t) => (t.id === editing.id ? data as Todo : t))); }
    } else {
      const { data } = await supabase.from('todos').insert({ ...payload, completed: false }).select().single();
      if (data) { persistCalendar(data as Todo); setTodos([data as Todo, ...todos]); }
    }
    setForm(emptyForm); setEditing(null); setShowForm(false);
  };

  const toggleTodo = async (todo: Todo) => {
    const next = !todo.completed;
    const { data } = await supabase.from('todos').update({ completed: next }).eq('id', todo.id).select().single();
    if (next) awardXP({ type: 'todo_complete' });
    if (data) setTodos(todos.map((t) => t.id === todo.id ? data as Todo : t));
  };
  const deleteTodo = async (id: string) => {
    const row = todos.find((t) => t.id === id);
    await supabase.from('todos').delete().eq('id', id);
    setTodos(todos.filter((t) => t.id !== id));
    if (row?.calendar_event_id) deleteCalendarEvent(row.calendar_event_id);
  };

  const filtered = todos.filter((t) => filter === 'all' ? true : filter === 'active' ? !t.completed : filter === 'completed' ? t.completed : t.priority === filter);
  const sorted = [...filtered].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const pq = PRIORITY_CONFIG[a.priority as PriorityKey].quadrant - PRIORITY_CONFIG[b.priority as PriorityKey].quadrant;
    if (pq !== 0) return pq;
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1; if (b.due_date) return 1; return 0;
  });

  if (loading) return <div className="flex items-center justify-center py-20"><CheckSquare className="w-8 h-8 text-zinc-300 animate-pulse" /></div>;

  return (
    <div>
      <PageHeader title="Master To-Do List" subtitle="Eisenhower Matrix priority \u00b7 Urgent vs Important" action={<Button onClick={() => openEdit()}><Plus className="w-4 h-4" /> Add Task</Button>} />
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-4 text-center"><div className="text-2xl font-bold text-zinc-800">{todos.length}</div><div className="text-xs text-zinc-500">Total Tasks</div></Card>
        <Card className="p-4 text-center"><div className="text-2xl font-bold text-zinc-800">{todos.filter((t) => !t.completed).length}</div><div className="text-xs text-zinc-500">Pending</div></Card>
        <Card className="p-4 text-center"><div className="text-2xl font-bold text-zinc-800">{todos.filter((t) => t.completed).length}</div><div className="text-xs text-zinc-500">Completed</div></Card>
      </div>
      <MotionOverlay open={showForm} onClose={() => { setShowForm(false); setEditing(null); }}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-zinc-800">{editing ? 'Edit task' : 'New task'}</h3>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">Title</label>
            <Input value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="Chemistry Exam 2pm to 4pm on Sept 17" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">Subject</label>
              <Select value={form.subject_key} onChange={(v) => setForm({ ...form, subject_key: v })} options={[{ value: '', label: 'None' }, ...SUBJECTS.map((s) => ({ value: s.key, label: s.shortName }))]} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">Due date</label>
              <Input value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} type="date" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <input type="checkbox" checked={form.all_day} onChange={(e) => setForm({ ...form, all_day: e.target.checked })} /> All day
          </label>
          {!form.all_day && (
            <div className="grid grid-cols-2 gap-3">
              <Input value={form.start_time} onChange={(v) => setForm({ ...form, start_time: v })} type="time" />
              <Input value={form.end_time} onChange={(v) => setForm({ ...form, end_time: v })} type="time" />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">Priority</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PRIORITY_CONFIG) as PriorityKey[]).map((key) => (
                <button key={key} type="button" onClick={() => setForm({ ...form, priority: key })} className={`rounded-xl border px-3 py-2 text-left text-xs font-medium ${form.priority === key ? 'border-zinc-900 bg-zinc-900 text-white' : 'glass border-transparent text-zinc-600'}`}><Flag className="mr-1 inline h-3 w-3" />{PRIORITY_CONFIG[key].short}</button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button onClick={() => { setShowForm(false); setEditing(null); }} variant="ghost" size="sm">Cancel</Button>
            <Button onClick={saveTodo} size="sm">{editing ? 'Save changes' : 'Add Task'}</Button>
          </div>
        </div>
      </MotionOverlay>
      <div className="flex flex-wrap gap-2 mb-4">
        {(['all', 'active', 'completed'] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-xl text-sm font-medium capitalize ${filter === f ? 'bg-zinc-900 text-white' : 'glass text-zinc-600'}`}>{f}</button>
        ))}
      </div>
      {sorted.length === 0 ? <EmptyState icon={CheckSquare} title="No tasks found" subtitle="Add a task to get started." /> : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
          {sorted.map((todo) => {
            const subj = SUBJECTS.find((s) => s.key === todo.subject_key);
            const p = PRIORITY_CONFIG[todo.priority as PriorityKey];
            const overdue = todo.due_date && !todo.completed && new Date(todo.due_date) < new Date(new Date().toDateString());
            return (
              <motion.div
                key={todo.id}
                layout={!reduceMotion}
                initial={reduceMotion ? false : listItemMotion.initial}
                animate={listItemMotion.animate}
                exit={reduceMotion ? listItemMotion.animate : listItemMotion.exit}
                transition={motionTransition(reduceMotion, 0.18)}
              >
              <Card className={`flex items-center gap-3 p-3 group transition-opacity duration-200 ${todo.completed ? 'opacity-50' : ''}`}>
                <button onClick={() => toggleTodo(todo)} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors duration-150 ${todo.completed ? 'border-zinc-900 bg-zinc-900' : 'border-zinc-300'}`}>{todo.completed && <Check className="h-3 w-3 text-white" />}</button>
                <div className="min-w-0 flex-1">
                  <span className={`text-sm font-medium transition-colors duration-150 ${todo.completed ? 'text-zinc-400 line-through' : 'text-zinc-700'}`}>{todo.title}</span>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {subj && <SubjectBadge shortName={subj.shortName} />}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${p.tone === 'high' ? 'bg-zinc-900 text-white' : p.tone === 'mid' ? 'bg-zinc-700 text-white' : p.tone === 'low' ? 'bg-zinc-400 text-zinc-900' : 'bg-zinc-200 text-zinc-600'}`}>{p.short}</span>
                    {todo.due_date && <span className={`text-xs flex items-center gap-1 ${overdue ? 'text-zinc-900 font-medium' : 'text-zinc-400'}`}>{overdue ? <AlertCircle className="w-3 h-3" /> : <Circle className="w-3 h-3" />}{new Date(todo.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{!todo.all_day && todo.start_time ? ` ${todo.start_time}` : ''}</span>}
                  </div>
                </div>
                <button onClick={() => openEdit(todo)} className="text-zinc-300 hover:text-zinc-600 opacity-0 group-hover:opacity-100"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => deleteTodo(todo.id)} className="text-zinc-300 hover:text-zinc-600 opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
              </Card>
              </motion.div>
            );
          })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
