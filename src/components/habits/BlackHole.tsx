import { useEffect, useRef } from 'react';

/** Monochrome wireframe lattice — dark core + rotating concentric rings. */
export default function BlackHole({ className = '', percent }: { className?: string; percent?: number }) {
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
        const w = host.clientWidth || 180;
        const h = host.clientHeight || 180;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 40);
        camera.position.set(0, 0.15, 3.6);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h);
        renderer.setClearColor(0x000000, 0);
        host.innerHTML = '';
        host.appendChild(renderer.domElement);

        const group = new THREE.Group();
        scene.add(group);

        const addWire = (geo: THREE.BufferGeometry, color: number, opacity: number) => {
          const lines = new THREE.LineSegments(
            new THREE.WireframeGeometry(geo),
            new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
          );
          geo.dispose();
          group.add(lines);
          return lines;
        };

        addWire(new THREE.TorusGeometry(0.48, 0.09, 10, 48), 0xe4e4e7, 0.55);
        addWire(new THREE.TorusGeometry(0.82, 0.06, 8, 56), 0xa1a1aa, 0.32);
        addWire(new THREE.TorusGeometry(1.14, 0.045, 8, 64), 0xd4d4d8, 0.42);
        addWire(new THREE.TorusGeometry(1.46, 0.03, 6, 72), 0x71717a, 0.28);
        addWire(new THREE.SphereGeometry(0.34, 14, 12), 0xfafafa, 0.22);

        const core = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 16, 16),
          new THREE.MeshBasicMaterial({ color: 0x09090b }),
        );
        group.add(core);

        const ptsGeo = new THREE.TorusGeometry(0.98, 0.38, 12, 48);
        const pos = ptsGeo.getAttribute('position');
        const positions: number[] = [];
        for (let i = 0; i < pos.count; i += 2) {
          positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        }
        ptsGeo.dispose();
        const cloud = new THREE.BufferGeometry();
        cloud.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        group.add(new THREE.Points(cloud, new THREE.PointsMaterial({ color: 0xe4e4e7, size: 0.018, transparent: true, opacity: 0.55 })));

        group.rotation.x = 0.72;

        let frame = 0;
        const tick = () => {
          if (stop) return;
          frame += 1;
          group.rotation.z = frame * 0.005;
          group.rotation.y = Math.sin(frame * 0.007) * 0.22;
          group.rotation.x = 0.68 + Math.cos(frame * 0.005) * 0.07;
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
          cloud.dispose();
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
        <div className="pointer-events-none absolute inset-x-0 bottom-0 text-center text-[11px] font-semibold tabular-nums tracking-wide text-zinc-200">
          {percent.toFixed(2)}%
        </div>
      )}
    </div>
  );
}

function drawFallback(host: HTMLDivElement) {
  const canvas = document.createElement('canvas');
  const size = Math.max(host.clientWidth, 160);
  canvas.width = size;
  canvas.height = size;
  canvas.className = 'h-full w-full';
  host.innerHTML = '';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const cx = size / 2;
  const cy = size / 2;
  let frame = 0;
  const tick = () => {
    frame += 1;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(frame * 0.008);
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = `rgba(228,228,231,${0.18 + i * 0.07})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, 16 + i * 14, 9 + i * 10, -0.35 + i * 0.08, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    (canvas as HTMLCanvasElement & { _raf?: number })._raf = requestAnimationFrame(tick);
  };
  tick();
}
