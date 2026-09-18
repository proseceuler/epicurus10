import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SUBJECTS, type Note } from '@/lib/types';
import { Button, EmptyState, Input, Select } from '@/components/kit';
import { NOTE_TEMPLATES, fillTemplate } from '@/lib/note-templates';
import NoteMarkdown from '@/components/notes/NoteMarkdown';
import { wikiBoardTitles, wikiLinkTitles, escapeRegex } from '@/lib/wiki';
import {
  FileText, Folder, GitBranch, LayoutGrid, Link2, Plus, Search, Tag, Pin, PinOff, Trash2, BookOpen, CalendarDays, FolderUp,
} from 'lucide-react';
import FileTree from '@/components/notes/FileTree';
import VaultImporter from '@/components/notes/VaultImporter';
import type { ImportDraft } from '@/lib/vault-import';

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function outline(content: string) {
  return (content || '')
    .split('\n')
    .map((line) => {
      const m = /^(#{1,3})\s+(.+)/.exec(line);
      return m ? { level: m[1].length, text: m[2] } : null;
    })
    .filter((x): x is { level: number; text: string } => Boolean(x));
}

export default function NotesVault({
  notes, selected, loading, onSelect, onCreate, onOpenOrCreate, onOpenBoard, onReload, onImportNotes,
}: {
  notes: Note[];
  selected: Note | null;
  loading: boolean;
  onSelect: (n: Note) => void;
  onCreate: (p: Partial<Note> & { title: string }) => Promise<Note | null>;
  onOpenOrCreate: (title: string) => Promise<Note | null>;
  onOpenBoard: (name: string) => void;
  onReload: () => void;
  onImportNotes?: (rows: ImportDraft[]) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [activeFolder, setActiveFolder] = useState('All');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<Note | null>(null);
  const [linkPicker, setLinkPicker] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newFolder, setNewFolder] = useState('Notes');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(selected);
    setEditMode(true);
  }, [selected?.id]);

  const folders = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => set.add(n.folder || 'Notes'));
    return ['All', ...[...set].sort()];
  }, [notes]);

  const allTags = useMemo(() => [...new Set(notes.flatMap((n) => n.tags || []))], [notes]);

  const filtered = notes.filter((n) => {
    if (activeFolder !== 'All' && n.folder !== activeFolder) return false;
    if (activeTag && !(n.tags || []).includes(activeTag)) return false;
    if (search) {
      const q = search.toLowerCase();
      return n.title.toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q);
    }
    return true;
  });

  const persistDraft = (next: Note) => {
    setDraft(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await supabase.from('notes').update({
        title: next.title, content: next.content, tags: next.tags, folder: next.folder, linked_subject: next.linked_subject,
      }).eq('id', next.id);
      onReload();
    }, 600);
  };

  const insertWiki = (title: string) => {
    const el = taRef.current;
    if (!draft) return;
    const insertion = `[[${title}]]`;
    if (!el) {
      persistDraft({ ...draft, content: (draft.content || '') + insertion });
      setLinkPicker(false);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    persistDraft({ ...draft, content: el.value.slice(0, start) + insertion + el.value.slice(end) });
    setLinkPicker(false);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + insertion.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const daily = async () => {
    const t = todayStamp();
    const existing = notes.find((n) => n.title === t && n.folder === 'Daily');
    if (existing) onSelect(existing);
    else {
      const tmpl = NOTE_TEMPLATES.find((x) => x.id === 'daily');
      await onCreate({ title: t, folder: 'Daily', tags: ['daily'], content: fillTemplate(tmpl?.content || `# ${t}\n\n## Notes\n`, t) });
    }
  };

  const backlinks = draft
    ? notes.filter((n) => n.id !== draft.id && new RegExp(`\\[\\[\\s*${escapeRegex(draft.title)}\\s*(\\|[^\\]]+)?\\]\\]`, 'i').test(n.content || ''))
    : [];
  const outgoing = draft ? wikiLinkTitles(draft.content || '') : [];
  const boardLinks = draft ? wikiBoardTitles(draft.content || '') : [];
  const heads = draft ? outline(draft.content || '') : [];

  if (loading) {
    return <div className="flex items-center justify-center py-20"><FileText className="h-8 w-8 animate-pulse text-zinc-300" /></div>;
  }

  return (
    <div className="grid min-h-0 gap-4 lg:grid-cols-[16rem_18rem_minmax(0,1fr)_14rem]">
      <div className="space-y-3">
        <button type="button" onClick={daily} className="glass glass-hover flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-zinc-700">
          <CalendarDays className="h-4 w-4" /> Today
        </button>
        <div className="glass rounded-2xl p-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold text-zinc-700">
            <span className="flex items-center gap-2"><Folder className="h-4 w-4 text-zinc-400" /> Files</span>
            <button type="button" onClick={() => setShowImport(true)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800">
              <FolderUp className="h-3 w-3" /> Import
            </button>
          </div>
          <div className="mb-2 space-y-0.5">
            {folders.map((f) => (
              <button key={f} type="button" onClick={() => setActiveFolder(f)} className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1 text-left text-[11px] ${activeFolder === f ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100'}`}>
                <span className="truncate">{f}</span>
                <span className="text-[10px] opacity-60">{f === 'All' ? notes.length : notes.filter((n) => n.folder === f).length}</span>
              </button>
            ))}
          </div>
          <FileTree notes={activeFolder === 'All' ? notes : notes.filter((n) => n.folder === activeFolder || n.folder.startsWith(activeFolder + '/'))} selectedId={selected?.id} onSelect={onSelect} />
        </div>
        <div className="glass rounded-2xl p-3">
          <div className="mb-2 text-sm font-semibold text-zinc-700">Templates</div>
          <div className="space-y-1">
            {NOTE_TEMPLATES.map((tmpl) => (
              <button key={tmpl.id} type="button" className="flex w-full flex-col rounded-lg px-2.5 py-1.5 text-left hover:bg-zinc-100" onClick={() => {
                const date = new Date().toISOString().slice(0, 10);
                const title = tmpl.id === 'daily' ? date : tmpl.title;
                void onCreate({ title: title || tmpl.name, folder: tmpl.folder || 'Notes', content: fillTemplate(tmpl.content, title || tmpl.name) });
              }}>
                <span className="text-xs font-medium text-zinc-800">{tmpl.name}</span>
                <span className="text-[10px] text-zinc-400">{tmpl.description}</span>
              </button>
            ))}
          </div>
        </div>
        {allTags.length > 0 && (
          <div className="glass rounded-2xl p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-700"><Tag className="h-4 w-4 text-zinc-400" /> Tags</div>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => (
                <button key={tag} type="button" onClick={() => setActiveTag(activeTag === tag ? null : tag)} className={`rounded-md px-2 py-0.5 text-xs ${activeTag === tag ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'}`}>#{tag}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="min-h-0 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vault…" className="glass-input w-full rounded-xl py-2 pl-9 pr-3 text-sm" />
        </div>
        <Button onClick={() => { setShowNew(true); setNewTitle(''); }}><Plus className="h-4 w-4" /> New note</Button>
        <div className="max-h-[62vh] space-y-1.5 overflow-y-auto pr-1">
          {filtered.map((note) => (
            <button key={note.id} type="button" onClick={() => onSelect(note)} className={`w-full rounded-xl border p-3 text-left transition-all ${selected?.id === note.id ? 'border-zinc-800 bg-zinc-100/70' : 'glass border-zinc-200/40 glass-hover'}`}>
              <div className="flex items-center gap-1.5">
                {note.pinned && <Pin className="h-3 w-3 text-zinc-600" />}
                <span className="truncate text-sm font-medium text-zinc-800">{note.title}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">{(note.content || '').replace(/[#*`>[\]]/g, '').slice(0, 90)}</p>
              <p className="mt-1 text-[10px] text-zinc-400">{note.folder}</p>
            </button>
          ))}
          {filtered.length === 0 && <EmptyState icon={FileText} title="No notes" subtitle="Create one to start the vault." />}
        </div>
      </div>

      <div className="min-h-0">
        {showImport && onImportNotes ? (
          <VaultImporter existing={notes} onClose={() => setShowImport(false)} onImport={async (rows) => { await onImportNotes(rows); setShowImport(false); }} />
        ) : showNew ? (
          <div className="glass rounded-2xl p-5">
            <h3 className="mb-3 font-semibold">New note</h3>
            <div className="space-y-2">
              <Input value={newTitle} onChange={setNewTitle} placeholder="Title" />
              <Input value={newFolder} onChange={setNewFolder} placeholder="Folder (Notes, Daily, References…)" />
              <div className="flex gap-2">
                <Button onClick={async () => { if (!newTitle.trim()) return; await onCreate({ title: newTitle.trim(), folder: newFolder || 'Notes', content: '' }); setShowNew(false); }}>Create</Button>
                <Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
              </div>
            </div>
          </div>
        ) : draft ? (
          <div className="glass flex h-full min-h-[70vh] flex-col rounded-2xl">
            <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200/60 px-4 py-3">
              <input value={draft.title} onChange={(e) => persistDraft({ ...draft, title: e.target.value })} className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none" />
              <div className="flex gap-1 rounded-lg bg-zinc-100 p-0.5 text-xs">
                <button type="button" onClick={() => setEditMode(true)} className={`rounded-md px-2 py-1 ${editMode ? 'bg-white shadow-sm' : 'text-zinc-500'}`}>Edit</button>
                <button type="button" onClick={() => setEditMode(false)} className={`rounded-md px-2 py-1 ${!editMode ? 'bg-white shadow-sm' : 'text-zinc-500'}`}>Preview</button>
              </div>
              <div className="relative">
                <Button size="sm" variant="secondary" onClick={() => setLinkPicker((v) => !v)}><Link2 className="h-3.5 w-3.5" /> Link</Button>
                {linkPicker && (
                  <div className="absolute right-0 top-full z-20 mt-1 max-h-56 w-56 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg">
                    {notes.filter((n) => n.id !== draft.id).map((n) => (
                      <button key={n.id} type="button" onClick={() => insertWiki(n.title)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-zinc-100">
                        <FileText className="h-3 w-3 text-zinc-400" />{n.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" onClick={async () => { await supabase.from('notes').update({ pinned: !draft.pinned }).eq('id', draft.id); persistDraft({ ...draft, pinned: !draft.pinned }); }} className="rounded-lg p-2 hover:bg-zinc-100">
                {draft.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4 text-zinc-400" />}
              </button>
              <button type="button" onClick={async () => { await supabase.from('notes').delete().eq('id', draft.id); onReload(); }} className="rounded-lg p-2 hover:bg-red-50">
                <Trash2 className="h-4 w-4 text-red-500" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              {editMode ? (
                <textarea ref={taRef} value={draft.content} onChange={(e) => persistDraft({ ...draft, content: e.target.value })} placeholder="Write in markdown. Use [[Note title]] to link the first mention." className="h-full min-h-[28rem] w-full resize-none bg-transparent px-5 py-4 font-mono text-sm leading-relaxed outline-none" />
              ) : (
                <div className="h-full overflow-y-auto px-6 py-5">
                  <NoteMarkdown content={draft.content} notes={notes} onOpenNote={(t) => onOpenOrCreate(t)} onOpenBoard={onOpenBoard} onCreateNote={(t) => onOpenOrCreate(t)} />
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 border-t border-zinc-200/60 px-4 py-2">
              <Input value={(draft.tags || []).join(', ')} onChange={(v) => persistDraft({ ...draft, tags: v.split(',').map((t) => t.trim()).filter(Boolean) })} placeholder="tags" className="max-w-xs" />
              <Select value={draft.linked_subject || ''} onChange={(v) => persistDraft({ ...draft, linked_subject: v || null })} options={[{ value: '', label: 'No subject' }, ...SUBJECTS.map((s) => ({ value: s.key, label: s.name }))]} />
            </div>
            <div className="flex items-center justify-between border-t border-zinc-200/50 px-4 py-1 text-[10px] text-zinc-400">
              <span>{(draft.content || '').trim().split(/\s+/).filter(Boolean).length} words · {(draft.content || '').length} chars</span>
              <span>{notes.length} notes in vault · {backlinks.length} backlinks</span>
            </div>
          </div>
        ) : (
          <div className="glass rounded-2xl p-6">
            <EmptyState icon={BookOpen} title="Select a note" subtitle="Or create one from a template." />
          </div>
        )}
      </div>

      <div className="space-y-3">
        {draft && (
          <>
            <div className="glass rounded-2xl p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Outline</p>
              {heads.length === 0 && <p className="text-xs text-zinc-400">Headings appear here.</p>}
              <div className="space-y-1">{heads.map((h, i) => (<p key={i} className="truncate text-xs text-zinc-600" style={{ paddingLeft: (h.level - 1) * 8 }}>{h.text}</p>))}</div>
            </div>
            <div className="glass rounded-2xl p-3">
              <p className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400"><Link2 className="h-3 w-3" /> Links</p>
              {outgoing.map((t) => (<button key={t} type="button" onClick={() => onOpenOrCreate(t)} className="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-xs text-zinc-700 hover:bg-zinc-100"><FileText className="h-3 w-3 text-zinc-400" /> {t}</button>))}
              {boardLinks.map((t) => (<button key={t} type="button" onClick={() => onOpenBoard(t)} className="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-xs text-zinc-700 hover:bg-zinc-100"><LayoutGrid className="h-3 w-3 text-zinc-400" /> {t}</button>))}
              {outgoing.length === 0 && boardLinks.length === 0 && <p className="text-xs text-zinc-400">No outgoing links.</p>}
            </div>
            <div className="glass rounded-2xl p-3">
              <p className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400"><GitBranch className="h-3 w-3" /> Backlinks</p>
              {backlinks.map((n) => (<button key={n.id} type="button" onClick={() => onSelect(n)} className="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-xs text-zinc-700 hover:bg-zinc-100"><FileText className="h-3 w-3 text-zinc-400" /> {n.title}</button>))}
              {backlinks.length === 0 && <p className="text-xs text-zinc-400">Nothing links here yet.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
