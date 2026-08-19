import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { SUBJECTS, type KanbanTask, type SubjectKey } from '@/lib/types';
import { Card, PageHeader, Button, Input, Select, EmptyState, SubjectBadge } from '@/components/ui';
import { FolderTree, Plus, Trash2, GripVertical } from 'lucide-react';

const COLUMNS = [
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
] as const;

type Status = typeof COLUMNS[number]['id'];

export default function KanbanPage() {
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', subject_key: '', due_date: '', status: 'todo' as Status });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    const { data } = await supabase.from('kanban_tasks').select('*').order('sort_order', { ascending: true });
    if (data) setTasks(data as KanbanTask[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const addTask = async () => {
    if (!form.title.trim()) return;
    const maxOrder = tasks.filter((t) => t.status === form.status).reduce((max, t) => Math.max(max, t.sort_order), 0);
    const { data } = await supabase.from('kanban_tasks').insert({
      title: form.title.trim(),
      description: form.description.trim(),
      subject_key: form.subject_key || null,
      due_date: form.due_date || null,
      status: form.status,
      sort_order: maxOrder + 1,
    }).select().single();
    if (data) {
      setTasks([...tasks, data as KanbanTask]);
      setForm({ title: '', description: '', subject_key: '', due_date: '', status: 'todo' });
      setShowForm(false);
    }
  };

  const deleteTask = async (id: string) => {
    await supabase.from('kanban_tasks').delete().eq('id', id);
    setTasks(tasks.filter((t) => t.id !== id));
  };

  const updateStatus = async (taskId: string, newStatus: Status) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    const maxOrder = tasks.filter((t) => t.status === newStatus).reduce((max, t) => Math.max(max, t.sort_order), 0);
    const { data } = await supabase.from('kanban_tasks').update({ status: newStatus, sort_order: maxOrder + 1 }).eq('id', taskId).select().single();
    if (data) setTasks(tasks.map((t) => t.id === taskId ? data as KanbanTask : t));
  };

  const onDragStart = (e: React.DragEvent, id: string) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    setDragOverCol(colId);
  };

  const onDrop = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    if (draggingId) updateStatus(draggingId, colId as Status);
    setDraggingId(null);
    setDragOverCol(null);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><FolderTree className="w-8 h-8 text-zinc-300 animate-pulse" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="Project Kanban Board"
        subtitle="Drag and drop tasks between columns to track larger assignments"
        action={<Button onClick={() => setShowForm(!showForm)}><Plus className="w-4 h-4" /> Add Task</Button>}
      />

      {showForm && (
        <Card className="p-4 mb-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-zinc-500 mb-1 block">Title</label>
              <Input value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="Project or assignment name" />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 mb-1 block">Status</label>
              <Select
                value={form.status}
                onChange={(v) => setForm({ ...form, status: v as Status })}
                options={COLUMNS.map((c) => ({ value: c.id, label: c.label }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 mb-1 block">Subject</label>
              <Select
                value={form.subject_key}
                onChange={(v) => setForm({ ...form, subject_key: v })}
                options={[{ value: '', label: 'None' }, ...SUBJECTS.map((s) => ({ value: s.key, label: s.shortName }))]}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 mb-1 block">Due Date</label>
              <Input value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} type="date" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="text-xs font-medium text-zinc-500 mb-1 block">Description</label>
              <Input value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="Optional details" />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button onClick={addTask} size="sm">Add Task</Button>
            <Button onClick={() => setShowForm(false)} variant="ghost" size="sm">Cancel</Button>
          </div>
        </Card>
      )}

      {tasks.length === 0 && !showForm ? (
        <EmptyState icon={FolderTree} title="No tasks on the board" subtitle="Add a task to start organizing your larger assignments visually." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.id);
            return (
              <div
                key={col.id}
                onDragOver={(e) => onDragOver(e, col.id)}
                onDrop={(e) => onDrop(e, col.id)}
                className={`rounded-2xl border-2 border-dashed transition-all min-h-[200px] ${
                  dragOverCol === col.id ? 'border-zinc-500 bg-white/40' : 'border-zinc-200/40 glass'
                }`}
              >
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-200/40">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-zinc-500" />
                    <span className="font-medium text-sm text-zinc-700">{col.label}</span>
                  </div>
                  <span className="text-xs text-zinc-400">{colTasks.length}</span>
                </div>
                <div className="p-2 space-y-2">
                  {colTasks.map((task) => {
                    const subj = SUBJECTS.find((s) => s.key === task.subject_key);
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, task.id)}
                        onDragEnd={() => { setDraggingId(null); setDragOverCol(null); }}
                        className={`glass glass-shadow rounded-xl p-3 cursor-move glass-hover group ${
                          draggingId === task.id ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical className="w-3.5 h-3.5 text-zinc-300 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-700">{task.title}</p>
                            {task.description && <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{task.description}</p>}
                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                              {subj && <SubjectBadge shortName={subj.shortName} />}
                              {task.due_date && (
                                <span className="text-xs text-zinc-400">
                                  {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => deleteTask(task.id)}
                            className="text-zinc-300 hover:text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {colTasks.length === 0 && (
                    <p className="text-xs text-zinc-300 text-center py-4">Drop tasks here</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
