import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Check, Eraser, Undo2, Trash2, Pen, Palette } from 'lucide-react';

interface Stroke {
  color: string;
  width: number;
  points: { x: number; y: number }[];
}

export default function Whiteboard() {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [color, setColor] = useState('#18181b');
  const [brushWidth, setBrushWidth] = useState(3);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const recordId = useRef<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const isDrawing = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('whiteboard').select('*').maybeSingle();
    if (data) {
      recordId.current = data.id;
      try {
        const parsed = JSON.parse(data.content || '[]');
        if (Array.isArray(parsed)) setStrokes(parsed);
      } catch { /* empty board */ }
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = useCallback((toSave: Stroke[]) => {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const content = JSON.stringify(toSave);
      if (recordId.current) {
        await supabase.from('whiteboard').update({ content, updated_at: new Date().toISOString() }).eq('id', recordId.current);
      } else {
        const { data } = await supabase.from('whiteboard').insert({ content }).select().single();
        if (data) recordId.current = data.id;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 800);
  }, []);

  const getPoint = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    isDrawing.current = true;
    svgRef.current?.setPointerCapture(e.pointerId);
    const pt = getPoint(e);
    setCurrentStroke({
      color: tool === 'eraser' ? '#ffffff' : color,
      width: tool === 'eraser' ? 20 : brushWidth,
      points: [pt],
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDrawing.current || !currentStroke) return;
    const pt = getPoint(e);
    setCurrentStroke({ ...currentStroke, points: [...currentStroke.points, pt] });
  };

  const onPointerUp = () => {
    if (!isDrawing.current || !currentStroke) return;
    isDrawing.current = false;
    const newStrokes = [...strokes, currentStroke];
    setStrokes(newStrokes);
    setCurrentStroke(null);
    save(newStrokes);
  };

  const undo = () => {
    const newStrokes = strokes.slice(0, -1);
    setStrokes(newStrokes);
    save(newStrokes);
  };

  const clearAll = () => {
    setStrokes([]);
    save([]);
  };

  const strokeToPath = (stroke: Stroke): string => {
    if (stroke.points.length === 0) return '';
    if (stroke.points.length === 1) {
      const p = stroke.points[0];
      return `M ${p.x} ${p.y} L ${p.x + 0.1} ${p.y + 0.1}`;
    }
    return stroke.points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ');
  };

  const COLORS = ['#18181b', '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Pen className="w-8 h-8 text-zinc-300 animate-pulse" /></div>;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1 p-1 glass rounded-xl">
          <button
            onClick={() => setTool('pen')}
            className={`p-2 rounded-lg transition-all ${tool === 'pen' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-700'}`}
            title="Pen"
          >
            <Pen className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTool('eraser')}
            className={`p-2 rounded-lg transition-all ${tool === 'eraser' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-700'}`}
            title="Eraser"
          >
            <Eraser className="w-4 h-4" />
          </button>
        </div>

        {tool === 'pen' && (
          <div className="flex items-center gap-1.5 p-1.5 glass rounded-xl">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full transition-all ${color === c ? 'ring-2 ring-zinc-800 ring-offset-1' : 'hover:scale-110'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 p-1.5 glass rounded-xl">
          <Palette className="w-3.5 h-3.5 text-zinc-400" />
          <input
            type="range"
            min={1}
            max={20}
            value={brushWidth}
            onChange={(e) => setBrushWidth(parseInt(e.target.value))}
            className="w-20 accent-zinc-800"
          />
          <span className="text-xs text-zinc-500 w-6">{brushWidth}</span>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={undo} disabled={strokes.length === 0} className="p-2 rounded-lg glass glass-hover text-zinc-600 disabled:opacity-40">
            <Undo2 className="w-4 h-4" />
          </button>
          <button onClick={clearAll} disabled={strokes.length === 0} className="p-2 rounded-lg glass glass-hover text-zinc-600 disabled:opacity-40">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-sm ml-auto">
          {saved ? (
            <span className="flex items-center gap-1 text-zinc-700 font-medium">
              <Check className="w-4 h-4" /> Saved
            </span>
          ) : (
            <span className="text-zinc-400">Auto-saving...</span>
          )}
        </div>
      </div>

      <div className="glass glass-shadow rounded-2xl overflow-hidden" style={{ height: 'calc(100vh - 220px)', minHeight: '400px' }}>
        <svg
          ref={svgRef}
          className="w-full h-full touch-none cursor-crosshair"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          style={{ background: 'rgba(255,255,255,0.4)' }}
        >
          {strokes.map((stroke, i) => (
            <path
              key={i}
              d={strokeToPath(stroke)}
              fill="none"
              stroke={stroke.color}
              strokeWidth={stroke.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {currentStroke && (
            <path
              d={strokeToPath(currentStroke)}
              fill="none"
              stroke={currentStroke.color}
              strokeWidth={currentStroke.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      </div>
    </div>
  );
}
