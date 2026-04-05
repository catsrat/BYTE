const CACHE_NAME = 'byte-burgers-v34';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './menu.html',
  './order.html',
  './franchise.html',
  './thanks.html',
  './css/style.css',
  './js/main.js',
  './images/logo-white.png',
  './images/app-icon.png',
  './images/halal-badge.png',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached response if found, else fetch from network
        return response || fetch(event.request).catch(() => {
          // If offline and request fails, return cached index if navigating
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
