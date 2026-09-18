import { supabase } from '@/lib/supabase';

export async function addHabitFromChat(args: Record<string, unknown>) {
  const name = String(args.name || '').trim();
  if (!name) return { ok: false, error: 'Need a habit name.' };
  const { data: existing } = await supabase.from('habits').select('id,name');
  const hit = (existing ?? []).find((h: { name: string }) => h.name.toLowerCase() === name.toLowerCase());
  if (hit) return { ok: true, habit: hit, already: true };
  const { data, error } = await supabase
    .from('habits')
    .insert({
      name,
      emoji: String(args.emoji || '\u2705'),
      goal_target: Number(args.goal_target) || 30,
      color: 'zinc',
    })
    .select()
    .single();
  if (error) throw error;
  return { ok: true, habit: data };
}

export async function updateFlashcardFromChat(args: Record<string, unknown>) {
  const needle = String(args.front || args.title || '').trim().toLowerCase();
  if (!needle) return { ok: false, error: 'Need the current front text to match a card.' };
  const { data: cards } = await supabase.from('flashcards').select('*');
  const match = (cards ?? []).find((c: { front: string }) => String(c.front).toLowerCase().includes(needle));
  if (!match) return { ok: false, error: `No flashcard matching "${args.front || args.title}".` };
  const patch: Record<string, unknown> = {};
  if (typeof args.new_front === 'string' && args.new_front.trim()) patch.front = args.new_front.trim();
  if (typeof args.new_back === 'string' && args.new_back.trim()) patch.back = args.new_back.trim();
  if (typeof args.back === 'string' && args.back.trim() && !patch.back) patch.back = args.back.trim();
  if (!Object.keys(patch).length) return { ok: false, error: 'Nothing to change. Pass new_front or new_back.' };
  const { data, error } = await supabase.from('flashcards').update(patch).eq('id', match.id).select().single();
  if (error) throw error;
  return { ok: true, card: data, previous: match };
}

export async function deleteFlashcardFromChat(args: Record<string, unknown>) {
  const needle = String(args.front || args.title || '').trim().toLowerCase();
  if (!needle) return { ok: false, error: 'Need the front text to delete a card.' };
  const { data: cards } = await supabase.from('flashcards').select('*');
  const match = (cards ?? []).find((c: { front: string }) => String(c.front).toLowerCase().includes(needle));
  if (!match) return { ok: false, error: `No flashcard matching "${args.front || args.title}".` };
  const { error } = await supabase.from('flashcards').delete().eq('id', match.id);
  if (error) throw error;
  return { ok: true, deleted: match };
}
