/* ═══════════════════════════════════════════════════════════════════
   J.A.R.V.I.S // RESEARCH CHAT — AI Analyst v2.0
   + Persistent history (JarvisChatHistory integration)
   + PDF export via print dialog
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ─────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────

    const MAX_HISTORY = 6;
    const MIN_QUERY_LENGTH = 2;
    const MAX_QUERY_LENGTH = 500;

    // ─────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────

    const state = {
        open: false,
        loading: false,
        history: [],
        papers: [],
        query: '',
        mode: 'hybrid',
    };

    // ─────────────────────────────────────────────────────────────
    // DOM helpers
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
        html = html.replace(/^\s*[-•]\s+(.+)$/gm, '<span class="chat-bullet">•</span> $1');
        html = html.replace(/\[(\d+)\]/g, '<span class="chat-citation">[$1]</span>');
        html = html.replace(/\n{2,}/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');
        return `<p>${html}</p>`;
    }

    // ─────────────────────────────────────────────────────────────
    // Sync papers from main research state
    // ─────────────────────────────────────────────────────────────

    function syncPapers() {
        const ref = window.jarvisResearch;
        if (!ref) return false;
        state.papers = Array.isArray(ref.papers) ? ref.papers : [];
        state.query = ref.query || '';
        return state.papers.length > 0;
    }

    // ─────────────────────────────────────────────────────────────
    // UI
    // ─────────────────────────────────────────────────────────────

    function updatePapersCount() {
        const el = $('chat-papers-count');
        if (el) el.textContent = state.papers.length;
    }

    function clearEmptyState() {
        const empty = document.querySelector('.chat-empty-state');
        if (empty) empty.remove();
    }

    function clearChatUI() {
        const container = $('chat-messages');
        if (!container) return;
        container.innerHTML = `
            <div class="chat-empty-state">
                <span class="chat-empty-icon">💬</span>
                <p class="chat-empty-title">שאל אותי על המחקרים</p>
                <p class="chat-empty-text">
                    לדוגמה: "מה המחקרים אומרים על מינון?" או "האם זה בטוח לצעירים?"
                </p>
            </div>
        `;
    }

    function renderUserMessage(text) {
        const container = $('chat-messages');
        if (!container) return;
        clearEmptyState();
        const div = document.createElement('div');
        div.className = 'chat-message chat-message-user';
        div.innerHTML = `<div class="chat-bubble">${escapeHtml(text)}</div>`;
        container.appendChild(div);
        scrollToBottom();
    }

    function renderLoading() {
        const container = $('chat-messages');
        if (!container) return;
        clearEmptyState();
        const div = document.createElement('div');
        div.className = 'chat-message chat-message-jarvis chat-message-loading';
        div.id = 'chat-loading-indicator';
        div.innerHTML = `
            <div class="chat-bubble">
                <div class="chat-typing">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;
        container.appendChild(div);
        scrollToBottom();
    }

    function removeLoading() {
        const el = $('chat-loading-indicator');
        if (el) el.remove();
    }

    function renderJarvisMessage(reply, usedPapers, latencyMs, mode) {
        const container = $('chat-messages');
        if (!container) return;
        removeLoading();

        const div = document.createElement('div');
        div.className = 'chat-message chat-message-jarvis';

        const bodyHtml = formatMarkdownLight(reply || '');

        let sourcesHtml = '';
        if (Array.isArray(usedPapers) && usedPapers.length > 0) {
            const items = usedPapers.map((p) => {
                const num = p.index || '';
                const title = escapeHtml(p.title || '');
                const source = escapeHtml(p.source || '');
                const year = escapeHtml(p.year || '');
                const url = escapeHtml(p.url || '#');
                const safeTarget = url && url !== '#' ? 'target="_blank" rel="noopener noreferrer"' : '';
                const meta = [source, year].filter(Boolean).join(' • ');
                return `
                    <a class="chat-source" href="${url}" ${safeTarget}>
                        <span class="chat-source-num">[${num}]</span>
                        <span class="chat-source-body">
                            <span class="chat-source-title">${title}</span>
                            ${meta ? `<span class="chat-source-meta">${meta}</span>` : ''}
                        </span>
                    </a>
                `;
            }).join('');

            sourcesHtml = `
                <details class="chat-sources">
                    <summary class="chat-sources-toggle">
                        📚 מחקרים שהשתמשתי בהם (${usedPapers.length})
                    </summary>
                    <div class="chat-sources-list">${items}</div>
                </details>
            `;
        }

        const latency = latencyMs ? `<span class="chat-latency">${(latencyMs / 1000).toFixed(1)}s</span>` : '';
        const modeLabel = mode === 'papers'
            ? '<span class="chat-mode-badge">📚 מחקרים בלבד</span>'
            : '<span class="chat-mode-badge">🧠 AI + מחקרים</span>';

        div.innerHTML = `
            <div class="chat-bubble">
                <div class="chat-bubble-body">${bodyHtml}</div>
                ${sourcesHtml}
                <div class="chat-meta">${modeLabel} ${latency}</div>
            </div>
        `;

        container.appendChild(div);
        scrollToBottom();
    }

    function renderErrorMessage(msg) {
        const container = $('chat-messages');
        if (!container) return;
        removeLoading();
        const div = document.createElement('div');
        div.className = 'chat-message chat-message-error';
        div.innerHTML = `<div class="chat-bubble">❌ ${escapeHtml(msg)}</div>`;
        container.appendChild(div);
        scrollToBottom();
    }

    function scrollToBottom() {
        const container = $('chat-messages');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    function setLoading(on) {
        state.loading = on;
        const btn = $('chat-send');
        const input = $('chat-input');
        if (btn) btn.disabled = on;
        if (input) input.disabled = on;
    }

    // ─────────────────────────────────────────────────────────────
    // Load a past conversation into the UI
    // ─────────────────────────────────────────────────────────────

    function loadConversationIntoUI(conv) {
        if (!conv) {
            // Called with null — reset to empty state
            state.history = [];
            clearChatUI();
            return;
        }

        // Reset UI
        clearChatUI();
        state.history = [];

        // Restore context
        if (Array.isArray(conv.papers) && conv.papers.length > 0) {
            state.papers = conv.papers;
        }
        if (conv.searchQuery) {
            state.query = conv.searchQuery;
        }
        if (conv.mode) {
            state.mode = conv.mode;
            // Update toggle buttons
            document.querySelectorAll('.chat-mode-btn').forEach((b) => {
                b.classList.toggle('active', b.getAttribute('data-mode') === conv.mode);
            });
        }

        updatePapersCount();

        // Render all messages
        for (const msg of (conv.messages || [])) {
            if (msg.role === 'user') {
                renderUserMessage(msg.content);
                state.history.push({ role: 'user', content: msg.content });
            } else if (msg.role === 'assistant') {
                renderJarvisMessage(
                    msg.content,
                    msg.usedPapers,
                    msg.latencyMs,
                    msg.mode
                );
                state.history.push({ role: 'assistant', content: msg.content });
            }
        }

        // Trim history to MAX_HISTORY
        if (state.history.length > MAX_HISTORY) {
            state.history = state.history.slice(-MAX_HISTORY);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Open / Close
    // ─────────────────────────────────────────────────────────────

    function openChat() {
        const modal = $('research-chat-modal');
        if (!modal) return;

        if (!syncPapers()) {
            alert('צריך לבצע חיפוש מחקרים לפני השיחה');
            return;
        }

        modal.hidden = false;
        state.open = true;
        updatePapersCount();

        // Ensure history context
        if (window.JarvisChatHistory) {
            window.JarvisChatHistory.ensureActive(state.papers, state.query, state.mode);
        }

        setTimeout(() => {
            const input = $('chat-input');
            if (input) input.focus();
        }, 100);

        document.body.style.overflow = 'hidden';
    }

    function closeChat() {
        const modal = $('research-chat-modal');
        if (!modal) return;
        modal.hidden = true;
        state.open = false;
        document.body.style.overflow = '';
    }

    // ─────────────────────────────────────────────────────────────
    // Send Message
    // ─────────────────────────────────────────────────────────────

    async function sendMessage(text) {
        const trimmed = String(text || '').trim();

        if (state.loading) return;

        if (trimmed.length < MIN_QUERY_LENGTH) {
            renderErrorMessage('השאלה קצרה מדי');
            return;
        }

        if (trimmed.length > MAX_QUERY_LENGTH) {
            renderErrorMessage(`השאלה ארוכה מדי (מקסימום ${MAX_QUERY_LENGTH} תווים)`);
            return;
        }

        if (!state.papers.length) {
            renderErrorMessage('אין מחקרים זמינים. בצע חיפוש קודם.');
            return;
        }

        // Ensure we have an active conversation before logging
        if (window.JarvisChatHistory) {
            window.JarvisChatHistory.ensureActive(state.papers, state.query, state.mode);
            window.JarvisChatHistory.addUserMessage(trimmed);
        }

        // Render
        renderUserMessage(trimmed);

        const input = $('chat-input');
        if (input) input.value = '';

        // Add to in-memory history
        state.history.push({ role: 'user', content: trimmed });
        if (state.history.length > MAX_HISTORY) {
            state.history = state.history.slice(-MAX_HISTORY);
        }

        setLoading(true);
        renderLoading();

        try {
            const res = await fetch('/api/research-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: trimmed,
                    papers: state.papers,
                    history: state.history.slice(0, -1),
                    mode: state.mode,
                }),
            });

            let payload = null;
            try {
                payload = await res.json();
            } catch (parseErr) {
                throw new Error(`תגובת שרת לא תקינה (${res.status})`);
            }

            if (!res.ok) {
                const msg = payload?.error || payload?.reply || `שגיאה ${res.status}`;
                throw new Error(msg);
            }

            if (!payload?.reply) {
                throw new Error('תגובת שרת חסרה שדה reply');
            }

            renderJarvisMessage(
                payload.reply,
                payload.usedPapers,
                payload.latencyMs,
                payload.mode
            );

            // Save to persistent history
            if (window.JarvisChatHistory) {
                window.JarvisChatHistory.addAssistantMessage(
                    payload.reply,
                    payload.usedPapers,
                    payload.mode || state.mode,
                    payload.latencyMs || 0
                );
            }

            state.history.push({ role: 'assistant', content: payload.reply });
            if (state.history.length > MAX_HISTORY) {
                state.history = state.history.slice(-MAX_HISTORY);
            }
        } catch (err) {
            console.error('[research-chat] failed:', err);
            renderErrorMessage(err.message || 'שגיאה בשליחת ההודעה');
            state.history = state.history.slice(0, -1);
        } finally {
            setLoading(false);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Bind
    // ─────────────────────────────────────────────────────────────

    function bind() {
        const openBtn = $('btn-research-chat');
        if (openBtn) openBtn.addEventListener('click', openChat);

        document.querySelectorAll('[data-close-chat]').forEach((el) => {
            el.addEventListener('click', closeChat);
        });

        const form = $('chat-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const input = $('chat-input');
                if (input) sendMessage(input.value);
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && state.open) {
                closeChat();
            }
        });

        document.querySelectorAll('.chat-mode-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const newMode = btn.getAttribute('data-mode');
                if (!newMode) return;
                state.mode = newMode;
                document.querySelectorAll('.chat-mode-btn').forEach((b) => {
                    b.classList.toggle('active', b.getAttribute('data-mode') === newMode);
                });
                // Update conversation mode
                if (window.JarvisChatHistory) {
                    const conv = window.JarvisChatHistory.getActiveConversation();
                    if (conv) {
                        conv.mode = newMode;
                    }
                }
                console.log('[research-chat] mode:', newMode);
            });
        });
    }

    // ─────────────────────────────────────────────────────────────
    // Init
    // ─────────────────────────────────────────────────────────────

    function init() {
        try {
            bind();

            // Register history callback
            if (window.JarvisChatHistory) {
                window.JarvisChatHistory.setOnLoad(loadConversationIntoUI);
                console.log('[research-chat] history hook registered');
            } else {
                console.warn('[research-chat] JarvisChatHistory not found — history disabled');
            }

            console.log('[research-chat] ready');
        } catch (err) {
            console.error('[research-chat] init failed:', err);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();