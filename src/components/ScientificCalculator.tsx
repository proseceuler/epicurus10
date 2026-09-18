import { useState, useRef, useEffect } from 'react';
import { Calculator, Expand, Minimize, GripHorizontal, X } from 'lucide-react';

interface CalcProps {
  detached: boolean;
  onDetach: () => void;
  onSnapBack: () => void;
  onClose: () => void;
}

const BTN =
  'h-10 rounded-xl text-sm font-medium transition-all active:scale-95 select-none touch-manipulation';

export default function ScientificCalculator({ detached, onDetach, onSnapBack, onClose }: CalcProps) {
  const [display, setDisplay] = useState('0');
  const [prev, setPrev] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [scientific, setScientific] = useState(false);
  const [pos, setPos] = useState(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    return { x: isMobile ? 12 : 40, y: isMobile ? 80 : 100 };
  });
  const dragRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      setPos({ x: e.clientX - offsetRef.current.x, y: e.clientY - offsetRef.current.y });
    };
    const onUp = () => {
      dragRef.current = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  const onDragStart = (e: React.PointerEvent) => {
    if (!detached) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = true;
    offsetRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };

  const input = (n: string) => {
    if (waiting) {
      setDisplay(n);
      setWaiting(false);
    } else {
      setDisplay(display === '0' ? n : display + n);
    }
  };

  const clear = () => {
    setDisplay('0');
    setPrev(null);
    setOp(null);
    setWaiting(false);
  };

  const doOp = (nextOp: string) => {
    const cur = parseFloat(display);
    if (prev !== null && op && !waiting) {
      const result = compute(prev, cur, op);
      setDisplay(String(result));
      setPrev(result);
    } else {
      setPrev(cur);
    }
    setOp(nextOp);
    setWaiting(true);
  };

  const equals = () => {
    if (prev === null || !op) return;
    const result = compute(prev, parseFloat(display), op);
    setDisplay(String(result));
    setPrev(null);
    setOp(null);
    setWaiting(true);
  };

  const compute = (a: number, b: number, operation: string): number => {
    switch (operation) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? 0 : a / b;
      case '^': return Math.pow(a, b);
      default: return b;
    }
  };

  const unary = (fn: (n: number) => number) => {
    setDisplay(String(fn(parseFloat(display))));
    setWaiting(true);
  };

  const containerClass = detached
    ? 'fixed z-[70] w-[min(13.5rem,calc(100vw-1.5rem))] sm:w-[min(15rem,calc(100vw-1.5rem))] md:w-[min(18rem,calc(100vw-1.5rem))]'
    : 'w-full';
  const style = detached ? { left: pos.x, top: pos.y, touchAction: 'none' as const } : undefined;

  return (
    <div className={containerClass} style={style}>
      <div className="epic-glass-sheet overflow-hidden rounded-3xl">
        <div
          className={`flex items-center justify-between px-3 py-2 border-b border-white/10 ${detached ? 'cursor-move touch-none' : ''}`}
          onPointerDown={onDragStart}
        >
          <div className="flex items-center gap-2">
            {detached && <GripHorizontal className="w-3.5 h-3.5 text-zinc-400" />}
            <Calculator className="w-4 h-4 text-zinc-600" />
            <span className="text-xs font-medium text-zinc-700">Calculator</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setScientific((s) => !s)} className="w-6 h-6 rounded-lg hover:bg-zinc-200/50 flex items-center justify-center" title="Toggle scientific">
              {scientific ? <Minimize className="w-3.5 h-3.5 text-zinc-500" /> : <Expand className="w-3.5 h-3.5 text-zinc-500" />}
            </button>
            {detached ? (
              <button onClick={onSnapBack} className="w-6 h-6 rounded-lg hover:bg-zinc-200/50 flex items-center justify-center text-xs text-zinc-500" title="Snap to dock">↓</button>
            ) : (
              <button onClick={onDetach} className="w-6 h-6 rounded-lg hover:bg-zinc-200/50 flex items-center justify-center text-xs text-zinc-500" title="Detach">↑</button>
            )}
            <button onClick={onClose} className="w-6 h-6 rounded-lg hover:bg-zinc-200/50 flex items-center justify-center">
              <X className="w-3.5 h-3.5 text-zinc-500" />
            </button>
          </div>
        </div>

        <div className="px-3 pt-3 pb-1">
          <div className="text-right text-2xl font-light tabular-nums text-zinc-900 tracking-tight min-h-[2rem] overflow-x-auto whitespace-nowrap">
            {display}
          </div>
        </div>

        <div className="p-2 grid grid-cols-4 gap-1.5">
          <Btn label="AC" onClick={clear} variant="muted" />
          <Btn label="±" onClick={() => unary((n) => -n)} variant="muted" />
          <Btn label="%" onClick={() => unary((n) => n / 100)} variant="muted" />
          <Btn label="÷" onClick={() => doOp('÷')} variant="accent" />

          <Btn label="7" onClick={() => input('7')} />
          <Btn label="8" onClick={() => input('8')} />
          <Btn label="9" onClick={() => input('9')} />
          <Btn label="×" onClick={() => doOp('×')} variant="accent" />

          <Btn label="4" onClick={() => input('4')} />
          <Btn label="5" onClick={() => input('5')} />
          <Btn label="6" onClick={() => input('6')} />
          <Btn label="−" onClick={() => doOp('-')} variant="accent" />

          <Btn label="1" onClick={() => input('1')} />
          <Btn label="2" onClick={() => input('2')} />
          <Btn label="3" onClick={() => input('3')} />
          <Btn label="+" onClick={() => doOp('+')} variant="accent" />

          <Btn label="0" onClick={() => input('0')} className="col-span-2" />
          <Btn label="." onClick={() => { if (!display.includes('.')) input('.'); }} />
          <Btn label="=" onClick={equals} variant="accent" />

          {scientific && (
            <>
              <Btn label="sin" onClick={() => unary((n) => Math.sin((n * Math.PI) / 180))} variant="muted" />
              <Btn label="cos" onClick={() => unary((n) => Math.cos((n * Math.PI) / 180))} variant="muted" />
              <Btn label="tan" onClick={() => unary((n) => Math.tan((n * Math.PI) / 180))} variant="muted" />
              <Btn label="√" onClick={() => unary(Math.sqrt)} variant="muted" />
              <Btn label="ln" onClick={() => unary(Math.log)} variant="muted" />
              <Btn label="log" onClick={() => unary(Math.log10)} variant="muted" />
              <Btn label="x²" onClick={() => unary((n) => n * n)} variant="muted" />
              <Btn label="^" onClick={() => doOp('^')} variant="muted" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Btn({
  label,
  onClick,
  variant = 'default',
  className = '',
}: {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'accent' | 'muted';
  className?: string;
}) {
  const styles = {
    default: 'bg-white/60 text-zinc-800 hover:bg-white/80',
    accent: 'bg-zinc-900 text-white hover:bg-zinc-800',
    muted: 'bg-zinc-200/50 text-zinc-600 hover:bg-zinc-200/80',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${BTN} ${styles[variant]} ${className}`}
    >
      {label}
    </button>
  );
}
