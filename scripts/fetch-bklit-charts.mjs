/**
 * Fetches Bklit chart sources from the public shadcn registry into src/charts.
 * Runs on postinstall / prebuild so Vercel gets the files without vendoring 90+ files in git.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const marker = join(root, 'src/charts/bar-chart.tsx');
if (existsSync(marker) && !process.env.BKLIT_FORCE_FETCH) {
  console.log('[bklit] src/charts already present — skip fetch');
  process.exit(0);
}

const BASE = 'https://ui.bklit.com/r';
const seeds = ['bar-chart', 'area-chart', 'heatmap-chart'];

async function fetchJson(slug) {
  const url = `${BASE}/${slug}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  return res.json();
}

const seen = new Set();
const queue = [...seeds];
const files = new Map();
const npmHints = new Set();

while (queue.length) {
  const name = queue.shift();
  if (seen.has(name)) continue;
  seen.add(name);
  const slug = name.replace('@bklit/', '');
  const d = await fetchJson(slug);
  for (const dep of d.dependencies || []) npmHints.add(dep);
  for (const rd of d.registryDependencies || []) queue.push(rd);
  for (const f of d.files || []) {
    if (f.path && f.content != null) files.set(f.path, f.content);
  }
}

for (const [path, content] of files) {
  if (path === 'src/lib/utils.ts') continue;
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  console.log('[bklit] wrote', path);
}

const tokens = `/* Bklit chart tokens — zinc / rice-shell */
:root {
  --chart-background: transparent;
  --chart-foreground: #3f3f46;
  --chart-foreground-muted: #a1a1aa;
  --chart-label: #71717a;
  --chart-line-primary: #18181b;
  --chart-line-secondary: #52525b;
  --chart-crosshair: #a1a1aa;
  --chart-grid: #e4e4e7;
  --chart-indicator-color: #18181b;
  --chart-indicator-secondary-color: #71717a;
  --chart-marker-background: #ffffff;
  --chart-marker-border: #18181b;
  --chart-marker-foreground: #18181b;
  --chart-marker-badge-background: #18181b;
  --chart-marker-badge-foreground: #ffffff;
  --chart-1: #18181b;
  --chart-2: #3f3f46;
  --chart-3: #52525b;
  --chart-4: #71717a;
  --chart-5: #a1a1aa;
  --chart-scale-01: #f4f4f5;
  --chart-scale-02: #d4d4d8;
  --chart-scale-03: #a1a1aa;
  --chart-scale-04: #52525b;
  --chart-scale-05: #18181b;
  --chart-scale-pattern-color: #e4e4e7;
  --border: #e4e4e7;
  --foreground: #18181b;
  --muted-foreground: #71717a;
}
`;
mkdirSync(join(root, 'src/charts'), { recursive: true });
writeFileSync(join(root, 'src/charts/chart-tokens.css'), tokens);

console.log('[bklit] done —', files.size, 'registry files,', seen.size, 'packages');
if (npmHints.size) {
  console.log('[bklit] npm deps expected:', [...npmHints].join(', '));
}
