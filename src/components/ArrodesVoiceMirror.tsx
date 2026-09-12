import { useEffect, useRef, useState } from 'react';
import { ARRODES_FRAME, ARRODES_HOLE_MASK } from '@/components/arrodesFrame';
import { compile, draw, listenMic, EMPTY, VERT, type Bands } from '@/components/arrodesMirrorGL';
import { FRAG } from '@/components/arrodesMirrorFrag';
import { ARRODES_FRAME_PNG, getArrodesFramePng } from '@/lib/apiKeys';

export type ArrodesVoiceMode = 'idle' | 'listening' | 'thinking' | 'speaking';
export type ArrodesVariant = 'dock' | 'home' | 'track';

const holeMask = {
  WebkitMaskImage: `url("${ARRODES_HOLE_MASK}")`,
  maskImage: `url("${ARRODES_HOLE_MASK}")`,
  WebkitMaskMode: 'luminance' as const,
  maskMode: 'luminance' as const,
};

function useFrameSrc() {
  const [src, setSrc] = useState(() => getArrodesFramePng() || ARRODES_FRAME);
  useEffect(() => {
    const read = () => setSrc(getArrodesFramePng() || ARRODES_FRAME);
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === ARRODES_FRAME_PNG) read();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  return src;
}

export default function ArrodesVoiceMirror({
  mode = 'idle',
  active = false,
  expanded = false,
  variant = 'dock',
  exiting = false,
}: {
  mode?: ArrodesVoiceMode;
  active?: boolean;
  expanded?: boolean;
  variant?: ArrodesVariant;
  exiting?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bandsRef = useRef<Bands>(EMPTY);
  const modeRef = useRef(mode);
  const hoverGoalRef = useRef(0);
  const hoverAmtRef = useRef(0);
  const hoverPtGoalRef = useRef({ x: 0.5, y: 0.62 });
  const hoverPtAmtRef = useRef({ x: 0.5, y: 0.62 });
  const splashRef = useRef({ t: -99, x: 0.5, y: 0.5 });
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const frameSrc = useFrameSrc();
  modeRef.current = mode;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: true });
    if (!gl) return;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const resize = () => {
      const el = wrapRef.current;
      if (!el) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(el.clientWidth * dpr));
      const h = Math.max(1, Math.floor(el.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    };
    startRef.current = performance.now();
    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      resize();
      hoverAmtRef.current += (hoverGoalRef.current - hoverAmtRef.current) * 0.065;
      hoverPtAmtRef.current = {
        x: hoverPtAmtRef.current.x + (hoverPtGoalRef.current.x - hoverPtAmtRef.current.x) * 0.12,
        y: hoverPtAmtRef.current.y + (hoverPtGoalRef.current.y - hoverPtAmtRef.current.y) * 0.12,
      };
      draw(
        gl,
        prog,
        canvas,
        (now - startRef.current) / 1000,
        modeRef.current,
        bandsRef.current,
        hoverAmtRef.current,
        hoverPtAmtRef.current,
        splashRef.current,
      );
    };
    rafRef.current = requestAnimationFrame(tick);
    resize();
    return () => { cancelAnimationFrame(rafRef.current); gl.deleteProgram(prog); };
  }, []);

  useEffect(() => listenMic(mode, (bands) => { bandsRef.current = bands; }), [mode]);

  const pointInWell = (e: React.PointerEvent) => {
    const el = wrapRef.current;
    if (!el) return { x: 0.5, y: 0.5 };
    const r = el.getBoundingClientRect();
    return { x: (e.clientX - r.left) / Math.max(1, r.width), y: 1 - (e.clientY - r.top) / Math.max(1, r.height) };
  };

  return (
    <div
      className="arrodes-stage"
      data-mode={mode}
      data-active={active ? '1' : '0'}
      data-expanded={expanded ? '1' : '0'}
      data-variant={variant}
      data-exit={exiting ? '1' : '0'}
    >
      <div
        ref={wrapRef}
        className="arrodes-well"
        role="button"
        tabIndex={0}
        title="Hover the glass. Click for a puddle."
        onPointerEnter={() => { hoverGoalRef.current = 1; }}
        onPointerMove={(e) => { hoverGoalRef.current = 1; hoverPtGoalRef.current = pointInWell(e); }}
        onPointerLeave={() => { hoverGoalRef.current = 0; }}
        onPointerDown={(e) => {
          e.preventDefault();
          const pt = pointInWell(e);
          splashRef.current = { t: (performance.now() - startRef.current) / 1000, x: pt.x, y: pt.y };
        }}
      >
        <canvas ref={canvasRef} className="arrodes-blob" style={holeMask} />
        <div className="arrodes-glass" aria-hidden style={holeMask} />
        <img className="arrodes-frame" src={frameSrc} alt="" draggable={false} />
      </div>
    </div>
  );
}
