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
    <div className={`arrodes-orbit relative flex items-center justify-center overflow-visible bg-transparent ${className}`} data-variant={track ? 'track' : 'home'}>
      <AccretionDisc tight={track} />
      <div className="arrodes-tilt">
        <ArrodesVoiceMirror variant={track ? 'track' : 'home'} mode="idle" active />
      </div>
    </div>
  );
}

function AccretionDisc({ tight = false }: { tight?: boolean }) {
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const back = backRef.current;
    const front = frontRef.current;
    if (!host || !back || !front) return;
    let raf = 0;
    let stop = false;
    const pointer = { x: 0.5, y: 0.5, on: 0 };
    const orbit = host.parentElement;

    const rings = tight ? [0.16, 0.21, 0.26, 0.31] : [0.18, 0.24, 0.30, 0.36];
    const dots = Array.from({ length: tight ? 520 : 720 }, (_, i) => {
      const ring = rings[i % rings.length];
      return {
        r: ring + (Math.random() - 0.5) * 0.028,
        a: Math.random() * Math.PI * 2,
        speed: 0.0018 + Math.random() * 0.0032,
        s: 0.45 + Math.random() * 0.9,
        shade: Math.random(),
      };
    });

    const onMove = (e: PointerEvent) => {
      const box = (orbit || host).getBoundingClientRect();
      pointer.x = (e.clientX - box.left) / Math.max(1, box.width);
      pointer.y = (e.clientY - box.top) / Math.max(1, box.height);
      pointer.on = 1;
    };
    const onLeave = () => { pointer.on = 0; };
    (orbit || host).addEventListener('pointermove', onMove);
    (orbit || host).addEventListener('pointerleave', onLeave);

    const paint = (canvas: HTMLCanvasElement, pass: 'back' | 'front') => {
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
      const maxR = rings[rings.length - 1] + 0.02;
      for (const d of dots) {
        const frontDot = Math.sin(d.a) > 0;
        if (pass === 'front' ? !frontDot : frontDot) continue;
        let x = cx + Math.cos(d.a) * d.r * px;
        let y = cy + Math.sin(d.a) * d.r * px * 0.40;
        if (pointer.on) {
          const hx = pointer.x * px;
          const hy = pointer.y * px;
          const dx = x - hx;
          const dy = y - hy;
          const dist = Math.hypot(dx, dy) || 1;
          const reach = px * 0.18;
          if (dist < reach) {
            const f = (1 - dist / reach) * 14 * dpr;
            x += (dx / dist) * f;
            y += (dy / dist) * f;
          }
        }
        const edge = Math.max(0, Math.min(1, (maxR + 0.03 - d.r) / 0.08));
        const a = ((frontDot ? 0.36 : 0.18) + d.s * 0.34) * (0.35 + edge * 0.65);
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
      paint(back, 'back');
      paint(front, 'front');
    };
    tick();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      (orbit || host).removeEventListener('pointermove', onMove);
      (orbit || host).removeEventListener('pointerleave', onLeave);
    };
  }, [tight]);

  return (
    <div ref={hostRef} className="arrodes-disc-stack" aria-hidden>
      <canvas ref={backRef} className="arrodes-disc arrodes-disc--back" />
      <canvas ref={frontRef} className="arrodes-disc arrodes-disc--front" />
    </div>
  );
}
