import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { SUBJECTS, type KanbanTask } from '@/lib/types';
import {
  COLUMNS,
  type KanbanStatus as Status,
  normalizeTask,
} from '@/lib/kanban';
import { Card, PageHeader, Button, Input, Select } from '@/components/kit';
import { KanbanCardPreview, CardDetailModal } from '@/components/KanbanCards';
import { FolderTree, Plus, X } from 'lucide-react';

export default function KanbanPage() {
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', subject_key: '', due_date: '', status: 'todo' as Status,
  });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingCol, setAddingCol] = useState<Status | null>(null);
  const [quickTitle, setQuickTitle] = useState('');

  const loadTasks = useCallback(async () => {
    const { data } = await supabase.from('kanban_tasks').select('*').order('sort_order', { ascending: true });
    if (data) setTasks((data as KanbanTask[]).map(normalizeTask));
    setLoading(false);
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);
  const selected = tasks.find((t) => t.id === selectedId) ?? null;

  const persist = async (id: string, patch: Partial<KanbanTask>) => {
    let next: KanbanTask | null = null;
    setTasks((list) => {
      const current = list.find((t) => t.id === id);
      if (!current) return list;
      next = normalizeTask({ ...current, ...patch });
      return list.map((t) => (t.id === id ? next! : t));
    });
    if (!next) return;
    const saved = next;
    await supabase.from('kanban_tasks').update({
      title: saved.title,
      description: saved.description,
      subject_key: saved.subject_key,
      due_date: saved.due_date,
      status: saved.status,
      sort_order: saved.sort_order,
      cover_url: saved.cover_url ?? null,
      checklist: saved.checklist ?? [],
      attachments: saved.attachments ?? [],
      comments: saved.comments ?? [],
    }).eq('id', id);
  };

  const addTask = async (partial?: { title?: string; status?: Status }) => {
    const title = (partial?.title ?? form.title).trim();
    const status = partial?.status ?? form.status;
    if (!title) return;
    const maxOrder = tasks.filter((t) => t.status === status).reduce((max, t) => Math.max(max, t.sort_order), 0);
    const { data } = await supabase.from('kanban_tasks').insert({
      title,
      description: partial ? '' : form.description.trim(),
      subject_key: partial ? null : (form.subject_key || null),
      due_date: partial ? null : (form.due_date || null),
      status,
      sort_order: maxOrder + 1,
      cover_url: null,
      checklist: [],
      attachments: [],
      comments: [],
    }).select().single();
    if (data) {
      setTasks((list) => [...list, normalizeTask(data as KanbanTask)]);
      setForm({ title: '', description: '', subject_key: '', due_date: '', status: 'todo' });
      setShowForm(false);
      setAddingCol(null);
      setQuickTitle('');
    }
  };

  const deleteTask = async (id: string) => {
    await supabase.from('kanban_tasks').delete().eq('id', id);
    setTasks((list) => list.filter((t) => t.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const updateStatus = async (taskId: string, newStatus: Status) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    const maxOrder = tasks.filter((t) => t.status === newStatus).reduce((max, t) => Math.max(max, t.sort_order), 0);
    await persist(taskId, { status: newStatus, sort_order: maxOrder + 1 });
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><FolderTree className="h-8 w-8 animate-pulse text-zinc-300" /></div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Project Kanban Board"
        action={tasks.length === 0 ? (
          <Button onClick={() => setShowForm(!showForm)}><Plus className="h-4 w-4" /> Add Task</Button>
        ) : undefined}
      />

      {showForm && (
        <Card className="mb-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-zinc-500">Title</label>
              <Input value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="Project or assignment name" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">Status</label>
              <Select value={form.status} onChange={(v) => setForm({ ...form, status: v as Status })} options={COLUMNS.map((c) => ({ value: c.id, label: c.label }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">Subject</label>
              <Select value={form.subject_key} onChange={(v) => setForm({ ...form, subject_key: v })} options={[{ value: '', label: 'None' }, ...SUBJECTS.map((s) => ({ value: s.key, label: s.shortName }))]} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-500">Due Date</label>
              <Input value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} type="date" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-xs font-medium text-zinc-500">Description</label>
              <Input value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="Optional details" />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => void addTask()} size="sm">Add Task</Button>
            <Button onClick={() => setShowForm(false)} variant="ghost" size="sm">Cancel</Button>
          </div>
        </Card>
      )}

      <div className="-mx-1 flex min-h-0 flex-1 gap-3 overflow-x-auto pb-4 pt-1">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.id);
            const composing = addingCol === col.id;
            return (
              <div
                key={col.id}
                onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.id); }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggingId) void updateStatus(draggingId, col.id);
                  setDraggingId(null);
                  setDragOverCol(null);
                }}
                className={`flex w-[272px] shrink-0 flex-col rounded-2xl transition-all ${dragOverCol === col.id ? 'bg-white/70 ring-2 ring-zinc-400/40' : 'bg-white/40 backdrop-blur-md'}`}
                style={{ maxHeight: 'calc(100vh - 12rem)' }}
              >
                <div className="flex shrink-0 items-center gap-2 px-3 py-2.5">
                  <span className={`h-2 w-2 rounded-full ${col.tint}`} />
                  <span className="text-sm font-semibold text-zinc-700">{col.label}</span>
                  <span className="rounded-full bg-zinc-200/70 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">{colTasks.length}</span>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                  {colTasks.map((task) => (
                    <KanbanCardPreview
                      key={task.id}
                      task={task}
                      dragging={draggingId === task.id}
                      onDragStart={(e) => { setDraggingId(task.id); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragEnd={() => { setDraggingId(null); setDragOverCol(null); }}
                      onOpen={() => setSelectedId(task.id)}
                      onDelete={() => deleteTask(task.id)}
                    />
                  ))}
                </div>
                {composing ? (
                  <div className="mx-2 mb-2 space-y-2 rounded-xl bg-white/80 p-2">
                    <textarea
                      value={quickTitle}
                      onChange={(e) => setQuickTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void addTask({ title: quickTitle, status: col.id }); }
                        if (e.key === 'Escape') { setAddingCol(null); setQuickTitle(''); }
                      }}
                      rows={2}
                      autoFocus
                      placeholder="Enter a title for this card…"
                      className="w-full resize-none rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm text-zinc-800 outline-none"
                    />
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => void addTask({ title: quickTitle, status: col.id })}>Add card</Button>
                      <button type="button" onClick={() => { setAddingCol(null); setQuickTitle(''); }} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X className="h-4 w-4" /></button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => { setAddingCol(col.id); setQuickTitle(''); }} className="mx-2 mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-white/60 hover:text-zinc-700">
                    <Plus className="h-3.5 w-3.5" /> Add a card
                  </button>
                )}
              </div>
            );
          })}
        </div>

      {selected && (
        <CardDetailModal
          task={selected}
          onClose={() => setSelectedId(null)}
          onDelete={() => deleteTask(selected.id)}
          onStatus={(status) => updateStatus(selected.id, status)}
          onSave={(patch) => persist(selected.id, patch)}
        />
      )}
    </div>
  );
}
