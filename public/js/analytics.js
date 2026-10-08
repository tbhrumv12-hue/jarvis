/**
 * ⚡ J.A.R.V.I.S // ANALYTICS v1.4
 * Dashboard + AI Chat + Mega Prompt + YouTube Import + TikTok Import + Instagram Import
 */

(function () {
    'use strict';

    // ==============================
    // 1. CONFIG
    // ==============================

    const CONFIG = {
        storageKey: 'jarvis_analytics_v1',
        chatStorageKey: 'jarvis_analytics_chat_v1',
        maxChatHistory: 30,
        platforms: {
            youtube: { name: 'YouTube', icon: '🎬' },
            tiktok: { name: 'TikTok', icon: '📱' },
            instagram: { name: 'Instagram', icon: '📸' },
        },
    };

    // ==============================
    // 2. STATE
    // ==============================

    const state = {
        videos: [],
        filters: {
            platform: 'all',
            sortBy: 'date-desc',
            search: '',
        },
        chat: {
            history: [],
            isSending: false,
        },
        youtube: {
            pendingVideo: null,
            isLoading: false,
        },
        tiktok: {
            pendingVideo: null,
            isLoading: false,
        },
    };

    // ==============================
    // 3. UTILS
    // ==============================

    function $(sel) { return document.querySelector(sel); }
    function $$(sel) { return document.querySelectorAll(sel); }

    function formatNumber(n) {
        if (n === null || n === undefined) return '0';
        return Number(n).toLocaleString('he-IL');
    }

    function formatPercent(n) {
        if (!n || !isFinite(n)) return '0%';
        return n.toFixed(1) + '%';
    }

    function formatDate(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '—';
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    }

       function formatDuration(sec) {
        const n = Number(sec);
        if (!sec && sec !== 0) return '—';
        if (!isFinite(n)) return '—';
        if (n < 60) return n.toFixed(1) + 's';
        const m = Math.floor(n / 60);
        const s = Math.round(n % 60);
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    function escapeHtml(s) {
        if (typeof s !== 'string') return '';
        return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // ==============================
    // 4. STORAGE
    // ==============================

    function loadFromStorage() {
        try {
            const raw = localStorage.getItem(CONFIG.storageKey);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.filter((v) => v && typeof v === 'object' && v.platform && v.title);
        } catch (e) {
            console.warn('[analytics] load failed', e);
            return [];
        }
    }

    function saveToStorage() {
        try {
            localStorage.setItem(CONFIG.storageKey, JSON.stringify(state.videos));
            updateFooter();
        } catch (e) {
            console.warn('[analytics] save failed', e);
        }
    }

    function loadChatFromStorage() {
        try {
            const raw = localStorage.getItem(CONFIG.chatStorageKey);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.slice(-CONFIG.maxChatHistory);
        } catch (e) {
            return [];
        }
    }

    function saveChatToStorage() {
        try {
            const toSave = state.chat.history.slice(-CONFIG.maxChatHistory);
            localStorage.setItem(CONFIG.chatStorageKey, JSON.stringify(toSave));
        } catch (e) {
            console.warn('[analytics] chat save failed', e);
        }
    }

    function updateFooter() {
        const el = document.getElementById('footer-updated');
        if (el) el.textContent = 'עדכון אחרון: ' + new Date().toLocaleString('he-IL');
    }

    // ==============================
    // 5. CALCULATIONS
    // ==============================

    function getRatio(video) {
        if (!video.views) return 0;
        return (video.likes / video.views) * 100;
    }

    function getTotals(videos) {
        const totals = {
            views: 0,
            likes: 0,
            comments: 0,
            shares: 0,
            count: videos.length,
        };
        for (const v of videos) {
            totals.views += Number(v.views) || 0;
            totals.likes += Number(v.likes) || 0;
            totals.comments += Number(v.comments) || 0;
            totals.shares += Number(v.shares) || 0;
        }
        totals.ratio = totals.views ? (totals.likes / totals.views) * 100 : 0;
        totals.commentRatio = totals.views ? (totals.comments / totals.views) * 100 : 0;
        return totals;
    }

    function getByPlatform(videos) {
        const result = { youtube: [], tiktok: [], instagram: [] };
        for (const v of videos) {
            if (result[v.platform]) result[v.platform].push(v);
        }
        return result;
    }

    // ==============================
    // 6. RENDERING
    // ==============================

    function renderSummary() {
        const totals = getTotals(state.videos);
        const sumViews = document.getElementById('sum-views');
        const sumLikes = document.getElementById('sum-likes');
        const sumComments = document.getElementById('sum-comments');
        const sumVideos = document.getElementById('sum-videos');
        const sumRatio = document.getElementById('sum-ratio');
        const sumCommentRatio = document.getElementById('sum-comment-ratio');

        if (sumViews) sumViews.textContent = formatNumber(totals.views);
        if (sumLikes) sumLikes.textContent = formatNumber(totals.likes);
        if (sumComments) sumComments.textContent = formatNumber(totals.comments);
        if (sumVideos) sumVideos.textContent = formatNumber(totals.count);
        if (sumRatio) sumRatio.textContent = formatPercent(totals.ratio);
        if (sumCommentRatio) sumCommentRatio.textContent = formatPercent(totals.commentRatio);
    }

    function renderPlatforms() {
        const byPlatform = getByPlatform(state.videos);
        const maxViews = Math.max(
            getTotals(byPlatform.youtube).views,
            getTotals(byPlatform.tiktok).views,
            getTotals(byPlatform.instagram).views,
            1
        );

        const yt = getTotals(byPlatform.youtube);
        const ytViews = document.getElementById('yt-views'); if (ytViews) ytViews.textContent = formatNumber(yt.views);
        const ytLikes = document.getElementById('yt-likes'); if (ytLikes) ytLikes.textContent = formatNumber(yt.likes);
        const ytComments = document.getElementById('yt-comments'); if (ytComments) ytComments.textContent = formatNumber(yt.comments);
        const ytCount = document.getElementById('yt-count'); if (ytCount) ytCount.textContent = formatNumber(yt.count);
        const ytBar = document.getElementById('yt-bar'); if (ytBar) ytBar.style.width = (yt.views / maxViews) * 100 + '%';

        const tt = getTotals(byPlatform.tiktok);
        const ttViews = document.getElementById('tt-views'); if (ttViews) ttViews.textContent = formatNumber(tt.views);
        const ttLikes = document.getElementById('tt-likes'); if (ttLikes) ttLikes.textContent = formatNumber(tt.likes);
        const ttComments = document.getElementById('tt-comments'); if (ttComments) ttComments.textContent = formatNumber(tt.comments);
        const ttCount = document.getElementById('tt-count'); if (ttCount) ttCount.textContent = formatNumber(tt.count);
        const ttBar = document.getElementById('tt-bar'); if (ttBar) ttBar.style.width = (tt.views / maxViews) * 100 + '%';

        const ig = getTotals(byPlatform.instagram);
        const igViews = document.getElementById('ig-views'); if (igViews) igViews.textContent = formatNumber(ig.views);
        const igLikes = document.getElementById('ig-likes'); if (igLikes) igLikes.textContent = formatNumber(ig.likes);
        const igComments = document.getElementById('ig-comments'); if (igComments) igComments.textContent = formatNumber(ig.comments);
        const igCount = document.getElementById('ig-count'); if (igCount) igCount.textContent = formatNumber(ig.count);
        const igBar = document.getElementById('ig-bar'); if (igBar) igBar.style.width = (ig.views / maxViews) * 100 + '%';
    }

    function getFilteredVideos() {
        let videos = state.videos.slice();

        if (state.filters.platform !== 'all') {
            videos = videos.filter((v) => v.platform === state.filters.platform);
        }

        if (state.filters.search) {
            const q = state.filters.search.toLowerCase();
            videos = videos.filter((v) => (v.title || '').toLowerCase().includes(q));
        }

        const sortBy = state.filters.sortBy;
        videos.sort((a, b) => {
            switch (sortBy) {
                case 'date-desc': return new Date(b.date) - new Date(a.date);
                case 'date-asc': return new Date(a.date) - new Date(b.date);
                case 'views-desc': return (b.views || 0) - (a.views || 0);
                case 'likes-desc': return (b.likes || 0) - (a.likes || 0);
                case 'ratio-desc': return getRatio(b) - getRatio(a);
                default: return 0;
            }
        });

        return videos;
    }

    function renderTopBottom() {
        const videos = getFilteredVideos();
        if (!videos.length) {
            ['top-views', 'top-likes', 'bottom-views'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = '<div class="ai-placeholder">אין נתונים</div>';
            });
            return;
        }

        const topViews = [...videos].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
        const topLikes = [...videos].filter((v) => v.views > 100).sort((a, b) => getRatio(b) - getRatio(a)).slice(0, 5);
        const bottomViews = [...videos].sort((a, b) => (a.views || 0) - (b.views || 0)).slice(0, 5);

        renderTBList('top-views', topViews, (v) => formatNumber(v.views) + ' 👁️');
        renderTBList('top-likes', topLikes, (v) => formatPercent(getRatio(v)) + ' ❤️');
        renderTBList('bottom-views', bottomViews, (v) => formatNumber(v.views) + ' 👁️');
    }

    function renderTBList(containerId, videos, valueFn) {
        const el = document.getElementById(containerId);
        if (!el) return;
        if (!videos.length) {
            el.innerHTML = '<div class="ai-placeholder">אין נתונים</div>';
            return;
        }

        el.innerHTML = videos.map((v, i) => {
            const p = CONFIG.platforms[v.platform] || { icon: '❓' };
            return `
                <div class="tb-item rank-${i + 1}">
                    <span class="tb-rank">#${i + 1}</span>
                    <span class="tb-platform">${p.icon}</span>
                    <span class="tb-title">${escapeHtml(v.title)}</span>
                    <span class="tb-value">${valueFn(v)}</span>
                </div>
            `;
        }).join('');
    }

    function renderTable() {
        const videos = getFilteredVideos();
        const tbody = document.getElementById('videos-tbody');
        const countEl = document.getElementById('table-count');

        if (countEl) countEl.textContent = `(${videos.length})`;
        if (!tbody) return;

        if (!videos.length) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:30px;color:#999;">אין נתונים להצגה</td></tr>';
            return;
        }

        tbody.innerHTML = videos.map((v, i) => {
            const p = CONFIG.platforms[v.platform] || { icon: '❓' };
            const ratio = getRatio(v);
                      return `
                <tr data-id="${v.id}">
                    <td>${i + 1}</td>
                    <td class="col-platform" title="${p.name}">${p.icon}</td>
                    <td>${formatDate(v.date)}</td>
                    <td class="col-title" title="${escapeHtml(v.title)}">${escapeHtml(v.title)}</td>
                    <td>${formatDuration(v.duration)}</td>
                    <td class="col-views">${formatNumber(v.views)}</td>
                    <td class="col-likes">${formatNumber(v.likes)}</td>
                    <td class="col-comments">${formatNumber(v.comments)}</td>
                    <td class="col-shares">${formatNumber(v.shares || 0)}</td>
                    <td class="col-saves">${formatNumber(v.saves || 0)}</td>
                    <td class="col-subscribers">${formatNumber(v.subscribers || 0)}</td>
                    <td class="col-ratio">${formatPercent(ratio)}</td>
                    <td class="col-actions">
                        <button class="row-btn" data-edit="${v.id}" title="ערוך">✏️</button>
                        <button class="row-btn danger" data-delete="${v.id}" title="מחק">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.querySelectorAll('[data-edit]').forEach((btn) => {
            btn.addEventListener('click', () => openEditModal(btn.dataset.edit));
        });
        tbody.querySelectorAll('[data-delete]').forEach((btn) => {
            btn.addEventListener('click', () => deleteVideo(btn.dataset.delete));
        });
    }

    function renderAll() {
        renderSummary();
        renderPlatforms();
        renderTopBottom();
        renderTable();
    }

    // ==============================
    // 7. ADD / EDIT / DELETE
    // ==============================

    function generateId() {
        return 'v_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    function addVideo(data) {
        const video = {
            id: data.id || generateId(),
            platform: data.platform || 'youtube',
            date: data.date || new Date().toISOString().split('T')[0],
            title: data.title || 'ללא כותרת',
            duration: Number(data.duration) || 0,
            views: Number(data.views) || 0,
            likes: Number(data.likes) || 0,
            comments: Number(data.comments) || 0,
            shares: Number(data.shares) || 0,
                        subscribers: Number(data.subscribers) || 0,
            saves: Number(data.saves) || 0,
        };
        state.videos.push(video);
        saveToStorage();
        renderAll();
        return video;
    }

    function updateVideo(id, data) {
        const idx = state.videos.findIndex((v) => v.id === id);
        if (idx < 0) return false;
        state.videos[idx] = { ...state.videos[idx], ...data, id };
        saveToStorage();
        renderAll();
        return true;
    }

    function deleteVideo(id) {
        if (!confirm('למחוק את הסרטון?')) return;
        state.videos = state.videos.filter((v) => v.id !== id);
        saveToStorage();
        renderAll();
    }

    // ==============================
    // 8. MODALS
    // ==============================

    function openModal(id) {
        const el = document.getElementById(id);
        if (el) el.hidden = false;
    }

    function closeModal(id) {
        const el = document.getElementById(id);
        if (el) el.hidden = true;
    }

    function openAddModal() {
        const f = (id) => document.getElementById(id);
        if (f('f-platform')) f('f-platform').value = 'youtube';
        if (f('f-date')) f('f-date').value = new Date().toISOString().split('T')[0];
        if (f('f-title')) f('f-title').value = '';
        if (f('f-duration')) f('f-duration').value = '';
        if (f('f-views')) f('f-views').value = '';
        if (f('f-likes')) f('f-likes').value = 0;
        if (f('f-comments')) f('f-comments').value = 0;
        if (f('f-shares')) f('f-shares').value = 0;
        if (f('f-id')) f('f-id').value = '';
        openModal('add-modal');
    }

    function submitAdd() {
        const f = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
        const data = {
            platform: f('f-platform'),
            date: f('f-date'),
            title: f('f-title').trim(),
            duration: f('f-duration'),
            views: f('f-views'),
            likes: f('f-likes'),
            comments: f('f-comments'),
            shares: f('f-shares'),
            id: f('f-id').trim() || undefined,
                        subscribers: f('f-subscribers'),
            saves: f('f-saves'),
        };

        if (!data.title) { alert('חובה למלא כותרת'); return; }
        if (!data.views && data.views !== 0) { alert('חובה למלא צפיות'); return; }

        addVideo(data);
        closeModal('add-modal');
    }

    function openEditModal(id) {
        const v = state.videos.find((x) => x.id === id);
        if (!v) return;
        const f = (id) => document.getElementById(id);
        if (f('e-id')) f('e-id').value = v.id;
        if (f('e-platform')) f('e-platform').value = v.platform;
        if (f('e-date')) f('e-date').value = v.date;
        if (f('e-title')) f('e-title').value = v.title;
        if (f('e-duration')) f('e-duration').value = v.duration;
        if (f('e-views')) f('e-views').value = v.views;
        if (f('e-likes')) f('e-likes').value = v.likes;
        if (f('e-comments')) f('e-comments').value = v.comments;
        if (f('e-shares')) f('e-shares').value = v.shares;
                if (f('e-subscribers')) f('e-subscribers').value = v.subscribers || 0;
        if (f('e-saves')) f('e-saves').value = v.saves || 0;
        openModal('edit-modal');
    }

    function submitEdit() {
        const f = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
        const id = f('e-id');
        const data = {
            platform: f('e-platform'),
            date: f('e-date'),
            title: f('e-title').trim(),
            duration: f('e-duration'),
            views: f('e-views'),
            likes: f('e-likes'),
            comments: f('e-comments'),
            shares: f('e-shares'),
                        subscribers: f('e-subscribers'),
            saves: f('e-saves'),
        };
        if (!data.title) { alert('חובה למלא כותרת'); return; }
        updateVideo(id, data);
        closeModal('edit-modal');
    }

    function submitPaste() {
        const input = document.getElementById('paste-input');
        const raw = input ? input.value.trim() : '';
        if (!raw) { alert('הדבק נתונים קודם'); return; }

        const lines = raw.split('\n').filter((l) => l.trim());
        let added = 0;
        let errors = 0;

        for (const line of lines) {
            let parts = line.split('\t').map((p) => p.trim());
            if (parts.length < 3) parts = line.split(',').map((p) => p.trim());
            if (parts.length < 3) { errors++; continue; }

                        const [platform, date, title, duration, views, likes, comments, shares, saves, subscribers] = parts;
            const p = (platform || '').toLowerCase();
            const validPlatform = ['youtube', 'tiktok', 'instagram', 'yt', 'tt', 'ig'].includes(p)
                ? ({ yt: 'youtube', tt: 'tiktok', ig: 'instagram' }[p] || p)
                : null;

            if (!validPlatform) { errors++; continue; }

            addVideo({
                platform: validPlatform,
                date: normalizeDate(date),
                title: title || 'ללא כותרת',
                duration: parseFloat(duration) || 0,
                views: parseInt(views) || 0,
                likes: parseInt(likes) || 0,
                comments: parseInt(comments) || 0,
                shares: parseInt(shares) || 0,
                saves: parseInt(saves) || 0,
                subscribers: parseInt(subscribers) || 0,
            });
            added++;
        }

        closeModal('paste-modal');
        if (input) input.value = '';
        alert(`נוספו ${added} סרטונים. ${errors ? 'שגיאות: ' + errors : ''}`);
    }

    function normalizeDate(dateStr) {
        if (!dateStr) return new Date().toISOString().split('T')[0];
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
        const dmy = dateStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
        if (dmy) {
            const [, d, m, y] = dmy;
            const year = y.length === 2 ? '20' + y : y;
            return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        return new Date().toISOString().split('T')[0];
    }

    // ==============================
    // 8.5. 🆕 YOUTUBE IMPORT
    // ==============================

    function openYouTubeModal() {
        const modal = document.getElementById('youtube-modal');
        if (!modal) {
            alert('מודאל YouTube לא נמצא ב-HTML');
            return;
        }

        const urlInput = document.getElementById('yt-url');
        const errEl = document.getElementById('yt-error');
        const loadingEl = document.getElementById('yt-loading');
        const previewEl = document.getElementById('yt-preview');
        const fetchBtn = document.getElementById('yt-fetch');
        const confirmBtn = document.getElementById('yt-confirm');

        if (urlInput) urlInput.value = '';
        if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
        if (loadingEl) loadingEl.hidden = true;
        if (previewEl) previewEl.hidden = true;
        if (fetchBtn) { fetchBtn.hidden = false; fetchBtn.disabled = false; }
        if (confirmBtn) confirmBtn.hidden = true;

        state.youtube.pendingVideo = null;
        state.youtube.isLoading = false;

        openModal('youtube-modal');

        setTimeout(() => { if (urlInput) urlInput.focus(); }, 100);
    }

    function showYouTubeError(msg) {
        const errEl = document.getElementById('yt-error');
        if (errEl) {
            errEl.textContent = '❌ ' + msg;
            errEl.hidden = false;
        }
    }

    function clearYouTubeError() {
        const errEl = document.getElementById('yt-error');
        if (errEl) {
            errEl.hidden = true;
            errEl.textContent = '';
        }
    }

    async function fetchYouTubeData() {
        if (state.youtube.isLoading) return;

        const urlInput = document.getElementById('yt-url');
        const fetchBtn = document.getElementById('yt-fetch');
        const loadingEl = document.getElementById('yt-loading');
        const previewEl = document.getElementById('yt-preview');
        const confirmBtn = document.getElementById('yt-confirm');

        const input = urlInput ? urlInput.value.trim() : '';
        if (!input) {
            showYouTubeError('הדבק קישור או מזהה סרטון');
            return;
        }

        clearYouTubeError();
        state.youtube.isLoading = true;

        if (fetchBtn) fetchBtn.disabled = true;
        if (loadingEl) loadingEl.hidden = false;
        if (previewEl) previewEl.hidden = true;
        if (confirmBtn) confirmBtn.hidden = true;

        try {
            const res = await fetch('/api/youtube/fetch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: input }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                showYouTubeError(data.error || `שגיאה ${res.status}`);
                state.youtube.pendingVideo = null;
                return;
            }

            state.youtube.pendingVideo = data;

            const setText = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.textContent = val;
            };

            setText('yt-preview-title', data.title || '—');
            setText('yt-preview-date', formatDate(data.publishedAt));
            setText('yt-preview-duration', formatDuration(data.duration));
            setText('yt-preview-views', formatNumber(data.views) + ' 👁️');
            setText('yt-preview-likes', formatNumber(data.likes) + ' ❤️');
            setText('yt-preview-comments', formatNumber(data.comments) + ' 💬');

            if (previewEl) previewEl.hidden = false;
            if (confirmBtn) confirmBtn.hidden = false;

        } catch (err) {
            showYouTubeError('שגיאה בחיבור לשרת: ' + err.message);
            state.youtube.pendingVideo = null;
        } finally {
            state.youtube.isLoading = false;
            if (fetchBtn) fetchBtn.disabled = false;
            if (loadingEl) loadingEl.hidden = true;
        }
    }

    function confirmYouTubeAdd() {
        const video = state.youtube.pendingVideo;
        if (!video) {
            showYouTubeError('אין נתונים להוסיף — קודם שלף נתונים');
            return;
        }

        const exists = state.videos.some((v) => v.id === video.id);
        if (exists) {
            showYouTubeError(`הסרטון "${video.title}" כבר קיים בטבלה`);
            return;
        }

                // קריאה לשדות אופציונליים
        const getVal = (id) => {
            const el = document.getElementById(id);
            return el ? parseInt(el.value, 10) || 0 : 0;
        };

        addVideo({
            id: video.id,
            platform: 'youtube',
            date: video.publishedAt || new Date().toISOString().split('T')[0],
            title: video.title,
            duration: video.duration,
            views: video.views,
            likes: video.likes,
            comments: video.comments,
            shares: getVal('yt-manual-shares'),
            subscribers: getVal('yt-manual-subscribers'),
            saves: getVal('yt-manual-saves'),
        });

        state.youtube.pendingVideo = null;
        closeModal('youtube-modal');
    }

    // ==============================
    // 8.6. 🆕 TIKTOK IMPORT
    // ==============================

    function openTikTokModal() {
        const modal = document.getElementById('tiktok-modal');
        if (!modal) {
            alert('מודאל TikTok לא נמצא ב-HTML');
            return;
        }

        const urlInput = document.getElementById('tt-url');
        const errEl = document.getElementById('tt-error');
        const loadingEl = document.getElementById('tt-loading');
        const previewEl = document.getElementById('tt-preview');
        const fetchBtn = document.getElementById('tt-fetch');
        const confirmBtn = document.getElementById('tt-confirm');

        if (urlInput) urlInput.value = '';
        if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
        if (loadingEl) loadingEl.hidden = true;
        if (previewEl) previewEl.hidden = true;
        if (fetchBtn) { fetchBtn.hidden = false; fetchBtn.disabled = false; }
        if (confirmBtn) confirmBtn.hidden = true;

        const manualDate = document.getElementById('tt-manual-date');
        const manualDuration = document.getElementById('tt-manual-duration');
        const manualViews = document.getElementById('tt-manual-views');
        const manualLikes = document.getElementById('tt-manual-likes');
        const manualComments = document.getElementById('tt-manual-comments');

        if (manualDate) manualDate.value = new Date().toISOString().split('T')[0];
        if (manualDuration) manualDuration.value = '';
        if (manualViews) manualViews.value = '';
        if (manualLikes) manualLikes.value = '0';
        if (manualComments) manualComments.value = '0';
                const manualSubscribers = document.getElementById('tt-manual-subscribers');
        const manualSaves = document.getElementById('tt-manual-saves');
        const manualShares = document.getElementById('tt-manual-shares');
        if (manualSubscribers) manualSubscribers.value = '0';
        if (manualSaves) manualSaves.value = '0';
        if (manualShares) manualShares.value = '0';

        state.tiktok.pendingVideo = null;
        state.tiktok.isLoading = false;

        openModal('tiktok-modal');

        setTimeout(() => { if (urlInput) urlInput.focus(); }, 100);
    }

    function showTikTokError(msg) {
        const errEl = document.getElementById('tt-error');
        if (errEl) {
            errEl.textContent = '❌ ' + msg;
            errEl.hidden = false;
        }
    }

    function clearTikTokError() {
        const errEl = document.getElementById('tt-error');
        if (errEl) {
            errEl.hidden = true;
            errEl.textContent = '';
        }
    }

    async function fetchTikTokData() {
        if (state.tiktok.isLoading) return;

        const urlInput = document.getElementById('tt-url');
        const fetchBtn = document.getElementById('tt-fetch');
        const loadingEl = document.getElementById('tt-loading');
        const previewEl = document.getElementById('tt-preview');
        const confirmBtn = document.getElementById('tt-confirm');

        const input = urlInput ? urlInput.value.trim() : '';
        if (!input) {
            showTikTokError('הדבק קישור TikTok');
            return;
        }

        clearTikTokError();
        state.tiktok.isLoading = true;

        if (fetchBtn) fetchBtn.disabled = true;
        if (loadingEl) loadingEl.hidden = false;
        if (previewEl) previewEl.hidden = true;
        if (confirmBtn) confirmBtn.hidden = true;

        try {
            const res = await fetch('/api/tiktok/fetch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: input }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                showTikTokError(data.error || `שגיאה ${res.status}`);
                state.tiktok.pendingVideo = null;
                return;
            }

            state.tiktok.pendingVideo = data;

            const setText = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.textContent = val;
            };

            setText('tt-preview-title', data.title || '—');
            setText('tt-preview-author', '@' + (data.author || '—'));

            if (previewEl) previewEl.hidden = false;
            if (confirmBtn) confirmBtn.hidden = false;

            const viewsInput = document.getElementById('tt-manual-views');
            if (viewsInput) setTimeout(() => viewsInput.focus(), 150);

        } catch (err) {
            showTikTokError('שגיאה בחיבור לשרת: ' + err.message);
            state.tiktok.pendingVideo = null;
        } finally {
            state.tiktok.isLoading = false;
            if (fetchBtn) fetchBtn.disabled = false;
            if (loadingEl) loadingEl.hidden = true;
        }
    }

    function confirmTikTokAdd() {
        const video = state.tiktok.pendingVideo;
        if (!video) {
            showTikTokError('אין נתונים להוסיף — קודם שלף נתונים');
            return;
        }

        const getVal = (id) => {
            const el = document.getElementById(id);
            return el ? el.value : '';
        };

        const manualViews = parseInt(getVal('tt-manual-views'), 10);
        if (isNaN(manualViews) || manualViews < 0) {
            showTikTokError('חובה למלא צפיות (מספר חיובי)');
            const viewsInput = document.getElementById('tt-manual-views');
            if (viewsInput) viewsInput.focus();
            return;
        }

        const manualDate = getVal('tt-manual-date') || new Date().toISOString().split('T')[0];
        const manualDuration = parseFloat(getVal('tt-manual-duration')) || 0;
        const manualLikes = parseInt(getVal('tt-manual-likes'), 10) || 0;
        const manualComments = parseInt(getVal('tt-manual-comments'), 10) || 0;
                const manualSubscribers = parseInt(getVal('tt-manual-subscribers'), 10) || 0;
        const manualSaves = parseInt(getVal('tt-manual-saves'), 10) || 0;
        const manualShares = parseInt(getVal('tt-manual-shares'), 10) || 0;

        const exists = state.videos.some((v) => v.id === video.id);
        if (exists) {
            showTikTokError(`הסרטון "${video.title}" כבר קיים בטבלה`);
            return;
        }

                addVideo({
            id: video.id,
            platform: 'tiktok',
            date: manualDate,
            title: video.title,
            duration: manualDuration,
            views: manualViews,
            likes: manualLikes,
            comments: manualComments,
            shares: manualShares,
            subscribers: manualSubscribers,
            saves: manualSaves,
        });
        state.tiktok.pendingVideo = null;
        closeModal('tiktok-modal');
    }

    // ==============================
    // 8.7. 🆕 INSTAGRAM IMPORT (Manual)
    // ==============================

    function openInstagramModal() {
        const modal = document.getElementById('instagram-modal');
        if (!modal) {
            alert('מודאל Instagram לא נמצא ב-HTML');
            return;
        }

        const urlInput = document.getElementById('ig-url');
        const errEl = document.getElementById('ig-error');
        const titleInput = document.getElementById('ig-manual-title');
        const dateInput = document.getElementById('ig-manual-date');
        const durationInput = document.getElementById('ig-manual-duration');
        const viewsInput = document.getElementById('ig-manual-views');
        const likesInput = document.getElementById('ig-manual-likes');
        const commentsInput = document.getElementById('ig-manual-comments');

        if (urlInput) urlInput.value = '';
        if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
        if (titleInput) titleInput.value = '';
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
        if (durationInput) durationInput.value = '';
        if (viewsInput) viewsInput.value = '';
        if (likesInput) likesInput.value = '0';
        if (commentsInput) commentsInput.value = '0';
                const subscribersInput = document.getElementById('ig-manual-subscribers');
        const savesInput = document.getElementById('ig-manual-saves');
        const sharesInput = document.getElementById('ig-manual-shares');
        if (subscribersInput) subscribersInput.value = '0';
        if (savesInput) savesInput.value = '0';
        if (sharesInput) sharesInput.value = '0';

        openModal('instagram-modal');

        setTimeout(() => { if (urlInput) urlInput.focus(); }, 100);
    }

    function showInstagramError(msg) {
        const errEl = document.getElementById('ig-error');
        if (errEl) {
            errEl.textContent = '❌ ' + msg;
            errEl.hidden = false;
        }
    }

    function confirmInstagramAdd() {
        const getVal = (id) => {
            const el = document.getElementById(id);
            return el ? el.value : '';
        };

        const title = getVal('ig-manual-title').trim();
        if (!title) {
            showInstagramError('חובה למלא כותרת');
            const titleInput = document.getElementById('ig-manual-title');
            if (titleInput) titleInput.focus();
            return;
        }

        const views = parseInt(getVal('ig-manual-views'), 10);
        if (isNaN(views) || views < 0) {
            showInstagramError('חובה למלא צפיות (מספר חיובי)');
            const viewsInput = document.getElementById('ig-manual-views');
            if (viewsInput) viewsInput.focus();
            return;
        }

        const url = getVal('ig-url').trim();
        const date = getVal('ig-manual-date') || new Date().toISOString().split('T')[0];
        const duration = parseFloat(getVal('ig-manual-duration')) || 0;
        const likes = parseInt(getVal('ig-manual-likes'), 10) || 0;
        const comments = parseInt(getVal('ig-manual-comments'), 10) || 0;
                const subscribers = parseInt(getVal('ig-manual-subscribers'), 10) || 0;
        const saves = parseInt(getVal('ig-manual-saves'), 10) || 0;
        const shares = parseInt(getVal('ig-manual-shares'), 10) || 0;

        let id = 'ig_' + Date.now();
        if (url) {
            const match = url.match(/instagram\.com\/(?:reel|p)\/([A-Za-z0-9_-]+)/);
            if (match && match[1]) {
                id = 'ig_' + match[1];
                const exists = state.videos.some((v) => v.id === id);
                if (exists) {
                    showInstagramError(`הסרטון "${title}" כבר קיים בטבלה`);
                    return;
                }
            }
        }
        addVideo({
            id,
            platform: 'instagram',
            date,
            title,
            duration,
            views,
            likes,
            comments,
            shares,
            subscribers,
            saves,
        });
        closeModal('instagram-modal');
    }

    // ==============================
    // 9. EXPORT / IMPORT
    // ==============================

    function exportData() {
        if (!state.videos.length) { alert('אין נתונים לייצוא'); return; }
        const data = {
            version: 1,
            exportedAt: new Date().toISOString(),
            videos: state.videos,
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jarvis-analytics-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function importData(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.videos || !Array.isArray(data.videos)) {
                    alert('קובץ לא תקין');
                    return;
                }
                const merge = confirm('למזג עם הנתונים הקיימים? (ביטול = החלפה מלאה)');
                if (merge) {
                    state.videos = state.videos.concat(data.videos);
                } else {
                    state.videos = data.videos;
                }
                saveToStorage();
                renderAll();
                alert(`יובאו ${data.videos.length} סרטונים`);
            } catch (err) {
                alert('שגיאה בקריאת הקובץ: ' + err.message);
            }
        };
        reader.readAsText(file);
    }

    // ==============================
    // 10. AI CHAT
    // ==============================

    function renderChatHistory() {
        const chatEl = document.getElementById('ai-chat');
        if (!chatEl) return;

        chatEl.innerHTML = '';

        if (state.chat.history.length === 0) {
            chatEl.innerHTML = `
                <div class="chat-message ai">
                    <div class="chat-avatar">🤖</div>
                    <div class="chat-bubble">שלום! אני כאן כדי לנתח את הנתונים שלך.<br><br>נסה לשאול:<br>• מה הסרטון הכי מצליח שלי?<br>• תן לי 3 רעיונות לסרטונים הבאים<br>• תשווה בין הפלטפורמות<br>• איך אני משיג יותר תגובות?</div>
                </div>
            `;
            return;
        }

        for (const msg of state.chat.history) {
            addChatMessageToDOM(msg.role, msg.text, false);
        }

        chatEl.scrollTop = chatEl.scrollHeight;
    }

    function addChatMessageToDOM(role, text, scroll = true) {
        const chatEl = document.getElementById('ai-chat');
        if (!chatEl) return;

        const wrapper = document.createElement('div');
        wrapper.className = `chat-message ${role === 'user' ? 'user' : 'ai'}`;

        const avatar = document.createElement('div');
        avatar.className = 'chat-avatar';
        avatar.textContent = role === 'user' ? '👤' : '🤖';

        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble';
        bubble.textContent = text;

        wrapper.appendChild(avatar);
        wrapper.appendChild(bubble);
        chatEl.appendChild(wrapper);

        if (scroll) {
            requestAnimationFrame(() => {
                chatEl.scrollTop = chatEl.scrollHeight;
            });
        }
    }

    function showTypingIndicator() {
        const chatEl = document.getElementById('ai-chat');
        if (!chatEl) return null;

        const wrapper = document.createElement('div');
        wrapper.className = 'chat-message ai';
        wrapper.id = 'typing-indicator-msg';

        const avatar = document.createElement('div');
        avatar.className = 'chat-avatar';
        avatar.textContent = '🤖';

        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble typing';
        bubble.innerHTML = '<span></span><span></span><span></span>';

        wrapper.appendChild(avatar);
        wrapper.appendChild(bubble);
        chatEl.appendChild(wrapper);

        requestAnimationFrame(() => {
            chatEl.scrollTop = chatEl.scrollHeight;
        });

        return wrapper;
    }

    function hideTypingIndicator() {
        const el = document.getElementById('typing-indicator-msg');
        if (el) el.remove();
    }

    function addChatMessage(role, text) {
        state.chat.history.push({ role, text, ts: Date.now() });
        saveChatToStorage();
        addChatMessageToDOM(role, text);
    }

    async function sendChatMessage(question) {
        if (state.chat.isSending) return;
        if (!question || !question.trim()) return;

        state.chat.isSending = true;
        const sendBtn = document.querySelector('.chat-send');
        const input = document.getElementById('chat-input');
        if (sendBtn) sendBtn.disabled = true;
        if (input) input.disabled = true;

        addChatMessage('user', question.trim());
        if (input) input.value = '';

        showTypingIndicator();

        try {
            const historyForAPI = state.chat.history
                .slice(-10)
                .filter(m => m.role && m.text)
                .map(m => ({
                    role: m.role === 'ai' ? 'assistant' : 'user',
                    content: String(m.text).slice(0, 1500),
                }));

            const res = await fetch('/api/analytics-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: question.trim(),
                    history: historyForAPI,
                    analytics: {
                        videos: state.videos,
                        summary: getTotals(state.videos),
                    },
                }),
            });

            const data = await res.json().catch(() => ({}));
            hideTypingIndicator();

            if (!res.ok) {
                const errMsg = data.reply || data.error || `HTTP ${res.status}`;
                addChatMessage('ai', `❌ ${errMsg}`);
                return;
            }

            const replyText = (data && typeof data.reply === 'string' && data.reply.trim())
                ? data.reply
                : 'מצטער, לא הצלחתי לנתח את הנתונים. נסה שוב.';

            addChatMessage('ai', replyText);
        } catch (err) {
            hideTypingIndicator();
            addChatMessage('ai', '❌ שגיאה בחיבור לשרת: ' + err.message);
        } finally {
            state.chat.isSending = false;
            if (sendBtn) sendBtn.disabled = false;
            if (input) {
                input.disabled = false;
                input.focus();
            }
        }
    }

    function clearChat() {
        if (state.chat.history.length > 0) {
            if (!confirm('לנקות את היסטוריית הצ\'אט?')) return;
        }
        state.chat.history = [];
        saveChatToStorage();
        renderChatHistory();
    }

    // ==============================
    // 11. MEGA PROMPT
    // ==============================

    async function openMegaPrompt() {
        const modal = document.getElementById('mega-modal');
        const output = document.getElementById('mega-output');
        const info = document.getElementById('mega-info');

        if (!modal || !output) {
            alert('מודאל מגה-פרומפט לא נמצא');
            return;
        }

        output.value = 'טוען...';
        if (info) info.textContent = '—';
        openModal('mega-modal');

        try {
            const res = await fetch('/api/mega-prompt', {
                method: 'GET',
                headers: { 'Accept': 'text/plain' },
            });

            if (!res.ok) {
                output.value = '❌ שגיאה: HTTP ' + res.status;
                if (info) info.textContent = 'שגיאה';
                return;
            }

            const prompt = await res.text();
            output.value = prompt;

            const lines = prompt.split('\n').length;
            const chars = prompt.length;
            if (info) info.textContent = `${lines} שורות • ${chars.toLocaleString('he-IL')} תווים`;
        } catch (err) {
            output.value = '❌ שגיאה: ' + err.message;
            if (info) info.textContent = 'שגיאה';
        }
    }

    async function copyMegaPrompt() {
        const output = document.getElementById('mega-output');
        const btn = document.getElementById('mega-copy');
        if (!output || !output.value) return;

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(output.value);
            } else {
                output.select();
                document.execCommand('copy');
                output.setSelectionRange(0, 0);
            }

            if (btn) {
                const original = btn.textContent;
                btn.textContent = '✓ הועתק!';
                btn.style.background = '#10b981';
                setTimeout(() => {
                    btn.textContent = original;
                    btn.style.background = '';
                }, 1500);
            }
        } catch (err) {
            alert('שגיאה בהעתקה: ' + err.message);
        }
    }

    // ==============================
    // 12. AI ANALYZE (נתח AI)
    // ==============================

    async function analyzeWithAI() {
        const btn = document.getElementById('btn-ai');
        if (!btn) return;

        if (!state.videos.length) {
            alert('אין סרטונים לניתוח. הוסף סרטונים קודם.');
            return;
        }

        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '⏳ מנתח...';

        try {
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videos: state.videos }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                alert('❌ שגיאה: ' + (data.reply || data.error || `HTTP ${res.status}`));
                return;
            }

            const reply = data.reply || 'לא התקבלה תשובה מהמערכת.';
            showAnalysisResult(reply);

        } catch (err) {
            alert('❌ שגיאה בחיבור לשרת: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    }

    function showAnalysisResult(text) {
        injectAnalysisModal(text);
    }

    function injectAnalysisModal(text) {
        const existing = document.getElementById('dynamic-ai-modal');
        if (existing) existing.remove();

        const existingStyle = document.getElementById('analysis-modal-styles');
        if (existingStyle) existingStyle.remove();

        const modal = document.createElement('div');
        modal.id = 'dynamic-ai-modal';
        modal.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(10, 14, 26, 0.92);
            backdrop-filter: blur(8px);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            direction: rtl;
            animation: fadeIn 0.2s ease;
        `;

        modal.innerHTML = `
            <div style="
                background: #ffffff;
                border: 1px solid rgba(212, 175, 55, 0.4);
                border-radius: 12px;
                max-width: 900px;
                width: 100%;
                max-height: 90vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
                overflow: hidden;
            ">
                <div style="
                    padding: 20px 24px;
                    border-bottom: 1px solid #eee;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #fafafa;
                    flex-shrink: 0;
                ">
                    <h2 style="
                        margin: 0;
                        color: #333;
                        font-size: 1.3rem;
                        font-family: 'Rajdhani', sans-serif;
                    ">🤖 ניתוח AI של ג'רוויס</h2>
                    <div style="display: flex; gap: 10px;">
                        <button id="copy-analysis-btn" style="
                            background: linear-gradient(135deg, #d4af37, #40e0d0);
                            border: none;
                            color: #0a0e1a;
                            padding: 8px 16px;
                            border-radius: 6px;
                            cursor: pointer;
                            font-weight: bold;
                            font-size: 0.9rem;
                        ">📋 העתק</button>
                        <button id="close-analysis-btn" style="
                            background: rgba(255, 85, 102, 0.1);
                            border: 1px solid rgba(255, 85, 102, 0.4);
                            color: #ff5566;
                            padding: 8px 14px;
                            border-radius: 6px;
                            cursor: pointer;
                            font-weight: bold;
                            font-size: 1rem;
                        ">✕</button>
                    </div>
                </div>
                <div id="analysis-content" style="
                    padding: 24px;
                    overflow-y: auto;
                    flex: 1;
                    color: #333;
                    line-height: 1.75;
                    font-family: 'Rajdhani', sans-serif;
                    font-size: 1rem;
                ">
                    ${formatAnalysisHtml(text)}
                </div>
            </div>
        `;

        const styleTag = document.createElement('style');
        styleTag.id = 'analysis-modal-styles';
        styleTag.textContent = `
            #analysis-content h1 { color: #d4af37; border-bottom: 2px solid #d4af37; padding-bottom: 8px; margin-top: 0; }
            #analysis-content h2 { color: #2a9d8f; margin-top: 24px; margin-bottom: 12px; font-size: 1.15rem; }
            #analysis-content h3 { color: #d4af37; margin-top: 20px; margin-bottom: 10px; font-size: 1.05rem; }
            #analysis-content strong { color: #b8941f; }
            #analysis-content ul, #analysis-content ol { padding-right: 24px; margin: 12px 0; }
            #analysis-content li { margin: 6px 0; }
            #analysis-content code {
                background: rgba(212, 175, 55, 0.15);
                padding: 2px 6px;
                border-radius: 3px;
                color: #b8941f;
                font-family: monospace;
                font-size: 0.9em;
            }
            #analysis-content p { margin: 10px 0; }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        `;
        document.head.appendChild(styleTag);
        document.body.appendChild(modal);

        const closeFn = () => {
            modal.remove();
            const st = document.getElementById('analysis-modal-styles');
            if (st) st.remove();
        };

        modal.querySelector('#close-analysis-btn').addEventListener('click', closeFn);

        modal.querySelector('#copy-analysis-btn').addEventListener('click', async (e) => {
            const btn = e.target;
            const plainText = modal.querySelector('#analysis-content').innerText;
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(plainText);
                } else {
                    const ta = document.createElement('textarea');
                    ta.value = plainText;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                }
                const orig = btn.textContent;
                btn.textContent = '✓ הועתק!';
                btn.style.background = '#10b981';
                setTimeout(() => {
                    btn.textContent = orig;
                    btn.style.background = 'linear-gradient(135deg, #d4af37, #40e0d0)';
                }, 1500);
            } catch (err) {
                alert('שגיאה בהעתקה: ' + err.message);
            }
        });

        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeFn();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeFn();
        });
    }

    function formatAnalysisHtml(text) {
        if (!text) return '';
        let html = escapeHtml(text);

        html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.*)$/gm, '<h1>$1</h1>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/`(.+?)`/g, '<code>$1</code>');
        html = html.replace(/^[\*\-] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => '<ul>' + match + '</ul>');

        html = html.split('\n\n').map(p => {
            const trimmed = p.trim();
            if (!trimmed) return '';
            if (/^<[hul]/.test(trimmed)) return trimmed;
            return '<p>' + trimmed.replace(/\n/g, '<br>') + '</p>';
        }).join('\n');

        return html;
    }
    // ==============================
    // 12.5. 🆕 DROPDOWN
    // ==============================

    function toggleAddDropdown() {
        const btn = document.getElementById('btn-add-dropdown');
        const menu = document.getElementById('add-dropdown-menu');
        if (!btn || !menu) return;

        const isOpen = !menu.hidden;
        menu.hidden = isOpen;
        btn.setAttribute('aria-expanded', String(!isOpen));
    }

    function closeAddDropdown() {
        const btn = document.getElementById('btn-add-dropdown');
        const menu = document.getElementById('add-dropdown-menu');
        if (!btn || !menu) return;
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
    }

    function setupDropdown() {
        const btn = document.getElementById('btn-add-dropdown');
        const menu = document.getElementById('add-dropdown-menu');
        if (!btn || !menu) return;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleAddDropdown();
        });

        // לחיצה על פריט בתפריט → סוגר את התפריט
        menu.querySelectorAll('.dropdown-item').forEach((item) => {
            item.addEventListener('click', () => {
                closeAddDropdown();
            });
        });

        // לחיצה מחוץ לתפריט → סוגר
        document.addEventListener('click', (e) => {
            if (!btn.contains(e.target) && !menu.contains(e.target)) {
                closeAddDropdown();
            }
        });

        // Escape → סוגר
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !menu.hidden) {
                closeAddDropdown();
            }
        });
    }

    // ==============================
    // 13. EVENTS
    // ==============================
       
    function attachEvents() {
         // === 🆕 Dropdown Setup ===
        setupDropdown();


        const btnAdd = document.getElementById('btn-add');
        if (btnAdd) btnAdd.addEventListener('click', openAddModal);

        const btnYouTube = document.getElementById('btn-youtube');
        if (btnYouTube) btnYouTube.addEventListener('click', openYouTubeModal);

        const btnTikTok = document.getElementById('btn-tiktok');
        if (btnTikTok) btnTikTok.addEventListener('click', openTikTokModal);

        const btnInstagram = document.getElementById('btn-instagram');
        if (btnInstagram) btnInstagram.addEventListener('click', openInstagramModal);

        const btnPaste = document.getElementById('btn-paste');
        if (btnPaste) btnPaste.addEventListener('click', () => openModal('paste-modal'));

        const btnMega = document.getElementById('btn-mega');
        if (btnMega) btnMega.addEventListener('click', openMegaPrompt);

        const btnAi = document.getElementById('btn-ai');
        if (btnAi) btnAi.addEventListener('click', analyzeWithAI);

        const btnExport = document.getElementById('btn-export');
        if (btnExport) btnExport.addEventListener('click', exportData);

        const btnImport = document.getElementById('btn-import');
        if (btnImport) {
            btnImport.addEventListener('click', () => {
                const imp = document.getElementById('import-file');
                if (imp) imp.click();
            });
        }

        const importFile = document.getElementById('import-file');
        if (importFile) {
            importFile.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    importData(e.target.files[0]);
                    e.target.value = '';
                }
            });
        }

        // === Form Submits ===
        const addSubmit = document.getElementById('add-submit');
        if (addSubmit) addSubmit.addEventListener('click', submitAdd);

        const pasteSubmit = document.getElementById('paste-submit');
        if (pasteSubmit) pasteSubmit.addEventListener('click', submitPaste);

        const editSubmit = document.getElementById('edit-submit');
        if (editSubmit) editSubmit.addEventListener('click', submitEdit);

        const megaCopy = document.getElementById('mega-copy');
        if (megaCopy) megaCopy.addEventListener('click', copyMegaPrompt);

        // === YouTube Modal Buttons ===
        const ytFetch = document.getElementById('yt-fetch');
        if (ytFetch) ytFetch.addEventListener('click', fetchYouTubeData);

        const ytConfirm = document.getElementById('yt-confirm');
        if (ytConfirm) ytConfirm.addEventListener('click', confirmYouTubeAdd);

        const ytUrl = document.getElementById('yt-url');
        if (ytUrl) {
            ytUrl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    fetchYouTubeData();
                }
            });
        }

        // === TikTok Modal Buttons ===
        const ttFetch = document.getElementById('tt-fetch');
        if (ttFetch) ttFetch.addEventListener('click', fetchTikTokData);

        const ttConfirm = document.getElementById('tt-confirm');
        if (ttConfirm) ttConfirm.addEventListener('click', confirmTikTokAdd);

        const ttUrl = document.getElementById('tt-url');
        if (ttUrl) {
            ttUrl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    fetchTikTokData();
                }
            });
        }

        // === Instagram Modal Buttons ===
        const igConfirm = document.getElementById('ig-confirm');
        if (igConfirm) igConfirm.addEventListener('click', confirmInstagramAdd);

        // === Close buttons ===
        document.querySelectorAll('[data-close]').forEach((btn) => {
            btn.addEventListener('click', () => closeModal(btn.dataset.close));
        });

        // === Filters ===
        const filterPlatform = document.getElementById('filter-platform');
        if (filterPlatform) {
            filterPlatform.addEventListener('change', (e) => {
                state.filters.platform = e.target.value;
                renderTopBottom();
                renderTable();
            });
        }

        const sortBy = document.getElementById('sort-by');
        if (sortBy) {
            sortBy.addEventListener('change', (e) => {
                state.filters.sortBy = e.target.value;
                renderTopBottom();
                renderTable();
            });
        }

        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                state.filters.search = e.target.value.trim();
                renderTopBottom();
                renderTable();
            });
        }

        // === Chat form ===
        const chatForm = document.getElementById('chat-form');
        const chatInput = document.getElementById('chat-input');
        if (chatForm) {
            chatForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const q = chatInput ? chatInput.value.trim() : '';
                if (q) sendChatMessage(q);
            });
        }

        if (chatInput) {
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (chatForm) chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
                }
            });

            chatInput.addEventListener('input', () => {
                chatInput.style.height = 'auto';
                chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + 'px';
            });
        }

        // === Suggestion chips ===
        document.querySelectorAll('.suggestion-chip, .chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                const q = chip.dataset.q || chip.dataset.prompt;
                if (q && chatInput && chatForm) {
                    chatInput.value = q;
                    chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
                }
            });
        });

        // === Escape key ===
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal:not([hidden])').forEach((m) => m.hidden = true);
            }
        });
    }

    // ==============================
    // 14. SEED DATA
    // ==============================

    function seedIfEmpty() {
        if (state.videos.length > 0) return;

        const seed = [
            { platform: 'youtube', date: '2026-09-16', title: 'Did gravity just glitch? 🌌', duration: 8, views: 1124, likes: 14, comments: 3 },
            { platform: 'youtube', date: '2026-09-16', title: 'Day 1 of unlocking Full Planche', duration: 14, views: 1124, likes: 10, comments: 0 },
            { platform: 'youtube', date: '2026-09-17', title: 'Road to Full Planche | Day 2', duration: 12, views: 1202, likes: 8, comments: 0 },
            { platform: 'youtube', date: '2026-09-17', title: 'Night Calisthenics Session', duration: 28, views: 1166, likes: 11, comments: 0 },
            { platform: 'youtube', date: '2026-09-18', title: 'ROAD TO FULL PLANCHE — Day 3', duration: 11, views: 1194, likes: 5, comments: 0 },
            { platform: 'youtube', date: '2026-09-20', title: 'Day 4 — Straddle Planche Unlocked', duration: 9, views: 1280, likes: 8, comments: 0 },
            { platform: 'youtube', date: '2026-09-21', title: 'Day 5 — Full Planche', duration: 10, views: 1300, likes: 7, comments: 0 },
            { platform: 'youtube', date: '2026-09-23', title: 'Day 7 — One Week In 💪', duration: 11, views: 1338, likes: 6, comments: 0 },
            { platform: 'tiktok', date: '2026-09-16', title: 'Did gravity just glitch?', duration: 7, views: 487, likes: 14, comments: 2 },
            { platform: 'tiktok', date: '2026-09-16', title: 'Day 1 — Planche Journey', duration: 13, views: 760, likes: 24, comments: 1 },
            { platform: 'tiktok', date: '2026-09-17', title: 'Day 2 — Road to Planche', duration: 11, views: 578, likes: 10, comments: 0 },
            { platform: 'tiktok', date: '2026-09-17', title: 'Night Calisthenics Session', duration: 27, views: 511, likes: 11, comments: 0 },
            { platform: 'tiktok', date: '2026-09-18', title: 'Day 3 — ROAD TO PLANCHE', duration: 10, views: 517, likes: 13, comments: 3 },
            { platform: 'tiktok', date: '2026-09-19', title: 'POV: The Bar Is Not My Friend', duration: 12, views: 504, likes: 14, comments: 0 },
            { platform: 'tiktok', date: '2026-09-20', title: 'יום 4 — סטראדל', duration: 8, views: 469, likes: 6, comments: 5 },
            { platform: 'tiktok', date: '2026-09-21', title: 'יום 5 — פול פלאנץ', duration: 9, views: 843, likes: 20, comments: 2 },
            { platform: 'tiktok', date: '2026-09-22', title: 'יום 6 — פול פלאנץ', duration: 9, views: 463, likes: 11, comments: 3 },
            { platform: 'tiktok', date: '2026-09-23', title: 'יום 7 — שבוע בפול פלאנץ', duration: 11, views: 526, likes: 9, comments: 1 },
            { platform: 'instagram', date: '2026-09-16', title: 'Instagram Reel 7', duration: 7.3, views: 1243, likes: 48, comments: 15 },
            { platform: 'instagram', date: '2026-09-16', title: 'Instagram Reel 8', duration: 13.2, views: 898, likes: 39, comments: 13 },
            { platform: 'instagram', date: '2026-09-17', title: 'Instagram Reel 4', duration: 27.9, views: 538, likes: 26, comments: 8 },
            { platform: 'instagram', date: '2026-09-17', title: 'Instagram Reel 6', duration: 11.6, views: 657, likes: 23, comments: 4 },
            { platform: 'instagram', date: '2026-09-18', title: 'Instagram Reel 1', duration: 10.6, views: 434, likes: 19, comments: 1 },
            { platform: 'instagram', date: '2026-09-19', title: 'Instagram Reel 3', duration: 12.7, views: 444, likes: 25, comments: 4 },
            { platform: 'instagram', date: '2026-09-20', title: 'Instagram Reel 5', duration: 8.7, views: 803, likes: 22, comments: 4 },
            { platform: 'instagram', date: '2026-09-21', title: 'Instagram Reel 9', duration: 9.4, views: 1451, likes: 41, comments: 4 },
            { platform: 'instagram', date: '2026-09-22', title: 'Instagram Reel 2', duration: 9.7, views: 552, likes: 18, comments: 1 },
            { platform: 'instagram', date: '2026-09-23', title: 'Instagram Reel 10', duration: 10.2, views: 619, likes: 23, comments: 3 },
        ];

        for (const item of seed) {
            addVideo(item);
        }

        console.info(`[analytics] seeded ${seed.length} videos`);
    }

    // ==============================
    // 15. INIT
    // ==============================

    function init() {
        state.videos = loadFromStorage();
        seedIfEmpty();

        state.chat.history = loadChatFromStorage();

        attachEvents();
        renderAll();
        renderChatHistory();
        updateFooter();

        console.info(`[analytics] initialized — ${state.videos.length} videos, ${state.chat.history.length} chat messages`);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

})();