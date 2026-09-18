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
import { motionTransition, overlayPresence, sheetMotion } from '@/lib/motion';
import { OverlayScrim } from '@/components/MotionUI';
import { formatShortcut, getShortcuts } from '@/lib/shortcuts';

type HitKind = 'page' | 'tab' | 'note' | 'todo' | 'class' | 'event' | 'card' | 'habit' | 'deck' | 'goal';

type Hit = {
  id: string;
  kind: HitKind;
  title: string;
  subtitle?: string;
  page: PageId;
  focus?: string;
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

const TABS: { page: PageId; title: string; hint: string; keys: string[]; focus: string }[] = [
  { page: 'habits', title: 'Habit Home', hint: 'Rings and today', keys: ['habit home', 'rings'], focus: 'home' },
  { page: 'habits', title: 'Habit Tracker tab', hint: 'Grid and weekly %', keys: ['tracker tab', 'habit grid'], focus: 'track' },
  { page: 'habits', title: 'Habit Insights', hint: 'Trends', keys: ['insights'], focus: 'insights' },
  { page: 'habits', title: 'Habit Dashboard', hint: 'Monthly dash', keys: ['habit dash'], focus: 'dash' },
  { page: 'classhub', title: 'Class info', hint: 'Teacher, room, links', keys: ['teacher', 'room', 'links'], focus: 'info' },
  { page: 'classhub', title: 'Timetable', hint: 'Weekly class grid', keys: ['timetable', 'schedule'], focus: 'timetable' },
  { page: 'calendar', title: 'Week view', hint: 'All-day + hours', keys: ['week view'], focus: 'week' },
  { page: 'calendar', title: 'Month view', hint: 'Month grid', keys: ['month view'], focus: 'month' },
  { page: 'grades', title: 'Simulate grades', hint: 'Hypothetical scores', keys: ['simulate'], focus: 'simulate' },
  { page: 'notes', title: 'Notes vault', hint: 'Markdown notes', keys: ['vault', 'markdown'], focus: 'notes' },
  { page: 'notes', title: 'Whiteboard', hint: 'Infinite board', keys: ['whiteboard', 'canvas'], focus: 'board' },
  { page: 'notes', title: 'Notes graph', hint: 'Linked notes', keys: ['graph'], focus: 'graph' },
  { page: 'finance', title: 'Baon goals', hint: 'Savings targets', keys: ['goal', 'save'], focus: 'goals' },
  { page: 'pomodoro', title: 'Focus timer', hint: 'Pomodoro', keys: ['pomodoro', 'session'], focus: '' },
  { page: 'flashcards', title: 'Review cards', hint: 'Due reviews', keys: ['review', 'sm2'], focus: 'review' },
  { page: 'settings', title: 'Shortcuts', hint: 'Hotkeys', keys: ['hotkey', 'shortcut'], focus: 'shortcuts' },
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
  navigate: (p: PageId, focus?: string | null) => void;
  mode?: 'modal' | 'dock';
}) {
  const [q, setQ] = useState('');
  const [notes, setNotes] = useState<{ id: string; title: string; content: string; folder: string }[]>([]);
  const [todos, setTodos] = useState<{ id: string; title: string; completed: boolean }[]>([]);
  const [cards, setCards] = useState<{ id: string; title: string; status: string }[]>([]);
  const [habits, setHabits] = useState<{ id: string; name: string }[]>([]);
  const [decks, setDecks] = useState<{ id: string; name: string }[]>([]);
  const [goals, setGoals] = useState<{ id: string; name: string }[]>([]);
  const [cardsInDecks, setCardsInDecks] = useState<{ id: string; front: string; deck: string }[]>([]);
  const [teachers, setTeachers] = useState<{ subject: string; teacher: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const reduceMotion = useReducedMotion();

  const load = useCallback(async () => {
    setLoading(true);
    const [n, t, k, h, d, g, fc, hubs] = await Promise.all([
      supabase.from('notes').select('id,title,content,folder').limit(200),
      supabase.from('todos').select('id,title,completed').limit(200),
      supabase.from('kanban_tasks').select('id,title,status').limit(200),
      supabase.from('habits').select('id,name').limit(80),
      supabase.from('flashcard_decks').select('id,name').limit(80),
      supabase.from('finance_goals').select('id,name').limit(80),
      supabase.from('flashcards').select('id,front,deck_id').limit(120),
      supabase.from('class_hub').select('subject_key,teacher_name').limit(40),
    ]);
    if (n.data) setNotes(n.data as typeof notes);
    if (t.data) setTodos(t.data as typeof todos);
    if (k.data) setCards(k.data as typeof cards);
    if (h.data) setHabits(h.data as typeof habits);
    if (d.data) setDecks(d.data as typeof decks);
    if (g.data) setGoals(g.data as typeof goals);
    if (fc.data) {
      const deckName = new Map((d.data || []).map((x: { id: string; name: string }) => [x.id, x.name]));
      setCardsInDecks((fc.data as { id: string; front: string; deck_id: string }[]).map((c) => ({
        id: c.id, front: c.front, deck: deckName.get(c.deck_id) || 'Deck',
      })));
    }
    if (hubs.data) {
      setTeachers((hubs.data as { subject_key: string; teacher_name: string }[])
        .filter((r) => r.teacher_name)
        .map((r) => ({ subject: r.subject_key, teacher: r.teacher_name })));
    }
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
      push({ id: `tab-${t.page}-${t.focus || t.title}`, kind: 'tab', title: t.title, subtitle: t.hint, page: t.page, focus: t.focus || undefined }, `${t.title} ${t.hint} ${t.keys.join(' ')}`);
    }
    for (const s of SUBJECTS) {
      push({ id: `class-${s.key}`, kind: 'class', title: s.name, subtitle: `Class Hub · ${s.shortName}`, page: 'classhub', focus: s.key }, `${s.name} ${s.shortName} ${s.key} class`);
      push({ id: `grade-${s.key}`, kind: 'tab', title: `${s.shortName} grades`, subtitle: 'Grades subject', page: 'grades', focus: s.key }, `${s.name} ${s.shortName} grade score`);
    }
    for (const n of notes) {
      push({ id: n.id, kind: 'note', title: n.title || 'Untitled', subtitle: n.folder || 'Note', page: 'notes', focus: n.id }, `${n.title} ${n.content} ${n.folder}`);
    }
    for (const t of todos) {
      push({ id: t.id, kind: 'todo', title: t.title, subtitle: t.completed ? 'Done' : 'Open task', page: 'todos', focus: t.id }, t.title);
    }
    for (const c of cards) {
      push({ id: c.id, kind: 'card', title: c.title, subtitle: c.status || 'Kanban', page: 'kanban', focus: c.id }, `${c.title} ${c.status}`);
    }
    for (const e of getCalendarEvents()) {
      push({ id: e.id, kind: 'event', title: e.title, subtitle: `${e.start_date}${e.end_date !== e.start_date ? ` – ${e.end_date}` : ''}`, page: 'calendar', focus: e.id }, `${e.title} ${e.description || ''} ${e.kind}`);
    }
    for (const h of habits) {
      push({ id: h.id, kind: 'habit', title: h.name, subtitle: 'Habit', page: 'habits', focus: h.id }, h.name);
    }
    for (const d of decks) {
      push({ id: d.id, kind: 'deck', title: d.name, subtitle: 'Flashcard deck', page: 'flashcards', focus: d.id }, d.name);
    }
    for (const g of goals) {
      push({ id: g.id, kind: 'goal', title: g.name, subtitle: 'Savings goal', page: 'finance', focus: g.id }, g.name);
    }
    for (const c of cardsInDecks) {
      push({ id: c.id, kind: 'deck', title: c.front, subtitle: c.deck, page: 'flashcards', focus: c.id }, `${c.front} ${c.deck} card`);
    }
    for (const teach of teachers) {
      push({ id: `teacher-${teach.subject}`, kind: 'class', title: teach.teacher, subtitle: 'Teacher · Class Hub', page: 'classhub', focus: teach.subject }, `${teach.teacher} teacher ${teach.subject}`);
    }

    return ranked.sort((a, b) => b.s - a.s).slice(0, 50);
  }, [q, notes, todos, cards, habits, decks, goals, cardsInDecks, teachers]);

  const [active, setActive] = useState(0);
  const searchKeys = formatShortcut(getShortcuts().search);
  useEffect(() => { setActive(0); }, [q]);
  const go = (h: Hit) => {
    const focus = h.focus || null;
    window.location.hash = hashFor(h.page, focus);
    navigate(h.page, focus);
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
      {hits.map((h, i) => {
        const Icon = ICONS[h.kind] || Search;
        return (
          <button
            key={`${h.kind}-${h.id}`}
            type="button"
            className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-150 ${i === active ? 'bg-white/50' : 'hover:bg-white/40'}`}
            onMouseEnter={() => setActive(i)}
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
        <motion.div
          key="search-overlay"
          className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[min(18vh,7.5rem)]"
          initial={false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 1 }}
          transition={overlayPresence(reduceMotion)}
        >
          <OverlayScrim onClose={onClose} />
          <motion.div
            className="epic-glass-sheet relative w-full max-w-3xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            initial={reduceMotion ? false : sheetMotion.initial}
            animate={sheetMotion.animate}
            exit={sheetMotion.exit}
            transition={motionTransition(reduceMotion, 0.22)}
          >
            <div className="flex items-center gap-2 border-b border-white/40 px-4 py-3">
              <Search className="h-4 w-4 text-zinc-400" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search pages, tabs, classes, notes, tasks, cards, events…"
                className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-zinc-400"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') onClose();
                  if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(Math.max(0, hits.length - 1), i + 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
                  if (e.key === 'Enter' && (hits[active] || hits[0])) go(hits[active] || hits[0]);
                }}
              />
              <button type="button" onClick={onClose} className="epic-press rounded-lg p-1 text-zinc-400 hover:bg-white/40">
                <X className="h-4 w-4" />
              </button>
            </div>
            {list}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/35 px-4 py-2 text-[11px] text-zinc-400">
              <span className="inline-flex items-center gap-1.5">
                <kbd className="rounded bg-white/55 px-1 font-sans text-[10px] text-zinc-500">↑</kbd>
                <kbd className="rounded bg-white/55 px-1 font-sans text-[10px] text-zinc-500">↓</kbd>
                to navigate
              </span>
              <span className="inline-flex items-center gap-1.5">
                <kbd className="rounded bg-white/55 px-1 font-sans text-[10px] text-zinc-500">↵</kbd>
                to open
              </span>
              <span className="inline-flex items-center gap-1.5">
                <kbd className="rounded bg-white/55 px-1.5 font-sans text-[10px] text-zinc-500">esc</kbd>
                to dismiss
              </span>
              <span className="ml-auto inline-flex items-center gap-1.5">
                <kbd className="rounded bg-white/55 px-1.5 font-sans text-[10px] text-zinc-500">{searchKeys}</kbd>
                <span>or</span>
                <kbd className="rounded bg-white/55 px-1.5 font-sans text-[10px] text-zinc-500">/</kbd>
                to toggle
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
