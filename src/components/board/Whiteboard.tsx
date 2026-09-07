import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Tldraw,
  DefaultColorStyle,
  DefaultSizeStyle,
  type Editor,
  type TLComponents,
  type TLUiOverrides,
} from 'tldraw';
import 'tldraw/tldraw.css';
import { TableShapeUtil } from './shapes/TableShape';
import { ChartShapeUtil } from './shapes/ChartShape';
import { emptyBoard, findBoardByName, loadBoards, persistBoards } from '@/lib/board-store';
import type { Note } from '@/lib/types';
import { LayoutGrid, Plus, Table2, PieChart, Grid3x3, CircleDot, Square } from 'lucide-react';

const customShapeUtils = [TableShapeUtil, ChartShapeUtil];
const STORAGE_PREFIX = 'epicure:tldraw:';

type BgMode = 'dots' | 'grid' | 'plain';

function bgCss(mode: BgMode) {
  if (mode === 'plain') return { background: '#f4f4f5' };
  if (mode === 'grid') {
    return {
      backgroundColor: '#f4f4f5',
      backgroundImage:
        'linear-gradient(to right, rgba(24,24,27,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(24,24,27,0.06) 1px, transparent 1px)',
      backgroundSize: '24px 24px',
    };
  }
  return {
    backgroundColor: '#f4f4f5',
    backgroundImage: 'radial-gradient(rgba(24,24,27,0.14) 1px, transparent 1px)',
    backgroundSize: '18px 18px',
  };
}

const components: TLComponents = {
  // keep default UI; style via CSS wrapper
};

export default function Whiteboard({
  notes,
  openNoteTitle,
  onOpenNote,
}: {
  notes: Note[];
  openNoteTitle?: string | null;
  onOpenNote?: (title: string) => void;
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
    window.addEventListener('epicure-boards-changed', onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('epicure-boards-changed', onChange);
    };
  }, []);

  const persistenceKey = active ? `${STORAGE_PREFIX}${active.id}` : `${STORAGE_PREFIX}default`;

  const onMount = useCallback(
    (ed: Editor) => {
      setEditor(ed);
      // monochrome defaults to match site
      ed.setStyleForNextShapes(DefaultColorStyle, 'black');
      ed.setStyleForNextShapes(DefaultSizeStyle, 'm');
      // load snapshot if present
      try {
        const raw = localStorage.getItem(persistenceKey);
        if (raw) {
          const snap = JSON.parse(raw);
          ed.loadSnapshot(snap);
        }
      } catch {
        /* empty board */
      }
      const save = () => {
        try {
          const snap = ed.getSnapshot();
          localStorage.setItem(persistenceKey, JSON.stringify(snap));
          // also touch board meta
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
    editor.createShape({
      type: 'table',
      x: editor.getViewportPageBounds().center.x - 160,
      y: editor.getViewportPageBounds().center.y - 80,
    });
  };

  const insertChart = (kind: 'bar' | 'line' | 'pie') => {
    if (!editor) return;
    editor.createShape({
      type: 'chart',
      x: editor.getViewportPageBounds().center.x - 180,
      y: editor.getViewportPageBounds().center.y - 120,
      props: {
        w: 360,
        h: 240,
        kind,
        title: kind === 'pie' ? 'Distribution' : kind === 'line' ? 'Trend' : 'Bars',
        data: JSON.stringify([
          { label: 'Mon', value: 4 },
          { label: 'Tue', value: 7 },
          { label: 'Wed', value: 3 },
          { label: 'Thu', value: 9 },
          { label: 'Fri', value: 6 },
        ]),
      },
    });
  };

  // optional note open from parent
  useEffect(() => {
    if (!openNoteTitle) return;
    const found = findBoardByName(openNoteTitle);
    if (found) setActiveId(found.id);
  }, [openNoteTitle]);

  const overrides: TLUiOverrides = useMemo(
    () => ({
      tools(editor, tools) {
        return tools;
      },
    }),
    [],
  );

  return (
    <div className="flex h-[calc(100vh-11rem)] min-h-[480px] flex-col gap-2">
      <div className="glass flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2">
        <LayoutGrid className="h-4 w-4 text-zinc-500" />
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
        <div className="flex items-center gap-1 rounded-xl bg-white/70 p-0.5">
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
          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200/80 bg-white/70 px-2 py-1 text-xs text-zinc-700 hover:bg-white"
          title="Insert table"
        >
          <Table2 className="h-3.5 w-3.5" /> Table
        </button>
        <button
          type="button"
          onClick={() => insertChart('bar')}
          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200/80 bg-white/70 px-2 py-1 text-xs text-zinc-700 hover:bg-white"
          title="Insert chart"
        >
          <PieChart className="h-3.5 w-3.5" /> Chart
        </button>
        <div className="hidden text-[10px] text-zinc-400 sm:block">
          Draw · shapes · pen · RGB colors · images via paste/drop
        </div>
      </div>

      <div
        className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-zinc-200/60 film-grain"
        style={bgCss(bg)}
      >
        <div className="epicure-tldraw absolute inset-0">
          <Tldraw
            key={persistenceKey}
            shapeUtils={customShapeUtils}
            components={components}
            overrides={overrides}
            onMount={onMount}
            inferDarkMode={false}
          />
        </div>
      </div>

      {/* keep notes prop used to avoid lint noise if parent expects it */}
      <span className="sr-only">{notes.length} notes linked</span>
      {onOpenNote ? null : null}
    </div>
  );
}
