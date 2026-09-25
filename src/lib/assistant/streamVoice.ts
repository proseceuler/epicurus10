import {
  OPENROUTER_URL,
  VOICE_FAST_MODELS,
  GROQ_VOICE_MODELS,
  GROQ_CHAT_URL,
} from './models';
import { getGroqKey } from '@/lib/apiKeys';

export interface StreamHooks {
  onToken?: (fullText: string) => void;
  onSentence?: (sentence: string) => void;
  onFirstToken?: () => void;
}

interface ORMessage {
  role: string;
  content: unknown;
}

function stripReasoning(raw: string, fallback = '') {
  let text = String(raw || '');
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  text = text.replace(/<\/?think>/gi, '');
  return text.trim() || fallback;
}

function popSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let lastIndex = 0;
  const re = /([^.!?\n]+[.!?]+)(?:\s+|\n+|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(buffer)) !== null) {
    const s = m[1].trim();
    if (s.length >= 8) {
      sentences.push(s);
      lastIndex = m.index + m[0].length;
    }
  }
  return { sentences, rest: buffer.slice(lastIndex) };
}

async function consumeSseStream(
  res: Response,
  opts: { signal?: AbortSignal; hooks?: StreamHooks },
): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  let spokenRest = '';
  let lineBuf = '';
  let first = true;

  while (true) {
    if (opts.signal?.aborted) {
      try { await reader.cancel(); } catch { /* */ }
      throw new DOMException('Aborted', 'AbortError');
    }
    const { done, value } = await reader.read();
    if (done) break;
    lineBuf += decoder.decode(value, { stream: true });
    const lines = lineBuf.split('\n');
    lineBuf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) {
          if (first) {
            first = false;
            opts.hooks?.onFirstToken?.();
          }
          raw += delta;
          opts.hooks?.onToken?.(stripReasoning(raw, ''));
          const { sentences, rest } = popSentences(spokenRest + delta);
          spokenRest = rest;
          for (const s of sentences) {
            const cs = stripReasoning(s, '').trim();
            if (cs) opts.hooks?.onSentence?.(cs);
          }
        }
      } catch { /* */ }
    }
  }
  const tail = stripReasoning(spokenRest, '').trim();
  if (tail.length >= 8) opts.hooks?.onSentence?.(tail);
  return stripReasoning(raw, '');
}

/** Groq-first streaming voice completion. */
export async function streamVoiceComplete(opts: {
  openRouterKey: string;
  messages: ORMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  hooks?: StreamHooks;
}): Promise<{ content: string; model: string }> {
  let lastErr = 'Assistant request failed.';
  const groqKey = getGroqKey();
  const bodyBase = {
    messages: opts.messages,
    temperature: opts.temperature ?? 0.55,
    max_tokens: opts.maxTokens ?? 160,
    stream: true as const,
  };

  if (groqKey) {
    for (const model of GROQ_VOICE_MODELS) {
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      try {
        const res = await fetch(GROQ_CHAT_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...bodyBase, model }),
          signal: opts.signal,
        });
        if (!res.ok || !res.body) {
          lastErr = `Groq failed (${res.status}).`;
          continue;
        }
        const content = await consumeSseStream(res, opts);
        if (content) return { content, model: `groq/${model}` };
        lastErr = 'Empty Groq stream.';
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        lastErr = err instanceof Error ? err.message : 'Groq error';
      }
    }
  }

  if (opts.openRouterKey) {
    for (const model of VOICE_FAST_MODELS) {
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      try {
        const res = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${opts.openRouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://epicure.app',
            'X-Title': 'epicure assistant',
          },
          body: JSON.stringify({ ...bodyBase, model, reasoning: { exclude: true } }),
          signal: opts.signal,
        });
        if (!res.ok || !res.body) {
          lastErr = `OpenRouter failed (${res.status}).`;
          continue;
        }
        const content = await consumeSseStream(res, opts);
        if (content) return { content, model };
        lastErr = 'Empty stream.';
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        lastErr = err instanceof Error ? err.message : 'OpenRouter error';
      }
    }
  }

  throw new Error(lastErr);
}
