import { useState, useRef, useEffect } from 'react';
import { Calculator, Expand, Minimize, GripHorizontal, X } from 'lucide-react';

interface CalcProps {
  detached: boolean;
  onDetach: () => void;
  onSnapBack: () => void;
  onClose: () => void;
}

export default function ScientificCalculator({ detached, onDetach, onSnapBack, onClose }: CalcProps) {
  const [display, setDisplay] = useState('0');
  const [expression, setExpression] = useState('');
  const [scientific, setScientific] = useState(false);
  const [pos, setPos] = useState(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    return { x: Math.max(8, window.innerWidth - (isMobile ? 260 : 340)), y: isMobile ? 60 : 80 };
  });
  const dragRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      setPos({ x: e.clientX - offsetRef.current.x, y: e.clientY - offsetRef.current.y });
    };
    const onUp = () => { dragRef.current = false; };
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

  const pressKey = (key: string) => {
    if (key === 'C') {
      setDisplay('0'); setExpression(''); return;
    }
    if (key === '⌫') {
      setExpression((prev) => {
        const next = prev.slice(0, -1);
        setDisplay(next || '0');
        return next;
      });
      return;
    }
    if (key === '=') {
      try {
        const sanitized = expression
          .replace(/π/g, 'Math.PI')
          .replace(/√/g, 'Math.sqrt')
          .replace(/sin\(/g, 'Math.sin(')
          .replace(/cos\(/g, 'Math.cos(')
          .replace(/tan\(/g, 'Math.tan(')
          .replace(/ln\(/g, 'Math.log(')
          .replace(/log\(/g, 'Math.log10(')
          .replace(/e(?![0-9])/g, 'Math.E')
          .replace(/\^/g, '**')
          .replace(/%/g, '/100');
        // eslint-disable-next-line no-new-func
        const result = Function('"use strict"; return (' + sanitized + ')')();
        setDisplay(String(result));
        setExpression(String(result));
      } catch {
        setDisplay('Error');
      }
      return;
    }
    const newExpr = expression + key;
    setExpression(newExpr);
    setDisplay(newExpr);
  };

  const containerClass = detached
    ? 'fixed z-[70] w-[min(16rem,calc(100vw-1.25rem))] sm:w-[min(18rem,calc(100vw-1.5rem))] md:w-[min(22rem,calc(100vw-1.5rem))]'
    : 'w-full min-w-0';

  const style = detached ? { left: pos.x, top: pos.y, touchAction: 'none' as const } : undefined;

  const basicKeys = [
    ['C', '⌫', '%', '÷'],
    ['7', '8', '9', '×'],
    ['4', '5', '6', '−'],
    ['1', '2', '3', '+'],
    ['0', '.', '(', '='],
  ];

  const sciKeys = [
    ['sin(', 'cos(', 'tan(', 'π'],
    ['ln(', 'log(', '√(', 'e'],
    ['^', '(', ')', ','],
  ];

  const mapKey = (k: string) => {
    const map: Record<string, string> = { '÷': '/', '×': '*', '−': '-', '+': '+' };
    return map[k] ?? k;
  };

  return (
    <div className={containerClass} style={style}>
      <div className={detached ? 'epic-glass-sheet overflow-hidden rounded-3xl' : 'overflow-hidden'}>
        <div
          className={`flex items-center justify-between px-4 py-2 border-b border-white/10 ${detached ? 'cursor-move touch-none' : ''}`}
          onPointerDown={onDragStart}
        >
          <div className="flex items-center gap-2">
            {detached && <GripHorizontal className="w-3.5 h-3.5 text-zinc-400" />}
            <Calculator className="w-4 h-4 text-zinc-600" />
            <span className="text-xs font-medium text-zinc-700">Calculator</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setScientific((v) => !v)}
              className="w-6 h-6 rounded-lg hover:bg-zinc-200/50 flex items-center justify-center"
              title={scientific ? 'Basic' : 'Scientific'}
            >
              {scientific ? <Minimize className="w-3.5 h-3.5 text-zinc-500" /> : <Expand className="w-3.5 h-3.5 text-zinc-500" />}
            </button>
            {detached ? (
              <button onClick={onSnapBack} className="w-6 h-6 rounded-lg hover:bg-zinc-200/50 flex items-center justify-center" title="Snap to dock">
                <Expand className="w-3.5 h-3.5 text-zinc-500 rotate-90" />
              </button>
            ) : (
              <button onClick={onDetach} className="w-6 h-6 rounded-lg hover:bg-zinc-200/50 flex items-center justify-center" title="Detach">
                <Expand className="w-3.5 h-3.5 text-zinc-500" />
              </button>
            )}
            <button onClick={onClose} className="w-6 h-6 rounded-lg hover:bg-zinc-200/50 flex items-center justify-center">
              <X className="w-3.5 h-3.5 text-zinc-500" />
            </button>
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="text-right text-[10px] text-zinc-400 h-4 truncate">{expression || '\u00A0'}</div>
          <div className="text-right text-2xl font-semibold text-zinc-800 tabular-nums tracking-tight">{display}</div>
        </div>
        {scientific && (
          <div className="grid grid-cols-4 gap-1.5 px-3 pb-2">
            {sciKeys.flat().map((k) => (
              <Key key={k} label={k} onPress={() => pressKey(k)} variant="sci" />
            ))}
          </div>
        )}
        <div className="grid grid-cols-4 gap-1.5 p-3 pt-0">
          {basicKeys.flat().map((k) => (
            <Key key={k} label={k} onPress={() => pressKey(mapKey(k))} variant={['÷','×','−','+','='].includes(k) ? 'op' : k === 'C' || k === '⌫' ? 'func' : 'num'} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Key({ label, onPress, variant }: { label: string; onPress: () => void; variant: 'num' | 'op' | 'func' | 'sci' }) {
  const styles = {
    num: 'bg-white/80 text-zinc-800 hover:bg-white',
    op: 'bg-zinc-800 text-white hover:bg-zinc-700',
    func: 'bg-zinc-200/80 text-zinc-700 hover:bg-zinc-300/80',
    sci: 'bg-zinc-100/80 text-zinc-600 hover:bg-zinc-200/80 text-[11px]',
  };
  return (
    <button
      type="button"
      onClick={onPress}
      className={`h-12 rounded-2xl text-sm font-medium transition-all ${styles[variant]}`}
    >
      {label}
    </button>
  );
}
