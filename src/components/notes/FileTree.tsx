import { useMemo, useState } from 'react';
import type { Note } from '@/lib/types';
import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react';

type Branch = { name: string; path: string; notes: Note[]; kids: Record<string, Branch> };

function grow(notes: Note[]): Branch {
  const root: Branch = { name: 'Vault', path: '', notes: [], kids: {} };
  for (const n of notes) {
    const parts = (n.folder || 'Vault').split('/').filter(Boolean);
    let cur = root;
    for (const part of parts) {
      const path = cur.path ? `${cur.path}/${part}` : part;
      cur.kids[part] ||= { name: part, path, notes: [], kids: {} };
      cur = cur.kids[part];
    }
    cur.notes.push(n);
  }
  return root;
}

function BranchView({
  branch,
  depth,
  selectedId,
  onSelect,
}: {
  branch: Branch;
  depth: number;
  selectedId?: string | null;
  onSelect: (n: Note) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const kids = Object.values(branch.kids).sort((a, b) => a.name.localeCompare(b.name));
  const files = [...branch.notes].sort((a, b) => a.title.localeCompare(b.title));
  return (
    <div>
      {branch.path && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[12px] text-zinc-600 hover:bg-zinc-100" style={{ paddingLeft: 6 + depth * 10 }}>
          {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          <Folder className="h-3 w-3 shrink-0 text-zinc-400" />
          <span className="truncate">{branch.name}</span>
          <span className="ml-auto text-[10px] text-zinc-400">{files.length + kids.length}</span>
        </button>
      )}
      {(open || !branch.path) && (
        <>
          {kids.map((k) => (
            <BranchView key={k.path} branch={k} depth={depth + (branch.path ? 1 : 0)} selectedId={selectedId} onSelect={onSelect} />
          ))}
          {files.map((n) => (
            <button key={n.id} type="button" onClick={() => onSelect(n)} className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[12px] ${selectedId === n.id ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-100'}`} style={{ paddingLeft: 18 + depth * 10 }}>
              <FileText className="h-3 w-3 shrink-0 opacity-60" />
              <span className="truncate">{n.title}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

export default function FileTree({ notes, selectedId, onSelect }: { notes: Note[]; selectedId?: string | null; onSelect: (n: Note) => void }) {
  const tree = useMemo(() => grow(notes), [notes]);
  return (
    <div className="max-h-[46vh] overflow-y-auto pr-1">
      <BranchView branch={tree} depth={0} selectedId={selectedId} onSelect={onSelect} />
    </div>
  );
}
