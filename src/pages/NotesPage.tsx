import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { SUBJECTS, type Note } from '@/lib/types';
import { Card, Button, Input, Select, EmptyState, Badge } from '@/components/ui';
import { Plus, Search, Pin, PinOff, Trash2, Folder, Tag, BookOpen, FileText, Check, StickyNote, Pen } from 'lucide-react';
import OrpheusTextarea from '@/components/OrpheusTextarea';
import Whiteboard from '@/components/Whiteboard';

type Tab = 'notes' | 'scratchpad' | 'whiteboard';

function renderMarkdown(text: string): string {
  return text
    .replace(/^### (.*$)/gm, '<h3 class="font-semibold text-zinc-800 mt-3 mb-1">$1</h3>')
    .replace(/^## (.*$)/gm, '<h2 class="font-bold text-zinc-800 mt-3 mb-1">$1</h2>')
    .replace(/^# (.*$)/gm, '<h1 class="font-bold text-lg text-zinc-900 mt-3 mb-1">$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="bg-zinc-100 px-1 rounded text-xs">$1</code>')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" class="text-blue-600 underline">$1</a>')
    .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^> (.*$)/gm, '<blockquote class="border-l-2 border-zinc-300 pl-3 italic text-zinc-600">$1</blockquote>')
    .replace(/\n/g, '<br />');
}

export default function NotesPage() {
  const [tab, setTab] = useState<Tab>('notes');

  const tabs: { id: Tab; label: string; icon: typeof FileText }[] = [
    { id: 'notes', label: 'Notes', icon: FileText },
    { id: 'scratchpad', label: 'Scratchpad', icon: StickyNote },
    { id: 'whiteboard', label: 'Whiteboard', icon: Pen },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="flex gap-1 p-1 glass rounded-xl">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === t.id ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'notes' && <NotesTab />}
      {tab === 'scratchpad' && <ScratchpadTab />}
      {tab === 'whiteboard' && <Whiteboard />}
    </div>
  );
}

// ─── Notes Tab ───

function NotesTab() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFolder, setActiveFolder] = useState('All');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [showNewNote, setShowNewNote] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newFolder, setNewFolder] = useState('General');
  const [newTags, setNewTags] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [editMode, setEditMode] = useState(false);

  const loadNotes = useCallback(async () => {
    const { data } = await supabase.from('notes').select('*').order('updated_at', { ascending: false });
    if (data) setNotes(data as Note[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  const folders = ['All', ...new Set(notes.map((n) => n.folder).filter(Boolean))];
  const allTags = [...new Set(notes.flatMap((n) => n.tags || []))];

  const filtered = notes.filter((n) => {
    if (activeFolder !== 'All' && n.folder !== activeFolder) return false;
    if (activeTag && !(n.tags || []).includes(activeTag)) return false;
    if (search) {
      const q = search.toLowerCase();
      return n.title.toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q);
    }
    return true;
  });

  const pinnedNotes = filtered.filter((n) => n.pinned);
  const regularNotes = filtered.filter((n) => !n.pinned);

  const createNote = async () => {
    if (!newTitle.trim()) return;
    const tags = newTags.split(',').map((t) => t.trim()).filter(Boolean);
    const { data } = await supabase.from('notes').insert({
      title: newTitle.trim(),
      content: newContent,
      folder: newFolder || 'General',
      tags,
      pinned: false,
      linked_subject: newSubject || null,
    }).select().single();
    if (data) {
      setNotes([data as Note, ...notes]);
      setSelectedNote(data as Note);
    }
    setNewTitle(''); setNewContent(''); setNewTags(''); setNewSubject(''); setNewFolder('General');
    setShowNewNote(false);
  };

  const updateNote = async (id: string, updates: Partial<Note>) => {
    await supabase.from('notes').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    setNotes(notes.map((n) => n.id === id ? { ...n, ...updates } : n));
    if (selectedNote?.id === id) setSelectedNote({ ...selectedNote, ...updates });
  };

  const togglePin = async (note: Note) => {
    await supabase.from('notes').update({ pinned: !note.pinned }).eq('id', note.id);
    setNotes(notes.map((n) => n.id === note.id ? { ...n, pinned: !n.pinned } : n));
  };

  const deleteNote = async (id: string) => {
    await supabase.from('notes').delete().eq('id', id);
    setNotes(notes.filter((n) => n.id !== id));
    if (selectedNote?.id === id) setSelectedNote(null);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><FileText className="w-8 h-8 text-zinc-300 animate-pulse" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-zinc-500">Full markdown notes with folders, tags, and subject linking</p>
        <Button onClick={() => setShowNewNote(true)}><Plus className="w-4 h-4" /> New Note</Button>
      </div>

      <div className="grid lg:grid-cols-4 gap-4">
        {/* Sidebar: folders + tags */}
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Folder className="w-4 h-4 text-zinc-400" />
              <span className="text-sm font-semibold text-zinc-700">Folders</span>
            </div>
            <div className="space-y-1">
              {folders.map((folder) => (
                <button
                  key={folder}
                  onClick={() => setActiveFolder(folder)}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-all ${
                    activeFolder === folder ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100'
                  }`}
                >
                  {folder}
                  <span className="text-xs ml-1 opacity-50">
                    ({folder === 'All' ? notes.length : notes.filter((n) => n.folder === folder).length})
                  </span>
                </button>
              ))}
            </div>
          </Card>

          {allTags.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Tag className="w-4 h-4 text-zinc-400" />
                <span className="text-sm font-semibold text-zinc-700">Tags</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                    className={`px-2 py-0.5 rounded-md text-xs transition-all ${
                      activeTag === tag ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Note list */}
        <div className="lg:col-span-1 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes..."
              className="w-full pl-9 pr-3 py-2 glass-input rounded-xl text-sm text-zinc-700"
            />
          </div>

          {pinnedNotes.length > 0 && (
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-1 mt-3">Pinned</p>
          )}
          {pinnedNotes.map((note) => (
            <NoteCard key={note.id} note={note} onClick={() => { setSelectedNote(note); setEditMode(false); }} onPin={togglePin} isSelected={selectedNote?.id === note.id} />
          ))}

          {regularNotes.length > 0 && pinnedNotes.length > 0 && (
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-1 mt-3">All Notes</p>
          )}
          {regularNotes.map((note) => (
            <NoteCard key={note.id} note={note} onClick={() => { setSelectedNote(note); setEditMode(false); }} onPin={togglePin} isSelected={selectedNote?.id === note.id} />
          ))}

          {filtered.length === 0 && (
            <EmptyState icon={FileText} title="No notes found" subtitle="Create your first note to get started." />
          )}
        </div>

        {/* Note editor/viewer */}
        <div className="lg:col-span-2">
          {selectedNote ? (
            <Card className="p-6 h-full">
              {editMode ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Input value={selectedNote.title} onChange={(v) => { const updated = { ...selectedNote, title: v }; setSelectedNote(updated); }} placeholder="Note title" />
                    <div className="flex gap-2 ml-2">
                      <Button size="sm" variant="secondary" onClick={() => { setEditMode(false); updateNote(selectedNote.id, selectedNote); }}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditMode(false)}>Cancel</Button>
                    </div>
                  </div>
                  <OrpheusTextarea
                    value={selectedNote.content}
                    onChange={(v) => setSelectedNote({ ...selectedNote, content: v })}
                    className="w-full h-96 px-3 py-2 glass-input rounded-xl text-sm text-zinc-700 font-mono"
                    placeholder="Write in markdown..."
                  />
                  <div className="flex gap-2">
                    <Input value={(selectedNote.tags || []).join(', ')} onChange={(v) => setSelectedNote({ ...selectedNote, tags: v.split(',').map((t) => t.trim()).filter(Boolean) })} placeholder="Tags (comma separated)" />
                    <Select
                      value={selectedNote.linked_subject || ''}
                      onChange={(v) => setSelectedNote({ ...selectedNote, linked_subject: v || null })}
                      options={[{ value: '', label: 'No subject' }, ...SUBJECTS.map((s) => ({ value: s.key, label: s.name }))]}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-start justify-between gap-2 mb-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-zinc-800">{selectedNote.title}</h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge>{selectedNote.folder}</Badge>
                        {selectedNote.linked_subject && (
                          <Badge>{SUBJECTS.find((s) => s.key === selectedNote.linked_subject)?.shortName}</Badge>
                        )}
                        {(selectedNote.tags || []).map((tag) => (
                          <span key={tag} className="text-xs text-zinc-400">#{tag}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => togglePin(selectedNote)} className="p-2 rounded-lg hover:bg-zinc-100" title={selectedNote.pinned ? 'Unpin' : 'Pin'}>
                        {selectedNote.pinned ? <PinOff className="w-4 h-4 text-zinc-600" /> : <Pin className="w-4 h-4 text-zinc-400" />}
                      </button>
                      <Button size="sm" variant="secondary" onClick={() => setEditMode(true)}>Edit</Button>
                      <button onClick={() => deleteNote(selectedNote.id)} className="p-2 rounded-lg hover:bg-red-50">
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                  <div
                    className="prose prose-sm max-w-none text-sm text-zinc-700"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedNote.content || '') }}
                  />
                  <p className="text-xs text-zinc-400 mt-4">
                    Last updated {new Date(selectedNote.updated_at).toLocaleString()}
                  </p>
                </div>
              )}
            </Card>
          ) : showNewNote ? (
            <Card className="p-6">
              <h3 className="font-semibold text-zinc-800 mb-4">New Note</h3>
              <div className="space-y-3">
                <Input value={newTitle} onChange={setNewTitle} placeholder="Note title" />
                <OrpheusTextarea
                  value={newContent}
                  onChange={setNewContent}
                  className="w-full h-64 px-3 py-2 glass-input rounded-xl text-sm text-zinc-700 font-mono"
                  placeholder="Write in markdown..."
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input value={newFolder} onChange={setNewFolder} placeholder="Folder name" />
                  <Input value={newTags} onChange={setNewTags} placeholder="Tags (comma separated)" />
                </div>
                <Select
                  value={newSubject}
                  onChange={setNewSubject}
                  options={[{ value: '', label: 'No linked subject' }, ...SUBJECTS.map((s) => ({ value: s.key, label: s.name }))]}
                />
                <div className="flex gap-2">
                  <Button onClick={createNote}><Plus className="w-4 h-4" /> Create Note</Button>
                  <Button variant="ghost" onClick={() => setShowNewNote(false)}>Cancel</Button>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-6">
              <EmptyState icon={BookOpen} title="Select a note to read" subtitle="Or create a new one to start writing." />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function NoteCard({ note, onClick, onPin, isSelected }: { note: Note; onClick: () => void; onPin: (n: Note) => void; isSelected: boolean }) {
  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-xl cursor-pointer transition-all border ${
        isSelected ? 'border-zinc-800 bg-zinc-100/60' : 'border-zinc-200/30 glass glass-hover'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {note.pinned && <Pin className="w-3 h-3 text-zinc-600 shrink-0" />}
            <p className="text-sm font-medium text-zinc-700 truncate">{note.title}</p>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{(note.content || '').replace(/[#*`>]/g, '').slice(0, 80)}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[10px] text-zinc-400">{note.folder}</span>
            {note.linked_subject && (
              <span className="text-[10px] text-zinc-400">· {SUBJECTS.find((s) => s.key === note.linked_subject)?.shortName}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Scratchpad Tab ───

function ScratchpadTab() {
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordId = useRef<string | null>(null);

  const loadScratchpad = useCallback(async () => {
    const { data } = await supabase.from('scratchpad').select('*').maybeSingle();
    if (data) {
      setContent(data.content);
      recordId.current = data.id;
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadScratchpad(); }, [loadScratchpad]);

  const save = useCallback(async (text: string) => {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (recordId.current) {
        await supabase.from('scratchpad').update({ content: text, updated_at: new Date().toISOString() }).eq('id', recordId.current);
      } else {
        const { data } = await supabase.from('scratchpad').insert({ content: text }).select().single();
        if (data) recordId.current = data.id;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 800);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setContent(text);
    save(text);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><StickyNote className="w-8 h-8 text-zinc-300 animate-pulse" /></div>;
  }

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  const charCount = content.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-zinc-500">Quick capture — auto-saves as you type</p>
        <div className="flex items-center gap-1.5 text-sm">
          {saved ? (
            <span className="flex items-center gap-1 text-zinc-700 font-medium">
              <Check className="w-4 h-4" /> Saved
            </span>
          ) : (
            <span className="text-zinc-400">Auto-saving...</span>
          )}
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <OrpheusTextarea
          value={content}
          onChange={(v) => handleChange({ target: { value: v } } as React.ChangeEvent<HTMLTextAreaElement>)}
          placeholder="Start typing anything — ideas, reminders, formulas, quick notes..."
          className="w-full min-h-[60vh] p-6 text-sm text-zinc-800 placeholder-zinc-400 resize-none focus:outline-none leading-relaxed bg-transparent"
        />
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-200/40 text-xs text-zinc-400">
          <span>{wordCount} words · {charCount} characters</span>
          <span className="flex items-center gap-1">
            <StickyNote className="w-3 h-3" /> Auto-saved
          </span>
        </div>
      </Card>
    </div>
  );
}
