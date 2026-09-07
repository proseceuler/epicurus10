import { createFileRoute } from '@tanstack/react-router';
import { deleteR2, r2Configured } from '@/lib/r2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const Route = createFileRoute('/api/drive/delete')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        if (!r2Configured()) {
          return json({ error: 'R2 is not configured', configured: false }, 503);
        }
        try {
          const body = (await request.json()) as { keys?: string[] };
          const keys = body.keys || [];
          if (!keys.length) return json({ error: 'No keys' }, 400);
          await deleteR2(keys);
          return json({ ok: true, deleted: keys.length });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Delete failed';
          return json({ error: msg }, 500);
        }
      },
    },
  },
});
