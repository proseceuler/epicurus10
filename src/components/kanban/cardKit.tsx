import { useEffect, useRef, useState } from 'react';
import type { KanbanAttachment } from '@/lib/types';
import { uniqueAttachments } from '@/lib/kanban';
import { loadMedia } from '@/lib/mediaStore';
import { MotionPopover } from '@/components/MotionUI';
import { X, Tag } from 'lucide-react';

export const RECENT_KEY = 'epicure:recent-links';

export function readRecent(): KanbanAttachment[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as KanbanAttachment[]) : [];
    return uniqueAttachments(parsed).slice(0, 8);
  } catch {
    return [];
  }
}

export function rememberLink(file: KanbanAttachment) {
  if (typeof window === 'undefined' || !file.url) return;
  const next = uniqueAttachments([file, ...readRecent()]).slice(0, 8);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function useResolvedUrl(url: string | null) {
  const [src, setSrc] = useState<string | null>(url && !url.startsWith('media:') ? url : null);
  useEffect(() => {
    let live = true;
    if (!url) { setSrc(null); return; }
    if (!url.startsWith('media:')) { setSrc(url); return; }
    loadMedia(url).then((v) => { if (live) setSrc(v); });
    return () => { live = false; };
  }, [url]);
  return src;
}

export function CoverFrame({ url, name, className, imgClass, onClick }: { url: string; name?: string; className?: string; imgClass?: string; onClick?: (e: React.MouseEvent) => void }) {
  const src = useResolvedUrl(url);
  if (!src) return null;
  return (
    <button type="button" onClick={onClick} className={`block w-full overflow-hidden bg-transparent p-0 ${className || ''}`}>
      <img src={src} alt={name || ''} className={imgClass || 'block h-auto w-full object-contain'} />
    </button>
  );
}

export function ActionChip({ icon: Icon, label, active, onClick }: { icon: typeof Tag; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium epic-press ${active ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200/80'}`}>
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
      {label}
    </button>
  );
}

export function MiniSheet({ title, open, onClose, children, align = 'left' }: {
  title: string; open: boolean; onClose: () => void; children: React.ReactNode; align?: 'left' | 'right';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);
  return (
    <MotionPopover open={open} className={`absolute top-[calc(100%+6px)] z-30 w-[min(92vw,20.5rem)] p-0 ${align === 'right' ? 'right-0' : 'left-0'}`}>
      <div ref={ref} className="relative overflow-hidden rounded-[1.15rem] bg-white shadow-[0_16px_40px_rgba(24,24,27,0.16)]">
        <div className="relative flex items-center justify-center border-b border-zinc-100 px-10 py-2.5">
          <h4 className="text-[13px] font-semibold text-zinc-700">{title}</h4>
          <button type="button" onClick={onClose} className="absolute right-2.5 top-2 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-3">{children}</div>
      </div>
    </MotionPopover>
  );
}
