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
        readdir: (path: string, options?: Record<string, unknown>) => Promise<FSItem[]>;
        mkdir: (path: string, options?: { createMissingParents?: boolean; overwrite?: boolean; dedupeName?: boolean }) => Promise<FSItem>;
        write: (path: string, data: string | File | Blob) => Promise<FSItem>;
        rename: (oldPath: string, newPath: string) => Promise<FSItem>;
        delete: (path: string | string[]) => Promise<void>;
        read: (path: string) => Promise<Blob>;
        stat: (path: string) => Promise<FSItem>;
      };
      auth?: {
        isSignedIn: () => boolean;
        signIn: () => Promise<unknown>;
        signOut: () => void;
        getUser: () => Promise<{ username?: string; uuid?: string } | null>;
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

const APP_ROOT = '.';
const TRASH_PATH = '.trash';

type ViewMode = 'grid' | 'list';
type SideView = 'myfiles' | 'recent' | 'trash';

/** Join app-relative Puter paths (root is "." = app AppData sandbox). */
function joinPath(...parts: string[]) {
  const cleaned = parts
    .flatMap((p) => String(p).split('/'))
    .map((p) => p.trim())
    .filter((p) => p && p !== '.');
  if (!cleaned.length) return APP_ROOT;
  return cleaned.join('/');
}

function parentPath(p: string) {
  if (!p || p === APP_ROOT || p === './' || p === '/') return APP_ROOT;
  const parts = String(p).split('/').filter((x) => x && x !== '.');
  parts.pop();
  return parts.length ? parts.join('/') : APP_ROOT;
}

function isTrashPath(p: string) {
  const n = String(p || '').replace(/^\.\//, '');
  return n === TRASH_PATH || n.startsWith(TRASH_PATH + '/');
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

async function collectRecent(path: string = APP_ROOT, depth = 0): Promise<FSItem[]> {
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
  const [currentPath, setCurrentPath] = useState(APP_ROOT);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [items, setItems] = useState<FSItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [puterReady, setPuterReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
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

  const refreshAuth = useCallback(async () => {
    const puter = window.puter;
    if (!puter?.auth) {
      setSignedIn(false);
      setUsername(null);
      return false;
    }
    try {
      const ok = Boolean(puter.auth.isSignedIn?.());
      setSignedIn(ok);
      if (ok) {
        try {
          const user = await puter.auth.getUser?.();
          setUsername(user?.username || null);
        } catch {
          setUsername(null);
        }
      } else {
        setUsername(null);
      }
      return ok;
    } catch {
      setSignedIn(false);
      setUsername(null);
      return false;
    }
  }, []);

  const load = useCallback(async () => {
    const puter = window.puter;
    if (!puter?.fs) {
      setLoading(false);
      setItems([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const ok = await refreshAuth();
      if (!ok) {
        // Do not call FS without a signed-in session — popup auth must be user-initiated
        setItems([]);
        setLoading(false);
        return;
      }

      await ensureTrash();
      let next: FSItem[] = [];
      if (sideView === 'recent') {
        const all = await collectRecent(APP_ROOT);
        next = all
          .filter((i) => !i.is_dir && !isTrashPath(i.path || i.name))
          .sort((a, b) => (b.modified || b.created || 0) - (a.modified || a.created || 0))
          .slice(0, 50);
      } else if (sideView === 'trash') {
        try {
          next = await puter.fs.readdir(TRASH_PATH);
        } catch {
          next = [];
        }
      } else {
        const path = currentPath || APP_ROOT;
        next = await puter.fs.readdir(path);
        // hide internal trash folder from My Files root
        if (path === APP_ROOT || path === './' || path === '.') {
          next = next.filter((i) => (i.name || '') !== '.trash' && !isTrashPath(i.path || ''));
        }
      }
      setItems(Array.isArray(next) ? next : []);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Could not load files';
      // Common when not signed in / popup blocked
      if (/auth|sign.?in|permission|denied|unauthorized|login/i.test(msg)) {
        setSignedIn(false);
        setLoadError('Sign in with Puter to open your personal cloud drive.');
      } else {
        setLoadError(msg);
      }
      toast.error(msg);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [sideView, currentPath, refreshAuth]);

  const signIn = useCallback(async () => {
    const puter = window.puter;
    if (!puter?.auth?.signIn) {
      toast.error('Puter auth is unavailable');
      return;
    }
    try {
      setLoading(true);
      setLoadError(null);
      await puter.auth.signIn();
      await refreshAuth();
      await load();
      toast.success('Signed in to Puter');
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Sign-in failed';
      setLoadError(msg);
      toast.error(msg);
      setLoading(false);
    }
  }, [load, refreshAuth]);

  useEffect(() => {
    let tries = 0;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (window.puter) {
        setPuterReady(true);
        const ok = await refreshAuth();
        if (ok) void load();
        else {
          setLoading(false);
          setItems([]);
        }
        return;
      }
      tries += 1;
      if (tries < 80) setTimeout(tick, 200);
      else {
        setLoading(false);
        setLoadError('Puter.js did not load. Check your network or ad-blocker, then refresh.');
      }
    };
    void tick();
    return () => { cancelled = true; };
  }, [load, refreshAuth]);

  const ctxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ctx && !newOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (newRef.current?.contains(target)) return;
      if (ctxRef.current?.contains(target)) return;
      setNewOpen(false);
      setCtx(null);
    };
    const id = window.setTimeout(() => document.addEventListener('click', onDoc), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('click', onDoc);
    };
  }, [ctx, newOpen]);

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
    const raw = (currentPath || APP_ROOT).replace(/^\.\//, '').replace(/^\./, '');
    const parts = !raw || raw === APP_ROOT ? [] : raw.split('/').filter(Boolean);
    const crumbs: { label: string; path: string | null }[] = [{ label: 'My Files', path: APP_ROOT }];
    let acc = '';
    parts.forEach((p) => {
      acc = acc ? `${acc}/${p}` : p;
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
    const base = sideView === 'trash' ? APP_ROOT : currentPath;
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
    let dest = joinPath(APP_ROOT, item.name);
    try {
      await window.puter.fs.stat(dest);
      dest = joinPath(APP_ROOT, `${Date.now()}_${item.name}`);
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
    const path = joinPath(sideView === 'trash' ? APP_ROOT : currentPath, name);
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
    sideView === 'trash' || isTrashPath(ctx?.item.path || '');

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[420px] flex-col gap-3">
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
            <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
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
                  if (s.id === 'myfiles') setCurrentPath(APP_ROOT);
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
          <div className="mt-3 space-y-1.5 border-t border-zinc-200/50 px-2 pt-3">
            {signedIn ? (
              <>
                <p className="truncate text-[11px] font-medium text-zinc-700">
                  {username ? `@${username}` : 'Signed in'}
                </p>
                <p className="text-[10px] leading-relaxed text-zinc-400">
                  Personal Puter drive · app sandbox · your account storage
                </p>
                <button
                  type="button"
                  className="text-[10px] font-medium text-zinc-500 hover:text-zinc-800"
                  onClick={() => {
                    window.puter?.auth?.signOut?.();
                    setSignedIn(false);
                    setUsername(null);
                    setItems([]);
                    setLoadError(null);
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <p className="text-[10px] leading-relaxed text-zinc-400">
                Sign in with your Puter account to use unlimited personal cloud storage (User-Pays model).
              </p>
            )}
          </div>
        </aside>

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
            {!puterReady && !loading && (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-sm text-zinc-500">
                <Cloud className="h-10 w-10 text-zinc-300" />
                <p>{loadError || 'Puter.js is not available'}</p>
                <p className="max-w-xs text-center text-xs text-zinc-400">
                  Cloud Drive needs Puter.js. Disable blockers for this site, then refresh.
                </p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
                >
                  Refresh
                </button>
              </div>
            )}

            {loading && (
              <div className="flex items-center justify-center gap-2 py-20 text-sm text-zinc-500">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
                Loading…
              </div>
            )}

            {!loading && puterReady && !signedIn && (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-sm text-zinc-600">
                <Cloud className="h-12 w-12 text-zinc-300" />
                <p className="text-base font-semibold text-zinc-800">Connect your Puter drive</p>
                <p className="max-w-sm text-center text-xs text-zinc-500">
                  Sign in with your Puter account to load files. Storage is on your account (User-Pays) — you are the owner, not the app host.
                </p>
                {loadError && <p className="max-w-sm text-center text-xs text-amber-700">{loadError}</p>}
                <button
                  type="button"
                  onClick={() => void signIn()}
                  className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Sign in with Puter
                </button>
              </div>
            )}

            {!loading && puterReady && signedIn && loadError && (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-sm text-zinc-500">
                <Cloud className="h-10 w-10 text-zinc-300" />
                <p className="max-w-sm text-center">{loadError}</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => void load()}
                    className="rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => void signIn()}
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800"
                  >
                    Re-authenticate
                  </button>
                </div>
              </div>
            )}

            {!loading && puterReady && signedIn && !loadError && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-20 text-sm text-zinc-500">
                <Folder className="h-10 w-10 text-zinc-300" />
                <p>{search ? 'No matches' : sideView === 'trash' ? 'Trash is empty' : 'This folder is empty'}</p>
                {!search && sideView === 'myfiles' && (
                  <p className="text-xs text-zinc-400">Drop files here or use New → Upload</p>
                )}
              </div>
            )}

            {!loading && puterReady && signedIn && !loadError && filtered.length > 0 && viewMode === 'grid' && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
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
                      className={`group relative flex flex-col items-center gap-2 rounded-xl p-3 text-center transition-colors ${
                        sel ? 'bg-zinc-900/10 ring-1 ring-zinc-300' : 'hover:bg-zinc-100/80'
                      }`}
                    >
                      <Icon className={`h-10 w-10 ${item.is_dir ? 'text-zinc-700' : 'text-zinc-500'}`} />
                      <span className="line-clamp-2 w-full text-xs font-medium text-zinc-800">{item.name}</span>
                      <span className="text-[10px] text-zinc-400">{formatDate(item.modified || item.created)}</span>
                      <button
                        type="button"
                        className="absolute right-1 top-1 z-10 rounded-md p-1.5 opacity-70 hover:bg-zinc-200 hover:opacity-100 group-hover:opacity-100 sm:opacity-0"
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

            {!loading && puterReady && signedIn && !loadError && filtered.length > 0 && viewMode === 'list' && (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200/70 text-[11px] uppercase tracking-wide text-zinc-400">
                    <th className="px-2 py-2 font-medium">Name</th>
                    <th className="hidden px-2 py-2 font-medium sm:table-cell">Type</th>
                    <th className="hidden px-2 py-2 font-medium md:table-cell">Size</th>
                    <th className="px-2 py-2 font-medium">Modified</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const Icon = iconFor(item);
                    const sel = selectedPath === item.path;
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
                        className={`cursor-default border-b border-zinc-100 ${sel ? 'bg-zinc-100' : 'hover:bg-zinc-50'}`}
                      >
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <Icon className={`h-4 w-4 shrink-0 ${item.is_dir ? 'text-zinc-700' : 'text-zinc-500'}`} />
                            <span className="truncate font-medium text-zinc-800">{item.name}</span>
                          </div>
                        </td>
                        <td className="hidden px-2 py-2 text-xs text-zinc-500 sm:table-cell">
                          {item.is_dir ? 'Folder' : (item.name.split('.').pop() || 'File').toUpperCase()}
                        </td>
                        <td className="hidden px-2 py-2 text-xs tabular-nums text-zinc-500 md:table-cell">
                          {item.is_dir ? '—' : formatSize(item.size)}
                        </td>
                        <td className="px-2 py-2 text-xs text-zinc-500">{formatDate(item.modified || item.created)}</td>
                        <td className="px-1">
                          <button
                            type="button"
                            className="rounded p-1 hover:bg-zinc-200"
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
      </div>

      {ctx && (
        <div
          ref={ctxRef}
          className="fixed z-[80] min-w-[11rem] overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-xl"
          style={{ left: Math.min(ctx.x, window.innerWidth - 180), top: Math.min(ctx.y, window.innerHeight - 220) }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-zinc-50"
            onClick={() => {
              setRenameItem(ctx.item);
              setRenameValue(ctx.item.name);
              setCtx(null);
            }}
          >
            <Pencil className="h-3.5 w-3.5 text-zinc-500" /> Rename
          </button>
          {!inTrash && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-zinc-50"
              onClick={() => {
                moveToTrash(ctx.item);
                setCtx(null);
              }}
            >
              <Trash2 className="h-3.5 w-3.5 text-zinc-500" /> Move to Trash
            </button>
          )}
          {inTrash && (
            <>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-zinc-50"
                onClick={() => {
                  restore(ctx.item);
                  setCtx(null);
                }}
              >
                <RotateCcw className="h-3.5 w-3.5 text-zinc-500" /> Restore
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                onClick={() => {
                  deleteForever(ctx.item);
                  setCtx(null);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete forever
              </button>
            </>
          )}
          {!ctx.item.is_dir && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-zinc-50"
              onClick={() => {
                downloadItem(ctx.item);
                setCtx(null);
              }}
            >
              <Download className="h-3.5 w-3.5 text-zinc-500" /> Download
            </button>
          )}
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-zinc-50"
            onClick={() => {
              setInfoItem(ctx.item);
              setCtx(null);
            }}
          >
            <Info className="h-3.5 w-3.5 text-zinc-500" /> Get info
          </button>
        </div>
      )}

      {folderModal && (
        <Modal title="New folder" onClose={() => setFolderModal(false)}>
          <input
            autoFocus
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createFolder()}
            placeholder="Folder name"
            className="glass-input mb-3 w-full rounded-xl px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setFolderModal(false)} className="rounded-xl px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100">
              Cancel
            </button>
            <button type="button" onClick={createFolder} className="rounded-xl bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white">
              Create
            </button>
          </div>
        </Modal>
      )}

      {renameItem && (
        <Modal title="Rename" onClose={() => setRenameItem(null)}>
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commitRename()}
            className="glass-input mb-3 w-full rounded-xl px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRenameItem(null)} className="rounded-xl px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100">
              Cancel
            </button>
            <button type="button" onClick={commitRename} className="rounded-xl bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white">
              Save
            </button>
          </div>
        </Modal>
      )}

      {infoItem && (
        <Modal title="Info" onClose={() => setInfoItem(null)}>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-zinc-500">Name</dt><dd className="truncate font-medium text-zinc-800">{infoItem.name}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-zinc-500">Type</dt><dd className="text-zinc-800">{infoItem.is_dir ? 'Folder' : 'File'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-zinc-500">Size</dt><dd className="tabular-nums text-zinc-800">{infoItem.is_dir ? '—' : formatSize(infoItem.size)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-zinc-500">Created</dt><dd className="text-zinc-800">{formatDate(infoItem.created)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-zinc-500">Modified</dt><dd className="text-zinc-800">{formatDate(infoItem.modified)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-zinc-500">Path</dt><dd className="truncate font-mono text-xs text-zinc-600">{infoItem.path}</dd></div>
          </dl>
        </Modal>
      )}

      {previewItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm" onClick={() => { setPreviewItem(null); setPreviewUrl(null); }}>
          <div className="glass max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="truncate font-semibold text-zinc-900">{previewItem.name}</h3>
              <button type="button" onClick={() => { setPreviewItem(null); setPreviewUrl(null); }} className="rounded-lg p-1 hover:bg-zinc-100">
                <X className="h-4 w-4 text-zinc-500" />
              </button>
            </div>
            {previewUrl ? (
              <img src={previewUrl} alt={previewItem.name} className="mx-auto max-h-[70vh] rounded-lg object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-3 py-10 text-sm text-zinc-600">
                <FileIcon className="h-12 w-12 text-zinc-300" />
                <p>Preview not available for this file type.</p>
                <button
                  type="button"
                  onClick={() => downloadItem(previewItem)}
                  className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
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
