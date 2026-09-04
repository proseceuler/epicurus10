import { useState, useEffect, type ReactNode } from 'react';
import { SUBJECTS, NUM_TERMS } from '@/lib/types';
import GlobalDock from '@/components/GlobalDock';
import {
  LayoutDashboard, Calculator, FolderTree, SquareCheck as CheckSquare, Calendar,
  Timer, BarChart3, CalendarHeart, StickyNote, Wallet, Menu, X,
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
  { id: 'grades', label: 'Grade Calculator', icon: Calculator, group: 'Core' },
  { id: 'forecast', label: 'Grade Forecaster', icon: BarChart3, group: 'Core' },
  { id: 'classhub', label: 'Class Hub', icon: FolderTree, group: 'Core' },
  { id: 'assistant', label: 'Study Assistant', icon: Bot, group: 'Core' },
  { id: 'todos', label: 'To-Do List', icon: CheckSquare, group: 'Work' },
  { id: 'kanban', label: 'Kanban Board', icon: Columns3, group: 'Work' },
  { id: 'calendar', label: 'Calendar', icon: Calendar, group: 'Work' },
  { id: 'notes', label: 'Notes & Board', icon: StickyNote, group: 'Work' },
  { id: 'pomodoro', label: 'Focus Timer', icon: Timer, group: 'Pulse' },
  { id: 'analytics', label: 'Focus Analytics', icon: BarChart3, group: 'Pulse' },
  { id: 'habits', label: 'Habit Tracker', icon: CalendarHeart, group: 'Pulse' },
  { id: 'finance', label: 'Baon Tracker', icon: Wallet, group: 'Pulse' },
  { id: 'flashcards', label: 'Flashcards', icon: Layers, group: 'Pulse' },
];

const GROUPS = ['Core', 'Work', 'Pulse'];

export function usePageState(): [PageId, (p: PageId) => void] {
  const [page, setPage] = useState<PageId>(() => {
    const hash = window.location.hash.slice(1) as PageId;
    return NAV_ITEMS.some((n) => n.id === hash) ? hash : 'dashboard';
  });

  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash.slice(1) as PageId;
      if (NAV_ITEMS.some((n) => n.id === hash)) setPage(hash);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (p: PageId) => {
    window.location.hash = p;
    setPage(p);
  };

  return [page, navigate];
}

export default function AppLayout({ page, navigate, children }: { page: PageId; navigate: (p: PageId) => void; children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const currentLabel = NAV_ITEMS.find((n) => n.id === page)?.label ?? 'Dashboard';
  const isAssistant = page === 'assistant';

  useEffect(() => {
    document.title = `${currentLabel} — epicure`;
  }, [currentLabel]);

  return (
    <div className="rice-shell relative flex h-screen overflow-hidden bg-[#0b0c0e]">
      <div className="film-grain" aria-hidden />
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 top-[-8rem] h-[28rem] w-[28rem] rounded-full bg-[#6d8b8e]/8 blur-[90px]" />
        <div className="absolute -right-24 top-1/3 h-[26rem] w-[26rem] rounded-full bg-[#7a8fa3]/6 blur-[100px]" />
        <div className="absolute bottom-[-6rem] left-1/4 h-[22rem] w-[22rem] rounded-full bg-white/3 blur-[80px]" />
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`rice-sidebar group/nav fixed bottom-3 left-3 top-3 z-40 transition-[width,transform] duration-300 ease-out ${
          sidebarOpen ? 'translate-x-0 w-56' : '-translate-x-[280px] lg:translate-x-0 w-14 hover:w-56'
        }`}
      >
        <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-[#101114]/80 backdrop-blur-xl">
          <div className="flex h-14 shrink-0 items-center gap-3 px-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 font-mono text-[11px] font-semibold tracking-widest text-[#9aa8ab]">
              E
            </div>
            <span className="rice-nav-label truncate font-mono text-[13px] font-medium tracking-[0.18em] text-[#d7d8dc] uppercase">
              epicure
            </span>
          </div>

          <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
            {GROUPS.map((group) => (
              <div key={group} className="mb-3">
                <p className="rice-nav-label mb-1 px-2 font-mono text-[9px] font-medium uppercase tracking-[0.22em] text-[#5c6168]">
                  {group}
                </p>
                {NAV_ITEMS.filter((n) => n.group === group).map((item) => {
                  const Icon = item.icon;
                  const active = page === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={item.label}
                      onClick={() => {
                        navigate(item.id);
                        setSidebarOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${
                        active
                          ? 'bg-white/8 text-[#e4e5e8]'
                          : 'text-[#6f747c] hover:bg-white/4 hover:text-[#c9cbd0]'
                      }`}
                    >
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
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/6 font-mono text-[11px] text-[#c9cbd0]">
                G
              </div>
              <div className="rice-nav-label min-w-0 flex-1">
                <p className="truncate text-[12px] text-[#c9cbd0]">Grade 10</p>
                <p className="truncate font-mono text-[10px] text-[#5c6168]">
                  {SUBJECTS.length} subj · {NUM_TERMS} terms
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('settings')}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  page === 'settings' ? 'bg-white/10 text-[#e4e5e8]' : 'text-[#5c6168] hover:bg-white/6 hover:text-[#c9cbd0]'
                }`}
                title="Settings"
              >
                <SettingsIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="rice-main relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-20 shrink-0 px-3 pt-3 lg:hidden">
          <div className="flex h-10 items-center justify-between rounded-xl bg-[#121317]/80 px-2 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="rounded-lg p-1.5 text-[#c9cbd0] hover:bg-white/6"
                title="Toggle sidebar"
              >
                {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
              <h1 className="truncate font-mono text-xs tracking-wide text-[#d7d8dc]">{currentLabel}</h1>
            </div>
          </div>
        </header>

        <main
          className={
            isAssistant
              ? 'flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-20 pt-4 lg:px-8'
              : 'min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-4 lg:px-8'
          }
        >
          {children}
        </main>
      </div>

      <GlobalDock navigate={navigate} page={page} />
    </div>
  );
}
