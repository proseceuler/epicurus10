export type ImportDraft = {
  title: string;
  content: string;
  folder: string;
  tags: string[];
  sourcePath: string;
};

const SKIP_DIR = new Set(['.obsidian', '.trash', '.git', 'node_modules', '__macosx']);

export function shouldSkipPath(path: string) {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.some((p) => SKIP_DIR.has(p.toLowerCase()))) return true;
  const name = parts[parts.length - 1] || '';
  if (name.startsWith('.')) return true;
  return !/\.(md|markdown|txt)$/i.test(name);
}

export function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const text = raw.replace(/^\uFEFF/, '');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i < 1) continue;
    meta[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return { meta, body: text.slice(m[0].length) };
}

function parseTagList(v?: string) {
  if (!v) return [];
  return v
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(/[,\s]+/)
    .map((t) => t.replace(/^#/, '').replace(/^['"]|['"]$/g, '').trim())
    .filter(Boolean);
}

export function pathToFolder(relPath: string) {
  const parts = relPath.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length <= 1) return 'Imported';
  const dirs = parts.slice(0, -1);
  if (dirs.length === 1) return dirs[0] === parts[0] ? 'Vault' : dirs[0];
  return dirs.slice(1).join('/') || dirs[0];
}

export function titleFromPath(relPath: string) {
  const name = relPath.replace(/\\/g, '/').split('/').pop() || 'Untitled';
  return name.replace(/\.(md|markdown|txt)$/i, '') || 'Untitled';
}

export function fileToDraft(relPath: string, raw: string): ImportDraft {
  const { meta, body } = parseFrontmatter(raw);
  const title = (meta.title || meta.aliases || '').replace(/^['"]|['"]$/g, '').trim() || titleFromPath(relPath);
  const tags = parseTagList(meta.tags || meta.tag);
  return {
    title,
    content: body.replace(/^\n+/, ''),
    folder: pathToFolder(relPath),
    tags,
    sourcePath: relPath.replace(/\\/g, '/'),
  };
}

export async function draftsFromFiles(files: FileList | File[]): Promise<ImportDraft[]> {
  const list = Array.from(files);
  const out: ImportDraft[] = [];
  for (const file of list) {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    if (shouldSkipPath(rel)) continue;
    try {
      out.push(fileToDraft(rel, await file.text()));
    } catch {
      /* skip unreadable */
    }
  }
  return out;
}

function u16(v: DataView, o: number) {
  return v.getUint16(o, true);
}
function u32(v: DataView, o: number) {
  return v.getUint32(o, true);
}

async function inflateRaw(bytes: Uint8Array) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(buf);
}

export async function draftsFromZip(file: File): Promise<ImportDraft[]> {
  const buf = await file.arrayBuffer();
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const out: ImportDraft[] = [];
  let o = 0;
  while (o + 30 < bytes.length) {
    if (u32(view, o) !== 0x04034b50) break;
    const method = u16(view, o + 8);
    const comp = u32(view, o + 18);
    const nameLen = u16(view, o + 26);
    const extra = u16(view, o + 28);
    const name = new TextDecoder().decode(bytes.slice(o + 30, o + 30 + nameLen));
    const start = o + 30 + nameLen + extra;
    const chunk = bytes.slice(start, start + comp);
    o = start + comp;
    if (name.endsWith('/')) continue;
    if (shouldSkipPath(name)) continue;
    try {
      const text = method === 0 ? new TextDecoder().decode(chunk) : method === 8 ? await inflateRaw(chunk) : '';
      if (text) out.push(fileToDraft(name, text));
    } catch {
      /* skip */
    }
  }
  return out;
}
