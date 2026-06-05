const CACHE = 'life-dashboard-v5';
const PRECACHE = [
  '/life-dashboard/',
  '/life-dashboard/index.html',
  '/life-dashboard/styles.css',
  '/life-dashboard/shared/db.js',
  '/life-dashboard/shared/supabase.js',
  '/life-dashboard/manifest.json',
  '/life-dashboard/icon.png',
  '/life-dashboard/habits/index.html',
  '/life-dashboard/habits/app.js',
  '/life-dashboard/workout/index.html',
  '/life-dashboard/workout/app.js',
  '/life-dashboard/workout/exercises.js',
  '/life-dashboard/finance/index.html',
  '/life-dashboard/finance/app.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first: always try the network so deployed updates land immediately.
// Fall back to cache only when offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // don't intercept Supabase/CDN

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
