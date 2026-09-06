import { useEffect, useRef } from 'react';

/**
 * Theme-matched accretion disk.
 * Camera stays put. A parent tilt is fixed; only the hole spins.
 * Dots orbit faster near the core and drift inward. Canvas is transparent.
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
        const w = Math.max(host.clientWidth, 120);
        const h = Math.max(host.clientHeight, 120);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, w / h, 0.05, 40);
        camera.position.set(0, 0, 3.15);
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          premultipliedAlpha: false,
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h, false);
        renderer.setClearColor(0x000000, 0);
        renderer.domElement.style.background = 'transparent';
        renderer.domElement.style.display = 'block';
        host.innerHTML = '';
        host.appendChild(renderer.domElement);

        // Fixed viewing angle on the parent. Only the child hole rotates.
        const tilt = new THREE.Group();
        tilt.rotation.x = 1.12;
        scene.add(tilt);
        const hole = new THREE.Group();
        tilt.add(hole);

        function pack(count: number, rMin: number, rMax: number, ySpread: number) {
          const pos = new Float32Array(count * 3);
          const col = new Float32Array(count * 3);
          const ang = new Float32Array(count);
          const rad = new Float32Array(count);
          const y0 = new Float32Array(count);
          const spd = new Float32Array(count);
          for (let i = 0; i < count; i++) {
            const t = Math.pow(Math.random(), 0.55);
            const r = rMin + t * (rMax - rMin);
            ang[i] = Math.random() * Math.PI * 2;
            rad[i] = r;
            y0[i] = (Math.random() - 0.5) * ySpread * (1 - t * 0.45);
            spd[i] = 0.018 / Math.pow(Math.max(r, 0.28), 1.35);
            const shade = 0.18 + (1 - t) * 0.72;
            col[i * 3] = shade;
            col[i * 3 + 1] = shade;
            col[i * 3 + 2] = shade;
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
          return { pos, col, ang, rad, y0, spd, geo, count, rMin, rMax };
        }

        const inner = pack(900, 0.28, 0.72, 0.025);
        const mid = pack(1400, 0.68, 1.22, 0.04);
        const outer = pack(700, 1.18, 1.72, 0.055);

        const mk = (geo: THREE.BufferGeometry, size: number, opacity: number) =>
          new THREE.Points(geo, new THREE.PointsMaterial({
            size,
            transparent: true,
            opacity,
            vertexColors: true,
            sizeAttenuation: true,
            depthWrite: false,
          }));

        hole.add(
          mk(inner.geo, 0.022, 0.95),
          mk(mid.geo, 0.016, 0.78),
          mk(outer.geo, 0.012, 0.42),
        );

        const ringGeo = new THREE.RingGeometry(0.22, 0.27, 64);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x18181b,
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        hole.add(ring);

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
          if (hovering) hole.worldToLocal(localHit.copy(worldHit));
          for (let i = 0; i < d.count; i++) {
            d.ang[i] += d.spd[i];
            d.rad[i] -= 0.0011 * d.spd[i] * 12;
            if (d.rad[i] < d.rMin * 0.86) {
              d.rad[i] = d.rMax;
              d.ang[i] = Math.random() * Math.PI * 2;
            }
            const r = d.rad[i];
            const a = d.ang[i];
            let x = Math.cos(a) * r;
            let z = Math.sin(a) * r;
            let y = d.y0[i];
            if (hovering) {
              const dx = x - localHit.x, dy = y - localHit.y, dz = z - localHit.z;
              const dist = Math.hypot(dx, dy, dz) || 1;
              if (dist < 0.5) {
                const f = (1 - dist / 0.5) * 0.16;
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
          hole.rotation.y += 0.0075;
          step(inner);
          step(mid);
          step(outer);
          renderer.render(scene, camera);
          requestAnimationFrame(tick);
        };
        tick();

        const onResize = () => {
          const nw = Math.max(host.clientWidth, 1);
          const nh = Math.max(host.clientHeight, 1);
          camera.aspect = nw / nh;
          camera.updateProjectionMatrix();
          renderer.setSize(nw, nh, false);
        };
        const ro = new ResizeObserver(onResize);
        ro.observe(host);
        dispose = () => {
          ro.disconnect();
          host.removeEventListener('pointermove', onMove);
          host.removeEventListener('pointerleave', onLeave);
          inner.geo.dispose();
          mid.geo.dispose();
          outer.geo.dispose();
          ringGeo.dispose();
          ringMat.dispose();
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
        <div className="pointer-events-none absolute inset-x-0 bottom-0 text-center text-[11px] font-semibold tabular-nums tracking-wide text-zinc-700">
          {percent.toFixed(2)}%
        </div>
      )}
    </div>
  );
}

function drawFallback(host: HTMLDivElement) {
  const canvas = document.createElement('canvas');
  const size = Math.max(host.clientWidth, host.clientHeight, 160);
  canvas.width = size;
  canvas.height = size;
  canvas.className = 'h-full w-full';
  canvas.style.background = 'transparent';
  host.innerHTML = '';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const cx = size / 2;
  const cy = size / 2;
  const dots = Array.from({ length: 640 }, () => {
    const t = Math.pow(Math.random(), 0.55);
    return {
      r: size * (0.12 + t * 0.36),
      a: Math.random() * Math.PI * 2,
      speed: 0.012 / Math.pow(0.2 + t, 1.2),
      s: 0.5 + Math.random() * 1.1,
      shade: 30 + (1 - t) * 140,
    };
  });
  let spin = 0;
  const tick = () => {
    ctx.clearRect(0, 0, size, size);
    spin += 0.008;
    for (const d of dots) {
      d.a += d.speed;
      d.r -= 0.12;
      if (d.r < size * 0.1) d.r = size * 0.46;
      const a = d.a + spin;
      const x = cx + Math.cos(a) * d.r;
      const y = cy + Math.sin(a) * d.r * 0.38;
      ctx.fillStyle = `rgba(${d.shade},${d.shade},${d.shade},0.85)`;
      ctx.beginPath();
      ctx.arc(x, y, d.s, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(tick);
  };
  tick();
}
