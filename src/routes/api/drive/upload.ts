import { createFileRoute } from '@tanstack/react-router';
import { joinKey, r2Configured, uploadR2 } from '@/lib/r2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const Route = createFileRoute('/api/drive/upload')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        if (!r2Configured()) {
          return json({ error: 'R2 is not configured', configured: false }, 503);
        }
        try {
          const form = await request.formData();
          const file = form.get('file');
          const prefix = String(form.get('prefix') || '');
          if (!(file instanceof File)) return json({ error: 'Missing file' }, 400);
          const key = joinKey(prefix, file.name);
          const buf = Buffer.from(await file.arrayBuffer());
          await uploadR2(key, buf, file.type || 'application/octet-stream');
          return json({ ok: true, key, name: file.name, size: file.size });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Upload failed';
          return json({ error: msg }, 500);
        }
      },
    },
  },
});
