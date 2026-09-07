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
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
  triggerRef: RefObject<HTMLDivElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  minWidth?: number;
}) {
  const reduce = useReducedMotion();
  const [pos, setPos] = useState({ top: 0, left: 0, width: 220 });

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const place = () => {
      const r = triggerRef.current!.getBoundingClientRect();
      const width = Math.max(r.width, minWidth ?? r.width);
      const estH = Math.min(320, window.innerHeight * 0.5);
      let top = r.bottom + 6;
      let left = r.left;
      if (top + estH > window.innerHeight - 8) top = Math.max(8, r.top - estH - 6);
      if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
      if (left < 8) left = 8;
      setPos({ top, left, width });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, triggerRef, minWidth]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={menuRef}
          className={`epic-menu fixed z-[200] ${className}`}
          style={{ top: pos.top, left: pos.left, width: minWidth ? undefined : pos.width, minWidth: minWidth ?? pos.width }}
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

function FieldButton({
  onClick,
  icon: Icon,
  children,
  className = '',
  empty,
}: {
  onClick: () => void;
  icon?: typeof CalendarDays;
  children: ReactNode;
  className?: string;
  empty?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`glass-input epic-press flex h-9 w-full items-center gap-2 rounded-xl px-3 text-left text-sm ${empty ? 'text-zinc-400' : 'text-zinc-800'} ${className}`}
    >
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-400" /> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
    </button>
  );
}

export function Select({
  value,
  onChange,
  options,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { triggerRef, menuRef } = useDismiss(open, () => setOpen(false));
  const current = options.find((o) => o.value === value)?.label ?? 'Select';
  const activeRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (open) activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open]);
  return (
    <div ref={triggerRef} className={`relative ${className}`}>
      <FieldButton onClick={() => setOpen((v) => !v)} empty={!value}>
        {current}
      </FieldButton>
      <Menu open={open} triggerRef={triggerRef} menuRef={menuRef}>
        <div className="epic-menu-scroll py-1">
          {options.map((o) => (
            <button
              key={o.value || 'empty'}
              ref={o.value === value ? activeRef : undefined}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                o.value === value ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-100'
              }`}
            >
              <span className="truncate">{o.label}</span>
              {o.value === value && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      </Menu>
    </div>
  );
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function isoFrom(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIso(value: string) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function DateField({
  value,
  onChange,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const selected = parseIso(value);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => selected ?? new Date());
  const { triggerRef, menuRef } = useDismiss(open, () => setOpen(false));
  useEffect(() => {
    if (selected) setCursor(selected);
  }, [value]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const label = selected
    ? selected.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Pick a date';
  const todayIso = isoFrom(new Date());

  return (
    <div ref={triggerRef} className={`relative ${className}`}>
      <FieldButton onClick={() => setOpen((v) => !v)} icon={CalendarDays} empty={!value}>
        {label}
      </FieldButton>
      <Menu open={open} triggerRef={triggerRef} menuRef={menuRef} minWidth={280} className="w-[17.5rem] p-3">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" className="epic-press rounded-lg p-1 hover:bg-zinc-100" onClick={() => setCursor(new Date(year, month - 1, 1))}>
            <ChevronLeft className="h-4 w-4 text-zinc-500" />
          </button>
          <p className="text-sm font-medium text-zinc-800">
            {cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </p>
          <button type="button" className="epic-press rounded-lg p-1 hover:bg-zinc-100" onClick={() => setCursor(new Date(year, month + 1, 1))}>
            <ChevronRight className="h-4 w-4 text-zinc-500" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-1 text-center text-[10px] font-medium text-zinc-400">{d}</div>
          ))}
          {Array.from({ length: first }).map((_, i) => <div key={`e-${i}`} />)}
          {Array.from({ length: days }).map((_, i) => {
            const day = i + 1;
            const iso = isoFrom(new Date(year, month, day));
            const active = iso === value;
            const isToday = iso === todayIso;
            return (
              <button
                key={iso}
                type="button"
                onClick={() => {
                  onChange(iso);
                  setOpen(false);
                }}
                className={`epic-press h-8 rounded-lg text-xs ${
                  active ? 'bg-zinc-900 text-white' : isToday ? 'bg-zinc-100 font-medium text-zinc-900' : 'text-zinc-700 hover:bg-zinc-100'
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </Menu>
    </div>
  );
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function splitTime(value: string) {
  const raw = (value || '').slice(0, 5);
  const [hs, ms] = raw.split(':').map(Number);
  const hour24 = Number.isFinite(hs) ? hs : 9;
  const minute = Number.isFinite(ms) ? Math.min(59, Math.max(0, ms)) : 0;
  const pm = hour24 >= 12;
  const hour12 = hour24 % 12 || 12;
  return { hour12, minute, pm };
}

function joinTime(hour12: number, minute: number, pm: boolean) {
  let hour24 = hour12 % 12;
  if (pm) hour24 += 12;
  return `${pad(hour24)}:${pad(minute)}`;
}

function prettyTime(value: string) {
  if (!value) return 'Pick a time';
  const { hour12, minute, pm } = splitTime(value);
  return `${hour12}:${pad(minute)} ${pm ? 'PM' : 'AM'}`;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

export function TimeField({
  value,
  onChange,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { triggerRef, menuRef } = useDismiss(open, () => setOpen(false));
  const parsed = splitTime(value);
  const hourRef = useRef<HTMLButtonElement>(null);
  const minuteRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    hourRef.current?.scrollIntoView({ block: 'center' });
    minuteRef.current?.scrollIntoView({ block: 'center' });
  }, [open, parsed.hour12, parsed.minute]);

  const commit = (next: { hour12?: number; minute?: number; pm?: boolean }, close = false) => {
    const hour12 = next.hour12 ?? parsed.hour12;
    const minute = next.minute ?? parsed.minute;
    const pm = next.pm ?? parsed.pm;
    onChange(joinTime(hour12, minute, pm));
    if (close) setOpen(false);
  };

  return (
    <div ref={triggerRef} className={`relative ${className}`}>
      <FieldButton onClick={() => setOpen((v) => !v)} icon={Clock} empty={!value}>
        {prettyTime(value)}
      </FieldButton>
      <Menu open={open} triggerRef={triggerRef} menuRef={menuRef} minWidth={220} className="w-[13.5rem] p-2">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <p className="text-sm font-medium tabular-nums text-zinc-800">{prettyTime(value || '09:00')}</p>
          <div className="flex rounded-lg bg-zinc-100 p-0.5">
            {(['AM', 'PM'] as const).map((label) => {
              const on = label === 'PM' ? parsed.pm : !parsed.pm;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => commit({ pm: label === 'PM' })}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${on ? 'bg-zinc-900 text-white' : 'text-zinc-500'}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <div>
            <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">Hour</p>
            <div className="epic-time-col rounded-lg bg-zinc-50">
              {HOURS.map((h) => (
                <button
                  key={h}
                  ref={h === parsed.hour12 ? hourRef : undefined}
                  type="button"
                  onClick={() => commit({ hour12: h })}
                  className={`flex h-8 w-full items-center justify-center text-sm tabular-nums ${
                    h === parsed.hour12 ? 'bg-zinc-900 font-medium text-white' : 'text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">Min</p>
            <div className="epic-time-col rounded-lg bg-zinc-50">
              {MINUTES.map((m) => (
                <button
                  key={m}
                  ref={m === parsed.minute ? minuteRef : undefined}
                  type="button"
                  onClick={() => commit({ minute: m }, true)}
                  className={`flex h-8 w-full items-center justify-center text-sm tabular-nums ${
                    m === parsed.minute ? 'bg-zinc-900 font-medium text-white' : 'text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  {pad(m)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Menu>
    </div>
  );
}
