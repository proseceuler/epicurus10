import { useEffect, useRef } from 'react';
import ArrodesVoiceMirror from '@/components/ArrodesVoiceMirror';

/** Habit Home + Tracker interactable — tilted mercury mirror in a spinning disc. */
export default function BlackHole({
  className = '',
  variant,
}: {
  className?: string;
  percent?: number;
  variant?: 'home' | 'track';
}) {
  const track = variant === 'track' || (!variant && (className.includes('w-[176') || className.includes('w-44')));
  return (
    <div
      className={`arrodes-orbit relative flex items-center justify-center bg-transparent ${track ? 'overflow-hidden' : 'overflow-visible'} ${className}`}
      data-variant={track ? 'track' : 'home'}
    >
      {/* Back half of the ring — behind the portal/frame */}
      <AccretionLayer pass="back" compact={track} />
      <div className="arrodes-tilt">
        <ArrodesVoiceMirror variant={track ? 'track' : 'home'} mode="idle" active />
      </div>
      {/* Front half of the ring — in front of the portal/frame */}
      <AccretionLayer pass="front" compact={track} />
    </div>
  );
}

function AccretionLayer({ pass, compact = false }: { pass: 'back' | 'front'; compact?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const orbit = host.parentElement ?? host;
    let raf = 0;
    let stop = false;
    const pointer = { x: 0.5, y: 0.5, on: 0 };

    // Home rings sized to clear the tall frame (back half peeks around top/sides).
    // Tracker stays tighter against the small mirror.
    const scale = compact ? 0.58 : 1;
    const rings = (compact
      ? [0.34, 0.46, 0.58, 0.72]
      : [0.48, 0.58, 0.70, 0.84]
    ).map((r) => r * scale);
    // Slightly rounder ellipse so the back arc clears the portal height
    const yScale = compact ? 0.42 : 0.58;

    const dots = Array.from({ length: compact ? 560 : 900 }, (_, i) => {
      const ring = rings[i % rings.length];
      const t = Math.pow(Math.random(), 0.7);
      return {
        r: ring + (Math.random() - 0.5) * 0.04 * scale + t * 0.02 * scale,
        a: Math.random() * Math.PI * 2,
        speed: 0.0018 + Math.random() * 0.0032,
        s: 0.5 + Math.random() * 1.05,
        shade: Math.random(),
      };
    });

    const onMove = (e: PointerEvent) => {
      const r = orbit.getBoundingClientRect();
      pointer.x = (e.clientX - r.left) / Math.max(1, r.width);
      pointer.y = (e.clientY - r.top) / Math.max(1, r.height);
      pointer.on = 1;
    };
    const onLeave = () => { pointer.on = 0; };
    orbit.addEventListener('pointermove', onMove);
    orbit.addEventListener('pointerleave', onLeave);

    const paint = () => {
      const size = Math.max(host.clientWidth || 160, host.clientHeight || 160);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const px = Math.max(1, Math.floor(size * dpr));
      if (canvas.width !== px || canvas.height !== px) {
        canvas.width = px;
        canvas.height = px;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, px, px);
      const cx = px / 2;
      const cy = px / 2 + px * 0.02;
      for (const d of dots) {
        // sin > 0 → bottom / near side (front); sin ≤ 0 → top / far side (back)
        const frontDot = Math.sin(d.a) > 0;
        if (pass === 'front' ? !frontDot : frontDot) continue;

        const nx = Math.cos(d.a);
        let side = 1;
        if (compact) {
          side = Math.max(0, Math.min(1, (0.88 - Math.abs(nx)) / 0.26));
          if (side <= 0.02) continue;
        }

        let x = cx + nx * d.r * px;
        let y = cy + Math.sin(d.a) * d.r * px * yScale;

        if (pointer.on) {
          const hx = pointer.x * px;
          const hy = pointer.y * px;
          const dx = x - hx;
          const dy = y - hy;
          const dist = Math.hypot(dx, dy) || 1;
          const reach = px * 0.22;
          if (dist < reach) {
            const f = (1 - dist / reach) * 18 * dpr;
            x += (dx / dist) * f;
            y += (dy / dist) * f;
          }
        }

        // Back dots almost as visible as front so the far arc reads clearly
        const a = ((frontDot ? 0.36 : 0.30) + d.s * 0.36) * side;
        const g = Math.floor(22 + d.shade * 78);
        ctx.fillStyle = `rgba(${g},${g},${g + 2},${a})`;
        ctx.beginPath();
        ctx.arc(x, y, d.s * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const tick = () => {
      if (stop) return;
      raf = requestAnimationFrame(tick);
      for (const d of dots) d.a += d.speed;
      paint();
    };
    tick();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      orbit.removeEventListener('pointermove', onMove);
      orbit.removeEventListener('pointerleave', onLeave);
    };
  }, [compact, pass]);

  return (
    <div
      ref={hostRef}
      className={`arrodes-disc-stack arrodes-disc-stack--${pass}`}
      aria-hidden
    >
      <canvas ref={canvasRef} className={`arrodes-disc arrodes-disc--${pass}`} />
    </div>
  );
}
