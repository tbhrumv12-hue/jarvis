/* J.A.R.V.I.S — Service Worker (Bypass) */
self.addEventListener('install', (event) => {
    self.skipWaiting();
});
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(keys.map((key) => caches.delete(key)));
        }).then(() => self.clients.claim())
    );
});
self.addEventListener('fetch', (event) => {
    // תמיד קח מהרשת, לא מה-Cache
    event.respondWith(fetch(event.request));
});