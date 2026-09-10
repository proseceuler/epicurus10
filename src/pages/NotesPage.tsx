import { useCallback, useEffect, useState } from 'react';
import { supabase, DB_CHANGED } from '@/lib/supabase';
import { type Note } from '@/lib/types';
import Whiteboard from '@/components/board/Whiteboard';
import NotesGraph from '@/components/notes/NotesGraph';
import NotesVault from './NotesVault';
import { findNoteByTitle } from '@/lib/wiki';
import { FileText, LayoutGrid, Network } from 'lucide-react';

type Tab = 'notes' | 'board' | 'graph';

export default function NotesPage() {
  const [tab, setTab] = useState<Tab>('notes');
  const [openBoardName, setOpenBoardName] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>('note-home');
  const [loading, setLoading] = useState(true);

  const loadNotes = useCallback(async () => {
    const { data } = await supabase.from('notes').select('*').order('updated_at', { ascending: false });
    if (data) setNotes(data as Note[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadNotes();
    const on = () => loadNotes();
    window.addEventListener(DB_CHANGED, on);
    return () => window.removeEventListener(DB_CHANGED, on);
  }, [loadNotes]);

  useEffect(() => {
    try {
      const folder = sessionStorage.getItem('epicure-open-folder');
      if (folder) sessionStorage.removeItem('epicure-open-folder');
    } catch {
      /* ignore */
    }
  }, []);

  const selected = notes.find((n) => n.id === selectedId) ?? null;

  const createNote = async (partial: Partial<Note> & { title: string }) => {
    const { data } = await supabase
      .from('notes')
      .insert({
        title: partial.title,
        content: partial.content ?? '',
        folder: partial.folder ?? 'Vault',
        tags: partial.tags ?? [],
        pinned: partial.pinned ?? false,
        linked_subject: partial.linked_subject ?? null,
        linked_board_ids: partial.linked_board_ids ?? [],
      })
      .select()
      .single();
    if (data) {
      setNotes((prev) => [data as Note, ...prev]);
      setSelectedId((data as Note).id);
      setTab('notes');
      return data as Note;
    }
    return null;
  };

  const openOrCreate = async (title: string) => {
    const existing = findNoteByTitle(notes, title);
    if (existing) {
      setSelectedId(existing.id);
      setTab('notes');
      return existing;
    }
    return createNote({ title, folder: 'Vault' });
  };

  const openBoard = (name?: string | null) => {
    const n = (name ?? '').trim();
    if (!n) return;
    setOpenBoardName(n);
    setTab('board');
  };

  const tabs: { id: Tab; label: string; icon: typeof FileText }[] = [
    { id: 'notes', label: 'Notes', icon: FileText },
    { id: 'board', label: 'Board', icon: LayoutGrid },
    { id: 'graph', label: 'Graph', icon: Network },
  ];

  return (
    <div className={`flex min-h-0 flex-col ${tab === 'notes' ? 'h-full' : 'h-[calc(100vh-5.5rem)] overflow-hidden'}`}>
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl p-1 glass">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  tab === t.id ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'notes' && (
        <NotesVault
          notes={notes}
          selected={selected}
          loading={loading}
          onSelect={(n) => setSelectedId(n.id)}
          onCreate={createNote}
          onOpenOrCreate={openOrCreate}
          onOpenBoard={openBoard}
          onReload={loadNotes}
        />
      )}
      {tab === 'board' && (
        <div className="min-h-0 w-full flex-1 overflow-hidden">
          <Whiteboard
            notes={notes}
            openBoardName={openBoardName}
            onOpenNote={(n) => {
              setSelectedId(n.id);
              setTab('notes');
            }}
            onCreateNote={(title) => openOrCreate(title)}
          />
        </div>
      )}
      {tab === 'graph' && (
        <div className="min-h-0 w-full flex-1 overflow-hidden">
          <NotesGraph
            notes={notes}
            focusNoteId={selectedId}
            onOpenNote={(n) => {
              setSelectedId(n.id);
              setTab('notes');
            }}
            onOpenBoard={openBoard}
          />
        </div>
      )}
    </div>
  );
}
