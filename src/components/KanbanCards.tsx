import { useState, useEffect, useMemo } from 'react';
import { SUBJECTS, type Habit, type KanbanTask, type Note, type SubjectKey, type Todo } from '@/lib/types';
import {
  COLUMNS, type BoardList, type KanbanStatus as Status, kanbanUid as uid,
  dueTone, formatDue, isImageUrl, uniqueById, uniqueAttachments, resolveCover,
} from '@/lib/kanban';
import { compressImage, loadMedia, saveMedia } from '@/lib/mediaStore';
import { confirmDelete } from '@/lib/confirm';
import { Button, Input, Select } from '@/components/kit';
import { Trash2, X, Calendar as CalIcon, Download, CheckSquare, Paperclip, MessageSquare, Activity, Tag, AlignLeft, Image as ImageIcon, GripVertical, Link2 } from 'lucide-react';

function useResolvedUrl(url: string | null) {
  const [src, setSrc] = useState<string | null>(url && !url.startsWith('media:') ? url : null);
  useEffect(() => {
    let live = true;
    if (!url) { setSrc(null); return; }
    if (!url.startsWith('media:')) { setSrc(url); return; }
    loadMedia(url).then((v) => { if (live) setSrc(v); });
    return () => { live = false; };
  }, [url]);
  return src;
}

function CoverFrame({ url, name, className, imgClass, onClick }: { url: string; name?: string; className?: string; imgClass?: string; onClick?: (e: React.MouseEvent) => void }) {
  const src = useResolvedUrl(url);
  if (!src) return null;
  return (
    <button type="button" onClick={onClick} className={`block w-full overflow-hidden bg-transparent p-0 ${className || ''}`}>
      <img src={src} alt={name || ''} className={imgClass || 'block h-auto w-full object-contain'} />
    </button>
  );
}

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
    <div draggable onDragStart={(e) => { e.stopPropagation(); onDragStart(e); }} onDragEnd={onDragEnd} onClick={onOpen} className={`group cursor-pointer overflow-hidden rounded-xl border border-white/50 bg-white/85 shadow-sm ${dragging ? 'opacity-50' : ''}`}>
      {cover ? <CoverFrame url={cover} className="block w-full overflow-hidden border-b border-zinc-200/60" imgClass="block h-auto max-h-72 w-full object-contain object-top bg-zinc-50" /> : null}
      <div className="p-3">
        {subj && <div className="mb-1.5"><span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-zinc-800 text-white">{subj.shortName}</span></div>}
        <div className="flex items-start gap-1.5">
          <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-300 opacity-0 group-hover:opacity-100" />
          <p className="flex-1 text-sm font-medium leading-snug text-zinc-800">{task.title}</p>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="shrink-0 text-zinc-300 opacity-0 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
        {snippet ? <p className="mt-1 line-clamp-2 pl-5 text-[11px] text-zinc-500">{snippet}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-5">
          {task.due_date && <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${dueTone(task.due_date)}`}><CalIcon className="h-3 w-3" />{formatDue(task.due_date)}</span>}
          {checklist.length > 0 && <span className="inline-flex items-center gap-0.5 text-[10px] text-zinc-500"><CheckSquare className="h-3 w-3" />{done}/{checklist.length}</span>}
          {attachments.length > 0 && <span className="inline-flex items-center gap-0.5 text-[10px] text-zinc-400"><Paperclip className="h-3 w-3" />{attachments.length}</span>}
          {comments.length > 0 && <span className="inline-flex items-center gap-0.5 text-[10px] text-zinc-400"><MessageSquare className="h-3 w-3" />{comments.length}</span>}
        </div>
      </div>
    </div>
  );
}

export function CardDetailModal({ task, lists, links, onClose, onDelete, onStatus, onSave }: {
  task: KanbanTask; lists?: BoardList[]; links?: { todos: Todo[]; notes: Note[]; habits: Habit[] };
  onClose: () => void; onDelete: () => void; onStatus: (status: Status) => void; onSave: (patch: Partial<KanbanTask>) => void;
}) {
  const columns = lists?.length ? lists : COLUMNS.map((c) => ({ ...c }));
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [due, setDue] = useState(task.due_date || '');
  const [subject, setSubject] = useState(task.subject_key || '');
  const [checkText, setCheckText] = useState('');
  const [attachUrl, setAttachUrl] = useState('');
  const [attachName, setAttachName] = useState('');
  const [commentText, setCommentText] = useState('');
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const previewSrc = useResolvedUrl(preview?.url || null);
  useEffect(() => { setTitle(task.title); setDescription(task.description || ''); setDue(task.due_date || ''); setSubject(task.subject_key || ''); }, [task.id, task.title, task.description, task.due_date, task.subject_key]);
  const checklist = useMemo(() => uniqueById(task.checklist), [task.checklist]);
  const attachments = useMemo(() => uniqueAttachments(task.attachments), [task.attachments]);
  const comments = useMemo(() => uniqueById(task.comments), [task.comments]);
  const cover = resolveCover(task);
  const saveBasics = () => onSave({ title: title.trim() || task.title, description: description.trim(), due_date: due || null, subject_key: (subject || null) as SubjectKey | null });
  const doneCount = checklist.filter((i) => i.done).length;
  const coverFile = attachments.find((a) => a.url === cover);
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-4" onClick={onClose}>
      <div className="epic-glass-sheet relative my-6 w-[min(96vw,72rem)]" onClick={(e) => e.stopPropagation()}>
        {cover ? <CoverFrame url={cover} name={coverFile?.name} className="mx-auto max-h-52 w-full overflow-hidden bg-zinc-100" imgClass="mx-auto block max-h-52 w-auto max-w-full object-contain" onClick={(e) => { e.stopPropagation(); setPreview({ url: cover, name: coverFile?.name || 'Cover' }); }} /> : null}
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200/50 px-5 py-3">
          <Select value={task.status} onChange={(v) => onStatus(v as Status)} className="w-40" options={columns.map((c) => ({ value: c.id, label: c.label }))} />
          <div className="flex-1" />
          <button type="button" onClick={onDelete} className="rounded-lg p-2 text-zinc-400"><Trash2 className="h-4 w-4" /></button>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-zinc-400"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-col lg:flex-row">
          <div className="min-w-0 flex-1 space-y-5 p-5">
            <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveBasics} className="w-full bg-transparent text-xl font-semibold outline-none" />
            <section><h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500"><Tag className="mr-1 inline h-3.5 w-3.5" />Labels</h3><Select value={subject} onChange={(v) => { setSubject(v); onSave({ subject_key: (v || null) as SubjectKey | null }); }} options={[{ value: '', label: 'None' }, ...SUBJECTS.map((s) => ({ value: s.key, label: s.shortName }))]} /></section>
            <section><h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500"><CalIcon className="mr-1 inline h-3.5 w-3.5" />Due date</h3><div className="flex gap-2"><Input value={due} onChange={setDue} type="date" /><Button size="sm" onClick={() => onSave({ due_date: due || null })}>Save</Button></div></section>
            {links && <section><h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500"><Link2 className="mr-1 inline h-3.5 w-3.5" />Connected</h3><div className="grid gap-2 sm:grid-cols-3"><Select value={task.linked_todo_id || ''} onChange={(v) => onSave({ linked_todo_id: v || null })} options={[{ value: '', label: 'To-do' }, ...links.todos.map((t) => ({ value: t.id, label: t.title }))]} /><Select value={task.linked_note_id || ''} onChange={(v) => onSave({ linked_note_id: v || null })} options={[{ value: '', label: 'Note' }, ...links.notes.map((n) => ({ value: n.id, label: n.title }))]} /><Select value={task.linked_habit_id || ''} onChange={(v) => onSave({ linked_habit_id: v || null })} options={[{ value: '', label: 'Habit' }, ...links.habits.map((h) => ({ value: h.id, label: h.name }))]} /></div></section>}
            <section><h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500"><AlignLeft className="mr-1 inline h-3.5 w-3.5" />Description</h3><textarea value={description} onChange={(e) => setDescription(e.target.value)} onBlur={saveBasics} rows={3} className="min-h-[72px] w-full rounded-xl border border-zinc-200/60 bg-white/70 px-3 py-2 text-sm" /></section>
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500"><CheckSquare className="mr-1 inline h-3.5 w-3.5" />Checklist {checklist.length > 0 && <span>{doneCount}/{checklist.length}</span>}</h3>
              {checklist.map((item) => (
                <div key={item.id} className="flex items-center gap-2 py-1"><input type="checkbox" checked={item.done} onChange={() => onSave({ checklist: checklist.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)) })} /><span className={`flex-1 text-sm ${item.done ? 'line-through text-zinc-400' : ''}`}>{item.text}</span><button type="button" onClick={async () => { if (await confirmDelete(item.text || 'this checklist item')) onSave({ checklist: checklist.filter((i) => i.id !== item.id) }); }}><Trash2 className="h-3.5 w-3.5 text-zinc-300" /></button></div>
              ))}
              <div className="mt-2 flex gap-2"><Input value={checkText} onChange={setCheckText} placeholder="Add an item" /><Button size="sm" onClick={() => { const text = checkText.trim(); if (!text) return; onSave({ checklist: [...checklist, { id: uid(), text, done: false }] }); setCheckText(''); }}>Add</Button></div>
            </section>
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500"><Paperclip className="mr-1 inline h-3.5 w-3.5" />Attachments</h3>
              {attachments.map((file) => (
                <div key={file.id} className="mb-2 flex items-center gap-2 rounded-xl border border-zinc-200/60 p-2">
                  {isImageUrl(file.url) ? <CoverFrame url={file.url} name={file.name} className="h-10 w-10 rounded-md" imgClass="h-10 w-10 object-contain" onClick={() => setPreview({ url: file.url, name: file.name })} /> : <Paperclip className="h-4 w-4 text-zinc-400" />}
                  <button type="button" className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => isImageUrl(file.url) && setPreview({ url: file.url, name: file.name })}>{file.name}</button>
                  {isImageUrl(file.url) && <button type="button" className="text-[10px]" onClick={() => onSave({ cover_url: cover === file.url ? null : file.url, attachments })}>{cover === file.url ? 'Remove cover' : 'Set cover'}</button>}
                  <button type="button" onClick={async () => { if (await confirmDelete(file.name || 'this attachment')) onSave({ attachments: attachments.filter((a) => a.id !== file.id), cover_url: task.cover_url === file.url ? null : cover }); }}><Trash2 className="h-3.5 w-3.5 text-zinc-300" /></button>
                </div>
              ))}
              <div className="mt-2 grid gap-2 sm:grid-cols-2"><Input value={attachName} onChange={setAttachName} placeholder="Label" /><Input value={attachUrl} onChange={setAttachUrl} placeholder="https://…" /></div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => { const url = attachUrl.trim(); if (!url) return; const next = [...attachments, { id: uid(), url, name: attachName.trim() || url }]; onSave({ attachments: next, cover_url: resolveCover({ ...task, attachments: next }) ?? (isImageUrl(url) ? url : null) }); setAttachUrl(''); setAttachName(''); }}>Attach link</Button>
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs">Upload image<input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; const dataUrl = await compressImage(file); const mediaId = uid(); const ref = await saveMedia(mediaId, dataUrl); const next = [...attachments, { id: mediaId, url: ref, name: attachName.trim() || file.name }]; onSave({ attachments: next, cover_url: resolveCover({ ...task, attachments: next }) ?? ref }); setAttachName(''); }} /></label>
              </div>
            </section>
          </div>
          <aside className="w-full border-t border-zinc-200/50 p-5 lg:w-80 lg:border-l lg:border-t-0">
            <h3 className="mb-3 text-xs font-semibold uppercase text-zinc-500"><MessageSquare className="mr-1 inline h-3.5 w-3.5" />Comments</h3>
            {comments.map((c) => <div key={c.id} className="mb-2 rounded-lg bg-white/70 px-2.5 py-2 text-xs">{c.text}</div>)}
            <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} rows={3} className="w-full rounded-xl border border-zinc-200 px-2.5 py-2 text-xs" />
            <Button size="sm" className="mt-2 w-full" onClick={() => { const text = commentText.trim(); if (!text) return; onSave({ comments: [...comments, { id: uid(), text, created_at: new Date().toISOString() }] }); setCommentText(''); }}>Save comment</Button>
            <h3 className="mb-3 mt-6 text-xs font-semibold uppercase text-zinc-500"><Activity className="mr-1 inline h-3.5 w-3.5" />Activity</h3>
            <p className="text-xs text-zinc-500">You opened this card</p>
          </aside>
        </div>
      </div>
      {preview && previewSrc && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/80 p-6" onClick={() => setPreview(null)}>
          <div className="flex max-w-5xl flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <img src={previewSrc} alt={preview.name} className="max-h-[80vh] max-w-full object-contain" />
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm">
              <span className="max-w-[240px] truncate font-medium">{preview.name}</span>
              <a href={previewSrc} download={preview.name} className="inline-flex items-center gap-1"><Download className="h-3.5 w-3.5" />Download</a>
              <button type="button" onClick={() => onSave({ cover_url: cover === preview.url ? null : preview.url })}>{cover === preview.url ? 'Remove cover' : 'Set cover'}</button>
              <button type="button" onClick={() => setPreview(null)}><X className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
