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
import type { Note } from '@/lib/types';
import { findBoardByName as findBoard } from '@/lib/board-store';

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

const KIND_COLOR: Record<NodeKind, string> = {
  index: '#18181b',
  daily: '#52525b',
  topic: '#3f3f46',
  board: '#71717a',
};

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
  const [tick, setTick] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<GNode>> | null>(null);
  const nodesRef = useRef<GNode[]>([]);
  const linksRef = useRef<GLink[]>([]);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [size, setSize] = useState({ w: 900, h: 560 });

  useEffect(() => {
    const on = () => setBoards(loadBoards());
    window.addEventListener(BOARDS_CHANGED, on);
    return () => window.removeEventListener(BOARDS_CHANGED, on);
  }, []);

  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: Math.max(320, r.width), h: Math.max(360, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { nodes, links, degree } = useMemo(() => {
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
      for (const t of wikiLinkTitles(n.content || '')) {
        const dest = findNoteByTitle(notes, t);
        if (dest && idSet.has(dest.id)) {
          ls.push({ source: n.id, target: dest.id, strength: 1 });
          bump(n.id, dest.id);
        }
      }
      for (const t of wikiBoardTitles(n.content || '')) {
        const b = findBoard(boards, t);
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
    return { nodes: ns, links: ls, degree: deg };
  }, [notes, boards]);

  useEffect(() => {
    nodesRef.current = nodes.map((n) => ({ ...n }));
    linksRef.current = links.map((l) => ({ ...l }));
    simRef.current?.stop();
    const sim = forceSimulation<GNode>(nodesRef.current)
      .force(
        'link',
        forceLink<GNode, GLink>(linksRef.current)
          .id((d) => d.id)
          .distance((l) => 80 + 40 / Math.max(1, l.strength))
          .strength(0.35),
      )
      .force('charge', forceManyBody().strength(-180))
      .force('center', forceCenter(size.w / 2, size.h / 2))
      .force(
        'collide',
        forceCollide<GNode>().radius((d) => 12 + Math.sqrt(d.degree + 1) * 6),
      )
      .alpha(0.9)
      .on('tick', () => setTick((t) => t + 1));
    simRef.current = sim;
    return () => {
      sim.stop();
    };
  }, [nodes, links, size.w, size.h]);

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of links) {
      const s = typeof l.source === 'string' ? l.source : l.source.id;
      const t = typeof l.target === 'string' ? l.target : l.target.id;
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
    if (!node) return;
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const local = pt.matrixTransform(ctm.inverse());
    dragRef.current = { id, dx: local.x - (node.x || 0), dy: local.y - (node.y || 0) };
    node.fx = node.x;
    node.fy = node.y;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const local = pt.matrixTransform(ctm.inverse());
    const node = nodesRef.current.find((n) => n.id === dragRef.current!.id);
    if (!node) return;
    node.fx = local.x - dragRef.current.dx;
    node.fy = local.y - dragRef.current.dy;
    simRef.current?.alpha(0.3).restart();
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
      setSelectedId(id);
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

  const selectedNode = selectedId ? nodesRef.current.find((n) => n.id === selectedId) : null;
  const selectedNote = selectedId && !selectedId.startsWith('board:') ? notes.find((n) => n.id === selectedId) : null;

  // silence unused tick (drives re-render)
  void tick;
  void degree;

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-200/70 bg-zinc-50/80 film-grain">
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap gap-2">
        {(Object.keys(KIND_COLOR) as NodeKind[]).map((k) => (
          <span
            key={k}
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200/80 bg-white/90 px-2 py-0.5 text-[10px] font-medium text-zinc-600 shadow-sm"
          >
            <span className="h-2 w-2 rounded-full" style={{ background: KIND_COLOR[k] }} />
            {KIND_LABEL[k]}
          </span>
        ))}
      </div>

      <svg
        ref={svgRef}
        className="h-full w-full touch-none"
        viewBox={`0 0 ${size.w} ${size.h}`}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <defs>
          <filter id="hubGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#18181b" floodOpacity="0.25" />
          </filter>
        </defs>

        {linksRef.current.map((l, i) => {
          const s = typeof l.source === 'object' ? l.source : nodesRef.current.find((n) => n.id === l.source);
          const t = typeof l.target === 'object' ? l.target : nodesRef.current.find((n) => n.id === l.target);
          if (!s || !t || s.x == null || t.x == null) return null;
          const midX = (s.x! + t.x!) / 2;
          const midY = (s.y! + t.y!) / 2 - 18;
          const sId = s.id;
          const tId = t.id;
          const active =
            !focusId || focusId === sId || focusId === tId || neighbors.get(focusId)?.has(sId) || neighbors.get(focusId)?.has(tId);
          const dim = focusId && !active;
          return (
            <path
              key={i}
              d={`M ${s.x} ${s.y} Q ${midX} ${midY} ${t.x} ${t.y}`}
              fill="none"
              stroke={dim ? 'rgba(24,24,27,0.04)' : 'rgba(24,24,27,0.22)'}
              strokeWidth={dim ? 0.8 : 1.4 + Math.min(2, l.strength)}
              strokeOpacity={dim ? 0.35 : 1}
            />
          );
        })}

        {nodesRef.current.map((n) => {
          if (n.x == null || n.y == null) return null;
          const r = 8 + Math.sqrt(n.degree + 1) * 3.2;
          const isFocus = focusId === n.id;
          const isNeighbor = focusId ? neighbors.get(focusId)?.has(n.id) : false;
          const dim = focusId && !isFocus && !isNeighbor;
          const fill = KIND_COLOR[n.kind];
          return (
            <g
              key={n.id}
              transform={`translate(${n.x},${n.y})`}
              className="cursor-pointer"
              opacity={dim ? 0.22 : 1}
              filter={n.degree >= 3 ? 'url(#hubGlow)' : undefined}
              onPointerEnter={() => setHoverId(n.id)}
              onPointerLeave={() => setHoverId((h) => (h === n.id ? null : h))}
              onPointerDown={(e) => onPointerDown(e, n.id)}
              onClick={() => openNode(n.id)}
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
                  stroke={isFocus ? '#fff' : 'rgba(255,255,255,0.5)'}
                  strokeWidth={isFocus ? 2 : 1}
                />
              ) : (
                <circle
                  r={r}
                  fill={fill}
                  stroke={isFocus ? '#fff' : 'rgba(255,255,255,0.45)'}
                  strokeWidth={isFocus ? 2.5 : 1}
                />
              )}
              <text
                y={r + 12}
                textAnchor="middle"
                fontSize={11}
                fill={dim ? '#a1a1aa' : '#3f3f46'}
                style={{ userSelect: 'none', fontFamily: 'Outfit, system-ui, sans-serif' }}
              >
                {n.label.length > 18 ? `${n.label.slice(0, 16)}…` : n.label}
              </text>
            </g>
          );
        })}
      </svg>

      {selectedNode && (
        <div className="absolute bottom-3 left-3 right-3 z-10 mx-auto max-w-sm rounded-2xl border border-zinc-200/80 bg-white/95 p-3 shadow-lg backdrop-blur-sm sm:left-auto sm:right-3 sm:mx-0">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOR[selectedNode.kind] }} />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                {KIND_LABEL[selectedNode.kind]}
              </span>
            </div>
            <button
              type="button"
              className="text-xs text-zinc-400 hover:text-zinc-700"
              onClick={() => setSelectedId(null)}
            >
              Close
            </button>
          </div>
          <p className="text-sm font-semibold text-zinc-900">{selectedNode.label}</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {selectedNode.degree} connection{selectedNode.degree === 1 ? '' : 's'}
            {selectedNote?.folder ? ` · ${selectedNote.folder}` : ''}
          </p>
          {selectedNote?.content && (
            <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-zinc-600">
              {selectedNote.content.replace(/[#>*`\[\]]/g, '').slice(0, 160)}
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
