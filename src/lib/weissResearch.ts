import { getCoreKey, getScopusKey, getWosKey } from './apiKeys';

export type ResearchSourceId =
  | 'semanticscholar'
  | 'pubmed'
  | 'crossref'
  | 'arxiv'
  | 'core'
  | 'scopus'
  | 'wos';

export interface ResearchResult {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  source: ResearchSourceId;
  url: string;
  venue?: string;
}

export interface SourceStatus {
  id: ResearchSourceId;
  label: string;
  needsKey: boolean;
  hasKey: boolean;
}

export const RESEARCH_SOURCES: { id: ResearchSourceId; label: string; needsKey: boolean }[] = [
  { id: 'semanticscholar', label: 'Semantic Scholar', needsKey: false },
  { id: 'pubmed', label: 'PubMed / NCBI', needsKey: false },
  { id: 'crossref', label: 'CrossRef', needsKey: false },
  { id: 'arxiv', label: 'arXiv', needsKey: false },
  { id: 'core', label: 'CORE', needsKey: true },
  { id: 'scopus', label: 'Scopus', needsKey: true },
  { id: 'wos', label: 'Web of Science', needsKey: true },
];

export function getSourceStatuses(): SourceStatus[] {
  return RESEARCH_SOURCES.map((s) => ({
    ...s,
    hasKey:
      s.id === 'core' ? !!getCoreKey() : s.id === 'scopus' ? !!getScopusKey() : s.id === 'wos' ? !!getWosKey() : true,
  }));
}

async function safeJson(res: Response) {
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

async function searchSemanticScholar(query: string): Promise<ResearchResult[]> {
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(
    query
  )}&fields=title,authors,year,url,venue&limit=8`;
  const data = await safeJson(await fetch(url));
  return (data.data || []).map((p: any) => ({
    id: `s2-${p.paperId}`,
    title: p.title,
    authors: (p.authors || []).map((a: any) => a.name),
    year: p.year,
    source: 'semanticscholar' as const,
    url: p.url,
    venue: p.venue,
  }));
}

async function searchCrossref(query: string): Promise<ResearchResult[]> {
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=8`;
  const data = await safeJson(await fetch(url));
  return (data.message?.items || []).map((it: any) => ({
    id: `crossref-${it.DOI}`,
    title: Array.isArray(it.title) ? it.title[0] : it.title || 'Untitled',
    authors: (it.author || []).map((a: any) => [a.given, a.family].filter(Boolean).join(' ')),
    year: it['published-print']?.['date-parts']?.[0]?.[0] || it['published-online']?.['date-parts']?.[0]?.[0] || null,
    source: 'crossref' as const,
    url: it.URL,
    venue: it['container-title']?.[0],
  }));
}

async function searchArxiv(query: string): Promise<ResearchResult[]> {
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(
    query
  )}&start=0&max_results=8`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`arXiv request failed: ${res.status}`);
  const xml = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const entries = Array.from(doc.getElementsByTagName('entry'));
  return entries.map((entry, i) => {
    const title = entry.getElementsByTagName('title')[0]?.textContent?.trim() || 'Untitled';
    const id = entry.getElementsByTagName('id')[0]?.textContent?.trim() || `arxiv-${i}`;
    const published = entry.getElementsByTagName('published')[0]?.textContent;
    const authors = Array.from(entry.getElementsByTagName('author')).map(
      (a) => a.getElementsByTagName('name')[0]?.textContent || ''
    );
    return {
      id: `arxiv-${id}`,
      title,
      authors,
      year: published ? new Date(published).getFullYear() : null,
      source: 'arxiv' as const,
      url: id,
    };
  });
}

async function searchPubmed(query: string): Promise<ResearchResult[]> {
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(
    query
  )}&retmode=json&retmax=8`;
  const searchData = await safeJson(await fetch(searchUrl));
  const ids: string[] = searchData.esearchresult?.idlist || [];
  if (!ids.length) return [];

  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(
    ','
  )}&retmode=json`;
  const summaryData = await safeJson(await fetch(summaryUrl));
  return ids.map((id) => {
    const it = summaryData.result?.[id];
    if (!it) return null;
    return {
      id: `pubmed-${id}`,
      title: it.title || 'Untitled',
      authors: (it.authors || []).map((a: any) => a.name),
      year: it.pubdate ? parseInt(it.pubdate.slice(0, 4), 10) : null,
      source: 'pubmed' as const,
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      venue: it.fulljournalname,
    };
  }).filter(Boolean) as ResearchResult[];
}

async function searchCore(query: string): Promise<ResearchResult[]> {
  const key = getCoreKey();
  if (!key) throw new Error('CORE requires an API key — add it in Settings.');
  const url = `https://api.core.ac.uk/v3/search/works?q=${encodeURIComponent(query)}&limit=8`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  const data = await safeJson(res);
  return (data.results || []).map((it: any) => ({
    id: `core-${it.id}`,
    title: it.title || 'Untitled',
    authors: (it.authors || []).map((a: any) => a.name),
    year: it.yearPublished || null,
    source: 'core' as const,
    url: it.downloadUrl || it.sourceFulltextUrls?.[0] || '',
    venue: it.publisher,
  }));
}

async function searchScopus(query: string): Promise<ResearchResult[]> {
  const key = getScopusKey();
  if (!key) throw new Error('Scopus requires an API key — add it in Settings.');
  const url = `https://api.elsevier.com/content/search/scopus?query=${encodeURIComponent(query)}&count=8`;
  const res = await fetch(url, { headers: { 'X-ELS-APIKey': key, Accept: 'application/json' } });
  const data = await safeJson(res);
  const entries = data['search-results']?.entry || [];
  return entries.map((it: any) => ({
    id: `scopus-${it['dc:identifier']}`,
    title: it['dc:title'] || 'Untitled',
    authors: it['dc:creator'] ? [it['dc:creator']] : [],
    year: it['prism:coverDate'] ? new Date(it['prism:coverDate']).getFullYear() : null,
    source: 'scopus' as const,
    url: it.link?.find((l: any) => l['@ref'] === 'scopus')?.['@href'] || '',
    venue: it['prism:publicationName'],
  }));
}

async function searchWos(query: string): Promise<ResearchResult[]> {
  const key = getWosKey();
  if (!key) throw new Error('Web of Science requires an API key — add it in Settings.');
  const url = `https://api.clarivate.com/apis/wos-starter/v1/documents?q=${encodeURIComponent(query)}&limit=8`;
  const res = await fetch(url, { headers: { 'X-ApiKey': key } });
  const data = await safeJson(res);
  return (data.hits || []).map((it: any) => ({
    id: `wos-${it.uid}`,
    title: it.title || 'Untitled',
    authors: (it.names?.authors || []).map((a: any) => a.displayName),
    year: it.source?.publishYear || null,
    source: 'wos' as const,
    url: it.links?.record || '',
    venue: it.source?.sourceTitle,
  }));
}

const SEARCHERS: Record<ResearchSourceId, (q: string) => Promise<ResearchResult[]>> = {
  semanticscholar: searchSemanticScholar,
  pubmed: searchPubmed,
  crossref: searchCrossref,
  arxiv: searchArxiv,
  core: searchCore,
  scopus: searchScopus,
  wos: searchWos,
};

export interface WeissSearchOutcome {
  results: ResearchResult[];
  errors: { source: ResearchSourceId; message: string }[];
}

/**
 * Queries all enabled sources in parallel and merges + dedupes by
 * normalized title. Sources that error (missing key, network, etc.)
 * are reported separately rather than failing the whole search.
 */
export async function searchAcrossSources(
  query: string,
  enabled: ResearchSourceId[]
): Promise<WeissSearchOutcome> {
  const settled = await Promise.allSettled(
    enabled.map(async (id) => ({ id, results: await SEARCHERS[id](query) }))
  );

  const results: ResearchResult[] = [];
  const errors: { source: ResearchSourceId; message: string }[] = [];
  const seen = new Set<string>();

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      for (const r of outcome.value.results) {
        const key = r.title.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(r);
      }
    } else {
      const msg = outcome.reason instanceof Error ? outcome.reason.message : 'Unknown error';
      // outcome.reason doesn't carry the source id directly, so we
      // recover it from the settled index instead.
      errors.push({ source: enabled[settled.indexOf(outcome)], message: msg });
    }
  }

  return { results, errors };
}
