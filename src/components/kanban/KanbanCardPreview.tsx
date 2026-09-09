import { SUBJECTS, type KanbanTask } from '@/lib/types';
import { dueTone, formatDue, uniqueAttachments, resolveCover } from '@/lib/kanban';
import { CoverFrame } from '@/components/kanban/cardKit';
import { Trash2, Calendar as CalIcon, CheckSquare, Paperclip, MessageSquare, GripVertical } from 'lucide-react';

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
