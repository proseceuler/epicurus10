import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { usePomodoro } from '@/context/PomodoroContext';
import { supabase } from '@/lib/supabase';
import type { PageId } from '@/components/AppLayout';
import { unreadCount, INBOX_CHANGED } from '@/lib/inbox';
import {
  Calculator, BookOpen, Plus, Timer, Play, Pause, Square,
  GripHorizontal, X, StickyNote, Bell, Search,
} from 'lucide-react';

const ScientificCalculator = lazy(() => import('@/components/ScientificCalculator'));
const DictionaryWidget = lazy(() => import('@/components/DictionaryWidget'));
const InboxPanel = lazy(() => import('@/components/InboxPanel'));
const GlobalSearch = lazy(() => import('@/components/GlobalSearch'));

type DockTab = 'main' | 'pomodoro' | 'calculator' | 'dictionary' | 'quicktask' | 'quicknote' | 'inbox' | 'search';

const DOCK_ITEMS: { tab: DockTab; icon: typeof Calculator; label: string }[] = [
  { tab: 'calculator', icon: Calculator, label: 'Calculator' },
  { tab: 'dictionary', icon: BookOpen, label: 'Dictionary' },
  { tab: 'quicknote', icon: StickyNote, label: 'Sticky Note' },
  { tab: 'quicktask', icon: Plus, label: 'Quick Task' },
  { tab: 'search', icon: Search, label: 'Search' },
  { tab: 'inbox', icon: Bell, label: 'Inbox' },
  { tab: 'pomodoro', icon: Timer, label: 'Focus' },
];

export default function GlobalDock({ navigate }: { navigate: (p: PageId, focus?: string | null) => void; page: PageId }) {
  const pomodoro = usePomodoro();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DockTab>('main');
  const [calcDetached, setCalcDetached] = useState(false);
  const [dictDetached, setDictDetached] = useState(false);
  const [inboxDetached, setInboxDetached] = useState(false);
  const [inboxUnread, setInboxUnread] = useState(0);
  const [quickTask, setQuickTask] = useState('');
  const [quickNote, setQuickNote] = useState('');

  const minutes = Math.floor(pomodoro.timeLeft / 60);
  const seconds = pomodoro.timeLeft % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const toolOpen = open && activeTab !== 'main';
  const sheetBlocked =
    (activeTab === 'calculator' && calcDetached) ||
    (activeTab === 'dictionary' && dictDetached) ||
    (activeTab === 'inbox' && inboxDetached);

  useEffect(() => {
    const sync = () => setInboxUnread(unreadCount());
    sync();
    window.addEventListener(INBOX_CHANGED, sync);
    return () => window.removeEventListener(INBOX_CHANGED, sync);
  }, []);

  useEffect(() => {
    const onInbox = () => {
      setOpen((was) => {
        if (was && activeTab === 'inbox' && !inboxDetached) {
          setActiveTab('main');
          return false;
        }
        if (inboxDetached) return was;
        setActiveTab('inbox');
        return true;
      });
    };
    window.addEventListener('epicure-toggle-inbox', onInbox);
    return () => {
      window.removeEventListener('epicure-toggle-inbox', onInbox);
    };
  }, [activeTab, inboxDetached]);

  const openTab = (tab: DockTab) => {
    if (tab === 'search') {
      window.dispatchEvent(new CustomEvent('epicure-toggle-search'));
      return;
    }
    if (tab === 'calculator') setCalcDetached(false);
    if (tab === 'dictionary') setDictDetached(false);
    if (tab === 'inbox') setInboxDetached(false);
    setOpen(true);
    setActiveTab(tab);
    if (tab === 'pomodoro') pomodoro.setDockOpen(true);
    else if (activeTab === 'pomodoro' && pomodoro.isRunning) pomodoro.floatAway();
  };

  const closeTab = () => {
    if (activeTab === 'pomodoro' && pomodoro.isRunning) pomodoro.floatAway();
    setCalcDetached(false);
    setDictDetached(false);
    setInboxDetached(false);
    setActiveTab('main');
    pomodoro.setDockOpen(false);
  };

  const addQuickTask = async () => {
    if (!quickTask.trim()) return;
    await supabase.from('todos').insert({ title: quickTask.trim(), priority: 'not_urgent_important' });
    setQuickTask('');
    setActiveTab('main');
    navigate('todos');
  };

  const addQuickNote = async () => {
    if (!quickNote.trim()) return;
    const title = quickNote.trim().split('\n')[0].slice(0, 60);
    await supabase.from('notes').insert({
      title: title || 'Untitled',
      content: quickNote.trim(),
      folder: 'Quick Capture',
      tags: ['sticky'],
      pinned: true,
    });
    setQuickNote('');
    setActiveTab('main');
    try { sessionStorage.setItem('epicure-open-folder', 'Quick Capture'); } catch { /* ignore */ }
    navigate('notes');
  };

  return (
    <>
      {pomodoro.isFloating && pomodoro.isRunning && <FloatingPomodoro />}

      {activeTab === 'calculator' && calcDetached && (
        <Suspense fallback={null}>
          <ScientificCalculator
            detached
            onDetach={() => setCalcDetached(true)}
            onSnapBack={() => setCalcDetached(false)}
            onClose={() => { setCalcDetached(false); setActiveTab('main'); }}
          />
        </Suspense>
      )}
      {activeTab === 'dictionary' && dictDetached && (
        <Suspense fallback={null}>
          <DictionaryWidget
            detached
            onDetach={() => setDictDetached(true)}
            onSnapBack={() => setDictDetached(false)}
            onClose={() => { setDictDetached(false); setActiveTab('main'); }}
          />
        </Suspense>
      )}
      {inboxDetached && (
        <Suspense fallback={null}>
          <InboxPanel
            open
            detached
            navigate={navigate}
            onDetach={() => setInboxDetached(true)}
            onSnapBack={() => { setInboxDetached(false); setActiveTab('inbox'); setOpen(true); }}
            onClose={() => { setInboxDetached(false); setActiveTab('main'); }}
          />
        </Suspense>
      )}

      <div data-global-dock className="fixed z-[90] overflow-visible">
        <AnimatePresence>
          {toolOpen && !sheetBlocked && (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 28 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="dock-sheet epic-glass-sheet absolute bottom-[4.35rem] right-0 origin-bottom-right overflow-hidden"
            >
              <Suspense fallback={<div className="px-4 py-5 text-center text-xs text-zinc-500">Loading…</div>}>
                {activeTab === 'calculator' && (
                  <ScientificCalculator detached={false} onDetach={() => setCalcDetached(true)} onSnapBack={() => setCalcDetached(false)} onClose={closeTab} />
                )}
                {activeTab === 'dictionary' && (
                  <DictionaryWidget detached={false} onDetach={() => setDictDetached(true)} onSnapBack={() => setDictDetached(false)} onClose={closeTab} />
                )}
                {activeTab === 'search' && (
                  <div className="w-full min-w-0 overflow-hidden rounded-2xl">
                    <GlobalSearch open mode="dock" navigate={navigate} onClose={() => { setActiveTab('main'); setOpen(false); }} />
                  </div>
                )}
                {activeTab === 'inbox' && (
                  <InboxPanel open embedded navigate={navigate} onDetach={() => { setInboxDetached(true); setOpen(false); }} onClose={closeTab} />
                )}
                {activeTab === 'pomodoro' && (
                  <div className="flex w-full min-w-0 items-center gap-2 px-3 py-2">
                    {pomodoro.isRunning ? (
                      <button type="button" onClick={pomodoro.pause} className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-white"><Pause className="h-4 w-4" /></button>
                    ) : (
                      <button type="button" onClick={pomodoro.start} className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-white"><Play className="h-4 w-4" /></button>
                    )}
                    <button type="button" onClick={pomodoro.reset} className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-600 hover:bg-zinc-200/50"><Square className="h-3.5 w-3.5" /></button>
                    <div className="flex-1 text-center">
                      <div className="text-2xl font-bold tabular-nums text-zinc-900">{timeStr}</div>
                      <div className="text-[10px] capitalize text-zinc-400">{pomodoro.sessionType.replace('_', ' ')}</div>
                    </div>
                    <button type="button" onClick={closeTab} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-zinc-200/50"><X className="h-4 w-4 text-zinc-500" /></button>
                  </div>
                )}
                {activeTab === 'quicktask' && (
                  <div className="flex w-full min-w-0 items-center gap-2 px-3 py-2">
                    <Plus className="h-5 w-5 shrink-0 text-zinc-400" />
                    <input value={quickTask} onChange={(e) => setQuickTask(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addQuickTask()} placeholder="Quick add task..." className="min-w-0 flex-1 bg-transparent text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none" autoFocus />
                    <button type="button" onClick={addQuickTask} className="shrink-0 rounded-lg bg-zinc-900 px-2 py-1 text-xs font-medium text-white">Add</button>
                    <button type="button" onClick={closeTab} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-zinc-200/50"><X className="h-4 w-4 text-zinc-500" /></button>
                  </div>
                )}
                {activeTab === 'quicknote' && (
                  <div className="flex w-full min-w-0 items-center gap-2 px-3 py-2">
                    <StickyNote className="h-5 w-5 shrink-0 text-amber-500" />
                    <input value={quickNote} onChange={(e) => setQuickNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addQuickNote()} placeholder="Sticky note..." className="min-w-0 flex-1 bg-transparent text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none" autoFocus />
                    <button type="button" onClick={addQuickNote} className="shrink-0 rounded-lg bg-zinc-900 px-2 py-1 text-xs font-medium text-white">Save</button>
                    <button type="button" onClick={closeTab} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-zinc-200/50"><X className="h-4 w-4 text-zinc-500" /></button>
                  </div>
                )}
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-row items-center justify-end gap-2">
          <AnimatePresence>
            {open && activeTab === 'main' && (
              <motion.div
                key="dock-rail"
                initial={{ opacity: 0, x: 36 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 36 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="dock-rail epic-glass-sheet flex items-center gap-0.5 rounded-2xl px-2 py-2"
              >
                {DOCK_ITEMS.map((item, i) => (
                  <motion.div
                    key={item.tab}
                    initial={{ opacity: 0, x: 18 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 18 }}
                    transition={{ duration: 0.18, delay: (DOCK_ITEMS.length - 1 - i) * 0.028, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <DockButton
                      icon={item.icon}
                      label={item.label}
                      onClick={() => openTab(item.tab)}
                      badge={item.tab === 'inbox' ? inboxUnread : item.tab === 'pomodoro' && pomodoro.isRunning ? timeStr : undefined}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            whileTap={{ scale: 0.92 }}
            type="button"
            onClick={() => {
              if (open) {
                if (activeTab === 'pomodoro' && pomodoro.isRunning) pomodoro.floatAway();
                setCalcDetached(false);
                setDictDetached(false);
                setInboxDetached(false);
                setActiveTab('main');
                pomodoro.setDockOpen(false);
                setOpen(false);
              } else if (pomodoro.isRunning) {
                openTab('pomodoro');
              } else {
                setOpen(true);
                setActiveTab('main');
              }
            }}
            aria-label={open ? 'Close tools' : 'Open tools'}
            className={
              open
                ? 'dock-fab relative flex items-center justify-center rounded-full bg-zinc-900 text-white'
                : pomodoro.isRunning
                  ? 'dock-fab relative flex items-center justify-center rounded-full bg-zinc-900 text-white ring-2 ring-zinc-900/15'
                  : 'dock-fab relative flex items-center justify-center rounded-full bg-white/90 text-zinc-800'
            }
          >
            {open ? (
              <Plus className="h-6 w-6 rotate-45 transition-transform duration-200" />
            ) : pomodoro.isRunning ? (
              <span className="flex flex-col items-center leading-none">
                <Timer className="mb-0.5 h-3.5 w-3.5 opacity-80" />
                <span className="text-[10px] font-bold tabular-nums tracking-tight">{timeStr}</span>
              </span>
            ) : (
              <Plus className="h-6 w-6 transition-transform duration-200" />
            )}
          </motion.button>
        </div>
      </div>
    </>
  );
}

function DockButton({
  icon: Icon,
  label,
  onClick,
  badge,
}: {
  icon: typeof Calculator;
  label: string;
  onClick: () => void;
  badge?: number | string;
}) {
  const show = badge != null && badge !== 0 && badge !== '';
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="relative flex h-10 w-10 items-center justify-center rounded-xl text-zinc-600 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900"
    >
      <Icon className="h-4 w-4" />
      {show && (
        <span className="chrome-badge absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-zinc-600 px-0.5 text-[8px] font-bold text-white">
          {typeof badge === 'number' && badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

function FloatingPomodoro() {
  const pomodoro = usePomodoro();
  const [pos, setPos] = useState({ x: Math.max(8, window.innerWidth - 220), y: 80 });
  const draggingRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });
  const minutes = Math.floor(pomodoro.timeLeft / 60);
  const seconds = pomodoro.timeLeft % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const x = Math.min(window.innerWidth - 160, Math.max(8, e.clientX - offsetRef.current.x));
      const y = Math.min(window.innerHeight - 48, Math.max(8, e.clientY - offsetRef.current.y));
      setPos({ x, y });
    };
    const onUp = () => { draggingRef.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const onDragStart = (e: React.MouseEvent) => {
    draggingRef.current = true;
    offsetRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };

  return (
    <div className="fixed z-[60] overflow-hidden rounded-2xl glass-dark glass-shadow-lg" style={{ left: pos.x, top: pos.y }}>
      <div
        className="flex cursor-move items-center gap-2 px-3 py-2"
        onMouseDown={onDragStart}
        onClick={() => { if (!draggingRef.current) pomodoro.snapBack(); }}
      >
        <GripHorizontal className="h-4 w-4 text-zinc-500" />
        <div className="flex items-center gap-2">
          {pomodoro.isRunning ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); pomodoro.pause(); }} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20">
              <Pause className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button type="button" onClick={(e) => { e.stopPropagation(); pomodoro.start(); }} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20">
              <Play className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" onClick={(e) => { e.stopPropagation(); pomodoro.reset(); pomodoro.snapBack(); }} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20">
            <Square className="h-3 w-3" />
          </button>
        </div>
        <span className="text-lg font-bold tabular-nums text-white">{timeStr}</span>
      </div>
    </div>
  );
}
