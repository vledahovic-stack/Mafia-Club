// Progressive Web App (PWA) Service Worker for Mafia Online
// Development fallback and production parity worker
// Manual prompt update mode — never interrupts active game rooms

const CACHE_NAME = 'mafia-pwa-v2';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/manifest.json',
  '/favicon.ico',
  '/icons/icon.svg',
  '/icons/pwa-192x192.png',
  '/icons/pwa-maskable-192x192.png',
  '/icons/pwa-512x512.png',
  '/icons/pwa-maskable-512x512.png',
  '/icons/apple-touch-icon.png',
  '/screenshots/screenshot-narrow.png',
  '/screenshots/screenshot-wide.png',
  '/.well-known/assetlinks.json'
];

// Install: Cache critical assets without auto-skipWaiting
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[ServiceWorker] Some precache assets failed:', err);
      });
    })
    // Do NOT call self.skipWaiting() automatically to prevent active game disruption
  );
});

// Activate: Clean up older caches when explicitly activated
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
});

// Fetch: Network-first with cached index.html fallback for navigation; API & WS bypass
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip WebSocket connections and non-GET requests
  if (request.method !== 'GET' || url.protocol.startsWith('ws')) {
    return;
  }

  // Skip /api/ routes to prevent caching private or stale game state
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // HTML Navigation requests: Network-first, fallback to cached index.html (SPA entry)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => {
          return caches.match('/index.html').then((cachedIndex) => {
            if (cachedIndex) return cachedIndex;
            return caches.match('/offline.html').then((cachedOffline) => {
              return cachedOffline || caches.match('/');
            });
          });
        })
    );
    return;
  }

  // Static assets (images, fonts, scripts): Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// Controlled activation on explicit user request from UI
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Web Push notification handler (Main Administrator visitor alerts)
self.addEventListener('push', (event) => {
  let payload = {
    title: 'Новый посетитель Mafia Club',
    body: 'Зафиксировано новое посещение сайта',
    icon: '/icons/pwa-192x192.png',
    badge: '/icons/pwa-192x192.png',
    tag: 'mafia-visitor-notification',
    renotify: true,
    data: { url: '/' }
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        payload = {
          title: typeof parsed.title === 'string' && parsed.title ? parsed.title : payload.title,
          body: typeof parsed.body === 'string' && parsed.body ? parsed.body : payload.body,
          icon: typeof parsed.icon === 'string' && parsed.icon ? parsed.icon : payload.icon,
          badge: typeof parsed.badge === 'string' && parsed.badge ? parsed.badge : payload.badge,
          tag: typeof parsed.tag === 'string' && parsed.tag ? parsed.tag : payload.tag,
          renotify: parsed.renotify !== false,
          data: {
            url: '/'
          }
        };
      }
    } catch {
      try {
        const text = event.data.text();
        if (text) {
          payload.body = text;
        }
      } catch {}
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      tag: payload.tag,
      renotify: payload.renotify,
      data: { url: '/' }
    })
  );
});

// Notification click handler: focus existing Mafia Club tab or open root '/' (no tokens/secrets in URL)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

