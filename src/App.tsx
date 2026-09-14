import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { lazy, Suspense, type ComponentType } from 'react';
import { PomodoroProvider } from '@/context/PomodoroContext';
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

function registerPwa() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
registerPwa();

function PageFallback() {
  return <div className="min-h-[40vh]" aria-hidden />;
}

function ActivePage({ page, navigate }: { page: PageId; navigate: (p: PageId, focus?: string | null) => void }) {
  const pages: Record<string, ComponentType<{ navigate?: typeof navigate }>> = {
    dashboard: DashboardPage,
    grades: GradesPage,
    forecast: GradesPage,
    classhub: ClassHubPage,
    assistant: DashboardPage,
    todos: TodosPage,
    kanban: KanbanPage,
    calendar: CalendarPage,
    notes: NotesPage,
    drive: DrivePage,
    pomodoro: PomodoroPage,
    analytics: PomodoroPage,
    habits: HabitsPage,
    finance: FinancePage,
    flashcards: FlashcardsPage,
    settings: SettingsPage,
  };
  const Page = pages[page] ?? DashboardPage;
  if (page === 'dashboard' || page === 'assistant') return <DashboardPage navigate={navigate} />;
  return <Page />;
}

function App() {
  const [page, navigate] = usePageState();
  const reduceMotion = useReducedMotion();

  return (
    <PomodoroProvider>
      <ConfirmProvider>
      <AppLayout page={page} navigate={navigate}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={page}
            className="min-h-full"
            initial={reduceMotion ? false : pageMotion.initial}
            animate={pageMotion.animate}
            exit={reduceMotion ? pageMotion.animate : pageMotion.exit}
            transition={motionTransition(reduceMotion, 0.2)}
          >
            <Suspense fallback={<PageFallback />}>
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
