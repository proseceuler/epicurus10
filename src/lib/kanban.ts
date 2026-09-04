import type { KanbanAttachment, KanbanTask } from '@/lib/types';

export const COLUMNS = [
  { id: 'todo', label: 'To Do', tint: 'bg-zinc-400' },
  { id: 'in_progress', label: 'In Progress', tint: 'bg-sky-500' },
  { id: 'review', label: 'Review', tint: 'bg-amber-500' },
  { id: 'done', label: 'Done', tint: 'bg-emerald-500' },
] as const;

export type KanbanStatus = (typeof COLUMNS)[number]['id'];

export function kanbanUid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function dueTone(due: string | null): string {
  if (!due) return 'bg-zinc-100 text-zinc-500';
  const d = new Date(due + (due.length === 10 ? 'T00:00:00' : ''));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = (d.getTime() - today.getTime()) / 86400000;
  if (diff < 0) return 'bg-rose-100 text-rose-700';
  if (diff <= 2) return 'bg-amber-100 text-amber-800';
  return 'bg-emerald-50 text-emerald-700';
}

export function formatDue(due: string) {
  return new Date(due + (due.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function isImageUrl(url: string) {
  return /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i.test(url)
    || /(?:unsplash|imgur|giphy|pinterest|wikimedia|googleusercontent|fbcdn|twimg)\./i.test(url);
}

export function uniqueById<T extends { id: string }>(list: T[] | undefined): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of list ?? []) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function uniqueAttachments(list: KanbanAttachment[] | undefined): KanbanAttachment[] {
  const seen = new Set<string>();
  const out: KanbanAttachment[] = [];
  for (const item of uniqueById(list)) {
    const key = item.url.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...item, url: key, name: item.name || key });
  }
  return out;
}

/** Explicit cover only — do not auto-pick the first image (that caused stale/duplicate covers). */
export function resolveCover(task: Pick<KanbanTask, 'cover_url' | 'attachments'>): string | null {
  const url = (task.cover_url || '').trim();
  if (!url) return null;
  const attachments = uniqueAttachments(task.attachments);
  if (attachments.some((a) => a.url === url)) return url;
  return isImageUrl(url) ? url : null;
}

export function normalizeTask(raw: KanbanTask): KanbanTask {
  const attachments = uniqueAttachments(raw.attachments);
  return {
    ...raw,
    title: raw.title || '',
    description: raw.description ?? '',
    attachments,
    checklist: uniqueById(raw.checklist),
    comments: uniqueById(raw.comments),
    cover_url: resolveCover({ ...raw, attachments }),
  };
}
