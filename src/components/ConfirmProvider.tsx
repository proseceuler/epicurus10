import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { registerConfirmImpl, type ConfirmOptions } from '@/lib/confirm';
import { motionTransition, overlayPresence, sheetMotion } from '@/lib/motion';
import { OverlayScrim } from '@/components/MotionUI';

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);
  const reduceMotion = useReducedMotion();

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
      <AnimatePresence>
        {pending && (
          <motion.div
            key="confirm-overlay"
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            onClick={() => close(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 1 }}
            transition={overlayPresence(reduceMotion)}
          >
            <OverlayScrim onClose={() => close(false)} />
            <motion.div
              className="relative epic-glass-sheet w-full max-w-sm p-5"
              onClick={(e) => e.stopPropagation()}
              initial={reduceMotion ? false : sheetMotion.initial}
              animate={sheetMotion.animate}
              exit={sheetMotion.exit}
              transition={motionTransition(reduceMotion, 0.2)}
            >
              <h3 id="confirm-title" className="text-base font-semibold text-zinc-900">
                {pending.title || 'Are you sure?'}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">{pending.message}</p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="epic-press rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
                >
                  {pending.cancelLabel || 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => close(true)}
                  className={`epic-press rounded-lg px-3 py-1.5 text-sm font-medium ${
                    pending.danger !== false
                      ? 'bg-zinc-800 text-white hover:bg-zinc-900'
                      : 'bg-zinc-900 text-white hover:bg-zinc-800'
                  }`}
                >
                  {pending.confirmLabel || 'Confirm'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
