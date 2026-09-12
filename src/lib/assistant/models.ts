/** OpenRouter slugs for the three assistant layers. Voice chat prefers the fastest free model. */
export const LAYER_MODELS = {
  chat: 'nvidia/nemotron-3.5-lightning:free',
  execute: 'z-ai/glm-5.2',
  data: 'nvidia/nemotron-3.5-lightning:free',
} as const;

export const LAYER_FALLBACKS: Record<keyof typeof LAYER_MODELS, string[]> = {
  chat: [
    'google/gemma-4-31b-it:free',
    'minimax/minimax-m3',
    'meta-llama/llama-3.3-70b-instruct:free',
    'qwen/qwen3-4b:free',
  ],
  execute: ['nvidia/nemotron-3.5-lightning:free', 'google/gemma-4-31b-it:free'],
  data: ['google/gemma-4-31b-it:free', 'nvidia/nemotron-3-ultra-550b-a55b:free'],
};

export const VISION_MODELS = [
  'google/gemma-4-31b-it:free',
  LAYER_MODELS.chat,
];

export type AssistantLayer = keyof typeof LAYER_MODELS;

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
