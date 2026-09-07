import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Tldraw,
  defaultShapeUtils,
  DefaultSizeStyle,
  type Editor,
} from 'tldraw';
import 'tldraw/tldraw.css';
import { TableShapeUtil } from './shapes/TableShape';
import { ChartShapeUtil } from './shapes/ChartShape';
import { emptyBoard, findBoardByName, loadBoards, persistBoards } from '@/lib/board-store';
import type { Note } from '@/lib/types';
import { LayoutGrid, Plus, Table2, PieChart, Grid3x3, CircleDot, Square } from 'lucide-react';

const shapeUtils = [...defaultShapeUtils, TableShapeUtil, ChartShapeUtil];
const STORAGE_PREFIX = 'epicure:tldraw:';


type BgMode = 'dots' | 'grid' | 'plain';

function bgCss(mode: BgMode): CSSProperties {
  if (mode === 'plain') return { backgroundColor: '#f4f4f5' };
  if (mode === 'grid') {
    return {
      backgroundColor: '#f4f4f5',
      backgroundImage:
        'linear-gradient(to right, rgba(24,24,27,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(24,24,27,0.07) 1px, transparent 1px)',
      backgroundSize: '24px 24px',
    };
  }
  return {
    backgroundColor: '#f4f4f5',
    backgroundImage: 'radial-gradient(rgba(24,24,27,0.16) 1.1px, transparent 1.1px)',
    backgroundSize: '18px 18px',
  };
}

export default function Whiteboard({
  notes = [],
  openBoardName,
  onOpenNote,
  onCreateNote,
}: {
  notes?: Note[];
  openBoardName?: string | null;
  onOpenNote?: (n: Note) => void;
  onCreateNote?: (title: string) => void;
}) {
  const [boards, setBoards] = useState(() => loadBoards());
  const [activeId, setActiveId] = useState(() => loadBoards()[0]?.id || '');
  const [bg, setBg] = useState<BgMode>('dots');
  const [editor, setEditor] = useState<Editor | null>(null);

  const active = useMemo(
    () => boards.find((b) => b.id === activeId) || boards[0],
    [boards, activeId],
  );

  useEffect(() => {
    const onChange = () => setBoards(loadBoards());
    window.addEventListener('storage', onChange);
    window.addEventListener('epicure-boards-changed', onChange as EventListener);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('epicure-boards-changed', onChange as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!openBoardName) return;
    const found = findBoardByName(loadBoards(), openBoardName);
    if (found) setActiveId(found.id);
  }, [openBoardName]);

  const persistenceKey = active ? `${STORAGE_PREFIX}${active.id}` : `${STORAGE_PREFIX}default`;

  const onMount = useCallback(
    (ed: Editor) => {
      setEditor(ed);
      try {
        ed.setStyleForNextShapes(DefaultSizeStyle, 'm');
      } catch {
        /* styles optional */
      }
      try {
        const raw = localStorage.getItem(persistenceKey);
        if (raw) {
          const snap = JSON.parse(raw);
          ed.loadSnapshot(snap);
        }
      } catch {
        /* empty / corrupt */
      }
      const save = () => {
        try {
          localStorage.setItem(persistenceKey, JSON.stringify(ed.getSnapshot()));
          const list = loadBoards();
          const idx = list.findIndex((b) => b.id === active?.id);
          if (idx >= 0) {
            list[idx] = { ...list[idx], updatedAt: new Date().toISOString() };
            persistBoards(list);
          }
        } catch {
          /* quota */
        }
      };
      const unsub = ed.store.listen(save, { source: 'user', scope: 'document' });
      return () => {
        unsub();
        save();
      };
    },
    [persistenceKey, active?.id],
  );

  const addBoard = () => {
    const list = loadBoards();
    const b = emptyBoard(`Board ${list.length + 1}`);
    list.unshift(b);
    persistBoards(list);
    setBoards(list);
    setActiveId(b.id);
  };

  const insertTable = () => {
    if (!editor) return;
    const b = editor.getViewportPageBounds();
    editor.createShape({
      type: 'table',
      x: b.center.x - 180,
      y: b.center.y - 90,
    });
  };

  const [chartMenu, setChartMenu] = useState(false);

  const insertChart = (kind: string) => {
    if (!editor) return;
    const b = editor.getViewportPageBounds();
    const titles: Record<string, string> = {
      area: 'Area',
      bar: 'Bar',
      column: 'Column',
      donut: 'Donut',
      histogram: 'Histogram',
      line: 'Line',
      pie: 'Pie',
      scatter: 'Scatter',
    };
    try {
      editor.createShape({
        type: 'chart',
        x: b.center.x - 200,
        y: b.center.y - 140,
        props: {
          w: 400,
          h: 280,
          kind,
          title: titles[kind] || 'Chart',
          data: JSON.stringify(
            kind === 'scatter'
              ? [
                  { label: 'A', x: 1, y: 4 },
                  { label: 'B', x: 2, y: 7 },
                  { label: 'C', x: 3, y: 3 },
                  { label: 'D', x: 4, y: 9 },
                  { label: 'E', x: 5, y: 6 },
                ]
              : [
                  { label: 'Mon', value: 4 },
                  { label: 'Tue', value: 7 },
                  { label: 'Wed', value: 3 },
                  { label: 'Thu', value: 9 },
                  { label: 'Fri', value: 6 },
                ],
          ),
        },
      });
      editor.setCurrentTool('select');
    } catch (err) {
      console.error('insertChart failed', err);
    }
    setChartMenu(false);
  };

  void notes;
  void onOpenNote;
  void onCreateNote;

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-2 overflow-hidden">
      <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2 rounded-2xl glass px-3 py-2">
        <LayoutGrid className="h-4 w-4 shrink-0 text-zinc-500" />
        <div className="flex max-w-full flex-1 items-center gap-1 overflow-x-auto">
          {boards.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setActiveId(b.id)}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium ${
                b.id === active?.id ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              {b.name}
            </button>
          ))}
          <button
            type="button"
            onClick={addBoard}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100"
          >
            <Plus className="h-3.5 w-3.5" /> New
          </button>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-white/80 p-0.5">
          {(
            [
              { id: 'dots' as const, icon: CircleDot, label: 'Dots' },
              { id: 'grid' as const, icon: Grid3x3, label: 'Grid' },
              { id: 'plain' as const, icon: Square, label: 'Plain' },
            ] as const
          ).map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                type="button"
                title={m.label}
                onClick={() => setBg(m.id)}
                className={`rounded-lg p-1.5 ${bg === m.id ? 'bg-zinc-900 text-white' : 'text-zinc-500'}`}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={insertTable}
          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <Table2 className="h-3.5 w-3.5" /> Table
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setChartMenu((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <PieChart className="h-3.5 w-3.5" /> Chart
          </button>
          {chartMenu && (
            <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-xl">
              {(
                [
                  'area',
                  'bar',
                  'column',
                  'donut',
                  'histogram',
                  'line',
                  'pie',
                  'scatter',
                ] as const
              ).map((k) => (
                <button
                  key={k}
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-xs capitalize text-zinc-700 hover:bg-zinc-50"
                  onClick={() => insertChart(k)}
                >
                  {k}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="relative z-0 min-h-0 w-full flex-1 overflow-hidden rounded-2xl border border-zinc-200/70 shadow-sm" style={bgCss(bg)}>
        <div className="epicure-tldraw absolute inset-0 h-full w-full">
          <Tldraw
            key={persistenceKey}
            shapeUtils={shapeUtils}
            onMount={onMount}
            inferDarkMode={false}
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}
