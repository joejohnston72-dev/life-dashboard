const CACHE = 'life-dashboard-v3';
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

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
