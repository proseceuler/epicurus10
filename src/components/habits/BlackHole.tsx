import { useEffect, useRef } from 'react';

/**
 * Interactable accretion disk: Doppler-beamed orange disk, photon ring,
 * gravitationally lensed far side + underside, empty shadow.
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
        const w = host.clientWidth || 320;
        const h = host.clientHeight || 320;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, w / h, 0.05, 40);
        camera.position.set(0, 1.72, 2.55);
        camera.lookAt(0, -0.08, 0);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h);
        renderer.setClearColor(0x000000, 0);
        host.innerHTML = '';
        host.appendChild(renderer.domElement);

        const group = new THREE.Group();
        group.rotation.x = 1.12;
        scene.add(group);

        const shadow = new THREE.Mesh(
          new THREE.CircleGeometry(0.42, 64),
          new THREE.MeshBasicMaterial({ color: 0x000000 }),
        );
        shadow.rotation.x = -Math.PI / 2;
        group.add(shadow);

        const ringGeo = new THREE.RingGeometry(0.445, 0.475, 96);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xffc27a,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
        });
        const photon = new THREE.Mesh(ringGeo, ringMat);
        photon.rotation.x = -Math.PI / 2;
        group.add(photon);

        function packDisk(count: number, rMin: number, rMax: number, ySpread: number, underside = false) {
          const pos = new Float32Array(count * 3);
          const col = new Float32Array(count * 3);
          const base = new Float32Array(count * 3);
          const vel = new Float32Array(count * 3);
          for (let i = 0; i < count; i++) {
            const t = Math.pow(Math.random(), 0.55);
            const r = rMin + t * (rMax - rMin);
            const a = Math.random() * Math.PI * 2;
            const squash = 0.92 + t * 0.08;
            let x = Math.cos(a) * r;
            let z = Math.sin(a) * r * squash;
            let y = (Math.random() - 0.5) * ySpread * (1 - t * 0.45);
            if (underside) {
              const fold = Math.max(0, -z);
              y = -0.02 - fold * 0.55 - Math.abs(y) * 0.4;
              z = Math.abs(z) * 0.22 + 0.08;
              x *= 0.92;
            } else if (z < 0) {
              y += Math.min(0.28, -z * 0.22);
            }
            pos[i * 3] = x;
            pos[i * 3 + 1] = y;
            pos[i * 3 + 2] = z;
            base[i * 3] = x;
            base[i * 3 + 1] = y;
            base[i * 3 + 2] = z;
            const approach = 0.55 + 0.45 * Math.max(0, Math.sin(a));
            const hot = 1 - t * 0.55;
            col[i * 3] = Math.min(1, 0.55 + hot * 0.45) * approach;
            col[i * 3 + 1] = (0.08 + hot * 0.22) * approach;
            col[i * 3 + 2] = 0.02 * approach;
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
          return { base, pos, vel, geo, count };
        }

        const inner = packDisk(900, 0.48, 0.92, 0.03);
        const mid = packDisk(1400, 0.9, 1.55, 0.05);
        const outer = packDisk(700, 1.5, 2.15, 0.08);
        const under = packDisk(800, 0.5, 1.45, 0.04, true);

        const mk = (geo: THREE.BufferGeometry, size: number, opacity: number) =>
          new THREE.Points(geo, new THREE.PointsMaterial({
            size,
            transparent: true,
            opacity,
            vertexColors: true,
            sizeAttenuation: true,
            depthWrite: false,
          }));

        group.add(mk(inner.geo, 0.028, 0.95), mk(mid.geo, 0.022, 0.82), mk(outer.geo, 0.018, 0.42), mk(under.geo, 0.02, 0.7));

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

        const INFLUENCE = 0.7;
        const STRENGTH = 0.028;
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
          group.rotation.z = frame * 0.0032;
          settle(inner);
          settle(mid);
          settle(outer);
          settle(under);
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
          under.geo.dispose();
          ringGeo.dispose();
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
    <div className={`relative overflow-hidden bg-black ${className}`}>
      <div ref={hostRef} className="h-full w-full" />
      {typeof percent === 'number' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[13px] font-semibold tabular-nums tracking-wide text-zinc-200">
          {percent.toFixed(2)}%
        </div>
      )}
    </div>
  );
}

function drawFallback(host: HTMLDivElement) {
  const canvas = document.createElement('canvas');
  const size = Math.max(host.clientWidth, host.clientHeight, 240);
  canvas.width = size;
  canvas.height = size;
  canvas.className = 'h-full w-full';
  host.innerHTML = '';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const cx = size / 2;
  const cy = size / 2;
  const dots = Array.from({ length: 900 }, () => {
    const t = Math.pow(Math.random(), 0.6);
    return {
      r: size * (0.12 + t * 0.38),
      a: Math.random() * Math.PI * 2,
      speed: 0.004 + Math.random() * 0.006,
      s: 0.6 + Math.random() * 1.2,
      under: Math.random() < 0.28,
    };
  });
  const tick = () => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(cx, cy, size * 0.11, size * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const d of dots) {
      d.a += d.speed * (d.under ? 0.7 : 1);
      const beam = 0.45 + 0.55 * Math.max(0, Math.sin(d.a));
      const x = cx + Math.cos(d.a) * d.r;
      let y = cy + Math.sin(d.a) * d.r * 0.38;
      if (d.under && Math.sin(d.a) > 0) y = cy + Math.sin(d.a) * d.r * 0.22 + size * 0.08;
      ctx.fillStyle = `rgba(${220 + beam * 35 | 0},${40 + beam * 50 | 0},8,${0.25 + beam * 0.55})`;
      ctx.beginPath();
      ctx.arc(x, y, d.s, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(tick);
  };
  tick();
}
