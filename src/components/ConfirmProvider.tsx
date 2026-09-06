import { useEffect, useRef, useState, type ReactNode } from 'react';
import { registerConfirmImpl, type ConfirmOptions } from '@/lib/confirm';

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    registerConfirmImpl((opts) => new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setPending({ ...opts, resolve });
    }));
    return () => registerConfirmImpl(null);
  }, []);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    resolveRef.current = null;
    setPending(null);
  };

  return (
    <>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-950/50 p-4"
          onClick={() => close(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-title" className="text-base font-semibold text-zinc-900">
              {pending.title || 'Are you sure?'}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">{pending.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
              >
                {pending.cancelLabel || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  pending.danger !== false
                    ? 'bg-rose-600 text-white hover:bg-rose-700'
                    : 'bg-zinc-900 text-white hover:bg-zinc-800'
                }`}
              >
                {pending.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
