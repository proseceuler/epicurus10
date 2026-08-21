import { useState, useRef, useEffect } from 'react';
import { MODES, type ModeId, type SubModeId } from './constants';

export default function ModeSelector({
  mode,
  subMode,
  onMode,
  onSubMode,
  onSuggestion,
}: {
  mode: ModeId;
  subMode: SubModeId | null;
  onMode: (m: ModeId) => void;
  onSubMode: (s: SubModeId) => void;
  onSuggestion: (text: string) => void;
}) {
  const activeDef = MODES.find((m) => m.id === mode)!;
  const [popoverMode, setPopoverMode] = useState<ModeId | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPopoverMode(null);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const handlePillClick = (m: ModeId) => {
    if (m === mode) {
      setPopoverMode(popoverMode === m ? null : m);
    } else {
      onMode(m);
      setPopoverMode(m);
    }
  };

  const handleSuggestion = (text: string) => {
    onSuggestion(text);
    setPopoverMode(null);
  };

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-3">
      {/* Mode pills */}
      <div className="flex flex-wrap gap-2 justify-center">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = m.id === mode;
          return (
            <div key={m.id} className="relative">
              <button
                onClick={() => handlePillClick(m.id)}
                className={`sa-pill ${active ? 'sa-pill-active' : ''}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {m.agentName}
              </button>

              {/* Suggestion popover */}
              {popoverMode === m.id && (
                <div className="sa-suggest-popover absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 p-1.5 z-50">
                  <p className="px-2.5 py-1.5 text-[11px] font-medium text-[var(--sa-text-dim)] uppercase tracking-wide">
                    Try asking {m.agentName}
                  </p>
                  {m.suggestions.map((s, si) => (
                    <button
                      key={si}
                      onClick={() => handleSuggestion(s)}
                      className="sa-suggest-item w-full flex items-start gap-2 px-2.5 py-2 rounded-lg text-left text-xs text-[var(--sa-text-muted)]"
                    >
                      <span className="text-[var(--sa-text-dim)] mt-0.5">→</span>
                      <span className="leading-relaxed">{s}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sub-mode chips for Coding Agent (Dahl → Turing) */}
      {activeDef.hasSubMode && activeDef.subModes && (
        <div className="flex gap-1.5">
          {activeDef.subModes.map((s) => {
            const Icon = s.icon;
            const active = subMode === s.id;
            return (
              <button
                key={s.id}
                onClick={() => onSubMode(s.id)}
                className={`sa-pill ${active ? 'sa-pill-active' : ''}`}
                style={{ padding: '0.3125rem 0.625rem', fontSize: '0.6875rem' }}
              >
                <Icon className="w-3 h-3" />
                {s.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
