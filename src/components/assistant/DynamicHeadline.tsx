import { useState, useEffect } from 'react';
import { getHeadline, MODES, type ModeId } from './constants';

/** CSS class + explicit family so the swap is visible even if other rules fight it. */
const MODE_FONT: Record<ModeId, { className: string; family: string }> = {
  study: { className: 'sa-font-jakarta', family: "'Plus Jakarta Sans', system-ui, sans-serif" },
  coding: { className: 'sa-font-pixel', family: "'Pixelify Sans', 'JetBrains Mono', monospace" },
  math: { className: 'sa-font-grotesk', family: "'Space Grotesk', system-ui, sans-serif" },
  flashcards: { className: 'sa-font-outfit', family: "'Outfit', system-ui, sans-serif" },
  writing: { className: 'sa-font-instrument', family: "'Instrument Serif', Georgia, serif" },
  summarize: { className: 'sa-font-inter', family: "'Inter', system-ui, sans-serif" },
  research: { className: 'sa-font-plex', family: "'IBM Plex Sans', system-ui, sans-serif" },
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

  const font = MODE_FONT[displayMode] ?? MODE_FONT.study;
  // Keep constants.fontClass in sync when present
  const defClass = MODES.find((m) => m.id === displayMode)?.fontClass;
  const className = defClass === 'sa-font-mono' ? 'sa-font-pixel' : font.className;

  return (
    <h2
      key={displayMode}
      className={`sa-headline-transition text-2xl sm:text-3xl text-center ${className} ${
        fading ? 'sa-headline-fade-out' : 'sa-headline-fade-in'
      }`}
      style={{
        fontFamily: font.family,
        fontWeight: 600,
        letterSpacing: displayMode === 'coding' ? '0.02em' : '-0.02em',
        fontStyle: displayMode === 'writing' ? 'italic' : 'normal',
      }}
    >
      {text}
    </h2>
  );
}
