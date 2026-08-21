import { useState, useRef, useEffect } from 'react';
import { getOpenRouterKey, getDefaultModel } from '@/lib/apiKeys';
import type { PageId } from '@/components/AppLayout';
import { Bot, Send, Check, X, Loader2 } from 'lucide-react';

interface ProposedAction {
  id: string;
  description: string;
}

interface CodsworthMessage {
  role: 'user' | 'assistant';
  content: string;
  action?: ProposedAction;
}

const SCOPE_PROMPTS: Partial<Record<PageId, string>> = {
  todos: 'You are Codsworth, a tidy task-organizing assistant for a To-Do List. You can suggest task priority (Eisenhower-style: urgent/important), catch duplicate or near-duplicate tasks, and suggest reordering. When you propose a concrete change, end your reply with a single line starting with "ACTION:" describing exactly what you propose (e.g. "ACTION: Merge \'Buy milk\' and \'Get milk from store\' into one task"). Otherwise just answer conversationally.',
  kanban: 'You are Codsworth, a tidy task-organizing assistant for a Kanban Board. You can suggest which column a card belongs in, flag stale cards, and suggest tidying columns. When you propose a concrete change, end your reply with a single line starting with "ACTION:". Otherwise just answer conversationally.',
  calendar: 'You are Codsworth, a scheduling assistant for a Calendar. You flag scheduling conflicts among deadlines and suggest resolutions. When you propose a concrete change, end your reply with a single line starting with "ACTION:". Otherwise just answer conversationally.',
  notes: 'You are Codsworth, a note-tidying assistant for Notes & Ideas. You dedupe and reorganize notes and tighten wording. When you propose a concrete change, end your reply with a single line starting with "ACTION:". Otherwise just answer conversationally.',
};

export default function CodsworthPanel({ page, onClose }: { page: PageId; onClose: () => void }) {
  const [messages, setMessages] = useState<CodsworthMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const key = getOpenRouterKey();
    setInput('');
    const nextMessages: CodsworthMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);

    if (!key) {
      setMessages((m) => [...m, { role: 'assistant', content: 'No OpenRouter API key found — add one in Settings to chat with Codsworth.' }]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: getDefaultModel() || 'nvidia/nemotron-nano-9b-v2:free',
          messages: [
            { role: 'system', content: SCOPE_PROMPTS[page] || 'You are Codsworth, a helpful organizing assistant.' },
            ...nextMessages.map((m) => ({ role: m.role, content: m.content })),
          ],
        }),
      });
      const data = await res.json();
      const raw: string = data.choices?.[0]?.message?.content || 'Sorry, I had trouble with that.';
      const actionMatch = raw.match(/ACTION:\s*(.+)$/m);
      const content = actionMatch ? raw.slice(0, actionMatch.index).trim() : raw;
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content,
          action: actionMatch ? { id: `${Date.now()}`, description: actionMatch[1].trim() } : undefined,
        },
      ]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Something went wrong reaching Codsworth.' }]);
    } finally {
      setLoading(false);
    }
  }

  function resolveAction(id: string, confirmed: boolean) {
    setMessages((m) =>
      m.map((msg) =>
        msg.action?.id === id
          ? {
              ...msg,
              content: msg.content + (confirmed ? '\n\n✓ Applied.' : '\n\n✕ Cancelled.'),
              action: undefined,
            }
          : msg
      )
    );
    // Actual data mutation is left to the page-level handler that owns
    // the underlying task/note store — this only clears the confirm UI.
  }

  return (
    <div className="fixed bottom-24 right-4 z-50 w-80 max-h-[28rem] flex flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 bg-zinc-50">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-800">
          <Bot className="w-4 h-4 text-emerald-600" />
          Codsworth
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 text-sm">
        {messages.length === 0 && (
          <p className="text-xs text-zinc-400">
            I can help organize this page — try "prioritize my tasks" or "find duplicates."
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 whitespace-pre-wrap ${m.role === 'user' ? 'bg-emerald-600 text-white' : 'bg-zinc-100 text-zinc-800'}`}>
              {m.content}
              {m.action && (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => resolveAction(m.action!.id, true)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-600 text-white"
                  >
                    <Check className="w-3 h-3" /> Confirm
                  </button>
                  <button
                    onClick={() => resolveAction(m.action!.id, false)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-zinc-300 text-zinc-600"
                  >
                    <X className="w-3 h-3" /> Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
      </div>

      <div className="flex items-center gap-2 px-3 py-2.5 border-t border-zinc-100">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ask Codsworth..."
          className="flex-1 text-sm px-3 py-1.5 rounded-full border border-zinc-200 focus:outline-none focus:border-emerald-400"
        />
        <button onClick={send} disabled={loading} className="p-1.5 rounded-full bg-emerald-600 text-white disabled:opacity-50">
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
