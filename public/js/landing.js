/* ═══════════════════════════════════════════════════════════════════
   J.A.R.V.I.S // LANDING — Particle Sphere
   Fibonacci-distributed dots on a rotating sphere, connected
   by short lines. Stark-style HUD.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    const canvas = document.getElementById('brain-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

       const CONFIG = {
        particleCount: 1400,
        particleCountMobile: 700,

        sphereRadiusFrac: 0.42,
        connectionRadius: 0.20,
        maxNeighbors: 5,

        rotationSpeedX: 0.00035,
        rotationSpeedY: 0.00055,
        jitterAmount: 0.015,
        jitterSpeed: 0.0012,

        dotSize: 1.6,
        dotAlpha: 0.95,
        lineWidth: 0.55,
        lineAlpha: 0.30,

        pulseSpeed: 0.0014,
        pulseAmount: 0.20,

        colorPrimary:   { r: 160, g: 235, b: 255 },
        colorSecondary: { r: 90,  g: 210, b: 255 },
        colorAccent:    { r: 255, g: 225, b: 140 },
        colorDeep:      { r: 70,  g: 150, b: 220 },
    }; 
    
    const state = {
        width: 0,
        height: 0,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
        points: [],
        edges: [],
        rotX: 0,
        rotY: 0,
        raf: null,
        lastTime: 0,
        startTime: 0,
        radius: 0,
        cx: 0,
        cy: 0,
    };

    function generateSpherePoints(count) {
        const pts = [];
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < count; i++) {
            const y = 1 - (i / (count - 1)) * 2;
            const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
            const theta = goldenAngle * i;
            const x = Math.cos(theta) * radiusAtY;
            const z = Math.sin(theta) * radiusAtY;
            pts.push({
                x: x, y: y, z: z,
                phase: Math.random() * Math.PI * 2,
                colorT: Math.random(),
            });
        }
        return pts;
    }

    function buildEdges(points) {
        const n = points.length;
        const threshold2 = CONFIG.connectionRadius * CONFIG.connectionRadius;
        const edges = [];
        const seen = new Set();

        for (let i = 0; i < n; i++) {
            const a = points[i];
            const candidates = [];
            for (let j = 0; j < n; j++) {
                if (j === i) continue;
                const b = points[j];
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const dz = a.z - b.z;
                const d2 = dx * dx + dy * dy + dz * dz;
                if (d2 < threshold2) {
                    candidates.push({ j: j, d2: d2 });
                }
            }
            candidates.sort(function (p, q) { return p.d2 - q.d2; });
            const take = Math.min(CONFIG.maxNeighbors, candidates.length);
            for (let k = 0; k < take; k++) {
                const j = candidates[k].j;
                const key = i < j ? (i + '-' + j) : (j + '-' + i);
                if (seen.has(key)) continue;
                seen.add(key);
                edges.push([i, j]);
            }
        }

        return edges;
    }

    function resize() {
        state.width = window.innerWidth;
        state.height = window.innerHeight;
        canvas.width = Math.floor(state.width * state.dpr);
        canvas.height = Math.floor(state.height * state.dpr);
        canvas.style.width = state.width + 'px';
        canvas.style.height = state.height + 'px';
        ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

        const minDim = Math.min(state.width, state.height);
        state.radius = minDim * CONFIG.sphereRadiusFrac;

        state.cx = state.width / 2;
        state.cy = state.height / 2 - state.height * 0.04;
    }

    function mixColor(a, b, t) {
        return {
            r: (a.r + (b.r - a.r) * t) | 0,
            g: (a.g + (b.g - a.g) * t) | 0,
            b: (a.b + (b.b - a.b) * t) | 0,
        };
    }

    function draw() {
        const now = performance.now();
        const dt = Math.min((now - state.lastTime) / 16.67, 3);
        state.lastTime = now;

        state.rotX += CONFIG.rotationSpeedX * dt;
        state.rotY += CONFIG.rotationSpeedY * dt;

        const cosX = Math.cos(state.rotX);
        const sinX = Math.sin(state.rotX);
        const cosY = Math.cos(state.rotY);
        const sinY = Math.sin(state.rotY);

        ctx.clearRect(0, 0, state.width, state.height);

        const pts = state.points;
        const proj = new Array(pts.length);
        const jitter = Math.sin(now * CONFIG.jitterSpeed) * CONFIG.jitterAmount;

        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];

            // Rotate around Y
            const x1 = p.x * cosY + p.z * sinY;
            const z1 = -p.x * sinY + p.z * cosY;

            // Rotate around X
            const y2 = p.y * cosX + z1 * sinX;
            const z2 = -p.y * sinX + z1 * cosX;

            const persp = 1 + z2 * 0.15;

            proj[i] = {
                sx: state.cx + x1 * state.radius * persp + jitter * state.radius * 0.3,
                sy: state.cy + y2 * state.radius * persp + jitter * state.radius,
                depth: z2,
                persp: persp,
            };
        }

        // ─── Edges ───
        ctx.lineWidth = CONFIG.lineWidth;
        const edges = state.edges;
        for (let k = 0; k < edges.length; k++) {
            const ei = edges[k][0];
            const ej = edges[k][1];
            const a = proj[ei];
            const b = proj[ej];

            const depth = (a.depth + b.depth) * 0.5;
            const fade = 0.5 + depth * 0.5;
            const alpha = CONFIG.lineAlpha * fade;
            if (alpha < 0.02) continue;

            const goldMix = Math.max(0, depth) * 0.35;
            const c = mixColor(CONFIG.colorSecondary, CONFIG.colorAccent, goldMix);

            ctx.strokeStyle = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
            ctx.stroke();
        }

        // ─── Points (sorted by depth) ───
        const order = [];
        for (let i = 0; i < proj.length; i++) order.push(i);
        order.sort(function (a, b) { return proj[a].depth - proj[b].depth; });

        for (let k = 0; k < order.length; k++) {
            const i = order[k];
            const p = pts[i];
            const pr = proj[i];

            const depth = pr.depth;
            const fade = 0.45 + (depth + 1) * 0.5 * 0.55;
            const pulse = 1 + Math.sin(now * CONFIG.pulseSpeed + p.phase) * CONFIG.pulseAmount;

            const size = CONFIG.dotSize * pr.persp * pulse * (0.85 + depth * 0.15 + 0.15);
            const alpha = CONFIG.dotAlpha * fade;

            let c;
            if (depth > 0.6) {
                const t = (depth - 0.6) / 0.4;
                c = mixColor(CONFIG.colorPrimary, CONFIG.colorAccent, t * 0.8);
            } else if (depth > 0) {
                const t = depth / 0.6;
                c = mixColor(CONFIG.colorSecondary, CONFIG.colorPrimary, t);
            } else {
                const t = (depth + 1);
                c = mixColor(CONFIG.colorDeep, CONFIG.colorSecondary, t * 0.85);
            }

            if (depth > 0.3) {
                const glowAlpha = alpha * 0.2 * ((depth - 0.3) / 0.7);
                ctx.fillStyle = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + glowAlpha + ')';
                ctx.beginPath();
                ctx.arc(pr.sx, pr.sy, size * 3, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.fillStyle = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
            ctx.beginPath();
            ctx.arc(pr.sx, pr.sy, size, 0, Math.PI * 2);
            ctx.fill();
        }

        state.raf = requestAnimationFrame(draw);
    }

    function init() {
        const isMobile = window.innerWidth < 768;
        const count = isMobile ? CONFIG.particleCountMobile : CONFIG.particleCount;

        state.points = generateSpherePoints(count);
        state.edges = buildEdges(state.points);

        resize();

        window.addEventListener('resize', resize);

        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                if (state.raf) cancelAnimationFrame(state.raf);
                state.raf = null;
            } else if (!state.raf) {
                state.lastTime = performance.now();
                draw();
            }
        });

        const form = document.getElementById('landing-form');
        const input = document.getElementById('landing-input');
        const enterBtn = document.getElementById('enter-btn');

        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                const value = (input && input.value ? input.value : '').trim();
                if (value) {
                    try { sessionStorage.setItem('jarvis_pending_question', value); } catch (err) {}
                }
                window.location.href = '/app';
            });
        }

        if (enterBtn) {
            enterBtn.addEventListener('click', function () {
                window.location.href = '/app';
            });
        }

        state.lastTime = performance.now();
        state.startTime = state.lastTime;
        draw();

        console.log('[landing] particle sphere:', count, 'points,', state.edges.length, 'edges');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();