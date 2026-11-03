/* ============================================================
   J.A.R.V.I.S // NUTRITION CHAT — floating 💬 agent
   Same FAB + window pattern as the training coach.
   Sends today's totals / targets / meals to /api/nutrition/chat.
   ============================================================ */
(() => {
    'use strict';

    const STORAGE_KEY = 'jarvis_nutrition_v2';
    const CHAT_STORAGE_KEY = 'jarvis_nutrition_chat_v1';
    const ENDPOINT = '/api/nutrition/chat';
    const MAX_HISTORY = 8;
    const MAX_PERSISTED = 12;
    const MAX_PERSISTED_CHARS = 600;
    const TREND_DAYS = 7;
    const MAX_QUERY = 500;
    const MAX_MEALS_IN_CONTEXT = 20;

    // Must mirror TARGETS in nutrition.js
    const TARGETS = Object.freeze({
        kcal: 2650,
        protein: 140,
        carbs: 325,
        fats: 85,
        fiber: 35,
        sugar: 50,
        water: 3000
    });

    const state = {
        open: false,
        loading: false,
        history: []
    };

    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────

    function $(id) {
        return document.getElementById(id);
    }

    // Shared helper (S2): /js/escape.js is loaded before this file. The inline
    // fallback only triggers if a stale page is paired with a fresh bundle — the
    // service worker may still hand out the previous HTML for one load.
    const escapeHtml = window.JarvisEscape
        ? window.JarvisEscape.escapeHtml
        : (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

    function formatMarkdownLight(text) {
        let html = escapeHtml(text);
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        html = html.replace(/^\s*[-•]\s+(.+)$/gm, '<span style="color: var(--hud-turquoise); margin-left: 4px;">•</span> $1');
        html = html.replace(/\n{2,}/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');
        return `<p>${html}</p>`;
    }

    // ── זיכרון שיחה מתמיד — נשמר לפי יום ומתאפס בחצות ──
    function loadPersistedHistory() {
        try {
            const raw = localStorage.getItem(CHAT_STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!parsed || parsed.v !== 1 || parsed.day !== todayKey() || !Array.isArray(parsed.messages)) {
                return [];
            }

            return parsed.messages
                .filter((msg) => msg
                    && (msg.role === 'user' || msg.role === 'assistant')
                    && typeof msg.content === 'string'
                    && msg.content.trim())
                .slice(-MAX_PERSISTED)
                .map((msg) => ({ role: msg.role, content: msg.content.slice(0, MAX_PERSISTED_CHARS) }));
        } catch (err) {
            console.warn('[Nutrition Chat] restore failed:', err);
            return [];
        }
    }

    function persistHistory() {
        try {
            const messages = state.history
                .filter((msg) => msg && typeof msg.content === 'string' && msg.content.trim())
                .slice(-MAX_PERSISTED)
                .map((msg) => ({ role: msg.role, content: msg.content.slice(0, MAX_PERSISTED_CHARS) }));

            if (messages.length === 0) {
                localStorage.removeItem(CHAT_STORAGE_KEY);
                return;
            }

            localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({
                v: 1,
                day: todayKey(),
                messages
            }));
        } catch (err) {
            console.warn('[Nutrition Chat] persist failed:', err);
        }
    }

    function clearPersistedHistory() {
        try {
            localStorage.removeItem(CHAT_STORAGE_KEY);
        } catch (err) {
            console.warn('[Nutrition Chat] clear failed:', err);
        }
    }

    function todayKey() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function loadToday() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            const day = parsed && parsed.days ? parsed.days[todayKey()] : null;
            return day && typeof day === 'object' ? day : null;
        } catch (err) {
            console.warn('[Nutrition Chat] read failed:', err);
            return null;
        }
    }

    // ── מקור אמת אחד — nutrition.js חושף את ה-TARGETS האמיתיים ──
    function activeTargets() {
        const bridge = window.JarvisNutrition;
        if (bridge && bridge.TARGETS) return { ...bridge.TARGETS };
        return { ...TARGETS };
    }

    // ── 7 ימים אחרונים — קונטקסט מגמה לשרת ──
    function buildHistory7d() {
        const bridge = window.JarvisNutrition;
        try {
            if (bridge && typeof bridge.getDailyTotals === 'function') {
                const rows = bridge.getDailyTotals(TREND_DAYS, 0);
                if (Array.isArray(rows)) return rows;
            }
        } catch (err) {
            console.warn('[Nutrition Chat] trend bridge failed:', err);
        }

        // נפילה לאחור: קריאה ישירה מה-store (בלי תלות ב-nutrition.js).
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            const days = parsed && parsed.days ? parsed.days : {};
            const now = new Date();
            const rows = [];

            for (let i = TREND_DAYS - 1; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const day = days[key];
                const totals = day && day.totals && typeof day.totals === 'object' ? day.totals : null;
                const meals = day && Array.isArray(day.meals) ? day.meals.length : 0;
                const kcal = Math.round(Number(totals && totals.kcal) || 0);
                if (!totals || (kcal <= 0 && meals === 0)) continue;
                rows.push({
                    date: key,
                    kcal,
                    protein: Math.round(Number(totals.protein) || 0),
                    carbs: Math.round(Number(totals.carbs) || 0),
                    fats: Math.round(Number(totals.fats) || 0),
                    meals
                });
            }
            return rows;
        } catch (err) {
            console.warn('[Nutrition Chat] history7d fallback failed:', err);
            return [];
        }
    }

    function buildContext() {
        const day = loadToday() || {};
        const meals = Array.isArray(day.meals) ? day.meals.slice(0, MAX_MEALS_IN_CONTEXT) : [];

        return {
            date: typeof day.date === 'string' && day.date ? day.date : todayKey(),
            totals: day.totals && typeof day.totals === 'object' ? day.totals : {},
            targets: activeTargets(),
            history7d: buildHistory7d(),
            water: Number(day.water) || 0,
            insights: typeof day.insights === 'string' ? day.insights.slice(0, 700) : '',
            meals: meals.map((meal) => ({
                description: String(meal && meal.description ? meal.description : '').slice(0, 160),
                time: String(meal && meal.time ? meal.time : ''),
                totals: meal && meal.totals && typeof meal.totals === 'object' ? meal.totals : {}
            }))
        };
    }

    // ─────────────────────────────────────────────────────────────
    // Rendering
    // ─────────────────────────────────────────────────────────────

    function scrollMessages() {
        const box = $('nutrition-chat-messages');
        if (box) box.scrollTop = box.scrollHeight;
    }

    function dropEmptyState() {
        const box = $('nutrition-chat-messages');
        const empty = box ? box.querySelector('.hud-chat-empty') : null;
        if (empty) empty.remove();
    }

    function appendMessage(kind, htmlContent, extraClass) {
        const box = $('nutrition-chat-messages');
        if (!box) return null;

        dropEmptyState();

        const row = document.createElement('div');
        row.className = `hud-chat-message hud-chat-message--${kind}`;

        const bubble = document.createElement('div');
        bubble.className = 'hud-chat-bubble' + (extraClass ? ` ${extraClass}` : '');
        bubble.innerHTML = htmlContent;

        row.appendChild(bubble);
        box.appendChild(row);
        scrollMessages();
        return row;
    }

    function renderUser(text) {
        return appendMessage('user', escapeHtml(text));
    }

    function renderLoading() {
        const row = appendMessage(
            'ai',
            '<div class="hud-chat-typing"><span></span><span></span><span></span></div>'
        );
        if (row) row.id = 'nutrition-chat-loading';
        return row;
    }

    function removeLoading() {
        const el = $('nutrition-chat-loading');
        if (el) el.remove();
    }

    function renderReply(reply) {
        removeLoading();
        appendMessage('ai', formatMarkdownLight(reply || ''));
    }

    function renderError(message) {
        removeLoading();
        appendMessage('ai', `❌ ${escapeHtml(message)}`, 'hud-chat-bubble--error');
    }

    // ── קונטקסט גלוי — מה הצ'אט באמת רואה ──
    function updateContextStrip() {
        const strip = $('nutrition-chat-context');
        const label = $('nutrition-chat-context-text');
        if (!strip || !label) return;

        const day = loadToday() || {};
        const totals = day.totals && typeof day.totals === 'object' ? day.totals : {};
        const targets = activeTargets();
        const history = buildHistory7d();
        const kcal = Math.round(Number(totals.kcal) || 0);
        const protein = Math.round(Number(totals.protein) || 0);
        const fmt = (value) => Number(value || 0).toLocaleString('he-IL');

        label.textContent = `היום: ${fmt(kcal)}/${fmt(targets.kcal)} קק"ל · ${protein}/${targets.protein}g חלבון`
            + ` · ${history.length} ימי מגמה`;
        strip.hidden = false;
    }

    // ── שחזור שיחה — הכל עובר escapeHtml/formatMarkdownLight, בלי HTML גולמי ──
    function restoreHistory() {
        const saved = loadPersistedHistory();
        if (!saved.length) return;

        state.history = saved.slice(-MAX_HISTORY);
        saved.forEach((msg) => {
            if (msg.role === 'user') {
                renderUser(msg.content);
            } else {
                appendMessage('ai', formatMarkdownLight(msg.content));
            }
        });
    }

    function bindSuggestions() {
        document.querySelectorAll('.hud-chat-suggestion').forEach((btn) => {
            btn.addEventListener('click', () => {
                const text = btn.getAttribute('data-text') || '';
                if (text) sendMessage(text);
            });
        });
    }

    // ── ניקוי שיחה — גם מהזיכרון המקומי ──
    let emptyStateHtml = '';

    function clearChat() {
        state.history = [];
        clearPersistedHistory();

        const box = $('nutrition-chat-messages');
        if (box && emptyStateHtml) box.innerHTML = emptyStateHtml;
        bindSuggestions();
        updateContextStrip();
    }

    function setLoading(on) {
        state.loading = on;
        const btn = $('nutrition-chat-send');
        const input = $('nutrition-chat-input');
        if (btn) btn.disabled = on;
        if (input) input.disabled = on;
    }

    // ─────────────────────────────────────────────────────────────
    // Open / Close
    // ─────────────────────────────────────────────────────────────

    function openChat() {
        const chat = $('nutrition-chat');
        const fab = $('nutrition-chat-fab');
        if (!chat || !fab) return;

        chat.hidden = false;
        fab.classList.add('hidden');
        state.open = true;
        updateContextStrip();

        setTimeout(() => {
            const input = $('nutrition-chat-input');
            if (input) input.focus();
        }, 150);
    }

    function closeChat() {
        const chat = $('nutrition-chat');
        const fab = $('nutrition-chat-fab');
        if (!chat || !fab) return;

        chat.hidden = true;
        fab.classList.remove('hidden');
        state.open = false;
    }


    // ─────────────────────────────────────────────────────────────
    // Send
    // ─────────────────────────────────────────────────────────────

    async function sendMessage(text) {
        const trimmed = String(text || '').trim();

        if (state.loading) return;
        if (trimmed.length < 2) return;
        if (trimmed.length > MAX_QUERY) {
            renderError(`השאלה ארוכה מדי (מקסימום ${MAX_QUERY} תווים)`);
            return;
        }

        renderUser(trimmed);

        const input = $('nutrition-chat-input');
        if (input) input.value = '';

        state.history.push({ role: 'user', content: trimmed });
        if (state.history.length > MAX_HISTORY) {
            state.history = state.history.slice(-MAX_HISTORY);
        }
        persistHistory();

        setLoading(true);
        renderLoading();

        try {
            const res = await fetch(ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: trimmed,
                    history: state.history.slice(0, -1),
                    nutrition: buildContext()
                })
            });

            let payload = null;
            try {
                payload = await res.json();
            } catch (parseErr) {
                throw new Error(`תגובת שרת לא תקינה (${res.status})`);
            }

            if (!res.ok) {
                throw new Error((payload && (payload.error || payload.reply)) || `שגיאה ${res.status}`);
            }

            if (!payload || !payload.reply) {
                throw new Error('תגובת שרת חסרה שדה reply');
            }

            renderReply(payload.reply);

            state.history.push({ role: 'assistant', content: payload.reply });
            if (state.history.length > MAX_HISTORY) {
                state.history = state.history.slice(-MAX_HISTORY);
            }
            persistHistory();
        } catch (err) {
            console.error('[Nutrition Chat] failed:', err);
            renderError(err.message || 'שגיאה בשליחת ההודעה');
            state.history = state.history.slice(0, -1);
            persistHistory();
        } finally {
            setLoading(false);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Bind
    // ─────────────────────────────────────────────────────────────

    function bind() {
        const messagesBox = $('nutrition-chat-messages');
        const emptyState = messagesBox ? messagesBox.querySelector('.hud-chat-empty') : null;
        if (emptyState) emptyStateHtml = emptyState.outerHTML;

        const fab = $('nutrition-chat-fab');
        if (fab) fab.addEventListener('click', openChat);

        const closeBtn = $('nutrition-chat-close');
        if (closeBtn) closeBtn.addEventListener('click', closeChat);

        const form = $('nutrition-chat-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const input = $('nutrition-chat-input');
                if (input) sendMessage(input.value);
            });
        }

        bindSuggestions();

        const clearBtn = $('nutrition-chat-clear');
        if (clearBtn) clearBtn.addEventListener('click', clearChat);

        restoreHistory();
        updateContextStrip();

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && state.open) closeChat();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind, { once: true });
    } else {
        bind();
    }
})();

