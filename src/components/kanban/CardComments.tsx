import { useState } from 'react';
import { Button } from '@/components/kit';
import { kanbanUid as uid } from '@/lib/kanban';
import type { KanbanTask } from '@/lib/types';
import { MessageSquare } from 'lucide-react';

export function CardComments({ comments, onSave }: {
  comments: NonNullable<KanbanTask['comments']>;
  onSave: (comments: NonNullable<KanbanTask['comments']>) => void;
}) {
  const [text, setText] = useState('');
  return (
    <div className="mt-6">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        <MessageSquare className="mr-1 inline h-3.5 w-3.5" /> Comments
      </h3>
      {comments.map((c) => (
        <div key={c.id} className="mb-2 rounded-lg bg-white/70 px-2.5 py-2 text-xs">{c.text}</div>
      ))}
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Write a comment…" className="w-full rounded-xl border border-zinc-200 bg-white/80 px-2.5 py-2 text-xs outline-none" />
      <Button size="sm" className="mt-2 w-full" onClick={() => {
        const next = text.trim();
        if (!next) return;
        onSave([...comments, { id: uid(), text: next, created_at: new Date().toISOString() }]);
        setText('');
      }}>Save comment</Button>
    </div>
  );
}
