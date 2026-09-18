import { createFileRoute } from '@tanstack/react-router';
import { listR2, r2Configured } from '@/lib/r2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const Route = createFileRoute('/api/drive/list')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        if (!r2Configured()) {
          return json(
            {
              error: 'Backblaze B2 is not configured',
              hint: 'Set B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET, and B2_REGION. See docs/backblaze-b2.md.',
              configured: false,
            },
            503,
          );
        }
        try {
          const url = new URL(request.url);
          const prefix = url.searchParams.get('prefix') || '';
          const data = await listR2(prefix);
          return json({ ...data, configured: true });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'List failed';
          return json({ error: msg, configured: true }, 500);
        }
      },
    },
  },
});
