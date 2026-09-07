import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl?: string;
};

export function getR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || '';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
  const bucket = process.env.R2_BUCKET || process.env.R2_BUCKET_NAME || '';
  const publicUrl = process.env.R2_PUBLIC_URL || process.env.R2_PUBLIC_BASE_URL || '';
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl: publicUrl || undefined };
}

export function createR2Client(cfg: R2Config) {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

export function normalizePrefix(prefix: string) {
  return String(prefix || '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

export function joinKey(...parts: string[]) {
  return parts
    .map((p) => String(p).replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}

export async function listR2(prefix = '', delimiter = '/') {
  const cfg = getR2Config();
  if (!cfg) throw new Error('R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.');
  const client = createR2Client(cfg);
  const pfx = normalizePrefix(prefix);
  const res = await client.send(
    new ListObjectsV2Command({
      Bucket: cfg.bucket,
      Prefix: pfx ? `${pfx}/` : '',
      Delimiter: delimiter,
    }),
  );
  const folders = (res.CommonPrefixes || [])
    .map((c) => {
      const key = (c.Prefix || '').replace(/\/+$/, '');
      const name = key.split('/').filter(Boolean).pop() || key;
      return { type: 'folder' as const, key, name };
    })
    .filter((f) => f.name && f.name !== '.trash');
  const files = (res.Contents || [])
    .filter((o) => o.Key && o.Key !== (pfx ? `${pfx}/` : '') && !o.Key.endsWith('/'))
    .map((o) => {
      const key = o.Key!;
      const name = key.split('/').filter(Boolean).pop() || key;
      return {
        type: 'file' as const,
        key,
        name,
        size: o.Size || 0,
        modified: o.LastModified?.toISOString() || null,
      };
    });
  return { folders, files, prefix: pfx };
}

export async function uploadR2(key: string, body: Buffer | Uint8Array, contentType?: string) {
  const cfg = getR2Config();
  if (!cfg) throw new Error('R2 is not configured');
  const client = createR2Client(cfg);
  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
    }),
  );
  return { key };
}

export async function deleteR2(keys: string[]) {
  const cfg = getR2Config();
  if (!cfg) throw new Error('R2 is not configured');
  const client = createR2Client(cfg);
  const clean = keys.map((k) => k.replace(/^\/+/, '')).filter(Boolean);
  if (!clean.length) return;
  if (clean.length === 1) {
    await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: clean[0] }));
    return;
  }
  await client.send(
    new DeleteObjectsCommand({
      Bucket: cfg.bucket,
      Delete: { Objects: clean.map((Key) => ({ Key })), Quiet: true },
    }),
  );
}

export async function signedGetUrl(key: string, expiresIn = 3600) {
  const cfg = getR2Config();
  if (!cfg) throw new Error('R2 is not configured');
  const client = createR2Client(cfg);
  const cmd = new GetObjectCommand({ Bucket: cfg.bucket, Key: key.replace(/^\/+/, '') });
  return getSignedUrl(client, cmd, { expiresIn });
}

export async function headR2(key: string) {
  const cfg = getR2Config();
  if (!cfg) throw new Error('R2 is not configured');
  const client = createR2Client(cfg);
  return client.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key.replace(/^\/+/, '') }));
}

export function r2Configured() {
  return Boolean(getR2Config());
}
