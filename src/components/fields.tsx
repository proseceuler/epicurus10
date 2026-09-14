import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { motionTransition } from '@/lib/motion';

function useDismiss(open: boolean, onClose: () => void) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  return { triggerRef, menuRef };
}

function Menu({
  open,
  children,
  className = '',
  triggerRef,
  menuRef,
  minWidth,
  maxWidth = 360,
  width: fixedWidth,
  estHeight = 240,
  prefer = 'auto',
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
  triggerRef: RefObject<HTMLDivElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  minWidth?: number;
  maxWidth?: number;
  width?: number;
  estHeight?: number;
  prefer?: 'auto' | 'up' | 'down';
}) {
  const reduce = useReducedMotion();
  const [pos, setPos] = useState({ top: 0, left: 0, width: 220 });

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const place = () => {
      const r = triggerRef.current!.getBoundingClientRect();
      const width = fixedWidth ?? Math.min(Math.max(r.width, minWidth ?? 200), maxWidth);
      const measured = menuRef.current?.offsetHeight;
      const h = Math.max(80, measured || estHeight);
      const spaceBelow = window.innerHeight - r.bottom - 10;
      const spaceAbove = r.top - 10;
      let top = r.bottom + 6;
      if (prefer === 'up' || (prefer === 'auto' && spaceBelow < h && spaceAbove > spaceBelow)) {
        top = Math.max(8, r.top - h - 6);
      }
      if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
      let left = r.left;
      if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
      if (left < 8) left = 8;
      setPos({ top, left, width });
    };
    place();
    const id = window.requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, triggerRef, menuRef, minWidth, maxWidth, fixedWidth, estHeight, prefer]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={menuRef}
          className={`epic-menu fixed z-[200] ${className}`}
          style={{ top: pos.top, left: pos.left, width: pos.width }}
          initial={reduce ? false : { opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 1 } : { opacity: 0, y: -4, scale: 0.98 }}
          transition={motionTransition(reduce, 0.16)}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
