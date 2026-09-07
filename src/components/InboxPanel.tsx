import { useEffect, useState } from 'react';
import {
  getInbox,
  markAllRead,
  markRead,
  unreadCount,
  type InboxItem,
  INBOX_CHANGED,
} from '@/lib/inbox';
import type { PageId } from '@/components/AppLayout';
import { Bell, CheckCheck, X } from 'lucide-react';

export default function InboxPanel({
  open,
  onClose,
  navigate,
}: {
  open: boolean;
  onClose: () => void;
  navigate: (p: PageId) => void;
}) {
  const [items, setItems] = useState<InboxItem[]>([]);

  useEffect(() => {
    const sync = () => setItems(getInbox());
    sync();
    window.addEventListener(INBOX_CHANGED, sync);
    return () => window.removeEventListener(INBOX_CHANGED, sync);
  }, []);

  if (!open) return null;

  const unread = unreadCount(items);

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center sm:items-center sm:justify-end sm:pr-6 sm:pt-16" onClick={onClose}>
      <div
        className="glass mb-24 max-h-[70vh] w-full max-w-md overflow-hidden rounded-2xl shadow-2xl sm:mb-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200/70 px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-zinc-600" />
            <h3 className="text-sm font-semibold text-zinc-800">Inbox</h3>
            {unread > 0 && (
              <span className="rounded-full bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">{unread}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Mark all read"
              onClick={() => markAllRead()}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100"
            >
              <CheckCheck className="h-4 w-4" />
            </button>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {items.length === 0 && (
            <p className="px-4 py-10 text-center text-xs text-zinc-400">No notifications yet</p>
          )}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`flex w-full flex-col gap-0.5 border-b border-zinc-100 px-4 py-3 text-left hover:bg-zinc-50 ${
                item.read ? 'opacity-60' : ''
              }`}
              onClick={() => {
                markRead(item.id);
                if (item.href) navigate(item.href as PageId);
                onClose();
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
      </div>
    </div>
  );
}
