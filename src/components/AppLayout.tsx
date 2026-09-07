import { useState, useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import GlobalDock from '@/components/GlobalDock';
import GlobalAssistant from '@/components/GlobalAssistant';
import { fadeMotion, motionTransition } from '@/lib/motion';
import { getXP, xpForNextLevel } from '@/lib/xp';
import { getShortcuts, matchShortcut, type ShortcutMap } from '@/lib/shortcuts';
import { supabase } from '@/lib/supabase';
import {
  LayoutDashboard, Calculator, FolderTree, SquareCheck as CheckSquare, Calendar,
  Timer, CalendarHeart, StickyNote, Wallet, Menu, X,
  Layers, Bot, Settings as SettingsIcon, Columns3, Cloud,
} from 'lucide-react';

export type PageId =
  | 'dashboard' | 'grades' | 'forecast' | 'classhub'
  | 'assistant' | 'todos' | 'kanban' | 'calendar' | 'notes'
  | 'drive'
  | 'pomodoro' | 'analytics'
  | 'habits' | 'finance' | 'flashcards'
  | 'settings';

interface NavItem {
  id: PageId;
  label: string;
  icon: typeof LayoutDashboard;
  group: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Core' },
  { id: 'grades', label: 'Grades', icon: Calculator, group: 'Core' },
  { id: 'classhub', label: 'Class Hub', icon: FolderTree, group: 'Core' },
  { id: 'todos', label: 'To-Do List', icon: CheckSquare, group: 'Work' },
  { id: 'kanban', label: 'Kanban Board', icon: Columns3, group: 'Work' },
  { id: 'calendar', label: 'Calendar', icon: Calendar, group: 'Work' },
  { id: 'notes', label: 'Notes & Board', icon: StickyNote, group: 'Work' },
  { id: 'drive', label: 'Cloud Drive', icon: Cloud, group: 'Work' },
  { id: 'pomodoro', label: 'Focus', icon: Timer, group: 'Pulse' },
  { id: 'habits', label: 'Habit Tracker', icon: CalendarHeart, group: 'Pulse' },
  { id: 'finance', label: 'Baon Tracker', icon: Wallet, group: 'Pulse' },
  { id: 'flashcards', label: 'Flashcards', icon: Layers, group: 'Pulse' },
];

const ALIASES: Partial<Record<PageId, PageId>> = {
  forecast: 'grades',
  analytics: 'pomodoro',
  assistant: 'dashboard',
};

const GROUPS = ['Core', 'Work', 'Pulse'];

function resolvePage(hash: string): PageId {
  const raw = hash as PageId;
  if (ALIASES[raw]) return ALIASES[raw] as PageId;
  return NAV_ITEMS.some((n) => n.id === raw) || raw === 'settings' ? raw : 'dashboard';
}

export function usePageState(): [PageId, (p: PageId) => void] {
  const [page, setPage] = useState<PageId>(() => resolvePage(window.location.hash.slice(1)));

  useEffect(() => {
    const onHash = () => setPage(resolvePage(window.location.hash.slice(1)));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (p: PageId) => {
    const next = ALIASES[p] ?? p;
    window.location.hash = next;
    setPage(next);
  };

  return [page, navigate];
}

export default function AppLayout({ page, navigate, children }: { page: PageId; navigate: (p: PageId) => void; children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantRail, setAssistantRail] = useState(false);
  const [assistantWidth, setAssistantWidth] = useState(340);
  const [badgeTodos, setBadgeTodos] = useState(0);
  const [badgeKanban, setBadgeKanban] = useState(0);
  const [badgeCards, setBadgeCards] = useState(0);
  const [xpProgress, setXpProgress] = useState(() => xpForNextLevel());
  const reduceMotion = useReducedMotion();
  const currentLabel = NAV_ITEMS.find((n) => n.id === page)?.label ?? (page === 'settings' ? 'Settings' : 'Dashboard');

  useEffect(() => {
    const loadBadges = async () => {
      try {
        const today = new Date().toLocaleDateString('en-CA');
        const [{ data: todos }, { data: cards }, { data: kanban }] = await Promise.all([
          supabase.from('todos').select('id,due_date,completed,priority'),
          supabase.from('flashcards').select('id,due_date'),
          supabase.from('kanban_tasks').select('id,due_date,status'),
        ]);
        const openHigh = (todos || []).filter(
          (t) => !t.completed && ((t.due_date && t.due_date <= today) || t.priority === 'urgent_important' || t.priority === 'high'),
        ).length;
        setBadgeTodos(openHigh);
        const kb = (kanban || []).filter((k) => {
          if (!k.due_date) return false;
          if (k.status === 'done' || k.status === 'completed') return false;
          return k.due_date <= today || k.due_date <= new Date(Date.now() + 3 * 86400000).toLocaleDateString('en-CA');
        }).length;
        setBadgeKanban(kb);
        setBadgeCards((cards || []).filter((c) => !c.due_date || c.due_date <= today).length);
      } catch {
        /* ignore */
      }
      setXpProgress(xpForNextLevel());
    };
    void loadBadges();
    const onXp = () => setXpProgress(xpForNextLevel());
    window.addEventListener('epicure-xp-changed', onXp);
    return () => window.removeEventListener('epicure-xp-changed', onXp);
  }, [page]);

  useEffect(() => {
    document.title = `${currentLabel} — epicure`;
  }, [currentLabel]);

  useEffect(() => {
    let shortcuts: ShortcutMap = getShortcuts();
    const syncSc = () => {
      shortcuts = getShortcuts();
    };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
      if (typing && !e.metaKey && !e.ctrlKey) return;

      if (matchShortcut(e, shortcuts.search)) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('epicure-toggle-search'));
        return;
      }
      if (matchShortcut(e, shortcuts.assistant)) {
        e.preventDefault();
        setAssistantOpen((v) => !v);
        setAssistantRail(false);
        return;
      }
      if (matchShortcut(e, shortcuts.inbox)) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('epicure-toggle-inbox'));
        return;
      }
      const navPairs: [keyof typeof shortcuts, PageId][] = [
        ['dashboard', 'dashboard'],
        ['notes', 'notes'],
        ['todos', 'todos'],
        ['kanban', 'kanban'],
        ['calendar', 'calendar'],
        ['habits', 'habits'],
        ['focus', 'pomodoro'],
      ];
      for (const [sid, pageId] of navPairs) {
        if (matchShortcut(e, shortcuts[sid])) {
          e.preventDefault();
          navigate(pageId);
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('epicure-shortcuts-changed', syncSc);
    const onArrodes = () => {
      setAssistantOpen(true);
      setAssistantRail(false);
    };
    window.addEventListener('epicure-open-arrodes', onArrodes);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('epicure-shortcuts-changed', syncSc);
      window.removeEventListener('epicure-open-arrodes', onArrodes);
    };
  }, [navigate]);

  return (
    <div className={`rice-shell relative flex h-screen overflow-hidden bg-[#f5f5f7] text-zinc-800 ${assistantOpen ? 'assistant-open' : ''} ${page === 'notes' ? 'rice-shell--notes' : 'rice-shell--mono'}`} style={{ ['--assistant-w' as string]: `${assistantWidth}px` }}>
      <div className="film-grain" aria-hidden />
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-24 h-[22rem] w-[22rem] rounded-full bg-zinc-300/30 blur-[90px]" />
        <div className="absolute -right-24 top-1/3 h-[20rem] w-[20rem] rounded-full bg-white/70 blur-[100px]" />
      </div>

      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="sidebar-overlay"
            className="fixed inset-0 z-30 bg-zinc-900/25 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
            initial={reduceMotion ? false : fadeMotion.initial}
            animate={fadeMotion.animate}
            exit={fadeMotion.exit}
            transition={motionTransition(reduceMotion, 0.18)}
          />
        )}
      </AnimatePresence>

      <aside className={`rice-sidebar group/nav fixed bottom-3 left-3 top-3 z-40 transition-[width,transform] duration-300 ease-out ${sidebarOpen ? 'translate-x-0 w-56' : '-translate-x-[280px] lg:translate-x-0 w-14 hover:w-56'}`}>
        <div className="glass-dark flex h-full flex-col overflow-hidden rounded-[22px]">
          <div className="flex h-14 shrink-0 items-center gap-3 px-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 font-mono text-[11px] font-semibold text-white">E</div>
          </div>
          <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
            {GROUPS.map((group) => (
              <div key={group} className="mb-3">
                <p className="rice-nav-label mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{group}</p>
                {NAV_ITEMS.filter((n) => n.group === group).map((item) => {
                  const Icon = item.icon;
                  const active = page === item.id;
                  const badge =
                    item.id === 'todos'
                      ? badgeTodos
                      : item.id === 'kanban'
                        ? badgeKanban
                        : item.id === 'flashcards'
                          ? badgeCards
                          : 0;
                  return (
                    <button key={item.id} type="button" title={item.label} onClick={() => { navigate(item.id); setSidebarOpen(false); }} className={`relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] transition-colors duration-200 epic-press ${active ? 'text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}>
                      {active && (
                        <motion.span
                          layoutId={reduceMotion ? undefined : 'rice-nav-active'}
                          className="absolute inset-0 rounded-xl bg-white/15"
                          transition={motionTransition(reduceMotion, 0.22)}
                        />
                      )}
                      <span className="relative shrink-0">
                        <Icon className="h-4 w-4" />
                        {badge > 0 && (
                          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
                            {badge > 9 ? '9+' : badge}
                          </span>
                        )}
                      </span>
                      <span className="rice-nav-label relative truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="shrink-0 p-2">
            <button
              type="button"
              onClick={() => navigate('settings')}
              title="Settings"
              className={`relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] transition-colors duration-200 epic-press ${page === 'settings' ? 'text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
            >
              {page === 'settings' && (
                <motion.span
                  layoutId={reduceMotion ? undefined : 'rice-nav-active'}
                  className="absolute inset-0 rounded-xl bg-white/15"
                  transition={motionTransition(reduceMotion, 0.22)}
                />
              )}
              <SettingsIcon className="relative h-4 w-4 shrink-0" />
              <span className="rice-nav-label relative truncate">Settings</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="rice-main relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-20 flex shrink-0 items-center justify-between px-3 pt-3">
          <div className="flex h-10 items-center gap-2 rounded-2xl glass px-2 lg:hidden">
            <button type="button" onClick={() => setSidebarOpen(!sidebarOpen)} className="rounded-lg p-1.5 hover:bg-zinc-200/50" title="Toggle sidebar">
              {sidebarOpen ? <X className="h-4 w-4 text-zinc-700" /> : <Menu className="h-4 w-4 text-zinc-700" />}
            </button>
            <h1 className="truncate text-sm font-semibold text-zinc-800">{currentLabel}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 sm:flex" title={`Level ${xpProgress.level}`}>
              <div className="h-1 w-16 overflow-hidden rounded-full bg-zinc-200/80">
                <div
                  className="h-full rounded-full bg-zinc-800 transition-[width] duration-300"
                  style={{ width: `${Math.round(xpProgress.progress * 100)}%` }}
                />
              </div>
            </div>
            <button type="button" onClick={() => { setAssistantOpen((v) => !v); setAssistantRail(false); }} className={`flex h-10 w-10 items-center justify-center rounded-full glass transition-colors duration-200 ${assistantOpen ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-white/80'}`} title="Arrodes" aria-label="Toggle Arrodes">
              <Bot className={`h-4 w-4 transition-transform duration-200 ${assistantOpen ? 'scale-110' : 'scale-100'}`} />
            </button>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-3 lg:px-8">{children}</main>
      </div>

      <GlobalAssistant
        open={assistantOpen}
        rail={assistantRail}
        page={page}
        width={assistantWidth}
        onWidth={(n) => {
          setAssistantWidth(n);
          try { localStorage.setItem('epicure-assistant-width', String(n)); } catch { /* ignore */ }
        }}
        onClose={() => { setAssistantOpen(false); setAssistantRail(false); }}
        onRail={() => { setAssistantOpen(false); setAssistantRail(true); }}
        navigate={navigate}
      />
      <GlobalDock navigate={navigate} page={page} />
    </div>
  );
}
