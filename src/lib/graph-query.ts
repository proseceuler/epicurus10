export type GraphDoc = {
  id: string;
  title: string;
  folder?: string;
  tags?: string[];
  content?: string;
  kind: string;
};

function tokenize(q: string): string[] {
  const out: string[] = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q))) out.push(m[1] ?? m[2]);
  return out;
}

function haystack(doc: GraphDoc) {
  return `${doc.title} ${doc.folder || ''} ${(doc.tags || []).join(' ')} ${doc.content || ''}`.toLowerCase();
}

function matchToken(doc: GraphDoc, raw: string): boolean {
  let token = raw.trim();
  if (!token) return true;
  const neg = token.startsWith('-');
  if (neg) token = token.slice(1);
  const lower = token.toLowerCase();
  const colon = lower.indexOf(':');
  let hit = false;
  if (colon > 0) {
    const key = lower.slice(0, colon);
    const val = token.slice(colon + 1).replace(/^#/, '').toLowerCase();
    if (key === 'tag') hit = (doc.tags || []).some((t) => t.toLowerCase().replace(/^#/, '') === val || t.toLowerCase().includes(val));
    else if (key === 'path') hit = (doc.folder || '').toLowerCase().includes(val);
    else if (key === 'file') hit = doc.title.toLowerCase().includes(val);
    else if (key === 'type') hit = doc.kind.toLowerCase() === val;
    else hit = haystack(doc).includes(lower);
  } else {
    hit = haystack(doc).includes(lower.replace(/^#/, ''));
  }
  return neg ? !hit : hit;
}

/** Obsidian-lite: implicit AND, OR, -not, quotes, tag:, path:, file:, type: */
export function matchGraphQuery(doc: GraphDoc, query: string): boolean {
  const q = (query || '').trim();
  if (!q) return true;
  const parts = tokenize(q);
  const groups: string[][] = [[]];
  for (const p of parts) {
    if (p.toUpperCase() === 'OR') {
      groups.push([]);
      continue;
    }
    groups[groups.length - 1].push(p);
  }
  return groups.some((andTokens) => andTokens.every((t) => matchToken(doc, t)));
}
