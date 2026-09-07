import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { PageId } from '@/components/AppLayout';
import { Search, FileText, CheckSquare, BookOpen, X } from 'lucide-react';
import { SUBJECTS } from '@/lib/types';

type Hit = {
  id: string;
  kind: 'note' | 'todo' | 'class';
  title: string;
  subtitle?: string;
  page: PageId;
};

export default function GlobalSearch({
  open,
  onClose,
  navigate,
}: {
  open: boolean;
  onClose: () => void;
  navigate: (p: PageId) => void;
}) {
  const [q, setQ] = useState('');
  const [notes, setNotes] = useState<{ id: string; title: string; content: string; folder: string }[]>([]);
  const [todos, setTodos] = useState<{ id: string; title: string; completed: boolean }[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: n }, { data: t }] = await Promise.all([
      supabase.from('notes').select('id,title,content,folder').limit(200),
      supabase.from('todos').select('id,title,completed').limit(200),
    ]);
    if (n) setNotes(n as typeof notes);
    if (t) setTodos(t as typeof todos);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      void load();
    }
  }, [open, load]);

  const hits = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [] as Hit[];
    const out: Hit[] = [];
    for (const n of notes) {
      if ((n.title || '').toLowerCase().includes(query) || (n.content || '').toLowerCase().includes(query)) {
        out.push({
          id: n.id,
          kind: 'note',
          title: n.title || 'Untitled',
          subtitle: n.folder || 'Note',
          page: 'notes',
        });
      }
    }
    for (const t of todos) {
      if ((t.title || '').toLowerCase().includes(query)) {
        out.push({
          id: t.id,
          kind: 'todo',
          title: t.title,
          subtitle: t.completed ? 'Done' : 'Open task',
          page: 'todos',
        });
      }
    }
    for (const s of SUBJECTS) {
      if (s.name.toLowerCase().includes(query) || s.shortName.toLowerCase().includes(query) || s.key.includes(query)) {
        out.push({
          id: s.key,
          kind: 'class',
          title: s.name,
          subtitle: 'Class Hub',
          page: 'classhub',
        });
      }
    }
    return out.slice(0, 40);
  }, [q, notes, todos]);

  if (!open) return null;

  const icon = (k: Hit['kind']) => {
    if (k === 'note') return FileText;
    if (k === 'todo') return CheckSquare;
    return BookOpen;
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-zinc-900/30 px-4 pt-[12vh] backdrop-blur-sm" onClick={onClose}>
      <div
        className="glass w-full max-w-lg overflow-hidden rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-zinc-200/70 px-3 py-2.5">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes, tasks, classes…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && hits[0]) {
                navigate(hits[0].page);
                onClose();
              }
            }}
          />
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-1">
          {loading && <p className="px-3 py-4 text-center text-xs text-zinc-400">Loading…</p>}
          {!loading && !q.trim() && (
            <p className="px-3 py-6 text-center text-xs text-zinc-400">Type to search across notes, tasks, and classes</p>
          )}
          {!loading && q.trim() && hits.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-zinc-400">No matches</p>
          )}
          {hits.map((h) => {
            const Icon = icon(h.kind);
            return (
              <button
                key={`${h.kind}-${h.id}`}
                type="button"
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-100/80"
                onClick={() => {
                  navigate(h.page);
                  onClose();
                }}
              >
                <Icon className="h-4 w-4 shrink-0 text-zinc-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-800">{h.title}</p>
                  <p className="truncate text-[11px] text-zinc-400">{h.subtitle}</p>
                </div>
                <span className="text-[10px] uppercase tracking-wide text-zinc-400">{h.kind}</span>
              </button>
            );
          })}
        </div>
        <div className="border-t border-zinc-100 px-3 py-1.5 text-[10px] text-zinc-400">
          <kbd className="rounded bg-zinc-100 px-1">↵</kbd> open · <kbd className="rounded bg-zinc-100 px-1">esc</kbd> close ·{' '}
          <kbd className="rounded bg-zinc-100 px-1">⌘K</kbd> search
        </div>
      </div>
    </div>
  );
}
