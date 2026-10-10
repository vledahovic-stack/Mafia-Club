// Progressive Web App (PWA) Service Worker for Mafia Online
// Validated for PWABuilder & Android TWA (Trusted Web Activity)

const CACHE_NAME = 'mafia-pwa-v1';
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

// Install: Cache critical assets and offline page
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Precaching core assets for offline support');
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[ServiceWorker] Some precache assets failed:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up previous caches
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
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-first for dynamic navigation and API/WS, Cache-first for images and fonts
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip WebSocket connections and non-GET requests
  if (request.method !== 'GET' || url.protocol.startsWith('ws')) {
    return;
  }

  // Skip /api/ routes to prevent stale game state
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // HTML Navigation requests: Network first, fallback to offline.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => {
          return caches.match('/offline.html').then((cached) => {
            return cached || caches.match('/');
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

// Support skipWaiting message from app updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
