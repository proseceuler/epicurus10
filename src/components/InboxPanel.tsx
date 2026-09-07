import { useEffect, useRef, useState } from 'react';
import {
  getInbox,
  markAllRead,
  markRead,
  unreadCount,
  type InboxItem,
  INBOX_CHANGED,
} from '@/lib/inbox';
import type { PageId } from '@/components/AppLayout';
import { Bell, CheckCheck, X, GripHorizontal, ExternalLink } from 'lucide-react';

export default function InboxPanel({
  open = true,
  onClose,
  navigate,
  detached = false,
  onDetach,
  onSnapBack,
  embedded = false,
}: {
  open?: boolean;
  onClose: () => void;
  navigate: (p: PageId) => void;
  detached?: boolean;
  onDetach?: () => void;
  onSnapBack?: () => void;
  /** Render without fullscreen overlay (inside dock) */
  embedded?: boolean;
}) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [pos, setPos] = useState({ x: 80, y: 80 });
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
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y });
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [detached]);

  if (!open && !embedded && !detached) return null;

  const unread = unreadCount(items);

  const body = (
    <>
      <div
        className={`flex items-center justify-between border-b border-zinc-200/70 px-3 py-2 ${detached ? 'cursor-move' : ''}`}
        onMouseDown={
          detached
            ? (e) => {
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
      <div className="max-h-[50vh] overflow-y-auto" style={{ minWidth: embedded ? 320 : undefined }}>
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
    return (
      <div className="fixed z-[70] w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl" style={{ left: pos.x, top: pos.y }}>
        {body}
      </div>
    );
  }

  if (embedded) {
    return <div className="overflow-hidden rounded-xl bg-white/90">{body}</div>;
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center sm:items-center sm:justify-end sm:pr-6 sm:pt-16" onClick={onClose}>
      <div className="glass mb-24 max-h-[70vh] w-full max-w-md overflow-hidden rounded-2xl shadow-2xl sm:mb-0" onClick={(e) => e.stopPropagation()}>
        {body}
      </div>
    </div>
  );
}
