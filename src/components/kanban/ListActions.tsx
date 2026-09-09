import { useEffect, useRef, useState } from 'react';
import { MotionPopover } from '@/components/MotionUI';
import { type BoardList, type ListAutomation, kanbanUid, loadAutomations, saveAutomations } from '@/lib/kanban';
import { MoreHorizontal, X } from 'lucide-react';

const LIST_COLORS = [
  '#f87171', '#fb7185', '#f97316', '#f59e0b', '#eab308',
  '#34d399', '#10b981', '#22d3ee', '#38bdf8', '#6366f1',
  '#a78bfa', '#c084fc', '#a16207', '#71717a', '#a8a29e',
];

export function ListActions({
  list,
  count,
  lists,
  onAddCard,
  onCopyList,
  onMoveAll,
  onSort,
  onColor,
  onArchive,
}: {
  list: BoardList;
  count: number;
  lists: BoardList[];
  onAddCard: () => void;
  onCopyList: () => void;
  onMoveAll: (targetId: string) => void;
  onSort: (by: 'title' | 'due') => void;
  onColor: (hex: string | null) => void;
  onArchive: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<'root' | 'sort' | 'color' | 'move' | 'automation'>('root');
  const ref = useRef<HTMLDivElement>(null);
  const rules = loadAutomations().filter((r) => r.listId === list.id);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const addRule = (trigger: ListAutomation['trigger'], action: ListAutomation['action']) => {
    const next: ListAutomation = { id: kanbanUid(), listId: list.id, trigger, action, enabled: true };
    saveAutomations([...loadAutomations(), next]);
    setSection('automation');
  };

  const item = (label: string, onClick: () => void, muted?: boolean) => (
    <button type="button" onClick={onClick} className={`flex w-full items-center rounded-lg px-3 py-1.5 text-left text-[13px] ${muted ? 'text-zinc-400' : 'text-zinc-700 hover:bg-zinc-100'}`}>{label}</button>
  );

  return (
    <div className="relative ml-auto flex items-center gap-1" ref={ref}>
      <span className="rounded-full bg-zinc-200/80 px-1.5 text-[10px] font-medium text-zinc-600">{count}</span>
      <button
        type="button"
        className="rounded-md p-1 text-zinc-400 hover:bg-zinc-200/70 hover:text-zinc-700"
        onClick={(e) => { e.stopPropagation(); setSection('root'); setOpen((v) => !v); }}
        aria-label="List actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      <MotionPopover open={open} className="absolute right-0 top-full z-30 mt-1 w-64 p-0">
        <div className="overflow-hidden rounded-xl bg-white shadow-[0_16px_40px_rgba(24,24,27,0.16)]">
          <div className="relative flex items-center justify-center border-b border-zinc-100 px-8 py-2">
            <h4 className="text-[13px] font-semibold text-zinc-700">{section === 'root' ? 'List actions' : section === 'sort' ? 'Sort by' : section === 'color' ? 'Change list color' : section === 'move' ? 'Move all cards' : 'Automation'}</h4>
            <button type="button" onClick={() => setOpen(false)} className="absolute right-2 top-1.5 rounded-md p-1 text-zinc-400 hover:bg-zinc-100"><X className="h-4 w-4" /></button>
          </div>
          <div className="p-1.5">
            {section === 'root' && (
              <>
                {item('Add card', () => { onAddCard(); setOpen(false); })}
                {item('Copy list', () => { onCopyList(); setOpen(false); })}
                {item('Move all cards in this list', () => setSection('move'))}
                {item('Sort by', () => setSection('sort'))}
                <div className="my-1 border-t border-zinc-100" />
                {item('Change list color', () => setSection('color'))}
                {item('Automation', () => setSection('automation'))}
                <div className="my-1 border-t border-zinc-100" />
                {item('Archive this list', onArchive)}
              </>
            )}
            {section === 'sort' && (
              <>
                {item('Card title (A–Z)', () => { onSort('title'); setOpen(false); })}
                {item('Due date', () => { onSort('due'); setOpen(false); })}
              </>
            )}
            {section === 'move' && (
              <>
                {lists.filter((l) => l.id !== list.id).map((l) => item(l.label, () => { onMoveAll(l.id); setOpen(false); }))}
                {lists.length < 2 && <p className="px-3 py-2 text-xs text-zinc-400">Add another list first.</p>}
              </>
            )}
            {section === 'color' && (
              <div className="px-2 py-2">
                <div className="mb-2 grid grid-cols-5 gap-1.5">
                  {LIST_COLORS.map((hex) => (
                    <button key={hex} type="button" onClick={() => onColor(hex)} className="h-6 w-6 rounded-full border border-black/10" style={{ background: hex }} />
                  ))}
                </div>
                <button type="button" onClick={() => onColor(null)} className="w-full rounded-lg bg-zinc-100 px-2 py-1.5 text-xs font-medium text-zinc-600">Default</button>
              </div>
            )}
            {section === 'automation' && (
              <div className="px-1 py-1">
                <p className="px-2 pb-1 text-[11px] text-zinc-400">Saved locally — rules run when you add or sort cards.</p>
                {item('When a card is added to the list → sort by due', () => addRule('card_added', 'sort_by_due'))}
                {item('Every day, sort list by due date', () => addRule('every_day', 'sort_by_due'))}
                {item('Every Monday, sort list by title', () => addRule('every_monday', 'sort_by_title'))}
                {rules.length > 0 && (
                  <div className="mt-2 border-t border-zinc-100 pt-2">
                    {rules.map((r) => (
                      <p key={r.id} className="px-3 py-1 text-[11px] text-zinc-500">{r.trigger.replaceAll('_', ' ')} → {r.action.replaceAll('_', ' ')}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </MotionPopover>
    </div>
  );
}
