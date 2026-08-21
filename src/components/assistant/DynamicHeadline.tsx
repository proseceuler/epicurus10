import { useState, useEffect } from 'react';
import { getHeadline, MODES, type ModeId } from './constants';

/** Per-mode headline fonts (only the headline swaps; body/input unchanged). */
const MODES_FONT: Record<ModeId, string> = {
  study: 'sa-font-jakarta',       // Arrodes — Plus Jakarta Sans
  coding: 'sa-font-mono',         // Dahl — Geist Mono
  math: 'sa-font-grotesk',        // Gauss — Space Grotesk
  flashcards: 'sa-font-outfit',   // Mimir — Outfit
  writing: 'sa-font-instrument',  // Quintilian — Instrument Serif
  summarize: 'sa-font-inter',     // Sancho — Inter
  research: 'sa-font-plex',       // Weiss — IBM Plex Sans
};

export default function DynamicHeadline({ mode }: { mode: ModeId }) {
  const [text, setText] = useState(() => getHeadline(mode));
  const [fading, setFading] = useState(false);
  const [displayMode, setDisplayMode] = useState(mode);

  useEffect(() => {
    if (mode === displayMode) return;
    setFading(true);
    const t = setTimeout(() => {
      setText(getHeadline(mode));
      setDisplayMode(mode);
      setFading(false);
    }, 180);
    return () => clearTimeout(t);
  }, [mode, displayMode]);

  // Prefer fontClass from mode def when present; fall back to map
  const def = MODES.find((m) => m.id === displayMode);
  const fontClass = def?.fontClass || MODES_FONT[displayMode] || 'sa-font-default';

  return (
    <h2
      className={`sa-headline-transition text-2xl sm:text-3xl text-center ${fontClass} ${
        fading ? 'sa-headline-fade-out' : 'sa-headline-fade-in'
      }`}
      style={{ fontWeight: 600, letterSpacing: '-0.02em' }}
    >
      {text}
    </h2>
  );
}
