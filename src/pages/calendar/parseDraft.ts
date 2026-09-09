import { parseNaturalWhen } from '@/lib/parseWhen';
import { type Draft } from '@/pages/calendar/model';

export function applyTitleParse(current: Draft, raw: string): Draft {
  const parsed = parseNaturalWhen(raw);
  const extracted = parsed.title.trim() !== raw.trim() || !parsed.all_day;
  if (!extracted) return { ...current, title: raw };
  return {
    ...current,
    title: raw,
    start_date: parsed.start_date || current.start_date,
    end_date: parsed.end_date || parsed.start_date || current.end_date,
    all_day: parsed.all_day,
    start_time: parsed.all_day ? current.start_time : (parsed.start_time || current.start_time),
    end_time: parsed.all_day ? current.end_time : (parsed.end_time || current.end_time),
  };
}

export function detectedHint(title: string) {
  const parsed = parseNaturalWhen(title);
  if (parsed.title.trim() === title.trim() && parsed.all_day) return '';
  const time = parsed.all_day ? 'all day' : `${parsed.start_time || ''}${parsed.end_time ? `-${parsed.end_time}` : ''}`;
  return `Detected ${parsed.start_date} - ${time}`;
}
