const CACHE = 'byte-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);

    // HTML pages: always fetch fresh from network, never cache
    if (e.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
        e.respondWith(
            fetch(e.request).catch(() => caches.match(e.request))
        );
        return;
    }

    // Video files: skip SW entirely — let browser handle range requests natively
    if (url.pathname.endsWith('.mp4') || url.pathname.endsWith('.webm')) {
        return;
    }

    // Only cache GET requests — POST and others are not cacheable
    if (e.request.method !== 'GET') return;

    // Everything else (CSS, JS, images): cache first, update in background
    e.respondWith(
        caches.open(CACHE).then(cache =>
            cache.match(e.request).then(cached => {
                const fresh = fetch(e.request).then(res => {
                    if (res.ok) cache.put(e.request, res.clone());
                    return res;
                });
                return cached || fresh;
            })
        )
    );
});
