import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { PomodoroProvider } from '@/context/PomodoroContext';
import { startDbSync } from '@/lib/dbSync';
import { ConfirmProvider } from '@/components/ConfirmProvider';
import AppLayout, { usePageState, type PageId } from '@/components/AppLayout';
import { motionTransition, pageMotion } from '@/lib/motion';
import './rice.css';
import './styles.css';
import './motion.css';

const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const GradesPage = lazy(() => import('@/pages/GradesPage'));
const ClassHubPage = lazy(() => import('@/pages/ClassHubPage'));
const TodosPage = lazy(() => import('@/pages/TodosPage'));
const KanbanPage = lazy(() => import('@/pages/KanbanPage'));
const CalendarPage = lazy(() => import('@/pages/CalendarPage'));
const PomodoroPage = lazy(() => import('@/pages/PomodoroPage'));
const HabitsPage = lazy(() => import('@/pages/HabitsPage'));
const FinancePage = lazy(() => import('@/pages/FinancePage'));
const NotesPage = lazy(() => import('@/pages/NotesPage'));
const FlashcardsPage = lazy(() => import('@/pages/FlashcardsPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const DrivePage = lazy(() => import('@/pages/DrivePage'));

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

if (typeof window !== 'undefined') {
  startDbSync();
}

function useCompactUi() {
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1279px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1279px)');
    const onChange = () => setCompact(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return compact;
}

function PageFallback() {
  return (
    <div className="flex h-full min-h-[40vh] items-center justify-center text-sm text-zinc-400">
      Loading…
    </div>
  );
}

function AppPages() {
  const { page } = usePageState();
  const reduce = useReducedMotion();
  const compact = useCompactUi();

  const body = (() => {
    switch (page) {
      case 'dashboard':
        return <DashboardPage />;
      case 'grades':
        return <GradesPage />;
      case 'classhub':
        return <ClassHubPage />;
      case 'todos':
        return <TodosPage />;
      case 'kanban':
        return <KanbanPage />;
      case 'calendar':
        return <CalendarPage />;
      case 'pomodoro':
        return <PomodoroPage />;
      case 'habits':
        return <HabitsPage />;
      case 'finance':
        return <FinancePage />;
      case 'notes':
        return <NotesPage />;
      case 'flashcards':
        return <FlashcardsPage />;
      case 'settings':
        return <SettingsPage />;
      case 'drive':
        return <DrivePage />;
      default:
        return <DashboardPage />;
    }
  })();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={page}
        className="h-full min-h-0"
        {...(reduce ? {} : pageMotion)}
        transition={motionTransition}
      >
        <Suspense fallback={<PageFallback />}>{body}</Suspense>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <PomodoroProvider>
      <ConfirmProvider>
        <AppLayout>
          <AppPages />
        </AppLayout>
      </ConfirmProvider>
    </PomodoroProvider>
  );
}
