import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Cloud,
  Folder,
  File as FileIcon,
  Image as ImageIcon,
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
  Info,
  Pencil,
  RotateCcw,
  Upload,
  Clock,
  ChevronRight,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

declare global {
  interface Window {
    puter?: {
      fs: {
        readdir: (path: string) => Promise<FSItem[]>;
        mkdir: (path: string, options?: { createMissingParents?: boolean }) => Promise<FSItem>;
        write: (path: string, data: string | File | Blob) => Promise<FSItem>;
        rename: (oldPath: string, newPath: string) => Promise<FSItem>;
        delete: (path: string | string[]) => Promise<void>;
        read: (path: string) => Promise<Blob>;
        stat: (path: string) => Promise<FSItem>;
      };
    };
  }
}

export type FSItem = {
  name: string;
  path: string;
  size?: number;
  is_dir?: boolean;
  created?: number;
  modified?: number;
};

const TRASH_PATH = '/.trash';

type ViewMode = 'grid' | 'list';
type SideView = 'myfiles' | 'recent' | 'trash';

function joinPath(...parts: string[]) {
  const cleaned = parts.map((p) => String(p).replace(/^\/+|\/+$/g, '')).filter(Boolean);
  return '/' + cleaned.join('/');
}

function parentPath(p: string) {
  if (p === '/' || !p) return '/';
  const parts = p.replace(/\/+$/, '').split('/').filter(Boolean);
  parts.pop();
  return parts.length ? '/' + parts.join('/') : '/';
}

function formatSize(bytes?: number) {
  if (bytes == null || bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function formatDate(ts?: number) {
  if (!ts) return '—';
  const d = new Date(typeof ts === 'number' ? (ts < 1e12 ? ts * 1000 : ts) : ts);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

function iconFor(item: FSItem) {
  if (item.is_dir) return Folder;
  const n = (item.name || '').toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico)$/.test(n)) return ImageIcon;
  if (/\.(pdf)$/.test(n)) return FileText;
  if (/\.(mp4|webm|mov|avi|mkv)$/.test(n)) return Film;
  if (/\.(mp3|wav|ogg|flac|m4a)$/.test(n)) return Music;
  if (/\.(js|ts|jsx|tsx|py|html|css|json|md|txt|xml|yml|yaml)$/.test(n)) return Code2;
  return FileIcon;
}

function isImageName(name: string) {
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(name);
}

async function ensureTrash() {
  const puter = window.puter;
  if (!puter) return;
  try {
    await puter.fs.stat(TRASH_PATH);
  } catch {
    try {
      await puter.fs.mkdir(TRASH_PATH, { createMissingParents: true });
    } catch {
      /* ignore */
    }
  }
}

async function collectRecent(path: string, depth = 0): Promise<FSItem[]> {
  if (depth > 2 || !window.puter) return [];
  let list: FSItem[] = [];
  try {
    const entries = await window.puter.fs.readdir(path);
    for (const e of entries) {
      if (e.name === '.trash') continue;
      list.push(e);
      if (e.is_dir) {
        const sub = await collectRecent(e.path, depth + 1);
        list = list.concat(sub);
      }
    }
  } catch {
    /* ignore */
  }
  return list;
}

export default function DrivePage() {
  const [sideView, setSideView] = useState<SideView>('myfiles');
  const [currentPath, setCurrentPath] = useState('/');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [items, setItems] = useState<FSItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; item: FSItem } | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [folderModal, setFolderModal] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [renameItem, setRenameItem] = useState<FSItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [infoItem, setInfoItem] = useState<FSItem | null>(null);
  const [previewItem, setPreviewItem] = useState<FSItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!window.puter) {
      setLoading(false);
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      await ensureTrash();
      let next: FSItem[] = [];
      if (sideView === 'recent') {
        const all = await collectRecent('/');
        next = all
          .filter((i) => !i.is_dir && !i.path.startsWith(TRASH_PATH))
          .sort((a, b) => (b.modified || b.created || 0) - (a.modified || a.created || 0))
          .slice(0, 50);
      } else if (sideView === 'trash') {
        next = await window.puter.fs.readdir(TRASH_PATH);
      } else {
        next = await window.puter.fs.readdir(currentPath);
        if (currentPath === '/') {
          next = next.filter((i) => i.name !== '.trash' && i.path !== TRASH_PATH);
        }
      }
      setItems(next);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Could not load files');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [sideView, currentPath]);

  useEffect(() => {
    // Puter injects itself asynchronously after the script loads
    let tries = 0;
    const tick = () => {
      if (window.puter) {
        load();
        return;
      }
      tries += 1;
      if (tries < 40) setTimeout(tick, 150);
      else {
        setLoading(false);
      }
    };
    tick();
  }, [load]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (newRef.current && !newRef.current.contains(e.target as Node)) setNewOpen(false);
      setCtx(null);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i) => (i.name || '').toLowerCase().includes(q));
  }, [items, search]);

  const breadcrumbs = useMemo(() => {
    if (sideView === 'recent') return [{ label: 'Recent', path: null as string | null }];
    if (sideView === 'trash') return [{ label: 'Trash', path: null }];
    const parts = currentPath === '/' ? [] : currentPath.replace(/^\//, '').split('/');
    const crumbs: { label: string; path: string | null }[] = [{ label: 'My Files', path: '/' }];
    let acc = '';
    parts.forEach((p) => {
      acc += '/' + p;
      crumbs.push({ label: p, path: acc });
    });
    return crumbs;
  }, [sideView, currentPath]);

  const openFolder = (path: string) => {
    setSideView('myfiles');
    setCurrentPath(path);
    setSelectedPath(null);
  };

  const uploadFiles = async (files: File[]) => {
    if (!window.puter || !files.length) return;
    const base = sideView === 'trash' ? '/' : currentPath;
    let ok = 0;
    for (const file of files) {
      try {
        await window.puter.fs.write(joinPath(base, file.name), file);
        ok += 1;
      } catch (err) {
        console.error(err);
        toast.error(`Failed to upload ${file.name}`);
      }
    }
    if (ok) toast.success(`Uploaded ${ok} file${ok > 1 ? 's' : ''}`);
    if (sideView !== 'trash') load();
  };

  const moveToTrash = async (item: FSItem) => {
    if (!window.puter) return;
    await ensureTrash();
    let dest = joinPath(TRASH_PATH, item.name);
    try {
      await window.puter.fs.stat(dest);
      dest = joinPath(TRASH_PATH, `${Date.now()}_${item.name}`);
    } catch {
      /* free */
    }
    await window.puter.fs.rename(item.path, dest);
    toast.success(`Moved "${item.name}" to Trash`);
    load();
  };

  const restore = async (item: FSItem) => {
    if (!window.puter) return;
    let dest = joinPath('/', item.name);
    try {
      await window.puter.fs.stat(dest);
      dest = joinPath('/', `${Date.now()}_${item.name}`);
    } catch {
      /* free */
    }
    await window.puter.fs.rename(item.path, dest);
    toast.success(`Restored "${item.name}"`);
    load();
  };

  const deleteForever = async (item: FSItem) => {
    if (!window.puter) return;
    if (!confirm(`Permanently delete "${item.name}"? This cannot be undone.`)) return;
    await window.puter.fs.delete(item.path);
    toast.success(`Deleted ${item.name}`);
    load();
  };

  const downloadItem = async (item: FSItem) => {
    if (!window.puter) return;
    if (item.is_dir) {
      toast.message('Folder download not supported');
      return;
    }
    try {
      const blob = await window.puter.fs.read(item.path);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Download started');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download failed');
    }
  };

  const openPreview = async (item: FSItem) => {
    if (!window.puter || item.is_dir) return;
    setPreviewItem(item);
    setPreviewUrl(null);
    if (isImageName(item.name)) {
      try {
        const blob = await window.puter.fs.read(item.path);
        setPreviewUrl(URL.createObjectURL(blob));
      } catch {
        /* show download prompt */
      }
    }
  };

  const onItemActivate = (item: FSItem) => {
    if (item.is_dir) {
      if (sideView === 'trash') return;
      openFolder(item.path);
    } else {
      openPreview(item);
    }
  };

  const createFolder = async () => {
    const name = folderName.trim();
    if (!name || !window.puter) return;
    const path = joinPath(sideView === 'trash' ? '/' : currentPath, name);
    try {
      await window.puter.fs.mkdir(path);
      toast.success(`Folder "${name}" created`);
      setFolderModal(false);
      setFolderName('');
      if (sideView !== 'myfiles') {
        setSideView('myfiles');
        setCurrentPath(parentPath(path));
      }
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create folder');
    }
  };

  const commitRename = async () => {
    if (!renameItem || !window.puter) return;
    const newName = renameValue.trim();
    if (!newName) return;
    const newPath = joinPath(parentPath(renameItem.path), newName);
    try {
      await window.puter.fs.rename(renameItem.path, newPath);
      toast.success('Renamed');
      setRenameItem(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rename failed');
    }
  };

  const inTrash =
    sideView === 'trash' || (ctx?.item.path.startsWith(TRASH_PATH) ?? false);

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[420px] flex-col gap-3">
      {/* Top bar */}
      <div className="glass flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm">
          <Cloud className="h-4 w-4 shrink-0 text-zinc-500" />
          {breadcrumbs.map((c, i) => {
            const last = i === breadcrumbs.length - 1;
            return (
              <span key={`${c.label}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />}
                <button
                  type="button"
                  disabled={last || c.path == null}
                  onClick={() => c.path != null && openFolder(c.path)}
                  className={`truncate rounded-md px-1.5 py-0.5 ${
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

        <div className="flex overflow-hidden rounded-lg border border-zinc-200/70">
          <button
            type="button"
            title="Grid view"
            onClick={() => setViewMode('grid')}
            className={`p-1.5 ${
              viewMode === 'grid' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100'
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="List view"
            onClick={() => setViewMode('list')}
            className={`p-1.5 ${
              viewMode === 'list' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100'
            }`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>

        <div className="relative" ref={newRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setNewOpen((v) => !v);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800"
          >
            <Plus className="h-3.5 w-3.5" /> New
          </button>
          {newOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50"
                onClick={() => {
                  setNewOpen(false);
                  setFolderName('');
                  setFolderModal(true);
                }}
              >
                <Folder className="h-4 w-4 text-zinc-500" /> New folder
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50"
                onClick={() => {
                  setNewOpen(false);
                  fileInputRef.current?.click();
                }}
              >
                <Upload className="h-4 w-4 text-zinc-500" /> Upload file
              </button>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length) uploadFiles(files);
            e.target.value = '';
          }}
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[11rem_minmax(0,1fr)]">
        {/* Sidebar */}
        <aside className="glass flex h-fit flex-col gap-0.5 rounded-2xl p-2">
          {(
            [
              { id: 'myfiles' as const, label: 'My Files', icon: Folder },
              { id: 'recent' as const, label: 'Recent', icon: Clock },
              { id: 'trash' as const, label: 'Trash', icon: Trash2 },
            ] as const
          ).map((s) => {
            const Icon = s.icon;
            const active = sideView === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSideView(s.id);
                  if (s.id === 'myfiles') setCurrentPath('/');
                  setSelectedPath(null);
                }}
                className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm transition-colors ${
                  active ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {s.label}
              </button>
            );
          })}
          <p className="mt-2 px-2 text-[10px] leading-relaxed text-zinc-400">
            Powered by Puter.js. Sign-in appears on first use.
          </p>
        </aside>

        {/* File area */}
        <div
          className="glass relative min-h-0 overflow-hidden rounded-2xl"
          onDragEnter={(e) => {
            e.preventDefault();
            if (sideView !== 'trash') setDragging(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (sideView === 'trash') return;
            const files = Array.from(e.dataTransfer.files || []);
            if (files.length) uploadFiles(files);
          }}
        >
          {dragging && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-zinc-400 bg-zinc-900/5 text-sm font-medium text-zinc-700">
              Drop files to upload
            </div>
          )}

          <div className="h-full overflow-auto p-3">
            {!window.puter && !loading && (
              <div className="flex flex-col items-center justify-center gap-2 py-20 text-sm text-zinc-500">
                <Cloud className="h-10 w-10 text-zinc-300" />
                <p>Loading Puter.js…</p>
                <p className="text-xs">If this persists, refresh the page.</p>
              </div>
            )}

            {loading && (
              <div className="flex items-center justify-center gap-2 py-20 text-sm text-zinc-500">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
                Loading…
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-20 text-sm text-zinc-500">
                <Folder className="h-10 w-10 text-zinc-300" />
                <p>
                  {search
                    ? 'No matching files'
                    : sideView === 'trash'
                      ? 'Trash is empty'
                      : 'This folder is empty'}
                </p>
                {!search && sideView === 'myfiles' && (
                  <p className="text-xs">Drop files here or use New → Upload</p>
                )}
              </div>
            )}

            {!loading && filtered.length > 0 && viewMode === 'grid' && (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
                {filtered.map((item) => {
                  const Icon = iconFor(item);
                  const sel = selectedPath === item.path;
                  return (
                    <div
                      key={item.path}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedPath(item.path)}
                      onDoubleClick={() => onItemActivate(item)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setSelectedPath(item.path);
                        setCtx({ x: e.clientX, y: e.clientY, item });
                      }}
                      className={`group relative cursor-pointer rounded-xl border p-3 text-center transition-colors ${
                        sel
                          ? 'border-zinc-800 bg-zinc-100/80'
                          : 'border-transparent hover:bg-zinc-100/70'
                      }`}
                    >
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded-md p-1 opacity-0 hover:bg-white group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setCtx({ x: r.left, y: r.bottom + 4, item });
                        }}
                      >
                        <MoreVertical className="h-3.5 w-3.5 text-zinc-500" />
                      </button>
                      <Icon className={`mx-auto mb-2 h-9 w-9 ${item.is_dir ? 'text-zinc-700' : 'text-zinc-400'}`} />
                      <div className="truncate text-xs font-medium text-zinc-800" title={item.name}>
                        {item.name}
                      </div>
                      <div className="mt-0.5 text-[10px] text-zinc-400">
                        {formatDate(item.modified || item.created)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!loading && filtered.length > 0 && viewMode === 'list' && (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200/70 text-xs text-zinc-500">
                    <th className="px-2 py-2 font-medium">Name</th>
                    <th className="px-2 py-2 font-medium">Type</th>
                    <th className="px-2 py-2 font-medium">Size</th>
                    <th className="px-2 py-2 font-medium">Modified</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const Icon = iconFor(item);
                    const sel = selectedPath === item.path;
                    const type = item.is_dir
                      ? 'Folder'
                      : (item.name.split('.').pop() || 'File').toUpperCase();
                    return (
                      <tr
                        key={item.path}
                        onClick={() => setSelectedPath(item.path)}
                        onDoubleClick={() => onItemActivate(item)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setSelectedPath(item.path);
                          setCtx({ x: e.clientX, y: e.clientY, item });
                        }}
                        className={`cursor-pointer border-b border-zinc-100 ${
                          sel ? 'bg-zinc-100' : 'hover:bg-zinc-50'
                        }`}
                      >
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <Icon className={`h-4 w-4 shrink-0 ${item.is_dir ? 'text-zinc-700' : 'text-zinc-400'}`} />
                            <span className="truncate">{item.name}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-zinc-500">{type}</td>
                        <td className="px-2 py-2 text-zinc-500">
                          {item.is_dir ? '—' : formatSize(item.size)}
                        </td>
                        <td className="px-2 py-2 text-zinc-500">
                          {formatDate(item.modified || item.created)}
                        </td>
                        <td className="px-1 py-2">
                          <button
                            type="button"
                            className="rounded-md p-1 hover:bg-zinc-200/60"
                            onClick={(e) => {
                              e.stopPropagation();
                              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setCtx({ x: r.left, y: r.bottom + 4, item });
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
      </div>

      {/* Context menu */}
      {ctx && (
        <div
          className="fixed z-50 min-w-[180px] overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-xl"
          style={{
            left: Math.min(ctx.x, window.innerWidth - 200),
            top: Math.min(ctx.y, window.innerHeight - 220),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <CtxBtn
            icon={Pencil}
            label="Rename"
            onClick={() => {
              setRenameItem(ctx.item);
              setRenameValue(ctx.item.name);
              setCtx(null);
            }}
          />
          <CtxBtn
            icon={Download}
            label="Download"
            onClick={() => {
              downloadItem(ctx.item);
              setCtx(null);
            }}
          />
          <CtxBtn
            icon={Info}
            label="Get info"
            onClick={() => {
              setInfoItem(ctx.item);
              setCtx(null);
            }}
          />
          <div className="my-1 h-px bg-zinc-100" />
          {inTrash ? (
            <>
              <CtxBtn
                icon={RotateCcw}
                label="Restore"
                onClick={() => {
                  restore(ctx.item);
                  setCtx(null);
                }}
              />
              <CtxBtn
                icon={Trash2}
                label="Delete forever"
                danger
                onClick={() => {
                  deleteForever(ctx.item);
                  setCtx(null);
                }}
              />
            </>
          ) : (
            <CtxBtn
              icon={Trash2}
              label="Move to Trash"
              danger
              onClick={() => {
                moveToTrash(ctx.item);
                setCtx(null);
              }}
            />
          )}
        </div>
      )}

      {/* New folder modal */}
      {folderModal && (
        <Modal title="New folder" onClose={() => setFolderModal(false)}>
          <input
            autoFocus
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createFolder()}
            placeholder="Folder name"
            className="glass-input mb-4 w-full rounded-xl px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setFolderModal(false)}
              className="rounded-xl px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={createFolder}
              className="rounded-xl bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
            >
              Create
            </button>
          </div>
        </Modal>
      )}

      {/* Rename modal */}
      {renameItem && (
        <Modal title="Rename" onClose={() => setRenameItem(null)}>
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commitRename()}
            className="glass-input mb-4 w-full rounded-xl px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRenameItem(null)}
              className="rounded-xl px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={commitRename}
              className="rounded-xl bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
            >
              Rename
            </button>
          </div>
        </Modal>
      )}

      {/* Info modal */}
      {infoItem && (
        <Modal title={infoItem.name} onClose={() => setInfoItem(null)}>
          <div className="mb-4 grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-2 text-sm">
            <span className="text-zinc-500">Type</span>
            <span>{infoItem.is_dir ? 'Folder' : 'File'}</span>
            <span className="text-zinc-500">Size</span>
            <span>{infoItem.is_dir ? '—' : formatSize(infoItem.size)}</span>
            <span className="text-zinc-500">Path</span>
            <span className="break-all">{infoItem.path}</span>
            <span className="text-zinc-500">Created</span>
            <span>{formatDate(infoItem.created)}</span>
            <span className="text-zinc-500">Modified</span>
            <span>{formatDate(infoItem.modified)}</span>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setInfoItem(null)}
              className="rounded-xl px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              Close
            </button>
          </div>
        </Modal>
      )}

      {/* Preview modal */}
      {previewItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm">
          <div className="glass flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200/60 px-4 py-3">
              <h3 className="truncate text-sm font-semibold text-zinc-900">{previewItem.name}</h3>
              <button
                type="button"
                onClick={() => {
                  setPreviewItem(null);
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                }}
                className="rounded-lg p-1.5 hover:bg-zinc-100"
              >
                <X className="h-4 w-4 text-zinc-500" />
              </button>
            </div>
            <div className="flex min-h-[200px] max-h-[70vh] items-center justify-center overflow-auto p-6">
              {previewUrl ? (
                <img src={previewUrl} alt={previewItem.name} className="max-h-[65vh] max-w-full rounded-lg" />
              ) : (
                <div className="text-center text-sm text-zinc-500">
                  <p>Preview not available for this file type.</p>
                  <button
                    type="button"
                    onClick={() => downloadItem(previewItem)}
                    className="mt-3 rounded-xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white"
                  >
                    Download {previewItem.name}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CtxBtn({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50 ${
        danger ? 'text-red-600' : 'text-zinc-700'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm">
      <div className="glass w-full max-w-md rounded-2xl p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-zinc-900">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-zinc-100">
            <X className="h-4 w-4 text-zinc-500" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
