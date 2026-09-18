import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Cloud,
  Folder,
  FileText,
  Film,
  Music,
  Code2,
  Search,
  Plus,
  LayoutGrid,
  List,
  MoreVertical,
  Download,
  Trash2,
  Upload,
  ChevronRight,
  ChevronLeft,
  X,
  RefreshCw,
  FolderPlus,
  FilePlus,
  FolderUp,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Eye,
  Info,
  Rows3,
} from 'lucide-react';
import { toast } from 'sonner';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { MotionOverlay } from '@/components/MotionUI';
import {
  type DriveItem,
  type ViewMode,
  type Density,
  type NewMode,
  formatSize,
  formatDate,
  previewKind,
  iconFor,
  middleTruncate,
  parentPrefix,
  fetchSignedUrl,
  GridThumb,
  SkeletonGrid,
} from './driveKit';

export default function DrivePage() {
  const reduceMotion = useReducedMotion();
  const [prefix, setPrefix] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [density, setDensity] = useState<Density>('compact');
  const [items, setItems] = useState<DriveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; item: DriveItem } | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newMode, setNewMode] = useState<NewMode>('menu');
  const [folderName, setFolderName] = useState('');
  const [textName, setTextName] = useState('');
  const [dragging, setDragging] = useState(false);

  const [viewer, setViewer] = useState<DriveItem | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerText, setViewerText] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState(true);
  const [showInfo, setShowInfo] = useState(false);

  const [peek, setPeek] = useState<{ item: DriveItem; x: number; y: number; url?: string } | null>(null);
  const peekTimer = useRef<number | null>(null);
  const urlCache = useRef<Map<string, string>>(new Map());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  const compact = density === 'compact';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/drive/list?prefix=${encodeURIComponent(prefix)}`);
      const data = await res.json();
      if (!res.ok) {
        setConfigured(data.configured !== false ? true : false);
        setError(data.error || data.hint || 'Could not list objects');
        setItems([]);
        return;
      }
      setConfigured(true);
      const next: DriveItem[] = [...(data.folders || []), ...(data.files || [])];
      setItems(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [prefix]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!ctx) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ctxRef.current?.contains(t)) return;
      setCtx(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtx(null);
    };
    const id = window.setTimeout(() => {
      document.addEventListener('click', onDoc);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [ctx]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  const filesOnly = useMemo(
    () => filtered.filter((i): i is Extract<DriveItem, { type: 'file' }> => i.type === 'file'),
    [filtered],
  );

  const imageSiblings = useMemo(
    () => filesOnly.filter((f) => previewKind(f.name) === 'image'),
    [filesOnly],
  );

  const crumbs = useMemo(() => {
    if (!prefix) return [{ label: 'My Files', path: '' }];
    const parts = prefix.split('/').filter(Boolean);
    const out: { label: string; path: string }[] = [{ label: 'My Files', path: '' }];
    let acc = '';
    for (const p of parts) {
      acc = acc ? `${acc}/${p}` : p;
      out.push({ label: p, path: acc });
    }
    return out;
  }, [prefix]);

  const openViewer = useCallback(async (item: DriveItem) => {
    if (item.type === 'folder') {
      setPrefix(item.key);
      return;
    }
    setViewer(item);
    setViewerUrl(null);
    setViewerText(null);
    setViewerError(null);
    setZoom(1);
    setFitMode(true);
    setShowInfo(false);
    setViewerLoading(true);
    setCtx(null);
    setPeek(null);
    try {
      let url = urlCache.current.get(item.key);
      if (!url) {
        url = await fetchSignedUrl(item.key);
        urlCache.current.set(item.key, url);
      }
      setViewerUrl(url);
      const kind = previewKind(item.name);
      if (kind === 'text') {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Could not load file');
        const text = await res.text();
        setViewerText(text.length > 500_000 ? text.slice(0, 500_000) + '\n\n… truncated …' : text);
      }
    } catch (err) {
      setViewerError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setViewerLoading(false);
    }
  }, []);

  const closeViewer = () => {
    setViewer(null);
    setViewerUrl(null);
    setViewerText(null);
    setViewerError(null);
    setViewerLoading(false);
  };

  useEffect(() => {
    if (!viewer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeViewer();
        return;
      }
      if (previewKind(viewer.name) !== 'image') return;
      const idx = imageSiblings.findIndex((f) => f.key === viewer.key);
      if (idx < 0) return;
      if (e.key === 'ArrowRight' && idx < imageSiblings.length - 1) {
        e.preventDefault();
        void openViewer(imageSiblings[idx + 1]);
      }
      if (e.key === 'ArrowLeft' && idx > 0) {
        e.preventDefault();
        void openViewer(imageSiblings[idx - 1]);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [viewer, imageSiblings, openViewer]);

  const goSibling = (dir: -1 | 1) => {
    if (!viewer || previewKind(viewer.name) !== 'image') return;
    const idx = imageSiblings.findIndex((f) => f.key === viewer.key);
    const next = imageSiblings[idx + dir];
    if (next) void openViewer(next);
  };

  const onItemEnter = (item: DriveItem, e: React.MouseEvent) => {
    if (item.type !== 'file') return;
    const kind = previewKind(item.name);
    if (kind !== 'image' && kind !== 'pdf' && kind !== 'text') return;
    if (peekTimer.current) window.clearTimeout(peekTimer.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    peekTimer.current = window.setTimeout(async () => {
      const x = Math.min(rect.right + 8, window.innerWidth - 280);
      const y = Math.min(rect.top, window.innerHeight - 200);
      let url = urlCache.current.get(item.key);
      if (!url) {
        try {
          url = await fetchSignedUrl(item.key);
          urlCache.current.set(item.key, url);
        } catch {
          return;
        }
      }
      setPeek({ item, x, y, url });
    }, 400);
  };

  const onItemLeave = () => {
    if (peekTimer.current) window.clearTimeout(peekTimer.current);
    setPeek(null);
  };

  const uploadFiles = async (files: File[], opts?: { relativePaths?: boolean }) => {
    if (!files.length) return;
    let ok = 0;
    for (const file of files) {
      const form = new FormData();
      form.append('file', file);
      const rel = opts?.relativePaths && (file as File & { webkitRelativePath?: string }).webkitRelativePath;
      const effectivePrefix = rel
        ? [prefix, ...rel.split('/').slice(0, -1)].filter(Boolean).join('/')
        : prefix;
      form.append('prefix', effectivePrefix);
      try {
        const res = await fetch('/api/drive/upload', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        ok += 1;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Failed ${file.name}`);
      }
    }
    if (ok) toast.success(`Uploaded ${ok} file${ok > 1 ? 's' : ''}`);
    void load();
  };

  const closeNew = () => {
    setNewOpen(false);
    setNewMode('menu');
    setFolderName('');
    setTextName('');
  };

  const openNew = () => {
    setNewMode('menu');
    setFolderName('');
    setTextName('');
    setNewOpen(true);
  };

  const createFolder = async () => {
    const name = folderName.trim();
    if (!name) return;
    try {
      const res = await fetch('/api/drive/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create folder');
      toast.success(`Folder “${name}” created`);
      closeNew();
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'mkdir failed');
    }
  };

  const createTextFile = async () => {
    let name = textName.trim();
    if (!name) return;
    if (!/\.[a-z0-9]+$/i.test(name)) name = `${name}.txt`;
    try {
      const blob = new Blob([''], { type: 'text/plain' });
      const file = new File([blob], name, { type: 'text/plain' });
      const form = new FormData();
      form.append('file', file);
      form.append('prefix', prefix);
      const res = await fetch('/api/drive/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create file');
      toast.success(`Created “${name}”`);
      closeNew();
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    }
  };

  const removeItem = async (item: DriveItem) => {
    if (!confirm(`Delete “${item.name}”?`)) return;
    try {
      const res = await fetch('/api/drive/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: [item.key] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      toast.success('Deleted');
      if (viewer?.key === item.key) closeViewer();
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const downloadItem = async (item: DriveItem) => {
    if (item.type === 'folder') {
      toast.message('Open the folder to download files');
      return;
    }
    try {
      const url =
        viewer?.key === item.key && viewerUrl
          ? viewerUrl
          : urlCache.current.get(item.key) ?? (await fetchSignedUrl(item.key));
      urlCache.current.set(item.key, url);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.name;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download failed');
    }
  };

  const openFile = (item: DriveItem) => {
    if (item.type === 'folder') {
      setPrefix(item.key);
      return;
    }
    const kind = previewKind(item.name);
    if (kind === 'unknown') {
      void downloadItem(item);
      return;
    }
    void openViewer(item);
  };

  const kind = viewer ? previewKind(viewer.name) : null;
  const imgIdx = viewer && kind === 'image' ? imageSiblings.findIndex((f) => f.key === viewer.key) : -1;

  const gridClass = compact
    ? 'grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-7'
    : 'grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6';

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[420px] flex-col gap-3">
      <div className="glass flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm">
          <Cloud className="h-4 w-4 shrink-0 text-zinc-500" />
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <span key={`${c.path}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />}
                <button
                  type="button"
                  disabled={last}
                  onClick={() => setPrefix(c.path)}
                  className={`truncate rounded-md px-1.5 py-0.5 transition-colors ${
                    last ? 'font-medium text-zinc-900' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'
                  }`}
                >
                  {c.label}
                </button>
              </span>
            );
          })}
        </div>
        <div className="relative w-full max-w-[220px] sm:w-56">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search in folder"
            className="glass-input w-full rounded-full py-1.5 pl-8 pr-3 text-xs"
          />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100"
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
        <div className="flex overflow-hidden rounded-lg border border-zinc-200/70">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            title="Grid view"
            className={`p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            title="List view"
            className={`p-1.5 transition-colors ${viewMode === 'list' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
        {viewMode === 'grid' && (
          <button
            type="button"
            onClick={() => setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact'))}
            title={compact ? 'Comfortable density' : 'Compact density'}
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100"
          >
            <Rows3 className="h-4 w-4" />
          </button>
        )}
        {/* Single create entry point — no floating FAB */}
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition-transform active:scale-[0.97]"
        >
          <Plus className="h-3.5 w-3.5" /> New
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length) void uploadFiles(files);
            e.target.value = '';
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error webkitdirectory is non-standard but widely supported
          webkitdirectory=""
          directory=""
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length) void uploadFiles(files, { relativePaths: true });
            e.target.value = '';
          }}
        />
      </div>

      <div
        className="glass relative min-h-0 flex-1 overflow-hidden rounded-2xl"
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const files = Array.from(e.dataTransfer.files || []);
          if (files.length) void uploadFiles(files);
        }}
      >
        <AnimatePresence>
          {dragging && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-zinc-400 bg-zinc-900/5 text-sm font-medium text-zinc-700"
            >
              Drop files to upload
            </motion.div>
          )}
        </AnimatePresence>
        <div className="h-full overflow-auto p-3">
          {loading && (viewMode === 'grid' ? <SkeletonGrid compact={compact} /> : (
            <div className="space-y-2 py-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-2">
                  <div className="h-4 w-4 animate-pulse rounded bg-zinc-200/70" />
                  <div className="h-3 flex-1 max-w-xs animate-pulse rounded bg-zinc-200/70" />
                  <div className="hidden h-3 w-14 animate-pulse rounded bg-zinc-100 sm:block" />
                  <div className="h-3 w-20 animate-pulse rounded bg-zinc-100" />
                </div>
              ))}
            </div>
          ))}
          {!loading && configured === false && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-sm text-zinc-600">
              <Cloud className="h-12 w-12 text-zinc-300" />
              <p className="text-base font-semibold text-zinc-800">Connect Cloudflare R2</p>
              <p className="max-w-md text-xs text-zinc-500">Set storage env vars on the server.</p>
              {error && <p className="max-w-md text-xs text-amber-700">{error}</p>}
            </div>
          )}
          {!loading && configured !== false && error && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-zinc-600">
              <Cloud className="h-10 w-10 text-zinc-300" />
              <p className="font-medium text-zinc-800">Couldn’t load files</p>
              <p className="max-w-md text-xs text-amber-700">{error}</p>
              <button type="button" onClick={() => void load()} className="rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white">
                Retry
              </button>
            </div>
          )}
          {!loading && configured && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center text-sm text-zinc-500">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 ring-1 ring-zinc-200/60">
                <Folder className="h-8 w-8 text-zinc-300" />
              </div>
              <p className="font-medium text-zinc-700">{search ? 'No matches' : 'This folder is empty'}</p>
              {!search && (
                <p className="max-w-xs text-xs text-zinc-500">
                  Drag files here, or use <span className="font-medium text-zinc-700">New</span> to upload or create.
                </p>
              )}
            </div>
          )}
          {!loading && configured && !error && filtered.length > 0 && viewMode === 'grid' && (
            <div className={gridClass}>
              {filtered.map((item, index) => {
                const sel = selected === item.key;
                return (
                  <motion.div
                    key={item.key}
                    role="button"
                    tabIndex={0}
                    initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: reduceMotion ? 0 : Math.min(index * 0.02, 0.2) }}
                    onClick={() => setSelected(item.key)}
                    onDoubleClick={() => openFile(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') openFile(item);
                    }}
                    onMouseEnter={(e) => onItemEnter(item, e)}
                    onMouseLeave={onItemLeave}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setSelected(item.key);
                      setCtx({ x: e.clientX, y: e.clientY, item });
                    }}
                    className={`group relative flex flex-col items-center gap-1.5 rounded-xl text-center transition-all duration-150 ${
                      compact ? 'p-2' : 'p-2.5'
                    } ${
                      sel
                        ? 'bg-zinc-900/10 ring-1 ring-zinc-300 scale-[0.98]'
                        : 'hover:bg-zinc-100/80 hover:scale-[1.01]'
                    }`}
                  >
                    <GridThumb item={item} urlCache={urlCache} compact={compact} />
                    <span
                      className="w-full text-xs font-medium leading-tight text-zinc-800"
                      title={item.name}
                    >
                      {middleTruncate(item.name, compact ? 18 : 22)}
                    </span>
                    <span className="text-[10px] font-medium text-zinc-600">
                      {item.type === 'file' ? formatSize(item.size) : 'Folder'}
                    </span>
                    <button
                      type="button"
                      className="absolute right-0.5 top-0.5 rounded-md p-1 opacity-0 transition-opacity hover:bg-zinc-200 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCtx({ x: e.clientX, y: e.clientY, item });
                      }}
                    >
                      <MoreVertical className="h-3.5 w-3.5 text-zinc-500" />
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )}
          {!loading && configured && !error && filtered.length > 0 && viewMode === 'list' && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200/60 text-[11px] uppercase tracking-wide text-zinc-500">
                  <th className="px-2 py-2 font-medium">Name</th>
                  <th className="hidden px-2 py-2 font-medium sm:table-cell">Size</th>
                  <th className="px-2 py-2 font-medium">Modified</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const Icon = iconFor(item);
                  const sel = selected === item.key;
                  return (
                    <tr
                      key={item.key}
                      className={`cursor-default border-b border-zinc-100 transition-colors ${
                        sel ? 'bg-zinc-900/5' : 'hover:bg-zinc-50'
                      }`}
                      onClick={() => setSelected(item.key)}
                      onDoubleClick={() => openFile(item)}
                      onMouseEnter={(e) => onItemEnter(item, e)}
                      onMouseLeave={onItemLeave}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setCtx({ x: e.clientX, y: e.clientY, item });
                      }}
                    >
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          {item.type === 'file' && previewKind(item.name) === 'image' && urlCache.current.has(item.key) ? (
                            <img
                              src={urlCache.current.get(item.key)}
                              alt=""
                              className="h-5 w-5 rounded object-cover ring-1 ring-zinc-200/60"
                            />
                          ) : (
                            <Icon className={`h-4 w-4 shrink-0 ${item.type === 'folder' ? 'text-amber-600/80' : 'text-zinc-500'}`} />
                          )}
                          <span className="truncate font-medium text-zinc-800" title={item.name}>
                            {item.name}
                          </span>
                        </div>
                      </td>
                      <td className="hidden px-2 py-2 text-xs font-medium text-zinc-600 sm:table-cell">
                        {item.type === 'file' ? formatSize(item.size) : '—'}
                      </td>
                      <td className="px-2 py-2 text-xs font-medium text-zinc-600">
                        {item.type === 'file' ? formatDate(item.modified) : '—'}
                      </td>
                      <td className="px-1">
                        <button
                          type="button"
                          className="rounded p-1 transition-colors hover:bg-zinc-200"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCtx({ x: e.clientX, y: e.clientY, item });
                          }}
                        >
                          <MoreVertical className="h-3.5 w-3.5 text-zinc-500" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <AnimatePresence>
        {peek && peek.url && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 4 }}
            transition={{ duration: 0.15 }}
            className="glass glass-shadow-lg pointer-events-none fixed z-[90] w-64 overflow-hidden rounded-2xl"
            style={{ left: peek.x, top: peek.y }}
          >
            <div className="aspect-video bg-zinc-100/80">
              {previewKind(peek.item.name) === 'image' ? (
                <img src={peek.url} alt="" className="h-full w-full object-contain" />
              ) : previewKind(peek.item.name) === 'pdf' ? (
                <div className="flex h-full items-center justify-center gap-2 text-xs text-zinc-500">
                  <FileText className="h-8 w-8 text-zinc-400" />
                  PDF
                </div>
              ) : (
                <div className="flex h-full items-center justify-center gap-2 text-xs text-zinc-500">
                  <Code2 className="h-8 w-8 text-zinc-400" />
                  Preview
                </div>
              )}
            </div>
            <div className="space-y-0.5 px-3 py-2">
              <p className="truncate text-xs font-semibold text-zinc-800">{peek.item.name}</p>
              {peek.item.type === 'file' && (
                <p className="text-[10px] font-medium text-zinc-600">
                  {formatSize(peek.item.size)} · {formatDate(peek.item.modified)}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <MotionOverlay
        open={!!viewer}
        onClose={closeViewer}
        zClass="z-[100]"
        frameClassName="items-stretch justify-center p-2 sm:p-4"
        panelClassName="epic-glass-sheet flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden p-0"
      >
        {viewer && (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200/50 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-800">{viewer.name}</span>
              {kind === 'image' && (
                <div className="flex items-center gap-0.5">
                  <button type="button" title="Previous" disabled={imgIdx <= 0} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30" onClick={() => goSibling(-1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button type="button" title="Next" disabled={imgIdx < 0 || imgIdx >= imageSiblings.length - 1} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30" onClick={() => goSibling(1)}>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button type="button" title={fitMode ? 'Zoom' : 'Fit'} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100" onClick={() => setFitMode((f) => !f)}>
                    <Maximize2 className="h-4 w-4" />
                  </button>
                  {!fitMode && (
                    <>
                      <button type="button" title="Zoom out" className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}>
                        <ZoomOut className="h-4 w-4" />
                      </button>
                      <button type="button" title="Zoom in" className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>
                        <ZoomIn className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              )}
              <button type="button" title="Info" className={`rounded-lg p-1.5 hover:bg-zinc-100 ${showInfo ? 'text-zinc-900' : 'text-zinc-500'}`} onClick={() => setShowInfo((s) => !s)}>
                <Info className="h-4 w-4" />
              </button>
              <button type="button" title="Download" className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100" onClick={() => void downloadItem(viewer)}>
                <Download className="h-4 w-4" />
              </button>
              <button type="button" title="Close" className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100" onClick={closeViewer}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative flex min-h-0 flex-1">
              <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-zinc-900/[0.03] p-3">
                {viewerLoading && (
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
                    Loading…
                  </div>
                )}
                {viewerError && !viewerLoading && (
                  <div className="text-center text-sm text-zinc-600">
                    <p className="mb-2">{viewerError}</p>
                    <button type="button" className="rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white" onClick={() => void downloadItem(viewer)}>
                      Download instead
                    </button>
                  </div>
                )}
                {!viewerLoading && !viewerError && viewerUrl && kind === 'image' && (
                  <img
                    src={viewerUrl}
                    alt={viewer.name}
                    className="max-h-full max-w-full select-none"
                    style={
                      fitMode
                        ? { maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }
                        : { transform: `scale(${zoom})`, transformOrigin: 'center center' }
                    }
                    draggable={false}
                  />
                )}
                {!viewerLoading && !viewerError && viewerUrl && kind === 'pdf' && (
                  <iframe title={viewer.name} src={viewerUrl} className="h-full min-h-[60vh] w-full rounded-lg border-0 bg-white" />
                )}
                {!viewerLoading && !viewerError && viewerUrl && kind === 'video' && (
                  <video src={viewerUrl} controls className="max-h-full max-w-full rounded-lg" />
                )}
                {!viewerLoading && !viewerError && viewerUrl && kind === 'audio' && (
                  <div className="flex w-full max-w-md flex-col items-center gap-4">
                    <Music className="h-16 w-16 text-zinc-300" />
                    <p className="text-sm font-medium text-zinc-700">{viewer.name}</p>
                    <audio src={viewerUrl} controls className="w-full" />
                  </div>
                )}
                {!viewerLoading && !viewerError && kind === 'text' && viewerText != null && (
                  <pre className="max-h-full w-full overflow-auto rounded-lg bg-zinc-950 p-4 text-left text-xs leading-relaxed text-zinc-100">
                    {viewerText}
                  </pre>
                )}
              </div>
              {showInfo && viewer.type === 'file' && (
                <aside className="w-52 shrink-0 space-y-2 border-l border-zinc-200/50 p-3 text-xs">
                  <p className="font-semibold text-zinc-800">Details</p>
                  <div>
                    <p className="text-zinc-500">Size</p>
                    <p className="font-medium text-zinc-700">{formatSize(viewer.size)}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Modified</p>
                    <p className="font-medium text-zinc-700">{formatDate(viewer.modified)}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Type</p>
                    <p className="font-medium text-zinc-700">{kind}</p>
                  </div>
                </aside>
              )}
            </div>
          </>
        )}
      </MotionOverlay>

      <MotionOverlay open={newOpen} onClose={closeNew}>
        {newMode === 'menu' && (
          <>
            <div className="mb-4">
              <h3 className="font-semibold text-zinc-800">New</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500">Create</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewMode('folder')}
                    className="flex items-center gap-2 rounded-xl border border-transparent glass px-3 py-2.5 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-white/60"
                  >
                    <FolderPlus className="h-4 w-4 text-zinc-500" />
                    New folder
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewMode('text')}
                    className="flex items-center gap-2 rounded-xl border border-transparent glass px-3 py-2.5 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-white/60"
                  >
                    <FilePlus className="h-4 w-4 text-zinc-500" />
                    New text file
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-500">Upload</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      closeNew();
                      fileInputRef.current?.click();
                    }}
                    className="flex items-center gap-2 rounded-xl border border-transparent glass px-3 py-2.5 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-white/60"
                  >
                    <Upload className="h-4 w-4 text-zinc-500" />
                    Upload files
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      closeNew();
                      folderInputRef.current?.click();
                    }}
                    className="flex items-center gap-2 rounded-xl border border-transparent glass px-3 py-2.5 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-white/60"
                  >
                    <FolderUp className="h-4 w-4 text-zinc-500" />
                    Upload folder
                  </button>
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button type="button" onClick={closeNew} className="rounded-xl px-3 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-100">
                  Cancel
                </button>
              </div>
            </div>
          </>
        )}
        {newMode === 'folder' && (
          <>
            <div className="mb-4">
              <h3 className="font-semibold text-zinc-800">New folder</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500">Name</label>
                <input
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void createFolder()}
                  placeholder="Projects"
                  className="glass-input w-full rounded-full px-3 py-2 text-sm"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setNewMode('menu')} className="rounded-xl px-3 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-100">
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => void createFolder()}
                  disabled={!folderName.trim()}
                  className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                >
                  Create
                </button>
              </div>
            </div>
          </>
        )}
        {newMode === 'text' && (
          <>
            <div className="mb-4">
              <h3 className="font-semibold text-zinc-800">New text file</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-500">Filename</label>
                <input
                  value={textName}
                  onChange={(e) => setTextName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void createTextFile()}
                  placeholder="notes.txt"
                  className="glass-input w-full rounded-full px-3 py-2 text-sm"
                  autoFocus
                />
                <p className="mt-1.5 text-[11px] text-zinc-400">Extension optional — defaults to .txt</p>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setNewMode('menu')} className="rounded-xl px-3 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-100">
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => void createTextFile()}
                  disabled={!textName.trim()}
                  className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                >
                  Create
                </button>
              </div>
            </div>
          </>
        )}
      </MotionOverlay>

      {ctx && (
        <div
          ref={ctxRef}
          className="glass glass-shadow-lg fixed z-[100] min-w-[168px] overflow-hidden rounded-xl py-1"
          style={{ left: Math.min(ctx.x, window.innerWidth - 180), top: Math.min(ctx.y, window.innerHeight - 140) }}
          onClick={(e) => e.stopPropagation()}
        >
          {ctx.item.type === 'file' && previewKind(ctx.item.name) !== 'unknown' && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-800 transition-colors hover:bg-white/50"
              onClick={() => {
                void openViewer(ctx.item);
                setCtx(null);
              }}
            >
              <Eye className="h-4 w-4" /> Preview
            </button>
          )}
          {ctx.item.type === 'file' && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-800 transition-colors hover:bg-white/50"
              onClick={() => {
                void downloadItem(ctx.item);
                setCtx(null);
              }}
            >
              <Download className="h-4 w-4" /> Download
            </button>
          )}
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50/80"
            onClick={() => {
              void removeItem(ctx.item);
              setCtx(null);
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      )}

      {prefix && (
        <button type="button" className="sr-only" onClick={() => setPrefix(parentPrefix(prefix))} aria-hidden>
          up
        </button>
      )}
    </div>
  );
}
