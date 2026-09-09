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
import { loadBoards, BOARDS_CHANGED } from '@/lib/board-store';
import { wikiBoardTitles, wikiLinkTitles, findNoteByTitle } from '@/lib/wiki';
import { findBoardByName } from '@/lib/board-store';
import type { Note } from '@/lib/types';
import { Palette } from 'lucide-react';

type NodeKind = 'index' | 'daily' | 'topic' | 'board';

type GNode = SimulationNodeDatum & {
  id: string;
  label: string;
  kind: NodeKind;
  degree: number;
};

type GLink = SimulationLinkDatum<GNode> & {
  source: string | GNode;
  target: string | GNode;
  strength: number;
};

type GraphColors = Record<NodeKind, string>;

const DEFAULT_COLORS: GraphColors = {
  index: '#18181b',
  daily: '#2563eb',
  topic: '#3f3f46',
  board: '#c2410c',
};

const COLOR_KEY = 'epicure:graph-colors';
const GRAPH_SETTINGS_KEY = 'epicure:graph-settings:v1';

type GraphSettings = {
  bg: 'plain' | 'dots' | 'grid';
  charge: number;
  linkDist: number;
  showLabels: boolean;
};

const DEFAULT_GSET: GraphSettings = {
  bg: 'plain',
  charge: -220,
  linkDist: 90,
  showLabels: true,
};

function loadGraphSettings(): GraphSettings {
  try {
    const raw = localStorage.getItem(GRAPH_SETTINGS_KEY);
    if (raw) return { ...DEFAULT_GSET, ...JSON.parse(raw) };
  } catch { /* */ }
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
    } catch { /* */ }
  };
  const [, setTick] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<GNode>> | null>(null);
  const nodesRef = useRef<GNode[]>([]);
  const linksRef = useRef<GLink[]>([]);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const sizeRef = useRef({ w: 900, h: 560 });
  const [size, setSize] = useState({ w: 900, h: 560 });

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
    const ns: GNode[] = [
      ...notes.map((n) => ({
        id: n.id,
        label: safeLabel(n.title),
        kind: classifyNote(n),
        degree: 0,
      })),
      ...boards.map((b) => ({
        id: `board:${b.id}`,
        label: safeLabel(b.name, 'Board'),
        kind: 'board' as const,
        degree: 0,
      })),
    ];
    const idSet = new Set(ns.map((n) => n.id));
    const ls: GLink[] = [];
    const deg = new Map<string, number>();
    const bump = (a: string, b: string) => {
      deg.set(a, (deg.get(a) || 0) + 1);
      deg.set(b, (deg.get(b) || 0) + 1);
    };
    for (const n of notes) {
      for (const title of wikiLinkTitles(n.content || '')) {
        const dest = findNoteByTitle(notes, title);
        if (dest && idSet.has(dest.id)) {
          ls.push({ source: n.id, target: dest.id, strength: 1 });
          bump(n.id, dest.id);
        }
      }
      for (const title of wikiBoardTitles(n.content || '')) {
        const b = findBoardByName(boards, title);
        if (b) {
          const bid = `board:${b.id}`;
          if (idSet.has(bid)) {
            ls.push({ source: n.id, target: bid, strength: 1 });
            bump(n.id, bid);
          }
        }
      }
    }
    for (const n of ns) n.degree = deg.get(n.id) || 0;
    return { nodes: ns, links: ls };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topologyKey]);

  useEffect(() => {
    const prevPos = new Map(nodesRef.current.map((n) => [n.id, { x: n.x, y: n.y }]));
    nodesRef.current = nodes.map((n) => {
      const p = prevPos.get(n.id);
      return p?.x != null ? { ...n, x: p.x, y: p.y } : { ...n };
    });
    linksRef.current = links.map((l) => ({ ...l }));
    simRef.current?.stop();
    const { w, h } = sizeRef.current;
    const sim = forceSimulation<GNode>(nodesRef.current)
      .force(
        'link',
        forceLink<GNode, GLink>(linksRef.current)
          .id((d) => d.id)
          .distance(gset.linkDist)
          .strength(0.4),
      )
      .force('charge', forceManyBody().strength(gset.charge))
      .force('center', forceCenter(w / 2, h / 2))
      .force(
        'collide',
        forceCollide<GNode>().radius((d) => 8 + Math.sqrt(d.degree + 1) * 2.4),
      )
      .alpha(0.85)
      .on('tick', () => setTick((x) => x + 1));
    simRef.current = sim;
    return () => {
      sim.stop();
    };
  }, [nodes, links]);

  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.force('center', forceCenter(size.w / 2, size.h / 2));
    sim.alpha(0.2).restart();
  }, [size.w, size.h]);

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of links) {
      const s = typeof l.source === 'string' ? l.source : (l.source as GNode).id;
      const t = typeof l.target === 'string' ? l.target : (l.target as GNode).id;
      if (!m.has(s)) m.set(s, new Set());
      if (!m.has(t)) m.set(t, new Set());
      m.get(s)!.add(t);
      m.get(t)!.add(s);
    }
    return m;
  }, [links]);

  const focusId = hoverId || selectedId;

  const onPointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node || !svgRef.current) return;
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return;
    const local = pt.matrixTransform(ctm.inverse());
    dragRef.current = { id, dx: local.x - (node.x || 0), dy: local.y - (node.y || 0) };
    node.fx = node.x;
    node.fy = node.y;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !svgRef.current) return;
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return;
    const local = pt.matrixTransform(ctm.inverse());
    const node = nodesRef.current.find((n) => n.id === dragRef.current!.id);
    if (!node) return;
    node.fx = local.x - dragRef.current.dx;
    node.fy = local.y - dragRef.current.dy;
    simRef.current?.alpha(0.25).restart();
  };

  const onPointerUp = () => {
    if (!dragRef.current) return;
    const node = nodesRef.current.find((n) => n.id === dragRef.current!.id);
    if (node) {
      node.fx = null;
      node.fy = null;
    }
    dragRef.current = null;
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

  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.force('charge', forceManyBody().strength(gset.charge));
    const lf = sim.force('link') as any;
    if (lf && typeof lf.distance === 'function') lf.distance(gset.linkDist);
    sim.alpha(0.55).restart();
  }, [gset.charge, gset.linkDist]);

  const selectedNode = selectedId ? nodesRef.current.find((n) => n.id === selectedId) : null;
  const selectedNote = selectedId && !selectedId.startsWith('board:') ? notes.find((n) => n.id === selectedId) : null;

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
          <span
            key={k}
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-600 shadow-sm"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[k] }} />
            {KIND_LABEL[k]}
          </span>
        ))}
        <button
          type="button"
          onClick={() => { setPanelOpen((v) => !v); setColorOpen(false); }}
          className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-600 shadow-sm hover:bg-zinc-50"
          title="Graph settings"
        >
          Settings
        </button>
        <button
          type="button"
          onClick={() => { setColorOpen((v) => !v); setPanelOpen(false); }}
          className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-600 shadow-sm hover:bg-zinc-50"
          title="Customize colors"
        >
          <Palette className="h-3 w-3" /> Colors
        </button>
      </div>

      {colorOpen && (
        <div className="absolute left-3 top-12 z-20 w-56 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-[11px] font-semibold text-zinc-700">Node colors</p>
          {(Object.keys(KIND_LABEL) as NodeKind[]).map((k) => (
            <label key={k} className="mb-2 flex items-center justify-between gap-2 text-xs text-zinc-600">
              <span>{KIND_LABEL[k]}</span>
              <input
                type="color"
                value={colors[k]}
                onChange={(e) => setKindColor(k, e.target.value)}
                className="h-7 w-10 cursor-pointer rounded border border-zinc-200 bg-transparent p-0"
              />
            </label>
          ))}
          <button
            type="button"
            className="mt-1 w-full rounded-lg bg-zinc-100 py-1 text-[11px] text-zinc-600 hover:bg-zinc-200"
            onClick={() => {
              setColors(DEFAULT_COLORS);
              saveColors(DEFAULT_COLORS);
            }}
          >
            Reset defaults
          </button>
        </div>
      )}

      <p className="pointer-events-none absolute right-3 top-3 z-10 text-[10px] text-zinc-400">
        Drag to move \u00b7 double-click to open
      </p>

      {panelOpen && (
        <div className="absolute left-3 top-12 z-20 w-56 space-y-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg">
          <p className="text-[11px] font-semibold text-zinc-700">Graph settings</p>
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-400">Background</p>
            <div className="flex gap-1">
              {(['plain', 'dots', 'grid'] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => persistGset({ ...gset, bg: b })}
                  className={`rounded-md px-2 py-1 text-[10px] capitalize ${gset.bg === b ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'}`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
          <label className="block text-[10px] text-zinc-500">
            Charge ({gset.charge})
            <input type="range" min={-500} max={-40} value={gset.charge} onChange={(e) => persistGset({ ...gset, charge: Number(e.target.value) })} className="mt-1 w-full" />
          </label>
          <label className="block text-[10px] text-zinc-500">
            Link distance ({gset.linkDist})
            <input type="range" min={40} max={200} value={gset.linkDist} onChange={(e) => persistGset({ ...gset, linkDist: Number(e.target.value) })} className="mt-1 w-full" />
          </label>
          <label className="flex items-center gap-2 text-[11px] text-zinc-600">
            <input type="checkbox" checked={gset.showLabels} onChange={(e) => persistGset({ ...gset, showLabels: e.target.checked })} />
            Show labels
          </label>
        </div>
      )}
      <svg
        ref={svgRef}
        className="h-full w-full touch-none"
        viewBox={`0 0 ${size.w} ${size.h}`}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onClick={() => {
          setSelectedId(null);
          setColorOpen(false);
        }}
      >
        <defs>
          <filter id="hubGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#18181b" floodOpacity="0.3" />
          </filter>
        </defs>

        {linksRef.current.map((l, i) => {
          const s = typeof l.source === 'object' ? l.source : nodesRef.current.find((n) => n.id === l.source);
          const t = typeof l.target === 'object' ? l.target : nodesRef.current.find((n) => n.id === l.target);
          if (!s || !t || s.x == null || t.x == null) return null;
          const active =
            !focusId ||
            focusId === s.id ||
            focusId === t.id ||
            neighbors.get(focusId)?.has(s.id) ||
            neighbors.get(focusId)?.has(t.id);
          const dim = Boolean(focusId && !active);
          return (
            <line
              key={i}
              x1={s.x}
              y1={s.y}
              x2={t.x}
              y2={t.y}
              stroke={dim ? 'rgba(24,24,27,0.08)' : 'rgba(24,24,27,0.42)'}
              strokeWidth={dim ? 1 : 1.4}
            />
          );
        })}

        {nodesRef.current.map((n) => {
          if (n.x == null || n.y == null) return null;
          const r = 5.5 + Math.sqrt(n.degree + 1) * 2.2;
          const isFocus = focusId === n.id;
          const isNeighbor = focusId ? neighbors.get(focusId)?.has(n.id) : false;
          const dim = Boolean(focusId && !isFocus && !isNeighbor);
          const fill = colors[n.kind] || DEFAULT_COLORS[n.kind];
          return (
            <g
              key={n.id}
              transform={`translate(${n.x},${n.y})`}
              className="cursor-pointer"
              opacity={dim ? 0.28 : 1}
              filter={n.degree >= 3 ? 'url(#hubGlow)' : undefined}
              onPointerEnter={() => setHoverId(n.id)}
              onPointerLeave={() => setHoverId((h) => (h === n.id ? null : h))}
              onPointerDown={(e) => onPointerDown(e, n.id)}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(n.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                openNode(n.id);
              }}
            >
              {n.kind === 'board' ? (
                <rect
                  x={-r * 0.75}
                  y={-r * 0.75}
                  width={r * 1.5}
                  height={r * 1.5}
                  rx={3}
                  transform="rotate(45)"
                  fill={fill}
                  stroke={isFocus ? '#fff' : 'rgba(255,255,255,0.55)'}
                  strokeWidth={isFocus ? 2.5 : 1.2}
                />
              ) : (
                <circle
                  r={r}
                  fill={fill}
                  stroke={isFocus ? '#fff' : 'rgba(255,255,255,0.5)'}
                  strokeWidth={isFocus ? 2.5 : 1.2}
                />
              )}
              {gset.showLabels && (
                <text
                  y={r + 13}
                  textAnchor="middle"
                  fontSize={11}
                  fill={dim ? '#a1a1aa' : '#18181b'}
                  style={{ userSelect: 'none', fontFamily: 'Outfit, system-ui, sans-serif' }}
                >
                  {n.label.length > 18 ? `${n.label.slice(0, 16)}\u2026` : n.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {selectedNode && (
        <div className="absolute bottom-3 left-3 right-3 z-10 mx-auto max-w-sm rounded-2xl border border-zinc-200 bg-white p-3 shadow-lg sm:left-auto sm:right-3 sm:mx-0">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[selectedNode.kind] }} />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                {KIND_LABEL[selectedNode.kind]}
              </span>
            </div>
            <button type="button" className="text-xs text-zinc-400 hover:text-zinc-700" onClick={() => setSelectedId(null)}>
              Close
            </button>
          </div>
          <p className="text-sm font-semibold text-zinc-900">{selectedNode.label}</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {selectedNode.degree} connection{selectedNode.degree === 1 ? '' : 's'}
            {selectedNote?.folder ? ` \u00b7 ${selectedNote.folder}` : ''}
          </p>
          {selectedNote?.content && (
            <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-zinc-600">
              {selectedNote.content.replace(/[#>*`$[\]]/g, '').slice(0, 160)}
            </p>
          )}
          <button
            type="button"
            className="mt-2 w-full rounded-xl bg-zinc-900 py-1.5 text-xs font-medium text-white"
            onClick={() => openNode(selectedNode.id)}
          >
            Open {selectedNode.kind === 'board' ? 'board' : 'note'}
          </button>
        </div>
      )}
    </div>
  );
}
