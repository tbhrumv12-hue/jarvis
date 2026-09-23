/**
 * ⚡ J.A.R.V.I.S // ANALYTICS v1.0
 * Dashboard לניתוח ביצועי תוכן ב-3 פלטפורמות
 */

(function () {
    'use strict';

    // ==============================
    // 1. CONFIG
    // ==============================

    const CONFIG = {
        storageKey: 'jarvis_analytics_v1',
        platforms: {
            youtube: { name: 'YouTube', icon: '🎬', color: '#ff3d57' },
            tiktok: { name: 'TikTok', icon: '📱', color: '#82d8ff' },
            instagram: { name: 'Instagram', icon: '📸', color: '#d4af37' },
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
        if (!sec && sec !== 0) return '—';
        if (sec < 60) return sec.toFixed(1) + 's';
        const m = Math.floor(sec / 60);
        const s = Math.round(sec % 60);
        return `${m}:${String(s).padStart(2, '0')}`;
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

    function updateFooter() {
        const el = $('#footer-updated');
        if (el) el.textContent = 'עדכון אחרון: ' + new Date().toLocaleString('he-IL');
    }

    // ==============================
    // 5. CALCULATIONS
    // ==============================

    function getRatio(video) {
        if (!video.views) return 0;
        return (video.likes / video.views) * 100;
    }

    function getCommentRatio(video) {
        if (!video.views) return 0;
        return (video.comments / video.views) * 100;
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
        $('#sum-views').textContent = formatNumber(totals.views);
        $('#sum-likes').textContent = formatNumber(totals.likes);
        $('#sum-comments').textContent = formatNumber(totals.comments);
        $('#sum-videos').textContent = formatNumber(totals.count);
        $('#sum-ratio').textContent = formatPercent(totals.ratio);
        $('#sum-comment-ratio').textContent = formatPercent(totals.commentRatio);
    }

    function renderPlatforms() {
        const byPlatform = getByPlatform(state.videos);
        const allTotals = getTotals(state.videos);
        const maxViews = Math.max(
            getTotals(byPlatform.youtube).views,
            getTotals(byPlatform.tiktok).views,
            getTotals(byPlatform.instagram).views,
            1
        );

        // YouTube
        const yt = getTotals(byPlatform.youtube);
        $('#yt-views').textContent = formatNumber(yt.views);
        $('#yt-likes').textContent = formatNumber(yt.likes);
        $('#yt-comments').textContent = formatNumber(yt.comments);
        $('#yt-count').textContent = formatNumber(yt.count);
        $('#yt-bar').style.width = (yt.views / maxViews) * 100 + '%';

        // TikTok
        const tt = getTotals(byPlatform.tiktok);
        $('#tt-views').textContent = formatNumber(tt.views);
        $('#tt-likes').textContent = formatNumber(tt.likes);
        $('#tt-comments').textContent = formatNumber(tt.comments);
        $('#tt-count').textContent = formatNumber(tt.count);
        $('#tt-bar').style.width = (tt.views / maxViews) * 100 + '%';

        // Instagram
        const ig = getTotals(byPlatform.instagram);
        $('#ig-views').textContent = formatNumber(ig.views);
        $('#ig-likes').textContent = formatNumber(ig.likes);
        $('#ig-comments').textContent = formatNumber(ig.comments);
        $('#ig-count').textContent = formatNumber(ig.count);
        $('#ig-bar').style.width = (ig.views / maxViews) * 100 + '%';
    }

    function getFilteredVideos() {
        let videos = state.videos.slice();

        // Filter by platform
        if (state.filters.platform !== 'all') {
            videos = videos.filter((v) => v.platform === state.filters.platform);
        }

        // Search
        if (state.filters.search) {
            const q = state.filters.search.toLowerCase();
            videos = videos.filter((v) => (v.title || '').toLowerCase().includes(q));
        }

        // Sort
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

        // Top by views
        const topViews = [...videos].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
        // Top by likes ratio
        const topLikes = [...videos].filter((v) => v.views > 100).sort((a, b) => getRatio(b) - getRatio(a)).slice(0, 5);
        // Bottom by views
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
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:30px;color:var(--text-dim);">אין נתונים להצגה</td></tr>';
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
                    <td class="col-ratio">${formatPercent(ratio)}</td>
                    <td class="col-actions">
                        <button class="row-btn" data-edit="${v.id}" title="ערוך">✏️</button>
                        <button class="row-btn danger" data-delete="${v.id}" title="מחק">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');

        // Attach handlers
        tbody.querySelectorAll('[data-edit]').forEach((btn) => {
            btn.addEventListener('click', () => openEditModal(btn.dataset.edit));
        });
        tbody.querySelectorAll('[data-delete]').forEach((btn) => {
            btn.addEventListener('click', () => deleteVideo(btn.dataset.delete));
        });
    }

    function escapeHtml(s) {
        if (typeof s !== 'string') return '';
        return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
        // Reset form
        $('#f-platform').value = 'youtube';
        $('#f-date').value = new Date().toISOString().split('T')[0];
        $('#f-title').value = '';
        $('#f-duration').value = '';
        $('#f-views').value = '';
        $('#f-likes').value = 0;
        $('#f-comments').value = 0;
        $('#f-shares').value = 0;
        $('#f-id').value = '';
        openModal('add-modal');
    }

    function submitAdd() {
        const data = {
            platform: $('#f-platform').value,
            date: $('#f-date').value,
            title: $('#f-title').value.trim(),
            duration: $('#f-duration').value,
            views: $('#f-views').value,
            likes: $('#f-likes').value,
            comments: $('#f-comments').value,
            shares: $('#f-shares').value,
            id: $('#f-id').value.trim() || undefined,
        };

        if (!data.title) {
            alert('חובה למלא כותרת');
            return;
        }
        if (!data.views && data.views !== 0) {
            alert('חובה למלא צפיות');
            return;
        }

        addVideo(data);
        closeModal('add-modal');
    }

    function openEditModal(id) {
        const v = state.videos.find((x) => x.id === id);
        if (!v) return;
        $('#e-id').value = v.id;
        $('#e-platform').value = v.platform;
        $('#e-date').value = v.date;
        $('#e-title').value = v.title;
        $('#e-duration').value = v.duration;
        $('#e-views').value = v.views;
        $('#e-likes').value = v.likes;
        $('#e-comments').value = v.comments;
        $('#e-shares').value = v.shares;
        openModal('edit-modal');
    }

    function submitEdit() {
        const id = $('#e-id').value;
        const data = {
            platform: $('#e-platform').value,
            date: $('#e-date').value,
            title: $('#e-title').value.trim(),
            duration: $('#e-duration').value,
            views: $('#e-views').value,
            likes: $('#e-likes').value,
            comments: $('#e-comments').value,
            shares: $('#e-shares').value,
        };
        if (!data.title) { alert('חובה למלא כותרת'); return; }
        updateVideo(id, data);
        closeModal('edit-modal');
    }

    function submitPaste() {
        const raw = $('#paste-input').value.trim();
        if (!raw) { alert('הדבק נתונים קודם'); return; }

        const lines = raw.split('\n').filter((l) => l.trim());
        let added = 0;
        let errors = 0;

        for (const line of lines) {
            // Try tab-separated first, then comma
            let parts = line.split('\t').map((p) => p.trim());
            if (parts.length < 3) parts = line.split(',').map((p) => p.trim());
            if (parts.length < 3) { errors++; continue; }

            // Expected: platform | date | title | duration | views | likes | comments
            const [platform, date, title, duration, views, likes, comments] = parts;
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
            });
            added++;
        }

        closeModal('paste-modal');
        $('#paste-input').value = '';
        alert(`נוספו ${added} סרטונים. ${errors ? 'שגיאות: ' + errors : ''}`);
    }

    function normalizeDate(dateStr) {
        if (!dateStr) return new Date().toISOString().split('T')[0];
        // Try to parse DD/MM/YYYY or YYYY-MM-DD
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
    // 10. AI ANALYSIS
    // ==============================

    async function runAIAnalysis() {
        if (!state.videos.length) {
            alert('אין נתונים לניתוח');
            return;
        }

        const el = $('#ai-insights');
        el.innerHTML = '<div class="ai-loading">⏳ ג\'רוויס מנתח את הנתונים...</div>';

        try {
            const res = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videos: state.videos }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.reply || data.error || 'שגיאה');

            el.textContent = data.reply || 'אין תשובה';
        } catch (err) {
            el.innerHTML = `<div class="ai-placeholder">❌ שגיאה: ${escapeHtml(err.message)}</div>`;
        }
    }

    // ==============================
    // 11. EVENTS
    // ==============================

    function attachEvents() {
        // Add
        $('#btn-add').addEventListener('click', openAddModal);
        $('#add-submit').addEventListener('click', submitAdd);

        // Paste
        $('#btn-paste').addEventListener('click', () => openModal('paste-modal'));
        $('#paste-submit').addEventListener('click', submitPaste);

        // Edit
        $('#edit-submit').addEventListener('click', submitEdit);

        // AI
        $('#btn-ai').addEventListener('click', runAIAnalysis);

        // Export / Import
        $('#btn-export').addEventListener('click', exportData);
        $('#btn-import').addEventListener('click', () => $('#import-file').click());
        $('#import-file').addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                importData(e.target.files[0]);
                e.target.value = '';
            }
        });

        // Close buttons
        document.querySelectorAll('[data-close]').forEach((btn) => {
            btn.addEventListener('click', () => closeModal(btn.dataset.close));
        });

        // Filters
        $('#filter-platform').addEventListener('change', (e) => {
            state.filters.platform = e.target.value;
            renderTopBottom();
            renderTable();
        });

        $('#sort-by').addEventListener('change', (e) => {
            state.filters.sortBy = e.target.value;
            renderTopBottom();
            renderTable();
        });

        $('#search-input').addEventListener('input', (e) => {
            state.filters.search = e.target.value.trim();
            renderTopBottom();
            renderTable();
        });

        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal:not([hidden])').forEach((m) => m.hidden = true);
            }
        });
    }

    // ==============================
    // 12. SEED DATA (פעם ראשונה)
    // ==============================

    function seedIfEmpty() {
        if (state.videos.length > 0) return;

        const seed = [
            // YouTube
            { platform: 'youtube', date: '2026-09-16', title: 'Did gravity just glitch? 🌌', duration: 8, views: 1124, likes: 14, comments: 3 },
            { platform: 'youtube', date: '2026-09-16', title: 'Day 1 of unlocking Full Planche', duration: 14, views: 1124, likes: 10, comments: 0 },
            { platform: 'youtube', date: '2026-09-17', title: 'Road to Full Planche | Day 2', duration: 12, views: 1202, likes: 8, comments: 0 },
            { platform: 'youtube', date: '2026-09-18', title: 'ROAD TO FULL PLANCHE — Day 3', duration: 11, views: 1194, likes: 5, comments: 0 },
            { platform: 'youtube', date: '2026-09-20', title: 'Day 4 — Straddle Planche Unlocked', duration: 9, views: 1280, likes: 8, comments: 0 },
            { platform: 'youtube', date: '2026-09-21', title: 'Day 5 — Full Planche', duration: 10, views: 1300, likes: 7, comments: 0 },
            { platform: 'youtube', date: '2026-09-17', title: 'Night Calisthenics Session', duration: 28, views: 1166, likes: 11, comments: 0 },
            // TikTok
            { platform: 'tiktok', date: '2026-09-22', title: 'יום 6 — פול פלאנץ', duration: 9, views: 463, likes: 11, comments: 3 },
            { platform: 'tiktok', date: '2026-09-21', title: 'יום 5 — פול פלאנץ', duration: 9, views: 843, likes: 20, comments: 2 },
            { platform: 'tiktok', date: '2026-09-20', title: 'יום 4 — סטראדל', duration: 8, views: 469, likes: 6, comments: 5 },
            { platform: 'tiktok', date: '2026-09-19', title: 'POV: The Bar Is Not My Friend', duration: 12, views: 504, likes: 14, comments: 0 },
            { platform: 'tiktok', date: '2026-09-18', title: 'Day 3 — ROAD TO PLANCHE', duration: 10, views: 517, likes: 13, comments: 3 },
            { platform: 'tiktok', date: '2026-09-17', title: 'Night Calisthenics Session', duration: 27, views: 511, likes: 11, comments: 0 },
            { platform: 'tiktok', date: '2026-09-17', title: 'Day 2 — Road to Planche', duration: 11, views: 578, likes: 10, comments: 0 },
            { platform: 'tiktok', date: '2026-09-16', title: 'Day 1 — Planche Journey', duration: 13, views: 760, likes: 24, comments: 1 },
            { platform: 'tiktok', date: '2026-09-16', title: 'Did gravity just glitch?', duration: 7, views: 487, likes: 14, comments: 2 },
            // Instagram
            { platform: 'instagram', date: '2026-09-18', title: 'Instagram Reel 1', duration: 10.6, views: 434, likes: 19, comments: 1 },
            { platform: 'instagram', date: '2026-09-22', title: 'Instagram Reel 2', duration: 9.7, views: 552, likes: 18, comments: 1 },
            { platform: 'instagram', date: '2026-09-19', title: 'Instagram Reel 3', duration: 12.7, views: 444, likes: 25, comments: 4 },
            { platform: 'instagram', date: '2026-09-17', title: 'Instagram Reel 4', duration: 27.9, views: 538, likes: 26, comments: 8 },
            { platform: 'instagram', date: '2026-09-20', title: 'Instagram Reel 5', duration: 8.7, views: 803, likes: 22, comments: 4 },
            { platform: 'instagram', date: '2026-09-17', title: 'Instagram Reel 6', duration: 11.6, views: 657, likes: 23, comments: 4 },
            { platform: 'instagram', date: '2026-09-16', title: 'Instagram Reel 7', duration: 7.3, views: 1243, likes: 48, comments: 15 },
            { platform: 'instagram', date: '2026-09-16', title: 'Instagram Reel 8', duration: 13.2, views: 898, likes: 39, comments: 13 },
            { platform: 'instagram', date: '2026-09-21', title: 'Instagram Reel 9', duration: 9.4, views: 1451, likes: 41, comments: 4 },
        ];

        for (const item of seed) {
            addVideo(item);
        }

        console.info(`[analytics] seeded ${seed.length} videos`);
    }

    // ==============================
    // 13. INIT
    // ==============================

    function init() {
        state.videos = loadFromStorage();
        seedIfEmpty();
        attachEvents();
        renderAll();
        updateFooter();
        console.info(`[analytics] initialized — ${state.videos.length} videos`);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

})();