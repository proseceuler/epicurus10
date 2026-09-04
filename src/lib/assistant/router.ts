import { OPENROUTER_URL, LAYER_MODELS, LAYER_FALLBACKS, VISION_MODELS, type AssistantLayer } from './models';
import { listToolDefs, isWriteTool, dispatchTool } from './registry';
import { attachmentPrompt, visionParts, type ChatAttachment } from './media';
import type { ToolContext } from '@/lib/aiTools';
import type { PageId } from '@/components/AppLayout';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  attachments?: ChatAttachment[];
}

export interface PendingWrite {
  name: string;
  args: Record<string, unknown>;
  done?: boolean;
}

export interface RouterReply {
  content: string;
  pending?: PendingWrite;
  usedLayers: AssistantLayer[];
  sources?: { title: string; url: string }[];
}

const PAGE_LABEL: Record<string, string> = {
  dashboard: 'Dashboard', grades: 'Grades', forecast: 'Grades', classhub: 'Class Hub',
  todos: 'To-Do List', kanban: 'Kanban', calendar: 'Calendar', notes: 'Notes & Board',
  pomodoro: 'Focus', analytics: 'Focus', habits: 'Habits', finance: 'Baon Tracker',
  flashcards: 'Flashcards', settings: 'Settings', assistant: 'Dashboard',
};

function systemPrompt(page: PageId, search: boolean) {
  return [
    'You are the epicure study assistant for a Grade 10 student.',
    'Stay on schoolwork and productivity. Do not write or edit app code.',
    `The student is currently on ${PAGE_LABEL[page] ?? page}.`,
    'Use tools to read their real tasks, notes, grades, habits, timetable and spending when the question is about their data.',
    'If they ask to create or change something in the app, call the matching tool. The app will confirm before saving writes.',
    'Reply in markdown. Use $...$ or $$...$$ for math. Keep answers concise.',
    search ? 'Web search is ON. Call web_search when the answer needs current or external facts, then cite titles.' : 'Web search is OFF unless they explicitly ask you to look something up.',
  ].join(' ');
}

export function classifyIntent(text: string, hasMedia: boolean, searchOn: boolean): AssistantLayer[] {
  const t = text.toLowerCase();
  const layers = new Set<AssistantLayer>(['chat']);
  const actionVerb = /\b(add|create|make|schedule|log|mark|update|set|fill|record|start|complete|finish|save|edit)\b/.test(t);
  const actionNoun = /\b(task|todo|to-do|note|habit|event|calendar|flashcard|grade|assessment|expense|baon|class|teacher|room|office hours|kanban|card|focus|pomodoro|link)\b/.test(t);
  const vault = /\b(my notes?|vault|archive|what did i (write|save|note)|search my|from my (notes|projects?|history)|project history)\b/.test(t);
  const live = searchOn || /\b(search the web|look up|latest|current|according to|news|cite|source)\b/.test(t);
  if (actionVerb && actionNoun) layers.add('execute');
  if (vault || /\b(my (grades|tasks|habits|schedule|timetable|spending|baon))\b/.test(t)) layers.add('data');
  if (hasMedia) layers.add('chat');
  if (live) layers.add('chat');
  return [...layers];
}

interface ORMessage {
  role: string;
  content: unknown;
  tool_calls?: Array<{ id?: string; function: { name: string; arguments: string } }>;
}

async function complete(opts: {
  key: string;
  layer: AssistantLayer;
  messages: ORMessage[];
  tools?: ReturnType<typeof listToolDefs>;
  temperature?: number;
  preferVision?: boolean;
}): Promise<{ content: string; tool_calls: Array<{ function: { name: string; arguments: string } }>; model: string }> {
  const chain = [
    opts.preferVision ? VISION_MODELS[0] : LAYER_MODELS[opts.layer],
    ...LAYER_FALLBACKS[opts.layer],
  ].filter((v, i, a) => a.indexOf(v) === i);

  let lastErr = 'Assistant request failed.';
  for (const model of chain) {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://epicure.app',
        'X-Title': 'epicure assistant',
      },
      body: JSON.stringify({
        model,
        messages: opts.messages,
        tools: opts.tools?.length ? opts.tools : undefined,
        temperature: opts.temperature ?? 0.35,
      }),
    });
    if (!res.ok) {
      lastErr = `Assistant request failed (${res.status}).`;
      continue;
    }
    const data = await res.json();
    const choice = data.choices?.[0]?.message;
    return {
      content: String(choice?.content || ''),
      tool_calls: (choice?.tool_calls || []) as Array<{ function: { name: string; arguments: string } }>,
      model,
    };
  }
  throw new Error(lastErr);
}

function toApiMessages(history: ChatTurn[], page: PageId, search: boolean): ORMessage[] {
  const out: ORMessage[] = [{ role: 'system', content: systemPrompt(page, search) }];
  for (const m of history) {
    if (m.role === 'user' && m.attachments?.length) {
      const images = visionParts(m.attachments);
      const text = [m.content, attachmentPrompt(m.attachments)].filter(Boolean).join('\n');
      if (images.length) {
        out.push({
          role: 'user',
          content: [{ type: 'text', text }, ...images],
        });
        continue;
      }
      out.push({ role: 'user', content: text });
      continue;
    }
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

async function runCalls(
  calls: Array<{ function: { name: string; arguments: string } }>,
  ctx: ToolContext,
) {
  const reads: string[] = [];
  const writes: PendingWrite[] = [];
  const sources: { title: string; url: string }[] = [];
  for (const call of calls) {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* ignore */ }
    if (isWriteTool(call.function.name)) {
      writes.push({ name: call.function.name, args });
      continue;
    }
    const result = await dispatchTool(call.function.name, args, ctx);
    reads.push(`${call.function.name}: ${JSON.stringify(result).slice(0, 1600)}`);
    if (call.function.name === 'web_search' && result && typeof result === 'object') {
      const rows = (result as { results?: Array<{ title: string; url: string }> }).results || [];
      sources.push(...rows.slice(0, 5).map((r) => ({ title: r.title, url: r.url })));
    }
  }
  return { reads, writes, sources };
}

export async function runAssistantTurn(opts: {
  key: string;
  page: PageId;
  history: ChatTurn[];
  searchEnabled: boolean;
  ctx: ToolContext;
}): Promise<RouterReply> {
  const last = opts.history[opts.history.length - 1];
  const hasMedia = Boolean(last?.attachments?.length);
  const layers = classifyIntent(last?.content || '', hasMedia, opts.searchEnabled);
  const usedLayers = [...layers];
  const apiMessages = toApiMessages(opts.history, opts.page, opts.searchEnabled);
  const ctx = opts.ctx;

  let retrieval = '';
  let pending: PendingWrite | undefined;
  const sources: { title: string; url: string }[] = [];

  if (layers.includes('data')) {
    const dataTools = listToolDefs({ webSearch: false, writes: false });
    const data = await complete({
      key: opts.key,
      layer: 'data',
      messages: [
        ...apiMessages,
        { role: 'user', content: 'Search the student vault (notes, tasks, habits, grades) for anything relevant, then summarize the raw facts only.' },
      ],
      tools: dataTools,
      temperature: 0.1,
    });
    if (data.tool_calls.length) {
      const ran = await runCalls(data.tool_calls, ctx);
      retrieval += ran.reads.join('\n');
    } else if (data.content) {
      retrieval += data.content;
    }
  }

  if (layers.includes('execute')) {
    const execTools = listToolDefs({ webSearch: opts.searchEnabled, writes: true });
    const exec = await complete({
      key: opts.key,
      layer: 'execute',
      messages: [
        ...apiMessages,
        ...(retrieval ? [{ role: 'user' as const, content: `Vault facts:\n${retrieval.slice(0, 2500)}` }] : []),
      ],
      tools: execTools,
      temperature: 0.15,
    });
    if (exec.tool_calls.length) {
      const ran = await runCalls(exec.tool_calls, ctx);
      retrieval += (retrieval ? '\n' : '') + ran.reads.join('\n');
      sources.push(...ran.sources);
      pending = ran.writes[0];
    }
  }

  const chatTools = listToolDefs({ webSearch: opts.searchEnabled, writes: false });
  const chatMessages: ORMessage[] = [...apiMessages];
  if (retrieval) {
    chatMessages.push({
      role: 'user',
      content: `Internal tool results (do not mention model names):\n${retrieval.slice(0, 3500)}\nAnswer the student from this plus the conversation.${pending ? `\nA write is waiting for confirm: ${pending.name}.` : ''}`,
    });
  }

  const chat = await complete({
    key: opts.key,
    layer: 'chat',
    messages: chatMessages,
    tools: chatTools,
    temperature: 0.4,
    preferVision: hasMedia,
  });

  if (chat.tool_calls.length) {
    const ran = await runCalls(chat.tool_calls, ctx);
    sources.push(...ran.sources);
    if (ran.writes[0] && !pending) pending = ran.writes[0];
    if (ran.reads.length) {
      const follow = await complete({
        key: opts.key,
        layer: 'chat',
        messages: [
          ...chatMessages,
          { role: 'assistant', content: chat.content || '' },
          { role: 'user', content: `More tool results:\n${ran.reads.join('\n')}\nFinish the answer.` },
        ],
        temperature: 0.3,
      });
      return {
        content: follow.content || chat.content || 'Here is what I found.',
        pending,
        usedLayers,
        sources: sources.length ? sources : undefined,
      };
    }
  }

  return {
    content: chat.content || (pending ? 'I can save this if you confirm.' : 'I do not have an answer yet.'),
    pending,
    usedLayers,
    sources: sources.length ? sources : undefined,
  };
}
