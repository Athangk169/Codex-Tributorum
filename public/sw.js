// public/sw.js
// ─────────────────────────────────────────────────────────────
// Offline shell for Codex Tributorum.
//
// Goal: any device that has loaded the app once while the server
// was reachable can cold-load it offline afterwards — desktop gets
// the same always-available property the Android APK has.
//
// Strategy:
//   * /db/* (CouchDB proxy) — never intercepted. Sync traffic and
//     /_session auth must always hit the network; PouchDB handles
//     offline itself via the local replica.
//   * Cross-origin requests — never intercepted.
//   * Navigations (HTML) — network-first, falling back to the cached
//     shell. New deploys land on the next online visit; offline
//     cold-loads get the last-seen shell.
//   * All other same-origin GETs (content-hashed JS/CSS bundles,
//     fonts, sounds, 3D models) — cache-first, filled from the
//     network. Hashed filenames make cache-first safe: a new build
//     references new URLs, which miss the cache and get fetched.
//
// The PRECACHE list is a best-effort seed; the runtime cache picks
// up everything it misses (notably the hashed bundles, whose names
// aren't knowable here).
// ─────────────────────────────────────────────────────────────
const CACHE_NAME = 'codex-v3'; // bump to force a full cache reset

const PRECACHE = [
  '/',
  '/index.html',
  '/Baal_holo.html',
  '/three.min.js',
  '/manifest.json',
  '/sounds/bgm.mp3',
  '/sounds/click.mp3',
  '/sounds/holo_up.mp3',
  '/sounds/holo_down.mp3'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // new SW activates immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Per-asset add: one missing file must not void the whole seed.
      Promise.allSettled(PRECACHE.map((url) => cache.add(url)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim()) // control open tabs immediately
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin (e.g. the texture CDN fallback) — browser default.
  if (url.origin !== self.location.origin) return;

  // CouchDB proxy — must never be served from cache.
  if (url.pathname === '/db' || url.pathname.startsWith('/db/')) return;

  // Navigations: network-first so deploys propagate, shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME)
            .then((cache) => cache.put('/index.html', copy))
            .catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match('/index.html').then((hit) => hit || caches.match('/'))
        )
    );
    return;
  }

  // Static assets: cache-first, network fill on miss.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(request, copy))
            .catch(() => {});
        }
        return res;
      });
    })
  );
});
