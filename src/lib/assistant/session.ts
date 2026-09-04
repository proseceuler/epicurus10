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
    const raw = sessionStorage.getItem(historyKey()) || localStorage.getItem(historyKey());
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function saveHistory<T>(messages: T[]) {
  const payload = JSON.stringify(messages.slice(-50));
  try { sessionStorage.setItem(historyKey(), payload); } catch { /* ignore */ }
  try { localStorage.setItem(historyKey(), payload); } catch { /* ignore */ }
}

export function loadSearchEnabled(): boolean {
  try { return localStorage.getItem(SEARCH_KEY) === '1'; } catch { return false; }
}

export function saveSearchEnabled(on: boolean) {
  try { localStorage.setItem(SEARCH_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}
