import { useState, useRef, useEffect } from 'react';
import { usePomodoro } from '@/context/PomodoroContext';
import { supabase } from '@/lib/supabase';
import type { PageId } from '@/components/AppLayout';
import ScientificCalculator from '@/components/ScientificCalculator';
import DictionaryWidget from '@/components/DictionaryWidget';
import QuickImportModal from '@/components/QuickImportModal';
import {
  Calculator, BookOpen, Plus, Timer, Play, Pause, Square,
  GripHorizontal, X, StickyNote, Bot, Sparkles,
} from 'lucide-react';

type Tool = null | 'calculator' | 'dictionary' | 'quicktask' | 'quicknote' | 'pomodoro';

export default function GlobalDock({ navigate }: { navigate: (p: PageId) => void }) {
  const pomodoro = usePomodoro();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tool, setTool] = useState<Tool>(null);
  const [quickTask, setQuickTask] = useState('');
  const [quickNote, setQuickNote] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  const minutes = Math.floor(pomodoro.timeLeft / 60);
  const seconds = pomodoro.timeLeft % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const closeTool = () => {
    if (tool === 'pomodoro' && pomodoro.isRunning) pomodoro.floatAway();
    if (tool === 'pomodoro') pomodoro.setDockOpen(false);
    setTool(null);
  };

  const pickTool = (next: Exclude<Tool, null>) => {
    setSheetOpen(false);
    setTool(next);
    if (next === 'pomodoro') pomodoro.setDockOpen(true);
  };

  const addQuickNote = async () => {
    if (!quickNote.trim()) return;
    const title = quickNote.trim().split('\n')[0].slice(0, 60);
    await supabase.from('notes').insert({
      title: title || 'Untitled',
      content: quickNote.trim(),
      folder: 'Quick Capture',
      tags: [],
      pinned: false,
    });
    setQuickNote('');
    setTool(null);
    navigate('notes');
  };

  const addQuickTask = async () => {
    if (!quickTask.trim()) return;
    await supabase.from('todos').insert({ title: quickTask.trim(), priority: 'not_urgent_important' });
    setQuickTask('');
    setTool(null);
    navigate('todos');
  };

  const TOOLS: { id: string; label: string; icon: typeof Calculator; run: () => void }[] = [
    { id: 'calculator', label: 'Calculator', icon: Calculator, run: () => pickTool('calculator') },
    { id: 'dictionary', label: 'Dictionary', icon: BookOpen, run: () => pickTool('dictionary') },
    { id: 'ai', label: 'Ask AI', icon: Bot, run: () => { setSheetOpen(false); navigate('assistant'); } },
    { id: 'note', label: 'Quick Note', icon: StickyNote, run: () => pickTool('quicknote') },
    { id: 'task', label: 'Quick Task', icon: Plus, run: () => pickTool('quicktask') },
    { id: 'import', label: 'Quick Import', icon: Sparkles, run: () => { setSheetOpen(false); setImportOpen(true); } },
    { id: 'focus', label: 'Focus', icon: Timer, run: () => pickTool('pomodoro') },
  ];

  return (
    <>
      <QuickImportModal open={importOpen} onClose={() => setImportOpen(false)} />

      {/* Floating Pomodoro Widget */}
      {pomodoro.isFloating && pomodoro.isRunning && <FloatingPomodoro />}

      {/* Floating tool windows */}
      {tool === 'calculator' && (
        <ScientificCalculator detached onDetach={() => {}} onSnapBack={closeTool} onClose={closeTool} />
      )}
      {tool === 'dictionary' && (
        <DictionaryWidget detached onDetach={() => {}} onSnapBack={closeTool} onClose={closeTool} />
      )}

      {/* Quick capture / focus panels */}
      {(tool === 'quicknote' || tool === 'quicktask' || tool === 'pomodoro') && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-zinc-900/30 backdrop-blur-sm p-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
          onClick={closeTool}
        >
          <div
            className="glass glass-shadow-lg rounded-2xl w-full max-w-md p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {tool === 'quicknote' && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-zinc-800 flex items-center gap-2">
                    <StickyNote className="w-4 h-4 text-zinc-500" /> Quick Note
                  </h3>
                  <CloseBtn onClick={closeTool} />
                </div>
                <textarea
                  value={quickNote}
                  onChange={(e) => setQuickNote(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addQuickNote(); }}
                  placeholder="Quick capture a note… (Ctrl+Enter to save)"
                  className="w-full glass-input rounded-xl px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 h-28 resize-none"
                  autoFocus
                />
                <div className="flex justify-end gap-2 mt-3">
                  <button onClick={closeTool} className="px-3 py-2 rounded-xl text-sm text-zinc-500 hover:bg-zinc-200/50">Cancel</button>
                  <button onClick={addQuickNote} className="px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800">Save</button>
                </div>
              </>
            )}

            {tool === 'quicktask' && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-zinc-800 flex items-center gap-2">
                    <Plus className="w-4 h-4 text-zinc-500" /> Quick Task
                  </h3>
                  <CloseBtn onClick={closeTool} />
                </div>
                <input
                  value={quickTask}
                  onChange={(e) => setQuickTask(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addQuickTask()}
                  placeholder="Quick add task…"
                  className="w-full glass-input rounded-xl px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400"
                  autoFocus
                />
                <div className="flex justify-end gap-2 mt-3">
                  <button onClick={closeTool} className="px-3 py-2 rounded-xl text-sm text-zinc-500 hover:bg-zinc-200/50">Cancel</button>
                  <button onClick={addQuickTask} className="px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800">Add</button>
                </div>
              </>
            )}

            {tool === 'pomodoro' && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-zinc-800 flex items-center gap-2">
                    <Timer className="w-4 h-4 text-zinc-500" /> Focus Timer
                  </h3>
                  <CloseBtn onClick={closeTool} />
                </div>
                <div className="text-center py-2">
                  <div className="text-4xl font-bold text-zinc-900 tabular-nums">{timeStr}</div>
                  <div className="text-xs text-zinc-400 capitalize mt-1">{pomodoro.sessionType.replace('_', ' ')}</div>
                </div>
                <div className="flex items-center justify-center gap-2 mt-3">
                  {pomodoro.isRunning ? (
                    <button onClick={pomodoro.pause} className="w-11 h-11 rounded-xl bg-zinc-900 text-white flex items-center justify-center hover:bg-zinc-800">
                      <Pause className="w-4 h-4" />
                    </button>
                  ) : (
                    <button onClick={pomodoro.start} className="w-11 h-11 rounded-xl bg-zinc-900 text-white flex items-center justify-center hover:bg-zinc-800">
                      <Play className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={pomodoro.reset} className="w-11 h-11 rounded-xl glass glass-hover text-zinc-600 flex items-center justify-center">
                    <Square className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => { setTool(null); navigate('pomodoro'); }}
                    className="px-3 h-11 rounded-xl glass glass-hover text-sm text-zinc-600"
                  >
                    Open page
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Quick tools bottom sheet */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/30 backdrop-blur-sm"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="glass glass-shadow-lg rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md sm:mb-6 p-4"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-zinc-800">Quick tools</h3>
              <CloseBtn onClick={() => setSheetOpen(false)} />
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {TOOLS.map((t) => {
                const Icon = t.icon;
                const active = t.id === 'focus' && pomodoro.isRunning;
                return (
                  <button
                    key={t.id}
                    onClick={t.run}
                    className={`flex flex-col items-center justify-center gap-1.5 py-3 px-1 rounded-2xl transition-all ${
                      active ? 'bg-zinc-900 text-white' : 'glass glass-hover text-zinc-700'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-[11px] font-medium text-center leading-tight">{t.label}</span>
                    {active && <span className="text-[10px] tabular-nums">{timeStr}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Single center FAB */}
      <button
        onClick={() => setSheetOpen((v) => !v)}
        aria-label="Quick tools"
        className="fixed left-1/2 -translate-x-1/2 z-[55] w-16 h-16 rounded-full glass glass-shadow-lg flex items-center justify-center text-zinc-800 active:scale-95 transition-transform"
        style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <Plus className={`w-7 h-7 transition-transform duration-200 ${sheetOpen ? 'rotate-45' : ''}`} />
        {pomodoro.isRunning && (
          <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-zinc-900 text-white text-[10px] tabular-nums">
            {timeStr}
          </span>
        )}
      </button>
    </>
  );
}

function CloseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-8 h-8 rounded-lg hover:bg-zinc-200/50 flex items-center justify-center">
      <X className="w-4 h-4 text-zinc-500" />
    </button>
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
