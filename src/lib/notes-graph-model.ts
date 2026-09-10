import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';
import { findBoardByName } from '@/lib/board-store';
import { matchGraphQuery, type GraphDoc } from '@/lib/graph-query';
import type { Note } from '@/lib/types';
import { wikiBoardTitles, wikiLinkTitles, findNoteByTitle } from '@/lib/wiki';

export type NodeKind = 'index' | 'daily' | 'topic' | 'board' | 'unresolved';
export type ColorGroup = { query: string; color: string };

export type GNode = SimulationNodeDatum & {
  id: string;
  label: string;
  kind: NodeKind;
  degree: number;
  inDegree: number;
  outDegree: number;
};

export type GLink = SimulationLinkDatum<GNode> & {
  source: string | GNode;
  target: string | GNode;
  strength: number;
};

export type GraphColors = Record<NodeKind, string>;
export type Cam = { x: number; y: number; k: number };

export type GraphSettings = {
  bg: 'plain' | 'dots' | 'grid';
  center: number;
  charge: number;
  linkForce: number;
  linkDist: number;
  showLabels: boolean;
  enabled: NodeKind[];
  search: string;
  showOrphans: boolean;
  hideUnresolved: boolean;
  showArrows: boolean;
  nodeSize: number;
  lineSize: number;
  mode: 'global' | 'local';
  depth: number;
  groups: ColorGroup[];
};

export const DEFAULT_COLORS: GraphColors = {
  index: '#18181b',
  daily: '#2563eb',
  topic: '#3f3f46',
  board: '#c2410c',
  unresolved: '#a1a1aa',
};

export const COLOR_KEY = 'epicure:graph-colors';
export const GRAPH_SETTINGS_KEY = 'epicure:graph-settings:v2';

export const DEFAULT_GSET: GraphSettings = {
  bg: 'plain',
  center: 0.32,
  charge: -180,
  linkForce: 0.45,
  linkDist: 96,
  showLabels: true,
  enabled: ['index', 'daily', 'topic', 'board'],
  search: '',
  showOrphans: true,
  hideUnresolved: false,
  showArrows: false,
  nodeSize: 1,
  lineSize: 1,
  mode: 'global',
  depth: 1,
  groups: [],
};

export const KIND_LABEL: Record<NodeKind, string> = {
  index: 'Index',
  daily: 'Daily',
  topic: 'Topic',
  board: 'Board',
  unresolved: 'Missing',
};

export function loadGraphSettings(): GraphSettings {
  try {
    const raw = localStorage.getItem(GRAPH_SETTINGS_KEY) || localStorage.getItem('epicure:graph-settings:v1');
    if (raw) return { ...DEFAULT_GSET, ...JSON.parse(raw) };
  } catch {
    /* */
  }
  return { ...DEFAULT_GSET };
}

export function loadColors(): GraphColors {
  try {
    const raw = localStorage.getItem(COLOR_KEY);
    if (raw) return { ...DEFAULT_COLORS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_COLORS };
}

export function saveColors(c: GraphColors) {
  try {
    localStorage.setItem(COLOR_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

export function classifyNote(n: Note): NodeKind {
  const title = (n.title || '').trim();
  const folder = (n.folder || '').toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}/.test(title) || folder.includes('daily') || folder.includes('journal')) return 'daily';
  if (/^(home|index|moc|map of content)$/i.test(title) || folder.includes('index')) return 'index';
  return 'topic';
}

export function safeLabel(v: unknown, fallback = 'Untitled') {
  if (v == null) return fallback;
  const s = String(v).trim();
  return s || fallback;
}

export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function linkEnds(l: GLink) {
  const s = typeof l.source === 'object' ? l.source.id : l.source;
  const t = typeof l.target === 'object' ? l.target.id : l.target;
  return { s, t };
}

type BoardLite = { id: string; name: string };

export function buildNotesGraph(opts: {
  notes: Note[];
  boards: BoardLite[];
  gset: GraphSettings;
  focusNoteId?: string | null;
}): { nodes: GNode[]; links: GLink[] } {
  const { notes, boards, gset, focusNoteId } = opts;
  const enabled = new Set(gset.enabled?.length ? gset.enabled : DEFAULT_GSET.enabled);
  const missingKey = (title: string) => `missing:${title.trim().toLowerCase()}`;
  const all: GNode[] = [
    ...notes.map((n) => ({
      id: n.id,
      label: safeLabel(n.title),
      kind: classifyNote(n),
      degree: 0,
      inDegree: 0,
      outDegree: 0,
    })),
    ...boards.map((b) => ({
      id: `board:${b.id}`,
      label: safeLabel(b.name, 'Board'),
      kind: 'board' as const,
      degree: 0,
      inDegree: 0,
      outDegree: 0,
    })),
  ];
  const titleIndex = new Map(all.filter((n) => n.kind !== 'board').map((n) => [n.label.toLowerCase(), n.id]));
  const pendingMissing = new Map<string, GNode>();
  const rawLinks: { from: string; to: string }[] = [];
  const noteById = new Map(notes.map((n) => [n.id, n]));

  for (const n of notes) {
    for (const title of wikiLinkTitles(n.content || '')) {
      const dest = findNoteByTitle(notes, title);
      if (dest) rawLinks.push({ from: n.id, to: dest.id });
      else {
        const id = missingKey(title);
        if (!titleIndex.has(title.toLowerCase()) && !pendingMissing.has(id)) {
          pendingMissing.set(id, { id, label: title, kind: 'unresolved', degree: 0, inDegree: 0, outDegree: 0 });
        }
        rawLinks.push({ from: n.id, to: id });
      }
    }
    for (const title of wikiBoardTitles(n.content || '')) {
      const b = findBoardByName(boards, title);
      if (b) rawLinks.push({ from: n.id, to: `board:${b.id}` });
    }
  }

  if (!gset.hideUnresolved) all.push(...pendingMissing.values());
  let ns = all.filter((n) => n.kind === 'unresolved' || enabled.has(n.kind));

  const docs = new Map<string, GraphDoc>();
  for (const n of ns) {
    const note = noteById.get(n.id);
    docs.set(n.id, {
      id: n.id,
      title: n.label,
      folder: note?.folder,
      tags: note?.tags,
      content: note?.content,
      kind: n.kind,
    });
  }
  if (gset.search.trim()) ns = ns.filter((n) => matchGraphQuery(docs.get(n.id)!, gset.search));

  const idSet = new Set(ns.map((n) => n.id));
  const ls: GLink[] = [];
  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();
  for (const e of rawLinks) {
    if (!idSet.has(e.from) || !idSet.has(e.to) || e.from === e.to) continue;
    ls.push({ source: e.from, target: e.to, strength: 1 });
    outbound.set(e.from, (outbound.get(e.from) || 0) + 1);
    inbound.set(e.to, (inbound.get(e.to) || 0) + 1);
  }
  for (const n of ns) {
    n.inDegree = inbound.get(n.id) || 0;
    n.outDegree = outbound.get(n.id) || 0;
    n.degree = n.inDegree + n.outDegree;
  }
  if (!gset.showOrphans) ns = ns.filter((n) => n.degree > 0);

  const adj = new Map<string, string[]>();
  for (const l of ls) {
    const s = String(l.source);
    const t = String(l.target);
    if (!adj.has(s)) adj.set(s, []);
    if (!adj.has(t)) adj.set(t, []);
    adj.get(s)!.push(t);
    adj.get(t)!.push(s);
  }

  if (gset.mode === 'local') {
    const home = ns.find((n) => n.kind === 'index')?.id;
    const seed = focusNoteId && idSet.has(focusNoteId) ? focusNoteId : home || ns[0]?.id;
    if (seed) {
      const keep = new Set<string>([seed]);
      let frontier = [seed];
      for (let d = 0; d < Math.max(1, gset.depth); d++) {
        const next: string[] = [];
        for (const id of frontier) {
          for (const nb of adj.get(id) || []) {
            if (!keep.has(nb)) {
              keep.add(nb);
              next.push(nb);
            }
          }
        }
        frontier = next;
      }
      ns = ns.filter((n) => keep.has(n.id));
      const vis = new Set(ns.map((n) => n.id));
      return { nodes: ns, links: ls.filter((l) => vis.has(String(l.source)) && vis.has(String(l.target))) };
    }
  }

  return { nodes: ns, links: ls };
}

export function fillForNode(n: GNode, notes: Note[], colors: GraphColors, groups: ColorGroup[]) {
  const note = notes.find((x) => x.id === n.id);
  const doc: GraphDoc = {
    id: n.id,
    title: n.label,
    folder: note?.folder,
    tags: note?.tags,
    content: note?.content,
    kind: n.kind,
  };
  for (const g of groups || []) {
    if (g.query.trim() && matchGraphQuery(doc, g.query)) return g.color;
  }
  return colors[n.kind] || DEFAULT_COLORS[n.kind];
}
