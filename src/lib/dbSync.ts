/**
 * Cross-device sync for the localStorage DB (todos, habits, notes, …).
 * Self-contained so it does not require supabase helper exports.
 */
const STORAGE_KEY = "epicure:db";
const META_KEY = "epicure:db:meta";
const DB_CHANGED = "epicure-db-changed";
const DATA_CHANGED = "epicure-data-changed";
const ROOM = "default";
const API = `/api/public/db-sync?room=${ROOM}`;
const POLL_MS = 2000;

let lastPushedAt = 0;
let applyingRemote = false;
let started = false;

function readMeta(): number {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) return JSON.parse(raw).updatedAt || 0;
  } catch { /* ignore */ }
  return 0;
}

function writeMeta(updatedAt: number) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify({ updatedAt }));
  } catch { /* ignore */ }
}

function readDbRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getSnapshot(): { db: unknown; updatedAt: number } | null {
  const raw = readDbRaw();
  if (!raw) return null;
  try {
    const db = JSON.parse(raw);
    let updatedAt = readMeta();
    if (!updatedAt) updatedAt = Date.now();
    return { db, updatedAt };
  } catch {
    return null;
  }
}

function applyRemote(db: unknown, updatedAt: number) {
  applyingRemote = true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    writeMeta(updatedAt);
    (window as unknown as { __epicureDbBust?: boolean }).__epicureDbBust = true;
    window.dispatchEvent(new CustomEvent(DB_CHANGED, { detail: { at: updatedAt, remote: true } }));
    window.dispatchEvent(new CustomEvent(DATA_CHANGED, { detail: { remote: true } }));
  } finally {
    applyingRemote = false;
  }
}

async function pushLocal() {
  if (applyingRemote) return;
  const snap = getSnapshot();
  if (!snap) return;
  if (snap.updatedAt <= lastPushedAt) return;
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snap),
    });
    if (res.ok) lastPushedAt = snap.updatedAt;
  } catch { /* offline */ }
}

async function pullRemote() {
  try {
    const res = await fetch(API, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as {
      snapshot?: { db: unknown; updatedAt: number } | null;
    };
    const remote = data.snapshot;
    if (!remote || typeof remote.updatedAt !== "number" || !remote.db) return;
    const local = getSnapshot();
    const localAt = local?.updatedAt ?? 0;
    if (remote.updatedAt <= localAt || remote.updatedAt <= lastPushedAt) return;
    applyRemote(remote.db, remote.updatedAt);
    lastPushedAt = remote.updatedAt;
  } catch { /* offline */ }
}

export function startDbSync() {
  if (typeof window === "undefined" || started) return;
  started = true;

  if (!readMeta() && readDbRaw()) writeMeta(Date.now());

  void (async () => {
    await pullRemote();
    await pushLocal();
  })();

  window.addEventListener(DB_CHANGED, ((e: CustomEvent) => {
    if (e.detail?.remote) return;
    writeMeta(Date.now());
    void pushLocal();
  }) as EventListener);

  let pollId: ReturnType<typeof setInterval> | null = null;
  const startPoll = () => {
    if (pollId) return;
    pollId = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void pullRemote();
    }, POLL_MS);
  };
  const stopPoll = () => {
    if (pollId) {
      clearInterval(pollId);
      pollId = null;
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void pullRemote();
      startPoll();
    } else stopPoll();
  });
  startPoll();
}
