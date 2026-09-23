/**
 * ⚡ J.A.R.V.I.S // CLIENT CORE v3.3
 * Cinematic HUD + History + Mic (mobile-fixed) + Camera + Vision + TTS
 */

(function () {
    'use strict';

    // ==============================
    // 1. CONFIG
    // ==============================

    const CONFIG = {
        metricsPollIntervalMs: 3000,
        metricsFailureThreshold: 3,
        ttsRate: 1.0,
        ttsPitch: 0.9,
        ttsVolume: 1.0,
        hebrewLangCodes: ['he-IL', 'he'],
        speechLang: 'he-IL',
        speechInterimResults: true,
        speechContinuous: true,
        speechAutoSendDelayMs: 900,
        speechSafetyTimeoutMs: 8000,
        speechRestartDelayMs: 300,
        speechSilenceTimeoutMs: 2500,
        visionFrameWidth: 640,
        visionFrameHeight: 480,
        visionJpegQuality: 0.85,
        typingCharsPerSecond: 100,
        typingMinDelayMs: 8,
        typingSkipThresholdChars: 300,
        micSpectrumBars: 24,
        maxHistoryMessages: 12,
        maxHistoryMessagesSent: 12,
        maxHistoryCharsPerMessage: 2000,
        historyStorageKey: 'jarvis_history_v1',
        ttsStorageKey: 'jarvis_tts_enabled_v1',
        welcomeMessage: 'מערכת המוח הנוירונלי אותחלה בהצלחה. כל המערכות פועלות בקיבולת מלאה. במה אוכל לסייע לך, אדוני?',
        isMobile: window.innerWidth <= 768,
    };

    const VISION_KEYWORDS = [
        'רואה', 'רואה אותי', 'מסתכל', 'תסתכל', 'תראה', 'מה אתה רואה',
        'תמונה', 'מצלמה', 'חיישן', 'חיישנים', 'וידאו', 'מצולם',
        'תזהה', 'מה יש פה', 'מה יש כאן', 'תאר', 'תתאר',
        'what do you see', 'look at', 'camera', 'see me',
    ];

    const RATE_LIMIT_MESSAGE = 'אדון, מערכות הליבה שלי הגיעו למכסת השימוש החינמית לרגע זה. אנא המתן כחצי דקה ונסה שוב.';

    // ==============================
    // 2. STATE
    // ==============================

    const state = {
        bootTime: Date.now(),
        isSending: false,
        ttsEnabled: true,
        metricsFailures: 0,
        metricsTimer: null,
        voiceLoaded: false,
        hebrewVoice: null,
        isOnline: true,

        // History
        history: [],
        historySearchQuery: '',
        autoScroll: true,

        // Mic
        recognition: null,
        isListening: false,
        recognitionSupported: false,
        autoSendTimer: null,
        micSafetyTimer: null,
        micSilenceTimer: null,
        lastSpeechAt: 0,
        micStartTime: 0,
        micTimerInterval: null,
        micAudioCtx: null,
        micAnalyser: null,
        micStream: null,
        micSpectrumRAF: null,
        micManualStop: false,

        // Camera
        cameraStream: null,
        isCameraOn: false,
        cameraSupported: false,
        cameraFpsRAF: null,
        cameraFrameCount: 0,
        cameraLastFpsUpdate: 0,
        cameraFps: 0,

        // Vision
        isAnalyzing: false,

        // Typing
        typingTimer: null,
        typingActive: false,

        loadValue: 0,
    };

    // ==============================
    // 3. DOM refs
    // ==============================

    let el = {};

    function cacheDomRefs() {
        el = {
            chatLog: document.getElementById('chat-log'),
            chatForm: document.getElementById('chat-form'),
            userInput: document.getElementById('user-input'),
            sendBtn: document.getElementById('send-btn'),
            coreStatus: document.getElementById('core-status'),
            linkStatus: document.getElementById('link-status'),
            latencyStatus: document.getElementById('latency-status'),
            avgLatencyStatus: document.getElementById('avg-latency-status'),
            historyCount: document.getElementById('history-count'),
            clockEl: document.getElementById('clock'),
            uptimeStat: document.getElementById('uptime-stat'),
            typingIndicator: document.getElementById('typing-indicator'),
            progressBar: document.getElementById('progress-bar'),
            errorBanner: document.getElementById('error-banner'),
            errorText: document.getElementById('error-text'),
            errorDismiss: document.getElementById('error-dismiss'),
            ttsToggle: document.getElementById('tts-toggle'),
            metricRequests: document.getElementById('metric-requests'),
            metricErrors: document.getElementById('metric-errors'),
            metricModel: document.getElementById('metric-model'),
            loadFill: document.getElementById('load-fill'),
            micBtn: document.getElementById('mic-btn'),
            micStatus: document.getElementById('mic-status'),
            micStatusText: document.getElementById('mic-status-text'),
            micTimer: document.getElementById('mic-timer'),
            micSpectrum: document.getElementById('mic-spectrum'),
            cameraBtn: document.getElementById('camera-btn'),
            cameraFeed: document.getElementById('camera-feed'),
            cameraStatusText: document.getElementById('camera-status-text'),
            cameraFps: document.getElementById('camera-fps'),
            cameraRes: document.getElementById('camera-res'),
            cameraScanRing: document.getElementById('camera-scan-ring'),
            sidebarBrain: document.getElementById('sidebar-brain'),
            sidebarCamera: document.getElementById('sidebar-camera'),
            visionBtn: document.getElementById('vision-btn'),
            sysTemp: document.getElementById('sys-temp'),
            sysMem: document.getElementById('sys-mem'),
            sysPwr: document.getElementById('sys-pwr'),
            historyBtn: document.getElementById('history-btn'),
            historyModal: document.getElementById('history-modal'),
            historyBackdrop: document.getElementById('history-backdrop'),
            historyClose: document.getElementById('history-close'),
            historyClear: document.getElementById('history-clear'),
            historyExport: document.getElementById('history-export'),
            historyNew: document.getElementById('history-new'),
            historySearch: document.getElementById('history-search'),
            historyList: document.getElementById('history-list'),
            historyStats: document.getElementById('history-stats'),
        };
    }

    function requiredRefsExist() {
        return el.chatLog && el.chatForm && el.userInput && el.sendBtn;
    }

    // ==============================
    // 4. Utils
    // ==============================

    function pad2(n) { return String(n).padStart(2, '0'); }

    function formatUptime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
    }

    function formatTime(date) {
        return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
    }

    function formatMessageIndex(n) { return String(n).padStart(3, '0'); }

    function setText(node, text) { if (node) node.textContent = text; }
    function setClass(node, cls) { if (node) node.className = cls; }

    function containsVisionKeyword(text) {
        if (!text) return false;
        const lower = text.toLowerCase();
        return VISION_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
    }

    function flipNumber(node, newText) {
        if (!node) return;
        if (node.textContent === newText) return;
        node.classList.remove('flipping');
        void node.offsetWidth;
        node.classList.add('flipping');
        setTimeout(() => { node.textContent = newText; }, 200);
    }

    function isRateLimitText(text) {
        if (!text || typeof text !== 'string') return false;
        const lower = text.toLowerCase();
        return (
            lower.includes('quota') ||
            lower.includes('rate limit') ||
            lower.includes('exceeded') ||
            lower.includes('resource_exhausted') ||
            lower.includes('מכסת השימוש')
        );
    }

    function cleanReplyText(raw) {
        if (!raw || typeof raw !== 'string') return '';
        const trimmed = raw.trim();
        if (isRateLimitText(trimmed)) return RATE_LIMIT_MESSAGE;
        return trimmed;
    }

    // ==============================
    // 5. HISTORY
    // ==============================

    function loadHistoryFromStorage() {
        try {
            const raw = localStorage.getItem(CONFIG.historyStorageKey);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter((m) => m && typeof m === 'object' && (m.role === 'user' || m.role === 'jarvis') && typeof m.text === 'string')
                .slice(-200);
        } catch (e) {
            console.warn('[history] load failed', e);
            return [];
        }
    }

    function saveHistoryToStorage() {
        try {
            const toSave = state.history.slice(-200);
            localStorage.setItem(CONFIG.historyStorageKey, JSON.stringify(toSave));
        } catch (e) {
            console.warn('[history] save failed', e);
        }
    }

    function appendToHistory(role, text) {
        if (!text || typeof text !== 'string') return;
        state.history.push({
            role,
            text: text.trim(),
            ts: Date.now(),
        });
        saveHistoryToStorage();
        updateHistoryCount();
    }

    function clearHistory() {
        state.history = [];
        saveHistoryToStorage();
        updateHistoryCount();
        renderHistoryList();
    }

    function updateHistoryCount() {
        setText(el.historyCount, String(state.history.length));
    }

    // ==============================
    // 6. Rendering — messages
    // ==============================

    function createMessageElement(role, text, ts, options) {
        const opts = options || {};
        const wrapper = document.createElement('div');
        wrapper.className = `msg ${role}`;

        const meta = document.createElement('span');
        meta.className = 'msg-meta';

        const lineSpan = document.createElement('span');
        lineSpan.className = 'msg-line';
        lineSpan.textContent = formatMessageIndex(opts.index || 0);

        const tag = document.createElement('span');
        tag.className = 'msg-tag';
        tag.textContent = role === 'user' ? 'USER' : 'J.A.R.V.I.S';

        const timeSpan = document.createElement('span');
        timeSpan.className = 'msg-time';
        timeSpan.textContent = formatTime(new Date(ts || Date.now()));

        meta.appendChild(lineSpan);
        meta.appendChild(tag);
        meta.appendChild(timeSpan);

        const body = document.createElement('span');
        body.className = 'body';
        if (opts.typing) body.textContent = '';
        else body.textContent = text;

        const actions = document.createElement('span');
        actions.className = 'msg-actions';
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'msg-action-btn';
        copyBtn.setAttribute('aria-label', 'העתק הודעה');
        copyBtn.textContent = '📋';
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            copyToClipboard(text, copyBtn);
        });
        actions.appendChild(copyBtn);

        wrapper.appendChild(actions);
        wrapper.appendChild(meta);
        wrapper.appendChild(body);

        return { wrapper, body };
    }

    function appendMessageToDOM(role, text, ts, options) {
        if (!el.chatLog) return null;
        const opts = options || {};
        const { wrapper, body } = createMessageElement(role, text, ts, opts);
        el.chatLog.appendChild(wrapper);

        if (state.autoScroll) {
            requestAnimationFrame(() => {
                if (el.chatLog && state.autoScroll) {
                    el.chatLog.scrollTop = el.chatLog.scrollHeight;
                }
            });
        }

        if (opts.typing && text) {
            typeText(body, text);
        }

        return wrapper;
    }

    function renderFullHistory() {
        if (!el.chatLog) return;
        el.chatLog.innerHTML = '';

        if (state.history.length === 0) {
            appendMessageToDOM('jarvis', CONFIG.welcomeMessage, Date.now(), { index: 1 });
            return;
        }

        let i = 1;
        for (const m of state.history) {
            appendMessageToDOM(m.role, m.text, m.ts, { index: i });
            i++;
        }
        requestAnimationFrame(() => {
            if (el.chatLog) el.chatLog.scrollTop = el.chatLog.scrollHeight;
        });
    }

    function appendMessage(role, text, options) {
        appendToHistory(role, text);
        const index = state.history.length;
        return appendMessageToDOM(role, text, Date.now(), { ...(options || {}), index });
    }

    // ==============================
    // 7. Typing effect
    // ==============================

    function typeText(node, fullText) {
        if (!node) return;
        if (state.typingTimer) {
            clearInterval(state.typingTimer);
            state.typingTimer = null;
        }
        state.typingActive = true;

        if (fullText.length > CONFIG.typingSkipThresholdChars) {
            node.textContent = fullText;
            state.typingActive = false;
            if (el.chatLog && state.autoScroll) el.chatLog.scrollTop = el.chatLog.scrollHeight;
            return;
        }

        const delay = Math.max(CONFIG.typingMinDelayMs, Math.round(1000 / CONFIG.typingCharsPerSecond));
        let i = 0;

        state.typingTimer = setInterval(() => {
            i++;
            node.textContent = fullText.substring(0, i);
            if (i % 4 === 0 && el.chatLog && state.autoScroll) {
                el.chatLog.scrollTop = el.chatLog.scrollHeight;
            }
            if (i >= fullText.length) {
                clearInterval(state.typingTimer);
                state.typingTimer = null;
                state.typingActive = false;
                if (el.chatLog && state.autoScroll) el.chatLog.scrollTop = el.chatLog.scrollHeight;
            }
        }, delay);
    }

    // ==============================
    // 8. Copy
    // ==============================

    async function copyToClipboard(text, btn) {
        if (!text) return;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            if (btn) {
                btn.classList.add('copied');
                const original = btn.textContent;
                btn.textContent = '✓';
                setTimeout(() => {
                    btn.classList.remove('copied');
                    btn.textContent = original;
                }, 1200);
            }
        } catch (e) {
            console.warn('[copy] failed', e);
        }
    }

    // ==============================
    // 9. TTS
    // ==============================

    function pickHebrewVoice() {
        if (!('speechSynthesis' in window)) return null;
        const voices = window.speechSynthesis.getVoices();
        if (!voices || voices.length === 0) return null;
        for (const code of CONFIG.hebrewLangCodes) {
            const v = voices.find((x) => x.lang === code);
            if (v) return v;
        }
        return voices.find((v) => /^he/i.test(v.lang)) || null;
    }

    function loadVoices() {
        if (!('speechSynthesis' in window)) return;
        const tryLoad = () => {
            const v = pickHebrewVoice();
            if (v) {
                state.hebrewVoice = v;
                state.voiceLoaded = true;
                console.info(`[tts] voice loaded: ${v.name} (${v.lang})`);
            }
        };
        tryLoad();
        window.speechSynthesis.onvoiceschanged = tryLoad;
        // באנדרואיד לפעמים טעינת הקולות איטית
        setTimeout(tryLoad, 500);
        setTimeout(tryLoad, 1500);
    }

    function speak(text) {
        if (!state.ttsEnabled) return;
        if (!('speechSynthesis' in window)) return;
        if (!text || typeof text !== 'string') return;

        try {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text);
            u.lang = state.hebrewVoice ? state.hebrewVoice.lang : 'he-IL';
            u.rate = CONFIG.ttsRate;
            u.pitch = CONFIG.ttsPitch;
            u.volume = CONFIG.ttsVolume;
            if (state.hebrewVoice) u.voice = state.hebrewVoice;
            u.onerror = (e) => {
                if (e.error && e.error !== 'interrupted' && e.error !== 'canceled') {
                    console.warn('[tts]', e.error);
                }
            };
            window.speechSynthesis.speak(u);
        } catch (e) {}
    }

    function toggleTts() {
        state.ttsEnabled = !state.ttsEnabled;
        try { localStorage.setItem(CONFIG.ttsStorageKey, String(state.ttsEnabled)); } catch (e) {}
        applyTtsUI();
        if (!state.ttsEnabled && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    }

    function applyTtsUI() {
        if (el.ttsToggle) {
            el.ttsToggle.textContent = state.ttsEnabled ? '🔊' : '🔇';
            el.ttsToggle.setAttribute('aria-pressed', String(!state.ttsEnabled));
            el.ttsToggle.setAttribute('aria-label', state.ttsEnabled ? 'השתק קול' : 'הפעל קול');
        }
    }

    // ==============================
    // 10. Neural bridge
    // ==============================

    function pulseNeural(count) {
        if (window.JarvisNeural && typeof window.JarvisNeural.pulseMany === 'function') {
            try { window.JarvisNeural.pulseMany(count); } catch (e) {}
        }
    }

    // ==============================
    // 11. Clock + Footer
    // ==============================

    function tickClock() {
        const now = new Date();
        setText(el.clockEl, formatTime(now));
        const elapsed = Math.floor((Date.now() - state.bootTime) / 1000);
        setText(el.uptimeStat, formatUptime(elapsed));
    }

    function updateFooterStats() {
        const lat = state.loadValue;
        const temp = Math.round(38 + (lat / 10000) * 40);
        setText(el.sysTemp, `${temp}°C`);
        if (el.sysTemp) {
            el.sysTemp.classList.toggle('warning', temp > 65);
            el.sysTemp.classList.toggle('ok', temp <= 50);
        }

        const mem = Math.min(95, 24 + state.history.length);
        setText(el.sysMem, `${mem}%`);
        if (el.sysMem) {
            el.sysMem.classList.toggle('warning', mem > 80);
            el.sysMem.classList.toggle('ok', mem < 60);
        }

        const pwr = state.isOnline ? 'NOMINAL' : 'DEGRADED';
        setText(el.sysPwr, pwr);
        if (el.sysPwr) {
            el.sysPwr.classList.toggle('ok', state.isOnline);
            el.sysPwr.classList.toggle('warning', !state.isOnline);
        }
    }

    function setLoadBar(ms) {
        state.loadValue = ms;
        if (!el.loadFill) return;
        const pct = Math.min(100, Math.round((ms / 8000) * 100));
        el.loadFill.style.width = pct + '%';
    }

    // ==============================
    // 12. Status
    // ==============================

    function setOnline() {
        if (state.isOnline) return;
        state.isOnline = true;
        setText(el.linkStatus, 'מקוון');
        setClass(el.linkStatus, 'stat-value status-online');
        if (!state.isCameraOn) setText(el.coreStatus, 'מצב: סנכרון מוחי פעיל');
        hideError();
    }

    function setOffline() {
        if (!state.isOnline) return;
        state.isOnline = false;
        setText(el.linkStatus, 'מנותק');
        setClass(el.linkStatus, 'stat-value status-offline');
        setText(el.coreStatus, 'מצב: ניתוק מהליבה');
        showError('חיבור לליבה אבד — מנסה להתחבר מחדש');
    }

    // ==============================
    // 13. Error banner
    // ==============================

    function showError(message) {
        if (!el.errorBanner || !el.errorText) return;
        el.errorText.textContent = message;
        el.errorBanner.hidden = false;
        void el.errorBanner.offsetHeight;
        el.errorBanner.classList.add('visible');
    }

    function hideError() {
        if (!el.errorBanner) return;
        el.errorBanner.classList.remove('visible');
        setTimeout(() => { if (el.errorBanner) el.errorBanner.hidden = true; }, 350);
    }

    function showTyping() {
        if (el.typingIndicator) el.typingIndicator.hidden = false;
        if (el.progressBar) el.progressBar.hidden = false;
    }
    function hideTyping() {
        if (el.typingIndicator) el.typingIndicator.hidden = true;
        if (el.progressBar) el.progressBar.hidden = true;
    }

    // ==============================
    // 14. Metrics polling
    // ==============================

    async function fetchMetrics() {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4000);
            const res = await fetch('/api/metrics', { signal: controller.signal, cache: 'no-store' });
            clearTimeout(timeout);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            state.metricsFailures = 0;
            setOnline();

            const lat = Number(data.latencyMs) || 0;
            const avg = Number(data.avgLatencyMs) || 0;
            flipNumber(el.latencyStatus, lat > 0 ? `${lat} ms` : '-- ms');
            flipNumber(el.avgLatencyStatus, avg > 0 ? `${avg} ms` : '-- ms');
            setText(el.metricRequests, String(data.totalRequests ?? 0));
            setText(el.metricErrors, String(data.totalErrors ?? 0));
            if (data.model) setText(el.metricModel, data.model);
            setLoadBar(lat);
            updateFooterStats();
        } catch (err) {
            state.metricsFailures += 1;
            if (state.metricsFailures >= CONFIG.metricsFailureThreshold) setOffline();
        }
    }

    function startMetricsPolling() {
        if (state.metricsTimer) clearInterval(state.metricsTimer);
        fetchMetrics();
        state.metricsTimer = setInterval(fetchMetrics, CONFIG.metricsPollIntervalMs);
    }

    // ==============================
    // 15. History Modal
    // ==============================

    function openHistoryModal() {
        if (!el.historyModal) return;
        renderHistoryList();
        el.historyModal.hidden = false;
        if (el.historySearch) {
            el.historySearch.value = '';
            state.historySearchQuery = '';
            setTimeout(() => el.historySearch.focus(), 100);
        }
    }

    function closeHistoryModal() {
        if (!el.historyModal) return;
        el.historyModal.hidden = true;
    }

    function renderHistoryList() {
        if (!el.historyList) return;
        const q = (state.historySearchQuery || '').toLowerCase().trim();
        const filtered = q
            ? state.history.filter((m) => m.text.toLowerCase().includes(q))
            : state.history;

        el.historyList.innerHTML = '';

        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'history-item';
            empty.style.textAlign = 'center';
            empty.style.color = 'var(--text-dim)';
            empty.style.padding = '30px';
            empty.textContent = q ? 'לא נמצאו תוצאות' : 'אין הודעות עדיין';
            el.historyList.appendChild(empty);
        } else {
            const reversed = filtered.slice().reverse();
            for (const m of reversed) {
                const item = document.createElement('div');
                item.className = `history-item ${m.role}`;

                const meta = document.createElement('div');
                meta.className = 'history-meta';

                const role = document.createElement('span');
                role.className = 'role';
                role.textContent = m.role === 'user' ? 'USER' : 'J.A.R.V.I.S';

                const time = document.createElement('span');
                time.textContent = formatTime(new Date(m.ts));

                meta.appendChild(role);
                meta.appendChild(time);

                const txt = document.createElement('div');
                txt.className = 'history-text';
                txt.textContent = m.text;

                item.appendChild(meta);
                item.appendChild(txt);
                el.historyList.appendChild(item);
            }
        }

        setText(el.historyStats, `${filtered.length} הודעות`);
    }

    function handleHistorySearchInput(e) {
        state.historySearchQuery = e.target.value || '';
        renderHistoryList();
    }

    function exportHistory() {
        if (!state.history.length) {
            alert('אין היסטוריה לייצוא');
            return;
        }
        const lines = state.history.map((m) => {
            const t = formatTime(new Date(m.ts));
            const role = m.role === 'user' ? 'USER' : 'J.A.R.V.I.S';
            return `[${t}] ${role}:\n${m.text}`;
        });
        const text = `J.A.R.V.I.S — היסטוריית שיחה\nייצוא: ${new Date().toLocaleString('he-IL')}\nסה"כ: ${state.history.length} הודעות\n\n${'='.repeat(60)}\n\n${lines.join('\n\n' + '─'.repeat(60) + '\n\n')}`;

        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jarvis-history-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function confirmClearHistory() {
        if (state.history.length === 0) return;
        if (confirm(`למחוק את כל ${state.history.length} ההודעות? לא ניתן לשחזר.`)) {
            clearHistory();
            renderFullHistory();
            closeHistoryModal();
        }
    }

    function startNewConversation() {
        if (state.history.length === 0) {
            closeHistoryModal();
            return;
        }
        if (!confirm('להתחיל שיחה חדשה? השיחה הנוכחית תימחק (אפשר לייצא קודם).')) return;
        clearHistory();
        renderFullHistory();
        closeHistoryModal();
    }

    // ==============================
    // 16. MIC — with mobile fixes
    // ==============================

    function initSpeechRecognition() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            state.recognitionSupported = false;
            if (el.micBtn) el.micBtn.hidden = true;
            console.warn('[mic] Web Speech API not supported');
            return;
        }
        state.recognitionSupported = true;
        if (el.micBtn) el.micBtn.hidden = false;

        const rec = new SR();
        rec.lang = CONFIG.speechLang;
        rec.continuous = CONFIG.speechContinuous;
        rec.interimResults = CONFIG.speechInterimResults;
        rec.maxAlternatives = 1;

        rec.onstart = () => {
            state.isListening = true;
            state.micManualStop = false;
            state.lastSpeechAt = Date.now();

            if (el.micBtn) el.micBtn.setAttribute('aria-pressed', 'true');
            if (el.micStatus) el.micStatus.hidden = false;
            setText(el.micStatusText, 'מקשיב...');
            setText(el.coreStatus, 'מצב: מקשיב לפקודה קולית');
            if (el.userInput) el.userInput.classList.add('interim');

            startMicTimer();
            startMicAudioAnalysis();
            startMicSafetyTimer();
            startMicSilenceWatcher();
        };

        rec.onresult = (event) => {
            state.lastSpeechAt = Date.now();
            let interimText = '';
            let finalText = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const t = event.results[i][0].transcript;
                if (event.results[i].isFinal) finalText += t;
                else interimText += t;
            }

            if (interimText && el.userInput) {
                el.userInput.value = interimText;
            }

            if (finalText && el.userInput) {
                el.userInput.value = finalText;
                el.userInput.classList.remove('interim');
                setText(el.micStatusText, 'זוהה — שולח...');

                if (state.autoSendTimer) clearTimeout(state.autoSendTimer);
                const textToSend = finalText.trim();

                state.autoSendTimer = setTimeout(() => {
                    state.autoSendTimer = null;
                    stopListening();
                    if (textToSend && !state.isSending) sendMessage(textToSend);
                }, CONFIG.speechAutoSendDelayMs);
            }
        };

        rec.onerror = (event) => {
            console.warn('[mic] error', event.error);

            if (event.error === 'aborted' && state.micManualStop) {
                return;
            }

            const messages = {
                'no-speech': 'לא זוהה דיבור — נסה שוב',
                'audio-capture': 'לא נמצא מיקרופון',
                'not-allowed': 'הגישה למיקרופון נדחתה',
                'network': 'בעיית רשת בזיהוי דיבור',
                'aborted': 'ההקלטה בוטלה',
                'service-not-allowed': 'שירות הזיהוי חסום',
            };
            const msg = messages[event.error] || `שגיאה: ${event.error}`;
            setText(el.micStatusText, msg);

            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                showError(msg);
            }

            if (event.error === 'no-speech' && state.isListening) {
                // restart אוטומטי
                setTimeout(() => {
                    if (!state.micManualStop && !state.isSending) {
                        startListening();
                    }
                }, CONFIG.speechRestartDelayMs);
                return;
            }

            stopListening();
        };

        rec.onend = () => {
            const wasManual = state.micManualStop;
            state.isListening = false;
            state.micManualStop = false;

            if (el.micBtn) el.micBtn.setAttribute('aria-pressed', 'false');
            if (el.micStatus) el.micStatus.hidden = true;
            if (el.userInput) el.userInput.classList.remove('interim');

            stopMicTimer();
            stopMicAudioAnalysis();
            clearMicSafetyTimer();
            clearMicSilenceTimer();

            if (state.isOnline && !state.isCameraOn) {
                setText(el.coreStatus, 'מצב: סנכרון מוחי פעיל');
            }

            // restart אוטומטי אם זו לא עצירה ידנית
            if (!wasManual && !state.isSending && !state.autoSendTimer) {
                const textInInput = el.userInput ? el.userInput.value.trim() : '';
                if (!textInInput) {
                    setTimeout(() => {
                        if (!state.micManualStop && !state.isSending && !state.isListening) {
                            startListening();
                        }
                    }, CONFIG.speechRestartDelayMs);
                }
            }
        };

        state.recognition = rec;
        console.info('[mic] Web Speech API initialized (lang: he-IL)');
    }

    function startListening() {
        if (!state.recognition) return;
        if (state.isSending) return;
        if (state.isListening) return;

        try {
            state.recognition.start();
        } catch (e) {
            // sometimes throws if already started — ignore
        }
    }

    function stopListening() {
        if (!state.recognition) return;
        if (!state.isListening) return;
        state.micManualStop = true;
        try { state.recognition.stop(); } catch (e) {}
    }

    function handleMicToggle() {
        if (state.isListening) stopListening();
        else startListening();
    }

    function startMicTimer() {
        state.micStartTime = Date.now();
        if (state.micTimerInterval) clearInterval(state.micTimerInterval);
        state.micTimerInterval = setInterval(() => {
            const sec = Math.floor((Date.now() - state.micStartTime) / 1000);
            if (el.micTimer) el.micTimer.textContent = `${pad2(Math.floor(sec / 60))}:${pad2(sec % 60)}`;
        }, 250);
    }

    function stopMicTimer() {
        if (state.micTimerInterval) { clearInterval(state.micTimerInterval); state.micTimerInterval = null; }
        if (el.micTimer) el.micTimer.textContent = '00:00';
    }

    function startMicSafetyTimer() {
        clearMicSafetyTimer();
        state.micSafetyTimer = setTimeout(() => {
            if (state.isListening && el.userInput && !el.userInput.value.trim()) {
                console.warn('[mic] no result in ' + CONFIG.speechSafetyTimeoutMs + 'ms — restarting');
                state.micManualStop = false;
                try { state.recognition.stop(); } catch (e) {}
            }
        }, CONFIG.speechSafetyTimeoutMs);
    }

    function clearMicSafetyTimer() {
        if (state.micSafetyTimer) {
            clearTimeout(state.micSafetyTimer);
            state.micSafetyTimer = null;
        }
    }

    function startMicSilenceWatcher() {
        clearMicSilenceTimer();
        state.micSilenceTimer = setInterval(() => {
            if (!state.isListening) return;
            const sinceLastSpeech = Date.now() - state.lastSpeechAt;
            const hasText = el.userInput && el.userInput.value.trim();
            if (sinceLastSpeech > CONFIG.speechSilenceTimeoutMs && hasText) {
                // silence after speech → trigger send
                if (!state.autoSendTimer) {
                    const text = el.userInput.value.trim();
                    if (text && !state.isSending) {
                        stopListening();
                        sendMessage(text);
                    }
                }
            }
        }, 500);
    }

    function clearMicSilenceTimer() {
        if (state.micSilenceTimer) {
            clearInterval(state.micSilenceTimer);
            state.micSilenceTimer = null;
        }
    }

    async function startMicAudioAnalysis() {
        if (!el.micSpectrum) return;
        if (state.micAnalyser) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            state.micStream = stream;
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            const ctx = new Ctx();
            state.micAudioCtx = ctx;
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 128;
            analyser.smoothingTimeConstant = 0.75;
            source.connect(analyser);
            state.micAnalyser = analyser;
            el.micSpectrum.hidden = false;
            drawMicSpectrum();
        } catch (e) {}
    }

    function stopMicAudioAnalysis() {
        if (state.micSpectrumRAF) {
            cancelAnimationFrame(state.micSpectrumRAF);
            state.micSpectrumRAF = null;
        }
        if (state.micStream) {
            state.micStream.getTracks().forEach((t) => { try { t.stop(); } catch (e) {} });
            state.micStream = null;
        }
        if (state.micAudioCtx) {
            try { state.micAudioCtx.close(); } catch (e) {}
            state.micAudioCtx = null;
        }
        state.micAnalyser = null;
        if (el.micSpectrum) {
            el.micSpectrum.hidden = true;
            const c = el.micSpectrum.getContext('2d');
            if (c) c.clearRect(0, 0, el.micSpectrum.width, el.micSpectrum.height);
        }
    }

    function drawMicSpectrum() {
        const canvas = el.micSpectrum;
        const analyser = state.micAnalyser;
        if (!canvas || !analyser) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const size = 90;
        if (canvas.width !== size * dpr) {
            canvas.width = size * dpr;
            canvas.height = size * dpr;
            canvas.style.width = size + 'px';
            canvas.style.height = size + 'px';
        }
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const data = new Uint8Array(analyser.frequencyBinCount);
        const cx = size / 2;
        const cy = size / 2;
        const innerR = 26;
        const outerR = 42;
        const bars = CONFIG.micSpectrumBars;

        const draw = () => {
            state.micSpectrumRAF = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(data);
            ctx.clearRect(0, 0, size, size);

            for (let i = 0; i < bars; i++) {
                const idx = Math.floor((i / bars) * (data.length * 0.75));
                const v = data[idx] / 255;
                const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
                const barLen = v * (outerR - innerR) + 4;

                const x1 = cx + Math.cos(angle) * innerR;
                const y1 = cy + Math.sin(angle) * innerR;
                const x2 = cx + Math.cos(angle) * (innerR + barLen);
                const y2 = cy + Math.sin(angle) * (innerR + barLen);

                const mix = i / bars;
                const r = Math.round(244 * (1 - mix) + 130 * mix);
                const g = Math.round(212 * (1 - mix) + 216 * mix);
                const b = Math.round(124 * (1 - mix) + 255 * mix);
                const alpha = 0.4 + v * 0.6;

                ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }
        };
        draw();
    }

    // ==============================
    // 17. CAMERA
    // ==============================

    function initCamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            state.cameraSupported = false;
            if (el.cameraBtn) el.cameraBtn.hidden = true;
            return;
        }
        state.cameraSupported = true;
        if (el.cameraBtn) el.cameraBtn.hidden = false;
    }

    function showSidebarView(name) {
        if (el.sidebarBrain) el.sidebarBrain.classList.toggle('active', name === 'brain');
        if (el.sidebarCamera) el.sidebarCamera.classList.toggle('active', name === 'camera');
    }

    async function startCamera() {
        if (state.isCameraOn) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
                audio: false,
            });
            state.cameraStream = stream;
            state.isCameraOn = true;
            if (el.cameraFeed) {
                el.cameraFeed.srcObject = stream;
                try { await el.cameraFeed.play(); } catch (e) {}
            }
            showSidebarView('camera');

            // במצב mobile — הצג את הפאנל
            if (CONFIG.isMobile) {
                const sidebar = document.querySelector('.brain-sidebar');
                if (sidebar) sidebar.classList.add('mobile-visible');
            }

            if (el.cameraBtn) el.cameraBtn.setAttribute('aria-pressed', 'true');
            setText(el.cameraStatusText, 'מצלמה פעילה');
            setText(el.coreStatus, 'מצב: עין אופטית פעילה');
            pulseNeural(3);
            updateCameraResolution();
            startCameraFpsCounter();
        } catch (err) {
            const msg = err.name === 'NotAllowedError' ? 'הגישה למצלמה נדחתה'
                : err.name === 'NotFoundError' ? 'לא נמצאה מצלמה במכשיר'
                    : 'שגיאה בהפעלת המצלמה';
            showError(msg);
            stopCamera();
        }
    }

    function stopCamera() {
        stopCameraFpsCounter();
        if (state.cameraStream) {
            state.cameraStream.getTracks().forEach((t) => { try { t.stop(); } catch (e) {} });
            state.cameraStream = null;
        }
        if (el.cameraFeed) el.cameraFeed.srcObject = null;
        state.isCameraOn = false;
        showSidebarView('brain');

        const sidebar = document.querySelector('.brain-sidebar');
        if (sidebar) sidebar.classList.remove('mobile-visible');

        if (el.cameraBtn) el.cameraBtn.setAttribute('aria-pressed', 'false');
        if (el.cameraFps) el.cameraFps.textContent = '-- FPS';
        if (el.cameraRes) el.cameraRes.textContent = '--';
        if (state.isOnline) setText(el.coreStatus, 'מצב: סנכרון מוחי פעיל');
    }

    function handleCameraToggle() {
        if (state.isCameraOn) stopCamera();
        else startCamera();
    }

    function updateCameraResolution() {
        if (!el.cameraFeed || !el.cameraRes) return;
        const w = el.cameraFeed.videoWidth;
        const h = el.cameraFeed.videoHeight;
        if (w && h) el.cameraRes.textContent = `${w}×${h}`;
    }

    function startCameraFpsCounter() {
        state.cameraFrameCount = 0;
        state.cameraLastFpsUpdate = performance.now();
        const tick = (now) => {
            if (!state.isCameraOn) return;
            state.cameraFpsRAF = requestAnimationFrame(tick);
            state.cameraFrameCount++;
            if (now - state.cameraLastFpsUpdate >= 1000) {
                state.cameraFps = state.cameraFrameCount;
                state.cameraFrameCount = 0;
                state.cameraLastFpsUpdate = now;
                if (el.cameraFps) el.cameraFps.textContent = `${state.cameraFps} FPS`;
            }
        };
        state.cameraFpsRAF = requestAnimationFrame(tick);
    }

    function stopCameraFpsCounter() {
        if (state.cameraFpsRAF) {
            cancelAnimationFrame(state.cameraFpsRAF);
            state.cameraFpsRAF = null;
        }
    }

    // ==============================
    // 18. VISION
    // ==============================

    function captureFrame() {
        if (!el.cameraFeed || !state.isCameraOn) return null;
        const video = el.cameraFeed;
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;
        if (vw === 0 || vh === 0) return null;

        const ratio = Math.min(CONFIG.visionFrameWidth / vw, CONFIG.visionFrameHeight / vh);
        const w = Math.round(vw * ratio);
        const h = Math.round(vh * ratio);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, w, h);

        try {
            const dataUrl = canvas.toDataURL('image/jpeg', CONFIG.visionJpegQuality);
            const commaIdx = dataUrl.indexOf(',');
            if (commaIdx < 0) return null;
            return { base64: dataUrl.substring(commaIdx + 1), mimeType: 'image/jpeg' };
        } catch (e) { return null; }
    }

    async function sendVisionRequest(promptText) {
        if (state.isAnalyzing) return;
        if (!state.isCameraOn) {
            showError('המצלמה לא פעילה — הפעל אותה קודם');
            return;
        }
        const frame = captureFrame();
        if (!frame) {
            showError('לא ניתן ללכוד פריים מהמצלמה');
            return;
        }

        state.isAnalyzing = true;
        if (el.visionBtn) {
            el.visionBtn.disabled = true;
            el.visionBtn.classList.add('loading');
        }
        if (el.cameraScanRing) el.cameraScanRing.hidden = false;
        setText(el.cameraStatusText, 'סורק סצנה...');
        setText(el.coreStatus, 'מצב: מנתח סצנה ויזואלית...');
        showTyping();
        pulseNeural(4);

        const start = performance.now();

        try {
            const res = await fetch('/api/vision', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: frame.base64,
                    mimeType: frame.mimeType,
                    prompt: promptText || '',
                }),
            });

            const data = await res.json().catch(() => ({}));
            const elapsed = Math.round(performance.now() - start);

            const rawReply = (data && typeof data.reply === 'string') ? data.reply : '';
            const replyText = cleanReplyText(rawReply) || 'אדון, לא הצלחתי לנתח את הסצנה.';

            hideTyping();
            appendMessage('jarvis', replyText, { typing: true });
            speak(replyText);
            pulseNeural(8);

            const coreLat = Number(data && data.latencyMs);
            const shownLat = Number.isFinite(coreLat) && coreLat > 0 ? coreLat : elapsed;
            flipNumber(el.latencyStatus, `${shownLat} ms`);
            setLoadBar(shownLat);

            if (res.ok) setOnline();
        } catch (err) {
            hideTyping();
            appendMessage('jarvis', 'אדון, החיישן האופטי לא הצליח לשלוח את הנתונים.');
        } finally {
            state.isAnalyzing = false;
            if (el.visionBtn) {
                el.visionBtn.disabled = false;
                el.visionBtn.classList.remove('loading');
            }
            if (el.cameraScanRing) el.cameraScanRing.hidden = true;
            setText(el.cameraStatusText, 'מצלמה פעילה');
            if (state.isOnline && state.isCameraOn) setText(el.coreStatus, 'מצב: עין אופטית פעילה');
        }
    }

    function handleVisionClick() { sendVisionRequest(''); }

    // ==============================
    // 19. SEND MESSAGE
    // ==============================

    async function sendMessage(prompt) {
        if (state.isSending) return;

        if (state.isCameraOn && containsVisionKeyword(prompt) && !state.isAnalyzing) {
            appendMessage('user', prompt);
            if (el.userInput) {
                el.userInput.value = '';
                el.userInput.classList.remove('interim');
            }
            await sendVisionRequest(prompt);
            return;
        }

        state.isSending = true;

        appendMessage('user', prompt);

        if (el.userInput) {
            el.userInput.value = '';
            el.userInput.disabled = true;
            el.userInput.classList.remove('interim');
        }
        if (el.sendBtn) el.sendBtn.disabled = true;
        if (el.micBtn) el.micBtn.disabled = true;
        setText(el.coreStatus, 'מצב: מעבד סינפסות...');
        showTyping();
        pulseNeural(5);

        const clientStart = performance.now();

        try {
            const historyForServer = state.history.slice(0, -1).slice(-CONFIG.maxHistoryMessagesSent);

            const res = await fetch('/api/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt,
                    history: historyForServer.map((m) => ({ role: m.role, text: m.text })),
                }),
            });

            const data = await res.json().catch(() => ({}));
            const clientElapsed = Math.round(performance.now() - clientStart);

            const rawReply = (data && typeof data.reply === 'string') ? data.reply : '';
            const replyText = cleanReplyText(rawReply) || 'אדון, לא התקבלה תגובה מהליבה.';

            hideTyping();
            appendMessage('jarvis', replyText, { typing: true });
            speak(replyText);
            pulseNeural(8);

            const coreLat = Number(data && data.latencyMs);
            const shownLat = Number.isFinite(coreLat) && coreLat > 0 ? coreLat : clientElapsed;
            flipNumber(el.latencyStatus, `${shownLat} ms`);
            setLoadBar(shownLat);

            if (res.ok) setOnline();
            else if (res.status === 429) setOnline();
            else if (res.status >= 500) {
                state.metricsFailures = CONFIG.metricsFailureThreshold;
                setOffline();
            } else setOnline();
        } catch (err) {
            hideTyping();
            appendMessage('jarvis', 'אדון, נותק קשר עם רשת המוח הנוירונלית.');
            state.metricsFailures = CONFIG.metricsFailureThreshold;
            setOffline();
        } finally {
            state.isSending = false;
            if (el.userInput) {
                el.userInput.disabled = false;
                el.userInput.focus();
            }
            if (el.sendBtn) el.sendBtn.disabled = false;
            if (el.micBtn) el.micBtn.disabled = false;
            if (state.isOnline && !state.isCameraOn) setText(el.coreStatus, 'מצב: סנכרון מוחי פעיל');
            updateFooterStats();
        }
    }

    // ==============================
    // 20. HANDLERS
    // ==============================

    function handleSubmit(e) {
        e.preventDefault();
        if (!el.userInput) return;
        if (state.isListening) stopListening();
        const prompt = el.userInput.value.trim();
        if (!prompt) return;
        sendMessage(prompt);
    }

    function handleChatScroll() {
        if (!el.chatLog) return;
        const distanceFromBottom = el.chatLog.scrollHeight - el.chatLog.scrollTop - el.chatLog.clientHeight;
        state.autoScroll = distanceFromBottom < 80;
    }

    function handleKeydown(e) {
        if (e.key === 'Escape') {
            if (!el.historyModal || el.historyModal.hidden) {
                if (el.userInput) el.userInput.value = '';
            } else {
                closeHistoryModal();
            }
        }
        if (e.ctrlKey && e.key === 'Enter' && document.activeElement === el.userInput) {
            el.chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
        }
    }

    // ==============================
    // 21. INIT
    // ==============================

    function init() {
        cacheDomRefs();
        if (!requiredRefsExist()) {
            console.error('[app] required DOM refs missing');
            return;
        }

        state.history = loadHistoryFromStorage();
        updateHistoryCount();
        renderFullHistory();

        try {
            const saved = localStorage.getItem(CONFIG.ttsStorageKey);
            if (saved !== null) state.ttsEnabled = saved === 'true';
        } catch (e) {}
        applyTtsUI();

        tickClock();
        setInterval(tickClock, 1000);
        setInterval(updateFooterStats, 2000);

        loadVoices();
        if (el.ttsToggle) el.ttsToggle.addEventListener('click', toggleTts);

        el.chatForm.addEventListener('submit', handleSubmit);
        if (el.userInput) el.userInput.addEventListener('keydown', handleKeydown);
        document.addEventListener('keydown', handleKeydown);

        if (el.chatLog) el.chatLog.addEventListener('scroll', handleChatScroll, { passive: true });

        if (el.errorDismiss) el.errorDismiss.addEventListener('click', hideError);

        // History modal
        if (el.historyBtn) el.historyBtn.addEventListener('click', openHistoryModal);
        if (el.historyClose) el.historyClose.addEventListener('click', closeHistoryModal);
        if (el.historyBackdrop) el.historyBackdrop.addEventListener('click', closeHistoryModal);
        if (el.historyClear) el.historyClear.addEventListener('click', confirmClearHistory);
        if (el.historyExport) el.historyExport.addEventListener('click', exportHistory);
        if (el.historyNew) el.historyNew.addEventListener('click', startNewConversation);
        if (el.historySearch) el.historySearch.addEventListener('input', handleHistorySearchInput);

        // Mic
        initSpeechRecognition();
        if (el.micBtn) el.micBtn.addEventListener('click', handleMicToggle);

        // Camera
        initCamera();
        if (el.cameraBtn) el.cameraBtn.addEventListener('click', handleCameraToggle);
        if (el.visionBtn) el.visionBtn.addEventListener('click', handleVisionClick);

        startMetricsPolling();

        window.addEventListener('beforeunload', () => {
            if (state.metricsTimer) clearInterval(state.metricsTimer);
            if (state.autoSendTimer) clearTimeout(state.autoSendTimer);
            if (state.typingTimer) clearInterval(state.typingTimer);
            if (state.micSafetyTimer) clearTimeout(state.micSafetyTimer);
            if (state.micSilenceTimer) clearInterval(state.micSilenceTimer);
            if (state.recognition && state.isListening) {
                try { state.recognition.stop(); } catch (e) {}
            }
            stopMicAudioAnalysis();
            stopCameraFpsCounter();
            if (state.cameraStream) {
                state.cameraStream.getTracks().forEach((t) => { try { t.stop(); } catch (e) {} });
            }
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        });

        console.info(`[app] J.A.R.V.I.S v3.3 — history: ${state.history.length} | mobile: ${CONFIG.isMobile}`);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

})();