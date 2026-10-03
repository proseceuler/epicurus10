import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const partsDir = join(root, 'scripts', 'bklit-vendor');
if (!existsSync(partsDir)) {
  console.log('[bklit] no vendor parts — skip extract');
  process.exit(0);
}
const parts = [];
for (let i = 0; i < 32; i++) {
  const p = join(partsDir, `part${i}.b64`);
  if (!existsSync(p)) break;
  parts.push(readFileSync(p, 'utf8').replace(/\s+/g, ''));
}
if (!parts.length) process.exit(0);
const out = join(root, '.bklit-charts.tgz');
writeFileSync(out, Buffer.from(parts.join(''), 'base64'));
execSync(`tar -xzf "${out}" -C "${root}"`, { stdio: 'inherit' });
console.log('[bklit] charts extracted');
