/* ============================================================
   J.A.R.V.I.S // SHARED HTML ESCAPING (S2)

   Eight client modules used to carry their own copy of escapeHtml(). They had
   drifted: app.js and research.js returned '' for anything that was not a
   string, while nutrition.js and training.js called String(value) and so
   survived numbers, and analytics.js interpolated raw ids straight into
   `data-*` attributes with no escaping at all.

   One definition, one behaviour:
     - null / undefined  -> ''   (these are the common "field missing" cases)
     - anything else     -> String(value), escaped
     - text without any of & < > " ' is returned untouched (allocation-free path)

   Loaded synchronously (no defer) before every module that renders HTML, so
   `window.JarvisEscape` is already defined when the deferred page scripts run.
   The modules still keep a one-line inline fallback: after a deploy the service
   worker can pair a freshly cached page script with the previous HTML document
   for exactly one load, and a ReferenceError there would blank the page.
   ============================================================ */
(function (global) {
    'use strict';

    // Named entities rather than numeric ones: they are shorter, and every target
    // browser (all of them support service workers) understands all five.
    const HTML_ESCAPES = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    };

    // Single pass on purpose. Chaining .replace() calls would re-escape the
    // ampersands introduced by the first one ('&' -> '&amp;' -> '&amp;amp;').
    const NEEDS_ESCAPE = /[&<>"']/;
    const ESCAPE_ALL = /[&<>"']/g;

    /**
     * Escape text for interpolation into HTML text or a quoted attribute value.
     * @param {unknown} value
     * @returns {string}
     */
    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        const text = typeof value === 'string' ? value : String(value);
        if (!NEEDS_ESCAPE.test(text)) return text; // fast path, and the usual case
        return text.replace(ESCAPE_ALL, (ch) => HTML_ESCAPES[ch]);
    }

    global.JarvisEscape = Object.freeze({ escapeHtml });
})(window);
