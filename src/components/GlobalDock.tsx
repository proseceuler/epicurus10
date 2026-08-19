import { useState, useRef, useEffect } from 'react';
import { usePomodoro } from '@/context/PomodoroContext';
import { supabase } from '@/lib/supabase';
import type { PageId } from '@/components/AppLayout';
import ScientificCalculator from '@/components/ScientificCalculator';
import DictionaryWidget from '@/components/DictionaryWidget';
import {
  Calculator, BookOpen, Plus, Timer, Play, Pause, Square,
  GripHorizontal, X, StickyNote, Bot,
} from 'lucide-react';

type DockTab = 'main' | 'pomodoro' | 'calculator' | 'dictionary' | 'quicktask' | 'quicknote';

export default function GlobalDock({ navigate }: { navigate: (p: PageId) => void }) {
  const pomodoro = usePomodoro();
  const [activeTab, setActiveTab] = useState<DockTab>('main');
  const [calcDetached, setCalcDetached] = useState(false);
  const [dictDetached, setDictDetached] = useState(false);
  const [quickTask, setQuickTask] = useState('');
  const [quickNote, setQuickNote] = useState('');

  const minutes = Math.floor(pomodoro.timeLeft / 60);
  const seconds = pomodoro.timeLeft % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const openTab = (tab: DockTab) => {
    setActiveTab(tab);
    if (tab === 'pomodoro') pomodoro.setDockOpen(true);
    else if (activeTab === 'pomodoro' && pomodoro.isRunning) pomodoro.floatAway();
  };

  const closeTab = () => {
    if (activeTab === 'pomodoro' && pomodoro.isRunning) pomodoro.floatAway();
    setActiveTab('main');
    pomodoro.setDockOpen(false);
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
    setActiveTab('main');
    navigate('notes');
  };

  const addQuickTask = async () => {
    if (!quickTask.trim()) return;
    await supabase.from('todos').insert({ title: quickTask.trim(), priority: 'not_urgent_important' });
    setQuickTask('');
    setActiveTab('main');
    navigate('todos');
  };

  return (
    <>
      {/* Floating Pomodoro Widget */}
      {pomodoro.isFloating && pomodoro.isRunning && <FloatingPomodoro />}

      {/* Detached calculator floating window */}
      {activeTab === 'calculator' && calcDetached && (
        <ScientificCalculator
          detached
          onDetach={() => setCalcDetached(true)}
          onSnapBack={() => setCalcDetached(false)}
          onClose={() => { setCalcDetached(false); setActiveTab('main'); }}
        />
      )}

      {/* Detached dictionary floating window */}
      {activeTab === 'dictionary' && dictDetached && (
        <DictionaryWidget
          detached
          onDetach={() => setDictDetached(true)}
          onSnapBack={() => setDictDetached(false)}
          onClose={() => { setDictDetached(false); setActiveTab('main'); }}
        />
      )}

      {/* Bottom Dock */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
        <div className="glass glass-shadow-lg rounded-2xl px-2 py-2 flex items-center gap-1">
          {activeTab === 'main' && (
            <>
              <DockButton icon={Calculator} label="Calculator" onClick={() => openTab('calculator')} />
              <DockButton icon={BookOpen} label="Dictionary" onClick={() => openTab('dictionary')} />
              <DockButton icon={Bot} label="Ask AI" onClick={() => { setActiveTab('main'); navigate('assistant'); }} />
              <DockButton icon={StickyNote} label="Quick Note" onClick={() => openTab('quicknote')} />
              <DockButton icon={Plus} label="Quick Task" onClick={() => openTab('quicktask')} />
              <div className="w-px h-8 bg-zinc-300/40 mx-0.5" />
              <DockButton
                icon={Timer}
                label="Focus"
                onClick={() => openTab('pomodoro')}
                active={pomodoro.isRunning}
                badge={pomodoro.isRunning ? timeStr : undefined}
              />
            </>
          )}

          {activeTab === 'pomodoro' && (
            <div className="flex items-center gap-2 px-2 py-1 min-w-[280px]">
              <div className="flex items-center gap-2">
                {pomodoro.isRunning ? (
                  <button onClick={pomodoro.pause} className="w-9 h-9 rounded-xl bg-zinc-900 text-white flex items-center justify-center hover:bg-zinc-800 transition-all">
                    <Pause className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={pomodoro.start} className="w-9 h-9 rounded-xl bg-zinc-900 text-white flex items-center justify-center hover:bg-zinc-800 transition-all">
                    <Play className="w-4 h-4" />
                  </button>
                )}
                <button onClick={pomodoro.reset} className="w-9 h-9 rounded-xl glass text-zinc-600 flex items-center justify-center glass-hover">
                  <Square className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex-1 text-center">
                <div className="text-2xl font-bold text-zinc-900 tabular-nums">{timeStr}</div>
                <div className="text-[10px] text-zinc-400 capitalize">{pomodoro.sessionType.replace('_', ' ')}</div>
              </div>
              <button onClick={closeTab} className="w-8 h-8 rounded-lg hover:bg-zinc-200/50 flex items-center justify-center">
                <X className="w-4 h-4 text-zinc-500" />
              </button>
            </div>
          )}

          {activeTab === 'calculator' && !calcDetached && (
            <div className="relative">
              <ScientificCalculator
                detached={false}
                onDetach={() => setCalcDetached(true)}
                onSnapBack={() => setCalcDetached(false)}
                onClose={closeTab}
              />
            </div>
          )}

          {activeTab === 'dictionary' && !dictDetached && (
            <div className="relative">
              <DictionaryWidget
                detached={false}
                onDetach={() => setDictDetached(true)}
                onSnapBack={() => setDictDetached(false)}
                onClose={closeTab}
              />
            </div>
          )}

          {activeTab === 'quicknote' && (
            <div className="flex items-start gap-2 px-2 py-1.5 min-w-[320px]">
              <StickyNote className="w-5 h-5 text-zinc-400 shrink-0 mt-1" />
              <textarea
                value={quickNote}
                onChange={(e) => setQuickNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addQuickNote();
                }}
                placeholder="Quick capture a note... (Ctrl+Enter to save)"
                className="flex-1 bg-transparent text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none min-w-[120px] resize-none h-16"
                autoFocus
              />
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={addQuickNote} className="px-2 py-1 rounded-lg bg-zinc-900 text-white text-xs font-medium">
                  Save
                </button>
                <button onClick={closeTab} className="px-2 py-1 rounded-lg hover:bg-zinc-200/50 text-zinc-500 text-xs">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {activeTab === 'quicktask' && (
            <div className="flex items-center gap-2 px-2 py-1 min-w-[300px]">
              <Plus className="w-5 h-5 text-zinc-400 shrink-0" />
              <input
                value={quickTask}
                onChange={(e) => setQuickTask(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addQuickTask()}
                placeholder="Quick add task..."
                className="flex-1 bg-transparent text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none min-w-[120px]"
                autoFocus
              />
              <button onClick={addQuickTask} className="px-2 py-1 rounded-lg bg-zinc-900 text-white text-xs font-medium shrink-0">
                Add
              </button>
              <button onClick={closeTab} className="w-8 h-8 rounded-lg hover:bg-zinc-200/50 flex items-center justify-center shrink-0">
                <X className="w-4 h-4 text-zinc-500" />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function DockButton({ icon: Icon, label, onClick, active, badge }: {
  icon: typeof Calculator;
  label: string;
  onClick: () => void;
  active?: boolean;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all min-w-[56px] ${
        active ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-200/50'
      }`}
      title={label}
    >
      <Icon className="w-5 h-5" />
      {badge ? (
        <span className="text-[10px] font-bold tabular-nums">{badge}</span>
      ) : (
        <span className="text-[10px] font-medium">{label}</span>
      )}
    </button>
  );
}

function FloatingPomodoro() {
  const pomodoro = usePomodoro();
  const [pos, setPos] = useState({ x: window.innerWidth - 200, y: window.innerHeight - 140 });
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
