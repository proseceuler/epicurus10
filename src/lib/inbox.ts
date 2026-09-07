/** Inbox / notifications store */

export type InboxKind = 'due' | 'exam' | 'notice' | 'streak' | 'system';

export type InboxItem = {
  id: string;
  kind: InboxKind;
  title: string;
  body: string;
  href?: string; // page id hash
  created_at: string;
  read: boolean;
  priority: 'low' | 'normal' | 'high';
};

const KEY = 'epicure:inbox:v1';
export const INBOX_CHANGED = 'epicure-inbox-changed';

function isBrowser() {
  return typeof window !== 'undefined';
}

export function getInbox(): InboxItem[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as InboxItem[]) : [];
    return Array.isArray(list) ? list.sort((a, b) => b.created_at.localeCompare(a.created_at)) : [];
  } catch {
    return [];
  }
}

function persist(items: InboxItem[]) {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, JSON.stringify(items.slice(0, 200)));
  window.dispatchEvent(new CustomEvent(INBOX_CHANGED));
}

export function unreadCount(items = getInbox()) {
  return items.filter((i) => !i.read).length;
}

export function markRead(id: string) {
  const items = getInbox().map((i) => (i.id === id ? { ...i, read: true } : i));
  persist(items);
}

export function markAllRead() {
  persist(getInbox().map((i) => ({ ...i, read: true })));
}

export function pushInbox(item: Omit<InboxItem, 'id' | 'created_at' | 'read'>) {
  const items = getInbox();
  // de-dupe same title in last 24h
  const dayAgo = Date.now() - 86400000;
  if (items.some((i) => i.title === item.title && new Date(i.created_at).getTime() > dayAgo)) {
    return items;
  }
  const next: InboxItem = {
    ...item,
    id: `in_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    created_at: new Date().toISOString(),
    read: false,
  };
  persist([next, ...items]);
  return [next, ...items];
}

export function clearInbox() {
  persist([]);
}
