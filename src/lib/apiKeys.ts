export const OPENROUTER_KEY = 'epicure-openrouter-key';
export const MW_KEY = 'epicure-mw-key';
export const MODEL_KEY = 'epicure-default-model';
export const TAVILY_KEY = 'epicure-tavily-key';
export const SAPLING_KEY = 'epicure-sapling-key';
export const PINECONE_KEY = 'epicure-pinecone-key';
export const PINECONE_HOST = 'epicure-pinecone-host';
export const GROQ_KEY = 'epicure-groq-key';
export const FISH_KEY = 'epicure-fish-key';
export const KOKORO_URL = 'epicure-kokoro-url';
export const KOKORO_KEY = 'epicure-kokoro-key';
export const KOKORO_VOICE = 'epicure-kokoro-voice';
export const TTS_ENGINE = 'epicure-tts-engine';
export const ARRODES_FRAME_PNG = 'epicure-arrodes-frame-png';

export type TtsEngine = 'auto' | 'kokoro' | 'fish' | 'browser';

function env(name: string, ...alts: string[]): string {
  const meta = import.meta.env as Record<string, string | undefined>;
  for (const n of [name, ...alts]) {
    const v = meta[n];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

function readLocal(key: string): string {
  if (typeof window === 'undefined') return '';
  return (localStorage.getItem(key) || '').trim();
}

/** Vercel / Vite env wins when set; Settings localStorage is optional override only if env empty. */
function keyFrom(envName: string, localKey: string, ...envAlts: string[]): string {
  return env(envName, ...envAlts) || readLocal(localKey);
}

export const getOpenRouterKey = () =>
  keyFrom('VITE_OPENROUTER_API_KEY', OPENROUTER_KEY, 'VITE_OPENROUTER_KEY');

export const getMwKey = () =>
  keyFrom(
    'VITE_MW_DICTIONARY_API_KEY',
    MW_KEY,
    'VITE_MW_API_KEY',
    'VITE_MERRIAM_WEBSTER_KEY',
  );

export const getTavilyKey = () =>
  keyFrom('VITE_TAVILY_API_KEY', TAVILY_KEY, 'VITE_TAVILY_KEY');

export const getSaplingKey = () =>
  keyFrom('VITE_SAPLING_API_KEY', SAPLING_KEY);

export const getPineconeKey = () =>
  keyFrom('VITE_PINECONE_API_KEY', PINECONE_KEY);

export const getPineconeHost = () =>
  keyFrom('VITE_PINECONE_HOST', PINECONE_HOST);

export const getGroqKey = () =>
  keyFrom('VITE_GROQ_API_KEY', GROQ_KEY, 'VITE_GROQ_KEY');

export const getFishKey = () =>
  keyFrom('VITE_FISH_API_KEY', FISH_KEY);

export const getKokoroUrl = () =>
  keyFrom('VITE_KOKORO_URL', KOKORO_URL);

export const getKokoroKey = () =>
  keyFrom('VITE_KOKORO_API_KEY', KOKORO_KEY);

export const getKokoroVoice = () =>
  keyFrom('VITE_KOKORO_VOICE', KOKORO_VOICE) || 'af_heart';

export const getTtsEngine = (): TtsEngine => {
  const raw = keyFrom('VITE_TTS_ENGINE', TTS_ENGINE) || 'auto';
  return raw === 'kokoro' || raw === 'fish' || raw === 'browser' || raw === 'auto' ? raw : 'auto';
};

export const getDefaultModel = () => readLocal(MODEL_KEY);

export const getArrodesFramePng = () => readLocal(ARRODES_FRAME_PNG);

export function saveKey(key: string, value: string) {
  if (typeof window === 'undefined') return;
  if (value) localStorage.setItem(key, value);
  else localStorage.removeItem(key);
  window.dispatchEvent(new StorageEvent('storage', { key, newValue: value || null }));
}
