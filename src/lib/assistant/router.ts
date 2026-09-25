import {
  OPENROUTER_URL,
  LAYER_MODELS,
  LAYER_FALLBACKS,
  VISION_MODELS,
  VOICE_FAST_MODELS,
  type AssistantLayer,
} from './models';
import { listToolDefs, isWriteTool, dispatchTool, AUTO_APPLY_WRITES } from './registry';
import { attachmentPrompt, visionParts, type ChatAttachment } from './media';
import { memoryBlock } from './memory';
import { voiceSystemPrompt } from './voicePrompt';
import { streamVoiceComplete, type StreamHooks } from './streamVoice';
import type { ToolContext } from '@/lib/aiTools';
import type { PageId } from '@/components/AppLayout';

export type { StreamHooks };

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
    'You are Arrodes, the epicure study assistant for a Grade 10 student.',
    'Stay on schoolwork and productivity. Do not write or edit app code.',
    `The student is currently on ${PAGE_LABEL[page] ?? page}.`,
    memoryBlock(),
    'Use tools for the student data. Prefer get_* tools before guessing.',
    'Reply in markdown. Keep answers concise.',
    search ? 'Web search is ON.' : 'Web search is OFF unless asked.',
  ].filter(Boolean).join(' ');
}

const LEAK_RE = /identify core intent|thinking process|chain of thought|system prompt rule/i;

export function stripReasoning(raw: string, fallback = 'Hey — what do you need?') {
  let text = String(raw || '');
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  text = text.replace(/<\/?think>/gi, '');
  text = text.replace(/```(?:thinking|reasoning|analysis)[\s\S]*?```/gi, '');
  const parts = text.split(/\n+/).filter((p) => !LEAK_RE.test(p));
  text = parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text || LEAK_RE.test(text)) return fallback;
  return text;
}

export function classifyIntent(text: string, hasMedia: boolean, searchOn: boolean): AssistantLayer[] {
  const t = text.toLowerCase();
  const layers = new Set<AssistantLayer>(['chat']);
  const actionVerb = /\b(add|create|make|schedule|log|mark|update|set|start|complete|save|edit|attend|move|delete)\b/.test(t);
  const actionNoun = /\b(task|todo|note|habit|event|calendar|flashcard|grade|assessment|expense|baon|kanban|focus)\b/.test(t);
  if (actionVerb && actionNoun) layers.add('execute');
  if (/\b(attended|skipped|attend|skip)\b/.test(t)) layers.add('execute');
  if (hasMedia || searchOn) layers.add('chat');
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
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<{ content: string; tool_calls: Array<{ function: { name: string; arguments: string } }>; model: string }> {
  const chain = [LAYER_MODELS[opts.layer], ...LAYER_FALLBACKS[opts.layer]].filter((v, i, a) => a.indexOf(v) === i);
  let lastErr = 'Assistant request failed.';
  for (const model of chain) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
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
        max_tokens: opts.maxTokens ?? 700,
        reasoning: { exclude: true },
      }),
      signal: opts.signal,
    });
    if (!res.ok) { lastErr = `Assistant request failed (${res.status}).`; continue; }
    const data = await res.json();
    const choice = data.choices?.[0]?.message;
    return {
      content: stripReasoning(String(choice?.content || ''), ''),
      tool_calls: (choice?.tool_calls || []) as Array<{ function: { name: string; arguments: string } }>,
      model,
    };
  }
  throw new Error(lastErr);
}

function toApiMessages(history: ChatTurn[], page: PageId, search: boolean, voice = false): ORMessage[] {
  const system = voice ? voiceSystemPrompt(page) : systemPrompt(page, search);
  const out: ORMessage[] = [{ role: 'system', content: system }];
  const keep = history.slice(voice ? -6 : -24);
  for (const m of keep) {
    if (m.role === 'user' && m.attachments?.length) {
      const images = visionParts(m.attachments);
      const text = [m.content, attachmentPrompt(m.attachments)].filter(Boolean).join('\n');
      if (images.length) {
        out.push({ role: 'user', content: [{ type: 'text', text }, ...images] });
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
    try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* */ }
    if (isWriteTool(call.function.name) && !AUTO_APPLY_WRITES.has(call.function.name)) {
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
  voice?: boolean;
  ctx: ToolContext;
  signal?: AbortSignal;
  stream?: StreamHooks;
}): Promise<RouterReply> {
  const last = opts.history[opts.history.length - 1];
  const hasMedia = Boolean(last?.attachments?.length);
  const voice = Boolean(opts.voice);
  const layers = classifyIntent(last?.content || '', hasMedia, opts.searchEnabled);
  if (voice && !hasMedia) {
    const needExec = layers.includes('execute');
    layers.length = 0;
    layers.push('chat');
    if (needExec) layers.push('execute');
  }
  const usedLayers = [...layers];
  const apiMessages = toApiMessages(opts.history, opts.page, opts.searchEnabled, voice);
  const signal = opts.signal;
  let retrieval = '';
  let pending: PendingWrite | undefined;
  const sources: { title: string; url: string }[] = [];

  const pureVoiceChat = voice && !layers.includes('execute') && !hasMedia;

  if (pureVoiceChat) {
    const chat = await streamVoiceComplete({
      openRouterKey: opts.key,
      messages: apiMessages,
      temperature: 0.55,
      maxTokens: 160,
      signal,
      hooks: opts.stream,
    });
    return {
      content: stripReasoning(chat.content || 'I could not get a reply. Try again.'),
      usedLayers,
    };
  }

  if (layers.includes('execute')) {
    const execTools = listToolDefs({ webSearch: opts.searchEnabled, writes: true });
    const exec = await complete({
      key: opts.key,
      layer: 'execute',
      messages: apiMessages,
      tools: execTools,
      temperature: 0.15,
      signal,
    });
    if (exec.tool_calls.length) {
      const ran = await runCalls(exec.tool_calls, opts.ctx);
      retrieval += ran.reads.join('\n');
      sources.push(...ran.sources);
      pending = ran.writes[0];
    }
  }

  const chatMessages: ORMessage[] = [...apiMessages];
  if (retrieval) {
    chatMessages.push({
      role: 'user',
      content: `Tool results:\n${retrieval.slice(0, 3500)}\nAnswer the student.${pending ? `\nWrite pending confirm: ${pending.name}.` : ''}`,
    });
  }

  if (voice && opts.stream) {
    const chat = await streamVoiceComplete({
      openRouterKey: opts.key,
      messages: chatMessages,
      temperature: 0.55,
      maxTokens: 160,
      signal,
      hooks: opts.stream,
    });
    return {
      content: stripReasoning(chat.content || (pending ? 'I can save this if you confirm.' : 'Done.')),
      pending,
      usedLayers,
      sources: sources.length ? sources : undefined,
    };
  }

  const chat = await complete({
    key: opts.key,
    layer: 'chat',
    messages: chatMessages,
    tools: voice ? undefined : listToolDefs({ webSearch: opts.searchEnabled, writes: false }),
    temperature: voice ? 0.55 : 0.4,
    maxTokens: voice ? 220 : 700,
    signal,
  });

  return {
    content: stripReasoning(
      chat.content ||
        (pending ? 'I can save this if you confirm.' : 'I could not get a reply. Try again.'),
    ),
    pending,
    usedLayers,
    sources: sources.length ? sources : undefined,
  };
}
