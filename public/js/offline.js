/* ============================================================
   J.A.R.V.I.S // OFFLINE PAGE BEHAVIOUR
   Separate file so offline.html carries no inline script (script-src 'self').
   ============================================================ */
(function () {
    'use strict';

    const retry = document.getElementById('offline-retry');
    if (retry) {
        retry.addEventListener('click', () => window.location.reload());
    }

    // The app shell itself is cached by the service worker, so /app is the safe
    // target: it renders from cache when the network is still down.
    const home = document.getElementById('offline-home');
    if (home) {
        home.addEventListener('click', () => window.location.assign('/app'));
    }
})();
