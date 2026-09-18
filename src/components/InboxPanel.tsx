import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCheck, ExternalLink, GripHorizontal, X } from 'lucide-react';
import { getInbox, markRead, markAllRead, unreadCount, INBOX_CHANGED, type InboxItem } from '@/lib/inbox';
import type { PageId } from '@/components/AppLayout';

export default function InboxPanel({
  open = true,
  embedded = false,
  detached = false,
  navigate,
  onDetach,
  onSnapBack,
  onClose,
}: {
  open?: boolean;
  embedded?: boolean;
  detached?: boolean;
  navigate: (p: PageId, focus?: string | null) => void;
  onDetach?: () => void;
  onSnapBack?: () => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [pos, setPos] = useState(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    return { x: isMobile ? 8 : 16, y: isMobile ? 56 : 72 };
  });
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const sync = () => setItems(getInbox());
    sync();
    window.addEventListener(INBOX_CHANGED, sync);
    return () => window.removeEventListener(INBOX_CHANGED, sync);
  }, []);

  useEffect(() => {
    if (!detached) return;
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const w = Math.min(window.innerWidth < 768 ? 220 : 300, window.innerWidth - 16);
      const x = Math.min(window.innerWidth - w - 8, Math.max(8, e.clientX - offset.current.x));
      const y = Math.min(window.innerHeight - 80, Math.max(8, e.clientY - offset.current.y));
      setPos({ x, y });
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [detached]);

  if (!open && !embedded && !detached) return null;

  const unread = unreadCount(items);

  const body = (
    <>
      <div
        className={`flex items-center justify-between border-b border-zinc-200/70 px-3 py-2 ${detached ? 'cursor-move' : ''}`}
        onPointerDown={
          detached
            ? (e) => {
                if ((e.target as HTMLElement).closest('button')) return;
                e.currentTarget.setPointerCapture?.(e.pointerId);
                dragging.current = true;
                offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
              }
            : undefined
        }
      >
        <div className="flex items-center gap-2">
          {detached && <GripHorizontal className="h-4 w-4 text-zinc-400" />}
          <Bell className="h-4 w-4 text-zinc-600" />
          <h3 className="text-sm font-semibold text-zinc-800">Inbox</h3>
          {unread > 0 && (
            <span className="rounded-full bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">{unread}</span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" title="Mark all read" onClick={() => markAllRead()} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100">
            <CheckCheck className="h-4 w-4" />
          </button>
          {!detached && onDetach && (
            <button type="button" title="Detach" onClick={onDetach} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100">
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
          {detached && onSnapBack && (
            <button type="button" title="Snap back" onClick={onSnapBack} className="rounded-lg px-2 py-1 text-[10px] text-zinc-500 hover:bg-zinc-100">
              Dock
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="max-h-[50vh] min-w-0 overflow-y-auto">
        {items.length === 0 && <p className="px-4 py-8 text-center text-xs text-zinc-400">No notifications yet</p>}
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`flex w-full flex-col gap-0.5 border-b border-zinc-100 px-3 py-2.5 text-left hover:bg-zinc-50 ${item.read ? 'opacity-55' : ''}`}
            onClick={() => {
              markRead(item.id);
              if (item.href) navigate(item.href as PageId);
              if (!detached) onClose();
            }}
          >
            <div className="flex items-center gap-2">
              {!item.read && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{item.kind}</span>
              {item.priority === 'high' && (
                <span className="rounded bg-red-100 px-1 text-[9px] font-semibold text-red-700">HIGH</span>
              )}
            </div>
            <p className="text-sm font-medium text-zinc-800">{item.title}</p>
            <p className="text-xs text-zinc-500">{item.body}</p>
          </button>
        ))}
      </div>
    </>
  );

  if (detached) {
    const node = (
      <div className="epic-glass-sheet fixed z-[100] w-[min(100vw-1.5rem,20rem)] overflow-hidden" style={{ left: pos.x, top: pos.y }}>
        {body}
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(node, document.body) : node;
  }

  if (embedded) {
    return <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white">{body}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="epic-glass-sheet relative z-10 w-full max-w-md overflow-hidden rounded-3xl">{body}</div>
    </div>
  );
}
