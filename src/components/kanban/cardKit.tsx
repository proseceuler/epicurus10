import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { KanbanAttachment } from '@/lib/types';
import { uniqueAttachments } from '@/lib/kanban';
import { loadMedia } from '@/lib/mediaStore';
import { motionTransition } from '@/lib/motion';
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
  const anchorRef = useRef<HTMLSpanElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [pos, setPos] = useState({ top: 12, left: 12, width: 328 });

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const host = (anchorRef.current?.closest('.relative') as HTMLElement | null) ?? anchorRef.current;
      if (!host) return;
      const r = host.getBoundingClientRect();
      const width = Math.min(window.innerWidth * 0.92, 328);
      const estH = Math.min(360, window.innerHeight * 0.48);
      const spaceBelow = window.innerHeight - r.bottom - 12;
      const openDown = spaceBelow >= Math.min(estH, 160) || spaceBelow >= r.top;
      const top = openDown ? r.bottom + 8 : Math.max(10, r.top - estH - 8);
      let left = align === 'right' ? r.right - width : r.left;
      if (left + width > window.innerWidth - 10) left = window.innerWidth - width - 10;
      if (left < 10) left = 10;
      setPos({ top, left, width });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchorRef.current?.closest('.relative')?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <>
      <span ref={anchorRef} className="pointer-events-none absolute inset-0" aria-hidden />
      {typeof document === 'undefined' ? null : createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={ref}
              className="epic-popover fixed z-[90] overflow-hidden p-0"
              style={{ top: pos.top, left: pos.left, width: pos.width }}
              initial={reduce ? false : { opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 1 } : { opacity: 0, y: -4, scale: 0.98 }}
              transition={motionTransition(reduce, 0.16)}
            >
              <div className="max-h-[min(22rem,calc(100vh-5rem))] overflow-y-auto">
                <div className="relative flex items-center justify-center border-b border-zinc-200/40 px-10 py-2.5">
                  <h4 className="text-[13px] font-semibold text-zinc-700">{title}</h4>
                  <button type="button" onClick={onClose} className="absolute right-2.5 top-2 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X className="h-4 w-4" /></button>
                </div>
                <div className="p-3">{children}</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.querySelector('.rice-shell') || document.body,
      )}
    </>
  );
}
