import { useState, useRef, useEffect } from 'react';
import { Plus, Image as ImageIcon, Mic, MicOff, Send, Square, X, Paperclip, Globe, Sparkles, Link2, Lock, Search, Loader2, ChevronDown } from 'lucide-react';
import ModelDropdown from './ModelDropdown';
import type { ModelDef } from './constants';
import { searchAcrossSources, getSourceStatuses, type ResearchSourceId, type ResearchResult } from '@/lib/weissResearch';

export default function ChatInputBar({
  input,
  onInput,
  onSend,
  onStop,
  streaming,
  models,
  model,
  onModelChange,
  visionModel,
  speechSupported,
  listening,
  onToggleListening,
  onPickImage,
  image,
  onClearImage,
  placeholder,
  showWeissSources = false,
}: {
  input: string;
  onInput: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  models: ModelDef[];
  model: string;
  onModelChange: (v: string) => void;
  visionModel: boolean;
  speechSupported: boolean;
  listening: boolean;
  onToggleListening: () => void;
  onPickImage: (f: File) => void;
  image: string | null;
  onClearImage: () => void;
  placeholder: string;
  showWeissSources?: boolean;
}) {
  const [plusOpen, setPlusOpen] = useState(false);
  const [weissOpen, setWeissOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const plusRef = useRef<HTMLDivElement>(null);
  const weissRef = useRef<HTMLDivElement>(null);

  const statuses = getSourceStatuses();
  const [enabled, setEnabled] = useState<ResearchSourceId[]>(
    statuses.filter((s) => !s.needsKey || s.hasKey).map((s) => s.id)
  );
  const [weissLoading, setWeissLoading] = useState(false);
  const [weissResults, setWeissResults] = useState<ResearchResult[]>([]);
  const [weissErrors, setWeissErrors] = useState<{ source: ResearchSourceId; message: string }[]>([]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (plusRef.current && !plusRef.current.contains(e.target as Node)) setPlusOpen(false);
      if (weissRef.current && !weissRef.current.contains(e.target as Node)) setWeissOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function toggleSource(id: ResearchSourceId) {
    setEnabled((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function runCrossRef() {
    if (!input.trim() || !enabled.length) return;
    setWeissLoading(true);
    setWeissResults([]);
    setWeissErrors([]);
    const outcome = await searchAcrossSources(input, enabled);
    setWeissResults(outcome.results);
    setWeissErrors(outcome.errors);
    setWeissLoading(false);
  }

  return (
    <div className="w-full max-w-2xl">
      {image && (
        <div className="mb-2 inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--sa-surface)] border border-[var(--sa-border)]">
          <img src={image} alt="Preview" className="w-8 h-8 rounded object-cover" />
          <span className="text-xs text-[var(--sa-text-muted)]">Image attached</span>
          <button onClick={onClearImage} className="sa-icon-btn p-0.5 rounded">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="sa-input-bar p-3">
        <textarea
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={3}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-[var(--sa-text)] placeholder-[var(--sa-text-dim)] resize-none focus:outline-none leading-relaxed"
          autoFocus
        />

        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1">
            <div ref={plusRef} className="relative">
              <button
                onClick={() => setPlusOpen((v) => !v)}
                className="sa-icon-btn w-8 h-8 flex items-center justify-center"
                title="Add"
              >
                <Plus className={`w-4 h-4 transition-transform ${plusOpen ? 'rotate-45' : ''}`} />
              </button>
              {plusOpen && (
                <div className="sa-plus-menu absolute bottom-full left-0 mb-2 w-56 p-1.5 z-50">
                  <button
                    onClick={() => { fileRef.current?.click(); setPlusOpen(false); }}
                    className="sa-plus-menu-item w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs text-[var(--sa-text-muted)]"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    Add files / photos
                  </button>
                  <button
                    onClick={() => { onToggleListening(); setPlusOpen(false); }}
                    className="sa-plus-menu-item w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs text-[var(--sa-text-muted)]"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    Voice input
                  </button>
                  <button
                    onClick={() => setPlusOpen(false)}
                    className="sa-plus-menu-item w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs text-[var(--sa-text-muted)]"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Skills
                  </button>
                  <button
                    onClick={() => setPlusOpen(false)}
                    className="sa-plus-menu-item w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs text-[var(--sa-text-muted)]"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    Add connector
                  </button>
                  <div className="border-t border-[var(--sa-border)] my-1" />
                  <button
                    onClick={() => setPlusOpen(false)}
                    className="sa-plus-menu-item w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs text-[var(--sa-text-muted)]"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Web search
                  </button>
                </div>
              )}
            </div>

            <ModelDropdown models={models} value={model} onChange={onModelChange} />

            {/* Weiss sources dropdown — only in research mode */}
            {showWeissSources && (
              <div ref={weissRef} className="relative">
                <button
                  type="button"
                  onClick={() => setWeissOpen((v) => !v)}
                  className="sa-icon-btn h-8 px-2 flex items-center gap-1 text-xs"
                  title="Research sources"
                >
                  <Search className="w-3.5 h-3.5" />
                  Sources
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </button>
                {weissOpen && (
                  <div className="sa-plus-menu absolute bottom-full left-0 mb-2 w-64 p-2 z-50">
                    <p className="px-2 pb-1.5 text-[10px] uppercase tracking-wide text-[var(--sa-text-dim)]">Sources</p>
                    {statuses.map((s) => {
                      const locked = s.needsKey && !s.hasKey;
                      const on = enabled.includes(s.id);
                      return (
                        <label
                          key={s.id}
                          className={`sa-plus-menu-item flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs ${
                            locked ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="rounded border-[var(--sa-border)]"
                            checked={on && !locked}
                            disabled={locked}
                            onChange={() => !locked && toggleSource(s.id)}
                          />
                          <span className="flex-1 text-[var(--sa-text-muted)]">{s.label}</span>
                          {locked && <Lock className="w-3 h-3 text-[var(--sa-text-dim)]" />}
                        </label>
                      );
                    })}
                    <div className="border-t border-[var(--sa-border)] my-1.5" />
                    <button
                      type="button"
                      onClick={runCrossRef}
                      disabled={weissLoading || !input.trim() || !enabled.length}
                      className="sa-plus-menu-item w-full flex items-center justify-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-[var(--sa-text)] disabled:opacity-40"
                    >
                      {weissLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                      Cross-reference
                    </button>
                    {weissErrors.length > 0 && (
                      <div className="px-2 pt-1 text-[10px] text-rose-400">
                        {weissErrors.map((e) => (
                          <p key={e.source}>{e.source}: {e.message}</p>
                        ))}
                      </div>
                    )}
                    {weissResults.length > 0 && (
                      <ul className="mt-1 max-h-40 overflow-y-auto px-1 space-y-1">
                        {weissResults.slice(0, 8).map((r) => (
                          <li key={r.id}>
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noreferrer"
                              className="block rounded px-1.5 py-1 text-[11px] text-[var(--sa-text-muted)] hover:bg-[var(--sa-surface-hover)]"
                            >
                              <span className="text-[var(--sa-text)]">{r.title}</span>
                              <span className="text-[var(--sa-text-dim)]"> · {r.source}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            {visionModel && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onPickImage(file);
                    e.target.value = '';
                  }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="sa-icon-btn w-8 h-8 flex items-center justify-center"
                  title="Attach an image"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>
              </>
            )}

            {speechSupported && (
              <button
                onClick={onToggleListening}
                className={`sa-icon-btn w-8 h-8 flex items-center justify-center ${listening ? 'text-[var(--sa-accent)]' : ''}`}
                title={listening ? 'Stop voice input' : 'Voice input'}
              >
                {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            )}

            {streaming ? (
              <button
                onClick={onStop}
                className="sa-send-btn w-8 h-8 flex items-center justify-center"
                title="Stop generating"
              >
                <Square className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={onSend}
                disabled={!input.trim() && !image}
                className="sa-send-btn w-8 h-8 flex items-center justify-center"
                title="Send"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
