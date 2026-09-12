import { useEffect, useRef } from 'react';
import { X, Send, Check, Ban, Mic, AudioLines, ExternalLink, Undo2, Paperclip, Globe } from 'lucide-react';
import Markdown from '@/components/Markdown';
import type { PageId } from '@/components/AppLayout';
import { writeSummary, PAGE_FOR_WRITE } from '@/lib/assistant/registry';
import ArrodesVoiceMirror from '@/components/ArrodesVoiceMirror';
import { SUGGESTS, MirrorIcon, ArrodesMark, AttachmentChip } from '@/components/assistant/arrodesBits';
import { useArrodesEngine } from '@/components/assistant/useArrodesEngine';

export default function GlobalAssistant({
  open, rail, page, width, onWidth, onClose, navigate,
}: {
  open: boolean; rail: boolean; page: PageId; width: number;
  onWidth: (n: number) => void; onClose: () => void; onRail: () => void;
  navigate?: (p: PageId) => void;
}) {
  const e = useArrodesEngine(page, navigate);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPos = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open && scrollRef.current) scrollRef.current.scrollTop = scrollPos.current; }, [open, page]);
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(id);
  }, [e.messages, e.busy, open, e.interim]);

  const startDrag = (ev: React.PointerEvent) => {
    ev.preventDefault();
    const startX = ev.clientX; const startW = width;
    const move = (n: PointerEvent) => onWidth(Math.min(480, Math.max(280, startW + (startX - n.clientX))));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  if (rail && !open) return null;
  const voiceChrome = e.voiceOn || e.voiceLeaving;

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-transparent lg:hidden" onClick={onClose} />}
      <aside
        aria-hidden={!open}
        data-voice={voiceChrome ? '1' : '0'}
        data-leaving={e.voiceLeaving ? '1' : '0'}
        className={`assistant-panel fixed inset-y-0 right-0 z-50 flex flex-col border-l border-zinc-200/80 bg-white/96 shadow-[-8px_0_24px_rgba(0,0,0,0.04)] transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`}
        style={{ width }}
      >
        <div className="absolute inset-y-0 left-0 hidden w-1.5 cursor-ew-resize lg:block" onPointerDown={startDrag} />
        <div className="assistant-chrome flex items-center justify-between px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-white ${e.listening || e.speaking ? 'ring-2 ring-zinc-400 ring-offset-2' : ''}`}>
              <MirrorIcon className="h-3.5 w-3.5" />
            </div>
            <p className="text-sm font-semibold text-zinc-800">Arrodes</p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={e.toggleSearch} className={`rounded-full p-1.5 ${e.searchOn ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100'}`} title={e.searchOn ? 'Web search on' : 'Web search off'}>
              <Globe className="h-4 w-4" />
            </button>
            <button type="button" onClick={onClose} className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100" title="Close Arrodes"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div ref={scrollRef} onScroll={(ev) => { scrollPos.current = ev.currentTarget.scrollTop; }} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-2">
          {e.messages.length === 0 && (
            <div className="pt-4">
              <p className="text-sm leading-relaxed text-zinc-500">Ask a question, attach a photo, or tell me to update a task, habit, or class field. Writes wait for confirm.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {SUGGESTS.map((s) => (
                  <button key={s.label} type="button" onClick={() => void e.send(s.text)} className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50">{s.label}</button>
                ))}
              </div>
            </div>
          )}
          {e.messages.map((m, i) => (
            <div key={m.id || i} className={m.role === 'user' ? 'flex justify-end' : 'flex items-start gap-2'}>
              {m.role === 'assistant' && (<div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600"><MirrorIcon className="h-3 w-3" /></div>)}
              <div className={m.role === 'user' ? 'max-w-[85%] rounded-2xl bg-zinc-900 px-3 py-2 text-sm text-white' : 'max-w-[90%] text-sm leading-relaxed text-zinc-800'}>
                {m.attachments && m.attachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {m.attachments.map((a) => (<AttachmentChip key={a.id} att={a} inverted={m.role === 'user'} />))}
                  </div>
                )}
                {m.role === 'assistant' ? <Markdown content={m.content} /> : <p className="whitespace-pre-wrap">{m.content}</p>}
                {m.sources && m.sources.length > 0 && (
                  <ul className="mt-2 space-y-1 text-[11px] text-zinc-500">
                    {m.sources.map((s) => (
                      <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{s.title || s.url}</a></li>
                    ))}
                  </ul>
                )}
                {m.pending && (
                  <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-zinc-800">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{m.pending.done ? 'Saved' : 'Confirm change'}</p>
                    <p className="mt-1 text-sm font-medium">{writeSummary(m.pending.name, m.pending.args)}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {!m.pending.done ? (
                        <>
                          <button type="button" onClick={() => e.confirmWrite(i, true)} className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-3 py-1 text-xs text-white"><Check className="h-3 w-3" /> Confirm</button>
                          <button type="button" onClick={() => e.confirmWrite(i, false)} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs text-zinc-600 ring-1 ring-zinc-200"><Ban className="h-3 w-3" /> Cancel</button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => navigate?.((PAGE_FOR_WRITE[m.pending!.name] as PageId) ?? page)} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs text-zinc-700 ring-1 ring-zinc-200"><ExternalLink className="h-3 w-3" /> View</button>
                          <button type="button" onClick={() => void e.revertWrite(i)} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs text-zinc-600 ring-1 ring-zinc-200"><Undo2 className="h-3 w-3" /> Undo</button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {e.busy && !e.voiceOn && (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <ArrodesMark className="h-4 w-4 shrink-0 animate-pulse" />
              <span className="italic tracking-wide">{e.thinkWord}…</span>
            </div>
          )}
          {e.error && <p className="text-xs text-zinc-500">{e.error}</p>}
        </div>

        <form className={`p-3 pb-5 ${voiceChrome ? '' : 'border-t border-zinc-200/70'}`} onSubmit={(ev) => { ev.preventDefault(); if (!e.busy && e.hasDraft) void e.send(); }}>
          {voiceChrome && (
            <ArrodesVoiceMirror active={e.voiceOn} mode={e.voiceMode} variant="dock" exiting={e.voiceLeaving} />
          )}
          {e.attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {e.attachments.map((a) => (
                <button key={a.id} type="button" onClick={() => e.setAttachments((cur) => cur.filter((x) => x.id !== a.id))} className="max-w-[140px] truncate rounded-full bg-zinc-100 px-2 py-1 text-[11px] text-zinc-600">
                  {a.kind} / {a.name} x
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-1.5 rounded-2xl bg-zinc-100 px-2 py-2">
            <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" multiple className="hidden" onChange={(ev) => { void e.pickFiles(ev.target.files); ev.target.value = ''; }} />
            <button type="button" onClick={() => fileRef.current?.click()} className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-200" title="Attach a file">
              <Paperclip className="h-3.5 w-3.5" />
            </button>
            <textarea
              value={e.input}
              onChange={(ev) => e.setInput(ev.target.value)}
              onKeyDown={(ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); if (!e.busy && e.hasDraft) void e.send(); } }}
              rows={1}
              placeholder={e.busy ? `${e.thinkWord}…` : e.voiceOn ? 'Voice on — type to send instead…' : 'Ask anything…'}
              className="max-h-24 min-h-[24px] flex-1 resize-none bg-transparent text-sm text-zinc-800 outline-none"
            />
            {e.busy ? (
              <button type="button" onClick={e.stopGenerate} className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full" title="Stop generating" aria-label="Stop generating">
                <ArrodesMark className="h-8 w-8" />
              </button>
            ) : e.hasDraft ? (
              <button type="submit" className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-white" title="Send">
                <Send className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button type="button" onClick={e.toggleVoice} className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-white" title={e.voiceTitle} aria-label={e.voiceOn ? 'Stop voice' : 'Start Voice'}>
                {e.voiceOn || e.listening || e.speaking ? <Mic className="h-3.5 w-3.5" /> : <AudioLines className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </form>
      </aside>
    </>
  );
}
