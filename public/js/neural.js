/**
 * ⚡ J.A.R.V.I.S // PARTICLE BRAIN — Dual Sphere
 * ספירה ראשית בפאנל הצידי + רקע עדין מאחור
 */

(function () {
    'use strict';

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ==============================
    // קונפיגורציה
    // ==============================

    const CONFIG = {
        bg: {
            particleCount: 200,
            particleCountMobile: 100,
            sphereScale: 0.75,        // 75% מהצד הקטן
            particleBaseSize: 1.0,
            connectionDistance: 0.42,
            rotationSpeedX: 0.00015,
            rotationSpeedY: 0.00022,
            jitterAmount: 0.006,
            jitterSpeed: 0.0006,
            lineAlpha: 0.045,
            dotAlpha: 0.28,
            pulseDecay: 0.018,
        },
        panel: {
            particleCount: 550,
            particleCountMobile: 280,
            sphereScale: 0.42,        // 42% מצד הקטן של הפאנל
            particleBaseSize: 1.8,
            connectionDistance: 0.52,
            rotationSpeedX: 0.0006,
            rotationSpeedY: 0.0009,
            jitterAmount: 0.018,
            jitterSpeed: 0.0014,
            lineAlpha: 0.16,
            dotAlpha: 0.85,
            pulseDecay: 0.022,
        },
        colors: {
            gold: { r: 244, g: 212, b: 124 },
            goldDim: { r: 212, g: 175, b: 55 },
            turquoise: { r: 130, g: 216, b: 255 },
            turquoiseDim: { r: 79, g: 195, b: 247 },
        },
    };

    // ==============================
    // Helper — Fibonacci Sphere
    // ==============================

    function generateSpherePoints(count) {
        const points = [];
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));

        for (let i = 0; i < count; i++) {
            const y = 1 - (i / (count - 1)) * 2;
            const radiusAtY = Math.sqrt(1 - y * y);
            const theta = goldenAngle * i;

            points.push({
                baseX: Math.cos(theta) * radiusAtY,
                baseY: y,
                baseZ: Math.sin(theta) * radiusAtY,
                x: 0, y: 0, z: 0,
                screenX: 0, screenY: 0, scale: 1,
                jitterPhase: Math.random() * Math.PI * 2,
                jitterSpeed: 0,
                pulse: 0,
                colorMix: Math.random(),
            });
        }
        return points;
    }

    // ==============================
    // Particle Sphere instance factory
    // ==============================

    function createSphere(canvas, options) {
        if (!canvas || !(canvas instanceof HTMLCanvasElement)) return null;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const cfg = options.cfg;
        const container = options.container || canvas.parentElement;

        const state = {
            width: 0,
            height: 0,
            dpr: Math.min(window.devicePixelRatio || 1, 2),
            cx: 0,
            cy: 0,
            radius: 0,
            particles: [],
            rotationX: 0,
            rotationY: 0,
            globalPulse: 0,
            animId: null,
            lastFrame: 0,
            isPaused: false,
            mouse: { x: -10000, y: -10000, active: false },
            cfg,
        };

        // ==============================
        // Resize
        // ==============================

        function resize() {
            const rect = container.getBoundingClientRect();
            const w = Math.max(1, Math.floor(rect.width));
            const h = Math.max(1, Math.floor(rect.height));

            state.width = w;
            state.height = h;
            state.dpr = Math.min(window.devicePixelRatio || 1, 2);

            canvas.width = Math.floor(w * state.dpr);
            canvas.height = Math.floor(h * state.dpr);
            canvas.style.width = w + 'px';
            canvas.style.height = h + 'px';

            ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

            state.cx = w / 2;
            state.cy = h / 2;
            state.radius = Math.min(w, h) * cfg.sphereScale;

            const mobile = window.innerWidth < 700;
            const target = prefersReduced
                ? Math.floor(cfg.particleCount * 0.2)
                : (mobile ? cfg.particleCountMobile : cfg.particleCount);

            if (state.particles.length !== target) {
                state.particles = generateSpherePoints(target);
                // אתחל jitterSpeed
                for (const p of state.particles) {
                    p.jitterSpeed = cfg.jitterSpeed * (0.6 + Math.random() * 0.8);
                }
            }
        }

        // ==============================
        // Rotation
        // ==============================

        function rotatePoint(p) {
            const cosY = Math.cos(state.rotationY);
            const sinY = Math.sin(state.rotationY);
            const x1 = p.baseX * cosY - p.baseZ * sinY;
            const z1 = p.baseX * sinY + p.baseZ * cosY;
            const y1 = p.baseY;

            const cosX = Math.cos(state.rotationX);
            const sinX = Math.sin(state.rotationX);
            const y2 = y1 * cosX - z1 * sinX;
            const z2 = y1 * sinX + z1 * cosX;

            return { x: x1, y: y2, z: z2 };
        }

        // ==============================
        // Update
        // ==============================

        function update(deltaFactor, time) {
            state.rotationY += cfg.rotationSpeedY * deltaFactor;
            state.rotationX += cfg.rotationSpeedX * deltaFactor;

            if (state.globalPulse > 0) {
                state.globalPulse = Math.max(0, state.globalPulse - cfg.pulseDecay * deltaFactor);
            }

            const pulseScale = 1 + state.globalPulse * 0.14;
            const effR = state.radius * pulseScale;

            const mouseR = effR * 0.5;
            const mouseRSq = mouseR * mouseR;

            for (let i = 0; i < state.particles.length; i++) {
                const p = state.particles[i];
                const rot = rotatePoint(p);

                const jT = time * p.jitterSpeed + p.jitterPhase;
                const jAmp = cfg.jitterAmount * effR;
                const jx = Math.sin(jT) * jAmp;
                const jy = Math.cos(jT * 1.3) * jAmp;
                const jz = Math.sin(jT * 0.7) * jAmp;

                let x3 = rot.x * effR + jx;
                let y3 = rot.y * effR + jy;
                const z3 = rot.z * effR + jz;

                const perspective = 1 + z3 / (effR * 4);
                let screenX = state.cx + x3 * perspective;
                let screenY = state.cy + y3 * perspective;

                if (state.mouse.active) {
                    const dx = screenX - state.mouse.x;
                    const dy = screenY - state.mouse.y;
                    const dSq = dx * dx + dy * dy;

                    if (dSq < mouseRSq && dSq > 1) {
                        const d = Math.sqrt(dSq);
                        const s = (1 - d / mouseR) * 0.05 * effR;
                        x3 += (dx / d) * s;
                        y3 += (dy / d) * s;
                        screenX = state.cx + x3 * perspective;
                        screenY = state.cy + y3 * perspective;
                    }
                }

                if (p.pulse > 0) {
                    p.pulse = Math.max(0, p.pulse - cfg.pulseDecay * deltaFactor);
                }

                p.x = x3;
                p.y = y3;
                p.z = z3;
                p.screenX = screenX;
                p.screenY = screenY;
                p.scale = perspective;
            }
        }

        // ==============================
        // Render
        // ==============================

        function mixColor(mix) {
            const { gold, turquoise } = CONFIG.colors;
            const r = Math.round(gold.r * (1 - mix) + turquoise.r * mix);
            const g = Math.round(gold.g * (1 - mix) + turquoise.g * mix);
            const b = Math.round(gold.b * (1 - mix) + turquoise.b * mix);
            return { r, g, b };
        }

        function render() {
            ctx.clearRect(0, 0, state.width, state.height);

            const sorted = state.particles.slice().sort((a, b) => a.z - b.z);
            const maxDist = state.radius * cfg.connectionDistance;
            const maxDistSq = maxDist * maxDist;

            // Lines
            for (let i = 0; i < sorted.length; i++) {
                const a = sorted[i];
                for (let j = i + 1; j < sorted.length; j++) {
                    const b = sorted[j];
                    const dx = a.x - b.x;
                    const dy = a.y - b.y;
                    const dz = a.z - b.z;
                    const dSq = dx * dx + dy * dy + dz * dz;
                    if (dSq > maxDistSq) continue;

                    const d = Math.sqrt(dSq);
                    const strength = 1 - d / maxDist;
                    const depth = (a.scale + b.scale) / 2;
                    const alpha = cfg.lineAlpha * strength * depth;
                    if (alpha < 0.008) continue;

                    const c1 = mixColor(a.colorMix);
                    ctx.strokeStyle = `rgba(${c1.r}, ${c1.g}, ${c1.b}, ${alpha.toFixed(3)})`;
                    ctx.lineWidth = 0.55 * depth;
                    ctx.beginPath();
                    ctx.moveTo(a.screenX, a.screenY);
                    ctx.lineTo(b.screenX, b.screenY);
                    ctx.stroke();
                }
            }

            // Dots
            for (let i = 0; i < sorted.length; i++) {
                const p = sorted[i];
                const size = cfg.particleBaseSize * p.scale * (1 + p.pulse * 2 + state.globalPulse * 0.6);
                const c = mixColor(p.colorMix);

                if (p.pulse > 0.05 || state.globalPulse > 0.05) {
                    const pulseVal = Math.max(p.pulse, state.globalPulse);
                    ctx.beginPath();
                    ctx.arc(p.screenX, p.screenY, size * (2.2 + pulseVal * 3), 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${(pulseVal * 0.28).toFixed(3)})`;
                    ctx.fill();
                }

                ctx.beginPath();
                ctx.arc(p.screenX, p.screenY, Math.max(0.35, size), 0, Math.PI * 2);
                ctx.fillStyle = `rgb(${c.r}, ${c.g}, ${c.b})`;
                ctx.globalAlpha = Math.min(1, cfg.dotAlpha * p.scale * (1 + p.pulse * 0.8));
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        }

        // ==============================
        // Loop
        // ==============================

        function loop(timestamp) {
            if (state.isPaused) {
                state.animId = null;
                return;
            }

            const delta = timestamp - state.lastFrame;
            const dFactor = state.lastFrame === 0 ? 1 : Math.min(delta / 16.67, 3);
            state.lastFrame = timestamp;

            update(dFactor, timestamp);
            render();

            state.animId = requestAnimationFrame(loop);
        }

        // ==============================
        // Public API
        // ==============================

        function start() {
            if (state.animId !== null) return;
            if (prefersReduced) {
                update(1, 0);
                render();
                return;
            }
            state.lastFrame = 0;
            state.animId = requestAnimationFrame(loop);
        }

        function stop() {
            if (state.animId !== null) {
                cancelAnimationFrame(state.animId);
                state.animId = null;
            }
        }

        function setPaused(paused) {
            state.isPaused = paused;
            if (paused) {
                stop();
            } else {
                start();
            }
        }

        function pulse(amount) {
            state.globalPulse = Math.min(1.3, state.globalPulse + (amount || 0.5));
        }

        function pulseMany(count) {
            const n = Math.max(1, Math.min(count || 3, 12));
            for (let i = 0; i < n; i++) {
                setTimeout(() => {
                    const localCount = 3 + Math.floor(Math.random() * 5);
                    for (let j = 0; j < localCount; j++) {
                        const idx = Math.floor(Math.random() * state.particles.length);
                        if (state.particles[idx]) state.particles[idx].pulse = 1;
                    }
                    pulse(0.25);
                }, i * 90);
            }
        }

        // Mouse listeners
        function onMouseMove(e) {
            const rect = container.getBoundingClientRect();
            state.mouse.x = e.clientX - rect.left;
            state.mouse.y = e.clientY - rect.top;
            state.mouse.active = true;
        }
        function onMouseLeave() {
            state.mouse.active = false;
            state.mouse.x = -10000;
            state.mouse.y = -10000;
        }

        // Init
        resize();

        const ro = new ResizeObserver(() => {
            resize();
        });
        ro.observe(container);

        canvas.addEventListener('mousemove', onMouseMove, { passive: true });
        canvas.addEventListener('mouseleave', onMouseLeave);

        return {
            start,
            stop,
            setPaused,
            pulse,
            pulseMany,
            resize,
            get particleCount() {
                return state.particles.length;
            },
            _state: state,
        };
    }

    // ==============================
    // Init both spheres
    // ==============================

    function init() {
        // --- רקע עדין ---
        const bgCanvas = document.getElementById('neural-canvas');
        let bgSphere = null;
        if (bgCanvas) {
            bgSphere = createSphere(bgCanvas, {
                cfg: CONFIG.bg,
                container: document.body,
            });
            if (bgSphere) bgSphere.start();
        }

        // --- פאנל צידי ---
        const panelCanvas = document.getElementById('brain-canvas');
        let panelSphere = null;
        if (panelCanvas) {
            panelSphere = createSphere(panelCanvas, {
                cfg: CONFIG.panel,
                container: panelCanvas.parentElement,
            });
            if (panelSphere) panelSphere.start();
        }

        // --- Public API ---
        window.JarvisNeural = {
            pulse: (amount) => {
                if (bgSphere) bgSphere.pulse((amount || 0.5) * 0.4);
                if (panelSphere) panelSphere.pulse(amount || 0.5);
            },
            pulseMany: (count) => {
                if (bgSphere) bgSphere.pulseMany(Math.min(count || 3, 5));
                if (panelSphere) panelSphere.pulseMany(count || 3);
            },
            get particleCount() {
                return (bgSphere ? bgSphere.particleCount : 0)
                    + (panelSphere ? panelSphere.particleCount : 0);
            },
            _bg: bgSphere,
            _panel: panelSphere,
        };

        console.info(
            `[neural] Dual Sphere — bg: ${bgSphere ? bgSphere.particleCount : 0}, panel: ${panelSphere ? panelSphere.particleCount : 0}`
        );

        // --- Visibility ---
        document.addEventListener('visibilitychange', () => {
            const paused = document.hidden;
            if (bgSphere) bgSphere.setPaused(paused);
            if (panelSphere) panelSphere.setPaused(paused);
        });

        // --- Cleanup ---
        window.addEventListener('beforeunload', () => {
            if (bgSphere) bgSphere.stop();
            if (panelSphere) panelSphere.stop();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

})();