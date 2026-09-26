// Tap List Service Worker
// Strategy:
//   HTML/CSS/JS: network-first (short timeout), fall back to cache
//   Images: cache-first (avoid re-fetching on flaky connections)
//   API: network-first with cache fallback, so stale data is shown if the network drops
// Every cached response carries X-Cached-At (ms epoch). On a cache-served response we
// also set X-From-Cache: 1 so the page can show the "cached" badge.

const CACHE_NAME = 'taplist-v3';
const NETWORK_TIMEOUT_MS = 4000;

const PRECACHE_URLS = [
  '/',
  '/pour',
  '/public/css/display.css',
  '/public/css/pour.css',
  '/public/icons/icon-192x192.png',
  '/public/icons/icon-512x512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(
        PRECACHE_URLS.map(url =>
          fetch(url, { cache: 'no-store' })
            .then(res => res.ok ? wrapAndStore(cache, new Request(url), res) : null)
            .catch(() => null)
        )
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isImage = /\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(url.pathname) || url.pathname.startsWith('/uploads/');

  if (isImage) {
    event.respondWith(cacheFirst(req));
  } else {
    event.respondWith(networkFirst(req));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const net = await fetchWithTimeout(req, NETWORK_TIMEOUT_MS);
    if (net && net.ok) {
      wrapAndStore(cache, req, net.clone());
      return net;
    }
    throw new Error('bad response');
  } catch {
    const cached = await cache.match(req);
    if (cached) return withCacheHeader(cached);
    return new Response('Offline and not cached', { status: 503 });
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) {
    // Refresh in the background
    fetch(req).then(res => { if (res && res.ok) wrapAndStore(cache, req, res); }).catch(() => {});
    return withCacheHeader(cached);
  }
  try {
    const net = await fetch(req);
    if (net && net.ok) wrapAndStore(cache, req, net.clone());
    return net;
  } catch {
    return new Response('Offline and not cached', { status: 503 });
  }
}

async function wrapAndStore(cache, req, res) {
  try {
    const body = await res.blob();
    const headers = new Headers(res.headers);
    headers.set('X-Cached-At', String(Date.now()));
    const wrapped = new Response(body, { status: res.status, statusText: res.statusText, headers });
    await cache.put(req, wrapped);
  } catch {}
}

function withCacheHeader(res) {
  const headers = new Headers(res.headers);
  headers.set('X-From-Cache', '1');
  return res.blob().then(body => new Response(body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  }));
}

function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(req).then(r => { clearTimeout(t); resolve(r); }, e => { clearTimeout(t); reject(e); });
  });
}
