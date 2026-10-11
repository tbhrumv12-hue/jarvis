/**
 * ⚡ J.A.R.V.I.S // RESEARCH v1.1
 * Europe PMC + Gemini Analysis
 */

(function () {
    'use strict';

    // ==============================
    // 1. CONFIG
    // ==============================

    const CONFIG = {
        historyKey: 'jarvis_research_history_v1',
        maxHistory: 10,
    };

    // ==============================
    // 2. STATE
    // ==============================

    const state = {
        loading: false,
        query: '',
        history: [],
    };

    // ==============================
    // 3. UTILS
    // ==============================

    function $(sel) { return document.querySelector(sel); }

    function escapeHtml(s) {
        if (typeof s !== 'string') return '';
        return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function formatNumber(n) {
        if (n === null || n === undefined) return '0';
        return Number(n).toLocaleString('he-IL');
    }

    function formatYear(y) {
        if (!y) return '—';
        return String(y);
    }

    // ==============================
    // 4. STORAGE
    // ==============================

    function loadHistory() {
        try {
            const raw = localStorage.getItem(CONFIG.historyKey);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.slice(0, CONFIG.maxHistory);
        } catch (e) {
            return [];
        }
    }

    function saveHistory() {
        try {
            localStorage.setItem(CONFIG.historyKey, JSON.stringify(state.history.slice(0, CONFIG.maxHistory)));
        } catch (e) {
            console.warn('[research] save failed', e);
        }
    }

    function addToHistory(query) {
        const trimmed = String(query).trim();
        if (!trimmed) return;
        state.history = [trimmed, ...state.history.filter(q => q !== trimmed)].slice(0, CONFIG.maxHistory);
        saveHistory();
        renderHistory();
    }

    // ==============================
    // 5. UI TOGGLES
    // ==============================

    function setLoading(on) {
        state.loading = on;
        const loading = $('#loading');
        const results = $('#results');
        const errorBox = $('#error-box');
        const searchBtn = $('#search-btn');
        const searchInput = $('#search-input');

        if (loading) loading.hidden = !on;
        if (errorBox) errorBox.hidden = true;
        if (on && results) results.hidden = true;
        if (searchBtn) searchBtn.disabled = on;
        if (searchInput) searchInput.disabled = on;
    }

    function showError(msg) {
        const errorBox = $('#error-box');
        const errorText = $('#error-text');
        const loading = $('#loading');
        const results = $('#results');

        if (loading) loading.hidden = true;
        if (results) results.hidden = true;
        if (errorText) errorText.textContent = msg || 'שגיאה לא ידועה';
        if (errorBox) errorBox.hidden = false;
    }

    function hideError() {
        const errorBox = $('#error-box');
        if (errorBox) errorBox.hidden = true;
    }

    // ==============================
    // 6. RENDER
    // ==============================

    function renderResults(data) {
        const results = $('#results');
        if (!results) return;

        const verdictText = $('#verdict-text');
        if (verdictText) {
            verdictText.textContent = (data.summary && data.summary.verdict) || '—';
        }

        const summaryText = $('#summary-text');
        if (summaryText) {
            summaryText.textContent = (data.summary && data.summary.summary) || '—';
        }

        const mythCard = $('#myth-card');
        const mythText = $('#myth-text');
        if (data.summary && data.summary.myth && data.summary.myth.trim()) {
            if (mythText) mythText.textContent = data.summary.myth;
            if (mythCard) mythCard.hidden = false;
        } else {
            if (mythCard) mythCard.hidden = true;
        }

        renderPapers(data.papers || []);
                window.jarvisResearch = window.jarvisResearch || {};
        window.jarvisResearch.papers = data.papers || [];
        window.jarvisResearch.query = state.query || '';
        window.jarvisResearch.ready = true;

        const statsText = $('#stats-text');
        if (statsText) {
            const total = data.totalFound || (data.papers || []).length;
            const shown = (data.papers || []).length;
            const timeMs = data.searchTimeMs || 0;
            const timeSec = (timeMs / 1000).toFixed(1);
            statsText.textContent = `מצאתי ${total} מחקרים • מציג ${shown} • ${timeSec} שניות`;
        }

        results.hidden = false;

        setTimeout(function () {
            results.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }

    function renderPapers(papers) {
        const list = $('#papers-list');
        const count = $('#papers-count');
        if (!list) return;

        if (count) count.textContent = `(${papers.length})`;

        if (!papers.length) {
            list.innerHTML = '<div class="paper-card"><span class="paper-title">לא נמצאו מחקרים</span></div>';
            return;
        }

        const html = papers.map(function (p) {
            const safeTitle = escapeHtml(p.title || 'ללא כותרת');
            const safeUrl = escapeHtml(p.url || '#');
            const year = formatYear(p.year);
            const cited = p.citedBy || 0;

            const metaParts = [];
            if (year && year !== '—') metaParts.push(`<span class="paper-meta-item">📅 ${escapeHtml(year)}</span>`);
            if (cited > 0) metaParts.push(`<span class="paper-meta-item paper-citations">📚 ${formatNumber(cited)} ציטוטים</span>`);
            if (p.pmid) metaParts.push(`<span class="paper-meta-item">🆔 ${escapeHtml(p.pmid)}</span>`);

            const meta = metaParts.join('');

            return `
                <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="paper-card">
                    <span class="paper-link-icon">↗</span>
                    <span class="paper-title">${safeTitle}</span>
                    <div class="paper-meta">${meta}</div>
                </a>
            `;
        }).join('');

        list.innerHTML = html;
    }

    function renderHistory() {
        const section = $('#history-section');
        const list = $('#history-list');
        if (!section || !list) return;

        if (!state.history.length) {
            section.hidden = true;
            return;
        }

        section.hidden = false;

        list.innerHTML = state.history.map(function (q) {
            return `
                <button type="button" class="history-chip" data-query="${escapeHtml(q)}">
                    <span class="history-icon">🔍</span>
                    <span>${escapeHtml(q)}</span>
                </button>
            `;
        }).join('');

        list.querySelectorAll('.history-chip').forEach(function (chip) {
            chip.addEventListener('click', function () {
                const input = $('#search-input');
                if (input) {
                    input.value = chip.dataset.query;
                    input.focus();
                }
            });
        });
    }

    function clearResults() {
        const results = $('#results');
        if (results) results.hidden = true;
        hideError();
    }

    // ==============================
    // 7. SEARCH
    // ==============================

    async function performSearch(query) {
        if (state.loading) return;
        const trimmed = String(query || '').trim();
        if (!trimmed) return;

        state.query = trimmed;
        addToHistory(trimmed);
        setLoading(true);
        hideError();

        try {
            const res = await fetch('/api/research', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: trimmed }),
            });

            const data = await res.json().catch(function () { return {}; });

            if (!res.ok) {
                const errMsg = data.error || data.reply || `שגיאה ${res.status}`;
                showError(errMsg);
                return;
            }

            renderResults(data);

        } catch (err) {
            showError('שגיאה בחיבור לשרת: ' + err.message);
        } finally {
            setLoading(false);
        }
    }

    // ==============================
    // 8. EVENTS
    // ==============================

    function attachEvents() {
        const input = $('#search-input');
        const btn = $('#search-btn');
        const clearBtn = $('#btn-clear');

        if (btn) {
            btn.addEventListener('click', function () {
                const q = input ? input.value : '';
                if (q.trim()) performSearch(q);
            });
        }

        if (input) {
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const q = input.value;
                    if (q.trim()) performSearch(q);
                }
            });
        }

        // === Example chips — fill input only ===
        document.querySelectorAll('.example-chip').forEach(function (chip) {
            chip.addEventListener('click', function () {
                const q = chip.dataset.query || '';
                if (q && input) {
                    input.value = q;
                    input.focus();
                }
            });
        });

        // === Clear ===
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                if (input) input.value = '';
                clearResults();
                if (input) input.focus();
            });
        }
    }

    // ==============================
    // 9. INIT
    // ==============================

    function init() {
        state.history = loadHistory();
        attachEvents();
        renderHistory();
        console.info(`[research] initialized — ${state.history.length} history items`);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

})();