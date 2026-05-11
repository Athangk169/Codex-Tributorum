// public/sw.js
const CACHE_NAME = 'codex-v2'; // ← bumped version forces cache refresh

const ASSETS = [
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

// Install: Save core assets to the cache
self.addEventListener('install', (event) => {
  self.skipWaiting(); // ← force new SW to activate immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim()); // ← take control of all tabs immediately
});

// Fetch: Serve from cache if offline
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Skip CouchDB requests — let browser handle them directly
  if (url.includes(':5984') || url.includes('ts.net') || url.includes('192.168')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});