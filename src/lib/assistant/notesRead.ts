import { supabase } from '@/lib/supabase';

export async function listNotesFromChat(args: Record<string, unknown>) {
  const { data } = await supabase
    .from('notes')
    .select('id,title,folder,content,updated_at')
    .order('updated_at', { ascending: false })
    .limit(80);
  const rows = (data ?? []) as Array<{ id: string; title?: string; folder?: string; content?: string; updated_at?: string }>;
  const rawQ = String(args.query || '').trim();
  const meta = !rawQ || /\b(how many|count|list|notes and boards?|vault)\b/i.test(rawQ);
  const needle = rawQ.toLowerCase();
  const matched = meta
    ? rows
    : rows.filter((n) => `${n.title || ''} ${n.folder || ''} ${n.content || ''}`.toLowerCase().includes(needle));
  return {
    count: matched.length,
    total: rows.length,
    notes: matched.map((n) => ({
      id: n.id,
      title: n.title || 'Untitled',
      folder: n.folder || '',
      updated_at: n.updated_at,
      preview: String(n.content || '').replace(/\s+/g, ' ').slice(0, 160),
    })),
  };
}
