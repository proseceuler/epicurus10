/** Live model IDs — prefer fast + smart free options (Sep 2026). */

export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Groq free tier (very fast LPU):
 *   qwen3.8-27b — stronger reasoning
 *   gpt-oss-20b — ~1000 tok/s, tool-friendly
 *   gpt-oss-120b — smarter, still free-tier eligible
 */
export const GROQ_MODELS = [
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'qwen/qwen3.6-27b',
] as const;

/**
 * OpenRouter :free — quality then speed fallbacks.
 * Qwen3.8 27B and Gemma 4 lead free quality lists; Ling Flash is low-latency.
 */
export const OR_MODELS = [
  'qwen/qwen3.8-27b:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'inclusionai/ling-3.0-flash-fin:free',
  'openrouter/free',
  'google/gemma-4-26b-a4b-it:free',
] as const;

export function orHeaders(): Record<string, string> {
  return {
    'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://epicure.app',
    'X-Title': 'epicure',
  };
}
