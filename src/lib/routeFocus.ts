import { useEffect, useState } from 'react';
import { SUBJECTS, type SubjectKey } from '@/lib/types';

export function rawHash(hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : '') {
  return hash.replace(/^#/, '');
}

export function pageFromHash(hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : '') {
  return (rawHash(hash).split(/[/?]/)[0] || '').toLowerCase();
}

export function focusFromHash(hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : ''): string | null {
  const part = (rawHash(hash).split(/[/?]/)[1] || '').trim();
  return part || null;
}

export function subjectFromHash(hash = typeof window !== 'undefined' ? window.location.hash.slice(1) : ''): SubjectKey | null {
  const part = (focusFromHash(hash) || '').toLowerCase();
  return SUBJECTS.some((s) => s.key === part) ? (part as SubjectKey) : null;
}

export function hashFor(page: string, focus?: string | null) {
  return focus ? `${page}/${focus}` : page;
}

export function useHashFocus() {
  const [focus, setFocus] = useState<string | null>(() => (typeof window === 'undefined' ? null : focusFromHash()));
  useEffect(() => {
    const sync = () => setFocus(focusFromHash());
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  return focus;
}
