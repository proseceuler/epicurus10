import { useRef, useState, useCallback } from 'react';
import { checkGrammar, type OrpheusMatch } from '@/lib/orpheus';

interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  rows?: number;
}

/**
 * A textarea with passive inline grammar checking (Orpheus), styled via
 * `className` exactly like a normal <textarea>. Uses a transparent-text
 * textarea layered over a matching backdrop div that renders the wavy
 * underlines, so caret/selection/scroll behave like a native textarea.
 */
export default function OrpheusTextarea({ value, onChange, className = '', placeholder, rows }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [matches, setMatches] = useState<OrpheusMatch[]>([]);
  const [active, setActive] = useState<{ match: OrpheusMatch; top: number; left: number } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runCheck = useCallback((text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        setMatches(await checkGrammar(text));
      } catch {
        setMatches([]);
      }
    }, 800);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value);
    runCheck(e.target.value);
    setActive(null);
  }

  function handleScroll() {
    if (backdropRef.current && taRef.current) {
      backdropRef.current.scrollTop = taRef.current.scrollTop;
      backdropRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  }

  function applyFix(match: OrpheusMatch, replacement: string) {
    const next = value.slice(0, match.offset) + replacement + value.slice(match.offset + match.length);
    onChange(next);
    setMatches((prev) => prev.filter((m) => m.id !== match.id));
    setActive(null);
    runCheck(next);
  }

  function dismiss(id: string) {
    setMatches((prev) => prev.filter((m) => m.id !== id));
    setActive(null);
  }

  function renderBackdrop() {
    if (!matches.length) return value;
    let cursor = 0;
    const sorted = [...matches].sort((a, b) => a.offset - b.offset);
    const nodes: React.ReactNode[] = [];
    sorted.forEach((m) => {
      if (m.offset < cursor) return;
      if (m.offset > cursor) nodes.push(value.slice(cursor, m.offset));
      const color = m.category === 'style' ? 'orpheus-underline-amber' : 'orpheus-underline-red';
      nodes.push(
        <span
          key={m.id}
          className={`orpheus-flag ${color}`}
          onClick={(e) => {
            const rect = (e.target as HTMLElement).getBoundingClientRect();
            const wrapRect = (e.target as HTMLElement).closest('.orpheus-wrap')?.getBoundingClientRect();
            setActive({
              match: m,
              top: rect.bottom - (wrapRect?.top || 0) + 4,
              left: rect.left - (wrapRect?.left || 0),
            });
          }}
        >
          {value.slice(m.offset, m.offset + m.length)}
        </span>
      );
      cursor = m.offset + m.length;
    });
    if (cursor < value.length) nodes.push(value.slice(cursor));
    return nodes;
  }

  return (
    <div className="orpheus-wrap relative">
      <div
        ref={backdropRef}
        aria-hidden
        className={`${className} orpheus-backdrop`}
        style={{ position: 'absolute', inset: 0, color: 'transparent', pointerEvents: matches.length ? 'auto' : 'none', overflow: 'auto', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
      >
        {renderBackdrop()}
        {matches.length > 0 && <span style={{ pointerEvents: 'none' }}>{'\u200b'}</span>}
      </div>
      <textarea
        ref={taRef}
        value={value}
        onChange={handleChange}
        onScroll={handleScroll}
        placeholder={placeholder}
        rows={rows}
        className={`${className} relative bg-transparent`}
        style={{ position: 'relative', color: matches.length ? 'inherit' : undefined }}
      />
      {active && (
        <div className="orpheus-popover" style={{ top: active.top, left: active.left }}>
          <div className="orpheus-popover-msg">{active.match.shortMessage}</div>
          <div className="flex gap-1.5 mt-1.5">
            {active.match.replacements[0] && (
              <button className="orpheus-btn orpheus-btn-fix" onClick={() => applyFix(active.match, active.match.replacements[0])}>
                Apply "{active.match.replacements[0]}"
              </button>
            )}
            <button className="orpheus-btn orpheus-btn-dismiss" onClick={() => dismiss(active.match.id)}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
