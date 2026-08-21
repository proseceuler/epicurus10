import { getLanguageToolKey } from './apiKeys';

export interface OrpheusMatch {
  id: string;
  offset: number;
  length: number;
  message: string;
  shortMessage: string;
  replacements: string[];
  category: 'grammar' | 'style' | 'spelling';
}

const LT_ENDPOINT = 'https://api.languagetool.org/v2/check';

function categorize(issueType: string, ruleCategoryId: string): OrpheusMatch['category'] {
  if (issueType === 'misspelling' || ruleCategoryId === 'TYPOS') return 'spelling';
  if (ruleCategoryId === 'STYLE' || issueType === 'style') return 'style';
  return 'grammar';
}

/**
 * Sends text to LanguageTool and returns normalized matches.
 * Uses the public LanguageTool API by default; if a self-hosted or
 * premium key is configured via Settings, it's sent as an api key param.
 */
export async function checkGrammar(text: string, lang = 'en-US'): Promise<OrpheusMatch[]> {
  if (!text || !text.trim()) return [];

  const key = getLanguageToolKey();
  const body = new URLSearchParams({
    text,
    language: lang,
  });
  if (key) {
    // LanguageTool premium accounts authenticate via username+apiKey;
    // when a key is present we assume it encodes "username:apiKey".
    const [username, apiKey] = key.includes(':') ? key.split(':') : ['', key];
    if (username) body.set('username', username);
    if (apiKey) body.set('apiKey', apiKey);
  }

  const res = await fetch(LT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    throw new Error(`LanguageTool request failed (${res.status})`);
  }

  const data = await res.json();
  const matches = Array.isArray(data.matches) ? data.matches : [];

  return matches.map((m: any, i: number) => ({
    id: `${m.offset}-${m.length}-${i}`,
    offset: m.offset,
    length: m.length,
    message: m.message,
    shortMessage: m.shortMessage || m.message.split('.')[0],
    replacements: (m.replacements || []).slice(0, 3).map((r: any) => r.value),
    category: categorize(m.rule?.issueType, m.rule?.category?.id),
  }));
}
