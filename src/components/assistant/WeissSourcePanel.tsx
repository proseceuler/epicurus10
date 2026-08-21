import { useState } from 'react';
import { searchAcrossSources, getSourceStatuses, type ResearchSourceId, type ResearchResult } from '@/lib/weissResearch';
import { Search, Loader2, ExternalLink, Lock } from 'lucide-react';

export default function WeissSourcePanel({ query }: { query: string }) {
  const statuses = getSourceStatuses();
  const [enabled, setEnabled] = useState<ResearchSourceId[]>(
    statuses.filter((s) => !s.needsKey || s.hasKey).map((s) => s.id)
  );
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ResearchResult[]>([]);
  const [errors, setErrors] = useState<{ source: ResearchSourceId; message: string }[]>([]);

  function toggle(id: ResearchSourceId) {
    setEnabled((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function run() {
    if (!query.trim() || !enabled.length) return;
    setLoading(true);
    setResults([]);
    setErrors([]);
    const outcome = await searchAcrossSources(query, enabled);
    setResults(outcome.results);
    setErrors(outcome.errors);
    setLoading(false);
  }

  return (
    <div className="mt-3 flex flex-col items-center gap-2.5 text-xs w-full max-w-lg mx-auto">
      <div className="flex flex-wrap gap-1.5 justify-center">
        {statuses.map((s) => {
          const locked = s.needsKey && !s.hasKey;
          return (
            <button
              key={s.id}
              onClick={() => !locked && toggle(s.id)}
              disabled={locked}
              className={`sa-pill ${enabled.includes(s.id) ? 'sa-pill-active' : ''}`}
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.6875rem', opacity: locked ? 0.45 : 1 }}
              title={locked ? `${s.label} requires an API key — add it in Settings` : s.label}
            >
              {locked && <Lock className="w-2.5 h-2.5" />}
              {s.label}
            </button>
          );
        })}
      </div>

      <button onClick={run} disabled={loading || !query.trim() || !enabled.length} className="sa-pill">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
        Cross-reference sources
      </button>

      {errors.length > 0 && (
        <div className="text-[var(--sa-text-dim)] text-center">
          {errors.map((e) => (
            <p key={e.source}>
              {e.source}: {e.message}
            </p>
          ))}
        </div>
      )}

      {results.length > 0 && (
        <ul className="w-full flex flex-col gap-1.5 mt-1">
          {results.map((r) => (
            <li key={r.id} className="sa-result-row">
              <a href={r.url} target="_blank" rel="noreferrer" className="flex items-start gap-1.5 group">
                <ExternalLink className="w-3 h-3 mt-0.5 shrink-0 text-[var(--sa-text-dim)]" />
                <span>
                  <span className="text-[var(--sa-text)] group-hover:underline">{r.title}</span>
                  <span className="text-[var(--sa-text-dim)]">
                    {' '}
                    — {r.authors.slice(0, 2).join(', ')}
                    {r.authors.length > 2 ? ' et al.' : ''} {r.year ? `(${r.year})` : ''} · {r.source}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
