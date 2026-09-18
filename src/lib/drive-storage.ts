import { Storage, type Bucket } from '@google-cloud/storage';

export type DriveStorageConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  bucket: string;
};

function parseServiceAccount(): DriveStorageConfig | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      const projectId = parsed.project_id || process.env.FIREBASE_PROJECT_ID || '';
      const clientEmail = parsed.client_email || '';
      const privateKey = String(parsed.private_key || '').replace(/\\n/g, '\n');
      const bucket =
        process.env.FIREBASE_STORAGE_BUCKET ||
        process.env.GCS_BUCKET ||
        (projectId ? `${projectId}.firebasestorage.app` : '');
      if (projectId && clientEmail && privateKey && bucket) {
        return { projectId, clientEmail, privateKey, bucket };
      }
    } catch {
      return null;
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || '';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || '';
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const bucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.GCS_BUCKET || '';
  if (!projectId || !clientEmail || !privateKey || !bucket) return null;
  return { projectId, clientEmail, privateKey, bucket };
}

export function getDriveStorageConfig(): DriveStorageConfig | null {
  return parseServiceAccount();
}

export function storageConfigured() {
  return Boolean(getDriveStorageConfig());
}

function getBucket(): Bucket {
  const cfg = getDriveStorageConfig();
  if (!cfg) {
    throw new Error(
      'Firebase Storage is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, and FIREBASE_STORAGE_BUCKET (or FIREBASE_SERVICE_ACCOUNT JSON).',
    );
  }
  const storage = new Storage({
    projectId: cfg.projectId,
    credentials: {
      client_email: cfg.clientEmail,
      private_key: cfg.privateKey,
    },
  });
  return storage.bucket(cfg.bucket);
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
  const bucket = getBucket();
  const pfx = normalizePrefix(prefix);
  const queryPrefix = pfx ? `${pfx}/` : '';
  const [objects, , apiResponse] = await bucket.getFiles({
    prefix: queryPrefix,
    delimiter,
    autoPaginate: false,
  });
  const response = apiResponse as { prefixes?: string[] };

  const folders = (response.prefixes || [])
    .map((raw) => {
      const key = String(raw || '').replace(/\/+$/, '');
      const name = key.split('/').filter(Boolean).pop() || key;
      return { type: 'folder' as const, key, name };
    })
    .filter((f) => f.name && f.name !== '.trash');

  const files = objects
    .filter((o) => o.name && o.name !== queryPrefix && !o.name.endsWith('/'))
    .map((o) => {
      const key = o.name;
      const name = key.split('/').filter(Boolean).pop() || key;
      const meta = o.metadata || {};
      return {
        type: 'file' as const,
        key,
        name,
        size: Number(meta.size || 0),
        modified: (meta.updated as string) || (meta.timeCreated as string) || null,
      };
    });

  return { folders, files, prefix: pfx };
}

export async function uploadDrive(key: string, body: Buffer | Uint8Array, contentType?: string) {
  const bucket = getBucket();
  const clean = key.replace(/^\/+/, '');
  const file = bucket.file(clean);
  await file.save(Buffer.from(body), {
    resumable: false,
    contentType: contentType || 'application/octet-stream',
    metadata: { contentType: contentType || 'application/octet-stream' },
  });
  return { key: clean };
}

export async function deleteDrive(keys: string[]) {
  const bucket = getBucket();
  const clean = keys.map((k) => k.replace(/^\/+/, '')).filter(Boolean);
  await Promise.all(
    clean.map(async (key) => {
      try {
        await bucket.file(key).delete({ ignoreNotFound: true });
      } catch {
        /* ignore missing */
      }
      if (!key.endsWith('/')) {
        try {
          await bucket.file(`${key}/`).delete({ ignoreNotFound: true });
        } catch {
          /* ignore */
        }
      }
    }),
  );
}

export async function signedGetUrl(key: string, expiresIn = 3600) {
  const bucket = getBucket();
  const file = bucket.file(key.replace(/^\/+/, ''));
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + expiresIn * 1000,
  });
  return url;
}

export async function headDrive(key: string) {
  const bucket = getBucket();
  const file = bucket.file(key.replace(/^\/+/, ''));
  const [exists] = await file.exists();
  if (!exists) throw new Error('Not found');
  const [metadata] = await file.getMetadata();
  return metadata;
}
