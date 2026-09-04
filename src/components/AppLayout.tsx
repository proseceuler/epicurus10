import { useState, useEffect, type ReactNode } from 'react';
import { SUBJECTS, NUM_TERMS } from '@/lib/types';
import GlobalDock from '@/components/GlobalDock';
import GlobalAssistant from '@/components/GlobalAssistant';
import {
  LayoutDashboard, Calculator, FolderTree, SquareCheck as CheckSquare, Calendar,
  Timer, CalendarHeart, StickyNote, Wallet, Menu, X,
  Layers, Bot, Settings as SettingsIcon, Columns3,
} from 'lucide-react';

export type PageId =
  | 'dashboard' | 'grades' | 'forecast' | 'classhub'
  | 'assistant' | 'todos' | 'kanban' | 'calendar' | 'notes'
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
  const currentLabel = NAV_ITEMS.find((n) => n.id === page)?.label ?? (page === 'settings' ? 'Settings' : 'Dashboard');

  useEffect(() => {
    document.title = `${currentLabel} — epicure`;
  }, [currentLabel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAssistantOpen((v) => !v);
        setAssistantRail(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`rice-shell relative flex h-screen overflow-hidden bg-[#f5f5f7] text-zinc-800 ${assistantOpen ? 'assistant-open' : ''}`} style={{ ['--assistant-w' as string]: `${assistantWidth}px` }}>
      <div className="film-grain" aria-hidden />
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-24 h-[22rem] w-[22rem] rounded-full bg-zinc-300/30 blur-[90px]" />
        <div className="absolute -right-24 top-1/3 h-[20rem] w-[20rem] rounded-full bg-white/70 blur-[100px]" />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-zinc-900/25 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`rice-sidebar group/nav fixed bottom-3 left-3 top-3 z-40 transition-[width,transform] duration-300 ease-out ${sidebarOpen ? 'translate-x-0 w-56' : '-translate-x-[280px] lg:translate-x-0 w-14 hover:w-56'}`}>
        <div className="glass-dark flex h-full flex-col overflow-hidden rounded-[22px]">
          <div className="flex h-14 shrink-0 items-center gap-3 px-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 font-mono text-[11px] font-semibold text-white">E</div>
            <span className="rice-nav-label truncate text-[15px] font-semibold text-white">epicure</span>
          </div>
          <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
            {GROUPS.map((group) => (
              <div key={group} className="mb-3">
                <p className="rice-nav-label mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{group}</p>
                {NAV_ITEMS.filter((n) => n.group === group).map((item) => {
                  const Icon = item.icon;
                  const active = page === item.id;
                  return (
                    <button key={item.id} type="button" title={item.label} onClick={() => { navigate(item.id); setSidebarOpen(false); }} className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] transition-colors ${active ? 'bg-white/15 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}>
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="rice-nav-label truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="shrink-0 p-2">
            <div className="flex items-center gap-2 px-1 py-1">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] text-white">G</div>
              <div className="rice-nav-label min-w-0 flex-1">
                <p className="truncate text-[12px] text-zinc-200">Grade 10</p>
                <p className="truncate text-[10px] text-zinc-500">{SUBJECTS.length} subjects · {NUM_TERMS} terms</p>
              </div>
              <button type="button" onClick={() => navigate('settings')} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${page === 'settings' ? 'bg-white/15 text-white' : 'text-zinc-500 hover:bg-white/10 hover:text-white'}`} title="Settings">
                <SettingsIcon className="h-4 w-4" />
              </button>
            </div>
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
          <div className="ml-auto">
            <button type="button" onClick={() => { setAssistantOpen((v) => !v); setAssistantRail(false); }} className={`flex h-10 w-10 items-center justify-center rounded-full glass transition-colors duration-200 ${assistantOpen ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-white/80'}`} title="Assistant (⌘K)" aria-label="Toggle assistant">
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
