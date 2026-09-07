/** Configurable keyboard shortcuts (localStorage). */

export type ShortcutId = 'search' | 'assistant' | 'inbox';

export type ShortcutBinding = {
  /** Ctrl / Meta */
  mod: boolean;
  /** Single key, lowercased letter or named key */
  key: string;
};

export type ShortcutMap = Record<ShortcutId, ShortcutBinding>;

const KEY = 'epicure:shortcuts:v1';

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  search: { mod: true, key: 'k' },
  assistant: { mod: true, key: 'j' },
  inbox: { mod: true, key: 'i' },
};

export const SHORTCUT_LABELS: Record<ShortcutId, string> = {
  search: 'Global search',
  assistant: 'Arrodes assistant',
  inbox: 'Open inbox',
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
    return {
      search: { ...DEFAULT_SHORTCUTS.search, ...(parsed.search || {}) },
      assistant: { ...DEFAULT_SHORTCUTS.assistant, ...(parsed.assistant || {}) },
      inbox: { ...DEFAULT_SHORTCUTS.inbox, ...(parsed.inbox || {}) },
    };
  } catch {
    return { ...DEFAULT_SHORTCUTS };
  }
}

export function setShortcut(id: ShortcutId, binding: ShortcutBinding) {
  if (!isBrowser()) return;
  const next = { ...getShortcuts(), [id]: { mod: binding.mod, key: binding.key.toLowerCase() } };
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('epicure-shortcuts-changed'));
}

export function resetShortcuts() {
  if (!isBrowser()) return;
  localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent('epicure-shortcuts-changed'));
}

export function formatShortcut(b: ShortcutBinding) {
  const mod = b.mod ? (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+') : '';
  return `${mod}${b.key.toUpperCase()}`;
}

/** Returns true if the keyboard event matches the binding. */
export function matchShortcut(e: KeyboardEvent, b: ShortcutBinding) {
  if (b.mod && !(e.metaKey || e.ctrlKey)) return false;
  if (!b.mod && (e.metaKey || e.ctrlKey || e.altKey)) return false;
  return e.key.toLowerCase() === b.key.toLowerCase();
}
