import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { PomodoroProvider } from '@/context/PomodoroContext';
import AppLayout, { usePageState } from '@/components/AppLayout';
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
import './rice.css';

function App() {
  const [page, navigate] = usePageState();

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
    pomodoro: <PomodoroPage />,
    analytics: <PomodoroPage />,
    habits: <HabitsPage />,
    finance: <FinancePage />,
    flashcards: <FlashcardsPage />,
    settings: <SettingsPage />,
  };

  return (
    <PomodoroProvider>
      <AppLayout page={page} navigate={navigate}>
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0.92 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 1 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
          >
            {pages[page] ?? pages.dashboard}
          </motion.div>
        </AnimatePresence>
      </AppLayout>
    </PomodoroProvider>
  );
}

export default App;
