import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Cloud, Folder, FileText, Music, Search, Plus, LayoutGrid, List, MoreVertical,
  Download, Trash2, Upload, ChevronRight, ChevronLeft, X, RefreshCw, FolderPlus,
  FilePlus, FolderUp, ZoomIn, ZoomOut, Maximize2, Eye, Info, Rows3, Star, Clock,
  CheckSquare, Square, Share2, ArrowUpDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { MotionOverlay } from '@/components/MotionUI';
import {
  type DriveItem, type ViewMode, type Density, type NewMode, type SortKey,
  type TypeFilter, type ScopeView, type UploadJob, type TagId,
  formatSize, formatDate, previewKind, iconFor, middleTruncate, parentPrefix,
  fetchSignedUrl, GridThumb, SkeletonGrid, loadStarred, saveStarred, loadRecent,
  pushRecent, typeFilterMatch, sortItems, TAG_COLORS, FOLDER_TINTS,
  loadTags, saveTags, loadFolderColors, saveFolderColors,
  // pinned helpers inlined below
} from './driveKit';

export default function DrivePage() {
  const reduceMotion = useReducedMotion();
  const [prefix, setPrefix] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [density, setDensity] = useState<Density>('compact');
  const [scope, setScope] = useState<ScopeView>('files');
  const [items, setItems] = useState<DriveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [starred, setStarred] = useState<Set<string>>(() => loadStarred());
  const [tags, setTags] = useState<Record<string, TagId[]>>(() => loadTags());
  const [folderColors, setFolderColors] = useState<Record<string, TagId>>(() => loadFolderColors());
  const [tagMenu, setTagMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  const [pinned, setPinned] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('epicure-drive-pinned') || '[]'); } catch { return []; }
  });
  const [renaming, setRenaming] = useState<{ key: string; name: string } | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; item: DriveItem } | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newMode, setNewMode] = useState<NewMode>('menu');
  const [folderName, setFolderName] = useState('');
  const [textName, setTextName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadJob[]>([]);
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
        setConfigured(data.configured !== false);
        setError(data.error || data.hint || 'Could not list objects');
        setItems([]);
        return;
      }
      setConfigured(true);
      setItems([...(data.folders || []), ...(data.files || [])]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [prefix]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setSelectedKeys(new Set()); }, [prefix, scope]);

  useEffect(() => {
    if (!ctx) return;
    const onDoc = (e: MouseEvent) => {
      if (ctxRef.current?.contains(e.target as Node)) return;
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

  // Keyboard: Escape, Ctrl/Cmd+A, Space = Quick Look
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (viewer) return; // viewer has its own keys
      if (e.key === 'Escape') {
        setSelectedKeys(new Set());
        setDetailsOpen(false);
        setTagMenu(null);
        setCtx(null);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'a' && scope === 'files') {
        e.preventDefault();
        setSelectedKeys(new Set(filtered.map((i) => i.key)));
      }
      // Space = Quick Look (Apple-style) on single selection
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (selectedKeys.size === 1) {
          const k = [...selectedKeys][0];
          const item = filtered.find((i) => i.key === k) || items.find((i) => i.key === k);
          if (item) void openViewer(item);
        } else if (selectedKeys.size === 0 && filtered.length > 0) {
          // no selection: quick look first item
          void openViewer(filtered[0]);
        }
      }
      // Arrow keys move selection when not in viewer
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        if (selectedKeys.size <= 1 && filtered.length) {
          e.preventDefault();
          const cur = selectedKeys.size === 1 ? [...selectedKeys][0] : null;
          const idx = cur ? filtered.findIndex((i) => i.key === cur) : -1;
          const next = filtered[Math.min(idx + 1, filtered.length - 1)] || filtered[0];
          setSelectedKeys(new Set([next.key]));
        }
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        if (selectedKeys.size <= 1 && filtered.length) {
          e.preventDefault();
          const cur = selectedKeys.size === 1 ? [...selectedKeys][0] : null;
          const idx = cur ? filtered.findIndex((i) => i.key === cur) : 0;
          const next = filtered[Math.max(idx - 1, 0)];
          setSelectedKeys(new Set([next.key]));
        }
      }
      if (e.key === 'Enter' && selectedKeys.size === 1) {
        const k = [...selectedKeys][0];
        const item = filtered.find((i) => i.key === k);
        if (item) openFile(item);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const filtered = useMemo(() => {
    let list = items;
    if (scope === 'starred') {
      list = items.filter((i) => starred.has(i.key));
    } else if (scope === 'recent') {
      const recent = loadRecent();
      const byKey = new Map(items.map((i) => [i.key, i]));
      list = recent.map((r) => byKey.get(r.key)).filter(Boolean) as DriveItem[];
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q));
    }
    list = list.filter((i) => typeFilterMatch(i, typeFilter));
    return sortItems(list, sortKey, sortDir);
  }, [items, search, typeFilter, sortKey, sortDir, scope, starred]);

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

  const folderBytes = useMemo(
    () => items.reduce((s, i) => s + (i.type === 'file' ? i.size : 0), 0),
    [items],
  );

  const primarySelected = useMemo(() => {
    if (selectedKeys.size !== 1) return null;
    const k = [...selectedKeys][0];
    return items.find((i) => i.key === k) || filtered.find((i) => i.key === k) || null;
  }, [selectedKeys, items, filtered]);

  const toggleSelect = (key: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectOnly = (key: string) => setSelectedKeys(new Set([key]));

  const toggleStar = (key: string) => {
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveStarred(next);
      return next;
    });
  };

  const toggleTag = (key: string, tag: TagId) => {
    setTags((prev) => {
      const cur = prev[key] || [];
      const has = cur.includes(tag);
      const nextTags = has ? cur.filter((t) => t !== tag) : [...cur, tag];
      const next = { ...prev };
      if (nextTags.length) next[key] = nextTags;
      else delete next[key];
      saveTags(next);
      return next;
    });
  };

  const setFolderColor = (key: string, color: TagId | null) => {
    setFolderColors((prev) => {
      const next = { ...prev };
      if (color) next[key] = color;
      else delete next[key];
      saveFolderColors(next);
      return next;
    });
  };
  const togglePin = (key: string) => {
    setPinned((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key].slice(0, 12);
      localStorage.setItem('epicure-drive-pinned', JSON.stringify(next));
      return next;
    });
  };

  const openViewer = useCallback(async (item: DriveItem) => {
    if (item.type === 'folder') {
      setPrefix(item.key);
      setScope('files');
      return;
    }
    pushRecent({ key: item.key, name: item.name });
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
      if (previewKind(item.name) === 'text') {
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
      if (e.key === 'Escape') { closeViewer(); return; }
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

  const onItemEnter = (_item: DriveItem, _e: React.MouseEvent) => {
    // Hover peek disabled — caused layout jump / off-screen menus. Use Space for Quick Look.
    if (peekTimer.current) window.clearTimeout(peekTimer.current);
    setPeek(null);
  };

  const onItemLeave = () => {
    if (peekTimer.current) window.clearTimeout(peekTimer.current);
    setPeek(null);
  };

  const uploadFiles = async (files: File[], opts?: { relativePaths?: boolean; targetPrefix?: string }) => {
    if (!files.length) return;
    const target = opts?.targetPrefix ?? prefix;
    const jobs: UploadJob[] = files.map((f, i) => ({
      id: `${Date.now()}-${i}-${f.name}`,
      name: f.name,
      progress: 0,
      status: 'uploading' as const,
    }));
    setUploads((u) => [...jobs, ...u].slice(0, 12));

    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const jobId = jobs[i].id;
      const form = new FormData();
      form.append('file', file);
      const rel = opts?.relativePaths && (file as File & { webkitRelativePath?: string }).webkitRelativePath;
      const effectivePrefix = rel
        ? [target, ...rel.split('/').slice(0, -1)].filter(Boolean).join('/')
        : target;
      form.append('prefix', effectivePrefix);
      try {
        // Simulate progress steps (fetch has no native upload progress without XHR)
        setUploads((u) => u.map((j) => (j.id === jobId ? { ...j, progress: 30 } : j)));
        const res = await fetch('/api/drive/upload', { method: 'POST', body: form });
        setUploads((u) => u.map((j) => (j.id === jobId ? { ...j, progress: 90 } : j)));
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        ok += 1;
        setUploads((u) => u.map((j) => (j.id === jobId ? { ...j, progress: 100, status: 'done' } : j)));
      } catch (err) {
        const msg = err instanceof Error ? err.message : `Failed ${file.name}`;
        toast.error(msg);
        setUploads((u) => u.map((j) => (j.id === jobId ? { ...j, status: 'error', error: msg } : j)));
      }
    }
    if (ok) toast.success(`Uploaded ${ok} file${ok > 1 ? 's' : ''}`);
    void load();
    window.setTimeout(() => {
      setUploads((u) => u.filter((j) => j.status === 'uploading'));
    }, 2500);
  };

  const closeNew = () => { setNewOpen(false); setNewMode('menu'); setFolderName(''); setTextName(''); };
  const openNew = () => { setNewMode('menu'); setFolderName(''); setTextName(''); setNewOpen(true); };

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
      toast.success(`Folder "${name}" created`);
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
      const file = new File([new Blob([''], { type: 'text/plain' })], name, { type: 'text/plain' });
      const form = new FormData();
      form.append('file', file);
      form.append('prefix', prefix);
      const res = await fetch('/api/drive/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create file');
      toast.success(`Created "${name}"`);
      closeNew();
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    }
  };

  const removeKeys = async (keys: string[]) => {
    if (!keys.length) return;
    if (!confirm(`Delete ${keys.length} item${keys.length > 1 ? 's' : ''}?`)) return;
    try {
      const res = await fetch('/api/drive/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      toast.success('Deleted', {
        description: `${keys.length} item${keys.length > 1 ? 's' : ''} removed`,
        action: {
          label: 'Dismiss',
          onClick: () => {},
        },
      });
      setSelectedKeys(new Set());
      if (viewer && keys.includes(viewer.key)) closeViewer();
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
      const url = viewer?.key === item.key && viewerUrl
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

  const downloadSelected = async () => {
    const files = filtered.filter((i) => selectedKeys.has(i.key) && i.type === 'file');
    for (const f of files) await downloadItem(f);
  };

  const openFile = (item: DriveItem) => {
    if (item.type === 'folder') {
      setPrefix(item.key);
      setScope('files');
      return;
    }
    if (previewKind(item.name) === 'unknown') {
      void downloadItem(item);
      return;
    }
    void openViewer(item);
  };

  const cycleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const kind = viewer ? previewKind(viewer.name) : null;
  const imgIdx = viewer && kind === 'image' ? imageSiblings.findIndex((f) => f.key === viewer.key) : -1;
  const gridClass = compact
    ? 'grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-7'
    : 'grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6';

  const TYPE_CHIPS: { id: TypeFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'folder', label: 'Folders' },
    { id: 'image', label: 'Images' },
    { id: 'document', label: 'Docs' },
    { id: 'video', label: 'Video' },
    { id: 'audio', label: 'Audio' },
  ];

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[420px] flex-col gap-3">
      {/* Toolbar */}
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
                  disabled={last && scope === 'files'}
                  onClick={() => { setPrefix(c.path); setScope('files'); }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const files = Array.from(e.dataTransfer.files || []);
                    if (files.length) void uploadFiles(files, { targetPrefix: c.path });
                  }}
                  className={`truncate rounded-md px-1.5 py-0.5 transition-colors ${
                    last && scope === 'files' ? 'font-medium text-zinc-900' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'
                  }`}
                  title={last ? c.label : `Go to ${c.label} (drop files to upload here)`}
                >
                  {c.label}
                </button>
              </span>
            );
          })}
        </div>
        <div className="relative w-full max-w-[200px] sm:w-48">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search in folder"
            className="glass-input w-full rounded-full py-1.5 pl-8 pr-3 text-xs" />
        </div>
        <button type="button" onClick={() => void load()} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100" title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </button>
        <div className="flex overflow-hidden rounded-lg border border-zinc-200/70">
          <button type="button" onClick={() => setViewMode('grid')} title="Grid"
            className={`p-1.5 ${viewMode === 'grid' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}>
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setViewMode('list')} title="List"
            className={`p-1.5 ${viewMode === 'list' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}>
            <List className="h-4 w-4" />
          </button>
        </div>
        {viewMode === 'grid' && (
          <button type="button" onClick={() => setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact'))}
            title={compact ? 'Comfortable' : 'Compact'} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100">
            <Rows3 className="h-4 w-4" />
          </button>
        )}
        <button type="button" onClick={() => setDetailsOpen((v) => !v)} title="Details panel"
          className={`rounded-lg p-1.5 hover:bg-zinc-100 ${detailsOpen ? 'text-zinc-900' : 'text-zinc-500'}`}>
          <Info className="h-4 w-4" />
        </button>
        <button type="button" onClick={openNew}
          className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white active:scale-[0.97]">
          <Plus className="h-3.5 w-3.5" /> New
        </button>
        <input ref={fileInputRef} type="file" multiple className="hidden"
          onChange={(e) => { const files = Array.from(e.target.files || []); if (files.length) void uploadFiles(files); e.target.value = ''; }} />
        <input ref={folderInputRef} type="file" multiple className="hidden"
          // @ts-expect-error webkitdirectory
          webkitdirectory="" directory=""
          onChange={(e) => { const files = Array.from(e.target.files || []); if (files.length) void uploadFiles(files, { relativePaths: true }); e.target.value = ''; }} />
      </div>

      {/* Scope + filters */}
      <div className="flex flex-wrap items-center gap-2 px-0.5">
        <div className="flex overflow-hidden rounded-lg border border-zinc-200/70 text-xs">
          {([
            { id: 'files' as const, label: 'My Files', icon: Folder },
            { id: 'starred' as const, label: 'Starred', icon: Star },
            { id: 'recent' as const, label: 'Recent', icon: Clock },
          ]).map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setScope(id)}
              className={`flex items-center gap-1 px-2.5 py-1.5 ${scope === id ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {TYPE_CHIPS.map((c) => (
            <button key={c.id} type="button" onClick={() => setTypeFilter(c.id)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                typeFilter === c.id ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1 text-[11px] text-zinc-500">
          <ArrowUpDown className="h-3 w-3" />
          <button type="button" onClick={() => cycleSort('name')} className={`rounded px-1.5 py-0.5 hover:bg-zinc-100 ${sortKey === 'name' ? 'font-semibold text-zinc-800' : ''}`}>Name</button>
          <button type="button" onClick={() => cycleSort('modified')} className={`rounded px-1.5 py-0.5 hover:bg-zinc-100 ${sortKey === 'modified' ? 'font-semibold text-zinc-800' : ''}`}>Modified</button>
          <button type="button" onClick={() => cycleSort('size')} className={`rounded px-1.5 py-0.5 hover:bg-zinc-100 ${sortKey === 'size' ? 'font-semibold text-zinc-800' : ''}`}>Size</button>
          <span className="text-zinc-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
        </div>
      </div>

      {/* Selection toolbar */}
      <AnimatePresence>
        {selectedKeys.size > 0 && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="glass flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm"
          >
            <span className="text-xs font-medium text-zinc-700">{selectedKeys.size} selected</span>
            <button type="button" className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
              onClick={() => void downloadSelected()}>
              <Download className="h-3.5 w-3.5" /> Download
            </button>
            <button type="button" className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
              onClick={() => { [...selectedKeys].forEach((k) => toggleStar(k)); toast.success('Updated stars'); }}>
              <Star className="h-3.5 w-3.5" /> Star
            </button>
            <button type="button" className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
              onClick={() => toast.message('Share links coming soon')}>
              <Share2 className="h-3.5 w-3.5" /> Share
            </button>
            <button type="button" className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              onClick={() => void removeKeys([...selectedKeys])}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
            <button type="button" className="ml-auto rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100"
              onClick={() => setSelectedKeys(new Set())}>
              Clear
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pinned folders + suggested (P3) */}
      {(pinned.length > 0 || (scope === 'files' && loadRecent().length > 0 && !prefix)) && (
        <div className="flex flex-wrap items-center gap-2 px-0.5">
          {pinned.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Pinned</span>
              {pinned.map((key) => {
                const name = key.split('/').filter(Boolean).pop() || key || 'Root';
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setPrefix(key); setScope('files'); }}
                    className="flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:bg-zinc-200"
                  >
                    <Folder className="h-3 w-3 text-amber-600/80" />
                    {name}
                  </button>
                );
              })}
            </div>
          )}
          {scope === 'files' && !prefix && !search && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Suggested</span>
              {loadRecent().slice(0, 5).map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => {
                    const item = items.find((i) => i.key === r.key);
                    if (item) void openViewer(item);
                    else toast.message(r.name, { description: 'Open its folder to access this file' });
                  }}
                  className="max-w-[140px] truncate rounded-full bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-600 ring-1 ring-zinc-200/80 transition-colors hover:bg-zinc-100"
                  title={r.name}
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-3">
        {/* Main pane */}
        <div
          className="glass relative min-h-0 flex-1 overflow-hidden rounded-2xl"
          onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
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
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-zinc-400 bg-zinc-900/5 text-sm font-medium text-zinc-700">
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
                    <div className="h-3 max-w-xs flex-1 animate-pulse rounded bg-zinc-200/70" />
                  </div>
                ))}
              </div>
            ))}
            {!loading && configured === false && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-sm text-zinc-600">
                <Cloud className="h-12 w-12 text-zinc-300" />
                <p className="text-base font-semibold text-zinc-800">Connect storage</p>
                <p className="max-w-md text-xs text-zinc-500">Set B2 storage env vars on the server.</p>
                {error && <p className="max-w-md text-xs text-amber-700">{error}</p>}
              </div>
            )}
            {!loading && configured !== false && error && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-zinc-600">
                <p className="font-medium text-zinc-800">Could not load files</p>
                <p className="text-xs text-amber-700">{error}</p>
                <button type="button" onClick={() => void load()} className="rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white">Retry</button>
              </div>
            )}
            {!loading && configured && !error && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-center text-sm text-zinc-500">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 ring-1 ring-zinc-200/60">
                  <Folder className="h-8 w-8 text-zinc-300" />
                </div>
                <p className="font-medium text-zinc-700">
                  {scope === 'starred' ? 'No starred items' : scope === 'recent' ? 'No recent files' : search ? 'No matches' : 'This folder is empty'}
                </p>
                {scope === 'files' && !search && (
                  <p className="max-w-xs text-xs text-zinc-500">Drag files here, or use <span className="font-medium text-zinc-700">New</span>.</p>
                )}
              </div>
            )}
            {!loading && configured && !error && filtered.length > 0 && viewMode === 'grid' && (
              <div className={gridClass}>
                {filtered.map((item, index) => {
                  const sel = selectedKeys.has(item.key);
                  return (
                    <motion.div key={item.key} role="button" tabIndex={0}
                      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: reduceMotion ? 0 : Math.min(index * 0.02, 0.2) }}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey) toggleSelect(item.key);
                        else selectOnly(item.key);
                      }}
                      onDoubleClick={() => openFile(item)}
                      onMouseEnter={(e) => onItemEnter(item, e)}
                      onMouseLeave={onItemLeave}
                      onContextMenu={(e) => { e.preventDefault(); selectOnly(item.key); setCtx({ x: e.clientX, y: e.clientY, item }); }}
                      className={`group relative flex flex-col items-center gap-1 rounded-xl text-center transition-[background-color,box-shadow] duration-150 ${compact ? 'p-2' : 'p-2.5'} ${
                        sel
                          ? 'bg-zinc-900/10 shadow-[inset_0_0_0_2px_rgba(113,113,122,0.7)]'
                          : 'hover:bg-zinc-100/80'
                      }`}
                    >
                      {/* Overlay controls — fixed layer, never affect layout */}
                      <div className="pointer-events-none absolute inset-0 z-20">
                        <button type="button" onClick={(e) => toggleSelect(item.key, e)}
                          className={`pointer-events-auto absolute left-1 top-1 rounded-md bg-white/90 p-0.5 shadow-sm ring-1 ring-zinc-200/80 transition-opacity ${sel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                          {sel ? <CheckSquare className="h-3.5 w-3.5 text-zinc-800" /> : <Square className="h-3.5 w-3.5 text-zinc-400" />}
                        </button>
                        <button type="button"
                          className="pointer-events-auto absolute right-1 top-1 rounded-md bg-white/90 p-0.5 shadow-sm ring-1 ring-zinc-200/80 opacity-0 transition-opacity hover:bg-zinc-100 group-hover:opacity-100"
                          onClick={(e) => { e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY, item }); }}>
                          <MoreVertical className="h-3.5 w-3.5 text-zinc-500" />
                        </button>
                        {starred.has(item.key) && (
                          <Star className="absolute right-1 bottom-1 h-3.5 w-3.5 fill-amber-400 text-amber-400 drop-shadow" />
                        )}
                      </div>
                      <div className="relative z-0">
                        <GridThumb item={item} urlCache={urlCache} compact={compact} />
                        {item.type === 'folder' && folderColors[item.key] && (
                          <span className={`absolute -bottom-0.5 -right-0.5 z-10 h-3 w-3 rounded-full ring-2 ring-white ${TAG_COLORS[folderColors[item.key]].bg}`} />
                        )}
                        {/* Tags overlaid on thumb — no extra card height */}
                        {(tags[item.key]?.length ?? 0) > 0 && (
                          <div className="absolute bottom-1 left-1 z-10 flex gap-0.5">
                            {tags[item.key].map((t) => (
                              <span key={t} className={`h-1.5 w-1.5 rounded-full ring-1 ring-white/80 ${TAG_COLORS[t].bg}`} title={TAG_COLORS[t].label} />
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="w-full truncate text-xs font-medium leading-tight text-zinc-800" title={item.name}>
                        {middleTruncate(item.name, compact ? 18 : 22)}
                      </span>
                      <span className="text-[10px] font-medium text-zinc-600">
                        {item.type === 'file' ? formatSize(item.size) : 'Folder'}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            )}
            {!loading && configured && !error && filtered.length > 0 && viewMode === 'list' && (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200/60 text-[11px] uppercase tracking-wide text-zinc-500">
                    <th className="w-8 px-1" />
                    <th className="cursor-pointer px-2 py-2 font-medium hover:text-zinc-800" onClick={() => cycleSort('name')}>Name</th>
                    <th className="hidden cursor-pointer px-2 py-2 font-medium hover:text-zinc-800 sm:table-cell" onClick={() => cycleSort('size')}>Size</th>
                    <th className="cursor-pointer px-2 py-2 font-medium hover:text-zinc-800" onClick={() => cycleSort('modified')}>Modified</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const Icon = iconFor(item);
                    const sel = selectedKeys.has(item.key);
                    return (
                      <tr key={item.key}
                        className={`cursor-default border-b border-zinc-100 transition-colors ${sel ? 'bg-zinc-900/5' : 'hover:bg-zinc-50'}`}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey) toggleSelect(item.key);
                          else selectOnly(item.key);
                        }}
                        onDoubleClick={() => openFile(item)}
                        onMouseEnter={(e) => onItemEnter(item, e)}
                        onMouseLeave={onItemLeave}
                        onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, item }); }}>
                        <td className="px-1">
                          <button type="button" onClick={(e) => toggleSelect(item.key, e)}>
                            {sel ? <CheckSquare className="h-4 w-4 text-zinc-800" /> : <Square className="h-4 w-4 text-zinc-300" />}
                          </button>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <Icon className={`h-4 w-4 shrink-0 ${
                              item.type === 'folder'
                                ? (folderColors[item.key] ? FOLDER_TINTS[folderColors[item.key]] : 'text-amber-600/80')
                                : 'text-zinc-500'
                            }`} />
                            <span className="truncate font-medium text-zinc-800" title={item.name}>{item.name}</span>
                            {starred.has(item.key) && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
                            {(tags[item.key]?.length ?? 0) > 0 && (
                              <span className="flex gap-0.5">
                                {tags[item.key].map((t) => (
                                  <span key={t} className={`h-2 w-2 rounded-full ${TAG_COLORS[t].bg}`} />
                                ))}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="hidden px-2 py-2 text-xs font-medium text-zinc-600 sm:table-cell">
                          {item.type === 'file' ? formatSize(item.size) : '—'}
                        </td>
                        <td className="px-2 py-2 text-xs font-medium text-zinc-600">
                          {item.type === 'file' ? formatDate(item.modified) : '—'}
                        </td>
                        <td className="px-1">
                          <button type="button" className="rounded p-1 hover:bg-zinc-200"
                            onClick={(e) => { e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY, item }); }}>
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

          {/* Folder size hint */}
          {!loading && configured && items.length > 0 && (
            <div className="absolute bottom-2 left-3 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-medium text-zinc-600 ring-1 ring-zinc-200/60 backdrop-blur">
              This folder · {formatSize(folderBytes)}
            </div>
          )}
        </div>

        {/* Details side panel */}
        <AnimatePresence>
          {detailsOpen && (
            <motion.aside
              initial={reduceMotion ? false : { width: 0, opacity: 0 }}
              animate={{ width: 260, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="glass hidden shrink-0 overflow-hidden rounded-2xl sm:block"
            >
              <div className="w-[260px] space-y-3 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Details</p>
                  <button type="button" className="rounded p-1 hover:bg-zinc-100" onClick={() => setDetailsOpen(false)}>
                    <X className="h-3.5 w-3.5 text-zinc-500" />
                  </button>
                </div>
                {!primarySelected && (
                  <p className="text-xs text-zinc-500">Select a single file or folder to see details.</p>
                )}
                {primarySelected && (
                  <>
                    <div className="flex flex-col items-center gap-2 py-2">
                      <GridThumb item={primarySelected} urlCache={urlCache} compact={false} />
                      <p className="w-full break-all text-center text-sm font-semibold text-zinc-800">{primarySelected.name}</p>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div>
                        <p className="text-zinc-500">Type</p>
                        <p className="font-medium text-zinc-800">
                          {primarySelected.type === 'folder' ? 'Folder' : previewKind(primarySelected.name)}
                        </p>
                      </div>
                      {primarySelected.type === 'file' && (
                        <>
                          <div>
                            <p className="text-zinc-500">Size</p>
                            <p className="font-medium text-zinc-800">{formatSize(primarySelected.size)}</p>
                          </div>
                          <div>
                            <p className="text-zinc-500">Modified</p>
                            <p className="font-medium text-zinc-800">{formatDate(primarySelected.modified)}</p>
                          </div>
                        </>
                      )}
                      <div>
                        <p className="text-zinc-500">Path</p>
                        <p className="break-all font-medium text-zinc-800">{primarySelected.key || '/'}</p>
                      </div>
                      <div>
                        <p className="mb-1 text-zinc-500">Tags</p>
                        <div className="flex flex-wrap gap-1">
                          {(Object.keys(TAG_COLORS) as TagId[]).map((t) => {
                            const on = (tags[primarySelected.key] || []).includes(t);
                            return (
                              <button key={t} type="button" title={TAG_COLORS[t].label}
                                onClick={() => toggleTag(primarySelected.key, t)}
                                className={`h-4 w-4 rounded-full ${TAG_COLORS[t].bg} ${on ? 'ring-2 ring-offset-1 ring-zinc-800' : 'opacity-40 hover:opacity-100'}`} />
                            );
                          })}
                        </div>
                      </div>
                      {primarySelected.type === 'folder' && (
                        <div>
                          <p className="mb-1 text-zinc-500">Folder color</p>
                          <div className="flex flex-wrap gap-1">
                            {(Object.keys(TAG_COLORS) as TagId[]).map((t) => (
                              <button key={t} type="button" onClick={() => setFolderColor(primarySelected.key, t)}
                                className={`h-4 w-4 rounded-full ${TAG_COLORS[t].bg} ${folderColors[primarySelected.key] === t ? 'ring-2 ring-offset-1 ring-zinc-800' : 'opacity-40 hover:opacity-100'}`} />
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="mb-1 text-zinc-500">Linked to</p>
                        <p className="text-[11px] text-zinc-400">Attach to tasks, notes, or events from those pages (coming soon).</p>
                      </div>
                      <p className="text-[10px] text-zinc-400">Tip: press <kbd className="rounded bg-zinc-100 px-1">Space</kbd> for Quick Look · arrows to move selection</p>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      <button type="button" className="rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[11px] font-medium text-white"
                        onClick={() => openFile(primarySelected)}>Open</button>
                      {primarySelected.type === 'file' && (
                        <button type="button" className="rounded-lg bg-zinc-100 px-2.5 py-1.5 text-[11px] font-medium text-zinc-700"
                          onClick={() => void downloadItem(primarySelected)}>Download</button>
                      )}
                      <button type="button" className="rounded-lg bg-zinc-100 px-2.5 py-1.5 text-[11px] font-medium text-zinc-700"
                        onClick={() => toggleStar(primarySelected.key)}>
                        {starred.has(primarySelected.key) ? 'Unstar' : 'Star'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* Upload progress panel */}
      <AnimatePresence>
        {uploads.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="glass glass-shadow-lg fixed bottom-4 right-4 z-[90] w-72 overflow-hidden rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-zinc-200/50 px-3 py-2">
              <p className="text-xs font-semibold text-zinc-800">Uploads</p>
              <button type="button" className="rounded p-1 hover:bg-zinc-100" onClick={() => setUploads([])}>
                <X className="h-3.5 w-3.5 text-zinc-500" />
              </button>
            </div>
            <ul className="max-h-48 space-y-2 overflow-auto p-3">
              {uploads.map((j) => (
                <li key={j.id} className="text-xs">
                  <div className="mb-0.5 flex justify-between gap-2">
                    <span className="truncate font-medium text-zinc-800">{j.name}</span>
                    <span className="shrink-0 text-zinc-500">
                      {j.status === 'done' ? 'Done' : j.status === 'error' ? 'Error' : `${j.progress}%`}
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className={`h-full transition-all ${j.status === 'error' ? 'bg-red-400' : j.status === 'done' ? 'bg-emerald-500' : 'bg-zinc-800'}`}
                      style={{ width: `${j.progress}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Peek, viewer, new menu, context — same patterns as P0, condensed */}
      <AnimatePresence>
        {peek && peek.url && (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
            className="glass glass-shadow-lg pointer-events-none fixed z-[90] w-64 max-h-[min(220px,70vh)] overflow-hidden rounded-2xl shadow-lg"
            style={{ left: peek.x, top: peek.y }}>
            <div className="aspect-video bg-zinc-100/80">
              {previewKind(peek.item.name) === 'image' ? (
                <img src={peek.url} alt="" className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-zinc-500"><FileText className="h-8 w-8 text-zinc-400" /></div>
              )}
            </div>
            <div className="px-3 py-2">
              <p className="truncate text-xs font-semibold text-zinc-800">{peek.item.name}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <MotionOverlay open={!!viewer} onClose={closeViewer} zClass="z-[100]"
        frameClassName="items-stretch justify-center p-2 sm:p-4"
        panelClassName="epic-glass-sheet flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden p-0">
        {viewer && (
          <>
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="flex shrink-0 items-center gap-1 border-b border-zinc-200/50 px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-800">{viewer.name}</span>
              {kind === 'image' && (
                <div className="flex items-center gap-0.5">
                  <motion.button type="button" whileTap={{ scale: 0.9 }} disabled={imgIdx <= 0}
                    className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-30"
                    onClick={() => goSibling(-1)} title="Previous"><ChevronLeft className="h-4 w-4" /></motion.button>
                  <motion.button type="button" whileTap={{ scale: 0.9 }} disabled={imgIdx < 0 || imgIdx >= imageSiblings.length - 1}
                    className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-30"
                    onClick={() => goSibling(1)} title="Next"><ChevronRight className="h-4 w-4" /></motion.button>
                  <motion.button type="button" whileTap={{ scale: 0.9 }}
                    className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100"
                    onClick={() => setFitMode((f) => !f)} title={fitMode ? 'Zoom' : 'Fit'}><Maximize2 className="h-4 w-4" /></motion.button>
                  {!fitMode && (
                    <>
                      <motion.button type="button" whileTap={{ scale: 0.9 }} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100"
                        onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}><ZoomOut className="h-4 w-4" /></motion.button>
                      <motion.button type="button" whileTap={{ scale: 0.9 }} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100"
                        onClick={() => setZoom((z) => Math.min(4, z + 0.25))}><ZoomIn className="h-4 w-4" /></motion.button>
                    </>
                  )}
                </div>
              )}
              <motion.button type="button" whileTap={{ scale: 0.9 }} className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100"
                onClick={() => void downloadItem(viewer)} title="Download"><Download className="h-4 w-4" /></motion.button>
              <motion.button type="button" whileTap={{ scale: 0.9 }} className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100"
                onClick={closeViewer} title="Close"><X className="h-4 w-4" /></motion.button>
            </motion.div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-zinc-900/[0.03] p-3">
              {viewerLoading && <div className="text-sm text-zinc-500">Loading…</div>}
              {viewerError && !viewerLoading && <p className="text-sm text-zinc-600">{viewerError}</p>}
              {!viewerLoading && !viewerError && viewerUrl && kind === 'image' && (
                <motion.img
                  key={viewer.key}
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
                  animate={{
                    opacity: 1,
                    scale: fitMode ? 1 : zoom,
                  }}
                  transition={{
                    opacity: { duration: 0.2 },
                    scale: { type: 'spring', stiffness: 260, damping: 28, mass: 0.8 },
                  }}
                  src={viewerUrl}
                  alt={viewer.name}
                  className="max-h-full max-w-full origin-center will-change-transform"
                  draggable={false}
                  style={fitMode ? { objectFit: 'contain', maxHeight: '100%', maxWidth: '100%' } : undefined}
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
                  <audio src={viewerUrl} controls className="w-full" />
                </div>
              )}
              {!viewerLoading && !viewerError && kind === 'text' && viewerText != null && (
                <pre className="max-h-full w-full overflow-auto rounded-lg bg-zinc-950 p-4 text-xs text-zinc-100">{viewerText}</pre>
              )}
            </div>
          </>
        )}
      </MotionOverlay>

      <MotionOverlay open={newOpen} onClose={closeNew}>
        {newMode === 'menu' && (
          <>
            <div className="mb-4"><h3 className="font-semibold text-zinc-800">New</h3></div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setNewMode('folder')} className="flex items-center gap-2 rounded-xl glass px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-white/60">
                <FolderPlus className="h-4 w-4" /> New folder
              </button>
              <button type="button" onClick={() => setNewMode('text')} className="flex items-center gap-2 rounded-xl glass px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-white/60">
                <FilePlus className="h-4 w-4" /> New text file
              </button>
              <button type="button" onClick={() => { closeNew(); fileInputRef.current?.click(); }} className="flex items-center gap-2 rounded-xl glass px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-white/60">
                <Upload className="h-4 w-4" /> Upload files
              </button>
              <button type="button" onClick={() => { closeNew(); folderInputRef.current?.click(); }} className="flex items-center gap-2 rounded-xl glass px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-white/60">
                <FolderUp className="h-4 w-4" /> Upload folder
              </button>
            </div>
          </>
        )}
        {newMode === 'folder' && (
          <>
            <h3 className="mb-3 font-semibold text-zinc-800">New folder</h3>
            <input value={folderName} onChange={(e) => setFolderName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void createFolder()}
              placeholder="Projects" className="glass-input mb-3 w-full rounded-full px-3 py-2 text-sm" autoFocus />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setNewMode('menu')} className="rounded-xl px-3 py-1.5 text-sm text-zinc-500">Back</button>
              <button type="button" onClick={() => void createFolder()} disabled={!folderName.trim()} className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm text-white disabled:opacity-40">Create</button>
            </div>
          </>
        )}
        {newMode === 'text' && (
          <>
            <h3 className="mb-3 font-semibold text-zinc-800">New text file</h3>
            <input value={textName} onChange={(e) => setTextName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void createTextFile()}
              placeholder="notes.txt" className="glass-input mb-3 w-full rounded-full px-3 py-2 text-sm" autoFocus />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setNewMode('menu')} className="rounded-xl px-3 py-1.5 text-sm text-zinc-500">Back</button>
              <button type="button" onClick={() => void createTextFile()} disabled={!textName.trim()} className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm text-white disabled:opacity-40">Create</button>
            </div>
          </>
        )}
      </MotionOverlay>

      {ctx && createPortal(
        <div
          ref={ctxRef}
          className="glass glass-shadow-lg fixed z-[9999] min-w-[180px] overflow-hidden rounded-xl py-1"
          style={(() => {
            const menuW = 200;
            const menuH = 280;
            let left = ctx.x;
            let top = ctx.y;
            if (left + menuW > window.innerWidth - 8) left = Math.max(8, window.innerWidth - menuW - 8);
            if (top + menuH > window.innerHeight - 8) top = Math.max(8, ctx.y - menuH);
            if (top < 8) top = 8;
            if (left < 8) left = 8;
            return { left, top };
          })()}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/50"
            onClick={() => { openFile(ctx.item); setCtx(null); }}>
            <Eye className="h-4 w-4" /> Open
          </button>
          {ctx.item.type === 'file' && (
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/50"
              onClick={() => { void downloadItem(ctx.item); setCtx(null); }}>
              <Download className="h-4 w-4" /> Download
            </button>
          )}
          <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/50"
            onClick={() => { toggleStar(ctx.item.key); setCtx(null); }}>
            <Star className="h-4 w-4" /> {starred.has(ctx.item.key) ? 'Unstar' : 'Star'}
          </button>
          {ctx.item.type === 'folder' && (
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/50"
              onClick={() => { togglePin(ctx.item.key); setCtx(null); toast.success(pinned.includes(ctx.item.key) ? 'Unpinned' : 'Pinned'); }}>
              <Folder className="h-4 w-4" /> {pinned.includes(ctx.item.key) ? 'Unpin' : 'Pin folder'}
            </button>
          )}
          <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/50"
            onClick={() => { setDetailsOpen(true); selectOnly(ctx.item.key); setCtx(null); }}>
            <Info className="h-4 w-4" /> Details
          </button>
          <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/50"
            onClick={() => { toast.message('Share links coming soon'); setCtx(null); }}>
            <Share2 className="h-4 w-4" /> Share
          </button>
          <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/50"
            onClick={(e) => {
              setTagMenu({ key: ctx.item.key, x: e.clientX, y: e.clientY });
              setCtx(null);
            }}>
            <span className="flex h-4 w-4 items-center justify-center gap-px">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            </span>
            Tags…
          </button>
          {ctx.item.type === 'folder' && (
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/50"
              onClick={(e) => {
                setTagMenu({ key: ctx.item.key, x: e.clientX, y: e.clientY });
                setCtx(null);
              }}>
              <Folder className="h-4 w-4" /> Folder color…
            </button>
          )}
          <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50/80"
            onClick={() => { void removeKeys([ctx.item.key]); setCtx(null); }}>
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>,
        document.body,
      )}

      {/* Tag / folder color picker */}
      {tagMenu && createPortal(
        <div
          className="glass glass-shadow-lg fixed z-[9999] min-w-[160px] rounded-xl p-2"
          style={(() => {
            const menuW = 180;
            const menuH = 180;
            let left = tagMenu.x;
            let top = tagMenu.y;
            if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
            if (left < 8) left = 8;
            if (top + menuH > window.innerHeight - 8) top = tagMenu.y - menuH;
            if (top < 8) top = 8;
            return {
              left,
              top,
              maxHeight: 'min(200px, calc(100vh - 16px))',
              overflowY: 'auto' as const,
            };
          })()}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Tags</p>
          <div className="mb-2 flex flex-wrap gap-1.5 px-1">
            {(Object.keys(TAG_COLORS) as TagId[]).map((t) => {
              const on = (tags[tagMenu.key] || []).includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  title={TAG_COLORS[t].label}
                  onClick={() => toggleTag(tagMenu.key, t)}
                  className={`h-5 w-5 rounded-full transition-transform hover:scale-110 ${TAG_COLORS[t].bg} ${on ? 'ring-2 ring-offset-1 ring-zinc-800' : ''}`}
                />
              );
            })}
          </div>
          {filtered.find((i) => i.key === tagMenu.key)?.type === 'folder' && (
            <>
              <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Folder color</p>
              <div className="mb-1 flex flex-wrap gap-1.5 px-1">
                {(Object.keys(TAG_COLORS) as TagId[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    title={TAG_COLORS[t].label}
                    onClick={() => { setFolderColor(tagMenu.key, t); setTagMenu(null); }}
                    className={`h-5 w-5 rounded-full ${TAG_COLORS[t].bg} ${folderColors[tagMenu.key] === t ? 'ring-2 ring-offset-1 ring-zinc-800' : ''}`}
                  />
                ))}
                <button type="button" className="rounded-full px-2 text-[10px] text-zinc-500 hover:bg-zinc-100"
                  onClick={() => { setFolderColor(tagMenu.key, null); setTagMenu(null); }}>
                  Clear
                </button>
              </div>
            </>
          )}
          <button type="button" className="mt-1 w-full rounded-lg px-2 py-1 text-left text-xs text-zinc-500 hover:bg-zinc-100"
            onClick={() => setTagMenu(null)}>
            Done
          </button>
        </div>,
        document.body,
      )}

      {prefix && (
        <button type="button" className="sr-only" onClick={() => setPrefix(parentPrefix(prefix))} aria-hidden>up</button>
      )}
    </div>
  );
}
