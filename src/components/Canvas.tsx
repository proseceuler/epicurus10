import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Tldraw,
  createTLStore,
  defaultShapeUtils,
  DefaultColorStyle,
  DefaultSizeStyle,
  loadSnapshot,
  getSnapshot,
  type Editor,
  type TLStore,
} from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import { supabase } from '@/lib/supabase';
import { Check, Pen, Eraser, Type, Square, Circle, Triangle, ArrowLeft, Grid3x3, Dot, Play as Plain } from 'lucide-react';

type BgMode = 'plain' | 'dotted' | 'grid';

const BG_NONE = 10;
const BG_DOTS = 16;
const BG_GRID = 24;

const PRESET_COLOR_NAMES = [
  'black', 'blue', 'red', 'green', 'yellow', 'purple', 'pink', 'grey',
] as const;

const SIZE_VALUES = ['s', 'm', 'l', 'xl'] as const;

export default function Canvas() {
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [bgMode, setBgMode] = useState<BgMode>('plain');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [store] = useState<TLStore>(() => createTLStore({ shapeUtils: defaultShapeUtils }));

  const recordId = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);

  const applyBgMode = useCallback((ed: Editor, mode: BgMode) => {
    const gridSize = mode === 'dotted' ? BG_DOTS : mode === 'grid' ? BG_GRID : BG_NONE;
    ed.updateDocumentSettings({ gridSize });
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('whiteboard').select('*').maybeSingle();
      if (data) {
        recordId.current = data.id;
        try {
          const parsed = JSON.parse(data.content || '');
          if (parsed && typeof parsed === 'object' && parsed.schema && parsed.store) {
            loadSnapshot(store, parsed);
            const docRec = Object.values(parsed.store).find(
              (r: any) => r.typeName === 'document',
            ) as any;
            if (docRec?.gridSize) {
              const gs = docRec.gridSize;
              if (gs === BG_DOTS) setBgMode('dotted');
              else if (gs === BG_GRID) setBgMode('grid');
              else setBgMode('plain');
            }
          }
        } catch {
          /* old stroke data or empty — start blank */
        }
      }
      setLoading(false);
    })();
  }, [store]);

  const save = useCallback((snapshot: string) => {
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (recordId.current) {
        await supabase
          .from('whiteboard')
          .update({ content: snapshot, updated_at: new Date().toISOString() })
          .eq('id', recordId.current);
      } else {
        const { data } = await supabase
          .from('whiteboard')
          .insert({ content: snapshot })
          .select()
          .single();
        if (data) recordId.current = data.id;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 800);
  }, []);

  const handleMount = useCallback(
    (ed: Editor) => {
      setEditor(ed);
      applyBgMode(ed, bgMode);
      loadedRef.current = true;

      ed.store.listen(
        () => {
          if (!loadedRef.current) return;
          const snap = getSnapshot(ed.store);
          save(JSON.stringify(snap));
        },
        { source: 'user', scope: 'document' },
      );
    },
    [save, bgMode, applyBgMode],
  );

  const switchBg = (mode: BgMode) => {
    setBgMode(mode);
    if (editor) applyBgMode(editor, mode);
  };

  const setTool = (tool: string) => editor?.setCurrentTool(tool);
  const undo = () => editor?.undo();
  const redo = () => editor?.redo();
  const clearAll = () => {
    if (!editor) return;
    editor.deleteShapes(Array.from(editor.getCurrentPageShapeIds()));
  };

  const setStyleColor = (colorName: string) => {
    if (!editor) return;
    editor.setStyleForNextShapes(DefaultColorStyle, colorName as any, { history: 'ignore' });
  };

  const setStrokeWidth = (w: number) => {
    if (!editor) return;
    const idx = Math.min(Math.floor(w / 2), SIZE_VALUES.length - 1);
    editor.setStyleForNextShapes(DefaultSizeStyle, SIZE_VALUES[idx] as any, { history: 'ignore' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Pen className="w-8 h-8 text-zinc-300 animate-pulse" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {/* Tools */}
        <div className="flex items-center gap-0.5 p-1 glass rounded-xl">
          <ToolBtn icon={Pen} label="Draw" active={false} onClick={() => setTool('draw')} />
          <ToolBtn icon={Eraser} label="Erase" active={false} onClick={() => setTool('eraser')} />
          <ToolBtn icon={Type} label="Text" active={false} onClick={() => setTool('text')} />
          <ToolBtn icon={Square} label="Rectangle" active={false} onClick={() => setTool('rectangle')} />
          <ToolBtn icon={Circle} label="Ellipse" active={false} onClick={() => setTool('ellipse')} />
          <ToolBtn icon={Triangle} label="Triangle" active={false} onClick={() => setTool('triangle')} />
          <ToolBtn icon={ArrowLeft} label="Arrow" active={false} onClick={() => setTool('arrow')} />
        </div>

        {/* Color picker */}
        <div className="flex items-center gap-1.5 p-1.5 glass rounded-xl">
          {PRESET_COLOR_NAMES.map((c) => (
            <button
              key={c}
              onClick={() => setStyleColor(c)}
              className="w-6 h-6 rounded-full transition-all hover:scale-110 ring-offset-1"
              style={{ backgroundColor: `var(--color-${c})` }}
              title={c}
            />
          ))}
        </div>

        {/* Stroke width */}
        <div className="flex items-center gap-2 p-1.5 glass rounded-xl">
          <input
            type="range"
            min={1}
            max={8}
            step={1}
            defaultValue={2}
            onChange={(e) => setStrokeWidth(parseInt(e.target.value))}
            className="w-20 accent-zinc-800"
          />
        </div>

        {/* Background switcher */}
        <div className="flex items-center gap-0.5 p-1 glass rounded-xl">
          <ToolBtn icon={Plain} label="Plain" active={bgMode === 'plain'} onClick={() => switchBg('plain')} />
          <ToolBtn icon={Dot} label="Dotted" active={bgMode === 'dotted'} onClick={() => switchBg('dotted')} />
          <ToolBtn icon={Grid3x3} label="Grid" active={bgMode === 'grid'} onClick={() => switchBg('grid')} />
        </div>

        {/* Undo/Redo/Clear */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={undo}
            className="p-2 rounded-lg glass glass-hover text-zinc-600 disabled:opacity-40"
            title="Undo"
          >
            <ArrowLeft className="w-4 h-4 rotate-180" />
          </button>
          <button
            onClick={redo}
            className="p-2 rounded-lg glass glass-hover text-zinc-600 disabled:opacity-40"
            title="Redo"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={clearAll}
            className="p-2 rounded-lg glass glass-hover text-zinc-600"
            title="Clear all"
          >
            <Eraser className="w-4 h-4" />
          </button>
        </div>

        {/* Save indicator */}
        <div className="flex items-center gap-1.5 text-sm ml-auto">
          {saved ? (
            <span className="flex items-center gap-1 text-zinc-700 font-medium">
              <Check className="w-4 h-4" /> Saved
            </span>
          ) : (
            <span className="text-zinc-400">Auto-saving...</span>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div
        className="glass glass-shadow rounded-2xl overflow-hidden canvas-wrapper"
        style={{ height: 'calc(100vh - 220px)', minHeight: '400px' }}
      >
        <Tldraw
          store={store}
          onMount={handleMount}
          hideUi={false}
          components={{
            InFrontOfTheCanvas: () => null,
            PageMenu: () => null,
            StylePanel: () => null,
            Toolbar: () => null,
            ActionsMenu: () => null,
            MainMenu: () => null,
            ZoomMenu: () => null,
            Minimap: () => null,
            HelpMenu: () => null,
            DebugMenu: () => null,
            DebugPanel: () => null,
            SharePanel: () => null,
          }}
        />
      </div>
    </div>
  );
}

function ToolBtn({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Pen;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-2 rounded-lg transition-all ${
        active ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-700'
      }`}
      title={label}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
