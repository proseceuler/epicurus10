import { useState, useRef, useEffect } from 'react';
import { usePomodoro } from '@/context/PomodoroContext';
import { supabase } from '@/lib/supabase';
import type { PageId } from '@/components/AppLayout';
import ScientificCalculator from '@/components/ScientificCalculator';
import DictionaryWidget from '@/components/DictionaryWidget';
import QuickImportModal from '@/components/QuickImportModal';
import {
  Calculator, BookOpen, Plus, Timer, Play, Pause, Square,
  GripHorizontal, StickyNote, Bot, Sparkles, ArrowLeft, Send, X,
  Pin, Wrench,
} from 'lucide-react';

type Tool = null | 'calculator' | 'dictionary' | 'quicktask' | 'quicknote' | 'pomodoro';

interface StickyNoteWin {
  id: number;
  text: string;
  x: number;
  y: number;
}

export default function GlobalDock({ navigate }: { navigate: (p: PageId) => void }) {
  const pomodoro = usePomodoro();
  const [expanded, setExpanded] = useState(false);
  const [tool, setTool] = useState<Tool>(null);
  const [quickTask, setQuickTask] = useState('');
  const [quickNote, setQuickNote] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [stickyWins, setStickyWins] = useState<StickyNoteWin[]>([]);
  const [noteSaved, setNoteSaved] = useState(false);

  const minutes = Math.floor(pomodoro.timeLeft / 60);
  const seconds = pomodoro.timeLeft % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const collapse = () => {
    if (tool === 'pomodoro' && pomodoro.isRunning) pomodoro.floatAway();
    if (tool === 'pomodoro') pomodoro.setDockOpen(false);
    setTool(null);
    setExpanded(false);
  };

  const backToRow = () => {
    if (tool === 'pomodoro' && pomodoro.isRunning) pomodoro.floatAway();
    if (tool === 'pomodoro') pomodoro.setDockOpen(false);
    setTool(null);
  };

  const pickTool = (next: Exclude<Tool, null>) => {
    if (next === 'calculator' || next === 'dictionary') {
      setTool(next);
      setExpanded(false);
      return;
    }
    setTool(next);
    if (next === 'pomodoro') pomodoro.setDockOpen(true);
  };

  const saveQuickNote = async (text: string): Promise<void> => {
    if (!text.trim()) return;
    const title = text.trim().split('\n')[0].slice(0, 60);
    await supabase.from('notes').insert({
      title: title || 'Untitled',
      content: text.trim(),
      folder: 'Quick Capture',
      tags: ['sticky'],
      pinned: true,
    });
  };

  const addQuickNote = async () => {
    await saveQuickNote(quickNote);
    setQuickNote('');
    setTool(null);
    setExpanded(false);
    navigate('notes');
  };

  const detachStickyNote = () => {
    const id = Date.now();
    setStickyWins((wins) => [...wins, { id, text: quickNote, x: 120, y: 120 }]);
    setQuickNote('');
    setTool(null);
  };

  const updateStickyText = (id: number, text: string) => {
    setStickyWins((wins) => wins.map((w) => (w.id === id ? { ...w, text } : w)));
  };

  const closeStickyWin = (id: number) => {
    setStickyWins((wins) => wins.filter((w) => w.id !== id));
  };

  const saveStickyWin = async (id: number) => {
    const win = stickyWins.find((w) => w.id === id);
    if (!win) return;
    await saveQuickNote(win.text);
    setStickyWins((wins) => wins.filter((w) => w.id !== id));
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 1500);
  };

  const addQuickTask = async () => {
    if (!quickTask.trim()) return;
    await supabase.from('todos').insert({ title: quickTask.trim(), priority: 'not_urgent_important' });
    setQuickTask('');
    setTool(null);
    setExpanded(false);
    navigate('todos');
  };

  const showRow = !tool || tool === 'calculator' || tool === 'dictionary';

  return (
    <>
      <QuickImportModal open={importOpen} onClose={() => setImportOpen(false)} />

      {pomodoro.isFloating && pomodoro.isRunning && <FloatingPomodoro />}

      {tool === 'calculator' && (
        <ScientificCalculator detached onDetach={() => {}} onSnapBack={collapse} onClose={collapse} />
      )}
      {tool === 'dictionary' && (
        <DictionaryWidget detached onDetach={() => {}} onSnapBack={collapse} onClose={collapse} />
      )}

      {/* Detached sticky note windows */}
      {stickyWins.map((win) => (
        <FloatingStickyNote
          key={win.id}
          text={win.text}
          pos={{ x: win.x, y: win.y }}
          onTextChange={(t) => updateStickyText(win.id, t)}
          onClose={() => closeStickyWin(win.id)}
          onSave={() => saveStickyWin(win.id)}
          onDrag={(x, y) => setStickyWins((wins) => wins.map((w) => (w.id === win.id ? { ...w, x, y } : w)))}
        />
      ))}

      {noteSaved && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[70] glass glass-shadow-lg rounded-xl px-4 py-2 text-sm font-medium text-zinc-700 animate-fade-in">
          Saved to Notes
        </div>
      )}

      {/* Outside-click catcher — only when showing the main tool row */}
      {expanded && showRow && (
        <div className="fixed inset-0 z-40" onClick={collapse} />
      )}

      {/* Expanded dock — morph animation from FAB */}
      {expanded && (
        <div
          className="dock-morph fixed left-1/2 -translate-x-1/2 z-50 glass glass-shadow-lg rounded-2xl px-2 py-2 flex items-center gap-1 max-w-[calc(100vw-2rem)] overflow-x-auto"
          style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
          onClick={(e) => e.stopPropagation()}
        >
          {showRow ? (
            <>
              <DockBtn icon={Calculator} label="Calc" onClick={() => pickTool('calculator')} />
              <DockBtn icon={BookOpen} label="Dict" onClick={() => pickTool('dictionary')} />
              <DockBtn icon={StickyNote} label="Note" onClick={() => pickTool('quicknote')} />
              <DockBtn icon={Plus} label="Task" onClick={() => pickTool('quicktask')} />
              <Divider />
              <DockBtn icon={Bot} label="Ask AI" onClick={() => { setExpanded(false); navigate('assistant'); }} />
              <DockBtn icon={Sparkles} label="Import" onClick={() => { setExpanded(false); setImportOpen(true); }} />
              <Divider />
              <DockBtn
                icon={Timer}
                label="Focus"
                active={pomodoro.isRunning}
                badge={pomodoro.isRunning ? timeStr : undefined}
                onClick={() => pickTool('pomodoro')}
              />
            </>
          ) : tool === 'quicktask' ? (
            <InlinePanel onBack={backToRow} icon={Plus} title="Quick Task">
              <input
                value={quickTask}
                onChange={(e) => setQuickTask(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addQuickTask()}
                placeholder="Add a task…"
                className="flex-1 glass-input rounded-xl px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 min-w-[140px] max-w-[260px]"
                autoFocus
              />
              <button
                onClick={addQuickTask}
                className="px-3 py-2 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 shrink-0"
              >
                Add
              </button>
            </InlinePanel>
          ) : tool === 'quicknote' ? (
            <InlinePanel onBack={backToRow} icon={StickyNote} title="Sticky Note" amber>
              <textarea
                value={quickNote}
                onChange={(e) => setQuickNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addQuickNote(); }}
                placeholder="Jot something down… (Ctrl+Enter to save)"
                className="flex-1 bg-amber-50/80 border border-amber-200/60 rounded-xl px-3 py-2 text-sm text-amber-950 placeholder-amber-400/70 resize-none h-20 min-w-[180px] max-w-[300px] focus:outline-none"
                autoFocus
              />
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={detachStickyNote}
                  disabled={!quickNote.trim()}
                  className="px-2.5 py-2 rounded-xl glass glass-hover text-xs text-zinc-600 disabled:opacity-40 flex items-center gap-1"
                  title="Detach into a floating note"
                >
                  <Pin className="w-3.5 h-3.5" /> Detach
                </button>
                <button
                  onClick={addQuickNote}
                  className="px-3 py-2 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-500 flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" /> Save
                </button>
              </div>
            </InlinePanel>
          ) : tool === 'pomodoro' ? (
            <InlinePanel onBack={backToRow} icon={Timer} title="Focus Timer">
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-zinc-900 tabular-nums leading-none">{timeStr}</div>
                  <div className="text-[10px] text-zinc-400 capitalize mt-0.5">{pomodoro.sessionType.replace('_', ' ')}</div>
                </div>
                {pomodoro.isRunning ? (
                  <button onClick={pomodoro.pause} className="w-9 h-9 rounded-xl bg-zinc-900 text-white flex items-center justify-center hover:bg-zinc-800">
                    <Pause className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={pomodoro.start} className="w-9 h-9 rounded-xl bg-zinc-900 text-white flex items-center justify-center hover:bg-zinc-800">
                    <Play className="w-4 h-4" />
                  </button>
                )}
                <button onClick={pomodoro.reset} className="w-9 h-9 rounded-xl glass glass-hover text-zinc-600 flex items-center justify-center">
                  <Square className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => { setTool(null); setExpanded(false); navigate('pomodoro'); }}
                  className="px-2.5 py-2 rounded-xl glass glass-hover text-xs text-zinc-600 shrink-0"
                >
                  Open
                </button>
              </div>
            </InlinePanel>
          ) : null}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => { if (expanded) collapse(); else setExpanded(true); }}
        aria-label="Quick tools"
        className="fixed left-1/2 -translate-x-1/2 z-[55] w-14 h-14 rounded-full glass glass-shadow-lg flex items-center justify-center text-zinc-800 active:scale-95 transition-transform"
        style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <Wrench className={`w-5 h-5 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
        {pomodoro.isRunning && !expanded && (
          <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-zinc-900 text-white text-[10px] tabular-nums">
            {timeStr}
          </span>
        )}
      </button>
    </>
  );
}

function DockBtn({
  icon: Icon,
  label,
  onClick,
  active,
  badge,
}: {
  icon: typeof Calculator;
  label: string;
  onClick: () => void;
  active?: boolean;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center gap-0.5 px-2.5 py-1.5 rounded-xl transition-all shrink-0 ${
        active ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-white/40'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-[10px] font-medium leading-none">{label}</span>
      {badge && (
        <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded-full bg-zinc-900 text-white text-[9px] tabular-nums">
          {badge}
        </span>
      )}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-8 bg-zinc-300/50 mx-0.5 shrink-0" />;
}

function InlinePanel({
  onBack,
  icon: Icon,
  title,
  children,
  amber,
}: {
  onBack: () => void;
  icon: typeof Calculator;
  title: string;
  children: React.ReactNode;
  amber?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-xl p-1 ${amber ? 'bg-amber-100/40' : ''}`}>
      <button
        onClick={onBack}
        className="w-8 h-8 rounded-lg hover:bg-white/40 flex items-center justify-center text-zinc-500 shrink-0"
        title="Back"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 shrink-0">
        <Icon className="w-4 h-4" />
        {title}
      </div>
      {children}
    </div>
  );
}

function FloatingStickyNote({
  text,
  pos,
  onTextChange,
  onClose,
  onSave,
  onDrag,
}: {
  text: string;
  pos: { x: number; y: number };
  onTextChange: (t: string) => void;
  onClose: () => void;
  onSave: () => void;
  onDrag: (x: number, y: number) => void;
}) {
  const draggingRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      onDrag(e.clientX - offsetRef.current.x, e.clientY - offsetRef.current.y);
    };
    const onUp = () => { draggingRef.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [onDrag]);

  const onDragStart = (e: React.MouseEvent) => {
    draggingRef.current = true;
    offsetRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };

  return (
    <div
      className="fixed z-[60] w-64 rounded-2xl overflow-hidden shadow-xl border border-amber-200/60 bg-amber-50/95 backdrop-blur-sm"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className="flex items-center justify-between px-3 py-1.5 bg-amber-100/80 cursor-move border-b border-amber-200/60"
        onMouseDown={onDragStart}
      >
        <div className="flex items-center gap-1.5 text-amber-700">
          <GripHorizontal className="w-3.5 h-3.5" />
          <span className="text-[11px] font-semibold">Sticky Note</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onSave}
            className="w-6 h-6 rounded-md hover:bg-amber-200/60 flex items-center justify-center text-amber-700"
            title="Save to Notes"
          >
            <Send className="w-3 h-3" />
          </button>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-md hover:bg-amber-200/60 flex items-center justify-center text-amber-700"
            title="Close"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
      <textarea
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder="Type here…"
        className="w-full bg-transparent px-3 py-2.5 text-sm text-amber-950 placeholder-amber-400/70 resize-none h-40 focus:outline-none"
        autoFocus
      />
    </div>
  );
}

function FloatingPomodoro() {
  const pomodoro = usePomodoro();
  const [pos, setPos] = useState({ x: window.innerWidth - 220, y: 80 });
  const draggingRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });

  const minutes = Math.floor(pomodoro.timeLeft / 60);
  const seconds = pomodoro.timeLeft % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      setPos({ x: e.clientX - offsetRef.current.x, y: e.clientY - offsetRef.current.y });
    };
    const onUp = () => { draggingRef.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const onDragStart = (e: React.MouseEvent) => {
    draggingRef.current = true;
    offsetRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };

  return (
    <div
      className="fixed z-[60] glass-dark glass-shadow-lg rounded-2xl overflow-hidden"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-move"
        onMouseDown={onDragStart}
        onClick={() => { if (!draggingRef.current) pomodoro.snapBack(); }}
      >
        <GripHorizontal className="w-4 h-4 text-zinc-500" />
        <div className="flex items-center gap-2">
          {pomodoro.isRunning ? (
            <button onClick={(e) => { e.stopPropagation(); pomodoro.pause(); }} className="w-7 h-7 rounded-lg bg-white/10 text-white flex items-center justify-center hover:bg-white/20">
              <Pause className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); pomodoro.start(); }} className="w-7 h-7 rounded-lg bg-white/10 text-white flex items-center justify-center hover:bg-white/20">
              <Play className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); pomodoro.reset(); pomodoro.snapBack(); }} className="w-7 h-7 rounded-lg bg-white/10 text-white flex items-center justify-center hover:bg-white/20">
            <Square className="w-3 h-3" />
          </button>
        </div>
        <span className="text-lg font-bold text-white tabular-nums">{timeStr}</span>
      </div>
    </div>
  );
}
