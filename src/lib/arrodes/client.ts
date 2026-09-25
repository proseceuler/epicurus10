import { getGroqKey, getOpenRouterKey } from '@/lib/apiKeys';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant';
const OR_MODEL = 'google/gemma-2-9b-it:free';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type StreamHandlers = {
  onToken?: (full: string) => void;
  onFirstToken?: () => void;
  signal?: AbortSignal;
};

/** Stream a completion. Prefer Groq; fall back to OpenRouter. */
export async function streamChat(
  messages: ChatMessage[],
  opts: StreamHandlers & { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const groq = getGroqKey();
  if (groq) {
    try {
      return await streamOnce({
        url: GROQ_URL,
        key: groq,
        model: GROQ_MODEL,
        messages,
        ...opts,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      // fall through
    }
  }

  const orKey = getOpenRouterKey();
  if (!orKey) throw new Error('Add a Groq or OpenRouter key in Settings.');

  return streamOnce({
    url: OR_URL,
    key: orKey,
    model: OR_MODEL,
    messages,
    extraHeaders: {
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://epicure.app',
      'X-Title': 'epicure',
    },
    ...opts,
  });
}

async function streamOnce(opts: {
  url: string;
  key: string;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  onToken?: (full: string) => void;
  onFirstToken?: () => void;
  extraHeaders?: Record<string, string>;
}): Promise<string> {
  const res = await fetch(opts.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.key}`,
      'Content-Type': 'application/json',
      ...opts.extraHeaders,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.maxTokens ?? 220,
      stream: true,
    }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Chat failed (${res.status}).`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = '';
  let buf = '';
  let first = true;

  while (true) {
    if (opts.signal?.aborted) {
      try { await reader.cancel(); } catch { /* */ }
      throw new DOMException('Aborted', 'AbortError');
    }
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) {
          if (first) {
            first = false;
            opts.onFirstToken?.();
          }
          full += delta;
          opts.onToken?.(full);
        }
      } catch { /* partial */ }
    }
  }

  return full.trim();
}
