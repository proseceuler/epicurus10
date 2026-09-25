import { getGroqKey, getOpenRouterKey } from '@/lib/apiKeys';
import { GROQ_URL, OR_URL, GROQ_MODELS, OR_MODELS, orHeaders } from './models';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type StreamHandlers = {
  onToken?: (full: string) => void;
  onFirstToken?: () => void;
  signal?: AbortSignal;
};

/** Stream a completion. Prefer Groq; fall back to OpenRouter. Tries several model IDs. */
export async function streamChat(
  messages: ChatMessage[],
  opts: StreamHandlers & { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const errors: string[] = [];
  const groq = getGroqKey();

  if (groq) {
    for (const model of GROQ_MODELS) {
      try {
        return await streamOnce({
          url: GROQ_URL,
          key: groq,
          model,
          messages,
          ...opts,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        errors.push(`groq/${model}: ${err instanceof Error ? err.message : 'fail'}`);
      }
    }
  }

  const orKey = getOpenRouterKey();
  if (orKey) {
    for (const model of OR_MODELS) {
      try {
        return await streamOnce({
          url: OR_URL,
          key: orKey,
          model,
          messages,
          extraHeaders: orHeaders(),
          ...opts,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        errors.push(`or/${model}: ${err instanceof Error ? err.message : 'fail'}`);
      }
    }
  }

  if (!groq && !orKey) throw new Error('Add a Groq or OpenRouter key in Settings.');
  throw new Error(errors[0] || 'Chat failed. Check API keys and model access.');
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
    let detail = '';
    try {
      const body = await res.text();
      const j = JSON.parse(body);
      detail = j?.error?.message || j?.message || body.slice(0, 120);
    } catch {
      /* */
    }
    throw new Error(detail ? `Chat failed (${res.status}): ${detail}` : `Chat failed (${res.status}).`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = '';
  let buf = '';
  let first = true;

  while (true) {
    if (opts.signal?.aborted) {
      try {
        await reader.cancel();
      } catch {
        /* */
      }
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
      } catch {
        /* partial */
      }
    }
  }

  return full.trim();
}
