import { MotionCollapse, MotionOverlay } from '@/components/MotionUI';
import { DateField, TimeField } from '@/components/fields';
import { Button, Input, Select } from '@/components/kit';
import { KINDS } from '@/lib/calendarTheme';
import { SUBJECTS, type Todo, type KanbanTask, type Note, type Habit } from '@/lib/types';
import { applyTitleParse, detectedHint } from '@/pages/calendar/parseDraft';
import { EVENT_COLORS, type Draft } from '@/pages/calendar/model';
import { Link2, Sparkles, Trash2, X } from 'lucide-react';

export function EventForm(props: {
  open: boolean;
  draft: Draft;
  setDraft: (d: Draft) => void;
  showLinks: boolean;
  setShowLinks: (v: boolean | ((x: boolean) => boolean)) => void;
  todos: Todo[];
  kanban: KanbanTask[];
  notes: Note[];
  habits: Habit[];
  onClose: () => void;
  onSave: () => void;
  onDelete: (id: string) => void;
}) {
  const hint = detectedHint(props.draft.title);
  return (
    <MotionOverlay open={props.open} onClose={props.onClose}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-zinc-800">{props.draft.id ? 'Edit event' : 'New event'}</h3>
        <button type="button" onClick={props.onClose} className="rounded-lg p-1 hover:bg-zinc-200/60"><X className="h-4 w-4 text-zinc-500" /></button>
      </div>
      <div className="space-y-3">
        <div>
          <Input value={props.draft.title} onChange={(v) => props.setDraft(applyTitleParse(props.draft, v))} placeholder="Chemistry Exam 2pm to 4pm on Sept 17" />
          {hint && <p className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500"><Sparkles className="h-3 w-3" /> {hint}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="mb-1 block text-xs text-zinc-500">Starts</label><DateField value={props.draft.start_date} onChange={(v) => props.setDraft({ ...props.draft, start_date: v, end_date: props.draft.end_date < v ? v : props.draft.end_date })} /></div>
          <div><label className="mb-1 block text-xs text-zinc-500">Ends</label><DateField value={props.draft.end_date} onChange={(v) => props.setDraft({ ...props.draft, end_date: v })} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-600"><input type="checkbox" checked={props.draft.all_day} onChange={(e) => props.setDraft({ ...props.draft, all_day: e.target.checked })} /> All day</label>
        {!props.draft.all_day && (
          <div className="grid grid-cols-2 gap-3">
            <TimeField value={props.draft.start_time} onChange={(v) => props.setDraft({ ...props.draft, start_time: v })} />
            <TimeField value={props.draft.end_time} onChange={(v) => props.setDraft({ ...props.draft, end_time: v })} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Select value={props.draft.kind} onChange={(v) => props.setDraft({ ...props.draft, kind: v })} options={KINDS} />
          <Select value={props.draft.subject_key} onChange={(v) => props.setDraft({ ...props.draft, subject_key: v })} options={[{ value: '', label: 'No subject' }, ...SUBJECTS.map((s) => ({ value: s.key, label: s.name }))]} />
        </div>
        <div>
          <p className="mb-1.5 text-xs text-zinc-500">Color</p>
          <div className="flex flex-wrap gap-1.5">
            {EVENT_COLORS.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => props.setDraft({ ...props.draft, color: hex })}
                className={`h-5 w-5 rounded-full border ${props.draft.color === hex ? 'ring-2 ring-zinc-900 ring-offset-1' : 'border-black/10'}`}
                style={{ background: hex }}
              />
            ))}
            <button type="button" onClick={() => props.setDraft({ ...props.draft, color: null })} className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">Default</button>
          </div>
        </div>
        <textarea value={props.draft.description} onChange={(e) => props.setDraft({ ...props.draft, description: e.target.value })} placeholder="Details (optional)" rows={2} className="glass-input w-full resize-none rounded-xl px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400" />
        <div>
          <button type="button" onClick={() => props.setShowLinks((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100">
            <Link2 className="h-3.5 w-3.5" /> {props.showLinks ? 'Hide linked items' : 'Link an existing item'}
          </button>
          <MotionCollapse open={props.showLinks}>
            <div className="mt-2 space-y-2">
              <Select value={props.draft.linked_todo_id} onChange={(v) => props.setDraft({ ...props.draft, linked_todo_id: v })} options={[{ value: '', label: 'To-do…' }, ...props.todos.map((t) => ({ value: t.id, label: t.title }))]} />
              <Select value={props.draft.linked_kanban_id} onChange={(v) => props.setDraft({ ...props.draft, linked_kanban_id: v })} options={[{ value: '', label: 'Kanban card…' }, ...props.kanban.map((t) => ({ value: t.id, label: t.title }))]} />
              <Select value={props.draft.linked_note_id} onChange={(v) => props.setDraft({ ...props.draft, linked_note_id: v })} options={[{ value: '', label: 'Note…' }, ...props.notes.map((n) => ({ value: n.id, label: n.title }))]} />
              <Select value={props.draft.linked_habit_id} onChange={(v) => props.setDraft({ ...props.draft, linked_habit_id: v })} options={[{ value: '', label: 'Habit…' }, ...props.habits.map((h) => ({ value: h.id, label: h.name }))]} />
            </div>
          </MotionCollapse>
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          {props.draft.id && <Button variant="ghost" onClick={() => void props.onDelete(props.draft.id)}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>}
          <Button variant="ghost" onClick={props.onClose}>Cancel</Button>
          <Button onClick={props.onSave}>Save</Button>
        </div>
      </div>
    </MotionOverlay>
  );
}
