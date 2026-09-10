import { KIND_LABEL, type NodeKind } from '@/lib/notes-graph-model';

export function GraphEmpty({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="rounded-2xl border border-zinc-200 bg-white/90 px-4 py-3 text-center shadow-sm">
        <p className="text-sm font-medium text-zinc-800">Nothing to show</p>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {hasFilter ? 'Clear filters or turn Orphans back on.' : 'Add notes and [[links]] to grow the graph.'}
        </p>
      </div>
    </div>
  );
}

export function GraphHint() {
  return (
    <p className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[70%] text-[10px] text-zinc-400">
      F fit · Esc clear · G/L mode · +/− zoom · arrows pan · double-click missing to create
    </p>
  );
}

export function GraphTooltip({
  x,
  y,
  title,
  kind,
  meta,
}: {
  x: number;
  y: number;
  title: string;
  kind: NodeKind;
  meta: string;
}) {
  return (
    <div
      className="pointer-events-none fixed z-50 max-w-xs rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] shadow-lg"
      style={{ left: x + 12, top: y + 12 }}
    >
      <p className="font-medium text-zinc-900">{title}</p>
      <p className="text-zinc-500">
        {KIND_LABEL[kind]}
        {meta ? ` · ${meta}` : ''}
      </p>
    </div>
  );
}

export function GraphStats({ nodes, links }: { nodes: number; links: number }) {
  return (
    <p className="pointer-events-none absolute right-3 bottom-3 z-10 text-[10px] text-zinc-400">
      {nodes} nodes · {links} links
    </p>
  );
}
