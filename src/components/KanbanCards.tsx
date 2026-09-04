import { useState, useEffect, useMemo } from 'react';
import { SUBJECTS, type KanbanTask, type SubjectKey } from '@/lib/types';
import {
  COLUMNS,
  type KanbanStatus as Status,
  kanbanUid as uid,
  dueTone,
  formatDue,
  isImageUrl,
  uniqueById,
  uniqueAttachments,
  resolveCover,
} from '@/lib/kanban';
import { Button, Input, Select } from '@/components/kit';
import {
  Trash2, X, Calendar as CalIcon,
  CheckSquare, Paperclip, MessageSquare, Activity, Tag, AlignLeft, Image as ImageIcon, GripVertical,
} from 'lucide-react';

export function KanbanCardPreview({ task, dragging, onDragStart, onDragEnd, onOpen, onDelete }: {
  task: KanbanTask; dragging: boolean; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void; onOpen: () => void; onDelete: () => void;
}) {
  const subj = SUBJECTS.find((s) => s.key === task.subject_key);
  const cover = resolveCover(task);
  const checklist = task.checklist ?? [];
  const done = checklist.filter((i) => i.done).length;
  const attachments = uniqueAttachments(task.attachments);
  const comments = task.comments ?? [];
  const snippet = (task.description || '').trim();
  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onOpen} className={`group cursor-pointer overflow-hidden rounded-xl border border-white/50 bg-white/85 shadow-sm backdrop-blur-sm transition hover:bg-white hover:shadow-md ${dragging ? 'opacity-50' : ''}`}>
      {cover ? <div className="h-24 w-full bg-zinc-100"><img src={cover} alt="" className="h-full w-full object-cover" /></div> : null}
      <div className="p-3">
        {subj && <div className="mb-1.5"><span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-zinc-800 text-white">{subj.shortName}</span></div>}
        <div className="flex items-start gap-1.5">
          <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-300 opacity-0 group-hover:opacity-100" />
          <p className="flex-1 text-sm font-medium leading-snug text-zinc-800">{task.title}</p>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="shrink-0 text-zinc-300 opacity-0 transition group-hover:opacity-100 hover:text-zinc-600"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
        {snippet ? <p className="mt-1 line-clamp-2 pl-5 text-[11px] leading-snug text-zinc-500">{snippet}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-5">
          {task.due_date && <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${dueTone(task.due_date)}`}><CalIcon className="h-3 w-3" />{formatDue(task.due_date)}</span>}
          {snippet ? <span className="inline-flex items-center text-[10px] text-zinc-400" title="Has description"><AlignLeft className="h-3 w-3" /></span> : null}
          {checklist.length > 0 && <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${done === checklist.length ? 'bg-emerald-50 text-emerald-700' : 'text-zinc-500'}`}><CheckSquare className="h-3 w-3" />{done}/{checklist.length}</span>}
          {attachments.length > 0 && <span className="inline-flex items-center gap-0.5 text-[10px] text-zinc-400"><Paperclip className="h-3 w-3" />{attachments.length}</span>}
          {comments.length > 0 && <span className="inline-flex items-center gap-0.5 text-[10px] text-zinc-400"><MessageSquare className="h-3 w-3" />{comments.length}</span>}
        </div>
      </div>
    </div>
  );
}

export function CardDetailModal({ task, onClose, onDelete, onStatus, onSave }: {
  task: KanbanTask; onClose: () => void; onDelete: () => void; onStatus: (status: Status) => void; onSave: (patch: Partial<KanbanTask>) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [due, setDue] = useState(task.due_date || '');
  const [subject, setSubject] = useState(task.subject_key || '');
  const [checkText, setCheckText] = useState('');
  const [attachUrl, setAttachUrl] = useState('');
  const [attachName, setAttachName] = useState('');
  const [commentText, setCommentText] = useState('');

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description || '');
    setDue(task.due_date || '');
    setSubject(task.subject_key || '');
  }, [task.id, task.title, task.description, task.due_date, task.subject_key]);

  const checklist = useMemo(() => uniqueById(task.checklist), [task.checklist]);
  const attachments = useMemo(() => uniqueAttachments(task.attachments), [task.attachments]);
  const comments = useMemo(() => uniqueById(task.comments), [task.comments]);
  const cover = resolveCover(task);
  const saveBasics = () => onSave({
    title: title.trim() || task.title,
    description: description.trim(),
    due_date: due || null,
    subject_key: (subject || null) as SubjectKey | null,
  });
  const doneCount = checklist.filter((i) => i.done).length;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass glass-shadow-lg relative my-8 w-full max-w-3xl overflow-hidden rounded-2xl" onClick={(e) => e.stopPropagation()}>
        {cover ? <div className="h-40 w-full bg-zinc-100"><img src={cover} alt="" className="h-full w-full object-cover" /></div> : null}
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200/50 px-5 py-3">
          <select value={task.status} onChange={(e) => onStatus(e.target.value as Status)} className="rounded-lg border border-zinc-200/80 bg-white/70 px-2 py-1.5 text-xs font-medium text-zinc-700">
            {COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${dueTone(task.due_date)}`}>{COLUMNS.find((c) => c.id === task.status)?.label}</span>
          <div className="flex-1" />
          <button type="button" onClick={onDelete} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" title="Delete"><Trash2 className="h-4 w-4" /></button>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-col lg:flex-row">
          <div className="min-w-0 flex-1 space-y-5 p-5">
            <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveBasics} className="w-full bg-transparent text-xl font-semibold text-zinc-800 outline-none" />
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500"><Tag className="h-3.5 w-3.5" /> Labels</h3>
              <Select value={subject} onChange={(v) => { setSubject(v); onSave({ subject_key: (v || null) as SubjectKey | null }); }} options={[{ value: '', label: 'None' }, ...SUBJECTS.map((s) => ({ value: s.key, label: s.shortName }))]} />
            </section>
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500"><CalIcon className="h-3.5 w-3.5" /> Due date</h3>
              <div className="flex items-center gap-2">
                <Input value={due} onChange={setDue} type="date" />
                <Button size="sm" onClick={() => onSave({ due_date: due || null })}>Save</Button>
                {due ? <button type="button" onClick={() => { setDue(''); onSave({ due_date: null }); }} className="text-xs text-zinc-500 hover:text-zinc-800">Clear</button> : null}
              </div>
            </section>
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500"><AlignLeft className="h-3.5 w-3.5" /> Description</h3>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} onBlur={saveBasics} rows={3} placeholder="Add a more detailed description…" className="min-h-[72px] w-full rounded-xl border border-zinc-200/60 bg-white/70 px-3 py-2 text-sm leading-relaxed text-zinc-700 outline-none" />
            </section>
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <CheckSquare className="h-3.5 w-3.5" /> Checklist
                {checklist.length > 0 && <span className="ml-auto font-medium normal-case tracking-normal text-zinc-400">{doneCount}/{checklist.length}</span>}
              </h3>
              {checklist.length > 0 && <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-zinc-200"><div className="h-full bg-zinc-900" style={{ width: `${(doneCount / checklist.length) * 100}%` }} /></div>}
              <div className="space-y-1.5">
                {checklist.map((item) => (
                  <div key={item.id} className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-white/60">
                    <input type="checkbox" checked={item.done} onChange={() => onSave({ checklist: checklist.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)) })} className="h-4 w-4 accent-zinc-900" />
                    <span className={`flex-1 text-sm ${item.done ? 'text-zinc-400 line-through' : 'text-zinc-700'}`}>{item.text}</span>
                    <button type="button" onClick={() => onSave({ checklist: checklist.filter((i) => i.id !== item.id) })} className="text-zinc-300 opacity-0 group-hover:opacity-100 hover:text-zinc-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Input value={checkText} onChange={setCheckText} placeholder="Add an item" />
                <Button size="sm" onClick={() => { const text = checkText.trim(); if (!text) return; onSave({ checklist: [...checklist, { id: uid(), text, done: false }] }); setCheckText(''); }}>Add</Button>
              </div>
            </section>
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500"><Paperclip className="h-3.5 w-3.5" /> Attachments</h3>
              <div className="space-y-2">
                {attachments.map((file) => {
                  const isCover = cover === file.url;
                  return (
                    <div key={file.id} className="flex items-center gap-2 rounded-xl border border-zinc-200/60 bg-white/60 p-2">
                      {isImageUrl(file.url) ? <img src={file.url} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" /> : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-zinc-100"><Paperclip className="h-4 w-4 text-zinc-400" /></div>}
                      <div className="min-w-0 flex-1">
                        <a href={file.url} target="_blank" rel="noreferrer" className="truncate text-sm font-medium text-zinc-800 hover:underline">{file.name}</a>
                        {isCover ? <p className="text-[10px] text-zinc-400">Cover</p> : null}
                      </div>
                      {isImageUrl(file.url) && (
                        <button type="button" onClick={() => onSave({ cover_url: isCover ? null : file.url, attachments })} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-zinc-500 hover:bg-zinc-100">
                          <ImageIcon className="h-3 w-3" />{isCover ? 'Remove cover' : 'Set cover'}
                        </button>
                      )}
                      <button type="button" onClick={() => { const next = attachments.filter((a) => a.id !== file.id); onSave({ attachments: next, cover_url: task.cover_url === file.url ? null : resolveCover({ ...task, attachments: next }) }); }} className="text-zinc-300 hover:text-zinc-600"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Input value={attachName} onChange={setAttachName} placeholder="Label (optional)" />
                <Input value={attachUrl} onChange={setAttachUrl} placeholder="https://…" />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => {
                  const url = attachUrl.trim();
                  if (!url) return;
                  if (attachments.some((a) => a.url === url)) { setAttachUrl(''); setAttachName(''); return; }
                  const next = [...attachments, { id: uid(), url, name: attachName.trim() || url }];
                  const keep = resolveCover({ ...task, attachments: next });
                  onSave({ attachments: next, cover_url: keep ?? (isImageUrl(url) ? url : null) });
                  setAttachUrl('');
                  setAttachName('');
                }}>Attach link</Button>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Upload image
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const url = String(reader.result || '');
                        if (!url) return;
                        const next = [...attachments, { id: uid(), url, name: attachName.trim() || file.name }];
                        const keep = resolveCover({ ...task, attachments: next });
                        onSave({ attachments: next, cover_url: keep ?? url });
                        setAttachName('');
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              </div>
            </section>
          </div>
          <aside className="w-full border-t border-zinc-200/50 bg-white/30 p-5 lg:w-64 lg:border-l lg:border-t-0">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500"><MessageSquare className="h-3.5 w-3.5" /> Comments</h3>
            <div className="mb-3 space-y-2">
              {comments.length === 0 && <p className="text-xs text-zinc-400">No comments yet.</p>}
              {comments.map((c) => (
                <div key={c.id} className="rounded-lg bg-white/70 px-2.5 py-2">
                  <p className="text-xs text-zinc-700">{c.text}</p>
                  <p className="mt-1 text-[10px] text-zinc-400">{new Date(c.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                </div>
              ))}
            </div>
            <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} rows={3} placeholder="Write a comment…" className="w-full rounded-xl border border-zinc-200 bg-white px-2.5 py-2 text-xs text-zinc-800 outline-none" />
            <Button size="sm" className="mt-2 w-full" onClick={() => {
              const text = commentText.trim();
              if (!text) return;
              onSave({ comments: [...comments, { id: uid(), text, created_at: new Date().toISOString() }] });
              setCommentText('');
            }}>Save comment</Button>
            <h3 className="mb-3 mt-6 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500"><Activity className="h-3.5 w-3.5" /> Activity</h3>
            <div className="flex gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold text-white">G</div>
              <div>
                <p className="text-xs text-zinc-700"><span className="font-semibold">You</span> opened this card</p>
                <p className="text-[10px] text-zinc-400">Just now</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
