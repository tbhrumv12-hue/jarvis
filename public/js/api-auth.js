/* ══════════════════════════════════════════════════════════════════════════
   J.A.R.V.I.S — API key client (S1 access control)
   ──────────────────────────────────────────────────────────────────────────
   The server now answers 401 to every /api/* call that does not carry
   `Authorization: Bearer <APP_API_KEY>` (/api/health stays open).

   This file is loaded before every other script and does three things:
     1. keeps the key on the device (localStorage — never a cookie, never a URL),
     2. adds the Authorization header to every same-origin /api/* fetch,
     3. asks for the key in a small HUD dialog on a 401 and retries the request.

   Because it wraps window.fetch, app.js / nutrition.js / training.js /
   analytics.js / research*.js need no changes at all.

   Console helpers:
     JarvisAuth.getKey()   JarvisAuth.setKey('...')
     JarvisAuth.clearKey() JarvisAuth.reset()   ← forget the key and reload
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    const STORAGE_KEY = 'jarvis.apiKey';
    const MIN_KEY_LENGTH = 8;
    const MAX_PROMPTS_PER_REQUEST = 2;
    const nativeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;

    let pendingPrompt = null;
    let stylesInjected = false;
    // Fallback when localStorage is unavailable (private mode): the key lives for
    // this page only instead of failing outright.
    let memoryKey = '';

    /* ── storage ─────────────────────────────────────────────────────────── */

    function getKey() {
        try {
            return window.localStorage.getItem(STORAGE_KEY) || '';
        } catch (err) {
            return '';
        }
    }

    function readKey() {
        return getKey() || memoryKey;
    }

    function setKey(value) {
        memoryKey = String(value).trim();
        try {
            window.localStorage.setItem(STORAGE_KEY, memoryKey);
        } catch (err) {
            /* keep the in-memory copy only */
        }
    }

    function clearKey() {
        memoryKey = '';
        try {
            window.localStorage.removeItem(STORAGE_KEY);
        } catch (err) {
            /* ignore */
        }
    }

    /* ── request wiring ─────────────────────────────────────────────────── */

    function isApiUrl(input) {
        let raw = '';
        if (typeof input === 'string') raw = input;
        else if (input && typeof input.url === 'string') raw = input.url;
        else return false;

        let url;
        try {
            url = new URL(raw, window.location.origin);
        } catch (err) {
            return false;
        }
        return url.origin === window.location.origin && url.pathname.indexOf('/api/') === 0;
    }

    function buildOptions(input, init, keepSignal) {
        const options = Object.assign({}, init || {});
        // The user may take a minute to type the key; the caller's AbortSignal was
        // armed for a single attempt, so a retry must not inherit it.
        if (!keepSignal) delete options.signal;

        const key = readKey();
        if (!key) return options;

        const headers = new Headers(options.headers || (input && input.headers) || undefined);
        if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${key}`);
        options.headers = headers;
        return options;
    }

    async function readJsonClone(response) {
        try {
            return await response.clone().json();
        } catch (err) {
            return null;
        }
    }

    async function apiFetch(input, init, attempt) {
        if (!nativeFetch || !isApiUrl(input)) return nativeFetch(input, init);

        const tries = attempt || 0;
        const response = await nativeFetch(input, buildOptions(input, init, true));

        // 503 AUTH_NOT_CONFIGURED means the server has no key at all — prompting
        // cannot help, so hand the response back and let the caller show it.
        if (response.status !== 401 || tries >= MAX_PROMPTS_PER_REQUEST) return response;

        const payload = await readJsonClone(response);

        // The server rejected the key we just sent, so the stored one is definitively
        // wrong — drop it instead of replaying a bad credential on every request.
        if (readKey()) clearKey();

        const key = await askForKey(
            tries === 0
                ? (payload && payload.error) || 'הזן את מפתח הגישה של המערכת:'
                : 'המפתח לא התקבל. נסה שוב.'
        );
        if (!key) return response; // cancelled — the caller sees the 401

        setKey(key);
        const retry = await nativeFetch(input, buildOptions(input, init, false));

        if (retry.status === 401) {
            clearKey();
            return apiFetch(input, init, tries + 1);
        }
        return retry;
    }

    if (nativeFetch) window.fetch = apiFetch;

    /* ── dialog ─────────────────────────────────────────────────────────── */

    function askForKey(message) {
        if (pendingPrompt) return pendingPrompt; // a second 401 joins the open dialog
        pendingPrompt = openDialog(message).then((value) => {
            pendingPrompt = null;
            return value;
        });
        return pendingPrompt;
    }

    function openDialog(message) {
        return new Promise((resolve) => {
            if (!document.body) {
                // Should not happen (this script sits at the end of <body>): fall back
                // to the native prompt rather than failing the request.
                const typed = window.prompt('מפתח גישה ל-J.A.R.V.I.S:') || '';
                resolve(typed.trim());
                return;
            }

            injectStyles();

            const overlay = document.createElement('div');
            overlay.className = 'jarvis-key-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-labelledby', 'jarvis-key-title');
            overlay.innerHTML = [
                '<form class="jarvis-key-card" novalidate>',
                '<p class="jarvis-key-eyebrow">J.A.R.V.I.S · ACCESS</p>',
                '<h2 class="jarvis-key-title" id="jarvis-key-title">נדרש מפתח גישה</h2>',
                '<p class="jarvis-key-text">המערכת מוגנת במפתח API. המפתח נשמר במכשיר הזה בלבד ונשלח רק לשרת של J.A.R.V.I.S.</p>',
                '<label class="jarvis-key-label" for="jarvis-key-input">מפתח גישה</label>',
                '<input id="jarvis-key-input" class="jarvis-key-input" type="password" dir="ltr"',
                '       autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="APP_API_KEY">',
                '<p class="jarvis-key-error" role="alert" aria-live="polite"></p>',
                '<div class="jarvis-key-actions">',
                '<button type="submit" class="jarvis-key-submit">אישור</button>',
                '<button type="button" class="jarvis-key-cancel">ביטול</button>',
                '</div>',
                '</form>',
            ].join('');

            const form = overlay.querySelector('form');
            const input = overlay.querySelector('.jarvis-key-input');
            const errorBox = overlay.querySelector('.jarvis-key-error');
            const cancelButton = overlay.querySelector('.jarvis-key-cancel');
            const previousFocus = document.activeElement;

            if (message) errorBox.textContent = String(message);

            function onKeyDown(event) {
                if (event.key === 'Escape') {
                    event.stopPropagation();
                    close('');
                }
            }

            function close(value) {
                document.removeEventListener('keydown', onKeyDown, true);
                overlay.remove();
                if (previousFocus && typeof previousFocus.focus === 'function') {
                    try {
                        previousFocus.focus();
                    } catch (err) {
                        /* the element is gone */
                    }
                }
                resolve(value);
            }

            form.addEventListener('submit', (event) => {
                event.preventDefault();
                const value = input.value.trim();
                if (value.length < MIN_KEY_LENGTH) {
                    errorBox.textContent = 'המפתח קצר מדי — בדוק שהעתקת אותו במלואו.';
                    input.focus();
                    return;
                }
                close(value);
            });

            cancelButton.addEventListener('click', () => close(''));

            overlay.addEventListener('mousedown', (event) => {
                if (event.target === overlay) close(''); // backdrop click
            });

            document.addEventListener('keydown', onKeyDown, true);
            document.body.appendChild(overlay);
            window.setTimeout(() => input.focus(), 30);
        });
    }

    function injectStyles() {
        if (stylesInjected || !document.head) return;
        stylesInjected = true;

        const style = document.createElement('style');
        style.id = 'jarvis-api-key-styles';
        style.textContent = `
.jarvis-key-overlay {
    position: fixed;
    inset: 0;
    z-index: 99999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(10, 14, 26, 0.86);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
    direction: rtl;
    font-family: var(--hud-font, 'Heebo', 'Segoe UI', system-ui, sans-serif);
    animation: jarvis-key-fade 0.18s var(--hud-ease, ease-out);
}
.jarvis-key-card {
    width: min(430px, 100%);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 24px;
    background: var(--hud-bg-1, #0d1220);
    border: 1px solid var(--hud-border-strong, rgba(77, 208, 196, 0.42));
    border-radius: var(--hud-radius, 16px);
    box-shadow: var(--hud-shadow-lift, 0 28px 56px -30px rgba(0, 0, 0, 0.95));
    color: var(--hud-text, #e8ecf5);
}
.jarvis-key-eyebrow {
    margin: 0;
    font-size: 11px;
    letter-spacing: 0.18em;
    color: var(--hud-turquoise, #4dd0c4);
}
.jarvis-key-title {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    line-height: 1.3;
}
.jarvis-key-text {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.65;
    color: var(--hud-text-2, #a8b2c8);
}
.jarvis-key-label {
    margin-top: 4px;
    font-size: 12px;
    color: var(--hud-text-2, #a8b2c8);
}
.jarvis-key-input {
    min-height: 44px;
    padding: 10px 12px;
    font-family: inherit;
    font-size: 14px;
    color: var(--hud-text, #e8ecf5);
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--hud-border, rgba(77, 208, 196, 0.16));
    border-radius: var(--hud-radius-xs, 8px);
    outline: none;
}
.jarvis-key-input:focus {
    border-color: var(--hud-turquoise, #4dd0c4);
    box-shadow: var(--hud-focus, 0 0 0 3px rgba(77, 208, 196, 0.22));
}
.jarvis-key-error {
    margin: 0;
    min-height: 16px;
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--hud-danger, #ff5c5c);
}
.jarvis-key-actions {
    display: flex;
    gap: 10px;
    margin-top: 4px;
}
.jarvis-key-submit,
.jarvis-key-cancel {
    flex: 1;
    min-height: 44px;
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
    border-radius: var(--hud-radius-xs, 8px);
    cursor: pointer;
}
.jarvis-key-submit {
    color: #04121a;
    background: linear-gradient(135deg, var(--hud-turquoise, #4dd0c4), var(--hud-turquoise-deep, #2f9a90));
    border: none;
}
.jarvis-key-cancel {
    color: var(--hud-text, #e8ecf5);
    background: transparent;
    border: 1px solid var(--hud-border, rgba(77, 208, 196, 0.16));
}
@keyframes jarvis-key-fade {
    from { opacity: 0; }
    to { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
    .jarvis-key-overlay { animation: none; }
}
`;
        document.head.appendChild(style);
    }

    /* ── public surface ─────────────────────────────────────────────────── */

    window.JarvisAuth = {
        getKey,
        setKey,
        clearKey,
        requestKey: (message) => askForKey(message),
        reset() {
            clearKey();
            window.location.reload();
        },
    };
})();
