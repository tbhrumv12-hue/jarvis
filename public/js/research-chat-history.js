/* ═══════════════════════════════════════════════════════════════════
   J.A.R.V.I.S // RESEARCH CHAT HISTORY v1.0
   Conversation storage + PDF export via print dialog
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ─────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────

    const STORAGE_KEY = 'jarvis_research_chat_history_v1';
    const MAX_CONVERSATIONS = 20;
    const MAX_PAPERS_STORED = 100;
    const TITLE_MAX_LENGTH = 60;

    // ─────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────

    const state = {
        conversations: [],
        activeId: null,
        onLoad: null, // callback set by research-chat.js
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

    function generateId() {
        return 'conv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function formatRelativeTime(ts) {
        const diff = Date.now() - ts;
        const sec = Math.floor(diff / 1000);
        const min = Math.floor(sec / 60);
        const hr = Math.floor(min / 60);
        const day = Math.floor(hr / 24);

        if (sec < 60) return 'הרגע';
        if (min < 60) return `לפני ${min} דק׳`;
        if (hr < 24) return `לפני ${hr} שע׳`;
        if (day < 7) return `לפני ${day} ימים`;
        const d = new Date(ts);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    function truncateTitle(text) {
        const s = String(text || '').trim().replace(/\s+/g, ' ');
        if (s.length <= TITLE_MAX_LENGTH) return s;
        return s.substring(0, TITLE_MAX_LENGTH - 1) + '…';
    }

    // ─────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────

    function loadFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.conversations)) return [];
            return parsed.conversations;
        } catch (err) {
            console.warn('[chat-history] load failed:', err);
            return [];
        }
    }

    function saveToStorage() {
        try {
            const payload = {
                version: 1,
                conversations: state.conversations,
                savedAt: Date.now(),
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
            return true;
        } catch (err) {
            console.warn('[chat-history] save failed:', err);
            if (err.name === 'QuotaExceededError') {
                // Try removing oldest conversations and retry
                if (state.conversations.length > 5) {
                    state.conversations = state.conversations.slice(0, 5);
                    try {
                        localStorage.setItem(STORAGE_KEY, JSON.stringify({
                            version: 1,
                            conversations: state.conversations,
                            savedAt: Date.now(),
                        }));
                        return true;
                    } catch (e) {
                        console.error('[chat-history] still failed after cleanup');
                    }
                }
            }
            return false;
        }
    }

    function getConversationById(id) {
        return state.conversations.find((c) => c.id === id) || null;
    }

    // ─────────────────────────────────────────────────────────────
    // Papers — keep only essentials when storing
    // ─────────────────────────────────────────────────────────────

    function compactPapers(papers) {
        if (!Array.isArray(papers)) return [];
        return papers.slice(0, MAX_PAPERS_STORED).map((p) => ({
            title: p.title || '',
            source: p.source || '',
            year: p.year || '',
            url: p.url || '',
            doi: p.doi || '',
            abstract: p.abstract ? String(p.abstract).substring(0, 600) : '',
            citedBy: p.citedBy || 0,
        }));
    }

    // ─────────────────────────────────────────────────────────────
    // API — called by research-chat.js
    // ─────────────────────────────────────────────────────────────

    function ensureActive(papers, searchQuery, mode) {
        if (state.activeId) {
            const existing = getConversationById(state.activeId);
            if (existing) return existing;
        }

        // Create new conversation
        const conv = {
            id: generateId(),
            title: 'שיחה חדשה',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            searchQuery: searchQuery || '',
            papersCount: Array.isArray(papers) ? papers.length : 0,
            mode: mode || 'hybrid',
            papers: compactPapers(papers || []),
            messages: [],
        };

        state.conversations.unshift(conv);
        state.activeId = conv.id;

        // Enforce limit
        if (state.conversations.length > MAX_CONVERSATIONS) {
            state.conversations = state.conversations.slice(0, MAX_CONVERSATIONS);
        }

        saveToStorage();
        renderSidebar();
        return conv;
    }

    function addUserMessage(text) {
        const conv = getConversationById(state.activeId);
        if (!conv) return;

        conv.messages.push({
            role: 'user',
            content: String(text || ''),
            time: Date.now(),
        });

        // Update title if this is the first user message
        if (conv.messages.filter((m) => m.role === 'user').length === 1) {
            conv.title = truncateTitle(text);
        }

        conv.updatedAt = Date.now();
        saveToStorage();
        renderSidebar();
    }

    function addAssistantMessage(reply, usedPapers, mode, latencyMs) {
        const conv = getConversationById(state.activeId);
        if (!conv) return;

        conv.messages.push({
            role: 'assistant',
            content: String(reply || ''),
            usedPapers: Array.isArray(usedPapers) ? usedPapers.slice(0, 25) : [],
            mode: mode || 'hybrid',
            latencyMs: latencyMs || 0,
            time: Date.now(),
        });

        conv.updatedAt = Date.now();
        saveToStorage();
        renderSidebar();
    }

    function startNewConversation() {
        state.activeId = null;
        renderSidebar();
        // The chat module should clear messages when this is called
    }

    function setContext(papers, searchQuery, mode) {
        // Called by research-chat.js when opening the modal
        // Ensures we have an active conversation that matches the current context
        if (state.activeId) {
            const conv = getConversationById(state.activeId);
            if (conv && conv.messages.length === 0) {
                // Empty conversation — update its context
                conv.searchQuery = searchQuery || conv.searchQuery;
                conv.papersCount = Array.isArray(papers) ? papers.length : conv.papersCount;
                conv.papers = compactPapers(papers || []);
                conv.mode = mode || conv.mode;
                saveToStorage();
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Load a conversation from history
    // ─────────────────────────────────────────────────────────────

    function loadConversation(id) {
        const conv = getConversationById(id);
        if (!conv) return;

        state.activeId = id;
        renderSidebar();

        if (typeof state.onLoad === 'function') {
            try {
                state.onLoad(conv);
            } catch (err) {
                console.error('[chat-history] onLoad callback failed:', err);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Delete
    // ─────────────────────────────────────────────────────────────

    function deleteConversation(id) {
        const idx = state.conversations.findIndex((c) => c.id === id);
        if (idx === -1) return;

        state.conversations.splice(idx, 1);

        if (state.activeId === id) {
            state.activeId = null;
            // The chat module should clear if current was deleted
            if (typeof state.onLoad === 'function') {
                try {
                    state.onLoad(null);
                } catch (err) {
                    console.error('[chat-history] onLoad(null) failed:', err);
                }
            }
        }

        saveToStorage();
        renderSidebar();
    }

    // ─────────────────────────────────────────────────────────────
    // Render Sidebar
    // ─────────────────────────────────────────────────────────────

    function renderSidebar() {
        const list = $('chat-history-list');
        const countEl = $('chat-history-count');
        if (!list) return;

        if (countEl) countEl.textContent = state.conversations.length;

        if (!state.conversations.length) {
            list.innerHTML = `
                <div class="chat-history-empty">
                    <div style="font-size: 24px; margin-bottom: 8px; opacity: 0.5;">📭</div>
                    אין שיחות שמורות עדיין
                </div>
            `;
            return;
        }

        list.innerHTML = state.conversations.map((conv) => {
            const isActive = conv.id === state.activeId ? ' active' : '';
            const msgCount = conv.messages.length;
            const time = formatRelativeTime(conv.updatedAt);
            return `
                <div class="chat-history-item${isActive}" data-conv-id="${escapeHtml(conv.id)}">
                    <div class="chat-history-item-title">${escapeHtml(conv.title)}</div>
                    <div class="chat-history-item-meta">
                        <span>${time}</span>
                        <span>${msgCount} הודעות</span>
                    </div>
                    <button type="button" class="chat-history-item-delete" data-delete-id="${escapeHtml(conv.id)}" aria-label="מחק">✕</button>
                </div>
            `;
        }).join('');

        // Bind item clicks
        list.querySelectorAll('.chat-history-item').forEach((item) => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('[data-delete-id]')) return; // ignore delete clicks
                const id = item.getAttribute('data-conv-id');
                if (id) loadConversation(id);
            });
        });

        // Bind delete buttons
        list.querySelectorAll('[data-delete-id]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-delete-id');
                if (!id) return;
                if (confirm('למחוק את השיחה?')) {
                    deleteConversation(id);
                }
            });
        });
    }

    // ─────────────────────────────────────────────────────────────
    // Sidebar Toggle
    // ─────────────────────────────────────────────────────────────

    function toggleSidebar() {
        const sidebar = $('chat-history-sidebar');
        if (!sidebar) return;
        sidebar.hidden = !sidebar.hidden;
        if (!sidebar.hidden) {
            renderSidebar();
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Export PDF (via print dialog)
    // ─────────────────────────────────────────────────────────────

    function exportToPDF() {
        const modal = $('research-chat-modal');
        if (!modal || modal.hidden) {
            alert('פתח קודם את הצ\'אט');
            return;
        }

        const messages = $('chat-messages');
        if (!messages || messages.children.length === 0) {
            alert('אין תוכן לייצא');
            return;
        }

        // Give the browser a moment to apply print CSS, then print
        setTimeout(() => {
            window.print();
        }, 100);
    }

    // ─────────────────────────────────────────────────────────────
    // Bind UI
    // ─────────────────────────────────────────────────────────────

    function bind() {
        const toggleBtn = $('chat-history-toggle');
        if (toggleBtn) toggleBtn.addEventListener('click', toggleSidebar);

        const newBtn = $('chat-new');
        if (newBtn) {
            newBtn.addEventListener('click', () => {
                if (confirm('להתחיל שיחה חדשה? ההיסטוריה הנוכחית תישמר.')) {
                    startNewConversation();
                    if (typeof state.onLoad === 'function') {
                        try { state.onLoad(null); } catch (e) { /* ignore */ }
                    }
                }
            });
        }

        const exportBtn = $('chat-export');
        if (exportBtn) exportBtn.addEventListener('click', exportToPDF);
    }

    // ─────────────────────────────────────────────────────────────
    // Init
    // ─────────────────────────────────────────────────────────────

    function init() {
        try {
            state.conversations = loadFromStorage();
            bind();
            renderSidebar();
            console.log('[chat-history] ready —', state.conversations.length, 'conversations loaded');
        } catch (err) {
            console.error('[chat-history] init failed:', err);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────

    window.JarvisChatHistory = {
        // Storage API
        ensureActive: ensureActive,
        addUserMessage: addUserMessage,
        addAssistantMessage: addAssistantMessage,
        startNewConversation: startNewConversation,
        setContext: setContext,

        // Load / delete
        loadConversation: loadConversation,
        deleteConversation: deleteConversation,

        // UI
        toggleSidebar: toggleSidebar,
        exportToPDF: exportToPDF,

        // Introspection
        getConversations: () => state.conversations.slice(),
        getActiveId: () => state.activeId,
        getActiveConversation: () => getConversationById(state.activeId),

        // Callback registration (used by research-chat.js)
        setOnLoad: (fn) => { state.onLoad = fn; },
    };

    // Ready check
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();