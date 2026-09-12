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
      <AccretionDisc />
      <div className="arrodes-tilt">
        <ArrodesVoiceMirror variant={track ? 'track' : 'home'} mode="idle" active />
      </div>
    </div>
  );
}

function AccretionDisc() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const host = canvas.parentElement;
    let raf = 0;
    let stop = false;

    const dots = Array.from({ length: 520 }, () => {
      const t = Math.pow(Math.random(), 0.68);
      return {
        r: 0.18 + t * 0.46,
        a: Math.random() * Math.PI * 2,
        speed: 0.0022 + Math.random() * 0.0034,
        s: 0.55 + Math.random() * 0.95,
        shade: Math.random(),
      };
    });

    const tick = () => {
      if (stop) return;
      raf = requestAnimationFrame(tick);
      const size = Math.max(host?.clientWidth || 160, host?.clientHeight || 160);
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
      const cy = px / 2 + px * 0.04;
      for (const d of dots) {
        d.a += d.speed;
        const x = cx + Math.cos(d.a) * d.r * px;
        const y = cy + Math.sin(d.a) * d.r * px * 0.38;
        const a = 0.18 + d.s * 0.42;
        const g = Math.floor(24 + d.shade * 70);
        ctx.fillStyle = `rgba(${g},${g},${g + 2},${a})`;
        ctx.beginPath();
        ctx.arc(x, y, d.s * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    tick();
    return () => { stop = true; cancelAnimationFrame(raf); };
  }, []);

  return <canvas ref={ref} className="arrodes-disc" aria-hidden />;
}
