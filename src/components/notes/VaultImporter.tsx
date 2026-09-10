import { useState, type InputHTMLAttributes } from 'react';
import type { Note } from '@/lib/types';
import { draftsFromFiles, draftsFromZip, type ImportDraft } from '@/lib/vault-import';
import { FolderUp, FileUp, Loader2 } from 'lucide-react';

export default function VaultImporter({
  existing,
  onImport,
  onClose,
}: {
  existing: Note[];
  onImport: (rows: ImportDraft[]) => Promise<void>;
  onClose: () => void;
}) {
  const [drafts, setDrafts] = useState<ImportDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const titles = new Set(existing.map((n) => n.title.toLowerCase()));

  const load = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true); setErr('');
    try {
      const list = Array.from(files);
      const zip = list.find((f) => /\.zip$/i.test(f.name));
      const next = zip ? await draftsFromZip(zip) : await draftsFromFiles(list);
      if (!next.length) setErr('No Markdown notes found. Pick a vault folder, .md files, or a .zip.');
      setDrafts(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not read those files.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-zinc-900">Import vault or Markdown</h3>
      <p className="mt-1 text-[11px] text-zinc-500">Same idea as Obsidian: drop a vault folder, loose .md files, or a zipped vault. Folders, frontmatter tags, and [[wikilinks]] are kept. .obsidian config is skipped.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs text-white">
          <FolderUp className="h-3.5 w-3.5" /> Vault folder
          <input type="file" className="hidden" multiple {...({ webkitdirectory: true, directory: true } as InputHTMLAttributes<HTMLInputElement>)} onChange={(e) => void load(e.target.files)} />
        </label>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700">
          <FileUp className="h-3.5 w-3.5" /> .md / .zip
          <input type="file" className="hidden" multiple accept=".md,.markdown,.txt,.zip" onChange={(e) => void load(e.target.files)} />
        </label>
      </div>
      {busy && <p className="mt-3 flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading files…</p>}
      {err && <p className="mt-3 text-xs text-red-600">{err}</p>}
      {drafts.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-zinc-600">{drafts.length} notes ready · {drafts.filter((d) => titles.has(d.title.toLowerCase())).length} titles already exist</p>
          <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-zinc-200 bg-white text-[11px]">
            {drafts.slice(0, 80).map((d) => (
              <div key={d.sourcePath} className="flex justify-between gap-2 border-b border-zinc-100 px-2 py-1">
                <span className="truncate">{d.title}</span>
                <span className="shrink-0 text-zinc-400">{d.folder}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs text-white" onClick={async () => { setBusy(true); await onImport(drafts); setBusy(false); }}>Import {drafts.length}</button>
            <button type="button" className="rounded-lg px-3 py-1.5 text-xs text-zinc-500" onClick={onClose}>Cancel</button>
          </div>
        </div>
      )}
      {!drafts.length && !busy && (
        <button type="button" className="mt-3 text-xs text-zinc-500" onClick={onClose}>Close</button>
      )}
    </div>
  );
}
