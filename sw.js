// ╔══════════════════════════════════════════════╗
// ║   JobPilot Service Worker — PWA Support      ║
// ╚══════════════════════════════════════════════╝

const CACHE_NAME = 'jobpilot-v1.0.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap',
  'https://accounts.google.com/gsi/client'
];

// ── INSTALL — cache static assets ──────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache core files, skip failures for external
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE — clean old caches ─────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH — network first, cache fallback ───────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and API calls (always fresh)
  if (event.request.method !== 'GET') return;
  if (url.hostname.includes('railway.app')) return;
  if (url.hostname.includes('googleapis.com') && url.pathname.includes('/v1/')) return;
  if (url.hostname.includes('adzuna.com')) return;
  if (url.hostname.includes('maps.googleapis.com')) return;

  // For HTML — network first, fallback to cache
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // For everything else — cache first, network fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});

// ── PUSH NOTIFICATIONS ──────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'JobPilot', {
      body: data.body || 'New job update!',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/' },
      actions: [
        { action: 'view', title: '👀 View' },
        { action: 'dismiss', title: '✕ Dismiss' }
      ]
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});

// ── BACKGROUND SYNC (auto-apply offline queue) ──
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-applications') {
    event.waitUntil(syncPendingApplications());
  }
});

async function syncPendingApplications() {
  console.log('[SW] Syncing pending applications...');
  // Will sync queued job applications when back online
}
