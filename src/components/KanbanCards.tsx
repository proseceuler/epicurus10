import { useEffect, useMemo, useRef, useState } from 'react';
import { SUBJECTS, type Habit, type KanbanAttachment, type KanbanTask, type Note, type SubjectKey, type Todo } from '@/lib/types';
import {
  COLUMNS, type BoardList, type KanbanStatus as Status, kanbanUid as uid,
  dueTone, formatDue, formatStart, uniqueById, uniqueAttachments,
  splitDue, joinDue, loadStartDate, saveStartDate,
} from '@/lib/kanban';
import { Button, Input, Select } from '@/components/kit';
import { DateGrid, TimeField } from '@/components/fields';
import { MotionPopover } from '@/components/MotionUI';
import { CardComments } from '@/components/kanban/CardComments';
import { Trash2, X, Calendar as CalIcon, CheckSquare, Paperclip, MessageSquare, Tag, AlignLeft, GripVertical, Link2 } from 'lucide-react';

function MiniSheet({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);
  return (
    <MotionPopover open={open} className="absolute right-0 top-0 z-20 w-[min(92vw,20.5rem)] p-0">
      <div ref={ref} className="relative overflow-hidden rounded-[1.15rem] bg-white shadow-[0_16px_40px_rgba(24,24,27,0.16)]">
        <div className="relative flex items-center justify-center border-b border-zinc-100 px-10 py-2.5">
          <h4 className="text-[13px] font-semibold text-zinc-700">{title}</h4>
          <button type="button" onClick={onClose} className="absolute right-2.5 top-2 rounded-md p-1 text-zinc-400 hover:bg-zinc-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-3">{children}</div>
      </div>
    </MotionPopover>
  );
}

export function KanbanCardPreview({ task, dragging, onDragStart, onDragEnd, onOpen, onDelete }: {
  task: KanbanTask; dragging: boolean; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void; onOpen: () => void; onDelete: () => void;
}) {
  const subj = SUBJECTS.find((s) => s.key === task.subject_key);
  const checklist = task.checklist ?? [];
  const attachments = uniqueAttachments(task.attachments);
  const comments = task.comments ?? [];
  return (
    <div draggable onDragStart={(e) => { e.stopPropagation(); onDragStart(e); }} onDragEnd={onDragEnd} onClick={onOpen} className={`group cursor-pointer overflow-hidden rounded-xl border border-white/50 bg-white/85 shadow-sm ${dragging ? 'opacity-50' : ''}`}>
      <div className="p-3">
        {subj && <div className="mb-1.5"><span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-zinc-800 text-white">{subj.shortName}</span></div>}
        <div className="flex items-start gap-1.5">
          <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-300 opacity-0 group-hover:opacity-100" />
          <p className="flex-1 text-sm font-medium leading-snug text-zinc-800">{task.title}</p>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="shrink-0 text-zinc-300 opacity-0 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-5">
          {task.due_date && <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${dueTone(task.due_date)}`}><CalIcon className="h-3 w-3" />{formatDue(task.due_date)}</span>}
          {checklist.length > 0 && <span className="inline-flex items-center gap-0.5 text-[10px] text-zinc-500"><CheckSquare className="h-3 w-3" />{checklist.filter((i) => i.done).length}/{checklist.length}</span>}
          {attachments.length > 0 && <span className="inline-flex items-center gap-0.5 text-[10px] text-zinc-400"><Paperclip className="h-3 w-3" />{attachments.length}</span>}
          {comments.length > 0 && <span className="inline-flex items-center gap-0.5 text-[10px] text-zinc-400"><MessageSquare className="h-3 w-3" />{comments.length}</span>}
        </div>
      </div>
    </div>
  );
}

export function CardDetailModal({ task, lists, links, onClose, onDelete, onStatus, onSave }: {
  task: KanbanTask; lists?: BoardList[]; links?: { todos: Todo[]; notes: Note[]; habits: Habit[] };
  recentLinks?: KanbanAttachment[];
  onClose: () => void; onDelete: () => void; onStatus: (status: Status) => void; onSave: (patch: Partial<KanbanTask>) => void;
}) {
  const columns = lists?.length ? lists : COLUMNS.map((c) => ({ ...c }));
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [due, setDue] = useState(task.due_date || '');
  const [dueOn, setDueOn] = useState(Boolean(task.due_date));
  const [dueTimeOn, setDueTimeOn] = useState(Boolean(splitDue(task.due_date).time));
  const [startDate, setStartDate] = useState(() => loadStartDate(task.id));
  const [startOn, setStartOn] = useState(() => Boolean(loadStartDate(task.id)));
  const [dateFocus, setDateFocus] = useState<'start' | 'due'>('due');
  const [subject, setSubject] = useState(task.subject_key || '');
  const [checkText, setCheckText] = useState('');
  const [panel, setPanel] = useState<null | 'labels' | 'dates' | 'checklist' | 'attach' | 'connect'>(null);
  const [attachUrl, setAttachUrl] = useState('');

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description || '');
    setDue(task.due_date || '');
    setDueOn(Boolean(task.due_date));
    setDueTimeOn(Boolean(splitDue(task.due_date).time));
    const stored = loadStartDate(task.id);
    setStartDate(stored);
    setStartOn(Boolean(stored));
    setSubject(task.subject_key || '');
    setPanel(null);
  }, [task.id, task.title, task.description, task.due_date, task.subject_key]);

  const checklist = useMemo(() => uniqueById(task.checklist), [task.checklist]);
  const attachments = useMemo(() => uniqueAttachments(task.attachments), [task.attachments]);
  const subj = SUBJECTS.find((s) => s.key === subject);
  const saveBasics = () => onSave({ title: title.trim() || task.title, description: description.trim(), due_date: due || null, subject_key: (subject || null) as SubjectKey | null });

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-4" onClick={onClose}>
      <div className="epic-glass-sheet relative my-6 w-[min(96vw,52rem)] overflow-visible" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
          <Select value={task.status} onChange={(v) => onStatus(v as Status)} className="w-40" options={columns.map((c) => ({ value: c.id, label: c.label }))} />
          <div className="flex-1" />
          <button type="button" onClick={onDelete} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100"><Trash2 className="h-4 w-4" /></button>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-col lg:flex-row">
          <div className="min-w-0 flex-1 space-y-5 p-5 pt-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveBasics} className="w-full bg-transparent text-xl font-semibold outline-none" />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setPanel(panel === 'labels' ? null : 'labels')} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"><Tag className="h-3.5 w-3.5" /> + Add</button>
              <button type="button" onClick={() => setPanel(panel === 'dates' ? null : 'dates')} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"><CalIcon className="h-3.5 w-3.5" /> Dates</button>
              <button type="button" onClick={() => setPanel(panel === 'checklist' ? null : 'checklist')} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"><CheckSquare className="h-3.5 w-3.5" /> Checklist</button>
              <button type="button" onClick={() => setPanel(panel === 'attach' ? null : 'attach')} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"><Paperclip className="h-3.5 w-3.5" /> Attachment</button>
              {links ? <button type="button" onClick={() => setPanel(panel === 'connect' ? null : 'connect')} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"><Link2 className="h-3.5 w-3.5" /> Connect</button> : null}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-zinc-500">Labels</span>
              {subj ? <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-white">{subj.shortName}</span> : null}
              {startOn && startDate ? <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">Starts {formatStart(startDate)}</span> : null}
              {due ? <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${dueTone(due)}`}><CalIcon className="h-3 w-3" />{formatDue(due)}</span> : null}
            </div>
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500"><AlignLeft className="h-3.5 w-3.5" /> Description</h3>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} onBlur={saveBasics} rows={4} placeholder="Add a more detailed description…" className="min-h-[88px] w-full rounded-xl border border-zinc-200/70 bg-white/80 px-3 py-2 text-sm outline-none" />
            </section>
            {checklist.map((item) => (
              <div key={item.id} className="flex items-center gap-2 py-1">
                <input type="checkbox" checked={item.done} onChange={() => onSave({ checklist: checklist.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)) })} />
                <span className={`flex-1 text-sm ${item.done ? 'line-through text-zinc-400' : ''}`}>{item.text}</span>
              </div>
            ))}
          </div>
          <aside className="relative w-full overflow-visible border-t border-zinc-200/50 p-5 lg:w-64 lg:border-l lg:border-t-0">
            <MiniSheet title="Labels" open={panel === 'labels'} onClose={() => setPanel(null)}>
              <button type="button" onClick={() => { setSubject(''); onSave({ subject_key: null }); setPanel(null); }} className={`flex w-full items-center rounded-lg px-2.5 py-1.5 text-sm ${!subject ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-100'}`}>None</button>
              {SUBJECTS.map((s) => (
                <button key={s.key} type="button" onClick={() => { setSubject(s.key); onSave({ subject_key: s.key }); setPanel(null); }} className={`flex w-full items-center rounded-lg px-2.5 py-1.5 text-sm ${subject === s.key ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-100'}`}>{s.shortName}</button>
              ))}
            </MiniSheet>
            <MiniSheet title="Dates" open={panel === 'dates'} onClose={() => setPanel(null)}>
              <DateGrid value={dateFocus === 'start' ? startDate : splitDue(due).date} onChange={(iso) => {
                if (dateFocus === 'start') { setStartOn(true); setStartDate(iso); return; }
                setDueOn(true);
                setDue(joinDue(iso, dueTimeOn ? (splitDue(due).time || '09:00') : '') || iso);
              }} />
              <label className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-600">
                <input type="checkbox" checked={startOn} onChange={(e) => {
                  const on = e.target.checked; setStartOn(on); setDateFocus('start');
                  if (!on) { setStartDate(''); saveStartDate(task.id, ''); }
                  else if (!startDate) setStartDate(new Date().toISOString().slice(0, 10));
                }} />
                Start date
                <button type="button" onClick={() => startOn && setDateFocus('start')} className={`rounded-md px-2 py-1 font-mono text-[11px] ${dateFocus === 'start' && startOn ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700'}`}>
                  {startDate ? new Date(startDate + 'T00:00:00').toLocaleDateString('en-US') : 'M/D/YYYY'}
                </button>
              </label>
              <label className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-600">
                <input type="checkbox" checked={dueOn} onChange={(e) => {
                  const on = e.target.checked; setDueOn(on); setDateFocus('due');
                  if (!on) setDue('');
                  else if (!splitDue(due).date) setDue(new Date().toISOString().slice(0, 10));
                }} />
                Due date
                <button type="button" onClick={() => dueOn && setDateFocus('due')} className={`rounded-md px-2 py-1 font-mono text-[11px] ${dateFocus === 'due' && dueOn ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700'}`}>
                  {splitDue(due).date ? new Date(splitDue(due).date + 'T00:00:00').toLocaleDateString('en-US') : 'M/D/YYYY'}
                </button>
                {dueTimeOn ? (
                  <div className="w-[7.5rem]"><TimeField value={splitDue(due).time || '09:00'} onChange={(t) => setDue(joinDue(splitDue(due).date, t) || due)} /></div>
                ) : (
                  <button type="button" onClick={() => { setDueTimeOn(true); setDue(joinDue(splitDue(due).date || new Date().toISOString().slice(0, 10), '09:00') || ''); }} className="rounded-md bg-zinc-100 px-2 py-1 text-[11px] text-zinc-500">Add time</button>
                )}
              </label>
              <div className="mt-3 grid gap-2">
                <Button size="sm" className="w-full" onClick={() => { saveStartDate(task.id, startOn ? startDate : ''); onSave({ due_date: dueOn ? (due || null) : null }); setPanel(null); }}>Save</Button>
                <Button size="sm" variant="ghost" className="w-full" onClick={() => { setDue(''); setDueOn(false); setStartDate(''); setStartOn(false); saveStartDate(task.id, ''); onSave({ due_date: null }); setPanel(null); }}>Remove</Button>
              </div>
            </MiniSheet>
            <MiniSheet title="Checklist" open={panel === 'checklist'} onClose={() => setPanel(null)}>
              <Input value={checkText} onChange={setCheckText} placeholder="e.g. Review chapter 4" />
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>Cancel</Button>
                <Button size="sm" onClick={() => { const text = checkText.trim(); if (!text) return; onSave({ checklist: [...checklist, { id: uid(), text, done: false }] }); setCheckText(''); setPanel(null); }}>Add</Button>
              </div>
            </MiniSheet>
            <MiniSheet title="Attach" open={panel === 'attach'} onClose={() => setPanel(null)}>
              <Input value={attachUrl} onChange={setAttachUrl} placeholder="Paste a link" />
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>Cancel</Button>
                <Button size="sm" disabled={!attachUrl.trim()} onClick={() => { const url = attachUrl.trim(); if (!url) return; onSave({ attachments: uniqueAttachments([...attachments, { id: uid(), url, name: url }]) }); setAttachUrl(''); setPanel(null); }}>Insert</Button>
              </div>
            </MiniSheet>
            {links && (
              <MiniSheet title="Connect" open={panel === 'connect'} onClose={() => setPanel(null)}>
                <div className="space-y-2">
                  <Select value={task.linked_todo_id || ''} onChange={(v) => onSave({ linked_todo_id: v || null })} options={[{ value: '', label: 'To-do' }, ...links.todos.map((t) => ({ value: t.id, label: t.title }))]} />
                  <Select value={task.linked_note_id || ''} onChange={(v) => onSave({ linked_note_id: v || null })} options={[{ value: '', label: 'Note' }, ...links.notes.map((n) => ({ value: n.id, label: n.title }))]} />
                  <Select value={task.linked_habit_id || ''} onChange={(v) => onSave({ linked_habit_id: v || null })} options={[{ value: '', label: 'Habit' }, ...links.habits.map((h) => ({ value: h.id, label: h.name }))]} />
                </div>
              </MiniSheet>
            )}
            <CardComments comments={uniqueById(task.comments)} onSave={(comments) => onSave({ comments })} />
          </aside>
        </div>
      </div>
    </div>
  );
}
