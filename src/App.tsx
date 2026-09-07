import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { PomodoroProvider } from '@/context/PomodoroContext';
import { ConfirmProvider } from '@/components/ConfirmProvider';
import AppLayout, { usePageState } from '@/components/AppLayout';
import { motionTransition, pageMotion } from '@/lib/motion';
import DashboardPage from '@/pages/DashboardPage';
import GradesPage from '@/pages/GradesPage';
import ClassHubPage from '@/pages/ClassHubPage';
import TodosPage from '@/pages/TodosPage';
import KanbanPage from '@/pages/KanbanPage';
import CalendarPage from '@/pages/CalendarPage';
import PomodoroPage from '@/pages/PomodoroPage';
import HabitsPage from '@/pages/HabitsPage';
import FinancePage from '@/pages/FinancePage';
import NotesPage from '@/pages/NotesPage';
import FlashcardsPage from '@/pages/FlashcardsPage';
import SettingsPage from '@/pages/SettingsPage';
import DrivePage from '@/pages/DrivePage';
import './rice.css';
import './styles.css';
import './motion.css';

function registerPwa() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
registerPwa();

function App() {
  const [page, navigate] = usePageState();
  const reduceMotion = useReducedMotion();

  const pages: Record<string, ReactNode> = {
    dashboard: <DashboardPage navigate={navigate} />,
    grades: <GradesPage />,
    forecast: <GradesPage />,
    classhub: <ClassHubPage />,
    assistant: <DashboardPage navigate={navigate} />,
    todos: <TodosPage />,
    kanban: <KanbanPage />,
    calendar: <CalendarPage />,
    notes: <NotesPage />,
    drive: <DrivePage />,
    pomodoro: <PomodoroPage />,
    analytics: <PomodoroPage />,
    habits: <HabitsPage />,
    finance: <FinancePage />,
    flashcards: <FlashcardsPage />,
    settings: <SettingsPage />,
  };

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
            {pages[page] ?? pages.dashboard}
          </motion.div>
        </AnimatePresence>
      </AppLayout>
      </ConfirmProvider>
    </PomodoroProvider>
  );
}

export default App;
