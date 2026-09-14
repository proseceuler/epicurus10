/* epicure offline shell — network-first HTML, cache only static assets */
const CACHE = 'epicure-shell-v2';
const ASSETS = ['/', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  if (url.pathname.startsWith('/assets/')) return true;
  if (url.pathname.startsWith('/__grok/')) return true;
  return /\.(?:js|css|svg|png|jpg|jpeg|webp|woff2|webmanifest)$/.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(fetch(req).catch(() => caches.match('/') || caches.match(req)));
    return;
  }

  if (!isStaticAsset(url)) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || net;
    }),
  );
});
