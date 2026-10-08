/* ═══════════════════════════════════════════════════════════════════
   J.A.R.V.I.S // NUTRITION — Client Logic v2.0
   Matches server contract: POST /api/nutrition/analyze { meals: [...] }
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ─────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────

    const STORAGE_KEY = 'jarvis_nutrition_v2';
    const WATER_STEP = 250;
    const WATER_TARGET = 3000;
    const MIN_DESC_LENGTH = 2;
    const MAX_DESC_LENGTH = 500;
    const QUICK_ADD_MAX_MEALS = 30;

    const TARGETS = Object.freeze({
        kcal: 2650,
        protein: 140,
        carbs: 325,
        fats: 85,
        fiber: 35,
        sugar: 50,
        water: WATER_TARGET
    });

    const AMINO_ORDER = Object.freeze([
        'Histidine', 'Isoleucine', 'Leucine', 'Lysine', 'Methionine',
        'Phenylalanine', 'Threonine', 'Tryptophan', 'Valine'
    ]);

    const VITAMIN_HE_TO_EN = Object.freeze({
        'ויטמין C': 'ויטמין C',
        'ויטמין D': 'ויטמין D',
        'ויטמין A': 'ויטמין A',
        'ויטמין E': 'ויטמין E',
        'ויטמין K': 'ויטמין K',
        'ויטמין B1': 'ויטמין B1',
        'ויטמין B2': 'ויטמין B2',
        'ויטמין B3': 'ויטמין B3',
        'ויטמין B5': 'ויטמין B5',
        'ויטמין B6': 'ויטמין B6',
        'ויטמין B7': 'ויטמין B7',
        'ויטמין B9': 'ויטמין B9',
        'ויטמין B12': 'ויטמין B12'
    });

    // ─────────────────────────────────────────────────────────────
    // DOM helpers
    // ─────────────────────────────────────────────────────────────

    function $(id) {
        return document.getElementById(id);
    }

    function safeText(el, text) {
        if (el) el.textContent = text;
    }

    function safeHtml(el, html) {
        if (el) el.innerHTML = html;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
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
            minute: '2-digit'
        });
    }

    // ─────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────

    function emptyDay(dateStr) {
        return {
            date: dateStr,
            meals: [],
            water: 0,
            totals: { kcal: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0 },
            vitamins: [],
            minerals: [],
            aminos: [],
            insights: ''
        };
    }

    function loadStore() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return { version: 2, days: {} };
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return { version: 2, days: {} };
            if (!parsed.days || typeof parsed.days !== 'object') parsed.days = {};
            parsed.version = 2;
            return parsed;
        } catch (err) {
            console.warn('[Nutrition] loadStore failed:', err);
            return { version: 2, days: {} };
        }
    }

    function saveStore(store) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
        } catch (err) {
            console.warn('[Nutrition] saveStore failed:', err);
            showError('שמירה נכשלה — ייתכן שהאחסון המקומי מלא');
        }
    }

    function getToday() {
        const store = loadStore();
        const key = todayKey();
        if (!store.days[key]) {
            store.days[key] = emptyDay(key);
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

    function setLoading(on, subtext) {
        const loadingEl = $('loading');
        const btn = $('btn-analyze');
        const input = $('meal-input');

        if (loadingEl) loadingEl.hidden = !on;
        if (btn) btn.disabled = on;
        if (input) input.disabled = on;

        if (on && subtext) {
            const sub = document.querySelector('.loading-subtext');
            if (sub) sub.textContent = subtext;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Server response normalization
    // ─────────────────────────────────────────────────────────────

    function toNumber(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function normalizeVitamins(arr) {
        if (!Array.isArray(arr)) return [];
        const out = [];
        const seen = new Set();
        for (const item of arr) {
            if (!item || typeof item !== 'object') continue;
            const name = String(item.name || '').trim();
            if (!name) continue;
            if (seen.has(name)) continue;
            seen.add(name);
            out.push({
                name,
                percent: Math.round(toNumber(item.percent, 0)),
                source: String(item.source || '').trim()
            });
        }
        return out;
    }

    function normalizeMinerals(arr) {
        return normalizeVitamins(arr);
    }

    function normalizeAminos(arr) {
        if (!Array.isArray(arr)) return [];
        const map = new Map();
        for (const item of arr) {
            if (!item || typeof item !== 'object') continue;
            const name = String(item.name || '').trim();
            if (!name) continue;
            const present = Boolean(item.present);
            if (map.has(name)) {
                map.set(name, map.get(name) || present);
            } else {
                map.set(name, present);
            }
        }
        // סדר קנוני
        const ordered = [];
        for (const name of AMINO_ORDER) {
            if (map.has(name)) {
                ordered.push({ name, present: map.get(name) });
                map.delete(name);
            }
        }
        for (const [name, present] of map.entries()) {
            ordered.push({ name, present });
        }
        return ordered;
    }

    function normalizeItems(arr) {
        if (!Array.isArray(arr)) return [];
        return arr
            .filter((it) => it && typeof it === 'object')
            .map((it) => ({
                name: String(it.name || '').trim(),
                amount: String(it.amount || '').trim(),
                calories: Math.round(toNumber(it.calories, 0)),
                protein: Math.round(toNumber(it.protein, 0) * 10) / 10,
                carbs: Math.round(toNumber(it.carbs, 0) * 10) / 10,
                fat: Math.round(toNumber(it.fat, 0) * 10) / 10,
                sugar: Math.round(toNumber(it.sugar, 0) * 10) / 10,
                fiber: Math.round(toNumber(it.fiber, 0) * 10) / 10
            }));
    }

    function normalizeServerAnalysis(serverData) {
        const a = (serverData && serverData.analysis) ? serverData.analysis : {};

        return {
            totals: {
                kcal: Math.round(toNumber(a.totalCalories, 0)),
                protein: Math.round(toNumber(a.totalProtein, 0) * 10) / 10,
                carbs: Math.round(toNumber(a.totalCarbs, 0) * 10) / 10,
                fats: Math.round(toNumber(a.totalFat, 0) * 10) / 10,
                fiber: Math.round(toNumber(a.totalFiber, 0) * 10) / 10,
                sugar: Math.round(toNumber(a.totalSugar, 0) * 10) / 10
            },
            items: normalizeItems(a.items),
            vitamins: normalizeVitamins(a.vitamins),
            minerals: normalizeMinerals(a.minerals),
            aminos: normalizeAminos(a.aminoAcids),
            insights: String(a.insights || '').trim()
        };
    }

    // ─────────────────────────────────────────────────────────────
    // Aggregation
    // ─────────────────────────────────────────────────────────────

    function recomputeDay(today) {
        const totals = { kcal: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0 };
        const vitaminMap = new Map();
        const mineralMap = new Map();
        const aminoMap = new Map();

        for (const meal of today.meals || []) {
            const t = meal.totals || {};
            totals.kcal += toNumber(t.kcal, 0);
            totals.protein += toNumber(t.protein, 0);
            totals.carbs += toNumber(t.carbs, 0);
            totals.fats += toNumber(t.fats, 0);
            totals.fiber += toNumber(t.fiber, 0);
            totals.sugar += toNumber(t.sugar, 0);

            for (const v of meal.vitamins || []) {
                const name = String(v.name || '').trim();
                if (!name) continue;
                vitaminMap.set(name, (vitaminMap.get(name) || 0) + toNumber(v.percent, 0));
            }
            for (const m of meal.minerals || []) {
                const name = String(m.name || '').trim();
                if (!name) continue;
                mineralMap.set(name, (mineralMap.get(name) || 0) + toNumber(m.percent, 0));
            }
            for (const a of meal.aminos || []) {
                const name = String(a.name || '').trim();
                if (!name) continue;
                const present = Boolean(a.present);
                if (aminoMap.has(name)) {
                    aminoMap.set(name, aminoMap.get(name) || present);
                } else {
                    aminoMap.set(name, present);
                }
            }
        }

        // עגל סופי
        totals.kcal = Math.round(totals.kcal);
        totals.protein = Math.round(totals.protein * 10) / 10;
        totals.carbs = Math.round(totals.carbs * 10) / 10;
        totals.fats = Math.round(totals.fats * 10) / 10;
        totals.fiber = Math.round(totals.fiber * 10) / 10;
        totals.sugar = Math.round(totals.sugar * 10) / 10;

        today.totals = totals;

        today.vitamins = [...vitaminMap.entries()]
            .map(([name, percent]) => ({ name, percent: Math.round(percent) }))
            .sort((a, b) => b.percent - a.percent);

        today.minerals = [...mineralMap.entries()]
            .map(([name, percent]) => ({ name, percent: Math.round(percent) }))
            .sort((a, b) => b.percent - a.percent);

        const orderedAminos = [];
        for (const name of AMINO_ORDER) {
            if (aminoMap.has(name)) {
                orderedAminos.push({ name, present: aminoMap.get(name) });
                aminoMap.delete(name);
            }
        }
        for (const [name, present] of aminoMap.entries()) {
            orderedAminos.push({ name, present });
        }
        today.aminos = orderedAminos;

        return today;
    }

    // ─────────────────────────────────────────────────────────────
    // Renderers
    // ─────────────────────────────────────────────────────────────

    function renderSummary(totals, water) {
        const grid = $('summary-grid');
        if (!grid) return;

        const cards = [
            { label: 'קלוריות', value: Math.round(totals.kcal || 0), unit: '', target: TARGETS.kcal, cls: 'gold' },
            { label: 'חלבון', value: Math.round(totals.protein || 0), unit: 'g', target: TARGETS.protein, cls: '' },
            { label: 'פחמימות', value: Math.round(totals.carbs || 0), unit: 'g', target: TARGETS.carbs, cls: '' },
            { label: 'שומנים', value: Math.round(totals.fats || 0), unit: 'g', target: TARGETS.fats, cls: '' },
            { label: 'סיבים', value: Math.round(totals.fiber || 0), unit: 'g', target: TARGETS.fiber, cls: 'warn' },
            { label: 'מים', value: Math.round(water || 0), unit: 'ml', target: TARGETS.water, cls: 'gold' }
        ];

        grid.innerHTML = cards.map((c) => {
            const pct = c.target > 0 ? Math.min(100, (c.value / c.target) * 100) : 0;
            return `
                <div class="summary-card ${c.cls}">
                    <div class="summary-label">${escapeHtml(c.label)}</div>
                    <div class="summary-value">${c.value}<span class="unit">${escapeHtml(c.unit)}</span></div>
                    <div class="summary-target">יעד: ${c.target}${escapeHtml(c.unit)}</div>
                    <div class="summary-bar"><div class="summary-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
                </div>
            `;
        }).join('');
    }

    function renderWater(water) {
        const v = $('water-value');
        const bar = $('water-bar-fill');
        const value = Math.max(0, Math.round(water || 0));
        if (v) v.textContent = value.toLocaleString('he-IL');
        if (bar) {
            const pct = Math.min(100, (value / WATER_TARGET) * 100);
            bar.style.width = pct.toFixed(1) + '%';
        }
    }

    function renderMeals(meals) {
        const section = $('meals-section');
        const list = $('meals-list');
        const count = $('meals-count');

        if (!section || !list) return;

        if (!Array.isArray(meals) || meals.length === 0) {
            section.hidden = true;
            if (count) count.textContent = '(0)';
            list.innerHTML = '';
            return;
        }

        section.hidden = false;
        if (count) count.textContent = `(${meals.length})`;

        list.innerHTML = meals.map((m, idx) => {
            const t = m.totals || {};
            const desc = escapeHtml(m.description || '');
            const time = escapeHtml(m.time || '');
            const insights = m.insights ? `<div class="meal-insight">${escapeHtml(m.insights)}</div>` : '';

            const itemsHtml = Array.isArray(m.items) && m.items.length
                ? `<div class="meal-items">
                    ${m.items.map(it => `
                        <span class="meal-item-chip">
                            ${escapeHtml(it.name || '')}${it.amount ? ' — ' + escapeHtml(it.amount) : ''}
                        </span>
                    `).join('')}
                   </div>`
                : '';

            return `
                <div class="meal-item" data-index="${idx}">
                    <div class="meal-item-body">
                        <div class="meal-desc">${desc}</div>
                        ${itemsHtml}
                        <div class="meal-macros">
                            <span class="macro-chip kcal">${Math.round(t.kcal || 0)} קק"ל</span>
                            <span class="macro-chip prot">${Math.round(t.protein || 0)}g חלבון</span>
                            <span class="macro-chip">${Math.round(t.carbs || 0)}g פחמ'</span>
                            <span class="macro-chip">${Math.round(t.fats || 0)}g שומן</span>
                        </div>
                        ${insights}
                    </div>
                    <span class="meal-time">${time}</span>
                    <button type="button" class="meal-remove" data-remove="${idx}" aria-label="הסר ארוחה">✕</button>
                </div>
            `;
        }).join('');
    }

    function renderMicroList(container, items, emptyMsg) {
        if (!container) return;
        if (!Array.isArray(items) || items.length === 0) {
            container.innerHTML = `<div class="micro-empty">${escapeHtml(emptyMsg)}</div>`;
            return;
        }
        container.innerHTML = items.map((item) => {
            const pct = Math.max(0, Math.round(toNumber(item.percent, 0)));
            const cls = pct >= 80 ? 'ok' : (pct >= 40 ? 'mid' : 'low');
            const source = item.source ? ` <span class="micro-source">(${escapeHtml(item.source)})</span>` : '';
            return `
                <div class="micro-item ${cls}">
                    <span class="micro-name">${escapeHtml(item.name)}${source}</span>
                    <span class="micro-value">${pct}%</span>
                </div>
            `;
        }).join('');
    }

    function renderMicros(vitamins, minerals) {
        const section = $('micro-section');
        const vList = $('vitamins-list');
        const mList = $('minerals-list');

        if (!section || !vList || !mList) return;

        const hasV = Array.isArray(vitamins) && vitamins.length > 0;
        const hasM = Array.isArray(minerals) && minerals.length > 0;

        if (!hasV && !hasM) {
            section.hidden = true;
            return;
        }

        section.hidden = false;
        renderMicroList(vList, vitamins, 'אין נתוני ויטמינים עדיין');
        renderMicroList(mList, minerals, 'אין נתוני מינרלים עדיין');
    }

    function renderAminos(aminos) {
        const section = $('amino-section');
        const list = $('amino-list');

        if (!section || !list) return;

        if (!Array.isArray(aminos) || aminos.length === 0) {
            section.hidden = true;
            return;
        }

        section.hidden = false;
        list.innerHTML = aminos.map((a) => {
            const present = Boolean(a.present);
            return `
                <div class="amino-item ${present ? 'present' : 'absent'}">
                    <span class="amino-name">${escapeHtml(a.name)}</span>
                    <span class="amino-value">${present ? '✓' : '—'}</span>
                </div>
            `;
        }).join('');
    }

    function renderInsights(text) {
        const section = $('insights-section');
        const el = $('insights-text');

        if (!section || !el) return;

        const value = String(text || '').trim();
        if (!value) {
            section.hidden = true;
            el.textContent = '';
            return;
        }

        section.hidden = false;
        el.textContent = value;
    }

    function renderHistory(store) {
        const section = $('history-section');
        const list = $('history-list');

        if (!section || !list) return;

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
            const t = d.totals || {};
            return `
                <div class="history-row">
                    <span class="history-date">${escapeHtml(formatHebrewDate(k))}</span>
                    <span class="history-kcal">${Math.round(toNumber(t.kcal, 0))} קק"ל</span>
                    <span class="history-prot">${Math.round(toNumber(t.protein, 0))}g חלבון</span>
                </div>
            `;
        }).join('');
    }

    function renderAll() {
        try {
            const { store, today } = getToday();

            const dateEl = $('today-date');
            if (dateEl) dateEl.textContent = formatHebrewDate(todayKey());

            renderSummary(today.totals || {}, today.water || 0);
            renderWater(today.water || 0);
            renderMeals(today.meals || []);
            renderMicros(today.vitamins || [], today.minerals || []);
            renderAminos(today.aminos || []);
            renderInsights(today.insights || '');
            renderHistory(store);

            const footer = $('footer-updated');
            if (footer) footer.textContent = nowTimeHHMM();
        } catch (err) {
            console.error('[Nutrition] renderAll failed:', err);
            showError('שגיאת תצוגה: ' + (err.message || 'לא ידוע'));
        }
    }

    // ─────────────────────────────────────────────────────────────
    // API call
    // ─────────────────────────────────────────────────────────────

    async function callAnalyzeAPI(description) {
        const res = await fetch('/api/nutrition/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ meals: [description] })
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

        if (!payload || !payload.analysis) {
            throw new Error('תגובת שרת חסרה שדה analysis');
        }

        return payload;
    }

    // ─────────────────────────────────────────────────────────────
    // Actions
    // ─────────────────────────────────────────────────────────────

    async function analyzeMeal(description) {
        const text = String(description || '').trim();

        if (text.length < MIN_DESC_LENGTH) {
            showError('תאר מה אכלת (לפחות ' + MIN_DESC_LENGTH + ' תווים)');
            return;
        }

        if (text.length > MAX_DESC_LENGTH) {
            showError(`תיאור ארוך מדי (מקסימום ${MAX_DESC_LENGTH} תווים)`);
            return;
        }

        const { store, today, key } = getToday();

        if ((today.meals || []).length >= QUICK_ADD_MAX_MEALS) {
            showError('הגעת למקסימום ארוחות ליום');
            return;
        }

        setLoading(true, 'שולח לניתוח AI...');

        try {
            const serverResponse = await callAnalyzeAPI(text);
            const normalized = normalizeServerAnalysis(serverResponse);

            const meal = {
                description: text,
                time: nowTimeHHMM(),
                totals: normalized.totals,
                items: normalized.items,
                vitamins: normalized.vitamins,
                minerals: normalized.minerals,
                aminos: normalized.aminos,
                insights: normalized.insights
            };

            today.meals = today.meals || [];
            today.meals.push(meal);

            if (normalized.insights) {
                today.insights = normalized.insights;
            }

            recomputeDay(today);
            store.days[key] = today;
            saveStore(store);
            renderAll();

            const input = $('meal-input');
            if (input) input.value = '';

            console.log('[Nutrition] meal added', {
                kcal: normalized.totals.kcal,
                protein: normalized.totals.protein,
                latencyMs: serverResponse.latencyMs
            });
        } catch (err) {
            console.error('[Nutrition] analyze failed:', err);
            showError(err.message || 'שגיאה בניתוח הארוחה');
        } finally {
            setLoading(false);
        }
    }

    function addWater(delta) {
        try {
            const { store, today, key } = getToday();
            const current = toNumber(today.water, 0);
            today.water = Math.max(0, current + delta);
            store.days[key] = today;
            saveStore(store);
            renderAll();
        } catch (err) {
            console.error('[Nutrition] addWater failed:', err);
            showError('שגיאה בעדכון מים');
        }
    }

    function removeMeal(idx) {
        try {
            const { store, today, key } = getToday();
            if (!Array.isArray(today.meals)) return;
            if (idx < 0 || idx >= today.meals.length) return;

            today.meals.splice(idx, 1);
            recomputeDay(today);
            store.days[key] = today;
            saveStore(store);
            renderAll();
        } catch (err) {
            console.error('[Nutrition] removeMeal failed:', err);
            showError('שגיאה בהסרת ארוחה');
        }
    }

    function exportJSON() {
        try {
            const store = loadStore();
            const blob = new Blob(
                [JSON.stringify(store, null, 2)],
                { type: 'application/json' }
            );
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `jarvis-nutrition-${todayKey()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) {
            console.error('[Nutrition] export failed:', err);
            showError('ייצוא נכשל');
        }
    }

    function clearToday() {
        if (!window.confirm('לאפס את כל הנתונים של היום?')) return;
        try {
            const { store, key } = getToday();
            store.days[key] = emptyDay(key);
            saveStore(store);
            renderAll();
        } catch (err) {
            console.error('[Nutrition] clearToday failed:', err);
            showError('איפוס נכשל');
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Event binding
    // ─────────────────────────────────────────────────────────────

    function bind() {
        const plus = $('water-plus');
        const minus = $('water-minus');

        if (plus) plus.addEventListener('click', () => addWater(WATER_STEP));
        if (minus) minus.addEventListener('click', () => addWater(-WATER_STEP));

        const btnAnalyze = $('btn-analyze');
        const input = $('meal-input');

        if (btnAnalyze && input) {
            btnAnalyze.addEventListener('click', () => {
                analyzeMeal(input.value);
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    analyzeMeal(input.value);
                }
            });
        }

        document.querySelectorAll('.quick-chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                const text = chip.getAttribute('data-text') || '';
                if (input) input.value = text;
                analyzeMeal(text);
            });
        });

        const list = $('meals-list');
        if (list) {
            list.addEventListener('click', (e) => {
                const target = e.target.closest('[data-remove]');
                if (!target) return;
                const idx = parseInt(target.getAttribute('data-remove'), 10);
                if (!Number.isNaN(idx)) removeMeal(idx);
            });
        }

        const exportBtn = $('btn-export');
        if (exportBtn) exportBtn.addEventListener('click', exportJSON);

        const clearBtn = $('btn-clear');
        if (clearBtn) clearBtn.addEventListener('click', clearToday);
    }

    // ─────────────────────────────────────────────────────────────
    // Init
    // ─────────────────────────────────────────────────────────────

    function init() {
        try {
            bind();
            renderAll();
            console.log('[Nutrition] ready');
        } catch (err) {
            console.error('[Nutrition] init failed:', err);
            showError('שגיאת אתחול: ' + (err.message || 'לא ידוע'));
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();