import { useEffect, useMemo, useRef, useState } from 'react';
import { SUBJECTS, type Habit, type KanbanAttachment, type KanbanTask, type Note, type SubjectKey, type Todo } from '@/lib/types';
import {
  COLUMNS, type BoardList, type KanbanStatus as Status, kanbanUid as uid,
  dueTone, formatDue, isImageUrl, uniqueById, uniqueAttachments, resolveCover,
} from '@/lib/kanban';
import { compressImage, loadMedia, saveMedia } from '@/lib/mediaStore';
import { confirmDelete } from '@/lib/confirm';
import { Button, Input, Select, DateField } from '@/components/kit';
import { MotionPopover } from '@/components/MotionUI';
import {
  Trash2, X, Calendar as CalIcon, Download, CheckSquare, Paperclip,
  MessageSquare, Activity, Tag, AlignLeft, GripVertical, Link2, FileText,
} from 'lucide-react';

const RECENT_KEY = 'epicure:recent-links';

function readRecent(): KanbanAttachment[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as KanbanAttachment[]) : [];
    return uniqueAttachments(parsed).slice(0, 8);
  } catch {
    return [];
  }
}

function rememberLink(file: KanbanAttachment) {
  if (typeof window === 'undefined' || !file.url) return;
  const next = uniqueAttachments([file, ...readRecent()]).slice(0, 8);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

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

function ActionChip({ icon: Icon, label, active, onClick }: { icon: typeof Tag; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium epic-press ${
        active ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200/80'
      }`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
      {label}
    </button>
  );
}

function MiniSheet({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  return (
    <MotionPopover open={open} className="absolute right-0 top-0 z-20 w-[min(92vw,20.5rem)] p-0">
      <div ref={ref} className="relative overflow-hidden rounded-[1.15rem] bg-white shadow-[0_16px_40px_rgba(24,24,27,0.16)]">
        <div className="relative flex items-center justify-center border-b border-zinc-100 px-10 py-2.5">
          <h4 className="text-[13px] font-semibold text-zinc-700">{title}</h4>
          <button type="button" onClick={onClose} className="absolute right-2.5 top-2 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            <X className="h-4 w-4" />
          </button>
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

            {(subj || due) && (
              <div className="flex flex-wrap gap-1.5">
                {subj && <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-white">{subj.shortName}</span>}
                {due && <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${dueTone(due)}`}><CalIcon className="h-3 w-3" />{formatDue(due)}</span>}
              </div>
            )}

            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <AlignLeft className="h-3.5 w-3.5" /> Description
              </h3>
              {editingDesc || description.trim() ? (
                <div>
                  <textarea
                    autoFocus={editingDesc && !description.trim()}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={() => { saveBasics(); setEditingDesc(false); }}
                    rows={4}
                    placeholder="Add a more detailed description…"
                    className="min-h-[88px] w-full rounded-xl border border-zinc-200/70 bg-white/80 px-3 py-2 text-sm outline-none focus:border-zinc-300"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingDesc(true)}
                  className="w-full rounded-xl bg-zinc-100/90 px-3 py-3 text-left text-sm text-zinc-500 hover:bg-zinc-200/70"
                >
                  Add a more detailed description…
                </button>
              )}
            </section>

            {checklist.length > 0 && (
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <CheckSquare className="h-3.5 w-3.5" /> Checklist
                  <span className="font-medium normal-case text-zinc-400">{doneCount}/{checklist.length}</span>
                </h3>
                {checklist.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 py-1">
                    <input type="checkbox" checked={item.done} onChange={() => onSave({ checklist: checklist.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)) })} />
                    <span className={`flex-1 text-sm ${item.done ? 'line-through text-zinc-400' : ''}`}>{item.text}</span>
                    <button type="button" onClick={async () => { if (await confirmDelete(item.text || 'this checklist item')) onSave({ checklist: checklist.filter((i) => i.id !== item.id) }); }}>
                      <Trash2 className="h-3.5 w-3.5 text-zinc-300" />
                    </button>
                  </div>
                ))}
              </section>
            )}

            {attachments.length > 0 && (
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <Paperclip className="h-3.5 w-3.5" /> Attachments
                </h3>
                {attachments.map((file) => (
                  <div key={file.id} className="mb-2 flex items-center gap-2 rounded-xl border border-zinc-200/60 bg-white/70 p-2">
                    {isImageUrl(file.url) ? (
                      <CoverFrame url={file.url} name={file.name} className="h-10 w-10 rounded-md" imgClass="h-10 w-10 object-contain" onClick={() => setPreview({ url: file.url, name: file.name })} />
                    ) : (
                      <FileText className="h-4 w-4 text-zinc-400" />
                    )}
                    <button type="button" className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => isImageUrl(file.url) && setPreview({ url: file.url, name: file.name })}>{file.name}</button>
                    {isImageUrl(file.url) && (
                      <button type="button" className="text-[10px] text-zinc-500" onClick={() => onSave({ cover_url: cover === file.url ? null : file.url, attachments })}>
                        {cover === file.url ? 'Remove cover' : 'Set cover'}
                      </button>
                    )}
                    <button type="button" onClick={async () => { if (await confirmDelete(file.name || 'this attachment')) onSave({ attachments: attachments.filter((a) => a.id !== file.id), cover_url: task.cover_url === file.url ? null : cover }); }}>
                      <Trash2 className="h-3.5 w-3.5 text-zinc-300" />
                    </button>
                  </div>
                ))}
              </section>
            )}
          </div>

          <aside className="relative w-full overflow-visible border-t border-zinc-200/50 p-5 lg:w-56 lg:border-l lg:border-t-0">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Add to card</p>
            <div className="space-y-1.5">
              <ActionChip icon={Tag} label="Labels" active={panel === 'labels'} onClick={() => setPanel(panel === 'labels' ? null : 'labels')} />
              <ActionChip icon={CalIcon} label="Dates" active={panel === 'dates'} onClick={() => setPanel(panel === 'dates' ? null : 'dates')} />
              <ActionChip icon={CheckSquare} label="Checklist" active={panel === 'checklist'} onClick={() => setPanel(panel === 'checklist' ? null : 'checklist')} />
              <ActionChip icon={Paperclip} label="Attachment" active={panel === 'attach'} onClick={() => setPanel(panel === 'attach' ? null : 'attach')} />
              {links && <ActionChip icon={Link2} label="Connect" active={panel === 'connect'} onClick={() => setPanel(panel === 'connect' ? null : 'connect')} />}
            </div>

            <MiniSheet title="Labels" open={panel === 'labels'} onClose={() => setPanel(null)}>
              <p className="mb-2 text-[11px] text-zinc-500">Pick a subject label for this card.</p>
              <div className="space-y-1">
                <button type="button" onClick={() => { setSubject(''); onSave({ subject_key: null }); setPanel(null); }} className={`flex w-full items-center rounded-lg px-2.5 py-1.5 text-sm ${!subject ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-100'}`}>None</button>
                {SUBJECTS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => { setSubject(s.key); onSave({ subject_key: s.key }); setPanel(null); }}
                    className={`flex w-full items-center rounded-lg px-2.5 py-1.5 text-sm ${subject === s.key ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-100'}`}
                  >
                    {s.shortName}
                  </button>
                ))}
              </div>
            </MiniSheet>

            <MiniSheet title="Dates" open={panel === 'dates'} onClose={() => setPanel(null)}>
              <p className="mb-2 text-[11px] font-medium text-zinc-600">Due date</p>
              <DateField value={due} onChange={setDue} />
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setDue(''); onSave({ due_date: null }); setPanel(null); }}>Remove</Button>
                <Button size="sm" onClick={() => { onSave({ due_date: due || null }); setPanel(null); }}>Save</Button>
              </div>
            </MiniSheet>

            <MiniSheet title="Checklist" open={panel === 'checklist'} onClose={() => setPanel(null)}>
              <p className="mb-2 text-[11px] font-medium text-zinc-600">Add an item</p>
              <Input value={checkText} onChange={setCheckText} placeholder="e.g. Review chapter 4" />
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>Cancel</Button>
                <Button size="sm" onClick={() => {
                  const text = checkText.trim();
                  if (!text) return;
                  onSave({ checklist: [...checklist, { id: uid(), text, done: false }] });
                  setCheckText('');
                  setPanel(null);
                }}>Add</Button>
              </div>
            </MiniSheet>

            <MiniSheet title="Attach" open={panel === 'attach'} onClose={() => setPanel(null)}>
              <p className="text-[13px] font-medium text-zinc-800">Attach a file from your computer</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">You can also drag and drop files to upload them.</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  const dataUrl = await compressImage(file);
                  const mediaId = uid();
                  const refUrl = await saveMedia(mediaId, dataUrl);
                  addAttachment({ id: mediaId, url: refUrl, name: attachName.trim() || file.name });
                  setAttachName('');
                  setPanel(null);
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="mt-3 w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Choose a file
              </button>

              <label className="mt-4 block text-[13px] font-medium text-zinc-800">
                Search or paste a link <span className="text-rose-500">*</span>
              </label>
              <Input value={attachUrl} onChange={setAttachUrl} placeholder="Find recent links or paste a new link" className="mt-1" />

              <label className="mt-3 block text-[13px] font-medium text-zinc-800">Display text <span className="font-normal text-zinc-400">(optional)</span></label>
              <Input value={attachName} onChange={setAttachName} placeholder="Text to display" className="mt-1" />
              <p className="mt-1 text-[11px] text-zinc-400">Give this link a title or description</p>

              {recent.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Recently viewed</p>
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {recent.map((file) => (
                      <button
                        key={file.id}
                        type="button"
                        onClick={() => { setAttachUrl(file.url); setAttachName(file.name); }}
                        className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-zinc-50"
                      >
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium text-zinc-800">{file.name}</span>
                          <span className="block truncate text-[11px] text-zinc-400">{file.url.replace(/^media:/, '')}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>Cancel</Button>
                <Button size="sm" disabled={!attachUrl.trim()} onClick={insertLink}>Insert</Button>
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

            <h3 className="mb-3 mt-6 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              <MessageSquare className="mr-1 inline h-3.5 w-3.5" /> Comments
            </h3>
            {comments.map((c) => <div key={c.id} className="mb-2 rounded-lg bg-white/70 px-2.5 py-2 text-xs">{c.text}</div>)}
            <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} rows={3} placeholder="Write a comment…" className="w-full rounded-xl border border-zinc-200 bg-white/80 px-2.5 py-2 text-xs outline-none" />
            <Button size="sm" className="mt-2 w-full" onClick={() => { const text = commentText.trim(); if (!text) return; onSave({ comments: [...comments, { id: uid(), text, created_at: new Date().toISOString() }] }); setCommentText(''); }}>Save comment</Button>
            <h3 className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              <Activity className="mr-1 inline h-3.5 w-3.5" /> Activity
            </h3>
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
