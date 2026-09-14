import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { motionTransition, overlayPresence, overlayTransition, pageMotion, sheetMotion } from '@/lib/motion';

export function OverlayScrim({
  onClose,
  className = 'absolute inset-0',
  shown = true,
}: {
  onClose?: () => void;
  className?: string;
  shown?: boolean;
}) {
  const reduce = useReducedMotion();
  const visible = shown ? { opacity: 1 } : { opacity: 0 };
  return (
    <>
      <motion.div
        aria-hidden
        className={`epic-scrim-blur pointer-events-none ${className}`}
        initial={reduce ? false : { opacity: 0 }}
        animate={visible}
        exit={reduce ? { opacity: 1 } : { opacity: 0 }}
        transition={overlayTransition(reduce, 'blur')}
      />
      <motion.div
        className={`bg-zinc-900/28 ${className}`}
        initial={reduce ? false : { opacity: 0 }}
        animate={visible}
        exit={reduce ? { opacity: 1 } : { opacity: 0 }}
        transition={overlayTransition(reduce, 'dim')}
        onClick={onClose}
      />
    </>
  );
}

export function MotionOverlay({
  open,
  onClose,
  children,
  zClass = 'z-50',
  panelClassName = 'epic-glass-sheet max-h-[88vh] w-full max-w-md overflow-visible p-5',
}: {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  zClass?: string;
  panelClassName?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="overlay"
          className={`fixed inset-0 ${zClass} flex items-center justify-center p-4`}
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
            transition={motionTransition(reduce, 0.22)}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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
