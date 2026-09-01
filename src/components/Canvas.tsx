import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Tldraw,
  createTLStore,
  defaultShapeUtils,
  getSnapshot,
  loadSnapshot,
  type Editor,
  type TLStore,
} from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import { supabase } from '@/lib/supabase';
import { MousePointer2, Pen, Eraser, Square, Circle, ArrowRight, Type, Undo2, Redo2, Trash2, Check, Grid3x2 as Grid3X3, SquareDot as DotSquare, Square as PlainIcon, Highlighter, ChevronDown } from 'lucide-react';

type BackgroundType = 'plain' | 'dotted' | 'grid';
type ToolId = 'select' | 'draw' | 'eraser' | 'rectangle' | 'ellipse' | 'arrow' | 'text';

interface PenPreset {
  id: string;
  label: string;
  icon: typeof Pen;
  color: string;
  width: number;
  dash: 'draw' | 'solid' | 'dashed' | 'dotted';
}

const PEN_PRESETS: PenPreset[] = [
  { id: 'thin', label: 'Thin Pen', icon: Pen, color: '#18181b', width: 2, dash: 'draw' },
  { id: 'medium', label: 'Medium Pen', icon: Pen, color: '#18181b', width: 4, dash: 'draw' },
  { id: 'thick', label: 'Thick Pen', icon: Pen, color: '#18181b', width: 8, dash: 'draw' },
  { id: 'highlighter', label: 'Highlighter', icon: Highlighter, color: '#fbbf24', width: 16, dash: 'solid' },
];

const COLOR_SWATCHES = [
  '#18181b', '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#ffffff',
];

const BG_COLORS: Record<BackgroundType, string> = {
  plain: '#fafafa',
  dotted: '#fafafa',
  grid: '#fafafa',
};

function mapWidthToSize(width: number): 's' | 'm' | 'l' | 'xl' {
  if (width <= 3) return 's';
  if (width <= 7) return 'm';
  if (width <= 14) return 'l';
  return 'xl';
}

export default function Canvas() {
  const [mounted, setMounted] = useState(false);
  const [store] = useState<TLStore>(() => createTLStore({ shapeUtils: defaultShapeUtils }));
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [background, setBackground] = useState<BackgroundType>('plain');
  const [bgColor, setBgColor] = useState('#fafafa');
  const [activeTool, setActiveTool] = useState<ToolId>('select');
  const [activePreset, setActivePreset] = useState<PenPreset>(PEN_PRESETS[1]);
  const [penColor, setPenColor] = useState('#18181b');
  const [penWidth, setPenWidth] = useState(4);
  const [penDash, setPenDash] = useState<'draw' | 'solid' | 'dashed' | 'dotted'>('draw');
  const [eraserColor, setEraserColor] = useState('#fafafa');
  const [eraserWidth, setEraserWidth] = useState(20);
  const [showPenPanel, setShowPenPanel] = useState(false);
  const [showEraserPanel, setShowEraserPanel] = useState(false);
  const [showBgPanel, setShowBgPanel] = useState(false);

  const recordId = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    (async () => {
      const { data } = await supabase.from('canvas').select('*').maybeSingle();
      if (data) {
        recordId.current = data.id;
        if (data.background) {
          const bg = data.background as BackgroundType;
          setBackground(bg);
          const c = BG_COLORS[bg] ?? '#fafafa';
          setBgColor(c);
          setEraserColor(c);
        }
        if (data.content) {
          try {
            const snapshot = JSON.parse(data.content);
            loadSnapshot(store, snapshot, { forceOverwriteSessionState: true });
          } catch { /* empty canvas */ }
        }
      }
      loadedRef.current = true;
      setLoading(false);
    })();
  }, [mounted, store]);

  useEffect(() => {
    if (!mounted || !loadedRef.current) return;

    const save = (content: string, bg: BackgroundType) => {
      setSaved(false);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        if (recordId.current) {
          await supabase.from('canvas').update({
            content,
            background: bg,
            updated_at: new Date().toISOString(),
          }).eq('id', recordId.current);
        } else {
          const { data } = await supabase.from('canvas').insert({
            content,
            background: bg,
          }).select().single();
          if (data) recordId.current = data.id;
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }, 800);
    };

    const unsub = store.listen(() => {
      if (!loadedRef.current) return;
      const snapshot = getSnapshot(store);
      save(JSON.stringify(snapshot), background);
    });

    return () => { unsub(); };
  }, [mounted, store, background]);

  const handleEditorMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
    editor.updateInstanceState({ isGridMode: false });
  }, []);

  const applyTool = useCallback((tool: ToolId) => {
    const editor = editorRef.current;
    if (!editor) return;
    setActiveTool(tool);
    setShowPenPanel(false);
    setShowEraserPanel(false);
    setShowBgPanel(false);

    switch (tool) {
      case 'select':
        editor.setCurrentTool('select');
        break;
      case 'draw':
        editor.setCurrentTool('draw');
        editor.setStyleForNextShapes({ color: penColor, dash: penDash, size: mapWidthToSize(penWidth) });
        break;
      case 'eraser':
        editor.setCurrentTool('draw');
        editor.setStyleForNextShapes({ color: eraserColor, dash: 'solid', size: mapWidthToSize(eraserWidth) });
        break;
      case 'rectangle':
        editor.setCurrentTool('geo');
        editor.setStyleForNextShapes({ color: penColor, dash: penDash, size: mapWidthToSize(penWidth), geo: 'rectangle' });
        break;
      case 'ellipse':
        editor.setCurrentTool('geo');
        editor.setStyleForNextShapes({ color: penColor, dash: penDash, size: mapWidthToSize(penWidth), geo: 'ellipse' });
        break;
      case 'arrow':
        editor.setCurrentTool('arrow');
        editor.setStyleForNextShapes({ color: penColor, dash: penDash, size: mapWidthToSize(penWidth) });
        break;
      case 'text':
        editor.setCurrentTool('text');
        editor.setStyleForNextShapes({ color: penColor, dash: penDash, size: mapWidthToSize(penWidth) });
        break;
    }
  }, [penColor, penDash, penWidth, eraserColor, eraserWidth]);

  const applyPenPreset = useCallback((preset: PenPreset) => {
    setActivePreset(preset);
    setPenColor(preset.color);
    setPenWidth(preset.width);
    setPenDash(preset.dash);
    const editor = editorRef.current;
    if (editor) {
      editor.setCurrentTool('draw');
      editor.setStyleForNextShapes({ color: preset.color, dash: preset.dash, size: mapWidthToSize(preset.width) });
    }
    setActiveTool('draw');
    setShowPenPanel(false);
  }, []);

  const updatePenColor = useCallback((color: string) => {
    setPenColor(color);
    const editor = editorRef.current;
    if (editor && activeTool === 'draw') {
      editor.setStyleForNextShapes({ color, dash: penDash, size: mapWidthToSize(penWidth) });
    }
  }, [activeTool, penDash, penWidth]);

  const updatePenWidth = useCallback((width: number) => {
    setPenWidth(width);
    const editor = editorRef.current;
    if (editor && activeTool === 'draw') {
      editor.setStyleForNextShapes({ color: penColor, dash: penDash, size: mapWidthToSize(width) });
    }
  }, [activeTool, penColor, penDash]);

  const updateEraserColor = useCallback((color: string) => {
    setEraserColor(color);
    const editor = editorRef.current;
    if (editor && activeTool === 'eraser') {
      editor.setStyleForNextShapes({ color, dash: 'solid', size: mapWidthToSize(eraserWidth) });
    }
  }, [activeTool, eraserWidth]);

  const updateEraserWidth = useCallback((width: number) => {
    setEraserWidth(width);
    const editor = editorRef.current;
    if (editor && activeTool === 'eraser') {
      editor.setStyleForNextShapes({ color: eraserColor, dash: 'solid', size: mapWidthToSize(width) });
    }
  }, [activeTool, eraserColor]);

  const switchBackground = useCallback((bg: BackgroundType) => {
    setBackground(bg);
    const c = BG_COLORS[bg];
    setBgColor(c);
    setEraserColor(c);
    setShowBgPanel(false);
    const editor = editorRef.current;
    if (editor) {
      editor.updateInstanceState({ isGridMode: bg === 'grid' });
      if (activeTool === 'eraser') {
        editor.setStyleForNextShapes({ color: c, dash: 'solid', size: mapWidthToSize(eraserWidth) });
      }
    }
    if (loadedRef.current) {
      const snapshot = getSnapshot(store);
      setSaved(false);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const content = JSON.stringify(snapshot);
        if (recordId.current) {
          await supabase.from('canvas').update({
            content,
            background: bg,
            updated_at: new Date().toISOString(),
          }).eq('id', recordId.current);
        } else {
          const { data } = await supabase.from('canvas').insert({
            content,
            background: bg,
          }).select().single();
          if (data) recordId.current = data.id;
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }, 800);
    }
  }, [store, activeTool, eraserWidth]);

  const undo = useCallback(() => editorRef.current?.undo(), []);
  const redo = useCallback(() => editorRef.current?.redo(), []);
  const clearAll = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const shapes = editor.getCurrentPageShapeIds();
    if (shapes.size > 0) editor.deleteShapes([...shapes]);
  }, []);

  if (!mounted || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Pen className="w-8 h-8 text-zinc-300 animate-pulse" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1 p-1 glass rounded-xl">
          <ToolButton icon={MousePointer2} label="Select" active={activeTool === 'select'} onClick={() => applyTool('select')} />

          <div className="relative">
            <ToolButton icon={activePreset.icon} label="Pen" active={activeTool === 'draw'} onClick={() => applyTool('draw')} hasDropdown />
            <button
              onClick={(e) => { e.stopPropagation(); setShowPenPanel(v => !v); setShowEraserPanel(false); setShowBgPanel(false); }}
              className="absolute -right-0.5 -bottom-0.5 w-3.5 h-3.5 rounded-full glass flex items-center justify-center"
              title="Pen settings"
            >
              <ChevronDown className="w-2.5 h-2.5 text-zinc-500" />
            </button>
            {showPenPanel && (
              <div className="absolute top-full left-0 mt-2 w-72 p-3 glass glass-shadow-lg rounded-2xl z-50" onClick={e => e.stopPropagation()}>
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Pen Styles</p>
                <div className="grid grid-cols-4 gap-1.5 mb-3">
                  {PEN_PRESETS.map(p => {
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.id}
                        onClick={() => applyPenPreset(p)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${
                          activePreset.id === p.id ? 'border-zinc-800 bg-zinc-100/60' : 'border-transparent glass glass-hover'
                        }`}
                        title={p.label}
                      >
                        <Icon className="w-4 h-4 text-zinc-600" />
                        <span className="text-[9px] text-zinc-500">{p.label.split(' ')[0]}</span>
                      </button>
                    );
                  })}
                </div>

                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Color</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {COLOR_SWATCHES.map(c => (
                    <button
                      key={c}
                      onClick={() => updatePenColor(c)}
                      className={`w-6 h-6 rounded-full transition-all ${penColor === c ? 'ring-2 ring-zinc-800 ring-offset-1' : 'hover:scale-110'}`}
                      style={{ backgroundColor: c, border: c === '#ffffff' ? '1px solid #d4d4d8' : 'none' }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="color"
                    value={penColor}
                    onChange={e => updatePenColor(e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border border-zinc-200"
                    title="Custom color"
                  />
                  <input
                    type="text"
                    value={penColor}
                    onChange={e => updatePenColor(e.target.value)}
                    className="flex-1 px-2 py-1 glass-input rounded-lg text-xs text-zinc-700 font-mono"
                    placeholder="#000000"
                  />
                </div>

                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Stroke Width: {penWidth}px</p>
                <input
                  type="range"
                  min={1}
                  max={30}
                  value={penWidth}
                  onChange={e => updatePenWidth(parseInt(e.target.value))}
                  className="w-full accent-zinc-800"
                />
              </div>
            )}
          </div>

          <div className="relative">
            <ToolButton icon={Eraser} label="Eraser" active={activeTool === 'eraser'} onClick={() => applyTool('eraser')} hasDropdown />
            <button
              onClick={(e) => { e.stopPropagation(); setShowEraserPanel(v => !v); setShowPenPanel(false); setShowBgPanel(false); }}
              className="absolute -right-0.5 -bottom-0.5 w-3.5 h-3.5 rounded-full glass flex items-center justify-center"
              title="Eraser settings"
            >
              <ChevronDown className="w-2.5 h-2.5 text-zinc-500" />
            </button>
            {showEraserPanel && (
              <div className="absolute top-full left-0 mt-2 w-64 p-3 glass glass-shadow-lg rounded-2xl z-50" onClick={e => e.stopPropagation()}>
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Eraser Color</p>
                <p className="text-[10px] text-zinc-400 mb-2">Match your background so strokes disappear.</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[bgColor, '#ffffff', '#18181b', '#1e293b', '#f5f5f4', '#fef3c7'].map(c => (
                    <button
                      key={c}
                      onClick={() => updateEraserColor(c)}
                      className={`w-6 h-6 rounded-full transition-all ${eraserColor === c ? 'ring-2 ring-zinc-800 ring-offset-1' : 'hover:scale-110'}`}
                      style={{ backgroundColor: c, border: c === '#ffffff' ? '1px solid #d4d4d8' : 'none' }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="color"
                    value={eraserColor}
                    onChange={e => updateEraserColor(e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border border-zinc-200"
                    title="Custom eraser color"
                  />
                  <input
                    type="text"
                    value={eraserColor}
                    onChange={e => updateEraserColor(e.target.value)}
                    className="flex-1 px-2 py-1 glass-input rounded-lg text-xs text-zinc-700 font-mono"
                    placeholder="#ffffff"
                  />
                </div>
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">Eraser Width: {eraserWidth}px</p>
                <input
                  type="range"
                  min={5}
                  max={60}
                  value={eraserWidth}
                  onChange={e => updateEraserWidth(parseInt(e.target.value))}
                  className="w-full accent-zinc-800"
                />
              </div>
            )}
          </div>

          <div className="w-px h-6 bg-zinc-300/40 mx-0.5" />

          <ToolButton icon={Square} label="Rectangle" active={activeTool === 'rectangle'} onClick={() => applyTool('rectangle')} />
          <ToolButton icon={Circle} label="Ellipse" active={activeTool === 'ellipse'} onClick={() => applyTool('ellipse')} />
          <ToolButton icon={ArrowRight} label="Arrow" active={activeTool === 'arrow'} onClick={() => applyTool('arrow')} />
          <ToolButton icon={Type} label="Text" active={activeTool === 'text'} onClick={() => applyTool('text')} />
        </div>

        <div className="flex items-center gap-1">
          <button onClick={undo} className="p-2 rounded-lg glass glass-hover text-zinc-600" title="Undo">
            <Undo2 className="w-4 h-4" />
          </button>
          <button onClick={redo} className="p-2 rounded-lg glass glass-hover text-zinc-600" title="Redo">
            <Redo2 className="w-4 h-4" />
          </button>
          <button onClick={clearAll} className="p-2 rounded-lg glass glass-hover text-zinc-600" title="Clear all">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <div className="relative">
          <button
            onClick={() => { setShowBgPanel(v => !v); setShowPenPanel(false); setShowEraserPanel(false); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg glass glass-hover text-zinc-600 text-sm font-medium"
            title="Background"
          >
            {background === 'plain' ? <PlainIcon className="w-4 h-4" /> : background === 'dotted' ? <DotSquare className="w-4 h-4" /> : <Grid3X3 className="w-4 h-4" />}
            <span className="capitalize">{background}</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {showBgPanel && (
            <div className="absolute top-full left-0 mt-2 w-44 p-2 glass glass-shadow-lg rounded-2xl z-50" onClick={e => e.stopPropagation()}>
              {(['plain', 'dotted', 'grid'] as BackgroundType[]).map(bg => {
                const Icon = bg === 'plain' ? PlainIcon : bg === 'dotted' ? DotSquare : Grid3X3;
                return (
                  <button
                    key={bg}
                    onClick={() => switchBackground(bg)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all capitalize ${
                      background === bg ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {bg}
                  </button>
                );
              })}
            </div>
          )}
        </div>

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

      <div className="epicure-canvas glass glass-shadow rounded-2xl overflow-hidden" style={{ height: 'calc(100vh - 200px)', minHeight: '400px' }}>
        <Tldraw
          store={store}
          onMount={handleEditorMount}
          components={{
            Toolbar: () => null,
            MainMenu: () => null,
            HelpMenu: () => null,
            ActionsMenu: () => null,
            DebugMenu: () => null,
            KeyboardShortcutsDialog: () => null,
            HelperButtons: () => null,
            SharePanel: () => null,
            PageMenu: () => null,
            ZoomMenu: () => null,
            Minimap: () => null,
            NavigationPanel: () => null,
            StylePanel: () => null,
            TopPanel: () => null,
            ContextMenu: () => null,
          }}
        />
      </div>
    </div>
  );
}

function ToolButton({
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
      className={`p-2 rounded-lg transition-all ${active ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-700'}`}
      title={label}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
