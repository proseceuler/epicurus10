const DB_NAME = 'epicure-media';
const STORE = 'blobs';
const LS_PREFIX = 'epicure:media:';

function idb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveMedia(id: string, dataUrl: string): Promise<string> {
  const db = await idb();
  if (db) {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(dataUrl, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } else if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(LS_PREFIX + id, dataUrl);
    } catch {
      /* quota */
    }
  }
  return `media:${id}`;
}

export async function loadMedia(ref: string): Promise<string | null> {
  if (!ref) return null;
  if (ref.startsWith('data:') || /^https?:/i.test(ref) || ref.startsWith('blob:')) return ref;
  const id = ref.startsWith('media:') ? ref.slice(6) : ref;
  const db = await idb();
  if (db) {
    const fromIdb = await new Promise<string | null>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve((req.result as string) || null);
      req.onerror = () => resolve(null);
    });
    if (fromIdb) return fromIdb;
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(LS_PREFIX + id);
  }
  return null;
}

export async function deleteMedia(ref: string) {
  const id = ref.startsWith('media:') ? ref.slice(6) : ref;
  const db = await idb();
  if (db) {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
  try {
    localStorage.removeItem(LS_PREFIX + id);
  } catch {
    /* ignore */
  }
}

export function compressImage(file: File, maxEdge = 1400, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result || ''));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(mime, quality));
      };
      img.onerror = () => resolve(String(reader.result || ''));
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}
