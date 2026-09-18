export const DATA_CHANGED = 'epicure-data-changed';

export function notifyDataChanged(page?: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(DATA_CHANGED, { detail: { page } }));
}

export function onDataChanged(fn: (page?: string) => void) {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    const page = (event as CustomEvent<{ page?: string }>).detail?.page;
    fn(page);
  };
  window.addEventListener(DATA_CHANGED, handler);
  return () => window.removeEventListener(DATA_CHANGED, handler);
}
