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

type DriveItem =
  | { type: 'folder'; key: string; name: string }
  | { type: 'file'; key: string; name: string; size: number; modified: string | null };

type ViewMode = 'grid' | 'list';
type Density = 'comfortable' | 'compact';
type NewMode = 'menu' | 'folder' | 'text';
type PreviewKind = 'image' | 'text' | 'pdf' | 'video' | 'audio' | 'unknown';

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

function previewKind(name: string): PreviewKind {
  const n = name.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/.test(n)) return 'image';
  if (/\.(pdf)$/.test(n)) return 'pdf';
  if (/\.(mp4|webm|mov|avi|mkv|m4v)$/.test(n)) return 'video';
  if (/\.(mp3|wav|ogg|flac|m4a|aac)$/.test(n)) return 'audio';
  if (/\.(js|ts|tsx|jsx|py|html|css|json|md|txt|csv|xml|yml|yaml|toml|sh|rs|go|java|c|cpp|h|rb|php|sql|log)$/.test(n))
    return 'text';
  return 'unknown';
}

function iconFor(item: DriveItem) {
  if (item.type === 'folder') return Folder;
  const kind = previewKind(item.name);
  if (kind === 'image') return ImageIcon;
  if (kind === 'pdf') return FileText;
  if (kind === 'video') return Film;
  if (kind === 'audio') return Music;
  if (kind === 'text') return Code2;
  return FileIcon;
}

/** Middle-truncate so the extension stays visible */
function middleTruncate(name: string, max = 22): string {
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

function parentPrefix(prefix: string) {
  if (!prefix) return '';
  const parts = prefix.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

async function fetchSignedUrl(key: string): Promise<string> {
  const res = await fetch(`/api/drive/signed-url?key=${encodeURIComponent(key)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not sign URL');
  return data.url as string;
}

function GridThumb({
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

function SkeletonGrid({ compact }: { compact: boolean }) {
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

export type { DriveItem, ViewMode, Density, NewMode, PreviewKind };
export {
  formatSize,
  formatDate,
  previewKind,
  iconFor,
  middleTruncate,
  parentPrefix,
  fetchSignedUrl,
  GridThumb,
  SkeletonGrid,
};
