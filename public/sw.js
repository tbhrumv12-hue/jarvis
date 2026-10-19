/* ═══════════════════════════════════════════════════════════════════
   J.A.R.V.I.S — Service Worker v1.1
   Caches shell assets only. Skips HTML and API calls.
   ═══════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'jarvis-v3';
const PRECACHE_URLS = [
    '/landing.html',
    '/manifest.json',
    '/css/main.css',
    '/css/mobile.css',
    '/css/landing.css',
    '/icons/icon.svg',
    '/favicon.svg',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return Promise.allSettled(
                PRECACHE_URLS.map((url) => 
                    cache.add(url).catch(err => console.warn('[SW] Precache failed:', url, err))
                )
            );
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignore non-GET, cross-origin, and API calls
    if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
        return;
    }

    // HTML: Network first, no cache fallback (always fresh)
    if (request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(
            fetch(request).catch(() => {
                // Return a simple offline error if network fails
                return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
            })
        );
        return;
    }

    // Static assets: Cache first, then network
    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;
            return fetch(request).then((response) => {
                if (response && response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return response;
            });
        })
    );
});