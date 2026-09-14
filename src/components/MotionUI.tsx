import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { motionTransition, overlayPresence, overlayTransition, pageMotion, sheetMotion } from '@/lib/motion';

/** Lift overlays out of .rice-shell so backdrop-filter can blur the page. */
export function BodyPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

export function OverlayScrim({
  onClose,
  className = 'absolute -inset-[120px]',
  shown = true,
}: {
  onClose?: () => void;
  className?: string;
  shown?: boolean;
}) {
  const reduce = useReducedMotion();
  const hidden = { opacity: 0 };
  const visible = { opacity: 1 };
  return (
    <motion.div
      aria-hidden
      className={`epic-scrim ${className}`}
      initial={reduce ? false : hidden}
      animate={shown ? visible : hidden}
      exit={reduce ? visible : hidden}
      transition={overlayTransition(reduce)}
      onClick={onClose}
    />
  );
}

export function MotionOverlay({
  open,
  onClose,
  children,
  zClass = 'z-[80]',
  frameClassName = 'items-center justify-center p-4',
  panelClassName = 'epic-glass-sheet max-h-[88vh] w-full max-w-md overflow-visible p-5',
}: {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  zClass?: string;
  frameClassName?: string;
  panelClassName?: string;
}) {
  const reduce = useReducedMotion();
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="overlay"
          className={`fixed inset-0 ${zClass} flex ${frameClassName}`}
          initial={false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 1 }}
          transition={overlayPresence(reduce)}
        >
          <OverlayScrim onClose={onClose} />
          <motion.div
            className={`relative ${panelClassName}`}
            initial={reduce ? false : sheetMotion.initial}
            animate={sheetMotion.animate}
            exit={sheetMotion.exit}
            transition={motionTransition(reduce, 0.34)}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
