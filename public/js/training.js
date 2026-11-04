/* ═══════════════════════════════════════════════════════════════════
   J.A.R.V.I.S // TRAINING — Client Logic v2.0
   AI workout generator + progress tracker + floating coach chat
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ─────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────

    const STORAGE_KEY = 'jarvis_training_v1';
    const MAX_TODAY_WORKOUTS = 10;
    const MIN_REQUEST_LENGTH = 3;
    const MAX_REQUEST_LENGTH = 500;

    // ─────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────

    const state = {
        mode: 'short',
        currentWorkout: null,
        generating: false,
        saving: false,
        analyzing: false,
    };

    const coachState = {
        open: false,
    };

    // The follow-up coach has two surfaces that share the same render/send code:
    //   floating → the FAB (general coach, no workout attached)
    //   inline   → the panel under the generated workout (workout attached)
    const COACH_UI = {
        floating: {
            messages: 'coach-messages',
            input: 'coach-input',
            send: 'coach-send',
            history: [],
            loading: false,
            workout: null,
        },
        inline: {
            messages: 'coach-inline-messages',
            input: 'coach-inline-input',
            send: 'coach-inline-send',
            history: [],
            loading: false,
            workout: null,
        },
    };

    const COACH_HISTORY_LIMIT = 12;
    const COACH_CONTEXT_MAX_EXERCISES = 14;

    // ─────────────────────────────────────────────────────────────
    // DOM helpers
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
        html = html.replace(/^\s*[-•]\s+(.+)$/gm, '<span style="color: var(--turquoise); margin-right: 4px;">•</span> $1');
        html = html.replace(/\n{2,}/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');
        return `<p>${html}</p>`;
    }

    // ─────────────────────────────────────────────────────────────
    // Date helpers
    // ─────────────────────────────────────────────────────────────

    function todayKey() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function formatHebrewDate(iso) {
        if (!iso || typeof iso !== 'string') return '—';
        const parts = iso.split('-');
        if (parts.length !== 3) return iso;
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    function nowTimeHHMM() {
        return new Date().toLocaleTimeString('he-IL', {
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    // ─────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────

    function loadStore() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return { version: 1, days: {} };
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return { version: 1, days: {} };
            if (!parsed.days || typeof parsed.days !== 'object') parsed.days = {};
            return parsed;
        } catch (err) {
            console.warn('[Training] loadStore failed:', err);
            return { version: 1, days: {} };
        }
    }

    function saveStore(store) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
            return true;
        } catch (err) {
            console.warn('[Training] saveStore failed:', err);
            showError('שמירה נכשלה — ייתכן שהאחסון המקומי מלא');
            return false;
        }
    }

    function getToday() {
        const store = loadStore();
        const key = todayKey();
        if (!store.days[key]) {
            store.days[key] = { date: key, workouts: [] };
            saveStore(store);
        }
        return { store, today: store.days[key], key };
    }

    // ─────────────────────────────────────────────────────────────
    // UI Feedback
    // ─────────────────────────────────────────────────────────────

    let errorTimer = null;

    function showError(message) {
        const box = $('error-box');
        const txt = $('error-text');
        if (!box || !txt) return;
        txt.textContent = String(message || 'שגיאה לא ידועה');
        box.hidden = false;
        if (errorTimer) clearTimeout(errorTimer);
        errorTimer = setTimeout(() => {
            box.hidden = true;
        }, 6000);
    }

    function hideError() {
        const box = $('error-box');
        if (box) box.hidden = true;
    }

    function setLoading(on, subtext) {
        const loadingEl = $('loading');
        const btn = $('btn-generate');
        const input = $('request-input');

        if (loadingEl) loadingEl.hidden = !on;
        if (btn) btn.disabled = on;
        if (input) input.disabled = on;

        if (on && subtext) {
            const sub = document.querySelector('.loading-subtext');
            if (sub) sub.textContent = subtext;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Normalize AI workout response
    // ─────────────────────────────────────────────────────────────

    function toNumber(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function normalizeExercise(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const name = String(raw.name || '').trim();
        if (!name) return null;

        const category = String(raw.category || '').toLowerCase().trim();
        const validCategory = ['skill', 'strength', 'core'].includes(category) ? category : 'strength';

        return {
            name,
            category: validCategory,
            sets: Math.max(1, Math.round(toNumber(raw.sets, 3))),
            reps: String(raw.reps || '—').trim(),
            rest: String(raw.rest || '2 דק׳').trim(),
            note: String(raw.note || raw.notes || '').trim(),
            done: false,
            actual: '',
        };
    }

    function normalizeWorkout(raw) {
        if (!raw || typeof raw !== 'object') {
            throw new Error('תגובת AI לא תקינה');
        }

        const exercises = Array.isArray(raw.exercises)
            ? raw.exercises.map(normalizeExercise).filter(Boolean)
            : [];

        if (exercises.length === 0) {
            throw new Error('ה-AI לא הציע תרגילים');
        }

        return {
            title: String(raw.title || 'אימון יומי').trim(),
            summary: String(raw.summary || '').trim(),
            durationMinutes: Math.max(10, Math.round(toNumber(raw.durationMinutes, 45))),
            exercises,
        };
    }

    // ─────────────────────────────────────────────────────────────
    // Workout context → server (follow-up coach)
    // ─────────────────────────────────────────────────────────────

    function buildWorkoutPayload(workout) {
        if (!workout || !Array.isArray(workout.exercises) || workout.exercises.length === 0) {
            return null;
        }

        return {
            title: String(workout.title || '').slice(0, 120),
            summary: String(workout.summary || '').slice(0, 400),
            mode: state.mode,
            durationMinutes: workout.durationMinutes,
            exercises: workout.exercises.slice(0, COACH_CONTEXT_MAX_EXERCISES).map((ex) => ({
                name: ex.name,
                category: ex.category,
                sets: ex.sets,
                reps: ex.reps,
                rest: ex.rest,
                note: ex.note,
                done: Boolean(ex.done),
                actual: ex.actual,
            })),
        };
    }

    // ─────────────────────────────────────────────────────────────
    // Render Workout
    // ─────────────────────────────────────────────────────────────

    function renderWorkout(workout) {
        const section = $('workout-section');
        const list = $('exercises-list');
        if (!section || !list) return;

        const titleEl = $('workout-title');
        if (titleEl) titleEl.textContent = `🎯 ${workout.title}`;

        const badge = $('workout-badge');
        if (badge) badge.textContent = state.mode === 'short' ? '🎯 קצר' : '🔥 ארוך';

        const durEl = $('workout-duration');
        if (durEl) durEl.textContent = `${workout.durationMinutes} דק׳`;

        const countEl = $('workout-count');
        if (countEl) countEl.textContent = workout.exercises.length;

        const totalSets = workout.exercises.reduce((sum, ex) => sum + ex.sets, 0);
        const setsEl = $('workout-sets');
        if (setsEl) setsEl.textContent = totalSets;

        list.innerHTML = workout.exercises.map((ex, idx) => {
            const categoryClass = ex.category;
            const doneClass = ex.done ? ' done' : '';
            const checkMark = ex.done ? '✓' : '';

            const noteHtml = ex.note
                ? `<div class="exercise-note">💡 ${escapeHtml(ex.note)}</div>`
                : '';

            return `
                <div class="exercise-item${doneClass}" data-exercise-idx="${idx}" data-category="${categoryClass}">
                    <button type="button" class="exercise-checkbox" data-toggle="${idx}" aria-label="סמן כבוצע">${checkMark}</button>
                    <div class="exercise-body">
                        <div class="exercise-header">
                            <span class="exercise-name">${escapeHtml(ex.name)}</span>
                            <span class="exercise-category ${categoryClass}">${categoryClass}</span>
                        </div>
                        <div class="exercise-details">
                            <span class="exercise-chip sets">${ex.sets} סטים</span>
                            <span class="exercise-chip">${escapeHtml(ex.reps)}</span>
                            <span class="exercise-chip rest">⏱ ${escapeHtml(ex.rest)}</span>
                        </div>
                        ${noteHtml}
                        <div class="exercise-actual">
                            <label>בפועל:</label>
                            <input
                                type="text"
                                class="exercise-actual-input"
                                data-actual="${idx}"
                                placeholder="למשל: 3x10, הרגשתי חזק"
                                value="${escapeHtml(ex.actual)}"
                            >
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        section.hidden = false;

        setTimeout(() => {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }

    // ─────────────────────────────────────────────────────────────
    // Render Today
    // ─────────────────────────────────────────────────────────────

    function renderToday() {
        const section = $('today-section');
        const list = $('today-list');
        const count = $('today-count');
        if (!section || !list) return;

        const { today } = getToday();
        const workouts = today.workouts || [];

        if (workouts.length === 0) {
            section.hidden = true;
            if (count) count.textContent = '(0)';
            return;
        }

        section.hidden = false;
        if (count) count.textContent = `(${workouts.length})`;

        list.innerHTML = workouts.map((w, idx) => {
            const exerciseCount = Array.isArray(w.exercises) ? w.exercises.length : 0;
            const totalSets = Array.isArray(w.exercises)
                ? w.exercises.reduce((sum, ex) => sum + (ex.sets || 0), 0)
                : 0;

            return `
                <div class="today-workout">
                    <div class="today-workout-body">
                        <div class="today-workout-title">${escapeHtml(w.title)}</div>
                        <div class="today-workout-meta">
                            <span>${exerciseCount} תרגילים</span>
                            <span>${totalSets} סטים</span>
                            <span>${w.durationMinutes || 0} דק׳</span>
                        </div>
                    </div>
                    <span class="today-workout-time">${escapeHtml(w.time || '')}</span>
                    <button type="button" class="today-workout-remove" data-remove="${idx}" aria-label="הסר">✕</button>
                </div>
            `;
        }).join('');
    }

    // ─────────────────────────────────────────────────────────────
    // Render Insights
    // ─────────────────────────────────────────────────────────────

    function renderInsights(text) {
        const section = $('insights-section');
        const el = $('insights-text');
        if (!section || !el) return;

        const value = String(text || '').trim();
        if (!value) {
            section.hidden = true;
            return;
        }

        section.hidden = false;
        el.innerHTML = formatMarkdownLight(value);
    }

    // ─────────────────────────────────────────────────────────────
    // Render History (7 days)
    // ─────────────────────────────────────────────────────────────

    function renderHistory() {
        const section = $('history-section');
        const list = $('history-list');
        if (!section || !list) return;

        const store = loadStore();
        const keys = Object.keys(store.days || {}).sort().reverse();
        const todayK = todayKey();
        const past = keys.filter((k) => k !== todayK).slice(0, 7);

        if (past.length === 0) {
            section.hidden = true;
            return;
        }

        section.hidden = false;
        list.innerHTML = past.map((k) => {
            const d = store.days[k] || {};
            const workouts = Array.isArray(d.workouts) ? d.workouts : [];
            const totalExercises = workouts.reduce((sum, w) => sum + (w.exercises?.length || 0), 0);
            const titles = workouts.map((w) => w.title).join(' • ');

            return `
                <div class="history-row">
                    <span class="history-date">${escapeHtml(formatHebrewDate(k))}</span>
                    <span class="history-detail">${escapeHtml(titles || '—')}</span>
                    <span class="history-count">${workouts.length} אימונים / ${totalExercises} תרגילים</span>
                </div>
            `;
        }).join('');
    }

    // ─────────────────────────────────────────────────────────────
    // Render History Modal
    // ─────────────────────────────────────────────────────────────

    function renderHistoryModal() {
        const body = $('history-modal-body');
        if (!body) return;

        const store = loadStore();
        const keys = Object.keys(store.days || {}).sort().reverse();

        if (keys.length === 0) {
            body.innerHTML = '<div class="modal-empty">אין היסטוריית אימונים עדיין</div>';
            return;
        }

        const html = keys.map((k) => {
            const d = store.days[k] || {};
            const workouts = Array.isArray(d.workouts) ? d.workouts : [];

            if (workouts.length === 0) return '';

            return workouts.map((w) => {
                const exerciseChips = (w.exercises || []).map((ex) =>
                    `<span class="modal-exercise-chip">${escapeHtml(ex.name)}</span>`
                ).join('');

                return `
                    <div class="modal-workout">
                        <div class="modal-workout-header">
                            <span class="modal-workout-title">${escapeHtml(w.title)}</span>
                            <span class="modal-workout-date">${escapeHtml(formatHebrewDate(k))} • ${escapeHtml(w.time || '')}</span>
                        </div>
                        <div class="modal-workout-exercises">${exerciseChips}</div>
                    </div>
                `;
            }).join('');
        }).join('');

        body.innerHTML = html || '<div class="modal-empty">אין היסטוריית אימונים עדיין</div>';
    }

    // ─────────────────────────────────────────────────────────────
    // Actions — Generate Workout
    // ─────────────────────────────────────────────────────────────

    async function generateWorkout() {
        const input = $('request-input');
        if (!input) return;

        const request = String(input.value || '').trim();

        if (request.length < MIN_REQUEST_LENGTH) {
            showError('כתוב לפחות ' + MIN_REQUEST_LENGTH + ' תווים');
            return;
        }

        if (request.length > MAX_REQUEST_LENGTH) {
            showError(`הבקשה ארוכה מדי (מקסימום ${MAX_REQUEST_LENGTH} תווים)`);
            return;
        }

        state.generating = true;
        setLoading(true, 'בונה את האימון...');
        hideError();

        try {
            const res = await fetch('/api/training/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ request, mode: state.mode }),
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

            const workout = normalizeWorkout(payload.workout || payload);
            state.currentWorkout = workout;
            renderWorkout(workout);
            coachInlineMount(workout);

            console.log('[Training] workout generated:', workout.title, workout.exercises.length, 'exercises');
        } catch (err) {
            console.error('[Training] generate failed:', err);
            showError(err.message || 'שגיאה בהצעת האימון');
        } finally {
            state.generating = false;
            setLoading(false);
        }
    }

    function toggleExercise(idx) {
        if (!state.currentWorkout) return;
        const ex = state.currentWorkout.exercises[idx];
        if (!ex) return;

        ex.done = !ex.done;

        const item = document.querySelector(`[data-exercise-idx="${idx}"]`);
        if (item) {
            item.classList.toggle('done', ex.done);
            const checkbox = item.querySelector('.exercise-checkbox');
            if (checkbox) checkbox.textContent = ex.done ? '✓' : '';
        }
    }

    function updateActual(idx, value) {
        if (!state.currentWorkout) return;
        const ex = state.currentWorkout.exercises[idx];
        if (!ex) return;
        ex.actual = String(value || '');
    }

    function saveWorkout() {
        if (!state.currentWorkout) {
            showError('אין אימון לשמור');
            return;
        }

        state.saving = true;

        try {
            const { store, today, key } = getToday();

            if ((today.workouts || []).length >= MAX_TODAY_WORKOUTS) {
                showError('הגעת למקסימום אימונים ליום');
                return;
            }

            const workoutToSave = {
                title: state.currentWorkout.title,
                summary: state.currentWorkout.summary,
                durationMinutes: state.currentWorkout.durationMinutes,
                time: nowTimeHHMM(),
                mode: state.mode,
                exercises: state.currentWorkout.exercises.map((ex) => ({
                    name: ex.name,
                    category: ex.category,
                    sets: ex.sets,
                    reps: ex.reps,
                    rest: ex.rest,
                    note: ex.note,
                    done: ex.done,
                    actual: ex.actual,
                })),
            };

            today.workouts = today.workouts || [];
            today.workouts.push(workoutToSave);
            store.days[key] = today;

            if (saveStore(store)) {
                state.currentWorkout = null;

                // The workout is history now — the follow-up coach must not quote it.
                coachInlineHide();

                const section = $('workout-section');
                if (section) section.hidden = true;

                const input = $('request-input');
                if (input) input.value = '';

                renderToday();
                renderHistory();
                renderHistoryModal();

                console.log('[Training] workout saved');
            }
        } finally {
            state.saving = false;
        }
    }

    function removeWorkout(idx) {
        try {
            const { store, today, key } = getToday();
            if (!Array.isArray(today.workouts)) return;
            if (idx < 0 || idx >= today.workouts.length) return;

            today.workouts.splice(idx, 1);
            store.days[key] = today;
            saveStore(store);
            renderToday();
            renderHistory();
            renderHistoryModal();
        } catch (err) {
            console.error('[Training] removeWorkout failed:', err);
        }
    }

    async function analyzeProgress() {
        if (state.analyzing) return;

        const store = loadStore();
        const days = Object.entries(store.days || {})
            .sort((a, b) => b[0].localeCompare(a[0]))
            .slice(0, 10)
            .map(([date, data]) => ({ date, ...data }));

        const totalWorkouts = days.reduce((sum, d) => sum + (d.workouts?.length || 0), 0);

        if (totalWorkouts === 0) {
            showError('אין היסטוריית אימונים לניתוח. התחל להתאמן!');
            return;
        }

        state.analyzing = true;
        setLoading(true, 'מנתח את ההתקדמות...');
        hideError();

        try {
            const res = await fetch('/api/training/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ days }),
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

            const analysis = String(payload.analysis || payload.reply || '').trim();
            if (!analysis) {
                throw new Error('תגובת שרת ריקה');
            }

            renderInsights(analysis);

            const section = $('insights-section');
            if (section) {
                setTimeout(() => {
                    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            }

            console.log('[Training] analysis ready');
        } catch (err) {
            console.error('[Training] analyze failed:', err);
            showError(err.message || 'שגיאה בניתוח ההתקדמות');
        } finally {
            state.analyzing = false;
            setLoading(false);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Modal
    // ─────────────────────────────────────────────────────────────

    function openHistoryModal() {
        const modal = $('history-modal');
        if (!modal) return;
        renderHistoryModal();
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function closeHistoryModal() {
        const modal = $('history-modal');
        if (!modal) return;
        modal.hidden = true;
        document.body.style.overflow = '';
    }

    // ═════════════════════════════════════════════════════════════
    // COACH CHAT — Floating AI
    // ═════════════════════════════════════════════════════════════

    function coachScroll(surface = COACH_UI.floating) {
        const container = $(surface.messages);
        if (container) container.scrollTop = container.scrollHeight;
    }

    function coachRenderUser(text, surface = COACH_UI.floating) {
        const container = $(surface.messages);
        if (!container) return;
        const empty = container.querySelector('.coach-empty');
        if (empty) empty.remove();

        const div = document.createElement('div');
        div.className = 'coach-message coach-message-user';
        div.innerHTML = `<div class="coach-bubble">${escapeHtml(text)}</div>`;
        container.appendChild(div);
        coachScroll(surface);
    }

    function coachRenderLoading(surface = COACH_UI.floating) {
        const container = $(surface.messages);
        if (!container) return;
        const empty = container.querySelector('.coach-empty');
        if (empty) empty.remove();

        const div = document.createElement('div');
        div.className = 'coach-message coach-message-coach';
        div.setAttribute('data-coach-loading', '1');
        div.innerHTML = `
            <div class="coach-bubble">
                <div class="coach-typing">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;
        container.appendChild(div);
        coachScroll(surface);
    }

    function coachRemoveLoading(surface = COACH_UI.floating) {
        const container = $(surface.messages);
        if (!container) return;
        const el = container.querySelector('[data-coach-loading]');
        if (el) el.remove();
    }

    function coachRenderReply(reply, videos, surface = COACH_UI.floating) {
        const container = $(surface.messages);
        if (!container) return;
        coachRemoveLoading(surface);

        const div = document.createElement('div');
        div.className = 'coach-message coach-message-coach';

        const bodyHtml = formatMarkdownLight(reply || '');

        let videosHtml = '';
        if (Array.isArray(videos) && videos.length > 0) {
            const items = videos.map((v) => {
                const url = escapeHtml(v.url || '#');
                const title = escapeHtml(v.title || '');
                const channel = escapeHtml(v.channel || '');
                const thumb = escapeHtml(v.thumbnail || '');
                const safeTarget = url && url !== '#' ? 'target="_blank" rel="noopener noreferrer"' : '';
                const thumbHtml = thumb
                    ? `<img class="coach-video-thumb" src="${thumb}" alt="" loading="lazy">`
                    : '<div class="coach-video-thumb"></div>';
                return `
                    <a class="coach-video" href="${url}" ${safeTarget}>
                        ${thumbHtml}
                        <div class="coach-video-info">
                            <div class="coach-video-title">${title}</div>
                            ${channel ? `<div class="coach-video-meta">▶ ${channel}</div>` : ''}
                        </div>
                    </a>
                `;
            }).join('');

            videosHtml = `
                <div class="coach-videos">
                    <div class="coach-videos-title">🎥 סרטוני הדגמה:</div>
                    ${items}
                </div>
            `;
        }

        div.innerHTML = `
            <div class="coach-bubble">
                ${bodyHtml}
                ${videosHtml}
            </div>
        `;
        container.appendChild(div);
        coachScroll(surface);
    }

    function coachRenderError(msg, surface = COACH_UI.floating) {
        const container = $(surface.messages);
        if (!container) return;
        coachRemoveLoading(surface);
        const div = document.createElement('div');
        div.className = 'coach-message coach-message-coach';
        div.innerHTML = `<div class="coach-bubble" style="color: var(--danger); border-color: rgba(255,92,92,0.3);">❌ ${escapeHtml(msg)}</div>`;
        container.appendChild(div);
        coachScroll(surface);
    }

    function coachSetLoading(on, surface = COACH_UI.floating) {
        surface.loading = on;
        const btn = $(surface.send);
        const input = $(surface.input);
        if (btn) btn.disabled = on;
        if (input) input.disabled = on;
    }

    function coachOpen() {
        const chat = $('coach-chat');
        const fab = $('coach-fab');
        if (!chat || !fab) return;
        chat.hidden = false;
        fab.classList.add('hidden');
        coachState.open = true;
        setTimeout(() => {
            const input = $('coach-input');
            if (input) input.focus();
        }, 150);
    }

    function coachClose() {
        const chat = $('coach-chat');
        const fab = $('coach-fab');
        if (!chat || !fab) return;
        chat.hidden = true;
        fab.classList.remove('hidden');
        coachState.open = false;
    }

    async function coachSend(text, surface = COACH_UI.floating) {
        const trimmed = String(text || '').trim();

        if (surface.loading) return;
        if (trimmed.length < 2) return;
        if (trimmed.length > 500) {
            coachRenderError('השאלה ארוכה מדי (מקסימום 500 תווים)', surface);
            return;
        }

        coachRenderUser(trimmed, surface);

        const input = $(surface.input);
        if (input) input.value = '';

        surface.history.push({ role: 'user', content: trimmed });
        if (surface.history.length > COACH_HISTORY_LIMIT) {
            surface.history.splice(0, surface.history.length - COACH_HISTORY_LIMIT);
        }

        // Only the inline surface attaches the workout; the FAB stays a general coach.
        const body = {
            query: trimmed,
            history: surface.history.slice(0, -1),
        };
        const workoutPayload = buildWorkoutPayload(surface.workout);
        if (workoutPayload) body.workout = workoutPayload;

        coachSetLoading(true, surface);
        coachRenderLoading(surface);

        try {
            const res = await fetch('/api/training/coach', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
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

            coachRenderReply(payload.reply, payload.videos || [], surface);

            surface.history.push({ role: 'assistant', content: payload.reply });
            if (surface.history.length > COACH_HISTORY_LIMIT) {
                surface.history.splice(0, surface.history.length - COACH_HISTORY_LIMIT);
            }
        } catch (err) {
            console.error('[Training Coach] failed:', err);
            coachRenderError(err.message || 'שגיאה בשליחת ההודעה', surface);
            surface.history.pop();
        } finally {
            coachSetLoading(false, surface);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Inline coach (scoped to the workout that is on screen)
    // ─────────────────────────────────────────────────────────────

    const INLINE_SUGGESTIONS = [
        'למה הסדר הזה של התרגילים?',
        'כמה לנוח בין סטים?',
        'איך אני משתפר בתרגיל הראשון?',
        'כאב בכתף — מה להחליף?',
    ];

    function coachInlineRenderEmpty() {
        const container = $('coach-inline-messages');
        if (!container) return;

        container.innerHTML = '';

        const empty = document.createElement('div');
        empty.className = 'coach-empty';

        const title = document.createElement('p');
        title.className = 'coach-empty-title';
        title.textContent = 'שאל אותי על האימון שבנינו';

        const text = document.createElement('p');
        text.className = 'coach-empty-text';
        text.textContent = 'אני מכיר את התרגילים, הסטים וההערות — ואת הפרופיל שלך.';

        const list = document.createElement('div');
        list.className = 'coach-suggestions';

        INLINE_SUGGESTIONS.forEach((suggestion) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'coach-suggestion';
            btn.setAttribute('data-text', suggestion);
            btn.textContent = suggestion;
            list.appendChild(btn);
        });

        empty.appendChild(title);
        empty.appendChild(text);
        empty.appendChild(list);
        container.appendChild(empty);
    }

    function coachInlineReset() {
        COACH_UI.inline.history.splice(0, COACH_UI.inline.history.length);
        COACH_UI.inline.loading = false;

        const input = $('coach-inline-input');
        if (input) input.value = '';

        coachInlineRenderEmpty();
    }

    function coachInlineMount(workout) {
        const panel = $('coach-inline');
        if (!panel || !workout) return;

        const previous = COACH_UI.inline.workout;
        COACH_UI.inline.workout = workout;
        panel.hidden = false;

        // A different workout is a different conversation.
        if (previous !== workout) coachInlineReset();

        const contextEl = $('coach-inline-context');
        if (contextEl) {
            contextEl.textContent = `על: ${workout.title} · ${workout.exercises.length} תרגילים · ${workout.durationMinutes} דק׳`;
        }
    }

    function coachInlineHide() {
        const panel = $('coach-inline');
        if (panel) panel.hidden = true;
        COACH_UI.inline.workout = null;
        coachInlineReset();
    }

    function coachInlineToggle() {
        const body = $('coach-inline-body');
        const btn = $('coach-inline-toggle');
        if (!body || !btn) return;

        body.hidden = !body.hidden;
        btn.textContent = body.hidden ? '+' : '−';
        btn.setAttribute('aria-expanded', String(!body.hidden));
    }

    function coachBind() {
        const fab = $('coach-fab');
        if (fab) fab.addEventListener('click', coachOpen);

        // ── Inline coach (workout-scoped) ──
        const inlineForm = $('coach-inline-form');
        if (inlineForm) {
            inlineForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const input = $('coach-inline-input');
                if (input) coachSend(input.value, COACH_UI.inline);
            });
        }

        const inlineToggle = $('coach-inline-toggle');
        if (inlineToggle) inlineToggle.addEventListener('click', coachInlineToggle);

        // Suggestions are rendered dynamically, so delegate instead of binding once.
        const inlineMessages = $('coach-inline-messages');
        if (inlineMessages) {
            inlineMessages.addEventListener('click', (e) => {
                const suggestion = e.target.closest('.coach-suggestion');
                if (!suggestion) return;
                const text = suggestion.getAttribute('data-text') || '';
                if (text) coachSend(text, COACH_UI.inline);
            });
        }

        const closeBtn = $('coach-close');
        if (closeBtn) closeBtn.addEventListener('click', coachClose);

        const form = $('coach-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const input = $('coach-input');
                if (input) coachSend(input.value);
            });
        }

        document.querySelectorAll('.coach-suggestion').forEach((btn) => {
            btn.addEventListener('click', () => {
                const text = btn.getAttribute('data-text') || '';
                if (text) coachSend(text);
            });
        });
    }

    // ─────────────────────────────────────────────────────────────
    // Bind — Main UI
    // ─────────────────────────────────────────────────────────────

    function bind() {
        // Mode buttons
        document.querySelectorAll('.mode-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const mode = btn.getAttribute('data-mode');
                if (!mode) return;
                state.mode = mode;
                document.querySelectorAll('.mode-btn').forEach((b) => {
                    b.classList.toggle('active', b.getAttribute('data-mode') === mode);
                });
            });
        });

        // Quick chips
        document.querySelectorAll('.quick-chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                const text = chip.getAttribute('data-text') || '';
                const input = $('request-input');
                if (input) {
                    input.value = text;
                    input.focus();
                }
            });
        });

        // Generate button
        const genBtn = $('btn-generate');
        if (genBtn) genBtn.addEventListener('click', generateWorkout);

        // Regenerate button
        const regenBtn = $('btn-regenerate');
        if (regenBtn) {
            regenBtn.addEventListener('click', () => {
                state.currentWorkout = null;
                coachInlineHide();
                const section = $('workout-section');
                if (section) section.hidden = true;
                generateWorkout();
            });
        }

        // Save workout
        const saveBtn = $('btn-save-workout');
        if (saveBtn) saveBtn.addEventListener('click', saveWorkout);

        // Analyze
        const analyzeBtn = $('btn-analyze');
        if (analyzeBtn) analyzeBtn.addEventListener('click', analyzeProgress);

        // History button
        const historyBtn = $('btn-history');
        if (historyBtn) historyBtn.addEventListener('click', openHistoryModal);

        // Exercise interactions (delegated)
        const list = $('exercises-list');
        if (list) {
            list.addEventListener('click', (e) => {
                const toggle = e.target.closest('[data-toggle]');
                if (toggle) {
                    const idx = parseInt(toggle.getAttribute('data-toggle'), 10);
                    if (!Number.isNaN(idx)) toggleExercise(idx);
                    return;
                }
            });
            list.addEventListener('input', (e) => {
                const actual = e.target.closest('[data-actual]');
                if (actual) {
                    const idx = parseInt(actual.getAttribute('data-actual'), 10);
                    if (!Number.isNaN(idx)) updateActual(idx, actual.value);
                }
            });
        }

        // Remove today's workout (delegated)
        const todayList = $('today-list');
        if (todayList) {
            todayList.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-remove]');
                if (!btn) return;
                const idx = parseInt(btn.getAttribute('data-remove'), 10);
                if (!Number.isNaN(idx)) removeWorkout(idx);
            });
        }

        // Modal close
        document.querySelectorAll('[data-close-modal]').forEach((el) => {
            el.addEventListener('click', closeHistoryModal);
        });

        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = $('history-modal');
                if (modal && !modal.hidden) closeHistoryModal();
                if (coachState.open) coachClose();
            }
        });
    }

    // ─────────────────────────────────────────────────────────────
    // Init
    // ─────────────────────────────────────────────────────────────

    function init() {
        try {
            bind();
            coachBind();
            renderToday();
            renderHistory();

            const footer = $('footer-updated');
            if (footer) footer.textContent = nowTimeHHMM();

            console.log('[Training] ready');
        } catch (err) {
            console.error('[Training] init failed:', err);
            showError('שגיאת אתחול: ' + (err.message || 'לא ידוע'));
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();