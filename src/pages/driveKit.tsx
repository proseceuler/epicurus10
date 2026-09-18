import { useEffect, useState } from 'react';
import {
  Folder,
  File as FileIcon,
  Image as ImageIcon,
  FileText,
  Film,
  Music,
  Code2,
} from 'lucide-react';

export type DriveItem =
  | { type: 'folder'; key: string; name: string }
  | { type: 'file'; key: string; name: string; size: number; modified: string | null };

export type ViewMode = 'grid' | 'list';
export type Density = 'comfortable' | 'compact';
export type NewMode = 'menu' | 'folder' | 'text';
export type PreviewKind = 'image' | 'text' | 'pdf' | 'video' | 'audio' | 'unknown';
export type SortKey = 'name' | 'size' | 'modified';
export type TypeFilter = 'all' | 'folder' | 'image' | 'video' | 'audio' | 'document' | 'other';
export type ScopeView = 'files' | 'starred' | 'recent';

export type UploadJob = {
  id: string;
  name: string;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
};

const STAR_KEY = 'epicure-drive-starred';
const RECENT_KEY = 'epicure-drive-recent';

export function formatSize(bytes?: number) {
  if (bytes == null || bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

export function formatDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

export function previewKind(name: string): PreviewKind {
  const n = name.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/.test(n)) return 'image';
  if (/\.(pdf)$/.test(n)) return 'pdf';
  if (/\.(mp4|webm|mov|avi|mkv|m4v)$/.test(n)) return 'video';
  if (/\.(mp3|wav|ogg|flac|m4a|aac)$/.test(n)) return 'audio';
  if (/\.(js|ts|tsx|jsx|py|html|css|json|md|txt|csv|xml|yml|yaml|toml|sh|rs|go|java|c|cpp|h|rb|php|sql|log)$/.test(n))
    return 'text';
  return 'unknown';
}

export function iconFor(item: DriveItem) {
  if (item.type === 'folder') return Folder;
  const kind = previewKind(item.name);
  if (kind === 'image') return ImageIcon;
  if (kind === 'pdf') return FileText;
  if (kind === 'video') return Film;
  if (kind === 'audio') return Music;
  if (kind === 'text') return Code2;
  return FileIcon;
}

export function middleTruncate(name: string, max = 22): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf('.');
  const hasExt = dot > 0 && name.length - dot <= 8;
  const ext = hasExt ? name.slice(dot) : '';
  const base = hasExt ? name.slice(0, dot) : name;
  const budget = max - ext.length - 1;
  if (budget < 4) return name.slice(0, max - 1) + '…';
  const head = Math.ceil(budget * 0.55);
  const tail = budget - head;
  return `${base.slice(0, head)}…${base.slice(-tail)}${ext}`;
}

export function parentPrefix(prefix: string) {
  if (!prefix) return '';
  const parts = prefix.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

export async function fetchSignedUrl(key: string): Promise<string> {
  const res = await fetch(`/api/drive/signed-url?key=${encodeURIComponent(key)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not sign URL');
  return data.url as string;
}

export function loadStarred(): Set<string> {
  try {
    const raw = localStorage.getItem(STAR_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function saveStarred(keys: Set<string>) {
  localStorage.setItem(STAR_KEY, JSON.stringify([...keys]));
}

export function loadRecent(): { key: string; name: string; at: number }[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as { key: string; name: string; at: number }[];
  } catch {
    return [];
  }
}

export function pushRecent(item: { key: string; name: string }) {
  const prev = loadRecent().filter((r) => r.key !== item.key);
  const next = [{ key: item.key, name: item.name, at: Date.now() }, ...prev].slice(0, 40);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function typeFilterMatch(item: DriveItem, filter: TypeFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'folder') return item.type === 'folder';
  if (item.type === 'folder') return false;
  const kind = previewKind(item.name);
  if (filter === 'image') return kind === 'image';
  if (filter === 'video') return kind === 'video';
  if (filter === 'audio') return kind === 'audio';
  if (filter === 'document') return kind === 'text' || kind === 'pdf';
  return kind === 'unknown';
}

export function sortItems(items: DriveItem[], sortKey: SortKey, dir: 'asc' | 'desc'): DriveItem[] {
  const mul = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    if (sortKey === 'name') return a.name.localeCompare(b.name) * mul;
    if (sortKey === 'size') {
      const sa = a.type === 'file' ? a.size : 0;
      const sb = b.type === 'file' ? b.size : 0;
      return (sa - sb) * mul;
    }
    const ma = a.type === 'file' && a.modified ? new Date(a.modified).getTime() : 0;
    const mb = b.type === 'file' && b.modified ? new Date(b.modified).getTime() : 0;
    return (ma - mb) * mul;
  });
}


export type TagId = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray';

export const TAG_COLORS: Record<TagId, { bg: string; ring: string; label: string }> = {
  red: { bg: 'bg-red-400', ring: 'ring-red-300', label: 'Red' },
  orange: { bg: 'bg-orange-400', ring: 'ring-orange-300', label: 'Orange' },
  yellow: { bg: 'bg-yellow-400', ring: 'ring-yellow-300', label: 'Yellow' },
  green: { bg: 'bg-emerald-400', ring: 'ring-emerald-300', label: 'Green' },
  blue: { bg: 'bg-sky-400', ring: 'ring-sky-300', label: 'Blue' },
  purple: { bg: 'bg-violet-400', ring: 'ring-violet-300', label: 'Purple' },
  gray: { bg: 'bg-zinc-400', ring: 'ring-zinc-300', label: 'Gray' },
};

export const FOLDER_TINTS: Record<TagId, string> = {
  red: 'text-red-500',
  orange: 'text-orange-500',
  yellow: 'text-amber-500',
  green: 'text-emerald-500',
  blue: 'text-sky-500',
  purple: 'text-violet-500',
  gray: 'text-zinc-500',
};

const TAG_KEY = 'epicure-drive-tags';
const FOLDER_COLOR_KEY = 'epicure-drive-folder-colors';

export function loadTags(): Record<string, TagId[]> {
  try {
    const raw = localStorage.getItem(TAG_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, TagId[]>;
  } catch {
    return {};
  }
}

export function saveTags(map: Record<string, TagId[]>) {
  localStorage.setItem(TAG_KEY, JSON.stringify(map));
}

export function loadFolderColors(): Record<string, TagId> {
  try {
    const raw = localStorage.getItem(FOLDER_COLOR_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, TagId>;
  } catch {
    return {};
  }
}

export function saveFolderColors(map: Record<string, TagId>) {
  localStorage.setItem(FOLDER_COLOR_KEY, JSON.stringify(map));
}

export function GridThumb({
  item,
  urlCache,
  compact,
}: {
  item: DriveItem;
  urlCache: React.MutableRefObject<Map<string, string>>;
  compact: boolean;
}) {
  const Icon = iconFor(item);
  const isImage = item.type === 'file' && previewKind(item.name) === 'image';
  const [src, setSrc] = useState<string | null>(() => (isImage ? urlCache.current.get(item.key) ?? null : null));
  const [failed, setFailed] = useState(false);
  const box = compact ? 'h-14 w-14' : 'h-16 w-16';

  useEffect(() => {
    if (!isImage || failed) return;
    if (urlCache.current.has(item.key)) {
      setSrc(urlCache.current.get(item.key)!);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const url = await fetchSignedUrl(item.key);
        if (cancelled) return;
        urlCache.current.set(item.key, url);
        setSrc(url);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.key, isImage, failed, urlCache]);

  if (isImage && src && !failed) {
    return (
      <div className={`${box} overflow-hidden rounded-xl bg-zinc-100 ring-1 ring-zinc-200/60`}>
        <img
          src={src}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  if (isImage && !failed && !src) {
    return <div className={`${box} animate-pulse rounded-xl bg-zinc-200/70`} />;
  }

  return (
    <div
      className={`${box} flex items-center justify-center rounded-xl bg-zinc-100/80 ring-1 ring-zinc-200/50 transition-colors group-hover:bg-zinc-100`}
    >
      <Icon className={`h-7 w-7 ${item.type === 'folder' ? 'text-amber-600/80' : 'text-zinc-500'}`} />
    </div>
  );
}

export function SkeletonGrid({ compact }: { compact: boolean }) {
  const count = compact ? 12 : 10;
  return (
    <div
      className={`grid ${
        compact
          ? 'grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-7'
          : 'grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6'
      }`}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`flex flex-col items-center gap-1.5 rounded-xl ${compact ? 'p-2' : 'p-2.5'}`}>
          <div className={`${compact ? 'h-14 w-14' : 'h-16 w-16'} animate-pulse rounded-xl bg-zinc-200/70`} />
          <div className="h-2.5 w-16 animate-pulse rounded bg-zinc-200/70" />
          <div className="h-2 w-10 animate-pulse rounded bg-zinc-100" />
        </div>
      ))}
    </div>
  );
}
