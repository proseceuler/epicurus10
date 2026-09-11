export const OPENROUTER_KEY = 'epicure-openrouter-key';
export const MW_KEY = 'epicure-mw-key';
export const MODEL_KEY = 'epicure-default-model';
export const TAVILY_KEY = 'epicure-tavily-key';
export const SAPLING_KEY = 'epicure-sapling-key';
export const PINECONE_KEY = 'epicure-pinecone-key';
export const PINECONE_HOST = 'epicure-pinecone-host';
export const GROQ_KEY = 'epicure-groq-key';
export const FISH_KEY = 'epicure-fish-key';

function read(key: string, fallback = '') {
  if (typeof window === 'undefined') return fallback;
  return localStorage.getItem(key) || fallback;
}

export const getOpenRouterKey = () =>
  read(OPENROUTER_KEY, import.meta.env.VITE_OPENROUTER_API_KEY || '');

export const getMwKey = () =>
  read(MW_KEY, import.meta.env.VITE_MW_DICTIONARY_API_KEY || '');

export const getTavilyKey = () =>
  read(TAVILY_KEY, import.meta.env.VITE_TAVILY_API_KEY || '');

export const getSaplingKey = () =>
  (typeof window !== 'undefined' ? localStorage.getItem(SAPLING_KEY) : null) ||
  import.meta.env.VITE_SAPLING_API_KEY ||
  '';

export const getPineconeKey = () =>
  read(PINECONE_KEY, import.meta.env.VITE_PINECONE_API_KEY || '');

export const getPineconeHost = () =>
  read(PINECONE_HOST, import.meta.env.VITE_PINECONE_HOST || '');

export const getGroqKey = () =>
  read(GROQ_KEY, import.meta.env.VITE_GROQ_API_KEY || '');

export const getFishKey = () =>
  read(FISH_KEY, import.meta.env.VITE_FISH_API_KEY || '');

export const getDefaultModel = () => read(MODEL_KEY);

export function saveKey(key: string, value: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, value);
  window.dispatchEvent(new StorageEvent('storage', { key, newValue: value }));
}
