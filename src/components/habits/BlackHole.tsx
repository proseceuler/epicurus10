import { useEffect, useRef } from 'react';

/**
 * Accretion disk with a dark inner shadow.
 * Camera is fixed. The hole spins. Pointer warps nearby dots.
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
        const w = Math.max(host.clientWidth, 160);
        const h = Math.max(host.clientHeight, 160);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(34, w / h, 0.05, 40);
        camera.position.set(0, 0, 3.05);
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
        renderer.domElement.style.cursor = 'grab';
        host.innerHTML = '';
        host.appendChild(renderer.domElement);

        const tilt = new THREE.Group();
        tilt.rotation.x = 1.08;
        scene.add(tilt);
        const hole = new THREE.Group();
        tilt.add(hole);

        const shadowMap = document.createElement('canvas');
        shadowMap.width = 256;
        shadowMap.height = 256;
        const sctx = shadowMap.getContext('2d');
        if (sctx) {
          const g = sctx.createRadialGradient(128, 128, 8, 128, 128, 128);
          g.addColorStop(0, 'rgba(0,0,0,1)');
          g.addColorStop(0.42, 'rgba(9,9,11,0.96)');
          g.addColorStop(0.7, 'rgba(24,24,27,0.55)');
          g.addColorStop(1, 'rgba(24,24,27,0)');
          sctx.fillStyle = g;
          sctx.fillRect(0, 0, 256, 256);
        }
        const shadowTex = new THREE.CanvasTexture(shadowMap);
        shadowTex.needsUpdate = true;
        const shadow = new THREE.Mesh(
          new THREE.CircleGeometry(0.62, 64),
          new THREE.MeshBasicMaterial({
            map: shadowTex,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        shadow.rotation.x = -Math.PI / 2;
        hole.add(shadow);

        const core = new THREE.Mesh(
          new THREE.CircleGeometry(0.34, 48),
          new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.92,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        core.rotation.x = -Math.PI / 2;
        hole.add(core);

        const photon = new THREE.Mesh(
          new THREE.RingGeometry(0.36, 0.41, 80),
          new THREE.MeshBasicMaterial({
            color: 0x27272a,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        photon.rotation.x = -Math.PI / 2;
        hole.add(photon);

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
            spd[i] = 0.016 / Math.pow(Math.max(r, 0.32), 1.35);
            const shade = 0.16 + (1 - t) * 0.78;
            col[i * 3] = shade;
            col[i * 3 + 1] = shade;
            col[i * 3 + 2] = shade;
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
          return { pos, col, ang, rad, y0, spd, geo, count, rMin, rMax };
        }

        const inner = pack(1000, 0.46, 0.86, 0.03);
        const mid = pack(1500, 0.82, 1.34, 0.045);
        const outer = pack(800, 1.28, 1.82, 0.06);

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
          mk(inner.geo, 0.022, 0.96),
          mk(mid.geo, 0.016, 0.78),
          mk(outer.geo, 0.012, 0.42),
        );

        const pick = new THREE.Mesh(
          new THREE.CircleGeometry(1.9, 32),
          new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
        );
        pick.rotation.x = -Math.PI / 2;
        hole.add(pick);

        const raycaster = new THREE.Raycaster();
        const mouseNDC = new THREE.Vector2(99, 99);
        const localHit = new THREE.Vector3();
        let hovering = false;
        let dragging = false;
        let lastX = 0;
        let extraSpin = 0;

        const onMove = (e: PointerEvent) => {
          const rect = host.getBoundingClientRect();
          mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          mouseNDC.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
          raycaster.setFromCamera(mouseNDC, camera);
          const hits = raycaster.intersectObject(pick);
          hovering = hits.length > 0;
          if (hovering) {
            localHit.copy(hits[0].point);
            hole.worldToLocal(localHit);
          }
          if (dragging) {
            extraSpin += (e.clientX - lastX) * 0.012;
            lastX = e.clientX;
          }
        };
        const onDown = (e: PointerEvent) => {
          dragging = true;
          lastX = e.clientX;
          renderer.domElement.style.cursor = 'grabbing';
          host.setPointerCapture(e.pointerId);
        };
        const onUp = () => {
          dragging = false;
          renderer.domElement.style.cursor = 'grab';
        };
        const onLeave = () => { hovering = false; };

        host.addEventListener('pointermove', onMove);
        host.addEventListener('pointerdown', onDown);
        host.addEventListener('pointerup', onUp);
        host.addEventListener('pointerleave', onLeave);
        host.addEventListener('pointercancel', onUp);

        function step(d: ReturnType<typeof pack>) {
          for (let i = 0; i < d.count; i++) {
            d.ang[i] += d.spd[i];
            d.rad[i] -= 0.0012 * d.spd[i] * 12;
            if (d.rad[i] < d.rMin * 0.92) {
              d.rad[i] = d.rMax;
              d.ang[i] = Math.random() * Math.PI * 2;
            }
            const r = d.rad[i];
            const a = d.ang[i];
            let x = Math.cos(a) * r;
            let z = Math.sin(a) * r;
            let y = d.y0[i];
            if (hovering) {
              const dx = x - localHit.x;
              const dy = y - localHit.y;
              const dz = z - localHit.z;
              const dist = Math.hypot(dx, dy, dz) || 1;
              if (dist < 0.72) {
                const f = (1 - dist / 0.72) * 0.28;
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
          hole.rotation.y += 0.0068 + extraSpin;
          extraSpin *= 0.94;
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
          host.removeEventListener('pointerdown', onDown);
          host.removeEventListener('pointerup', onUp);
          host.removeEventListener('pointerleave', onLeave);
          host.removeEventListener('pointercancel', onUp);
          inner.geo.dispose();
          mid.geo.dispose();
          outer.geo.dispose();
          shadow.geometry.dispose();
          (shadow.material as THREE.Material).dispose();
          core.geometry.dispose();
          (core.material as THREE.Material).dispose();
          photon.geometry.dispose();
          (photon.material as THREE.Material).dispose();
          pick.geometry.dispose();
          (pick.material as THREE.Material).dispose();
          shadowTex.dispose();
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
      <div ref={hostRef} className="h-full w-full cursor-grab bg-transparent touch-none" />
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
  const size = Math.max(host.clientWidth, host.clientHeight, 200);
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
  const dots = Array.from({ length: 720 }, () => {
    const t = Math.pow(Math.random(), 0.55);
    return {
      r: size * (0.16 + t * 0.34),
      a: Math.random() * Math.PI * 2,
      speed: 0.012 / Math.pow(0.2 + t, 1.2),
      s: 0.5 + Math.random() * 1.1,
      shade: 30 + (1 - t) * 140,
    };
  });
  let spin = 0;
  const tick = () => {
    ctx.clearRect(0, 0, size, size);
    const g = ctx.createRadialGradient(cx, cy, size * 0.04, cx, cy, size * 0.18);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.65, 'rgba(9,9,11,0.85)');
    g.addColorStop(1, 'rgba(9,9,11,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.18, 0, Math.PI * 2);
    ctx.fill();
    spin += 0.008;
    for (const d of dots) {
      d.a += d.speed;
      d.r -= 0.12;
      if (d.r < size * 0.15) d.r = size * 0.48;
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
