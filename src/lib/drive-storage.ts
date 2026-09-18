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

export type DriveStorageConfig = {
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export function getDriveStorageConfig(): DriveStorageConfig | null {
  const accessKeyId =
    process.env.B2_KEY_ID ||
    process.env.B2_APPLICATION_KEY_ID ||
    process.env.BACKBLAZE_KEY_ID ||
    '';
  const secretAccessKey =
    process.env.B2_APPLICATION_KEY ||
    process.env.B2_KEY ||
    process.env.BACKBLAZE_APPLICATION_KEY ||
    '';
  const bucket = process.env.B2_BUCKET || process.env.B2_BUCKET_NAME || process.env.BACKBLAZE_BUCKET || '';
  const region = process.env.B2_REGION || process.env.B2_S3_REGION || 'us-west-004';
  const endpoint =
    process.env.B2_ENDPOINT ||
    process.env.B2_S3_ENDPOINT ||
    `https://s3.${region}.backblazeb2.com`;
  if (!accessKeyId || !secretAccessKey || !bucket) return null;
  return { region, endpoint, accessKeyId, secretAccessKey, bucket };
}

export function storageConfigured() {
  return Boolean(getDriveStorageConfig());
}

function createClient(cfg: DriveStorageConfig) {
  return new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

function requireCfg() {
  const cfg = getDriveStorageConfig();
  if (!cfg) {
    throw new Error(
      'Backblaze B2 is not configured. Set B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET, and B2_REGION.',
    );
  }
  return cfg;
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

export async function listDrive(prefix = '', delimiter = '/') {
  const cfg = requireCfg();
  const client = createClient(cfg);
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

export async function uploadDrive(key: string, body: Buffer | Uint8Array, contentType?: string) {
  const cfg = requireCfg();
  const client = createClient(cfg);
  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key.replace(/^\/+/, ''),
      Body: body,
      ContentType: contentType || 'application/octet-stream',
    }),
  );
  return { key: key.replace(/^\/+/, '') };
}

export async function deleteDrive(keys: string[]) {
  const cfg = requireCfg();
  const client = createClient(cfg);
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
  const cfg = requireCfg();
  const client = createClient(cfg);
  const cmd = new GetObjectCommand({ Bucket: cfg.bucket, Key: key.replace(/^\/+/, '') });
  return getSignedUrl(client, cmd, { expiresIn });
}

export async function headDrive(key: string) {
  const cfg = requireCfg();
  const client = createClient(cfg);
  return client.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key.replace(/^\/+/, '') }));
}
