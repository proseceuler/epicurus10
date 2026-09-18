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
  Upload,
  ChevronRight,
  X,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

type DriveItem =
  | { type: 'folder'; key: string; name: string }
  | { type: 'file'; key: string; name: string; size: number; modified: string | null };

type ViewMode = 'grid' | 'list';

function formatSize(bytes?: number) {
  if (bytes == null || bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

function iconFor(item: DriveItem) {
  if (item.type === 'folder') return Folder;
  const n = item.name.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico)$/.test(n)) return ImageIcon;
  if (/\.(pdf)$/.test(n)) return FileText;
  if (/\.(mp4|webm|mov|avi|mkv)$/.test(n)) return Film;
  if (/\.(mp3|wav|ogg|flac|m4a)$/.test(n)) return Music;
  if (/\.(js|ts|tsx|jsx|py|html|css|json|md|txt)$/.test(n)) return Code2;
  return FileIcon;
}

function parentPrefix(prefix: string) {
  if (!prefix) return '';
  const parts = prefix.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

export default function DrivePage() {
  const [prefix, setPrefix] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [items, setItems] = useState<DriveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; item: DriveItem } | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [folderModal, setFolderModal] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

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
    if (!ctx && !newOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ctxRef.current?.contains(t)) return;
      if (newRef.current?.contains(t)) return;
      setCtx(null);
      setNewOpen(false);
    };
    const id = window.setTimeout(() => document.addEventListener('click', onDoc), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('click', onDoc);
    };
  }, [ctx, newOpen]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  const crumbs = useMemo(() => {
    const parts = prefix.split('/').filter(Boolean);
    const out: { label: string; path: string }[] = [{ label: 'My Files', path: '' }];
    let acc = '';
    for (const p of parts) {
      acc = acc ? `${acc}/${p}` : p;
      out.push({ label: p, path: acc });
    }
    return out;
  }, [prefix]);

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;
    let ok = 0;
    for (const file of files) {
      const form = new FormData();
      form.append('file', file);
      form.append('prefix', prefix);
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
      setFolderModal(false);
      setFolderName('');
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'mkdir failed');
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
      const res = await fetch(`/api/drive/signed-url?key=${encodeURIComponent(item.key)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not sign URL');
      const a = document.createElement('a');
      a.href = data.url;
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
        <button type="button" onClick={() => void load()} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100" title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </button>
        <div className="flex overflow-hidden rounded-lg border border-zinc-200/70">
          <button type="button" onClick={() => setViewMode('grid')} className={`p-1.5 ${viewMode === 'grid' ? 'bg-zinc-900 text-white' : 'text-zinc-500'}`}>
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setViewMode('list')} className={`p-1.5 ${viewMode === 'list' ? 'bg-zinc-900 text-white' : 'text-zinc-500'}`}>
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
            className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Plus className="h-3.5 w-3.5" /> New
          </button>
          {newOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
              <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50" onClick={() => { setNewOpen(false); setFolderModal(true); }}>
                <Folder className="h-4 w-4 text-zinc-500" /> New folder
              </button>
              <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50" onClick={() => { setNewOpen(false); fileInputRef.current?.click(); }}>
                <Upload className="h-4 w-4 text-zinc-500" /> Upload file
              </button>
            </div>
          )}
        </div>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { const files = Array.from(e.target.files || []); if (files.length) void uploadFiles(files); e.target.value = ''; }} />
      </div>

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
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-zinc-400 bg-zinc-900/5 text-sm font-medium text-zinc-700">
            Drop files to upload
          </div>
        )}

        <div className="h-full overflow-auto p-3">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-20 text-sm text-zinc-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
              Loading…
            </div>
          )}

          {!loading && configured === false && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-sm text-zinc-600">
              <Cloud className="h-12 w-12 text-zinc-300" />
              <p className="text-base font-semibold text-zinc-800">Connect Cloudflare R2</p>
              <p className="max-w-md text-xs text-zinc-500">
                Set <code className="rounded bg-zinc-100 px-1">R2_ACCOUNT_ID</code>,{' '}
                <code className="rounded bg-zinc-100 px-1">R2_ACCESS_KEY_ID</code>,{' '}
                <code className="rounded bg-zinc-100 px-1">R2_SECRET_ACCESS_KEY</code>, and{' '}
                <code className="rounded bg-zinc-100 px-1">R2_BUCKET</code> on the server. Use rclone against the same
                bucket for bulk sync — see <code className="rounded bg-zinc-100 px-1">docs/r2-rclone.md</code>.
              </p>
              {error && <p className="max-w-md text-xs text-amber-700">{error}</p>}
            </div>
          )}

          {!loading && configured !== false && error && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-zinc-600">
              <Cloud className="h-10 w-10 text-zinc-300" />
              <p className="max-w-sm text-center">{error}</p>
              <button type="button" onClick={() => void load()} className="rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white">
                Retry
              </button>
            </div>
          )}

          {!loading && configured && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-sm text-zinc-500">
              <Folder className="h-10 w-10 text-zinc-300" />
              <p>{search ? 'No matches' : 'This folder is empty'}</p>
              {!search && <p className="text-xs text-zinc-400">Drop files here or use New → Upload</p>}
            </div>
          )}

          {!loading && configured && !error && filtered.length > 0 && viewMode === 'grid' && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {filtered.map((item) => {
                const Icon = iconFor(item);
                const sel = selected === item.key;
                return (
                  <div
                    key={item.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(item.key)}
                    onDoubleClick={() => {
                      if (item.type === 'folder') setPrefix(item.key);
                      else void downloadItem(item);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setSelected(item.key);
                      setCtx({ x: e.clientX, y: e.clientY, item });
                    }}
                    className={`group relative flex flex-col items-center gap-2 rounded-xl p-3 text-center ${
                      sel ? 'bg-zinc-900/10 ring-1 ring-zinc-300' : 'hover:bg-zinc-100/80'
                    }`}
                  >
                    <Icon className={`h-10 w-10 ${item.type === 'folder' ? 'text-zinc-700' : 'text-zinc-500'}`} />
                    <span className="line-clamp-2 w-full text-xs font-medium text-zinc-800">{item.name}</span>
                    <span className="text-[10px] text-zinc-400">
                      {item.type === 'file' ? formatSize(item.size) : 'Folder'}
                    </span>
                    <button
                      type="button"
                      className="absolute right-1 top-1 rounded-md p-1.5 opacity-0 hover:bg-zinc-200 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCtx({ x: e.clientX, y: e.clientY, item });
                      }}
                    >
                      <MoreVertical className="h-3.5 w-3.5 text-zinc-500" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && configured && !error && filtered.length > 0 && viewMode === 'list' && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200/60 text-[11px] uppercase tracking-wide text-zinc-400">
                  <th className="px-2 py-2 font-medium">Name</th>
                  <th className="hidden px-2 py-2 font-medium sm:table-cell">Size</th>
                  <th className="px-2 py-2 font-medium">Modified</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const Icon = iconFor(item);
                  return (
                    <tr
                      key={item.key}
                      className="cursor-default border-b border-zinc-100 hover:bg-zinc-50"
                      onClick={() => setSelected(item.key)}
                      onDoubleClick={() => {
                        if (item.type === 'folder') setPrefix(item.key);
                        else void downloadItem(item);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setCtx({ x: e.clientX, y: e.clientY, item });
                      }}
                    >
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${item.type === 'folder' ? 'text-zinc-700' : 'text-zinc-500'}`} />
                          <span className="truncate font-medium text-zinc-800">{item.name}</span>
                        </div>
                      </td>
                      <td className="hidden px-2 py-2 text-xs text-zinc-500 sm:table-cell">
                        {item.type === 'file' ? formatSize(item.size) : '—'}
                      </td>
                      <td className="px-2 py-2 text-xs text-zinc-500">
                        {item.type === 'file' ? formatDate(item.modified) : '—'}
                      </td>
                      <td className="px-1">
                        <button type="button" className="rounded p-1 hover:bg-zinc-200" onClick={(e) => { e.stopPropagation(); setCtx({ x: e.clientX, y: e.clientY, item }); }}>
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

      {ctx && (
        <div
          ref={ctxRef}
          className="fixed z-50 min-w-[160px] overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg"
          style={{ left: Math.min(ctx.x, window.innerWidth - 180), top: Math.min(ctx.y, window.innerHeight - 120) }}
          onClick={(e) => e.stopPropagation()}
        >
          {ctx.item.type === 'file' && (
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50" onClick={() => { void downloadItem(ctx.item); setCtx(null); }}>
              <Download className="h-4 w-4" /> Download
            </button>
          )}
          <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50" onClick={() => { void removeItem(ctx.item); setCtx(null); }}>
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      )}

      {folderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/30 p-4" onClick={() => setFolderModal(false)}>
          <div className="glass w-full max-w-sm rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-zinc-800">New folder</h3>
              <button type="button" onClick={() => setFolderModal(false)}><X className="h-4 w-4 text-zinc-500" /></button>
            </div>
            <input
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void createFolder()}
              placeholder="Folder name"
              className="glass-input mb-3 w-full rounded-xl px-3 py-2 text-sm"
              autoFocus
            />
            <button type="button" onClick={() => void createFolder()} className="w-full rounded-xl bg-zinc-900 py-2 text-sm font-medium text-white">
              Create
            </button>
          </div>
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
