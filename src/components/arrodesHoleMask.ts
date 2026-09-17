/** Build a luminance hole mask from a custom frame image so mercury stays in the opening. */

export const CUSTOM_FRAME_HOLE_FALLBACK =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 124">
      <rect width="100" height="124" fill="black"/>
      <path fill="white" d="
        M 29 16
        C 22 24 18 36 17.5 50
        C 17.2 62 19 72 23 82
        C 28 96 38 106 50 108.5
        C 62 106 72 96 77 82
        C 81 72 82.8 62 82.5 50
        C 82 36 78 24 71 16
        C 63 10 37 10 29 16 Z"/>
    </svg>`,
  );

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read frame image'));
    img.src = src;
  });
}

function findSeed(open: Uint8Array, w: number, h: number) {
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  if (open[cy * w + cx]) return cy * w + cx;
  const maxR = Math.max(w, h);
  for (let r = 1; r < maxR; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        if (open[i]) return i;
      }
    }
  }
  return -1;
}

function flood(open: Uint8Array, w: number, h: number, seed: number) {
  const hole = new Uint8Array(w * h);
  const stack = [seed];
  hole[seed] = 1;
  let count = 0;
  while (stack.length) {
    const i = stack.pop()!;
    count += 1;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0 && open[i - 1] && !hole[i - 1]) {
      hole[i - 1] = 1;
      stack.push(i - 1);
    }
    if (x + 1 < w && open[i + 1] && !hole[i + 1]) {
      hole[i + 1] = 1;
      stack.push(i + 1);
    }
    if (y > 0 && open[i - w] && !hole[i - w]) {
      hole[i - w] = 1;
      stack.push(i - w);
    }
    if (y + 1 < h && open[i + w] && !hole[i + w]) {
      hole[i + w] = 1;
      stack.push(i + w);
    }
  }
  return { hole, count };
}

function erodeAnisotropic(src: Uint8Array, w: number, h: number, rx: number, ry: number) {
  const out = new Uint8Array(src);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!src[i]) continue;
      let keep = 1;
      for (let dy = -ry; dy <= ry && keep; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) {
          keep = 0;
          break;
        }
        for (let dx = -rx; dx <= rx; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w || !src[yy * w + xx]) {
            keep = 0;
            break;
          }
        }
      }
      out[i] = keep;
    }
  }
  return out;
}

/**
 * Largest inner opening of a frame PNG, pinched extra on the sides so
 * ornamental cutouts (eyes, crescents) do not leak mercury.
 */
export async function holeMaskFromFrame(src: string): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  try {
    const img = await loadImage(src);
    const max = 280;
    const scale = Math.min(1, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1, 1));
    const w = Math.max(12, Math.round((img.naturalWidth || 1) * scale));
    const h = Math.max(12, Math.round((img.naturalHeight || 1) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const image = ctx.getImageData(0, 0, w, h);
    const data = image.data;
    const n = w * h;

    let transparent = 0;
    const alphaOpen = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const a = data[i * 4 + 3];
      if (a < 36) {
        alphaOpen[i] = 1;
        transparent += 1;
      }
    }

    let open = alphaOpen;
    if (transparent < n * 0.04) {
      const paper = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        const maxc = Math.max(r, g, b);
        const minc = Math.min(r, g, b);
        if (maxc > 214 && maxc - minc < 28) paper[i] = 1;
      }
      open = paper;
    }

    const seed = findSeed(open, w, h);
    if (seed < 0) return null;
    const filled = flood(open, w, h, seed);
    if (filled.count < n * 0.08 || filled.count > n * 0.86) return null;

    let hole = erodeAnisotropic(filled.hole, w, h, 4, 2);
    hole = erodeAnisotropic(hole, w, h, 3, 1);

    let kept = 0;
    for (let i = 0; i < n; i++) {
      if (hole[i]) kept += 1;
    }
    if (kept < n * 0.06) return null;

    const out = ctx.createImageData(w, h);
    for (let i = 0; i < n; i++) {
      const v = hole[i] ? 255 : 0;
      const o = i * 4;
      out.data[o] = v;
      out.data[o + 1] = v;
      out.data[o + 2] = v;
      out.data[o + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);

    const soft = document.createElement('canvas');
    soft.width = w;
    soft.height = h;
    const sctx = soft.getContext('2d');
    if (sctx) {
      sctx.filter = 'blur(1.15px)';
      sctx.drawImage(canvas, 0, 0);
      return soft.toDataURL('image/png');
    }
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
