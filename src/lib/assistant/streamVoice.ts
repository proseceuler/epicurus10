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

const LEAK_LINE =
  /analyze user input|identify role|identify core intent|determine tool|system prompt|constraints?:|thinking process|chain of thought|internal monologue|persona of|as an ai|here'?s a thinking|step\s*\d+\s*:|additional instructions/i;

/**
 * Strip chain-of-thought / system leaks so the student never sees them.
 * Matches the "1. Analyze User Input / 2. Identify Role / 3. Constraints" pattern.
 */
export function stripReasoning(raw: string, fallback = 'Hey — what do you need?') {
  let text = String(raw || '');
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  text = text.replace(/<\/?think>/gi, '');
  text = text.replace(/```(?:thinking|reasoning|analysis)[\s\S]*?```/gi, '');
  text = text.replace(/^\s*(?:here'?s a thinking process|thinking process|internal monologue)\s*:?\s*/i, '');

  // Drop numbered analysis blocks (1. Analyze... 2. Identify Role... 3. Constraints...)
  text = text.replace(
    /(?:^|\n)\s*(?:\d+\.?\s*)?\*{0,2}(?:Analyze User Input|Identify Role|Identify Core Intent|Determine Tool Sequence|Constraints|System prompt rule|Thinking|Reasoning)[^\n]*[\s\S]*?(?=(?:\n\s*(?:\d+\.?\s*)?[A-Z][^\n]{0,40}:)|$)/gi,
    '\n',
  );

  // Line filter
  const kept = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l && !LEAK_LINE.test(l) && !/^\d+\.\s*(Analyze|Identify|Constraints)/i.test(l));

  text = kept.join(' ').replace(/\s{2,}/g, ' ').trim();

  // If still mostly leak labels, fall back
  if (!text || LEAK_LINE.test(text) || /analyze user input|identify role|constraints?:/i.test(text)) {
    return fallback;
  }
  // Strip leading list markers left over
  text = text.replace(/^(?:[-*]\s+|\d+\.\s+)/, '').trim();
  return text || fallback;
}

function popSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let lastIndex = 0;
  const re = /([^.!?\n]+[.!?]+)(?:\s+|\n+|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(buffer)) !== null) {
    const s = m[1].trim();
    if (s.length >= 6 && !LEAK_LINE.test(s)) {
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
          const cleaned = stripReasoning(raw, '');
          // Only push tokens to UI if strip left real content (avoids flashing CoT)
          if (cleaned) opts.hooks?.onToken?.(cleaned);
          const { sentences, rest } = popSentences(spokenRest + delta);
          spokenRest = rest;
          for (const s of sentences) {
            const cs = stripReasoning(s, '').trim();
            if (cs && !LEAK_LINE.test(cs)) opts.hooks?.onSentence?.(cs);
          }
        }
      } catch { /* */ }
    }
  }
  const tail = stripReasoning(spokenRest, '').trim();
  if (tail.length >= 6 && !LEAK_LINE.test(tail)) opts.hooks?.onSentence?.(tail);
  return stripReasoning(raw, 'Hey — what do you need?');
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
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 120,
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
