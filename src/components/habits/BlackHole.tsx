import { useEffect, useRef } from 'react';

/**
 * Theme-matched accretion disk: fixed camera, the hole itself spins,
 * particles orbit faster near the core and drift inward. No backdrop.
 */
export default function BlackHole({
  className = '',
  percent,
}: {
  className?: string;
  percent?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let stop = false;
    let dispose = () => { /* noop */ };

    const run = async () => {
      try {
        const THREE = await import('three');
        if (stop || !hostRef.current) return;
        const w = host.clientWidth || 240;
        const h = host.clientHeight || 240;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(36, w / h, 0.05, 40);
        camera.position.set(0, 1.85, 2.4);
        camera.lookAt(0, 0, 0);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h);
        renderer.setClearColor(0x000000, 0);
        host.innerHTML = '';
        host.appendChild(renderer.domElement);

        const group = new THREE.Group();
        group.rotation.x = 1.08;
        scene.add(group);

        function pack(count: number, rMin: number, rMax: number, ySpread: number) {
          const pos = new Float32Array(count * 3);
          const col = new Float32Array(count * 3);
          const ang = new Float32Array(count);
          const rad = new Float32Array(count);
          const y0 = new Float32Array(count);
          const spd = new Float32Array(count);
          for (let i = 0; i < count; i++) {
            const t = Math.pow(Math.random(), 0.62);
            const r = rMin + t * (rMax - rMin);
            const a = Math.random() * Math.PI * 2;
            ang[i] = a;
            rad[i] = r;
            y0[i] = (Math.random() - 0.5) * ySpread * (1 - t * 0.4);
            spd[i] = (0.012 + (1 - t) * 0.028) / Math.max(r, 0.35);
            const shade = 0.12 + t * 0.55;
            col[i * 3] = shade;
            col[i * 3 + 1] = shade;
            col[i * 3 + 2] = shade;
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
          return { pos, col, ang, rad, y0, spd, geo, count, rMin, rMax };
        }

        const inner = pack(700, 0.42, 0.88, 0.03);
        const mid = pack(1100, 0.86, 1.48, 0.05);
        const outer = pack(500, 1.42, 2.05, 0.07);

        const mk = (geo: THREE.BufferGeometry, size: number, opacity: number) =>
          new THREE.Points(geo, new THREE.PointsMaterial({
            size,
            transparent: true,
            opacity,
            vertexColors: true,
            sizeAttenuation: true,
            depthWrite: false,
          }));

        group.add(mk(inner.geo, 0.024, 0.95), mk(mid.geo, 0.018, 0.72), mk(outer.geo, 0.014, 0.38));

        const mouseNDC = new THREE.Vector2(99, 99);
        const raycaster = new THREE.Raycaster();
        const worldHit = new THREE.Vector3();
        const localHit = new THREE.Vector3();
        let hovering = false;
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

        const onMove = (e: PointerEvent) => {
          const rect = host.getBoundingClientRect();
          mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          mouseNDC.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
          raycaster.setFromCamera(mouseNDC, camera);
          hovering = !!raycaster.ray.intersectPlane(plane, worldHit);
        };
        const onLeave = () => { hovering = false; };
        host.addEventListener('pointermove', onMove);
        host.addEventListener('pointerleave', onLeave);

        function step(d: ReturnType<typeof pack>) {
          if (hovering) group.worldToLocal(localHit.copy(worldHit));
          for (let i = 0; i < d.count; i++) {
            d.ang[i] += d.spd[i];
            d.rad[i] -= 0.00055;
            if (d.rad[i] < d.rMin) {
              d.rad[i] = d.rMax;
              d.ang[i] = Math.random() * Math.PI * 2;
            }
            const r = d.rad[i];
            const a = d.ang[i];
            let x = Math.cos(a) * r;
            let z = Math.sin(a) * r * 0.94;
            let y = d.y0[i];
            if (hovering) {
              const dx = x - localHit.x, dy = y - localHit.y, dz = z - localHit.z;
              const dist = Math.hypot(dx, dy, dz) || 1;
              if (dist < 0.55) {
                const f = (1 - dist / 0.55) * 0.18;
                x += (dx / dist) * f;
                y += (dy / dist) * f;
                z += (dz / dist) * f;
              }
            }
            d.pos[i * 3] = x;
            d.pos[i * 3 + 1] = y;
            d.pos[i * 3 + 2] = z;
          }
          (d.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
        }

        const tick = () => {
          if (stop) return;
          group.rotation.z += 0.0042;
          step(inner);
          step(mid);
          step(outer);
          renderer.render(scene, camera);
          requestAnimationFrame(tick);
        };
        tick();

        const onResize = () => {
          const nw = host.clientWidth || w;
          const nh = host.clientHeight || h;
          camera.aspect = nw / nh;
          camera.updateProjectionMatrix();
          renderer.setSize(nw, nh);
        };
        window.addEventListener('resize', onResize);
        dispose = () => {
          window.removeEventListener('resize', onResize);
          host.removeEventListener('pointermove', onMove);
          host.removeEventListener('pointerleave', onLeave);
          inner.geo.dispose();
          mid.geo.dispose();
          outer.geo.dispose();
          renderer.dispose();
          host.innerHTML = '';
        };
      } catch {
        drawFallback(host);
      }
    };
    void run();
    return () => { stop = true; dispose(); };
  }, []);

  return (
    <div className={`relative bg-transparent ${className}`}>
      <div ref={hostRef} className="h-full w-full bg-transparent" />
      {typeof percent === 'number' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center text-[12px] font-semibold tabular-nums tracking-wide text-zinc-700">
          {percent.toFixed(2)}%
        </div>
      )}
    </div>
  );
}

function drawFallback(host: HTMLDivElement) {
  const canvas = document.createElement('canvas');
  const size = Math.max(host.clientWidth, host.clientHeight, 200);
  canvas.width = size;
  canvas.height = size;
  canvas.className = 'h-full w-full';
  host.innerHTML = '';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const cx = size / 2;
  const cy = size / 2;
  const dots = Array.from({ length: 520 }, () => {
    const t = Math.pow(Math.random(), 0.65);
    return {
      r: size * (0.14 + t * 0.34),
      a: Math.random() * Math.PI * 2,
      speed: 0.008 + (1 - t) * 0.02,
      s: 0.6 + Math.random() * 0.9,
      shade: 20 + t * 90,
    };
  });
  const tick = () => {
    ctx.clearRect(0, 0, size, size);
    for (const d of dots) {
      d.a += d.speed;
      d.r -= 0.08;
      if (d.r < size * 0.12) d.r = size * 0.48;
      const x = cx + Math.cos(d.a) * d.r;
      const y = cy + Math.sin(d.a) * d.r * 0.42;
      ctx.fillStyle = `rgba(${d.shade},${d.shade},${d.shade},0.8)`;
      ctx.beginPath();
      ctx.arc(x, y, d.s, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(tick);
  };
  tick();
}
