// Tap List Service Worker — offline resilience for the display.
// Kept intentionally lightweight: response.clone() is a cheap structural copy
// (no data buffered in memory), so we never read bodies as blobs.
//
// Strategy:
//   - Images/uploads: cache-first, one-shot fetch on miss (no background refetch loop).
//     Uploaded image URLs contain a timestamp, so a "new" image is a new key
//     and gets fetched naturally — refreshing existing image cache entries is
//     wasted bandwidth and memory.
//   - Everything else (HTML, CSS, JS, /api/*): network-first with a short
//     timeout, falling back to whatever's in the cache.
//
// The cache-badge on the client uses localStorage to remember the last
// successful poll timestamp; it doesn't rely on custom SW response headers.

const CACHE_NAME = 'taplist-v4';
const NETWORK_TIMEOUT_MS = 4000;

const PRECACHE_URLS = [
  '/',
  '/pour',
  '/public/css/display.css',
  '/public/css/pour.css',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isImage = /\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(url.pathname)
    || url.pathname.startsWith('/uploads/');

  if (isImage) {
    event.respondWith(cacheFirst(req));
  } else {
    event.respondWith(networkFirst(req));
  }
});

async function networkFirst(req) {
  try {
    const net = await fetchWithTimeout(req, NETWORK_TIMEOUT_MS);
    if (net && net.ok) {
      const clone = net.clone();
      caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(() => {});
    }
    return net;
  } catch {
    const cached = await caches.match(req);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const net = await fetch(req);
    if (net && net.ok) {
      const clone = net.clone();
      caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(() => {});
    }
    return net;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(req).then(r => { clearTimeout(t); resolve(r); }, e => { clearTimeout(t); reject(e); });
  });
}
