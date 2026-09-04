import { useEffect, useRef, useState } from 'react';
import { Bot, X, Send, Loader2, Check, Ban } from 'lucide-react';
import { getDefaultModel, getOpenRouterKey } from '@/lib/apiKeys';
import { DATA_TOOLS, runTool } from '@/lib/aiTools';
import Markdown from '@/components/Markdown';
import type { PageId } from '@/components/AppLayout';

const WRITE_TOOLS = new Set([
  'add_todo', 'add_note', 'add_calendar_event', 'add_kanban_task',
  'add_flashcard', 'add_assessment',
]);

const READ_TOOLS = DATA_TOOLS.filter((t) => !WRITE_TOOLS.has(t.function.name));
const CONFIRM_TOOLS = DATA_TOOLS.filter((t) => WRITE_TOOLS.has(t.function.name));

function pageContext(page: PageId) {
  const map: Record<string, string> = {
    dashboard: 'The student is on the Dashboard overview.',
    grades: 'The student is in Grades (calculator + forecast).',
    classhub: 'The student is in Class Hub (class info and timetable).',
    todos: 'The student is looking at the To-Do list.',
    kanban: 'The student is on the Kanban board.',
    calendar: 'The student is looking at the Calendar.',
    notes: 'The student is in Notes & Board.',
    pomodoro: 'The student is on the Focus timer and analytics page.',
    habits: 'The student is on the Habit tracker.',
    finance: 'The student is on the Baon / money tracker.',
    flashcards: 'The student is studying flashcards.',
    settings: 'The student is in Settings.',
  };
  return map[page] ?? 'The student is in epicure.';
}

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  pending?: { name: string; args: Record<string, unknown> };
}

export default function GlobalAssistant({ open, page, onClose }: { open: boolean; page: PageId; onClose: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, open]);

  const send = async () => {
    const content = input.trim();
    if (!content || busy) return;
    const key = getOpenRouterKey();
    if (!key) { setError('Add an OpenRouter key in Settings first.'); return; }
    setError(''); setInput('');
    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next); setBusy(true);
    try { setMessages([...next, await ask(next, page, key)]); }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  };

  const confirmWrite = async (index: number, accept: boolean) => {
    const msg = messages[index];
    if (!msg?.pending) return;
    if (!accept) {
      setMessages((list) => list.map((m, i) => (i === index ? { ...m, pending: undefined, content: `${m.content}\n\nCancelled.` } : m)));
      return;
    }
    setBusy(true);
    try {
      const result = await runTool(msg.pending.name, msg.pending.args, { startFocus: () => undefined });
      setMessages((list) => list.map((m, i) => (i === index ? { ...m, pending: undefined, content: `${m.content}\n\nDone. ${JSON.stringify(result)}` } : m)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    } finally { setBusy(false); }
  };

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-zinc-900/20 backdrop-blur-[2px] lg:hidden" onClick={onClose} />}
      <aside className={`assistant-panel fixed z-50 flex flex-col bg-white/80 shadow-[-12px_0_40px_rgba(0,0,0,0.08)] transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'} inset-y-0 right-0 w-full lg:top-3 lg:bottom-3 lg:right-3 lg:w-[340px] lg:rounded-[22px] lg:border lg:border-white/60`}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-white"><Bot className="h-3.5 w-3.5" /></div>
            <div>
              <p className="text-sm font-semibold text-zinc-800">Assistant</p>
              <p className="text-[11px] text-zinc-400">{page}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100"><X className="h-4 w-4" /></button>
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-2">
          {messages.length === 0 && <p className="pt-6 text-sm leading-relaxed text-zinc-500">Ask about grades, tasks, schedule, or notes. Nothing is added until you confirm.</p>}
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'ml-6 rounded-2xl bg-zinc-900 px-3 py-2 text-sm text-white' : 'mr-2 text-sm text-zinc-700'}>
              {m.role === 'assistant' ? <Markdown>{m.content}</Markdown> : m.content}
              {m.pending && (
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => confirmWrite(i, true)} className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-3 py-1 text-xs text-white"><Check className="h-3 w-3" /> Confirm</button>
                  <button type="button" onClick={() => confirmWrite(i, false)} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600"><Ban className="h-3 w-3" /> Cancel</button>
                </div>
              )}
            </div>
          ))}
          {busy && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
          {error && <p className="text-xs text-zinc-500">{error}</p>}
        </div>
        <form className="border-t border-zinc-200/70 p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <div className="flex items-end gap-2 rounded-2xl bg-zinc-100/80 px-3 py-2">
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
      return { role: 'assistant', content: `${choice?.content || 'I can do that if you confirm.'}\n\nProposed: **${writes[0].function.name}**`, pending: { name: writes[0].function.name, args } };
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
