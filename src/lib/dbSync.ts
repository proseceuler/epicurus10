/**
 * Cross-device sync for the localStorage DB (todos, habits, notes, …).
 * Pushes on every local mutation; polls the shared server snapshot while visible.
 */
import { DB_CHANGED, applyDbSnapshot, getDbSnapshot } from '@/lib/supabase';

const ROOM = 'default';
const API = `/api/public/db-sync?room=${ROOM}`;
const POLL_MS = 2000;

let lastPushedAt = 0;
let applyingRemote = false;
let started = false;

async function pushLocal() {
  if (applyingRemote) return;
  try {
    const { db, updatedAt } = getDbSnapshot();
    if (updatedAt <= lastPushedAt) return;
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ db, updatedAt }),
    });
    if (res.ok) lastPushedAt = updatedAt;
  } catch {
    /* offline */
  }
}

async function pullRemote() {
  try {
    const res = await fetch(API, { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as {
      snapshot?: { db: Record<string, unknown>; updatedAt: number } | null;
    };
    const snap = data.snapshot;
    if (!snap || typeof snap.updatedAt !== 'number' || !snap.db) return;
    const local = getDbSnapshot();
    if (snap.updatedAt <= local.updatedAt) return;
    if (snap.updatedAt <= lastPushedAt) return;
    applyingRemote = true;
    try {
      applyDbSnapshot(snap.db as Parameters<typeof applyDbSnapshot>[0], snap.updatedAt);
      lastPushedAt = snap.updatedAt;
    } finally {
      applyingRemote = false;
    }
  } catch {
    /* offline */
  }
}

/** Start bidirectional sync. Safe to call once from App. */
export function startDbSync() {
  if (typeof window === 'undefined' || started) return;
  started = true;

  void (async () => {
    await pullRemote();
    await pushLocal();
  })();

  window.addEventListener(DB_CHANGED, ((e: CustomEvent) => {
    if (e.detail?.remote) return;
    void pushLocal();
  }) as EventListener);

  let pollId: ReturnType<typeof setInterval> | null = null;
  const startPoll = () => {
    if (pollId) return;
    pollId = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void pullRemote();
    }, POLL_MS);
  };
  const stopPoll = () => {
    if (pollId) {
      clearInterval(pollId);
      pollId = null;
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void pullRemote();
      startPoll();
    } else stopPoll();
  });
  startPoll();
}
