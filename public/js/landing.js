/* ═══════════════════════════════════════════════════════════════════════════
   J.A.R.V.I.S // LANDING — UI Handler
   ─────────────────────────────────────────────────────────────────────────
   Minimal landing page behavior:
     • Handles the "ask a question" form → redirects to /app with the question
     • Handles the "enter system" button → redirects to /app
   No animation. No canvas. The visual is 100% CSS (landing.css).
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ── Helpers ──
    function safeSessionSet(key, value) {
        try {
            sessionStorage.setItem(key, value);
            return true;
        } catch (err) {
            // sessionStorage may be disabled (private mode / file://)
            return false;
        }
    }

    function navigateToApp() {
        window.location.href = '/app';
    }

    // ── Init ──
    function init() {
        const form = document.getElementById('landing-form');
        const input = document.getElementById('landing-input');
        const enterBtn = document.getElementById('enter-btn');

        // ── Question form ──
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();

                const value = (input && input.value ? input.value : '').trim();

                if (value) {
                    safeSessionSet('jarvis_pending_question', value);
                }

                navigateToApp();
            });
        }

        // ── Enter button ──
        if (enterBtn) {
            enterBtn.addEventListener('click', function () {
                navigateToApp();
            });
        }
    }

    // ── Bootstrap ──
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();