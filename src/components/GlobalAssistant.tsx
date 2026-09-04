import { useEffect, useRef, useState } from 'react';
import { Bot, X, Send, Check, Ban, Mic, MicOff, PanelRight, ExternalLink, Undo2 } from 'lucide-react';
import { getDefaultModel, getOpenRouterKey } from '@/lib/apiKeys';
import { DATA_TOOLS, runTool } from '@/lib/aiTools';
import Markdown from '@/components/Markdown';
import type { PageId } from '@/components/AppLayout';

const WRITE_TOOLS = new Set(['add_todo', 'add_note', 'add_calendar_event', 'add_kanban_task', 'add_flashcard', 'add_assessment']);
const READ_TOOLS = DATA_TOOLS.filter((t) => !WRITE_TOOLS.has(t.function.name));
const CONFIRM_TOOLS = DATA_TOOLS.filter((t) => WRITE_TOOLS.has(t.function.name));
const HISTORY_KEY = 'epicure-global-assistant-history';
const PAGE_LABEL: Record<string, string> = {
  dashboard: 'Dashboard', grades: 'Grades', forecast: 'Grades', classhub: 'Class Hub',
  todos: 'To-Do List', kanban: 'Kanban', calendar: 'Calendar', notes: 'Notes & Board',
  pomodoro: 'Focus', analytics: 'Focus', habits: 'Habits', finance: 'Baon Tracker',
  flashcards: 'Flashcards', settings: 'Settings', assistant: 'Dashboard',
};
const PAGE_VIEW: Partial<Record<string, PageId>> = {
  add_todo: 'todos', add_note: 'notes', add_calendar_event: 'calendar',
  add_kanban_task: 'kanban', add_flashcard: 'flashcards', add_assessment: 'grades',
};
const SUGGESTS = [
  { label: 'Summarize this page', text: 'Summarize what I should focus on on this page.' },
  { label: "What's due this week?", text: "What's due this week on my tasks and calendar?" },
  { label: 'Add a task', text: 'Help me add a task for tomorrow.' },
];

interface PendingWrite { name: string; args: Record<string, unknown>; done?: boolean }
interface Msg { role: 'user' | 'assistant'; content: string; pending?: PendingWrite }
function pageContext(page: PageId) { return `The student is currently on ${PAGE_LABEL[page] ?? page}.`; }
function writeSummary(name: string, args: Record<string, unknown>) {
  if (name === 'add_todo') return `Task · ${String(args.title ?? 'Untitled')}${args.due_date ? ` · ${args.due_date}` : ''}`;
  if (name === 'add_note') return `Note · ${String(args.title ?? 'Untitled')}`;
  if (name === 'add_calendar_event') return `Event · ${String(args.title ?? 'Untitled')}${args.start_date ? ` · ${args.start_date}` : ''}`;
  if (name === 'add_kanban_task') return `Board task · ${String(args.title ?? 'Untitled')}`;
  if (name === 'add_flashcard') return `Flashcard · ${String(args.front ?? args.title ?? 'New card')}`;
  if (name === 'add_assessment') return `Grade · ${String(args.name ?? 'Assessment')}`;
  return name.replaceAll('_', ' ');
}

export default function GlobalAssistant({
  open, rail, page, width, onWidth, onClose, onRail, navigate,
}: {
  open: boolean; rail: boolean; page: PageId; width: number;
  onWidth: (n: number) => void; onClose: () => void; onRail: () => void;
  navigate?: (p: PageId) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as Msg[]; } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [voice, setVoice] = useState(false);
  const [listening, setListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPos = useRef(0);
  const recognitionRef = useRef<any>(null);

  useEffect(() => { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-40))); } catch { /* ignore */ } }, [messages]);
  useEffect(() => { if (open && scrollRef.current) scrollRef.current.scrollTop = scrollPos.current; }, [open, page]);
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(id);
  }, [messages, busy, open]);

  const speak = (text: string) => {
    if (!voice || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[#*_`]/g, '').slice(0, 600));
    u.rate = 1.02;
    window.speechSynthesis.speak(u);
  };
  const startListen = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setError('Voice input is not available in this browser.'); return; }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = () => { setListening(false); setError('Microphone was blocked. You can keep typing instead.'); };
    rec.onresult = (ev: any) => { const said = ev.results[0]?.[0]?.transcript?.trim(); if (said) void send(said); };
    recognitionRef.current = rec;
    try { rec.start(); } catch { setError('Could not start the microphone.'); }
  };
  const toggleVoice = () => {
    if (voice) { recognitionRef.current?.stop(); window.speechSynthesis?.cancel(); setVoice(false); setListening(false); return; }
    setVoice(true); startListen();
  };
  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    const key = getOpenRouterKey();
    if (!key) { setError('Add an OpenRouter key in Settings first.'); return; }
    setError(''); setInput('');
    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next); setBusy(true);
    try {
      const reply = await ask(next, page, key);
      setMessages([...next, reply]);
      if (voice && reply.content) speak(reply.content);
    } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.'); }
    finally { setBusy(false); }
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
      await runTool(msg.pending.name, msg.pending.args, { startFocus: () => undefined });
      setMessages((list) => list.map((m, i) => (i === index ? { ...m, pending: { ...m.pending!, done: true } } : m)));
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save that.'); }
    finally { setBusy(false); }
  };
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX; const startW = width;
    const move = (ev: PointerEvent) => onWidth(Math.min(480, Math.max(280, startW + (startX - ev.clientX))));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  if (rail && !open) return null;

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-transparent lg:hidden" onClick={onClose} />}
      <aside
        aria-hidden={!open}
        className={`assistant-panel fixed z-50 flex flex-col bg-white/92 shadow-[-12px_0_40px_rgba(0,0,0,0.08)] transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full pointer-events-none'} inset-y-0 right-0 lg:top-3 lg:bottom-3 lg:right-3 lg:rounded-[22px] lg:border lg:border-white/70`}
        style={{ width }}
      >
        <div className="absolute inset-y-0 left-0 hidden w-1.5 cursor-ew-resize lg:block" onPointerDown={startDrag} />
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-white"><Bot className="h-3.5 w-3.5" /></div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-800">Assistant</p>
              <p className="truncate text-[11px] text-zinc-500">Looking at {PAGE_LABEL[page] ?? page}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={onRail} className="hidden rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 lg:inline-flex" title="Collapse to rail"><PanelRight className="h-4 w-4" /></button>
            <button type="button" onClick={onClose} className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div ref={scrollRef} onScroll={(e) => { scrollPos.current = e.currentTarget.scrollTop; }} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-2">
          {messages.length === 0 && (
            <div className="pt-4">
              <p className="text-sm leading-relaxed text-zinc-500">Ask about grades, tasks, schedule, or notes. Writes wait for your confirm.</p>
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
                {m.role === 'assistant' ? <Markdown>{m.content}</Markdown> : m.content}
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
                          <button type="button" onClick={() => navigate?.(PAGE_VIEW[m.pending!.name] ?? page)} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs text-zinc-700 ring-1 ring-zinc-200"><ExternalLink className="h-3 w-3" /> View</button>
                          <button type="button" onClick={() => setMessages((list) => list.map((mm, ii) => ii === i ? { ...mm, pending: undefined, content: `${mm.content}\n\nMarked undone.` } : mm))} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs text-zinc-600 ring-1 ring-zinc-200"><Undo2 className="h-3 w-3" /> Undo</button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && (<div className="flex items-center gap-2 text-sm text-zinc-500"><span className="flex gap-1"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" /></span>Thinking</div>)}
          {error && <p className="text-xs text-zinc-500">{error}</p>}
        </div>
        <form className="border-t border-zinc-200/70 p-3 pb-6" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          {listening && <div className="mb-2 text-xs text-zinc-600">Listening…</div>}
          <div className="flex items-end gap-2 rounded-2xl bg-zinc-100 px-3 py-2">
            <button type="button" onClick={toggleVoice} className={`flex h-8 w-8 items-center justify-center rounded-full ${voice ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-200'}`} title={voice ? 'Voice on' : 'Voice off'}>{voice ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}</button>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} rows={1} placeholder="Ask anything…" className="max-h-24 min-h-[24px] flex-1 resize-none bg-transparent text-sm text-zinc-800 outline-none" />
            <button type="submit" disabled={busy || !input.trim()} className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-white disabled:opacity-30"><Send className="h-3.5 w-3.5" /></button>
          </div>
        </form>
      </aside>
    </>
  );
}

async function ask(history: Msg[], page: PageId, key: string): Promise<Msg> {
  const model = getDefaultModel() || 'nvidia/nemotron-3.5-lightning:free';
  const system = ['You are the epicure study assistant for a Grade 10 student.', 'Stay on study and school productivity. Do not write or edit code.', pageContext(page), 'You may read grades, tasks, calendar, notes, habits, focus and timetable with tools.', 'If the student wants something created, call the matching write tool. The app will ask them to confirm before anything is saved.', 'Be concise and calm.'].join(' ');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': window.location.origin },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...history.map((m) => ({ role: m.role, content: m.content }))], tools: [...READ_TOOLS, ...CONFIRM_TOOLS], temperature: 0.4 }),
  });
  if (!res.ok) throw new Error('Assistant request failed.');
  const data = await res.json();
  const choice = data.choices?.[0]?.message;
  const toolCalls = choice?.tool_calls as Array<{ function: { name: string; arguments: string } }> | undefined;
  if (toolCalls?.length) {
    const writes = toolCalls.filter((c) => WRITE_TOOLS.has(c.function.name));
    const reads = toolCalls.filter((c) => !WRITE_TOOLS.has(c.function.name));
    const snippets: string[] = [];
    for (const call of reads) {
      let args = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* ignore */ }
      const result = await runTool(call.function.name, args, { startFocus: () => undefined });
      snippets.push(`${call.function.name}: ${JSON.stringify(result).slice(0, 800)}`);
    }
    if (writes[0]) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(writes[0].function.arguments || '{}'); } catch { /* ignore */ }
      return { role: 'assistant', content: choice?.content || 'I can save this if you confirm.', pending: { name: writes[0].function.name, args } };
    }
    if (snippets.length) {
      const follow = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...history.map((m) => ({ role: m.role, content: m.content })), { role: 'assistant', content: choice?.content || '' }, { role: 'user', content: `Tool results:\n${snippets.join('\n')}\nAnswer from this data.` }], temperature: 0.3 }),
      });
      const followData = await follow.json();
      return { role: 'assistant', content: followData.choices?.[0]?.message?.content || 'Here is what I found.' };
    }
  }
  return { role: 'assistant', content: choice?.content || 'I do not have an answer yet.' };
}
