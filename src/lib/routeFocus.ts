import { SUBJECTS, type SubjectKey } from '@/lib/types';

export function pageFromHash(hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : '') {
  return (hash.split(/[/?]/)[0] || '').toLowerCase();
}

export function subjectFromHash(hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : ''): SubjectKey | null {
  const part = (hash.split(/[/?]/)[1] || '').toLowerCase();
  return SUBJECTS.some((s) => s.key === part) ? (part as SubjectKey) : null;
}

export function hashFor(page: string, subject?: string | null) {
  return subject ? `${page}/${subject}` : page;
}
