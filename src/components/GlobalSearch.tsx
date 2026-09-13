import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { supabase } from '@/lib/supabase';
import type { PageId } from '@/components/AppLayout';
import {
  Search, FileText, CheckSquare, BookOpen, X, Calendar, Columns3,
  Layers, Wallet, CalendarHeart, Timer, FolderTree, Calculator, LayoutDashboard,
} from 'lucide-react';
import { SUBJECTS } from '@/lib/types';
import { getCalendarEvents } from '@/lib/calendarStore';
import { hashFor } from '@/lib/routeFocus';
import { fadeMotion, motionTransition, sheetMotion } from '@/lib/motion';

type HitKind = 'page' | 'tab' | 'note' | 'todo' | 'class' | 'event' | 'card' | 'habit' | 'deck' | 'goal';

type Hit = {
  id: string;
  kind: HitKind;
  title: string;
  subtitle?: string;
  page: PageId;
  subject?: string;
};

const PAGES: { page: PageId; title: string; hint: string; keys: string[] }[] = [
  { page: 'dashboard', title: 'Dashboard', hint: 'Home overview', keys: ['home', 'overview'] },
  { page: 'grades', title: 'Grades', hint: 'WW · PT · EX · Simulate', keys: ['ww', 'pt', 'ex', 'score', 'simulate', 'forecast'] },
  { page: 'classhub', title: 'Class Hub', hint: 'Teachers, links, timetable', keys: ['timetable', 'teacher', 'room', 'class'] },
  { page: 'todos', title: 'To-Do List', hint: 'Eisenhower tasks', keys: ['task', 'todo', 'eisenhower'] },
  { page: 'kanban', title: 'Kanban Board', hint: 'Cards and lists', keys: ['board', 'card', 'kanban'] },
  { page: 'calendar', title: 'Calendar', hint: 'Week · month · events', keys: ['week', 'month', 'event', 'all day'] },
  { page: 'notes', title: 'Notes & Board', hint: 'Vault and whiteboard', keys: ['note', 'vault', 'whiteboard'] },
  { page: 'drive', title: 'Cloud Drive', hint: 'Files', keys: ['file', 'drive', 'cloud'] },
  { page: 'pomodoro', title: 'Focus', hint: 'Timer', keys: ['pomodoro', 'timer', 'focus'] },
  { page: 'habits', title: 'Habit Tracker', hint: 'Home · Tracker · Insights', keys: ['tracker', 'streak', 'insights'] },
  { page: 'finance', title: 'Baon Tracker', hint: 'Allowance and goals', keys: ['baon', 'allowance', 'expense', 'goal'] },
  { page: 'flashcards', title: 'Flashcards', hint: 'Decks and reviews', keys: ['deck', 'sm2', 'review'] },
  { page: 'settings', title: 'Settings', hint: 'Shortcuts and frame', keys: ['settings', 'keys'] },
];

const TABS: { page: PageId; title: string; hint: string; keys: string[] }[] = [
  { page: 'habits', title: 'Habit Tracker tab', hint: 'Grid and weekly %', keys: ['tracker tab', 'habit grid'] },
  { page: 'habits', title: 'Habit Insights', hint: 'Trends', keys: ['insights'] },
  { page: 'classhub', title: 'Timetable', hint: 'Weekly class grid', keys: ['timetable', 'schedule'] },
  { page: 'calendar', title: 'Week view', hint: 'All-day + hours', keys: ['week view'] },
  { page: 'calendar', title: 'Month view', hint: 'Month grid', keys: ['month view'] },
  { page: 'grades', title: 'Simulate grades', hint: 'Hypothetical scores', keys: ['simulate'] },
];

function score(hay: string, q: string) {
  const h = hay.toLowerCase();
  if (!q) return 0;
  if (h === q) return 100;
  if (h.startsWith(q)) return 80;
  if (h.includes(q)) return 50;
  return q.split(/\s+/).every((p) => h.includes(p)) ? 30 : 0;
}

const ICONS: Record<HitKind, typeof Search> = {
  page: LayoutDashboard,
  tab: FolderTree,
  note: FileText,
  todo: CheckSquare,
  class: BookOpen,
  event: Calendar,
  card: Columns3,
  habit: CalendarHeart,
  deck: Layers,
  goal: Wallet,
};

export default function GlobalSearch({
  open,
  onClose,
  navigate,
  mode = 'modal',
}: {
  open: boolean;
  onClose: () => void;
  navigate: (p: PageId) => void;
  mode?: 'modal' | 'dock';
}) {
  const [q, setQ] = useState('');
  const [notes, setNotes] = useState<{ id: string; title: string; content: string; folder: string }[]>([]);
  const [todos, setTodos] = useState<{ id: string; title: string; completed: boolean }[]>([]);
  const [cards, setCards] = useState<{ id: string; title: string; status: string }[]>([]);
  const [habits, setHabits] = useState<{ id: string; name: string }[]>([]);
  const [decks, setDecks] = useState<{ id: string; name: string }[]>([]);
  const [goals, setGoals] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const reduceMotion = useReducedMotion();

  const load = useCallback(async () => {
    setLoading(true);
    const [n, t, k, h, d, g] = await Promise.all([
      supabase.from('notes').select('id,title,content,folder').limit(200),
      supabase.from('todos').select('id,title,completed').limit(200),
      supabase.from('kanban_tasks').select('id,title,status').limit(200),
      supabase.from('habits').select('id,name').limit(80),
      supabase.from('flashcard_decks').select('id,name').limit(80),
      supabase.from('finance_goals').select('id,name').limit(80),
    ]);
    if (n.data) setNotes(n.data as typeof notes);
    if (t.data) setTodos(t.data as typeof todos);
    if (k.data) setCards(k.data as typeof cards);
    if (h.data) setHabits(h.data as typeof habits);
    if (d.data) setDecks(d.data as typeof decks);
    if (g.data) setGoals(g.data as typeof goals);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      void load();
    }
  }, [open, load]);

  const hits = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [] as Hit[];
    const ranked: (Hit & { s: number })[] = [];
    const push = (hit: Hit, hay: string) => {
      const s = score(hay, query);
      if (s > 0) ranked.push({ ...hit, s });
    };

    for (const p of PAGES) {
      push({ id: `page-${p.page}`, kind: 'page', title: p.title, subtitle: p.hint, page: p.page }, `${p.title} ${p.hint} ${p.keys.join(' ')}`);
    }
    for (const t of TABS) {
      push({ id: `tab-${t.page}-${t.title}`, kind: 'tab', title: t.title, subtitle: t.hint, page: t.page }, `${t.title} ${t.hint} ${t.keys.join(' ')}`);
    }
    for (const s of SUBJECTS) {
      push({ id: `class-${s.key}`, kind: 'class', title: s.name, subtitle: `Class Hub · ${s.shortName}`, page: 'classhub', subject: s.key }, `${s.name} ${s.shortName} ${s.key} class`);
      push({ id: `grade-${s.key}`, kind: 'tab', title: `${s.shortName} grades`, subtitle: 'Grades tab', page: 'grades', subject: s.key }, `${s.name} ${s.shortName} grade score`);
    }
    for (const n of notes) {
      push({ id: n.id, kind: 'note', title: n.title || 'Untitled', subtitle: n.folder || 'Note', page: 'notes' }, `${n.title} ${n.content} ${n.folder}`);
    }
    for (const t of todos) {
      push({ id: t.id, kind: 'todo', title: t.title, subtitle: t.completed ? 'Done' : 'Open task', page: 'todos' }, t.title);
    }
    for (const c of cards) {
      push({ id: c.id, kind: 'card', title: c.title, subtitle: c.status || 'Kanban', page: 'kanban' }, `${c.title} ${c.status}`);
    }
    for (const e of getCalendarEvents()) {
      push({ id: e.id, kind: 'event', title: e.title, subtitle: `${e.start_date}${e.end_date !== e.start_date ? ` – ${e.end_date}` : ''}`, page: 'calendar' }, `${e.title} ${e.description || ''} ${e.kind}`);
    }
    for (const h of habits) {
      push({ id: h.id, kind: 'habit', title: h.name, subtitle: 'Habit', page: 'habits' }, h.name);
    }
    for (const d of decks) {
      push({ id: d.id, kind: 'deck', title: d.name, subtitle: 'Flashcard deck', page: 'flashcards' }, d.name);
    }
    for (const g of goals) {
      push({ id: g.id, kind: 'goal', title: g.name, subtitle: 'Savings goal', page: 'finance' }, g.name);
    }

    return ranked.sort((a, b) => b.s - a.s).slice(0, 50);
  }, [q, notes, todos, cards, habits, decks, goals]);

  const go = (h: Hit) => {
    window.location.hash = hashFor(h.page, h.subject);
    navigate(h.page);
    onClose();
  };

  const list = (
    <div className={mode === 'dock' ? 'max-h-64 overflow-y-auto' : 'max-h-[58vh] overflow-y-auto py-1'}>
      {loading && <p className="px-3 py-4 text-center text-xs text-zinc-400">Loading…</p>}
      {!loading && !q.trim() && (
        <p className="px-3 py-4 text-center text-xs text-zinc-400">Pages, tabs, classes, notes, tasks, cards, events, decks…</p>
      )}
      {!loading && q.trim() && hits.length === 0 && (
        <p className="px-3 py-4 text-center text-xs text-zinc-400">No matches</p>
      )}
      {hits.map((h) => {
        const Icon = ICONS[h.kind] || Search;
        return (
          <button
            key={`${h.kind}-${h.id}`}
            type="button"
            className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-150 hover:bg-white/40"
            onClick={() => go(h)}
          >
            <Icon className="h-4 w-4 shrink-0 text-zinc-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-800">{h.title}</p>
              <p className="truncate text-[11px] text-zinc-400">{h.subtitle}</p>
            </div>
            <span className="text-[10px] uppercase tracking-wide text-zinc-400">{h.kind}</span>
          </button>
        );
      })}
    </div>
  );

  if (mode === 'dock') {
    if (!open) return null;
    return (
      <div className="w-[min(92vw,24rem)] overflow-hidden rounded-xl epic-glass-sheet">
        <div className="flex items-center gap-2 border-b border-white/40 px-2 py-2">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search everything…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && hits[0]) go(hits[0]);
            }}
          />
          <button type="button" onClick={onClose} className="epic-press rounded-lg p-1 text-zinc-400 hover:bg-white/40">
            <X className="h-4 w-4" />
          </button>
        </div>
        {list}
      </div>
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <div key="search-overlay" className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[8vh]">
          <motion.div
            className="absolute inset-0 bg-zinc-900/30 backdrop-blur-md"
            onClick={onClose}
            initial={reduceMotion ? false : fadeMotion.initial}
            animate={fadeMotion.animate}
            exit={fadeMotion.exit}
            transition={motionTransition(reduceMotion, 0.22)}
          />
          <motion.div
            className="epic-glass-sheet relative w-full max-w-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            initial={reduceMotion ? false : sheetMotion.initial}
            animate={sheetMotion.animate}
            exit={sheetMotion.exit}
            transition={motionTransition(reduceMotion, 0.22)}
          >
            <div className="flex items-center gap-2 border-b border-white/40 px-3 py-2.5">
              <Search className="h-4 w-4 text-zinc-400" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search pages, classes, notes, tasks, events…"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') onClose();
                  if (e.key === 'Enter' && hits[0]) go(hits[0]);
                }}
              />
              <button type="button" onClick={onClose} className="epic-press rounded-lg p-1 text-zinc-400 hover:bg-white/40">
                <X className="h-4 w-4" />
              </button>
            </div>
            {list}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
