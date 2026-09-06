import { useEffect, useRef } from 'react';

/**
 * Light-page dotted accretion disk: dense point cloud, empty core,
 * pointer-repulsion, slow spin. Matches the dashboard black-hole graphic.
 */
export default function BlackHole({ className = '', percent, ink = true }: { className?: string; percent?: number; ink?: boolean }) {
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
        const w = host.clientWidth || 160;
        const h = host.clientHeight || 160;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(32, w / h, 0.1, 40);
        camera.position.set(0, 1.55, 2.35);
        camera.lookAt(0, 0, 0);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h);
        renderer.setClearColor(0x000000, 0);
        host.innerHTML = '';
        host.appendChild(renderer.domElement);

        const group = new THREE.Group();
        group.rotation.x = 0.18;
        scene.add(group);

        function makeDisk(count: number, rMin: number, rMax: number, thickness: number) {
          const base = new Float32Array(count * 3);
          for (let i = 0; i < count; i++) {
            const t = Math.pow(Math.random(), 0.72);
            const r = rMin + t * (rMax - rMin);
            const a = Math.random() * Math.PI * 2;
            const squash = 0.72 + t * 0.18;
            base[i * 3] = Math.cos(a) * r;
            base[i * 3 + 1] = (Math.random() - 0.5) * thickness * (1 - t * 0.5);
            base[i * 3 + 2] = Math.sin(a) * r * squash;
          }
          const pos = base.slice();
          const vel = new Float32Array(count * 3);
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          return { base, pos, vel, geo, count };
        }

        const core = makeDisk(420, 0.38, 0.78, 0.04);
        const mid = makeDisk(720, 0.78, 1.35, 0.07);
        const halo = makeDisk(380, 1.32, 1.95, 0.12);

        const inkCol = ink ? 0x18181b : 0xe4e4e7;
        const midCol = ink ? 0x3f3f46 : 0xa1a1aa;
        const haloCol = ink ? 0x71717a : 0x71717a;
        const mk = (geo: THREE.BufferGeometry, color: number, size: number, opacity: number) =>
          new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity, sizeAttenuation: true }));

        group.add(
          mk(core.geo, inkCol, 0.022, 0.92),
          mk(mid.geo, midCol, 0.018, 0.7),
          mk(halo.geo, haloCol, 0.014, 0.32),
        );

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

        const INFLUENCE = 0.62;
        const STRENGTH = 0.022;
        const DAMPING = 0.88;

        function settle(d: { base: Float32Array; pos: Float32Array; vel: Float32Array; geo: THREE.BufferGeometry; count: number }) {
          if (hovering) group.worldToLocal(localHit.copy(worldHit));
          for (let i = 0; i < d.count; i++) {
            const bx = d.base[i * 3], by = d.base[i * 3 + 1], bz = d.base[i * 3 + 2];
            if (hovering) {
              const dx = bx - localHit.x, dy = by - localHit.y, dz = bz - localHit.z;
              const dist = Math.hypot(dx, dy, dz) || 1;
              if (dist < INFLUENCE) {
                const f = (1 - dist / INFLUENCE) * STRENGTH;
                d.vel[i * 3] += (dx / dist) * f;
                d.vel[i * 3 + 1] += (dy / dist) * f;
                d.vel[i * 3 + 2] += (dz / dist) * f;
              }
            }
            d.vel[i * 3] *= DAMPING;
            d.vel[i * 3 + 1] *= DAMPING;
            d.vel[i * 3 + 2] *= DAMPING;
            d.pos[i * 3] = bx + d.vel[i * 3];
            d.pos[i * 3 + 1] = by + d.vel[i * 3 + 1];
            d.pos[i * 3 + 2] = bz + d.vel[i * 3 + 2];
          }
          (d.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
        }

        let frame = 0;
        const tick = () => {
          if (stop) return;
          frame += 1;
          group.rotation.y = frame * 0.0028;
          settle(core);
          settle(mid);
          settle(halo);
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
          core.geo.dispose();
          mid.geo.dispose();
          halo.geo.dispose();
          renderer.dispose();
          host.innerHTML = '';
        };
      } catch {
        drawFallback(host, ink);
      }
    };
    void run();
    return () => { stop = true; dispose(); };
  }, [ink]);

  return (
    <div className={`relative ${className}`}>
      <div ref={hostRef} className="h-full w-full" />
      {typeof percent === 'number' && (
        <div className={`pointer-events-none absolute inset-x-0 bottom-1 text-center text-[12px] font-semibold tabular-nums tracking-wide ${ink ? 'text-zinc-800' : 'text-zinc-200'}`}>
          {percent.toFixed(2)}%
        </div>
      )}
    </div>
  );
}

function drawFallback(host: HTMLDivElement, ink: boolean) {
  const canvas = document.createElement('canvas');
  const size = Math.max(host.clientWidth, host.clientHeight, 160);
  canvas.width = size;
  canvas.height = size;
  canvas.className = 'h-full w-full';
  host.innerHTML = '';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const cx = size / 2;
  const cy = size / 2;
  const dots = Array.from({ length: 320 }, () => {
    const t = Math.pow(Math.random(), 0.7);
    return {
      r: size * (0.12 + t * 0.38),
      a: Math.random() * Math.PI * 2,
      speed: 0.0015 + Math.random() * 0.002,
      s: 0.7 + Math.random() * 0.8,
    };
  });
  const tick = () => {
    ctx.clearRect(0, 0, size, size);
    for (const d of dots) {
      d.a += d.speed;
      const x = cx + Math.cos(d.a) * d.r;
      const y = cy + Math.sin(d.a) * d.r * 0.55;
      ctx.fillStyle = ink ? `rgba(24,24,27,${0.35 + d.s * 0.4})` : 'rgba(228,228,231,0.7)';
      ctx.beginPath();
      ctx.arc(x, y, d.s, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(tick);
  };
  tick();
}
