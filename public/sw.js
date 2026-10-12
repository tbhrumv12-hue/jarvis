/* ═══════════════════════════════════════════════════════════════════
   J.A.R.V.I.S — Service Worker v1.0
   Minimal PWA cache for offline-first shell
   ═══════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'jarvis-v1';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Assets to precache on install
const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/css/main.css',
    '/css/mobile.css',
    '/icons/icon.svg',
    '/favicon.svg',
];

// Install — precache shell
self.addEventListener('install', (event) => {
    console.log('[SW] installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return Promise.allSettled(
                    PRECACHE_URLS.map((url) =>
                        cache.add(url).catch((err) => {
                            console.warn('[SW] precache failed for', url, err.message);
                        })
                    )
                );
            })
            .then(() => self.skipWaiting())
    );
});

// Activate — cleanup old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] activating...');
    event.waitUntil(
        caches.keys()
            .then((keys) => {
                return Promise.all(
                    keys
                        .filter((key) => key !== CACHE_NAME)
                        .map((key) => caches.delete(key))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch — strategy by request type
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Skip cross-origin
    if (url.origin !== self.location.origin) return;

    // Skip API calls — always go to network
    if (url.pathname.startsWith('/api/')) return;

    // Skip HTML pages — network first, no cache fallback issues
    if (request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(
            fetch(request).catch(() => caches.match(request))
        );
        return;
    }

    // Static assets — cache first, network fallback
    event.respondWith(
        caches.match(request)
            .then((cached) => {
                if (cached) {
                    // Return cached but refresh in background
                    fetch(request)
                        .then((response) => {
                            if (response && response.ok) {
                                caches.open(CACHE_NAME).then((cache) => {
                                    cache.put(request, response.clone());
                                });
                            }
                        })
                        .catch(() => { /* offline — ignore */ });
                    return cached;
                }

                return fetch(request)
                    .then((response) => {
                        if (response && response.ok) {
                            const clone = response.clone();
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(request, clone);
                            });
                        }
                        return response;
                    });
            })
    );
});

// Message handling (for skipWaiting from page)
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});