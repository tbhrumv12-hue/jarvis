/* ============================================================
   J.A.R.V.I.S // PWA BOOTSTRAP (S2)

   Registers /sw.js for every page and surfaces "a new build is ready".
   Before this file the registration snippet was copy-pasted as an inline
   <script> into five of the six pages (training.html had none at all), which
   also meant five CSP violations once script-src stopped allowing 'unsafe-inline'.

   Deliberately NOT deferred: it must run before the window "load" event it
   subscribes to, and it has no DOM dependency.
   ============================================================ */
(function () {
    'use strict';

    if (!('serviceWorker' in navigator)) return;

    const SW_URL = '/sw.js';
    // Set only when the user accepts the update, so the reload that follows
    // cannot turn the very first install into a refresh loop.
    let awaitingReload = false;

    window.addEventListener('load', () => {
        navigator.serviceWorker.register(SW_URL, { scope: '/' })
            .then((registration) => {
                console.info('[pwa] service worker registered:', registration.scope);

                // Already waiting from an earlier visit.
                if (registration.waiting && navigator.serviceWorker.controller) {
                    showUpdateBanner(registration);
                }

                registration.addEventListener('updatefound', () => {
                    const installing = registration.installing;
                    if (!installing) return;
                    installing.addEventListener('statechange', () => {
                        // `controller` is null on the first ever install: there is
                        // nothing stale in front of the user, so no banner.
                        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateBanner(registration);
                        }
                    });
                });
            })
            .catch((err) => console.warn('[pwa] service worker registration failed:', err));
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!awaitingReload) return;
        awaitingReload = false;
        window.location.reload();
    });

    function showUpdateBanner(registration) {
        if (document.getElementById('pwa-update-banner')) return;

        const banner = document.createElement('div');
        banner.id = 'pwa-update-banner';
        banner.className = 'pwa-update-banner';
        banner.setAttribute('role', 'status');

        const text = document.createElement('span');
        text.className = 'pwa-update-banner-text';
        text.textContent = 'גרסה חדשה של J.A.R.V.I.S זמינה';

        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'pwa-update-banner-action';
        action.textContent = 'רענן';
        action.addEventListener('click', () => {
            const waiting = registration.waiting;
            if (!waiting) {
                window.location.reload();
                return;
            }
            awaitingReload = true;
            waiting.postMessage({ type: 'SKIP_WAITING' });
            banner.remove();
        });

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'pwa-update-banner-close';
        close.setAttribute('aria-label', 'סגור');
        close.textContent = '✕';
        close.addEventListener('click', () => banner.remove());

        banner.appendChild(text);
        banner.appendChild(action);
        banner.appendChild(close);
        document.body.appendChild(banner);
    }
})();
