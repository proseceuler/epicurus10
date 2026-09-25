import { getGroqKey, getOpenRouterKey } from '@/lib/apiKeys';
import {
  listToolDefs,
  dispatchTool,
  isWriteTool,
  AUTO_APPLY_WRITES,
} from '@/lib/assistant/registry';
import { attachmentPrompt, visionParts, type ChatAttachment } from '@/lib/assistant/media';
import type { ToolContext } from '@/lib/aiTools';
import type { PageId } from '@/components/AppLayout';
import { systemPrompt } from './prompt';
import { streamChat, type ChatMessage } from './client';
import { GROQ_URL, OR_URL, GROQ_MODELS, OR_MODELS, orHeaders } from './models';

export type TurnMessage = {
  role: 'user' | 'assistant';
  content: string;
  attachments?: ChatAttachment[];
};

export type PendingWrite = {
  name: string;
  args: Record<string, unknown>;
  done?: boolean;
};

export type TurnResult = {
  content: string;
  pending?: PendingWrite;
  sources?: { title: string; url: string }[];
};

type ApiMsg = {
  role: string;
  content: unknown;
  tool_calls?: Array<{ id: string; type?: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
};

function buildMessages(
  history: TurnMessage[],
  page: PageId,
  voice: boolean,
  searchOn: boolean,
): ApiMsg[] {
  const out: ApiMsg[] = [{ role: 'system', content: systemPrompt(page, voice, searchOn) }];
  for (const m of history.slice(-10)) {
    if (m.role === 'user' && m.attachments?.length) {
      const images = visionParts(m.attachments);
      const text = [m.content, attachmentPrompt(m.attachments)].filter(Boolean).join('\n');
      if (images.length) {
        out.push({
          role: 'user',
          content: [{ type: 'text', text }, ...images],
        });
      } else {
        out.push({ role: 'user', content: text });
      }
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

async function completeWithTools(opts: {
  messages: ApiMsg[];
  tools: ReturnType<typeof listToolDefs>;
  signal?: AbortSignal;
}): Promise<{
  content: string;
  tool_calls: Array<{ id: string; function: { name: string; arguments: string } }>;
}> {
  const groq = getGroqKey();
  const orKey = getOpenRouterKey();
  const attempts: Array<{ url: string; key: string; model: string; headers?: Record<string, string> }> = [];

  if (groq) {
    for (const model of GROQ_MODELS) {
      attempts.push({ url: GROQ_URL, key: groq, model });
    }
  }
  if (orKey) {
    for (const model of OR_MODELS) {
      attempts.push({ url: OR_URL, key: orKey, model, headers: orHeaders() });
    }
  }
  if (!attempts.length) throw new Error('Add a Groq or OpenRouter key in Settings.');

  let lastErr = 'Request failed.';
  for (const a of attempts) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const res = await fetch(a.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${a.key}`,
        'Content-Type': 'application/json',
        ...a.headers,
      },
      body: JSON.stringify({
        model: a.model,
        messages: opts.messages,
        tools: opts.tools.length ? opts.tools : undefined,
        temperature: 0.3,
        max_tokens: 600,
      }),
      signal: opts.signal,
    });
    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.text();
        const j = JSON.parse(body);
        detail = j?.error?.message || body.slice(0, 100);
      } catch {
        /* */
      }
      lastErr = detail ? `Chat failed (${res.status}): ${detail}` : `Chat failed (${res.status}).`;
      continue;
    }
    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    return {
      content: String(msg?.content || '').trim(),
      tool_calls: (msg?.tool_calls || []).map(
        (tc: { id?: string; function: { name: string; arguments: string } }, i: number) => ({
          id: tc.id || `call_${i}`,
          function: tc.function,
        }),
      ),
    };
  }
  throw new Error(lastErr);
}

async function runToolCalls(
  calls: Array<{ id: string; function: { name: string; arguments: string } }>,
  ctx: ToolContext,
) {
  const reads: string[] = [];
  const pending: PendingWrite[] = [];
  const sources: { title: string; url: string }[] = [];
  const toolMsgs: ApiMsg[] = [];

  for (const call of calls) {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.function.arguments || '{}');
    } catch {
      /* */
    }
    const name = call.function.name;

    if (isWriteTool(name) && !AUTO_APPLY_WRITES.has(name)) {
      pending.push({ name, args });
      toolMsgs.push({
        role: 'tool',
        tool_call_id: call.id,
        name,
        content: JSON.stringify({ ok: true, pending_confirm: true, summary: name }),
      });
      continue;
    }

    try {
      const result = await dispatchTool(name, args, ctx);
      const snippet = JSON.stringify(result).slice(0, 2000);
      reads.push(`${name}: ${snippet}`);
      toolMsgs.push({
        role: 'tool',
        tool_call_id: call.id,
        name,
        content: snippet,
      });
      if (name === 'web_search' && result && typeof result === 'object') {
        const rows = (result as { results?: Array<{ title: string; url: string }> }).results || [];
        sources.push(...rows.slice(0, 5).map((r) => ({ title: r.title, url: r.url })));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'tool failed';
      toolMsgs.push({
        role: 'tool',
        tool_call_id: call.id,
        name,
        content: JSON.stringify({ error: msg }),
      });
    }
  }

  return { reads, pending: pending[0], sources, toolMsgs };
}

/** One assistant turn: optional tool round, then streamed final answer. */
export async function runTurn(opts: {
  page: PageId;
  history: TurnMessage[];
  voice: boolean;
  searchOn: boolean;
  ctx: ToolContext;
  signal?: AbortSignal;
  onToken?: (full: string) => void;
  onFirstToken?: () => void;
}): Promise<TurnResult> {
  const tools = listToolDefs({ webSearch: opts.searchOn, writes: true });
  const messages = buildMessages(opts.history, opts.page, opts.voice, opts.searchOn);

  const first = await completeWithTools({
    messages,
    tools,
    signal: opts.signal,
  });

  let pending: PendingWrite | undefined;
  let sources: { title: string; url: string }[] = [];

  if (first.tool_calls.length) {
    const ran = await runToolCalls(first.tool_calls, opts.ctx);
    pending = ran.pending;
    sources = ran.sources;

    const compact: ChatMessage[] = [
      { role: 'system', content: systemPrompt(opts.page, opts.voice, opts.searchOn) },
      ...opts.history.slice(-6).map((h) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
      {
        role: 'user',
        content: [
          'Tool results (use these facts; do not invent):',
          ran.reads.join('\n') || '(no read results)',
          pending ? `A write needs confirm: ${pending.name}. Tell the student briefly.` : '',
          'Now answer the student.',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ];

    const content = await streamChat(compact, {
      signal: opts.signal,
      maxTokens: opts.voice ? 140 : 500,
      temperature: 0.4,
      onToken: opts.onToken,
      onFirstToken: opts.onFirstToken,
    });

    return {
      content: content || (pending ? 'I can save that if you confirm.' : 'Done.'),
      pending,
      sources: sources.length ? sources : undefined,
    };
  }

  if (first.content) {
    opts.onFirstToken?.();
    opts.onToken?.(first.content);
    return { content: first.content };
  }

  const chatMsgs: ChatMessage[] = messages.map((m) => ({
    role: m.role as ChatMessage['role'],
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
  }));

  const content = await streamChat(chatMsgs, {
    signal: opts.signal,
    maxTokens: opts.voice ? 140 : 500,
    temperature: opts.voice ? 0.45 : 0.5,
    onToken: opts.onToken,
    onFirstToken: opts.onFirstToken,
  });

  return { content: content || 'Hey — what do you need?' };
}
