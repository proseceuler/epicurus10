import { useState, useRef, useEffect, useCallback } from 'react';
import { getOpenRouterKey, getDefaultModel } from '@/lib/apiKeys';
import { supabase } from '@/lib/supabase';
import type { PageId } from '@/components/AppLayout';
import { Bot, Send, Check, X, Loader2 } from 'lucide-react';

interface ProposedAction {
  id: string;
  description: string;
  /** Structured hint from the model, if any */
  kind?: string;
}

interface CodsworthMessage {
  role: 'user' | 'assistant';
  content: string;
  action?: ProposedAction;
}

const SCOPE_PROMPTS: Partial<Record<PageId, string>> = {
  todos:
    'You are Codsworth, a tidy task-organizing assistant for a To-Do List. You can suggest task priority (Eisenhower-style: urgent/important), catch duplicate or near-duplicate tasks, and suggest reordering. When you propose a concrete change, end your reply with a single line starting with "ACTION:" describing exactly what you propose (e.g. "ACTION: Merge Buy milk and Get milk from store into one task" or "ACTION: Delete todo id=..."). Otherwise just answer conversationally. You will be given the live task list as JSON context.',
  kanban:
    'You are Codsworth, a tidy task-organizing assistant for a Kanban Board. You can suggest which column a card belongs in, flag stale cards, and suggest tidying columns. When you propose a concrete change, end your reply with a single line starting with "ACTION:". Otherwise just answer conversationally. Live board data is provided as JSON context.',
  calendar:
    'You are Codsworth, a scheduling assistant for a Calendar. You flag scheduling conflicts among deadlines and suggest resolutions. When you propose a concrete change, end your reply with a single line starting with "ACTION:". Otherwise just answer conversationally. Live events are provided as JSON context.',
  notes:
    'You are Codsworth, a note-tidying assistant for Notes & Ideas. You dedupe and reorganize notes and tighten wording. When you propose a concrete change, end your reply with a single line starting with "ACTION:". Otherwise just answer conversationally. Live notes are provided as JSON context.',
};

type Item = Record<string, unknown> & { id?: string; title?: string; content?: string };

async function loadPageItems(page: PageId): Promise<Item[]> {
  if (page === 'todos') {
    const { data } = await supabase.from('todos').select('*').order('created_at', { ascending: false }).limit(80);
    return (data as Item[]) || [];
  }
  if (page === 'kanban') {
    const { data } = await supabase.from('kanban_tasks').select('*').order('created_at', { ascending: false }).limit(80);
    return (data as Item[]) || [];
  }
  if (page === 'calendar') {
    // calendar may use calendar events or todos with due_date — try common tables
    const { data } = await supabase.from('todos').select('*').not('due_date', 'is', null).order('due_date', { ascending: true }).limit(80);
    return (data as Item[]) || [];
  }
  if (page === 'notes') {
    const { data } = await supabase.from('notes').select('*').order('updated_at', { ascending: false }).limit(80);
    return (data as Item[]) || [];
  }
  return [];
}

/** Best-effort apply of confirmed ACTION text against live data. */
async function applyAction(page: PageId, description: string, items: Item[]): Promise<string> {
  const desc = description.toLowerCase();

  // Merge / delete duplicates on todos or notes
  if (desc.includes('merge') || desc.includes('duplicate') || desc.includes('dedupe') || desc.includes('delete')) {
    // Find two items whose titles appear in the description
    const matched = items.filter((it) => {
      const title = String(it.title || it.content || '').toLowerCase();
      return title.length > 2 && desc.includes(title.slice(0, Math.min(title.length, 24)));
    });

    if (page === 'todos' || page === 'calendar') {
      if (matched.length >= 2) {
        // Keep first, delete the rest
        const keep = matched[0];
        for (const m of matched.slice(1)) {
          if (m.id) await supabase.from('todos').delete().eq('id', m.id);
        }
        return `Merged into “${keep.title || keep.id}” and removed ${matched.length - 1} duplicate(s).`;
      }
      // Explicit id= in action
      const idMatch = description.match(/id[=:\s]+([a-zA-Z0-9-]+)/);
      if (idMatch && desc.includes('delete')) {
        await supabase.from('todos').delete().eq('id', idMatch[1]);
        return `Deleted task ${idMatch[1]}.`;
      }
    }

    if (page === 'notes') {
      if (matched.length >= 2) {
        const keep = matched[0];
        for (const m of matched.slice(1)) {
          if (m.id) await supabase.from('notes').delete().eq('id', m.id);
        }
        return `Kept “${keep.title || keep.id}” and removed ${matched.length - 1} duplicate note(s).`;
      }
    }

    if (page === 'kanban') {
      if (matched.length >= 2) {
        for (const m of matched.slice(1)) {
          if (m.id) await supabase.from('kanban_tasks').delete().eq('id', m.id);
        }
        return `Removed ${matched.length - 1} duplicate card(s).`;
      }
      // Move card: "move X to done/doing/todo"
      const col = desc.includes('done') ? 'done' : desc.includes('doing') || desc.includes('progress') ? 'doing' : desc.includes('todo') || desc.includes('backlog') ? 'todo' : null;
      if (col && matched[0]?.id) {
        await supabase.from('kanban_tasks').update({ column: col, status: col }).eq('id', matched[0].id);
        return `Moved “${matched[0].title}” toward ${col}.`;
      }
    }
  }

  // Priority updates on todos
  if (page === 'todos' && (desc.includes('priority') || desc.includes('urgent') || desc.includes('important'))) {
    const matched = items.find((it) => {
      const title = String(it.title || '').toLowerCase();
      return title.length > 2 && desc.includes(title.slice(0, Math.min(title.length, 24)));
    });
    let priority = 'not_urgent_important';
    if (desc.includes('urgent') && desc.includes('not important')) priority = 'urgent_not_important';
    else if (desc.includes('urgent')) priority = 'urgent_important';
    else if (desc.includes('not important') || desc.includes('neither')) priority = 'not_urgent_not_important';
    if (matched?.id) {
      await supabase.from('todos').update({ priority }).eq('id', matched.id);
      return `Updated priority on “${matched.title}” to ${priority.replace(/_/g, ' ')}.`;
    }
  }

  return 'Noted. I could not map that ACTION to a concrete row — try naming the exact task title.';
}

export default function CodsworthPanel({
  page,
  onClose,
  items: itemsProp,
  onItemsChange,
}: {
  page: PageId;
  onClose: () => void;
  /** Optional live list from the page; if omitted we load from Supabase. */
  items?: Item[];
  /** Optional callback so the page can refresh its local state after a mutation. */
  onItemsChange?: () => void;
}) {
  const [messages, setMessages] = useState<CodsworthMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[]>(itemsProp || []);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshItems = useCallback(async () => {
    if (itemsProp) {
      setItems(itemsProp);
      return;
    }
    const data = await loadPageItems(page);
    setItems(data);
  }, [page, itemsProp]);

  useEffect(() => {
    refreshItems();
  }, [refreshItems]);

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
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'No OpenRouter API key found — add one in Settings to chat with Codsworth.' },
      ]);
      return;
    }

    setLoading(true);
    try {
      await refreshItems();
      const snapshot = items.slice(0, 40).map((it) => ({
        id: it.id,
        title: it.title,
        content: typeof it.content === 'string' ? it.content.slice(0, 120) : undefined,
        priority: it.priority,
        completed: it.completed,
        column: it.column || it.status,
        folder: it.folder,
        due_date: it.due_date,
      }));

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: getDefaultModel() || 'nvidia/nemotron-nano-9b-v2:free',
          messages: [
            {
              role: 'system',
              content:
                (SCOPE_PROMPTS[page] || 'You are Codsworth, a helpful organizing assistant.') +
                '\n\nCurrent page data (JSON):\n' +
                JSON.stringify(snapshot, null, 0),
            },
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

  async function resolveAction(id: string, confirmed: boolean) {
    const msg = messages.find((m) => m.action?.id === id);
    if (!msg?.action) return;

    let suffix = '\n\n✕ Cancelled.';
    if (confirmed) {
      try {
        const result = await applyAction(page, msg.action.description, items);
        suffix = `\n\n✓ Applied. ${result}`;
        await refreshItems();
        onItemsChange?.();
      } catch (err) {
        suffix = `\n\n✕ Failed: ${err instanceof Error ? err.message : 'unknown error'}`;
      }
    }

    setMessages((m) =>
      m.map((row) =>
        row.action?.id === id
          ? { ...row, content: row.content + suffix, action: undefined }
          : row
      )
    );
  }

  return (
    <div className="fixed bottom-24 left-1/2 z-50 flex w-80 max-h-[28rem] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-800">
          <Bot className="h-4 w-4 text-zinc-700" />
          Codsworth
        </div>
        <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3 text-sm">
        {messages.length === 0 && (
          <p className="text-xs text-zinc-400">
            I can help organize this page — try &quot;prioritize my tasks&quot; or &quot;find duplicates.&quot;
            {items.length > 0 ? ` (${items.length} items loaded)` : ''}
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 ${
                m.role === 'user' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-800'
              }`}
            >
              {m.content}
              {m.action && (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => resolveAction(m.action!.id, true)}
                    className="flex items-center gap-1 rounded-full bg-zinc-900 px-2 py-1 text-xs text-white"
                  >
                    <Check className="h-3 w-3" /> Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => resolveAction(m.action!.id, false)}
                    className="flex items-center gap-1 rounded-full border border-zinc-300 px-2 py-1 text-xs text-zinc-600"
                  >
                    <X className="h-3 w-3" /> Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
      </div>

      <div className="flex items-center gap-2 border-t border-zinc-100 px-3 py-2.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ask Codsworth..."
          className="flex-1 rounded-full border border-zinc-200 px-3 py-1.5 text-sm focus:border-zinc-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={send}
          disabled={loading}
          className="rounded-full bg-zinc-900 p-1.5 text-white disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
