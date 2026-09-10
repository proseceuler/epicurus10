import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import { loadBoards, BOARDS_CHANGED, findBoardByName } from '@/lib/board-store';
import { wikiBoardTitles, wikiLinkTitles, findNoteByTitle } from '@/lib/wiki';
import type { Note } from '@/lib/types';
import { Palette } from 'lucide-react';

type NodeKind = 'index' | 'daily' | 'topic' | 'board';

type GNode = SimulationNodeDatum & {
  id: string;
  label: string;
  kind: NodeKind;
  degree: number;
  inDegree: number;
  outDegree: number;
};

type GLink = SimulationLinkDatum<GNode> & {
  source: string | GNode;
  target: string | GNode;
  strength: number;
};

type GraphColors = Record<NodeKind, string>;
type Cam = { x: number; y: number; k: number };

const DEFAULT_COLORS: GraphColors = {
  index: '#18181b',
  daily: '#2563eb',
  topic: '#3f3f46',
  board: '#c2410c',
};

const COLOR_KEY = 'epicure:graph-colors';
const GRAPH_SETTINGS_KEY = 'epicure:graph-settings:v2';

type GraphSettings = {
  bg: 'plain' | 'dots' | 'grid';
  center: number;
  charge: number;
  linkForce: number;
  linkDist: number;
  showLabels: boolean;
  enabled: NodeKind[];
};

const DEFAULT_GSET: GraphSettings = {
  bg: 'plain',
  center: 0.32,
  charge: -180,
  linkForce: 0.45,
  linkDist: 96,
  showLabels: true,
  enabled: ['index', 'daily', 'topic', 'board'],
};

function loadGraphSettings(): GraphSettings {
  try {
    const raw = localStorage.getItem(GRAPH_SETTINGS_KEY) || localStorage.getItem('epicure:graph-settings:v1');
    if (raw) return { ...DEFAULT_GSET, ...JSON.parse(raw) };
  } catch {
    /* */
  }
  return { ...DEFAULT_GSET };
}

function loadColors(): GraphColors {
  try {
    const raw = localStorage.getItem(COLOR_KEY);
    if (raw) return { ...DEFAULT_COLORS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_COLORS };
}

function saveColors(c: GraphColors) {
  try {
    localStorage.setItem(COLOR_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

function classifyNote(n: Note): NodeKind {
  const title = (n.title || '').trim();
  const folder = (n.folder || '').toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}/.test(title) || folder.includes('daily') || folder.includes('journal')) {
    return 'daily';
  }
  if (/^(home|index|moc|map of content)$/i.test(title) || folder.includes('index')) {
    return 'index';
  }
  return 'topic';
}

const KIND_LABEL: Record<NodeKind, string> = {
  index: 'Index',
  daily: 'Daily',
  topic: 'Topic',
  board: 'Board',
};

function safeLabel(v: unknown, fallback = 'Untitled') {
  if (v == null) return fallback;
  const s = String(v).trim();
  return s || fallback;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function linkEnds(l: GLink) {
  const s = typeof l.source === 'object' ? l.source.id : l.source;
  const t = typeof l.target === 'object' ? l.target.id : l.target;
  return { s, t };
}

export default function NotesGraph({
  notes,
  onOpenNote,
  onOpenBoard,
}: {
  notes: Note[];
  onOpenNote: (n: Note) => void;
  onOpenBoard: (name: string) => void;
}) {
  const [boards, setBoards] = useState(() => (typeof window === 'undefined' ? [] : loadBoards()));
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [colors, setColors] = useState<GraphColors>(() =>
    typeof window === 'undefined' ? DEFAULT_COLORS : loadColors(),
  );
  const [colorOpen, setColorOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [gset, setGset] = useState<GraphSettings>(() =>
    typeof window === 'undefined' ? DEFAULT_GSET : loadGraphSettings(),
  );
  const persistGset = (next: GraphSettings) => {
    setGset(next);
    try {
      localStorage.setItem(GRAPH_SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* */
    }
  };
  const [, setTick] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<GNode>> | null>(null);
  const nodesRef = useRef<GNode[]>([]);
  const linksRef = useRef<GLink[]>([]);
  const dragRef = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const lastDragMoved = useRef(false);
  const panRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const sizeRef = useRef({ w: 900, h: 560 });
  const camRef = useRef<Cam>({ x: 0, y: 0, k: 1 });
  const fittedRef = useRef(false);
  const [size, setSize] = useState({ w: 900, h: 560 });
  const [cam, setCam] = useState<Cam>({ x: 0, y: 0, k: 1 });

  const enabled = new Set(gset.enabled?.length ? gset.enabled : DEFAULT_GSET.enabled);

  useEffect(() => {
    const on = () => setBoards(loadBoards());
    window.addEventListener(BOARDS_CHANGED, on);
    return () => window.removeEventListener(BOARDS_CHANGED, on);
  }, []);

  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    let t: number | null = null;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => {
        const next = { w: Math.max(320, Math.round(r.width)), h: Math.max(360, Math.round(r.height)) };
        const prev = sizeRef.current;
        if (Math.abs(prev.w - next.w) < 40 && Math.abs(prev.h - next.h) < 40) return;
        sizeRef.current = next;
        setSize(next);
      }, 180);
    });
    ro.observe(el);
    return () => {
      if (t) window.clearTimeout(t);
      ro.disconnect();
    };
  }, []);

  const topologyKey = useMemo(() => {
    const noteIds = notes.map((n) => n.id).join(',');
    const boardIds = boards.map((b) => b.id).join(',');
    return `${noteIds}|${boardIds}|${notes.map((n) => (n.content || '').length).join(',')}`;
  }, [notes, boards]);

  const { nodes, links } = useMemo(() => {
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
    const ns = all.filter((n) => enabled.has(n.kind));
    const idSet = new Set(ns.map((n) => n.id));
    const ls: GLink[] = [];
    const inbound = new Map<string, number>();
    const outbound = new Map<string, number>();
    const bump = (from: string, to: string) => {
      outbound.set(from, (outbound.get(from) || 0) + 1);
      inbound.set(to, (inbound.get(to) || 0) + 1);
    };
    const addEdge = (from: string, to: string) => {
      if (!idSet.has(from) || !idSet.has(to) || from === to) return;
      ls.push({ source: from, target: to, strength: 1 });
      bump(from, to);
    };
    for (const n of notes) {
      for (const title of wikiLinkTitles(n.content || '')) {
        const dest = findNoteByTitle(notes, title);
        if (dest) addEdge(n.id, dest.id);
      }
      for (const title of wikiBoardTitles(n.content || '')) {
        const b = findBoardByName(boards, title);
        if (b) addEdge(n.id, `board:${b.id}`);
      }
    }
    for (const n of ns) {
      n.inDegree = inbound.get(n.id) || 0;
      n.outDegree = outbound.get(n.id) || 0;
      n.degree = n.inDegree + n.outDegree;
    }
    return { nodes: ns, links: ls };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topologyKey, gset.enabled.join('|')]);

  const applyForces = useCallback(
    (sim: ReturnType<typeof forceSimulation<GNode>>) => {
      const { w, h } = sizeRef.current;
      sim
        .force(
          'link',
          forceLink<GNode, GLink>(linksRef.current)
            .id((d) => d.id)
            .distance(gset.linkDist)
            .strength(gset.linkForce),
        )
        .force('charge', forceManyBody().strength(gset.charge))
        .force('center', forceCenter(w / 2, h / 2).strength(gset.center))
        .force(
          'collide',
          forceCollide<GNode>().radius((d) => 10 + Math.log1p(d.inDegree) * 6),
        );
    },
    [gset.center, gset.charge, gset.linkForce, gset.linkDist],
  );

  useEffect(() => {
    const prev = new Map(nodesRef.current.map((n) => [n.id, n]));
    nodesRef.current = nodes.map((n) => {
      const p = prev.get(n.id);
      if (!p) return { ...n };
      return { ...n, x: p.x, y: p.y, vx: p.vx, vy: p.vy, fx: p.fx, fy: p.fy };
    });
    linksRef.current = links.map((l) => ({ ...l }));
    simRef.current?.stop();
    fittedRef.current = false;
    const sim = forceSimulation<GNode>(nodesRef.current).alpha(0.9).on('tick', () => {
      if (!fittedRef.current && sim.alpha() < 0.3) {
        fittedRef.current = true;
        fitToContent();
      }
      setTick((x) => x + 1);
    });
    applyForces(sim);
    simRef.current = sim;
    return () => {
      sim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, links]);

  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    applyForces(sim);
    sim.alpha(0.45).restart();
  }, [applyForces, size.w, size.h]);

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of links) {
      const { s, t } = linkEnds(l);
      if (!m.has(s)) m.set(s, new Set());
      if (!m.has(t)) m.set(t, new Set());
      m.get(s)!.add(t);
      m.get(t)!.add(s);
    }
    return m;
  }, [links]);

  const incomingOf = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const l of links) {
      const { s, t } = linkEnds(l);
      if (!m.has(t)) m.set(t, []);
      m.get(t)!.push(s);
    }
    return m;
  }, [links]);

  const outgoingOf = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const l of links) {
      const { s, t } = linkEnds(l);
      if (!m.has(s)) m.set(s, []);
      m.get(s)!.push(t);
    }
    return m;
  }, [links]);

  const focusId = hoverId || selectedId;

  const clientToLocal = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  };

  const localToWorld = (lx: number, ly: number, c = camRef.current) => ({
    x: (lx - c.x) / c.k,
    y: (ly - c.y) / c.k,
  });

  const setCamera = (next: Cam) => {
    camRef.current = next;
    setCam(next);
  };

  const fitToContent = () => {
    const list = nodesRef.current.filter((n) => n.x != null && n.y != null);
    const { w, h } = sizeRef.current;
    if (!list.length || w < 10 || h < 10) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of list) {
      const r = 18 + Math.log1p(n.inDegree) * 6;
      minX = Math.min(minX, (n.x || 0) - r);
      minY = Math.min(minY, (n.y || 0) - r);
      maxX = Math.max(maxX, (n.x || 0) + r);
      maxY = Math.max(maxY, (n.y || 0) + r + 16);
    }
    const gw = Math.max(maxX - minX, 80);
    const gh = Math.max(maxY - minY, 80);
    const k = clamp(0.84 * Math.min(w / gw, h / gh), 0.28, 2.4);
    setCamera({
      k,
      x: w / 2 - k * ((minX + maxX) / 2),
      y: h / 2 - k * ((minY + maxY) / 2),
    });
  };

  const onPointerDownNode = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return;
    const local = clientToLocal(e.clientX, e.clientY);
    const world = localToWorld(local.x, local.y);
    dragRef.current = { id, dx: world.x - (node.x || 0), dy: world.y - (node.y || 0), moved: false };
    node.fx = node.x;
    node.fy = node.y;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const local = clientToLocal(e.clientX, e.clientY);
    if (dragRef.current) {
      const world = localToWorld(local.x, local.y);
      const node = nodesRef.current.find((n) => n.id === dragRef.current!.id);
      if (!node) return;
      const nx = world.x - dragRef.current.dx;
      const ny = world.y - dragRef.current.dy;
      if (Math.hypot(nx - (node.fx || 0), ny - (node.fy || 0)) > 2) dragRef.current.moved = true;
      node.fx = nx;
      node.fy = ny;
      simRef.current?.alpha(0.22).restart();
      return;
    }
    if (panRef.current) {
      setCamera({
        ...camRef.current,
        x: panRef.current.cx + (local.x - panRef.current.x),
        y: panRef.current.cy + (local.y - panRef.current.y),
      });
    }
  };

  const onPointerUp = () => {
    lastDragMoved.current = Boolean(dragRef.current?.moved);
    dragRef.current = null;
    panRef.current = null;
  };

  const onBgPointerDown = (e: React.PointerEvent) => {
    if (e.target !== svgRef.current && (e.target as Element).tagName !== 'svg') return;
    const local = clientToLocal(e.clientX, e.clientY);
    panRef.current = { x: local.x, y: local.y, cx: camRef.current.x, cy: camRef.current.y };
    setSelectedId(null);
    setColorOpen(false);
    setPanelOpen(false);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const local = clientToLocal(e.clientX, e.clientY);
    const c = camRef.current;
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    const nk = clamp(c.k * factor, 0.25, 4);
    setCamera({
      k: nk,
      x: local.x - ((local.x - c.x) * nk) / c.k,
      y: local.y - ((local.y - c.y) * nk) / c.k,
    });
  };

  const openNode = useCallback(
    (id: string) => {
      if (id.startsWith('board:')) {
        const node = nodesRef.current.find((n) => n.id === id);
        const name = safeLabel(node?.label, '');
        if (name) onOpenBoard(name);
        return;
      }
      const note = notes.find((n) => n.id === id);
      if (note) onOpenNote(note);
    },
    [notes, onOpenBoard, onOpenNote],
  );

  const setKindColor = (kind: NodeKind, hex: string) => {
    setColors((prev) => {
      const next = { ...prev, [kind]: hex };
      saveColors(next);
      return next;
    });
  };

  const toggleKind = (kind: NodeKind) => {
    const cur = new Set(gset.enabled);
    if (cur.has(kind)) {
      if (cur.size === 1) return;
      cur.delete(kind);
    } else {
      cur.add(kind);
    }
    persistGset({ ...gset, enabled: [...cur] });
  };

  const selectedNode = selectedId ? nodesRef.current.find((n) => n.id === selectedId) : null;
  const selectedNote = selectedId && !selectedId.startsWith('board:') ? notes.find((n) => n.id === selectedId) : null;
  const labelFade = clamp((cam.k - 0.4) / 0.45, 0, 1);
  const counts: Record<NodeKind, number> = { index: 0, daily: 0, topic: 0, board: 0 };
  for (const n of notes) counts[classifyNote(n)]++;
  counts.board = boards.length;
  const nameOf = (id: string) => nodesRef.current.find((n) => n.id === id)?.label || id;

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200"
      style={{
        backgroundColor: '#fafafa',
        backgroundImage:
          gset.bg === 'dots'
            ? 'radial-gradient(rgba(24,24,27,0.14) 1.1px, transparent 1.1px)'
            : gset.bg === 'grid'
              ? 'linear-gradient(to right, rgba(24,24,27,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(24,24,27,0.07) 1px, transparent 1px)'
              : 'none',
        backgroundSize: gset.bg === 'dots' ? '18px 18px' : gset.bg === 'grid' ? '24px 24px' : undefined,
      }}
    >
      <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
        {(Object.keys(KIND_LABEL) as NodeKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => toggleKind(k)}
            className={`inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-600 shadow-sm ${
              enabled.has(k) ? '' : 'opacity-35'
            }`}
            title={`Toggle ${KIND_LABEL[k]}`}
          >
            <span
              className={k === 'board' ? 'h-2.5 w-2.5 rotate-45 rounded-[1px]' : 'h-2.5 w-2.5 rounded-full'}
              style={{ background: colors[k] }}
            />
            {KIND_LABEL[k]} {counts[k]}
          </button>
        ))}
        <button type="button" onClick={() => { setPanelOpen((v) => !v); setColorOpen(false); }} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-600 shadow-sm hover:bg-zinc-50" title="Graph settings">Settings</button>
        <button type="button" onClick={() => { setColorOpen((v) => !v); setPanelOpen(false); }} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-600 shadow-sm hover:bg-zinc-50" title="Customize colors"><Palette className="h-3 w-3" /> Colors</button>
        <button type="button" onClick={() => fitToContent()} className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-600 shadow-sm hover:bg-zinc-50">Fit</button>
      </div>

      {colorOpen && (
        <div className="absolute left-3 top-12 z-20 w-56 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-[11px] font-semibold text-zinc-700">Node colors</p>
          {(Object.keys(KIND_LABEL) as NodeKind[]).map((k) => (
            <label key={k} className="mb-2 flex items-center justify-between gap-2 text-xs text-zinc-600">
              <span>{KIND_LABEL[k]}</span>
              <input type="color" value={colors[k]} onChange={(e) => setKindColor(k, e.target.value)} className="h-7 w-10 cursor-pointer rounded border border-zinc-200 bg-transparent p-0" />
            </label>
          ))}
          <button type="button" className="mt-1 w-full rounded-lg bg-zinc-100 py-1 text-[11px] text-zinc-600 hover:bg-zinc-200" onClick={() => { setColors(DEFAULT_COLORS); saveColors(DEFAULT_COLORS); }}>Reset defaults</button>
        </div>
      )}

      <p className="pointer-events-none absolute right-3 top-3 z-10 text-[10px] text-zinc-400">Drag to move \u00b7 scroll to zoom \u00b7 double-click to open</p>

      {panelOpen && (
        <div className="absolute left-3 top-12 z-20 w-60 space-y-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-zinc-700">Forces</p>
            <button type="button" className="text-[10px] text-zinc-500 hover:text-zinc-800" onClick={() => persistGset({ ...DEFAULT_GSET, bg: gset.bg, enabled: gset.enabled, showLabels: gset.showLabels })}>Reset</button>
          </div>
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-400">Background</p>
            <div className="flex gap-1">
              {(['plain', 'dots', 'grid'] as const).map((b) => (
                <button key={b} type="button" onClick={() => persistGset({ ...gset, bg: b })} className={`rounded-md px-2 py-1 text-[10px] capitalize ${gset.bg === b ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'}`}>{b}</button>
              ))}
            </div>
          </div>
          <label className="block text-[10px] text-zinc-500">Center ({gset.center.toFixed(2)})<input type="range" min={0} max={1} step={0.02} value={gset.center} onChange={(e) => persistGset({ ...gset, center: Number(e.target.value) })} className="mt-1 w-full" /></label>
          <label className="block text-[10px] text-zinc-500">Repel ({gset.charge})<input type="range" min={-500} max={-40} value={gset.charge} onChange={(e) => persistGset({ ...gset, charge: Number(e.target.value) })} className="mt-1 w-full" /></label>
          <label className="block text-[10px] text-zinc-500">Link force ({gset.linkForce.toFixed(2)})<input type="range" min={0.05} max={1} step={0.05} value={gset.linkForce} onChange={(e) => persistGset({ ...gset, linkForce: Number(e.target.value) })} className="mt-1 w-full" /></label>
          <label className="block text-[10px] text-zinc-500">Link distance ({gset.linkDist})<input type="range" min={40} max={240} value={gset.linkDist} onChange={(e) => persistGset({ ...gset, linkDist: Number(e.target.value) })} className="mt-1 w-full" /></label>
          <label className="flex items-center gap-2 text-[11px] text-zinc-600"><input type="checkbox" checked={gset.showLabels} onChange={(e) => persistGset({ ...gset, showLabels: e.target.checked })} />Show labels</label>
        </div>
      )}
      <svg ref={svgRef} className="h-full w-full touch-none" viewBox={`0 0 ${size.w} ${size.h}`} onPointerDown={onBgPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp} onWheel={onWheel}>
        <defs>
          <filter id="hubGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#18181b" floodOpacity="0.3" />
          </filter>
        </defs>
        <g transform={`translate(${cam.x} ${cam.y}) scale(${cam.k})`}>
          {linksRef.current.map((l, i) => {
            const s = typeof l.source === 'object' ? l.source : nodesRef.current.find((n) => n.id === l.source);
            const t = typeof l.target === 'object' ? l.target : nodesRef.current.find((n) => n.id === l.target);
            if (!s || !t || s.x == null || t.x == null) return null;
            const hot = Boolean(focusId && (focusId === s.id || focusId === t.id));
            const dim = Boolean(focusId && !hot);
            return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={dim ? 'rgba(24,24,27,0.07)' : hot ? 'rgba(24,24,27,0.72)' : 'rgba(24,24,27,0.38)'} strokeWidth={(dim ? 1 : hot ? 1.7 : 1.35) / cam.k} />;
          })}
          {nodesRef.current.map((n) => {
            if (n.x == null || n.y == null) return null;
            const r = 6 + Math.log1p(n.inDegree) * 5.4;
            const isFocus = focusId === n.id;
            const isNeighbor = focusId ? neighbors.get(focusId)?.has(n.id) : false;
            const dim = Boolean(focusId && !isFocus && !isNeighbor);
            const fill = colors[n.kind] || DEFAULT_COLORS[n.kind];
            return (
              <g key={n.id} transform={`translate(${n.x},${n.y})`} className="cursor-pointer" opacity={dim ? 0.12 : 1} filter={n.inDegree >= 2 ? 'url(#hubGlow)' : undefined} onPointerEnter={() => setHoverId(n.id)} onPointerLeave={() => setHoverId((h) => (h === n.id ? null : h))} onPointerDown={(e) => onPointerDownNode(e, n.id)} onClick={(e) => { e.stopPropagation(); if (lastDragMoved.current) return; setSelectedId(n.id); }} onDoubleClick={(e) => { e.stopPropagation(); openNode(n.id); }}>
                {n.kind === 'board' ? (
                  <rect x={-r * 0.75} y={-r * 0.75} width={r * 1.5} height={r * 1.5} rx={3} transform="rotate(45)" fill={fill} stroke={isFocus ? '#111' : 'rgba(255,255,255,0.55)'} strokeWidth={isFocus ? 2.5 : 1.2} />
                ) : (
                  <circle r={r} fill={fill} stroke={isFocus ? '#111' : 'rgba(255,255,255,0.5)'} strokeWidth={isFocus ? 2.5 : 1.2} />
                )}
                {gset.showLabels && (
                  <text y={r + 13} textAnchor="middle" fontSize={11} fill={dim ? '#a1a1aa' : '#18181b'} opacity={dim ? labelFade * 0.2 : Math.max(labelFade, isFocus || isNeighbor ? 0.85 : 0)} style={{ userSelect: 'none', fontFamily: 'Outfit, system-ui, sans-serif' }}>{n.label}</text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {selectedNode && (
        <div className="absolute bottom-3 left-3 right-3 z-10 mx-auto max-w-sm rounded-2xl border border-zinc-200 bg-white p-3 shadow-lg sm:left-auto sm:right-3 sm:mx-0">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={selectedNode.kind === 'board' ? 'h-2.5 w-2.5 rotate-45 rounded-[1px]' : 'h-2.5 w-2.5 rounded-full'} style={{ background: colors[selectedNode.kind] }} />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{KIND_LABEL[selectedNode.kind]}</span>
            </div>
            <button type="button" className="text-xs text-zinc-400 hover:text-zinc-700" onClick={() => setSelectedId(null)}>Close</button>
          </div>
          <p className="text-sm font-semibold text-zinc-900">{selectedNode.label}</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">{selectedNode.inDegree} incoming \u00b7 {selectedNode.outDegree} outgoing{selectedNote?.folder ? ` \u00b7 ${selectedNote.folder}` : ''}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-zinc-600">
            <div>
              <p className="font-semibold text-zinc-800">Incoming</p>
              <ul className="mt-0.5 space-y-0.5">
                {(incomingOf.get(selectedNode.id) || []).length === 0 && <li className="text-zinc-400">None</li>}
                {(incomingOf.get(selectedNode.id) || []).slice(0, 6).map((id) => <li key={id} className="truncate">{nameOf(id)}</li>)}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-zinc-800">Outgoing</p>
              <ul className="mt-0.5 space-y-0.5">
                {(outgoingOf.get(selectedNode.id) || []).length === 0 && <li className="text-zinc-400">None</li>}
                {(outgoingOf.get(selectedNode.id) || []).slice(0, 6).map((id) => <li key={id} className="truncate">{nameOf(id)}</li>)}
              </ul>
            </div>
          </div>
          <button type="button" className="mt-2 w-full rounded-xl bg-zinc-900 py-1.5 text-xs font-medium text-white" onClick={() => openNode(selectedNode.id)}>Open {selectedNode.kind === 'board' ? 'board' : 'note'}</button>
        </div>
      )}
    </div>
  );
}
