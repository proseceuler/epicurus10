import { useEffect, useRef, useState, useCallback } from 'react';
import { checkGrammar, type OrpheusMatch } from '@/lib/orpheus';

/**
 * Wraps a <textarea> ref with passive LanguageTool grammar checking.
 * Renders a transparent highlight layer behind the textarea and a
 * popover on click of a flagged span. No visible chrome when clean.
 *
 * Usage:
 *   const taRef = useRef<HTMLTextAreaElement>(null);
 *   const { overlay } = useOrpheus(taRef, value);
 *   <div className="relative">
 *     <textarea ref={taRef} value={value} onChange={...} />
 *     {overlay}
 *   </div>
 */
export function useOrpheus(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  text: string,
  enabled = true
) {
  const [matches, setMatches] = useState<OrpheusMatch[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const m = await checkGrammar(text);
        setMatches(m);
      } catch {
        // Fail silently — Orpheus should never block typing.
        setMatches([]);
      }
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [text, enabled]);

  const applyFix = useCallback(
    (match: OrpheusMatch, replacement: string, onApply: (next: string) => void) => {
      const next = text.slice(0, match.offset) + replacement + text.slice(match.offset + match.length);
      onApply(next);
      setActiveId(null);
      setMatches((prev) => prev.filter((m) => m.id !== match.id));
    },
    [text]
  );

  const dismiss = useCallback((id: string) => {
    setMatches((prev) => prev.filter((m) => m.id !== id));
    setActiveId(null);
  }, []);

  const openPopover = useCallback((id: string, e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const parentRect = (e.target as HTMLElement).closest('.orpheus-wrap')?.getBoundingClientRect();
    setPopoverPos({
      top: rect.bottom - (parentRect?.top || 0) + 4,
      left: rect.left - (parentRect?.left || 0),
    });
    setActiveId((prev) => (prev === id ? null : id));
  }, []);

  function renderHighlightLayer() {
    if (!matches.length) return null;
    let cursor = 0;
    const segments: React.ReactNode[] = [];
    const sorted = [...matches].sort((a, b) => a.offset - b.offset);

    sorted.forEach((m) => {
      if (m.offset < cursor) return; // skip overlapping matches
      if (m.offset > cursor) {
        segments.push(<span key={`gap-${cursor}`}>{text.slice(cursor, m.offset)}</span>);
      }
      const color = m.category === 'spelling' || m.category === 'grammar' ? 'orpheus-underline-red' : 'orpheus-underline-amber';
      segments.push(
        <span
          key={m.id}
          className={`orpheus-flag ${color}`}
          onClick={(e) => {
            e.stopPropagation();
            openPopover(m.id, e);
          }}
        >
          {text.slice(m.offset, m.offset + m.length)}
        </span>
      );
      cursor = m.offset + m.length;
    });
    if (cursor < text.length) {
      segments.push(<span key="tail">{text.slice(cursor)}</span>);
    }
    return segments;
  }

  function Popover({ onApply }: { onApply: (next: string) => void }) {
    const match = matches.find((m) => m.id === activeId);
    if (!match || !popoverPos) return null;
    return (
      <div
        className="orpheus-popover"
        style={{ top: popoverPos.top, left: popoverPos.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="orpheus-popover-msg">{match.shortMessage}</div>
        <div className="flex gap-1.5 mt-1.5">
          {match.replacements[0] && (
            <button
              className="orpheus-btn orpheus-btn-fix"
              onClick={() => applyFix(match, match.replacements[0], onApply)}
            >
              Apply "{match.replacements[0]}"
            </button>
          )}
          <button className="orpheus-btn orpheus-btn-dismiss" onClick={() => dismiss(match.id)}>
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return {
    matches,
    highlightLayer: renderHighlightLayer(),
    Popover,
    hasFlags: matches.length > 0,
  };
}
