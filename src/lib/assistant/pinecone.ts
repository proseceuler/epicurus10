import { getPineconeHost, getPineconeKey } from '@/lib/apiKeys';

const API_VERSION = '2025-04';
const EMBED_MODEL = 'llama-text-embed-v2';

export function pineconeConfigured() {
  return Boolean(getPineconeKey() && getPineconeHost());
}

async function pineconeFetch(url: string, init: RequestInit) {
  const key = getPineconeKey();
  if (!key) throw new Error('No Pinecone API key. Add one in Settings.');
  const res = await fetch(url, {
    ...init,
    headers: {
      'Api-Key': key,
      'Content-Type': 'application/json',
      'X-Pinecone-API-Version': API_VERSION,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Pinecone ${res.status}: ${detail.slice(0, 240)}`);
  }
  if (res.status === 204) return {};
  return res.json();
}

export async function embedTexts(texts: string[], inputType: 'passage' | 'query') {
  const data = await pineconeFetch('https://api.pinecone.io/embed', {
    method: 'POST',
    body: JSON.stringify({
      model: EMBED_MODEL,
      parameters: { input_type: inputType },
      inputs: texts.map((text) => ({ text })),
    }),
  });
  const rows = (data.data || data.embeddings || []) as Array<{ values?: number[]; embedding?: { values: number[] } }>;
  return rows.map((row) => row.values || row.embedding?.values || []);
}

export async function upsertVectors(
  namespace: string,
  records: Array<{ id: string; values: number[]; metadata: Record<string, string | number> }>,
) {
  const host = getPineconeHost().replace(/^https?:\/\//, '').replace(/\/$/, '');
  return pineconeFetch(`https://${host}/vectors/upsert`, {
    method: 'POST',
    body: JSON.stringify({ namespace, vectors: records }),
  });
}

export async function queryVectors(opts: {
  namespace: string;
  values: number[];
  topK?: number;
}) {
  const host = getPineconeHost().replace(/^https?:\/\//, '').replace(/\/$/, '');
  const data = await pineconeFetch(`https://${host}/query`, {
    method: 'POST',
    body: JSON.stringify({
      namespace: opts.namespace,
      vector: opts.values,
      topK: opts.topK ?? 8,
      includeMetadata: true,
    }),
  });
  return (data.matches || []) as Array<{
    id: string;
    score?: number;
    metadata?: Record<string, string>;
  }>;
}
