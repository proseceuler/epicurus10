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
  const hidden = { opacity: 0, ['--epic-blur' as string]: '0px' };
  const visible = { opacity: 1, ['--epic-blur' as string]: '22px' };
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
  zClass = 'z-50',
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

export function MotionSwap({
  id,
  children,
  className = '',
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={id}
        className={className}
        initial={reduce ? false : pageMotion.initial}
        animate={pageMotion.animate}
        exit={reduce ? pageMotion.animate : pageMotion.exit}
        transition={motionTransition(reduce, 0.18)}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function MotionCollapse({
  open,
  children,
  className = '',
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          className={`overflow-hidden ${className}`}
          initial={reduce ? false : { height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={reduce ? { opacity: 1 } : { height: 0, opacity: 0 }}
          transition={motionTransition(reduce, 0.22)}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function MotionPopover({
  open,
  children,
  className = '',
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`epic-popover ${className}`}
          initial={reduce ? false : { opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 1 } : { opacity: 0, y: -4, scale: 0.98 }}
          transition={motionTransition(reduce, 0.16)}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
