import { useEffect, useRef, useState } from 'react';
import { Bot, X, Send, Check, Ban, Mic, AudioLines, ExternalLink, Undo2, Paperclip, Globe } from 'lucide-react';
import { getOpenRouterKey } from '@/lib/apiKeys';
import Markdown from '@/components/Markdown';
import type { PageId } from '@/components/AppLayout';
import { loadHistory, saveHistory, loadSearchEnabled, saveSearchEnabled } from '@/lib/assistant/session';
import { fileToAttachment, isAudioFile, type ChatAttachment } from '@/lib/assistant/media';
import { createRecognizer, speechRecognitionCtor } from '@/lib/assistant/voice';
import { groqConfigured, startVoiceLoop, speakReply, stopReply, transcribeAudio, type VoiceLoop } from '@/lib/assistant/voiceCascade';
import { runAssistantTurn, type ChatTurn, type PendingWrite } from '@/lib/assistant/router';
import { dispatchTool, writeSummary, PAGE_FOR_WRITE } from '@/lib/assistant/registry';
import { undoLastWrite } from '@/lib/assistant/undo';
import { usePomodoro } from '@/context/PomodoroContext';
import type { SubjectKey } from '@/lib/types';
import ArrodesVoiceMirror, { type ArrodesVoiceMode } from '@/components/ArrodesVoiceMirror';

const SUGGESTS = [
  { label: 'Summarize this page', text: 'Summarize what I should focus on on this page.' },
  { label: "What's due this week?", text: "What's due this week on my tasks and calendar?" },
  { label: 'Add a task', text: 'Help me add a task for tomorrow.' },
];

interface Msg extends ChatTurn {
  pending?: PendingWrite;
  sources?: { title: string; url: string }[];
}

export default function GlobalAssistant({
  open, rail, page, width, onWidth, onClose, onRail, navigate,
}: {
  open: boolean; rail: boolean; page: PageId; width: number;
  onWidth: (n: number) => void; onClose: () => void; onRail: () => void;
  navigate?: (p: PageId) => void;
}) {
  const pomodoro = usePomodoro();
  const [messages, setMessages] = useState<Msg[]>(() => loadHistory<Msg>([]));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [searchOn, setSearchOn] = useState(() => loadSearchEnabled());
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [voiceOn, setVoiceOn] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPos = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<ReturnType<typeof createRecognizer>>(null);
  const voiceOnRef = useRef(false);
  const loopRef = useRef<VoiceLoop | null>(null);
  const busyRef = useRef(false);
  const speakingRef = useRef(false);

  useEffect(() => {
    const slim = messages.map((m, i) => {
      if (i >= messages.length - 6) return m;
      if (!m.attachments?.length) return m;
      return { ...m, attachments: m.attachments.map((a) => ({ ...a, dataUrl: a.kind === 'image' ? '' : a.dataUrl.slice(0, 32), posterUrl: undefined })) };
    });
    saveHistory(slim);
  }, [messages]);
  useEffect(() => { voiceOnRef.current = voiceOn; }, [voiceOn]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { speakingRef.current = speaking; }, [speaking]);
  useEffect(() => () => { loopRef.current?.stop(); stopReply(); }, []);
  useEffect(() => { if (open && scrollRef.current) scrollRef.current.scrollTop = scrollPos.current; }, [open, page]);
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(id);
  }, [messages, busy, open, interim]);

  const speak = async (text: string) => {
    if (!voiceOnRef.current) return;
    speakingRef.current = true;
    setSpeaking(true);
    await speakReply(text, {
      onStart: () => { speakingRef.current = true; setSpeaking(true); },
      onEnd: () => { speakingRef.current = false; setSpeaking(false); },
    });
    speakingRef.current = false;
    setSpeaking(false);
  };

  const startListen = (continuous: boolean) => {
    recognitionRef.current?.abort?.();
    const rec = createRecognizer({
      continuous,
      onStart: () => setListening(true),
      onEnd: () => {
        setListening(false);
        if (voiceOnRef.current && continuous && !busyRef.current && !speakingRef.current) {
          try { rec?.start(); } catch { /* ignore */ }
        }
      },
      onError: (msg) => setError(msg),
      onInterim: (text) => setInterim(text),
      onFinal: (text) => {
        setInterim('');
        if (text.trim()) void send(text);
      },
    });
    if (!rec) { setError('Voice input is not available in this browser.'); return; }
    recognitionRef.current = rec;
    try { rec.start(); } catch { setError('Could not start the microphone.'); }
  };

  const stopListen = () => {
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    setListening(false);
    setInterim('');
  };

  const startCascade = () => {
    loopRef.current?.stop();
    loopRef.current = startVoiceLoop({
      onListening: setListening,
      onCaption: setInterim,
      onTranscript: (text) => send(text),
      onError: setError,
      shouldContinue: () => voiceOnRef.current && !busyRef.current && !speakingRef.current,
    });
  };

  const toggleVoice = () => {
    if (voiceOn && (speakingRef.current || speaking)) {
      stopReply();
      speakingRef.current = false;
      setSpeaking(false);
      setInterim('Interrupted — still listening');
      return;
    }
    if (voiceOn) {
      voiceOnRef.current = false;
      loopRef.current?.stop();
      loopRef.current = null;
      stopListen();
      stopReply();
      setVoiceOn(false);
      setSpeaking(false);
      setInterim('');
      return;
    }
    if (!groqConfigured() && !speechRecognitionCtor()) {
      setError('Add a Groq API key in Settings → Voice to start voice mode.');
      navigate?.('settings');
      return;
    }
    setVoiceOn(true);
    voiceOnRef.current = true;
    setError('');
    if (groqConfigured()) startCascade();
    else startListen(true);
  };

  const pickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const next: ChatAttachment[] = [];
    for (const file of Array.from(files).slice(0, 4)) {
      try { next.push(await fileToAttachment(file)); }
      catch { setError('Could not attach that file.'); }
    }
    setAttachments((cur) => [...cur, ...next].slice(0, 6));
  };

  const send = async (text?: string) => {
    let content = (text ?? input).trim();
    const audioAtt = attachments.filter((a) => a.kind === 'audio' || isAudioFile(a));
    const pendingAtt = attachments.filter((a) => a.kind !== 'audio' && !isAudioFile(a));
    if (audioAtt.length) {
      if (!groqConfigured()) {
        setError('Audio files need a Groq key in Settings → Voice.');
        navigate?.('settings');
        return;
      }
      setInterim('Transcribing…');
      const spoken: string[] = [];
      for (const att of audioAtt) {
        if (!att.dataUrl) continue;
        const result = await transcribeAudio(dataUrlToBlob(att.dataUrl));
        if (result.text) spoken.push(result.text);
        else if (result.error) setError(result.error);
      }
      setInterim('');
      if (spoken.length) content = [content, `Transcript: ${spoken.join(' ')}`].filter(Boolean).join('\n').trim();
      else if (!content && !pendingAtt.length) {
        setError('Could not transcribe that audio. Use the waveform button to talk live.');
        return;
      }
    }
    if ((!content && !pendingAtt.length) || busyRef.current) return;
    const key = getOpenRouterKey();
    if (!key) { setError('Add an OpenRouter key in Settings first.'); return; }
    stopReply();
    setError(''); setInput('');
    const user: Msg = {
      role: 'user',
      content: content || attachmentPromptFallback(pendingAtt),
      attachments: pendingAtt.length ? pendingAtt : undefined,
    };
    setAttachments([]);
    const next = [...messages, user];
    setMessages(next);
    busyRef.current = true;
    setBusy(true);
    try {
      const reply = await runAssistantTurn({
        key,
        page,
        history: next,
        searchEnabled: searchOn,
        ctx: { startFocus: (subject) => {
          pomodoro.setSessionContext((subject as SubjectKey) ?? null, null);
          pomodoro.switchType('focus');
          pomodoro.start();
          navigate?.('pomodoro');
        } },
      });
      const assistant: Msg = { role: 'assistant', content: reply.content, pending: reply.pending, sources: reply.sources };
      setMessages([...next, assistant]);
      if (voiceOnRef.current && reply.content) await speak(reply.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const confirmWrite = async (index: number, accept: boolean) => {
    const msg = messages[index];
    if (!msg?.pending || msg.pending.done) return;
    if (!accept) {
      setMessages((list) => list.map((m, i) => (i === index ? { ...m, pending: undefined, content: `${m.content}\n\nCancelled.` } : m)));
      return;
    }
    setBusy(true);
    try {
      await dispatchTool(msg.pending.name, msg.pending.args, { startFocus: (subject) => {
          pomodoro.setSessionContext((subject as SubjectKey) ?? null, null);
          pomodoro.switchType('focus');
          pomodoro.start();
          navigate?.('pomodoro');
        } });
      setMessages((list) => list.map((m, i) => (i === index ? { ...m, pending: { ...m.pending!, done: true } } : m)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  };

  const revertWrite = async (index: number) => {
    const msg = messages[index];
    if (!msg?.pending?.done) return;
    setBusy(true);
    try {
      const result = await undoLastWrite();
      if (!result.ok) {
        setError(result.error || 'Nothing to undo.');
        return;
      }
      setMessages((list) => list.map((m, i) => (
        i === index
          ? { ...m, pending: undefined, content: `${m.content}\n\nUndid: ${result.summary ?? 'last change'}.` }
          : m
      )));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not undo that.');
    } finally {
      setBusy(false);
    }
  };

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX; const startW = width;
    const move = (ev: PointerEvent) => onWidth(Math.min(480, Math.max(280, startW + (startX - ev.clientX))));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  if (rail && !open) return null;
  const whisperOn = groqConfigured();
  const hasDraft = Boolean(input.trim() || attachments.length);
  const voiceTitle = voiceOn
    ? 'Voice is on — tap to stop. Tap while speaking to interrupt.'
    : 'Start Voice. Stays on until you turn it off.';
  const voiceMode: ArrodesVoiceMode = speaking
    ? 'speaking'
    : busy
      ? 'thinking'
      : listening
        ? 'listening'
        : 'idle';

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-transparent lg:hidden" onClick={onClose} />}
      <aside
        aria-hidden={!open}
        data-voice={voiceOn ? '1' : '0'}
        className={`assistant-panel fixed inset-y-0 right-0 z-50 flex flex-col border-l border-zinc-200/80 bg-white/96 shadow-[-8px_0_24px_rgba(0,0,0,0.04)] transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`}
        style={{ width }}
      >
        <div className="absolute inset-y-0 left-0 hidden w-1.5 cursor-ew-resize lg:block" onPointerDown={startDrag} />
        <div className="assistant-chrome flex items-center justify-between px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-white ${listening || speaking ? 'ring-2 ring-zinc-400 ring-offset-2' : ''}`}>
              <Bot className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-800">Arrodes</p>
              <p className="truncate text-[11px] text-zinc-500">
                {listening ? 'Listening…' : speaking ? 'Speaking…' : busy && voiceOn ? 'Thinking…' : voiceOn ? 'Voice on — tap waveform to stop or interrupt' : 'Works from any page'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { const next = !searchOn; setSearchOn(next); saveSearchEnabled(next); }}
              className={`rounded-full p-1.5 ${searchOn ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100'}`}
              title={searchOn ? 'Web search on' : 'Web search off'}
            >
              <Globe className="h-4 w-4" />
            </button>
            <button type="button" onClick={onClose} className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100" title="Close Arrodes"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div ref={scrollRef} onScroll={(e) => { scrollPos.current = e.currentTarget.scrollTop; }} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-2">
          {messages.length === 0 && (
            <div className="pt-4">
              <p className="text-sm leading-relaxed text-zinc-500">Ask a question, attach a photo, or tell me to update a task, habit, or class field. Writes wait for confirm.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {SUGGESTS.map((s) => (
                  <button key={s.label} type="button" onClick={() => void send(s.text)} className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50">{s.label}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex items-start gap-2'}>
              {m.role === 'assistant' && (<div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600"><Bot className="h-3 w-3" /></div>)}
              <div className={m.role === 'user' ? 'max-w-[85%] rounded-2xl bg-zinc-900 px-3 py-2 text-sm text-white' : 'max-w-[90%] text-sm leading-relaxed text-zinc-800'}>
                {m.attachments && m.attachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {m.attachments.map((a) => (
                      <AttachmentChip key={a.id} att={a} inverted={m.role === 'user'} />
                    ))}
                  </div>
                )}
                {m.role === 'assistant' ? <Markdown content={m.content} /> : <p className="whitespace-pre-wrap">{m.content}</p>}
                {m.sources && m.sources.length > 0 && (
                  <ul className="mt-2 space-y-1 text-[11px] text-zinc-500">
                    {m.sources.map((s) => (
                      <li key={s.url}>
                        <a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{s.title || s.url}</a>
                      </li>
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
                          <button type="button" onClick={() => confirmWrite(i, true)} className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-3 py-1 text-xs text-white"><Check className="h-3 w-3" /> Confirm</button>
                          <button type="button" onClick={() => confirmWrite(i, false)} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs text-zinc-600 ring-1 ring-zinc-200"><Ban className="h-3 w-3" /> Cancel</button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => navigate?.((PAGE_FOR_WRITE[m.pending!.name] as PageId) ?? page)} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs text-zinc-700 ring-1 ring-zinc-200"><ExternalLink className="h-3 w-3" /> View</button>
                          <button type="button" onClick={() => void revertWrite(i)} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs text-zinc-600 ring-1 ring-zinc-200"><Undo2 className="h-3 w-3" /> Undo</button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && !voiceOn && (<div className="flex items-center gap-2 text-sm text-zinc-500"><span className="flex gap-1"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:120ms]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:240ms]" /></span>Thinking</div>)}
          {error && <p className="text-xs text-zinc-500">{error}</p>}
        </div>

        <form className="border-t border-zinc-200/70 p-3 pb-5" onSubmit={(e) => { e.preventDefault(); if (hasDraft) void send(); }}>
          {voiceOn && (
            <ArrodesVoiceMirror
              active={voiceOn}
              mode={voiceMode}
              caption={interim || (speaking ? 'Speaking' : busy ? 'Thinking' : listening ? 'Listening' : '')}
            />
          )}
          {(listening || speaking || interim) && !voiceOn && (
            <div className="mb-2 flex items-center gap-2 text-xs text-zinc-600">
              <span className={`inline-flex h-2 w-2 rounded-full ${listening ? 'animate-pulse bg-zinc-900' : speaking ? 'bg-zinc-500' : 'bg-zinc-300'}`} />
              {listening ? (interim || 'Listening — keep talking, I wait for a pause') : speaking ? 'Speaking — tap waveform to interrupt' : interim}
            </div>
          )}
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {attachments.map((a) => (
                <button key={a.id} type="button" onClick={() => setAttachments((cur) => cur.filter((x) => x.id !== a.id))} className="max-w-[140px] truncate rounded-full bg-zinc-100 px-2 py-1 text-[11px] text-zinc-600">
                  {a.kind} / {a.name} x
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-1.5 rounded-2xl bg-zinc-100 px-2 py-2">
            <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" multiple className="hidden" onChange={(e) => { void pickFiles(e.target.files); e.target.value = ''; }} />
            <button type="button" onClick={() => fileRef.current?.click()} className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-200" title="Attach a file">
              <Paperclip className="h-3.5 w-3.5" />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (hasDraft) void send(); } }}
              rows={1}
              placeholder={voiceOn ? 'Voice on — type to send instead…' : 'Ask anything…'}
              className="max-h-24 min-h-[24px] flex-1 resize-none bg-transparent text-sm text-zinc-800 outline-none"
            />
            {hasDraft ? (
              <button type="submit" disabled={busy} className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-white disabled:opacity-30" title="Send">
                <Send className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={toggleVoice}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-white"
                title={voiceTitle}
                aria-label={voiceOn ? 'Stop voice' : 'Start Voice'}
              >
                {voiceOn || listening || speaking ? <Mic className="h-3.5 w-3.5" /> : <AudioLines className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </form>
      </aside>
    </>
  );
}

function dataUrlToBlob(dataUrl: string) {
  const [head, body] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(head)?.[1] || 'audio/webm';
  const bin = atob(body || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function attachmentPromptFallback(attachments: ChatAttachment[]) {
  if (!attachments.length) return 'Please look at this attachment.';
  const kinds = attachments.map((a) => a.kind).join(', ');
  return `Please look at this ${kinds}.`;
}

function AttachmentChip({ att, inverted }: { att: ChatAttachment; inverted?: boolean }) {
  return (
    <span className={`inline-flex max-w-[140px] truncate rounded-full px-2 py-1 text-[11px] ${inverted ? 'bg-white/15 text-white' : 'bg-zinc-100 text-zinc-600'}`}>
      {att.kind} / {att.name}
    </span>
  );
}
