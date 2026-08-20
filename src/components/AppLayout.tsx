import { useState, useEffect, type ReactNode } from 'react';
import { SUBJECTS, NUM_TERMS } from '@/lib/types';
import GlobalDock from '@/components/GlobalDock';
import { LayoutDashboard, Calculator, FolderTree, SquareCheck as CheckSquare, Calendar, Timer, ChartBar as BarChart3, CalendarHeart, StickyNote, Wallet, Menu, X, Layers, Bot, Settings as SettingsIcon } from 'lucide-react';

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
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Overview' },
  { id: 'grades', label: 'Grade Calculator', icon: Calculator, group: 'Academic' },
  { id: 'forecast', label: 'Grade Forecaster', icon: BarChart3, group: 'Academic' },
  { id: 'classhub', label: 'Class Hub', icon: FolderTree, group: 'Academic' },
  { id: 'assistant', label: 'Study Assistant', icon: Bot, group: 'Academic' },
  { id: 'todos', label: 'To-Do List', icon: CheckSquare, group: 'Tasks' },
  { id: 'kanban', label: 'Kanban Board', icon: LayoutDashboard, group: 'Tasks' },
  { id: 'calendar', label: 'Calendar', icon: Calendar, group: 'Tasks' },
  { id: 'notes', label: 'Notes & Ideas', icon: StickyNote, group: 'Tasks' },
  { id: 'pomodoro', label: 'Focus Timer', icon: Timer, group: 'Focus' },
  { id: 'analytics', label: 'Focus Analytics', icon: BarChart3, group: 'Focus' },
  { id: 'habits', label: 'Habit Tracker', icon: CalendarHeart, group: 'Personal' },
  { id: 'finance', label: 'Baon Tracker', icon: Wallet, group: 'Personal' },
  { id: 'flashcards', label: 'Flashcards', icon: Layers, group: 'Personal' },
];

const GROUPS = ['Overview', 'Academic', 'Tasks', 'Focus', 'Personal'];

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

  useEffect(() => {
    document.title = `${currentLabel} — epicure`;
  }, [currentLabel]);

  return (
    <div className="min-h-screen bg-zinc-100 relative">
      {/* Ambient background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-zinc-300/20 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-zinc-400/15 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-zinc-200/25 rounded-full blur-3xl" />
      </div>

      {/* Mobile overlay only */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-zinc-900/30 backdrop-blur-sm z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar — static on desktop, slide-in on mobile */}
      <aside className={`fixed top-4 left-4 bottom-4 w-60 z-40 transition-transform duration-300 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-[280px] lg:translate-x-0'
      }`}>
        <div className="glass-dark glass-shadow-lg rounded-3xl h-full flex flex-col overflow-hidden">
          {/* Logo */}
          <div className="flex items-center gap-3 px-5 h-16 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center overflow-hidden">
              <img
                src="https://cdn-icons-png.flaticon.com/512/3582/3582676.png"
                alt="epicure"
                className="w-5 h-5 invert"
              />
            </div>
            <span className="font-bold text-lg text-white">epicure</span>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto py-3 px-3">
            {GROUPS.map((group) => (
              <div key={group} className="mb-3">
                <p className="px-3 mb-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{group}</p>
                {NAV_ITEMS.filter((n) => n.group === group).map((item) => {
                  const Icon = item.icon;
                  const active = page === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { navigate(item.id); setSidebarOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                        active
                          ? 'bg-white/15 text-white'
                          : 'text-zinc-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Footer */}
          <div className="border-t border-white/5 p-3 shrink-0">
            <div className="flex items-center gap-2 px-3 py-2">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm font-semibold text-white">
                G
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-200">Grade 10</p>
                <p className="text-xs text-zinc-500">{SUBJECTS.length} subjects · {NUM_TERMS} terms</p>
              </div>
              <button
                onClick={() => navigate('settings')}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                  page === 'settings' ? 'bg-white/15 text-white' : 'text-zinc-500 hover:text-white hover:bg-white/10'
                }`}
                title="Settings"
              >
                <SettingsIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content — offset for sidebar on desktop, aligned at top-4 */}
      <div className="flex flex-col min-h-screen relative lg:pl-[17rem] pt-4 pr-4 pb-4">
        {/* Floating header — mobile/tablet only */}
        <header className="sticky top-4 z-20 px-3 lg:hidden mb-2">
          <div className="glass glass-shadow rounded-xl h-10 flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-1.5 rounded-lg hover:bg-zinc-200/50"
                title="Toggle sidebar"
              >
                {sidebarOpen ? <X className="w-4 h-4 text-zinc-700" /> : <Menu className="w-4 h-4 text-zinc-700" />}
              </button>
              <h1 className="text-sm font-semibold text-zinc-800 truncate">{currentLabel}</h1>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 px-4 lg:px-6 pb-28">
          {children}
        </main>
      </div>

      {/* Global bottom dock */}
      <GlobalDock navigate={navigate} />
    </div>
  );
}