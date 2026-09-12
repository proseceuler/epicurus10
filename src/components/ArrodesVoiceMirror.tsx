import { useEffect, useRef } from 'react';
import { ARRODES_FRAME, ARRODES_HOLE_MASK } from '@/components/arrodesFrame';
import { compile, draw, listenMic, EMPTY, VERT, type Bands } from '@/components/arrodesMirrorGL';
import { FRAG } from '@/components/arrodesMirrorFrag';

export type ArrodesVoiceMode = 'idle' | 'listening' | 'thinking' | 'speaking';
export type ArrodesVariant = 'dock' | 'home' | 'track';

const holeMask = {
  WebkitMaskImage: `url("${ARRODES_HOLE_MASK}")`,
  maskImage: `url("${ARRODES_HOLE_MASK}")`,
  WebkitMaskMode: 'luminance' as const,
  maskMode: 'luminance' as const,
};

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
  const glitterRef = useRef<HTMLCanvasElement>(null);
  const bandsRef = useRef<Bands>(EMPTY);
  const modeRef = useRef(mode);
  const hoverGoalRef = useRef(0);
  const hoverAmtRef = useRef(0);
  const hoverPtGoalRef = useRef({ x: 0.5, y: 0.62 });
  const hoverPtAmtRef = useRef({ x: 0.5, y: 0.62 });
  const splashRef = useRef({ t: -99, x: 0.5, y: 0.5 });
  const rafRef = useRef(0);
  const startRef = useRef(0);
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

  useEffect(() => {
    if (!exiting) return;
    const canvas = glitterRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor((parent?.clientWidth || 160) * dpr));
    const h = Math.max(1, Math.floor((parent?.clientHeight || 200) * dpr));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const sparks = Array.from({ length: 46 }, () => ({
      x: w * (0.28 + Math.random() * 0.44),
      y: h * (0.22 + Math.random() * 0.56),
      vx: (Math.random() - 0.5) * 1.8 * dpr,
      vy: (-0.4 - Math.random() * 1.6) * dpr,
      r: (0.6 + Math.random() * 1.5) * dpr,
      life: 0.55 + Math.random() * 0.45,
    }));
    let frame = 0;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      frame += 1;
      ctx.clearRect(0, 0, w, h);
      const fade = Math.max(0, 1 - frame / 52);
      for (const s of sparks) {
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.012 * dpr;
        s.life *= 0.97;
        ctx.fillStyle = `rgba(210,212,216,${0.55 * s.life * fade})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [exiting]);

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
        <img className="arrodes-frame" src={ARRODES_FRAME} alt="" draggable={false} />
        {exiting ? (
          <>
            <div className="arrodes-fog" aria-hidden />
            <canvas ref={glitterRef} className="arrodes-glitter" aria-hidden />
          </>
        ) : null}
      </div>
    </div>
  );
}
