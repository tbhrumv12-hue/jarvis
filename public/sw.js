/* ============================================================
   J.A.R.V.I.S // SERVICE WORKER (S2)

   Until S2 this file was three lines: install -> skipWaiting,
   activate -> clients.claim, fetch -> fetch(request). It worked as a
   proxy and cached nothing, so every load paid for the whole app shell
   again and the app was dead the moment the phone lost signal.

   Routing is by *kind of request*, which is the only split that matters here:

     /api/*          -> not intercepted at all (Network Only, see below)
     navigation      -> stale-while-revalidate + offline fallback
     same-origin     -> stale-while-revalidate (runtime cache)
     google fonts    -> stale-while-revalidate (runtime cache, opaque allowed)

   Why /api/* is left completely alone: those responses are per-session,
   authorisation-gated (S1 sends `Authorization: Bearer <APP_API_KEY>`) and
   several of them are streams. Caching a 401/503 and replaying it later would
   be a correctness bug, and touching the request would mean re-implementing
   the header the fetch wrapper adds. Returning without respondWith() hands the
   request straight back to the browser, untouched.

   Bump VERSION on a release that changes the precache list or needs a hard
   reset. Static file names are not content-hashed, so stale-while-revalidate is
   what keeps a deploy from stranding an old bundle: the first load after the
   deploy shows the cached copy, the second shows the new one.
   ============================================================ */
'use strict';

const VERSION = 's2-1';
const SHELL_CACHE = `jarvis-shell-${VERSION}`;
const RUNTIME_CACHE = `jarvis-runtime-${VERSION}`;
const OFFLINE_URL = '/offline.html';

// Small and stable on purpose. Page-specific CSS/JS is *not* precached: 700 KB on
// install would slow the first visit from a phone to a crawl, and the runtime
// cache picks each page's files up on first use anyway.
const PRECACHE_URLS = [
    OFFLINE_URL,
    '/manifest.json',
    '/icons/icon.svg',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/css/tokens.css',
    '/css/pwa.css',
    '/js/escape.js',
    '/js/api-auth.js',
    '/js/pwa.js',
];

// Navigation fallbacks, in order, when the network is gone and the exact URL was
// never visited while online.
const NAV_FALLBACKS = ['/app', '/', OFFLINE_URL];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL_CACHE);
        // addAll is atomic: a single 404 here fails the install instead of leaving a
        // half-populated shell that would break offline mode silently.
        await cache.addAll(PRECACHE_URLS);
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keep = new Set([SHELL_CACHE, RUNTIME_CACHE]);
        const names = await caches.keys();
        await Promise.all(
            names.filter((name) => !keep.has(name)).map((name) => caches.delete(name))
        );
        await self.clients.claim();
    })());
});

// The update banner in /js/pwa.js asks the waiting worker to take over.
self.addEventListener('message', (event) => {
    const message = event.data || {};
    if (message.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;

    // POST /api/ask, DELETE /api/analytics/... and every other mutation must reach
    // the server exactly once.
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    if (url.origin === self.location.origin) {
        // Lower-cased on purpose: Express routes case-insensitively, and S1 already
        // showed that `/API/metrics` and `/%61pi/metrics` hit the same handler.
        const path = url.pathname.toLowerCase();
        if (path === '/api' || path.startsWith('/api/')) return; // Network Only

        if (request.mode === 'navigate') {
            event.respondWith(handleNavigation(request));
            return;
        }

        event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
        return;
    }

    // Google Fonts: three families are pulled by every page. Caching the CSS and the
    // woff2 files here removes three cross-origin round-trips per load.
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    }
});

/**
 * Cached page immediately, fresh copy in the background.
 * Falls back to the app shell and finally to /offline.html when both miss.
 */
async function handleNavigation(request) {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });

    const network = fetch(request)
        .then((response) => {
            if (response && response.ok && response.type === 'basic') {
                cache.put(request, response.clone()).catch(() => {});
            }
            return response;
        })
        .catch(() => null);

    if (cached) {
        network.catch(() => {}); // fire and forget: never block the paint
        return cached;
    }

    const fresh = await network;
    if (fresh) return fresh;

    for (const url of NAV_FALLBACKS) {
        const hit = await cache.match(url, { ignoreSearch: true })
            || await caches.match(url, { ignoreSearch: true });
        if (hit) return hit;
    }

    return Response.error();
}

/**
 * Serve the cached copy, refresh it in the background. Opaque (cross-origin,
 * no-cors) responses are cacheable via cache.put even though response.ok is false
 * for them — that is why the check looks at `type` as well.
 */
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    const network = fetch(request)
        .then((response) => {
            if (response && (response.ok || response.type === 'opaque')) {
                cache.put(request, response.clone()).catch(() => {});
            }
            return response;
        })
        .catch(() => null);

    if (cached) {
        network.catch(() => {});
        return cached;
    }

    const fresh = await network;
    return fresh || Response.error();
}
