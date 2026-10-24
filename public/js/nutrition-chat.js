/* ============================================================
   J.A.R.V.I.S // NUTRITION CHAT — floating 💬 agent
   Same FAB + window pattern as the training coach.
   Sends today's totals / targets / meals to /api/nutrition/chat.
   ============================================================ */
(() => {
    'use strict';

    const STORAGE_KEY = 'jarvis_nutrition_v2';
    const ENDPOINT = '/api/nutrition/chat';
    const MAX_HISTORY = 8;
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

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

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

    function buildContext() {
        const day = loadToday() || {};
        const meals = Array.isArray(day.meals) ? day.meals.slice(0, MAX_MEALS_IN_CONTEXT) : [];

        return {
            date: typeof day.date === 'string' && day.date ? day.date : todayKey(),
            totals: day.totals && typeof day.totals === 'object' ? day.totals : {},
            targets: { ...TARGETS },
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
        } catch (err) {
            console.error('[Nutrition Chat] failed:', err);
            renderError(err.message || 'שגיאה בשליחת ההודעה');
            state.history = state.history.slice(0, -1);
        } finally {
            setLoading(false);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Bind
    // ─────────────────────────────────────────────────────────────

    function bind() {
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

        document.querySelectorAll('.hud-chat-suggestion').forEach((btn) => {
            btn.addEventListener('click', () => {
                const text = btn.getAttribute('data-text') || '';
                if (text) sendMessage(text);
            });
        });

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

