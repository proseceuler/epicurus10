/** Live model IDs — Groq deprecated llama-3.1-8b-instant for free/dev (Aug 2026). */

export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Try in order until one accepts the key. */
export const GROQ_MODELS = [
  'openai/gpt-oss-20b',
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.1-8b-instant', // legacy if still enabled on the account
] as const;

export const OR_MODELS = [
  'openrouter/free',
  'google/gemma-4-31b-it:free',
  'google/gemma-2-9b-it:free',
  'meta-llama/llama-3.3-70b-instruct:free',
] as const;

export function orHeaders(): Record<string, string> {
  return {
    'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://epicure.app',
    'X-Title': 'epicure',
  };
}
