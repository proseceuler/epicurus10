import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { SUBJECTS, type Habit, type KanbanTask, type Note, type Todo } from '@/lib/types';
import { type KanbanStatus as Status, type BoardList, normalizeTask, loadLists, saveLists, slugList, nextTint, loadAutomations } from '@/lib/kanban';
import { upsertLinkedCalendarEvent } from '@/lib/calendarStore';
import { confirmDelete } from '@/lib/confirm';
import { onDataChanged } from '@/lib/assistant/sync';
import { PageHeader, Button } from '@/components/kit';
import { KanbanCardPreview, CardDetailModal } from '@/components/KanbanCards';
import { ListActions } from '@/components/kanban/ListActions';
import { FolderTree, Plus, X, GripVertical } from 'lucide-react';

export default function KanbanPage() {
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [lists, setLists] = useState<BoardList[]>(() => loadLists());
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingCol, setAddingCol] = useState<Status | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [draggingList, setDraggingList] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');
  const [addingList, setAddingList] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [links, setLinks] = useState<{ todos: Todo[]; notes: Note[]; habits: Habit[] }>({ todos: [], notes: [], habits: [] });

  const persistLists = (next: BoardList[]) => { setLists(next); saveLists(next); };

  const loadTasks = useCallback(async () => {
    const [{ data }, todos, notes, habits] = await Promise.all([
      supabase.from('kanban_tasks').select('*').order('sort_order', { ascending: true }),
      supabase.from('todos').select('*'),
      supabase.from('notes').select('id,title').order('updated_at', { ascending: false }).limit(80),
      supabase.from('habits').select('id,name'),
    ]);
    if (data) setTasks((data as KanbanTask[]).map(normalizeTask));
    setLinks({ todos: (todos.data ?? []) as Todo[], notes: (notes.data ?? []) as Note[], habits: (habits.data ?? []) as Habit[] });
    setLoading(false);
  }, []);
  useEffect(() => { loadTasks(); }, [loadTasks]);
  useEffect(() => onDataChanged(() => { void loadTasks(); }), [loadTasks]);
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
      title: saved.title, description: saved.description, subject_key: saved.subject_key, due_date: saved.due_date,
      status: saved.status, sort_order: saved.sort_order, cover_url: saved.cover_url ?? null,
      checklist: saved.checklist ?? [], attachments: saved.attachments ?? [], comments: saved.comments ?? [],
      linked_todo_id: saved.linked_todo_id ?? null, linked_note_id: saved.linked_note_id ?? null,
      linked_habit_id: saved.linked_habit_id ?? null, linked_event_id: saved.linked_event_id ?? null,
    }).eq('id', id);
    if ('due_date' in patch || 'title' in patch) {
      const eventId = upsertLinkedCalendarEvent({ existingId: saved.linked_event_id, title: saved.title, date: saved.due_date, kind: 'deadline', subject_key: saved.subject_key, linked_kanban_id: saved.id });
      if (eventId !== saved.linked_event_id) {
        await supabase.from('kanban_tasks').update({ linked_event_id: eventId }).eq('id', id);
        setTasks((list) => list.map((t) => (t.id === id ? { ...t, linked_event_id: eventId } : t)));
      }
    }
  };

  const addTask = async (partial?: { title?: string; status?: Status }) => {
    const title = (partial?.title ?? '').trim();
    const status = partial?.status ?? lists[0]?.id ?? 'todo';
    if (!title) return;
    const maxOrder = tasks.filter((t) => t.status === status).reduce((max, t) => Math.max(max, t.sort_order), 0);
    const { data } = await supabase.from('kanban_tasks').insert({ title, description: '', subject_key: null, due_date: null, status, sort_order: maxOrder + 1, cover_url: null, checklist: [], attachments: [], comments: [] }).select().single();
    if (data) { setTasks((list) => [...list, normalizeTask(data as KanbanTask)]); setAddingCol(null); setQuickTitle(''); }
  };

  const deleteTask = async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!(await confirmDelete(task?.title || 'this card'))) return;
    await supabase.from('kanban_tasks').delete().eq('id', id);
    setTasks((list) => list.filter((t) => t.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const deleteList = async (id: string) => {
    const col = lists.find((l) => l.id === id);
    if (!(await confirmDelete(col?.label || 'this list'))) return;
    persistLists(lists.filter((l) => l.id !== id));
  };
  const updateStatus = async (taskId: string, newStatus: Status) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    const maxOrder = tasks.filter((t) => t.status === newStatus).reduce((max, t) => Math.max(max, t.sort_order), 0);
    await persist(taskId, { status: newStatus, sort_order: maxOrder + 1 });
    const auto = loadAutomations().find((r) => r.listId === newStatus && r.enabled && r.trigger === 'card_added');
    if (auto) await sortList(newStatus, auto.action === 'sort_by_title' ? 'title' : 'due');
  };

  const sortList = async (listId: string, by: 'title' | 'due') => {
    const colTasks = tasks.filter((t) => t.status === listId).slice().sort((a, b) => {
      if (by === 'title') return a.title.localeCompare(b.title);
      return (a.due_date || '9999').localeCompare(b.due_date || '9999');
    });
    await Promise.all(colTasks.map((t, i) => persist(t.id, { sort_order: i + 1 })));
  };

  const copyList = async (listId: string) => {
    const src = lists.find((l) => l.id === listId);
    if (!src) return;
    const id = slugList(`${src.label} copy`);
    persistLists([...lists, { id, label: `${src.label} copy`, tint: nextTint(lists.length), color: src.color }]);
    const colTasks = tasks.filter((t) => t.status === listId);
    for (const t of colTasks) await addTask({ title: t.title, status: id });
  };

  const moveAll = async (fromId: string, toId: string) => {
    const moving = tasks.filter((t) => t.status === fromId);
    for (const t of moving) await updateStatus(t.id, toId);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><FolderTree className="h-8 w-8 animate-pulse text-zinc-300" /></div>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Project Kanban Board" />
      <div className="-mx-1 flex min-h-0 flex-1 items-start gap-3 overflow-x-auto pb-4 pt-1">
        {lists.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id);
          return (
            <div key={col.id} onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.id); }} onDrop={(e) => {
              e.preventDefault();
              if (draggingId) void updateStatus(draggingId, col.id);
              if (draggingList && draggingList !== col.id) {
                const next = [...lists];
                const from = next.findIndex((l) => l.id === draggingList);
                const to = next.findIndex((l) => l.id === col.id);
                if (from >= 0 && to >= 0) { const [moved] = next.splice(from, 1); next.splice(to, 0, moved); persistLists(next); }
              }
              setDraggingId(null); setDraggingList(null); setDragOverCol(null);
            }} className={`flex w-[272px] shrink-0 flex-col self-start rounded-2xl transition-[background-color,box-shadow] duration-200 ${dragOverCol === col.id ? 'bg-white/70 ring-2 ring-zinc-400/40' : 'bg-white/40'}`} style={{ maxHeight: colTasks.length ? 'calc(100vh - 12rem)' : undefined, background: col.color ? `${col.color}22` : undefined }}>
              <div
                className="flex cursor-grab items-center gap-2 px-3 py-2.5 active:cursor-grabbing"
                draggable
                onDragStart={(e) => { e.stopPropagation(); setDraggingList(col.id); setDraggingId(null); }}
                onDragEnd={() => setDraggingList(null)}
              >
                <GripVertical className="h-3.5 w-3.5 text-zinc-400" />
                <span className={`h-2 w-2 rounded-full ${col.color ? '' : col.tint}`} style={col.color ? { background: col.color } : undefined} />
                {renaming === col.id ? <input autoFocus defaultValue={col.label} className="w-28 rounded border px-1 text-sm" onBlur={(e) => { const label = e.target.value.trim(); if (label) persistLists(lists.map((l) => (l.id === col.id ? { ...l, label } : l))); setRenaming(null); }} /> : <button type="button" className="text-sm font-semibold" onDoubleClick={() => setRenaming(col.id)}>{col.label}</button>}
                <ListActions
                  list={col}
                  count={colTasks.length}
                  lists={lists}
                  onAddCard={() => { setAddingCol(col.id); setQuickTitle(''); }}
                  onCopyList={() => void copyList(col.id)}
                  onMoveAll={(target) => void moveAll(col.id, target)}
                  onSort={(by) => void sortList(col.id, by)}
                  onColor={(hex) => persistLists(lists.map((l) => (l.id === col.id ? { ...l, color: hex } : l)))}
                  onArchive={() => void deleteList(col.id)}
                />
              </div>
              <div className="space-y-2 overflow-y-auto px-2 pb-2" style={{ maxHeight: colTasks.length > 4 ? 'calc(100vh - 16rem)' : undefined }}>
                {colTasks.map((task) => (
                  <KanbanCardPreview key={task.id} task={task} dragging={draggingId === task.id} onDragStart={(e) => { setDraggingId(task.id); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => { setDraggingId(null); setDragOverCol(null); }} onOpen={() => setSelectedId(task.id)} onDelete={() => deleteTask(task.id)} />
                ))}
              </div>
              {addingCol === col.id ? (
                <div className="mx-2 mb-2 space-y-2 rounded-xl bg-white/80 p-2">
                  <textarea value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)} rows={2} autoFocus className="w-full rounded-lg border px-2.5 py-2 text-sm" placeholder="Enter a title for this card…" />
                  <div className="flex gap-2"><Button size="sm" onClick={() => void addTask({ title: quickTitle, status: col.id })}>Add card</Button><button type="button" onClick={() => setAddingCol(null)}><X className="h-4 w-4" /></button></div>
                </div>
              ) : (
                <button type="button" onClick={() => { setAddingCol(col.id); setQuickTitle(''); }} className="mx-2 mb-2 flex items-center gap-1.5 px-2 py-1.5 text-xs text-zinc-500"><Plus className="h-3.5 w-3.5" /> Add a card</button>
              )}
            </div>
          );
        })}
        <div className="w-[272px] shrink-0 self-start">
          {addingList ? (
            <div className="space-y-2 rounded-2xl bg-white/70 p-2 ring-1 ring-zinc-200/80">
              <input
                autoFocus
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const label = newListName.trim();
                    if (!label) return;
                    persistLists([...lists, { id: slugList(label), label, tint: nextTint(lists.length) }]);
                    setNewListName('');
                    setAddingList(false);
                  }
                  if (e.key === 'Escape') setAddingList(false);
                }}
                placeholder="Enter list name..."
                className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400/40"
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    const label = newListName.trim();
                    if (!label) return;
                    persistLists([...lists, { id: slugList(label), label, tint: nextTint(lists.length) }]);
                    setNewListName('');
                    setAddingList(false);
                  }}
                >
                  Add list
                </Button>
                <button type="button" onClick={() => { setAddingList(false); setNewListName(''); }} className="text-zinc-400 hover:text-zinc-700">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingList(true)}
              className="flex w-full items-center gap-1.5 rounded-2xl bg-zinc-900/80 px-3 py-2.5 text-sm font-medium text-white hover:bg-zinc-900"
            >
              <Plus className="h-4 w-4" /> Add list
            </button>
          )}
        </div>
      </div>
      {selected && <CardDetailModal task={selected} lists={lists} links={links} recentLinks={tasks.flatMap((t) => t.attachments ?? [])} onClose={() => setSelectedId(null)} onDelete={() => deleteTask(selected.id)} onStatus={(status) => updateStatus(selected.id, status)} onSave={(patch) => persist(selected.id, patch)} />}
    </div>
  );
}
