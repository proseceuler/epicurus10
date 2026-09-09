import { useEffect, useMemo, useRef, useState } from 'react';
import { SUBJECTS, type Habit, type KanbanAttachment, type KanbanTask, type Note, type SubjectKey, type Todo } from '@/lib/types';
import {
  COLUMNS, type BoardList, type KanbanStatus as Status, kanbanUid as uid,
  dueTone, formatDue, isImageUrl, uniqueById, uniqueAttachments, resolveCover,
  splitDue, joinDue,
} from '@/lib/kanban';
import { compressImage, saveMedia } from '@/lib/mediaStore';
import { confirmDelete } from '@/lib/confirm';
import { Button, Input, Select } from '@/components/kit';
import { DateGrid, TimeField } from '@/components/fields';
import { ActionChip, MiniSheet, CoverFrame, useResolvedUrl, rememberLink, readRecent } from '@/components/kanban/cardKit';
import {
  Trash2, X, Calendar as CalIcon, Download, CheckSquare, Paperclip,
  MessageSquare, Tag, AlignLeft, Link2, FileText,
} from 'lucide-react';

export function CardDetailModal({ task, lists, links, recentLinks, onClose, onDelete, onStatus, onSave }: {
  task: KanbanTask; lists?: BoardList[]; links?: { todos: Todo[]; notes: Note[]; habits: Habit[] };
  recentLinks?: KanbanAttachment[];
  onClose: () => void; onDelete: () => void; onStatus: (status: Status) => void; onSave: (patch: Partial<KanbanTask>) => void;
}) {
  const columns = lists?.length ? lists : COLUMNS.map((c) => ({ ...c }));
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [editingDesc, setEditingDesc] = useState(false);
  const [due, setDue] = useState(task.due_date || '');
  const [dueOn, setDueOn] = useState(Boolean(task.due_date));
  const [dueTimeOn, setDueTimeOn] = useState(Boolean(splitDue(task.due_date).time));
  const [reminder, setReminder] = useState('1 Day before');
  const [subject, setSubject] = useState(task.subject_key || '');
  const [checkText, setCheckText] = useState('');
  const [attachUrl, setAttachUrl] = useState('');
  const [attachName, setAttachName] = useState('');
  const [commentText, setCommentText] = useState('');
  const [panel, setPanel] = useState<null | 'labels' | 'dates' | 'checklist' | 'attach' | 'connect'>(null);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewSrc = useResolvedUrl(preview?.url || null);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description || '');
    setDue(task.due_date || '');
    setDueOn(Boolean(task.due_date));
    setDueTimeOn(Boolean(splitDue(task.due_date).time));
    setSubject(task.subject_key || '');
    setEditingDesc(false);
    setPanel(null);
  }, [task.id, task.title, task.description, task.due_date, task.subject_key]);

  const checklist = useMemo(() => uniqueById(task.checklist), [task.checklist]);
  const attachments = useMemo(() => uniqueAttachments(task.attachments), [task.attachments]);
  const comments = useMemo(() => uniqueById(task.comments), [task.comments]);
  const cover = resolveCover(task);
  const doneCount = checklist.filter((i) => i.done).length;
  const coverFile = attachments.find((a) => a.url === cover);
  const subj = SUBJECTS.find((s) => s.key === subject);
  const recent = useMemo(
    () => uniqueAttachments([...(recentLinks ?? []), ...readRecent()]).filter((f) => !attachments.some((a) => a.url === f.url)).slice(0, 6),
    [recentLinks, attachments],
  );

  const saveBasics = () => onSave({ title: title.trim() || task.title, description: description.trim(), due_date: due || null, subject_key: (subject || null) as SubjectKey | null });

  const addAttachment = (file: KanbanAttachment, makeCover = isImageUrl(file.url)) => {
    const next = uniqueAttachments([...attachments, file]);
    rememberLink(file);
    onSave({ attachments: next, cover_url: makeCover ? (resolveCover({ ...task, attachments: next }) ?? file.url) : cover });
  };

  const insertLink = () => {
    const url = attachUrl.trim();
    if (!url) return;
    addAttachment({ id: uid(), url, name: attachName.trim() || url }, false);
    setAttachUrl('');
    setAttachName('');
    setPanel(null);
  };

  const DatePickerBody = () => (
    <>
      <DateGrid value={splitDue(due).date} onChange={(iso) => { const t = splitDue(due).time; setDueOn(true); setDue(joinDue(iso, dueTimeOn ? (t || '09:00') : '') || iso); }} />
      <label className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-600">
        <input type="checkbox" checked={dueOn} onChange={(e) => {
          const on = e.target.checked; setDueOn(on);
          if (!on) setDue('');
          else if (!splitDue(due).date) {
            const today = new Date();
            const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            setDue(joinDue(iso, dueTimeOn ? (splitDue(due).time || '09:00') : '') || iso);
          }
        }} />
        Due date
        <span className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-[11px] text-zinc-700">{splitDue(due).date ? new Date(splitDue(due).date + 'T00:00:00').toLocaleDateString('en-US') : 'M/D/YYYY'}</span>
        {dueTimeOn ? (
          <div className="w-[7.5rem]"><TimeField value={splitDue(due).time || '09:00'} onChange={(t) => setDue(joinDue(splitDue(due).date, t) || due)} /></div>
        ) : (
          <button type="button" onClick={() => { setDueTimeOn(true); const { date, time } = splitDue(due); setDue(joinDue(date || new Date().toISOString().slice(0, 10), time || '09:00') || ''); }} className="rounded-md bg-zinc-100 px-2 py-1 text-[11px] text-zinc-500">Add time</button>
        )}
      </label>
      <label className="mt-3 block text-[11px] font-medium text-zinc-600">Set due date reminder</label>
      <Select value={reminder} onChange={setReminder} options={[{ value: 'None', label: 'None' }, { value: 'At time of due date', label: 'At time of due date' }, { value: '1 Day before', label: '1 Day before' }, { value: '2 Days before', label: '2 Days before' }]} />
      <div className="mt-3 grid gap-2">
        <Button size="sm" className="w-full" onClick={() => { onSave({ due_date: dueOn ? (due || null) : null }); setPanel(null); }}>Save</Button>
        <Button size="sm" variant="ghost" className="w-full" onClick={() => { setDue(''); setDueOn(false); onSave({ due_date: null }); setPanel(null); }}>Remove</Button>
      </div>
    </>
  );

  const AttachBody = () => (
    <>
      <p className="text-[13px] font-medium text-zinc-800">Attach a file from your computer</p>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
        const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
        const dataUrl = await compressImage(file); const mediaId = uid();
        const refUrl = await saveMedia(mediaId, dataUrl);
        addAttachment({ id: mediaId, url: refUrl, name: attachName.trim() || file.name });
        setAttachName(''); setPanel(null);
      }} />
      <button type="button" onClick={() => fileRef.current?.click()} className="mt-3 w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">Choose a file</button>
      <label className="mt-4 block text-[13px] font-medium text-zinc-800">Search or paste a link</label>
      <Input value={attachUrl} onChange={setAttachUrl} placeholder="Find recent links or paste a new link" className="mt-1" />
      <label className="mt-3 block text-[13px] font-medium text-zinc-800">Display text</label>
      <Input value={attachName} onChange={setAttachName} placeholder="Text to display" className="mt-1" />
      {recent.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Recently viewed</p>
          {recent.map((file) => (
            <button key={file.id} type="button" onClick={() => { setAttachUrl(file.url); setAttachName(file.name); }} className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-zinc-50">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
              <span className="min-w-0"><span className="block truncate text-[13px] font-medium text-zinc-800">{file.name}</span></span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>Cancel</Button>
        <Button size="sm" disabled={!attachUrl.trim()} onClick={insertLink}>Insert</Button>
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-4" onClick={onClose}>
      <div className="epic-glass-sheet relative my-6 w-[min(96vw,52rem)] overflow-visible" onClick={(e) => e.stopPropagation()}>
        {cover ? <CoverFrame url={cover} name={coverFile?.name} className="mx-auto max-h-52 w-full overflow-hidden rounded-t-[1.25rem] bg-zinc-100" imgClass="mx-auto block max-h-52 w-auto max-w-full object-contain" onClick={(e) => { e.stopPropagation(); setPreview({ url: cover, name: coverFile?.name || 'Cover' }); }} /> : null}
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
              <div className="relative">
                <button type="button" onClick={() => setPanel(panel === 'labels' ? null : 'labels')} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"><Tag className="h-3.5 w-3.5" /> + Add</button>
                <MiniSheet title="Labels" open={panel === 'labels'} onClose={() => setPanel(null)}>
                  <p className="mb-2 text-[11px] text-zinc-500">Pick a subject label for this card.</p>
                  <div className="space-y-1">
                    <button type="button" onClick={() => { setSubject(''); onSave({ subject_key: null }); setPanel(null); }} className={`flex w-full items-center rounded-lg px-2.5 py-1.5 text-sm ${!subject ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-100'}`}>None</button>
                    {SUBJECTS.map((s) => (
                      <button key={s.key} type="button" onClick={() => { setSubject(s.key); onSave({ subject_key: s.key }); setPanel(null); }} className={`flex w-full items-center rounded-lg px-2.5 py-1.5 text-sm ${subject === s.key ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-100'}`}>{s.shortName}</button>
                    ))}
                  </div>
                </MiniSheet>
              </div>
              <div className="relative">
                <button type="button" onClick={() => setPanel(panel === 'checklist' ? null : 'checklist')} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"><CheckSquare className="h-3.5 w-3.5" /> Checklist</button>
                <MiniSheet title="Checklist" open={panel === 'checklist'} onClose={() => setPanel(null)}>
                  <p className="mb-2 text-[11px] font-medium text-zinc-600">Add an item</p>
                  <Input value={checkText} onChange={setCheckText} placeholder="e.g. Review chapter 4" />
                  <div className="mt-3 flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>Cancel</Button>
                    <Button size="sm" onClick={() => { const text = checkText.trim(); if (!text) return; onSave({ checklist: [...checklist, { id: uid(), text, done: false }] }); setCheckText(''); setPanel(null); }}>Add</Button>
                  </div>
                </MiniSheet>
              </div>
              {!dueOn || !due ? (
                <div className="relative">
                  <button type="button" onClick={() => setPanel(panel === 'dates' ? null : 'dates')} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"><CalIcon className="h-3.5 w-3.5" /> Dates</button>
                  <MiniSheet title="Dates" open={panel === 'dates'} onClose={() => setPanel(null)}>
                    <DatePickerBody />
                  </MiniSheet>
                </div>
              ) : null}
              <div className="relative">
                <button type="button" onClick={() => setPanel(panel === 'attach' ? null : 'attach')} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"><Paperclip className="h-3.5 w-3.5" /> Attachment</button>
                <MiniSheet title="Attach" open={panel === 'attach'} onClose={() => setPanel(null)}>
                  <AttachBody />
                </MiniSheet>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-zinc-500">Labels</span>
              {subj ? <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-white">{subj.shortName}</span> : null}
              <button type="button" onClick={() => setPanel('labels')} className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-100 text-zinc-500 hover:bg-zinc-200">+</button>
              {due ? (
                <div className="relative">
                  <button type="button" onClick={() => setPanel(panel === 'dates' ? null : 'dates')} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${dueTone(due)}`}><CalIcon className="h-3 w-3" />{formatDue(due)}</button>
                  <MiniSheet title="Dates" open={panel === 'dates'} onClose={() => setPanel(null)}>
                    <DatePickerBody />
                  </MiniSheet>
                </div>
              ) : null}
            </div>
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500"><AlignLeft className="h-3.5 w-3.5" /> Description</h3>
              {editingDesc || description.trim() ? (
                <textarea autoFocus={editingDesc && !description.trim()} value={description} onChange={(e) => setDescription(e.target.value)} onBlur={() => { saveBasics(); setEditingDesc(false); }} rows={4} placeholder="Add a more detailed description..." className="min-h-[88px] w-full rounded-xl border border-zinc-200/70 bg-white/80 px-3 py-2 text-sm outline-none focus:border-zinc-300" />
              ) : (
                <button type="button" onClick={() => setEditingDesc(true)} className="w-full rounded-xl bg-zinc-100/90 px-3 py-3 text-left text-sm text-zinc-500 hover:bg-zinc-200/70">Add a more detailed description...</button>
              )}
            </section>
            {checklist.length > 0 && (
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500"><CheckSquare className="h-3.5 w-3.5" /> Checklist <span className="font-medium normal-case text-zinc-400">{doneCount}/{checklist.length}</span></h3>
                {checklist.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 py-1">
                    <input type="checkbox" checked={item.done} onChange={() => onSave({ checklist: checklist.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)) })} />
                    <span className={`flex-1 text-sm ${item.done ? 'line-through text-zinc-400' : ''}`}>{item.text}</span>
                    <button type="button" onClick={async () => { if (await confirmDelete(item.text || 'this checklist item')) onSave({ checklist: checklist.filter((i) => i.id !== item.id) }); }}><Trash2 className="h-3.5 w-3.5 text-zinc-300" /></button>
                  </div>
                ))}
              </section>
            )}
            {attachments.length > 0 && (
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500"><Paperclip className="h-3.5 w-3.5" /> Attachments</h3>
                {attachments.map((file) => (
                  <div key={file.id} className="mb-2 flex items-center gap-2 rounded-xl border border-zinc-200/60 bg-white/70 p-2">
                    {isImageUrl(file.url) ? (
                      <CoverFrame url={file.url} name={file.name} className="h-10 w-10 rounded-md" imgClass="h-10 w-10 object-contain" onClick={() => setPreview({ url: file.url, name: file.name })} />
                    ) : (
                      <FileText className="h-4 w-4 text-zinc-400" />
                    )}
                    <button type="button" className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => isImageUrl(file.url) && setPreview({ url: file.url, name: file.name })}>{file.name}</button>
                    {isImageUrl(file.url) && (
                      <button type="button" className="text-[10px] text-zinc-500" onClick={() => onSave({ cover_url: cover === file.url ? null : file.url, attachments })}>{cover === file.url ? 'Remove cover' : 'Set cover'}</button>
                    )}
                    <button type="button" onClick={async () => { if (await confirmDelete(file.name || 'this attachment')) onSave({ attachments: attachments.filter((a) => a.id !== file.id), cover_url: task.cover_url === file.url ? null : cover }); }}><Trash2 className="h-3.5 w-3.5 text-zinc-300" /></button>
                  </div>
                ))}
              </section>
            )}
          </div>
          <aside className="relative w-full overflow-visible border-t border-zinc-200/50 p-5 lg:w-72 lg:border-l lg:border-t-0">
            {links && (
              <div className="relative mb-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Add to card</p>
                <ActionChip icon={Link2} label="Connect" active={panel === 'connect'} onClick={() => setPanel(panel === 'connect' ? null : 'connect')} />
                <MiniSheet title="Connect" open={panel === 'connect'} onClose={() => setPanel(null)} align="right">
                  <div className="space-y-2">
                    <Select value={task.linked_todo_id || ''} onChange={(v) => onSave({ linked_todo_id: v || null })} options={[{ value: '', label: 'To-do' }, ...links.todos.map((t) => ({ value: t.id, label: t.title }))]} />
                    <Select value={task.linked_note_id || ''} onChange={(v) => onSave({ linked_note_id: v || null })} options={[{ value: '', label: 'Note' }, ...links.notes.map((n) => ({ value: n.id, label: n.title }))]} />
                    <Select value={task.linked_habit_id || ''} onChange={(v) => onSave({ linked_habit_id: v || null })} options={[{ value: '', label: 'Habit' }, ...links.habits.map((h) => ({ value: h.id, label: h.name }))]} />
                  </div>
                </MiniSheet>
              </div>
            )}
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-400"><MessageSquare className="mr-1 inline h-3.5 w-3.5" /> Comments and activity</h3>
            {comments.map((c) => <div key={c.id} className="mb-2 rounded-lg bg-white/70 px-2.5 py-2 text-xs">{c.text}</div>)}
            <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} rows={3} placeholder="Write a comment..." className="w-full rounded-xl border border-zinc-200 bg-white/80 px-2.5 py-2 text-xs outline-none" />
            <Button size="sm" className="mt-2 w-full" onClick={() => { const text = commentText.trim(); if (!text) return; onSave({ comments: [...comments, { id: uid(), text, created_at: new Date().toISOString() }] }); setCommentText(''); }}>Save comment</Button>
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
