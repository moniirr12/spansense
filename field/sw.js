// Service worker for the spanSense Field PWA.
// Two jobs only: (1) cache the app shell so it opens instantly (and at all)
// with no signal on site, (2) let a few read-heavy API GETs fall back to
// their last-known response when offline. Writes (POST/PUT/PATCH/DELETE)
// are never touched here - app.js/db.js queue those in IndexedDB and retry
// them itself, since a failed mutation needs the app's own conflict/ordering
// logic, not a blind service-worker replay.
const SHELL_CACHE = 'spansense-field-shell-v18';
const API_CACHE = 'spansense-field-api-v18';

const SHELL_ASSETS = [
  '/field/',
  '/field/index.html',
  '/field/manifest.json',
  '/field/css/app.css',
  '/field/css/vendor/leaflet.css',
  '/field/js/api.js',
  '/field/js/bci.js',
  '/field/js/db.js',
  '/field/js/twin3d.js',
  '/field/js/app.js',
  '/field/js/vendor/three.min.js',
  '/field/js/vendor/leaflet.js',
  '/twin/bridgeModels.js',
  '/twin/shapeBuilders.js',
  '/field/icons/icon-192.png',
  '/field/icons/icon-512.png',
  '/field/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names
        .filter((n) => n !== SHELL_CACHE && n !== API_CACHE)
        .map((n) => caches.delete(n))
    )).then(() => self.clients.claim())
  );
});

// GET endpoints worth an offline fallback: structure list/detail, inspection
// history and a fully-loaded inspection - enough to keep browsing what's
// already on the phone with no signal. Photo bytes and everything else are
// deliberately left off the network-first cache list; they're either large
// or already covered by the SW's normal HTTP handling.
const OFFLINE_CACHEABLE_API = [
  /^\/api\/bridges$/,
  /^\/api\/bridges\/\d+$/,
  /^\/api\/inspection-dates\/\d+$/,
  /^\/api\/inspection\/full(\?|$)/,
  /^\/api\/elements(\?|$)/
];

function isOfflineCacheableApi(pathname, search) {
  const full = pathname + search;
  return OFFLINE_CACHEABLE_API.some((re) => re.test(pathname) || re.test(full));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // mutations are never intercepted
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
    return;
  }

  if (url.pathname.startsWith('/api/') && isOfflineCacheableApi(url.pathname, url.search)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(API_CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached ||
          new Response(JSON.stringify({ error: 'Offline and nothing cached yet' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          })))
    );
  }
});
