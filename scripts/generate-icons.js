'use strict';

/**
 * Generates the PNG icons that public/manifest.json points at.
 *
 * The repo ships /icons/icon.svg, but neither Chrome's install prompt nor
 * iOS's home-screen icon accepts an SVG reliably: Chrome wants a 192px and a
 * 512px raster, and iOS ignores manifest icons entirely and wants a PNG
 * apple-touch-icon. There is no image toolchain in this project, so this script
 * rasterises the same artwork as the SVG with nothing but `zlib` — run it once
 * and commit the output, or re-run it after editing the geometry below.
 *
 *   node scripts/generate-icons.js
 *
 * Output (all in public/icons/):
 *   icon-192.png           192x192, purpose "any"       (transparent rounded corners)
 *   icon-512.png           512x512, purpose "any"
 *   icon-maskable-512.png  512x512, purpose "maskable"  (full-bleed, art at 72%)
 *   apple-touch-icon.png   180x180, iOS                 (full-bleed, art at 82%)
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');

// ── artwork (same units as icon.svg: 192x192 viewBox) ────────────────────────
const ART = {
    bg: [10, 14, 26], // #0a0e1a
    gold: [222, 194, 86], // between #d4af37 and #e8c860
    teal: [77, 208, 196], // #4dd0c4
    center: [111, 224, 213], // #6fe0d5
    coreEdge: [42, 138, 128], // #2a8a80
    dot: [232, 236, 245], // #e8ecf5
    cornerRadius: 42,
    ringR: 66,
    ringW: 6,
    dashR: 48,
    dashW: 4.5,
    dashOn: 12,
    dashOff: 9,
    coreR: 27,
    dotR: 12,
    tickW: 6,
    tickInner: 60, // distance from the centre, not from the edge
    tickOuter: 84,
};

const SAMPLES = 4; // 4x4 supersampling per pixel

const OVER = (dst, rgb, alpha) => {
    if (alpha <= 0) return dst;
    const outA = alpha + dst[3] * (1 - alpha);
    if (outA <= 0) return [0, 0, 0, 0];
    return [
        (rgb[0] * alpha + dst[0] * dst[3] * (1 - alpha)) / outA,
        (rgb[1] * alpha + dst[1] * dst[3] * (1 - alpha)) / outA,
        (rgb[2] * alpha + dst[2] * dst[3] * (1 - alpha)) / outA,
        outA,
    ];
};

/** Colour of one sample point, in device pixels relative to the centre. */
function shade(dx, dy, size, art, rounded) {
    const k = (size / 192) * art; // artwork scale
    const half = size / 2;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const dist = Math.hypot(dx, dy);

    if (rounded) {
        const r = ART.cornerRadius * (size / 192);
        const cx = Math.max(absX - (half - r), 0);
        const cy = Math.max(absY - (half - r), 0);
        if (Math.hypot(cx, cy) > r) return [0, 0, 0, 0]; // outside the rounded square
    }

    let colour = OVER([0, 0, 0, 0], ART.bg, 1);

    if (Math.abs(dist - ART.ringR * k) <= (ART.ringW * k) / 2) {
        colour = OVER(colour, ART.gold, 0.9);
    }

    if (Math.abs(dist - ART.dashR * k) <= (ART.dashW * k) / 2) {
        const along = Math.atan2(dy, dx) * ART.dashR * k; // arc length from 3 o'clock
        const period = ART.dashOn + ART.dashOff;
        const phase = ((along % period) + period) % period;
        if (phase <= ART.dashOn * k) colour = OVER(colour, ART.teal, 0.6);
    }

    const inTickX = absX <= (ART.tickW * k) / 2
        && absY >= ART.tickInner * k && absY <= ART.tickOuter * k;
    const inTickY = absY <= (ART.tickW * k) / 2
        && absX >= ART.tickInner * k && absX <= ART.tickOuter * k;
    if (inTickX || inTickY) colour = OVER(colour, ART.teal, 1);

    if (dist <= ART.coreR * k) {
        // Radial gradient #6fe0d5 -> #4dd0c4 -> #2a8a80, matching the SVG stops.
        const t = dist / (ART.coreR * k);
        const from = t < 0.6 ? ART.center : ART.teal;
        const to = t < 0.6 ? ART.teal : ART.coreEdge;
        const lt = t < 0.6 ? t / 0.6 : (t - 0.6) / 0.4;
        colour = OVER(colour, [
            from[0] + (to[0] - from[0]) * lt,
            from[1] + (to[1] - from[1]) * lt,
            from[2] + (to[2] - from[2]) * lt,
        ], 1);
    }

    if (dist <= ART.dotR * k) colour = OVER(colour, ART.dot, 0.95);

    return colour;
}


function render(size, art, rounded) {
    const pixels = Buffer.alloc(size * size * 4);
    const half = size / 2;
    const step = 1 / SAMPLES;
    const total = SAMPLES * SAMPLES;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let r = 0; let g = 0; let b = 0; let a = 0;
            for (let sy = 0; sy < SAMPLES; sy++) {
                for (let sx = 0; sx < SAMPLES; sx++) {
                    const dx = x + (sx + 0.5) * step - half;
                    const dy = y + (sy + 0.5) * step - half;
                    const c = shade(dx, dy, size, art, rounded);
                    // Accumulate premultiplied so edges average correctly.
                    r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
                }
            }
            const offset = (y * size + x) * 4;
            if (a === 0) continue; // fully transparent: leave the zeroed buffer
            pixels[offset] = Math.round(r / a);
            pixels[offset + 1] = Math.round(g / a);
            pixels[offset + 2] = Math.round(b / a);
            pixels[offset + 3] = Math.round((a / total) * 255);
        }
    }

    return pixels;
}

// ── minimal PNG encoder (RGBA, 8-bit, filter "none") ─────────────────────────

const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return table;
})();

function crc32(buf) {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
    return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed), 0);
    return Buffer.concat([length, typed, crc]);
}

function encodePng(size, pixels) {
    const stride = size * 4;
    const raw = Buffer.alloc((stride + 1) * size);
    for (let y = 0; y < size; y++) {
        raw[y * (stride + 1)] = 0; // filter type: none
        pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // colour type: truecolour with alpha
    ihdr[10] = 0; // deflate
    ihdr[11] = 0; // adaptive filtering
    ihdr[12] = 0; // no interlace

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

const TARGETS = [
    { file: 'icon-192.png', size: 192, art: 1, rounded: true },
    { file: 'icon-512.png', size: 512, art: 1, rounded: true },
    // Maskable: the launcher crops the outer ~10% on every side, so the artwork
    // shrinks to 72% and the background runs edge to edge.
    { file: 'icon-maskable-512.png', size: 512, art: 0.72, rounded: false },
    // iOS rounds the corners itself and does not support transparency.
    { file: 'apple-touch-icon.png', size: 180, art: 0.82, rounded: false },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const target of TARGETS) {
    const png = encodePng(target.size, render(target.size, target.art, target.rounded));
    fs.writeFileSync(path.join(OUT_DIR, target.file), png);
    console.log(`${target.file} — ${target.size}x${target.size}, ${png.length} bytes`);
}
