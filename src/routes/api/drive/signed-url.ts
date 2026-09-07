import { createFileRoute } from '@tanstack/react-router';
import { r2Configured, signedGetUrl } from '@/lib/r2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const Route = createFileRoute('/api/drive/signed-url')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        if (!r2Configured()) {
          return json({ error: 'R2 is not configured', configured: false }, 503);
        }
        try {
          const url = new URL(request.url);
          const key = url.searchParams.get('key') || '';
          if (!key) return json({ error: 'Missing key' }, 400);
          const signed = await signedGetUrl(key, 3600);
          return json({ url: signed, key });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Sign failed';
          return json({ error: msg }, 500);
        }
      },
    },
  },
});
