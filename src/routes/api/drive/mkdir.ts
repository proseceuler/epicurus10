import { createFileRoute } from '@tanstack/react-router';
import { joinKey, r2Configured, uploadR2 } from '@/lib/r2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const Route = createFileRoute('/api/drive/mkdir')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        if (!r2Configured()) {
          return json({ error: 'R2 is not configured', configured: false }, 503);
        }
        try {
          const body = (await request.json()) as { prefix?: string; name?: string };
          const name = (body.name || '').trim().replace(/\/+/g, '');
          if (!name) return json({ error: 'Missing folder name' }, 400);
          // R2/S3 folders are zero-byte objects ending with /
          const key = joinKey(body.prefix || '', name) + '/';
          await uploadR2(key, Buffer.alloc(0), 'application/x-directory');
          return json({ ok: true, key });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'mkdir failed';
          return json({ error: msg }, 500);
        }
      },
    },
  },
});
