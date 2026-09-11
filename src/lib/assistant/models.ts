/** OpenRouter free-tier slugs for the three assistant layers. */
export const LAYER_MODELS = {
  chat: 'minimax/minimax-m3',
  execute: 'z-ai/glm-5.2',
  data: 'nvidia/nemotron-3-ultra-550b-a55b:free',
} as const;

export const LAYER_FALLBACKS: Record<keyof typeof LAYER_MODELS, string[]> = {
  chat: [
    'google/gemma-4-31b-it:free',
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    'nvidia/nemotron-3.5-lightning:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'qwen/qwen3-4b:free',
  ],
  execute: ['nvidia/nemotron-3.5-lightning:free', 'nvidia/nemotron-3-ultra-550b-a55b:free', 'google/gemma-4-31b-it:free'],
  data: ['nvidia/nemotron-3.5-lightning:free', 'google/gemma-4-31b-it:free'],
};

export const VISION_MODELS = [
  LAYER_MODELS.chat,
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
];

export type AssistantLayer = keyof typeof LAYER_MODELS;

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
