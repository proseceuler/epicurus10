/** Configurable keyboard shortcuts (localStorage). */

export type ShortcutId =
  | 'search'
  | 'assistant'
  | 'inbox'
  | 'dashboard'
  | 'notes'
  | 'todos'
  | 'kanban'
  | 'calendar'
  | 'habits'
  | 'focus';

export type ShortcutBinding = {
  mod: boolean;
  shift?: boolean;
  key: string;
};

export type ShortcutMap = Record<ShortcutId, ShortcutBinding>;

const KEY = 'epicure:shortcuts:v1';

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  search: { mod: true, key: 'k' },
  assistant: { mod: true, key: 'j' },
  inbox: { mod: true, key: 'i' },
  dashboard: { mod: true, shift: true, key: 'd' },
  notes: { mod: true, shift: true, key: 'n' },
  todos: { mod: true, shift: true, key: 't' },
  kanban: { mod: true, shift: true, key: 'b' },
  calendar: { mod: true, shift: true, key: 'c' },
  habits: { mod: true, shift: true, key: 'h' },
  focus: { mod: true, shift: true, key: 'f' },
};

export const SHORTCUT_LABELS: Record<ShortcutId, string> = {
  search: 'Global search',
  assistant: 'Arrodes assistant',
  inbox: 'Open inbox',
  dashboard: 'Go to Dashboard',
  notes: 'Go to Notes & Board',
  todos: 'Go to To-Do',
  kanban: 'Go to Kanban',
  calendar: 'Go to Calendar',
  habits: 'Go to Habits',
  focus: 'Go to Focus',
};

function isBrowser() {
  return typeof window !== 'undefined';
}

export function getShortcuts(): ShortcutMap {
  if (!isBrowser()) return { ...DEFAULT_SHORTCUTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SHORTCUTS };
    const parsed = JSON.parse(raw) as Partial<ShortcutMap>;
    const out = { ...DEFAULT_SHORTCUTS };
    (Object.keys(DEFAULT_SHORTCUTS) as ShortcutId[]).forEach((id) => {
      out[id] = { ...DEFAULT_SHORTCUTS[id], ...(parsed[id] || {}) };
    });
    return out;
  } catch {
    return { ...DEFAULT_SHORTCUTS };
  }
}

export function setShortcut(id: ShortcutId, binding: ShortcutBinding) {
  if (!isBrowser()) return;
  const next = {
    ...getShortcuts(),
    [id]: { mod: binding.mod, shift: !!binding.shift, key: binding.key.toLowerCase() },
  };
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('epicure-shortcuts-changed'));
}

export function resetShortcuts() {
  if (!isBrowser()) return;
  localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent('epicure-shortcuts-changed'));
}

export function formatShortcut(b: ShortcutBinding) {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const parts: string[] = [];
  if (b.mod) parts.push(isMac ? '⌘' : 'Ctrl');
  if (b.shift) parts.push(isMac ? '⇧' : 'Shift');
  parts.push(b.key.toUpperCase());
  return isMac ? parts.join('') : parts.join('+');
}

export function matchShortcut(e: KeyboardEvent, b: ShortcutBinding) {
  if (b.mod && !(e.metaKey || e.ctrlKey)) return false;
  if (!b.mod && (e.metaKey || e.ctrlKey)) return false;
  if (!!b.shift !== e.shiftKey) return false;
  return e.key.toLowerCase() === b.key.toLowerCase();
}
