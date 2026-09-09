export const KINDS = [
  { value: 'event', label: 'Event' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'exam', label: 'Exam' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'holiday', label: 'Holiday / No class' },
];

export const KIND_STYLE: Record<string, string> = {
  event: 'bg-zinc-800 text-white',
  deadline: 'bg-zinc-700 text-white',
  exam: 'bg-zinc-900 text-white',
  reminder: 'bg-zinc-600 text-white',
  holiday: 'bg-zinc-500 text-white',
};

export const SOURCE_STYLE = {
  event: 'bg-zinc-800 text-white',
  todo: 'border border-zinc-300 bg-zinc-100 text-zinc-800',
  kanban: 'border border-zinc-300 bg-zinc-50 text-zinc-700',
  note: 'border border-zinc-300 bg-zinc-100 text-zinc-700',
  habit: 'border border-zinc-300 bg-zinc-50 text-zinc-700',
};
