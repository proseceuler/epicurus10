import { createFileRoute } from "@tanstack/react-router";

type DbSnapshot = {
  db: Record<string, unknown>;
  updatedAt: number;
};

type Store = Map<string, DbSnapshot>;

const g = globalThis as typeof globalThis & { __epicureDbSync?: Store };

function store(): Store {
  if (!g.__epicureDbSync) g.__epicureDbSync = new Map();
  return g.__epicureDbSync;
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

export const Route = createFileRoute("/api/public/db-sync")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const room = roomOf(request);
        return json({ ok: true, snapshot: store().get(room) ?? null });
      },
      POST: async ({ request }: { request: Request }) => {
        const room = roomOf(request);
        let body: Partial<DbSnapshot>;
        try {
          body = (await request.json()) as Partial<DbSnapshot>;
        } catch {
          return json({ ok: false, error: "invalid json" }, 400);
        }
        if (typeof body.updatedAt !== "number" || !body.db || typeof body.db !== "object") {
          return json({ ok: false, error: "db + updatedAt required" }, 400);
        }
        const existing = store().get(room);
        if (existing && existing.updatedAt > body.updatedAt) {
          return json({ ok: true, snapshot: existing, ignored: true });
        }
        const snap: DbSnapshot = {
          db: body.db as Record<string, unknown>,
          updatedAt: body.updatedAt,
        };
        store().set(room, snap);
        return json({ ok: true, snapshot: snap });
      },
    },
  },
});
