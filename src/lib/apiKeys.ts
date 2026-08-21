export const OPENROUTER_KEY = 'epicure-openrouter-key';
export const MW_KEY = 'epicure-mw-key';
export const MODEL_KEY = 'epicure-default-model';
export const TAVILY_KEY = 'epicure-tavily-key';
export const LANGUAGETOOL_KEY = 'epicure-languagetool-key';
export const SAPLING_KEY = 'epicure-sapling-key';
export const CORE_KEY = 'epicure-core-key';
export const SCOPUS_KEY = 'epicure-scopus-key';
export const WOS_KEY = 'epicure-wos-key';

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

export const getDefaultModel = () => read(MODEL_KEY);

export const getLanguageToolKey = () =>
  read(LANGUAGETOOL_KEY, import.meta.env.VITE_LANGUAGETOOL_API_KEY || '');

export const getSaplingKey = () =>
  read(SAPLING_KEY, import.meta.env.VITE_SAPLING_API_KEY || '');

export const getCoreKey = () =>
  read(CORE_KEY, import.meta.env.VITE_CORE_API_KEY || '');

export const getScopusKey = () =>
  read(SCOPUS_KEY, import.meta.env.VITE_SCOPUS_API_KEY || '');

export const getWosKey = () =>
  read(WOS_KEY, import.meta.env.VITE_WOS_API_KEY || '');

export function saveKey(key: string, value: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, value);
  window.dispatchEvent(new StorageEvent('storage', { key, newValue: value }));
}
