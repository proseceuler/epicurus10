import { useEffect, useRef } from 'react';

/**
 * Monochrome dotted accretion disk around a dark core, one thin photon-ring
 * outline. Slowly rotates; dots nudge away from the pointer on hover and
 * ease back when it moves off.
 */
export default function BlackHole({ className = '', percent, ink = false }: { className?: string; percent?: number; ink?: boolean }) {
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
        const w = host.clientWidth || 120;
        const h = host.clientHeight || 120;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(36, w / h, 0.1, 40);
        camera.position.set(0, 0.9, 3.2);
        camera.lookAt(0, 0, 0);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h);
        renderer.setClearColor(0x000000, 0);
        host.innerHTML = '';
        host.appendChild(renderer.domElement);

        const group = new THREE.Group();
        group.rotation.x = 0.55;
        scene.add(group);

        function makeDisk(count: number, rMin: number, rMax: number, thickness: number) {
          const base = new Float32Array(count * 3);
          for (let i = 0; i < count; i++) {
            const r = rMin + Math.pow(Math.random(), 0.6) * (rMax - rMin);
            const a = Math.random() * Math.PI * 2;
            base[i * 3] = Math.cos(a) * r;
            base[i * 3 + 1] = (Math.random() - 0.5) * thickness;
            base[i * 3 + 2] = Math.sin(a) * r;
          }
          const pos = base.slice();
          const vel = new Float32Array(count * 3);
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          return { base, pos, vel, geo, count };
        }

        const inner = makeDisk(220, 0.42, 0.85, 0.05);
        const outer = makeDisk(260, 0.85, 1.5, 0.09);

        const innerPts = new THREE.Points(inner.geo, new THREE.PointsMaterial({ color: 0xe4e4e7, size: 0.026, transparent: true, opacity: 0.85, sizeAttenuation: true }));
        const outerPts = new THREE.Points(outer.geo, new THREE.PointsMaterial({ color: 0xa1a1aa, size: 0.02, transparent: true, opacity: 0.42, sizeAttenuation: true }));
        group.add(innerPts, outerPts);

        const ring = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(
            Array.from({ length: 64 }, (_, i) => {
              const a = (i / 64) * Math.PI * 2;
              return new THREE.Vector3(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4);
            }),
          ),
          new THREE.LineBasicMaterial({ color: 0xfafafa, transparent: true, opacity: 0.5 }),
        );
        group.add(ring);

        const core = new THREE.Mesh(
          new THREE.SphereGeometry(0.3, 20, 20),
          new THREE.MeshBasicMaterial({ color: 0x09090b }),
        );
        group.add(core);

        const raycaster = new THREE.Raycaster();
        const mouseNDC = new THREE.Vector2(2, 2);
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

        const INFLUENCE = 0.55;
        const STRENGTH = 0.018;
        const DAMPING = 0.9;

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
          group.rotation.y = frame * 0.0035;
          settle(inner);
          settle(outer);
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
    <div className={`relative ${className}`}>
      <div ref={hostRef} className="h-full w-full" />
      {typeof percent === 'number' && (
        <div className={`pointer-events-none absolute inset-x-0 bottom-0 text-center text-[11px] font-semibold tabular-nums tracking-wide ${ink ? 'text-zinc-800' : 'text-zinc-200'}`}>
          {percent.toFixed(2)}%
        </div>
      )}
    </div>
  );
}

function drawFallback(host: HTMLDivElement) {
  const canvas = document.createElement('canvas');
  const size = Math.max(host.clientWidth, 120);
  canvas.width = size;
  canvas.height = size;
  canvas.className = 'h-full w-full';
  host.innerHTML = '';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const cx = size / 2;
  const cy = size / 2;
  const dots = Array.from({ length: 80 }, () => ({
    r: size * (0.18 + Math.random() * 0.32),
    a: Math.random() * Math.PI * 2,
    speed: 0.002 + Math.random() * 0.002,
  }));
  const tick = () => {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.14, 0, Math.PI * 2);
    ctx.fill();
    for (const d of dots) {
      d.a += d.speed;
      const x = cx + Math.cos(d.a) * d.r;
      const y = cy + Math.sin(d.a) * d.r * 0.42;
      ctx.fillStyle = 'rgba(228,228,231,0.7)';
      ctx.beginPath();
      ctx.arc(x, y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    (canvas as HTMLCanvasElement & { _raf?: number })._raf = requestAnimationFrame(tick);
  };
  tick();
}
