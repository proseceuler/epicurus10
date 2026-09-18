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

function ActivePage({ page, navigate }: { page: PageId; navigate: (p: PageId, focus?: string | null) => void }) {
  switch (page) {
    case 'grades':
    case 'forecast':
      return <GradesPage />;
    case 'classhub':
      return <ClassHubPage />;
    case 'todos':
      return <TodosPage />;
    case 'kanban':
      return <KanbanPage />;
    case 'calendar':
      return <CalendarPage />;
    case 'notes':
      return <NotesPage />;
    case 'drive':
      return <DrivePage />;
    case 'pomodoro':
    case 'analytics':
      return <PomodoroPage />;
    case 'habits':
      return <HabitsPage />;
    case 'finance':
      return <FinancePage />;
    case 'flashcards':
      return <FlashcardsPage />;
    case 'settings':
      return <SettingsPage />;
    default:
      return <DashboardPage navigate={navigate} />;
  }
}

function App() {
  const [page, navigate] = usePageState();
  const reduceMotion = useReducedMotion();
  const compact = useCompactUi();
  const quiet = Boolean(reduceMotion || compact);

  return (
    <PomodoroProvider>
      <ConfirmProvider>
        <AppLayout page={page} navigate={navigate}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={page}
              className="min-h-full"
              initial={quiet ? false : pageMotion.initial}
              animate={pageMotion.animate}
              exit={quiet ? pageMotion.animate : pageMotion.exit}
              transition={motionTransition(quiet, 0.2)}
            >
              <Suspense fallback={<div className="min-h-[40vh]" aria-hidden />}>
                <ActivePage page={page} navigate={navigate} />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </AppLayout>
      </ConfirmProvider>
    </PomodoroProvider>
  );
}

export default App;
