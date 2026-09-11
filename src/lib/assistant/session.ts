/** Session-local assistant state. Swap `getAssistantOwner()` later for a signed-in user id. */

export const OWNER_KEY = 'epicure-assistant-user';
export const SEARCH_KEY = 'epicure-assistant-web-search';
export const HISTORY_PREFIX = 'epicure-assistant-history:';

export function getAssistantOwner(): string {
  try {
    return localStorage.getItem(OWNER_KEY) || 'local';
  } catch {
    return 'local';
  }
}

export function historyKey(owner = getAssistantOwner()) {
  return `${HISTORY_PREFIX}${owner}`;
}

export function loadHistory<T>(fallback: T[]): T[] {
  try {
    const raw = localStorage.getItem(historyKey()) || sessionStorage.getItem(historyKey());
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function compact<T>(messages: T[]): T[] {
  return messages.map((m: any) => {
    if (!m || typeof m !== 'object') return m;
    const next = { ...m };
    if (Array.isArray(next.attachments)) {
      next.attachments = next.attachments.map((a: any) => ({
        ...a,
        dataUrl: typeof a?.dataUrl === 'string' ? a.dataUrl.slice(0, 48) : '',
        posterUrl: undefined,
      }));
    }
    return next;
  });
}

export function saveHistory<T>(messages: T[]) {
  // Keep the full text of the thread. Never drop user/assistant words to save space.
  let keep = messages.slice(-80);
  const write = (payload: string) => {
    localStorage.setItem(historyKey(), payload);
    try { sessionStorage.setItem(historyKey(), payload); } catch { /* ignore */ }
  };
  try {
    write(JSON.stringify(compact(keep)));
    return;
  } catch {
    /* quota — drop attachments first, then oldest turns, but keep text */
  }
  try {
    write(JSON.stringify(keep.map((m: any) => ({
      role: m?.role,
      content: String(m?.content || ''),
      pending: m?.pending,
      sources: m?.sources,
    }))));
    return;
  } catch {
    /* still too big */
  }
  while (keep.length > 8) {
    keep = keep.slice(2);
    try {
      write(JSON.stringify(keep.map((m: any) => ({ role: m?.role, content: String(m?.content || '') }))));
      return;
    } catch {
      /* keep shrinking */
    }
  }
}

export function loadSearchEnabled(): boolean {
  try { return localStorage.getItem(SEARCH_KEY) === '1'; } catch { return false; }
}

export function saveSearchEnabled(on: boolean) {
  try { localStorage.setItem(SEARCH_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}
