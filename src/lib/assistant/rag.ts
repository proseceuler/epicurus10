import { supabase } from '@/lib/supabase';
import { SITE_DOCS } from '@/lib/assistant/siteKnowledge';
import { embedTexts, pineconeConfigured, queryVectors, upsertVectors } from '@/lib/assistant/pinecone';

export interface EpicureHit {
  id: string;
  title: string;
  page?: string;
  text: string;
  source: 'site' | 'notes' | 'local';
  score: number;
}

function chunk(text: string, size = 700) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= size) return [clean];
  const parts: string[] = [];
  for (let i = 0; i < clean.length; i += size - 80) {
    parts.push(clean.slice(i, i + size));
  }
  return parts.filter(Boolean);
}

function scoreLocal(query: string, text: string) {
  const q = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  if (!q.length) return 0;
  const hay = text.toLowerCase();
  let hits = 0;
  for (const word of q) if (hay.includes(word)) hits += 1;
  return hits / q.length;
}

async function localSearch(query: string, namespace: 'site' | 'notes' | 'all'): Promise<EpicureHit[]> {
  const hits: EpicureHit[] = [];
  if (namespace !== 'notes') {
    for (const doc of SITE_DOCS) {
      const s = scoreLocal(query, `${doc.title} ${doc.text}`);
      if (s > 0) hits.push({ id: doc.id, title: doc.title, page: doc.page, text: doc.text, source: 'site', score: s });
    }
  }
  if (namespace !== 'site') {
    const { data } = await supabase.from('notes').select('id,title,content,folder').limit(80);
    for (const note of data ?? []) {
      const text = `${note.title || ''} ${note.content || ''}`;
      const s = scoreLocal(query, text);
      if (s > 0) {
        hits.push({
          id: String(note.id),
          title: String(note.title || 'Untitled'),
          page: 'notes',
          text: text.slice(0, 500),
          source: 'notes',
          score: s,
        });
      }
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 8);
}

export async function ingestEpicure(): Promise<{ ok: boolean; upserted: number; error?: string }> {
  if (!pineconeConfigured()) {
    return { ok: false, upserted: 0, error: 'Add a Pinecone key and index host in Settings first.' };
  }
  try {
    const noteRows = (await supabase.from('notes').select('id,title,content,folder,updated_at').limit(120)).data ?? [];
    const siteChunks = SITE_DOCS.flatMap((doc) =>
      chunk(doc.text).map((text, i) => ({
        id: `${doc.id}-${i}`,
        text,
        metadata: { title: doc.title, page: doc.page, source: 'site', body: text.slice(0, 400) },
      })),
    );
    const noteChunks = noteRows.flatMap((note) =>
      chunk(`${note.title || ''}\n${note.content || ''}`).map((text, i) => ({
        id: `note-${note.id}-${i}`,
        text,
        metadata: {
          title: String(note.title || 'Untitled'),
          page: 'notes',
          source: 'notes',
          body: text.slice(0, 400),
        },
      })),
    );

    let upserted = 0;
    const groups = [
      { namespace: 'site', rows: siteChunks },
      { namespace: 'notes', rows: noteChunks },
    ];
    for (const group of groups) {
      if (!group.rows.length) continue;
      for (let i = 0; i < group.rows.length; i += 20) {
        const batch = group.rows.slice(i, i + 20);
        const values = await embedTexts(batch.map((r) => r.text), 'passage');
        const vectors = batch.map((row, idx) => ({
          id: row.id,
          values: values[idx] || [],
          metadata: row.metadata,
        })).filter((v) => v.values.length);
        if (vectors.length) {
          await upsertVectors(group.namespace, vectors);
          upserted += vectors.length;
        }
      }
    }
    return { ok: true, upserted };
  } catch (err) {
    return { ok: false, upserted: 0, error: err instanceof Error ? err.message : 'Ingest failed.' };
  }
}

export async function searchEpicure(query: string, namespace: 'site' | 'notes' | 'all' = 'all'): Promise<{
  query: string;
  hits: EpicureHit[];
  mode: 'pinecone' | 'local';
  error?: string;
}> {
  const q = query.trim();
  if (!q) return { query: q, hits: [], mode: 'local', error: 'Empty query.' };

  if (pineconeConfigured()) {
    try {
      const [values] = await embedTexts([q], 'query');
      const spaces = namespace === 'all' ? ['site', 'notes'] : [namespace];
      const hits: EpicureHit[] = [];
      for (const space of spaces) {
        const matches = await queryVectors({ namespace: space, values, topK: 6 });
        for (const match of matches) {
          hits.push({
            id: match.id,
            title: match.metadata?.title || match.id,
            page: match.metadata?.page,
            text: match.metadata?.body || '',
            source: (match.metadata?.source as 'site' | 'notes') || (space as 'site' | 'notes'),
            score: match.score ?? 0,
          });
        }
      }
      hits.sort((a, b) => b.score - a.score);
      return { query: q, hits: hits.slice(0, 8), mode: 'pinecone' };
    } catch (err) {
      const fallback = await localSearch(q, namespace);
      return {
        query: q,
        hits: fallback,
        mode: 'local',
        error: err instanceof Error ? err.message : 'Pinecone failed; used local search.',
      };
    }
  }

  return { query: q, hits: await localSearch(q, namespace), mode: 'local' };
}
