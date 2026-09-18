import { createFileRoute } from "@tanstack/react-router";

/**
 * Shared live Pomodoro state for cross-device sync.
 * All browsers hitting the same origin share one snapshot (room=default).
 * In-memory on the server process — works for single-node / sticky deploys.
 */

export type PomodoroLiveSnapshot = {
  endsAt: number | null;
  timeLeft: number;
  isRunning: boolean;
  sessionType: "focus" | "short_break" | "long_break";
  completedFocus: number;
  updatedAt: number;
};

type Store = Map<string, PomodoroLiveSnapshot>;

const g = globalThis as typeof globalThis & { __epicurePomodoroLive?: Store };

function store(): Store {
  if (!g.__epicurePomodoroLive) g.__epicurePomodoroLive = new Map();
  return g.__epicurePomodoroLive;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

function roomOf(request: Request) {
  const url = new URL(request.url);
  return (url.searchParams.get("room") || "default").slice(0, 64);
}

export const Route = createFileRoute("/api/public/pomodoro-live")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const room = roomOf(request);
        const snap = store().get(room) ?? null;
        return json({ ok: true, snapshot: snap });
      },
      POST: async ({ request }: { request: Request }) => {
        const room = roomOf(request);
        let body: Partial<PomodoroLiveSnapshot>;
        try {
          body = (await request.json()) as Partial<PomodoroLiveSnapshot>;
        } catch {
          return json({ ok: false, error: "invalid json" }, 400);
        }
        if (typeof body.updatedAt !== "number") {
          return json({ ok: false, error: "updatedAt required" }, 400);
        }
        const existing = store().get(room);
        // Last-write-wins by updatedAt
        if (existing && existing.updatedAt > body.updatedAt) {
          return json({ ok: true, snapshot: existing, ignored: true });
        }
        const snap: PomodoroLiveSnapshot = {
          endsAt: body.endsAt ?? null,
          timeLeft: typeof body.timeLeft === "number" ? body.timeLeft : 0,
          isRunning: !!body.isRunning,
          sessionType:
            body.sessionType === "short_break" || body.sessionType === "long_break"
              ? body.sessionType
              : "focus",
          completedFocus:
            typeof body.completedFocus === "number" ? body.completedFocus : 0,
          updatedAt: body.updatedAt,
        };
        store().set(room, snap);
        return json({ ok: true, snapshot: snap });
      },
    },
  },
});
