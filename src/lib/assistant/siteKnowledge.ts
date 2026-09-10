/** Static help pages indexed into namespace `site`. */

export interface SiteDoc {
  id: string;
  title: string;
  page: string;
  text: string;
}

export const SITE_DOCS: SiteDoc[] = [
  {
    id: 'site-todos',
    title: 'To-Do List',
    page: 'todos',
    text: 'The To-Do List stores school tasks with a title, optional subject, due date, and Eisenhower priority. Ask Arrodes to add, complete, or change a task. Open the Todos page to drag or check items yourself.',
  },
  {
    id: 'site-calendar',
    title: 'Calendar',
    page: 'calendar',
    text: 'Calendar holds events, deadlines, exams, reminders, and holidays. DepEd school-year dates may already be seeded. Ask Arrodes to add an event with a start date. Multi-day ranges use end_date.',
  },
  {
    id: 'site-kanban',
    title: 'Kanban',
    page: 'kanban',
    text: 'Kanban boards have columns todo, in_progress, review, and done. Cards can have a subject and due date. Ask Arrodes to add a card. Moving columns is still done on the board in Slice 1.',
  },
  {
    id: 'site-classhub',
    title: 'Class Hub',
    page: 'classhub',
    text: 'Class Hub stores teacher name, office hours, room, notes, timetable, and class links per subject. Attendance (attend or skip) lives in class_attendance. Ask Arrodes to update class info or add a Classroom link.',
  },
  {
    id: 'site-grades',
    title: 'Grades and predictor',
    page: 'grades',
    text: 'Grades records assessments by subject, quarter, and component (ww written work, pt performance task, ex exam). Ask Arrodes to add a score or read averages. The forecast page uses the same grade data.',
  },
  {
    id: 'site-pomodoro',
    title: 'Pomodoro / Focus',
    page: 'pomodoro',
    text: 'Focus starts a Pomodoro timer, optionally tied to a subject. Ask Arrodes to start a focus session. Analytics for recent focus minutes come from pomodoro_sessions.',
  },
  {
    id: 'site-baon',
    title: 'Baon Tracker',
    page: 'finance',
    text: 'Baon Tracker is the allowance and spending ledger. Log expenses with a category and peso amount. Settings hold allowance. Goals hold savings targets. Ask Arrodes to log an expense or read the balance summary.',
  },
  {
    id: 'site-habits',
    title: 'Habits',
    page: 'habits',
    text: 'Habits are daily check-offs. Ask Arrodes to mark a habit done for today or read which habits are still open.',
  },
  {
    id: 'site-flashcards',
    title: 'Flashcards',
    page: 'flashcards',
    text: 'Flashcards live in decks. Ask Arrodes to add a card with front and back. Review uses interval_days and due_date.',
  },
  {
    id: 'site-notes',
    title: 'Notes',
    page: 'notes',
    text: 'Notes and Ideas stores markdown notes in folders with tags. Ask Arrodes to add a note or search the vault. search_epicure also embeds notes into Pinecone when a key is set.',
  },
  {
    id: 'site-arrodes',
    title: 'Arrodes assistant',
    page: 'dashboard',
    text: 'Arrodes is the epicure study assistant. Type or use the mic. Writes wait for confirm. Undo reverts the last save. Globe toggle enables Tavily web search. Settings stores OpenRouter, Tavily, and Pinecone keys.',
  },
];
