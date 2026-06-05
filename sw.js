const CACHE = 'life-dashboard-v10';
const PRECACHE = [
  '/life-dashboard/',
  '/life-dashboard/index.html',
  '/life-dashboard/styles.css',
  '/life-dashboard/shared/db.js',
  '/life-dashboard/shared/supabase.js',
  '/life-dashboard/shared/push.js',
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

  // Bypass the browser HTTP cache so freshly deployed files land immediately,
  // not after GitHub Pages' ~10-minute max-age expires.
  const req = new Request(e.request.url, {
    method: 'GET',
    headers: e.request.headers,
    mode: e.request.mode === 'navigate' ? 'same-origin' : e.request.mode,
    credentials: e.request.credentials,
    cache: 'no-cache',
  });

  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  let data = { title: 'Reminder', body: '' };
  try { data = e.data.json(); } catch (_) { if (e.data) data.body = e.data.text(); }
  e.waitUntil(
    self.registration.showNotification(data.title || 'Reminder', {
      body: data.body || '',
      icon: '/life-dashboard/icon.png',
      badge: '/life-dashboard/icon.png',
      tag: data.tag || undefined,
      data: { url: data.url || '/life-dashboard/habits/' },
      requireInteraction: false,
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = e.notification.data?.url || '/life-dashboard/habits/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('/life-dashboard/') && 'focus' in c) return c.focus();
      }
      return clients.openWindow(target);
    })
  );
});
