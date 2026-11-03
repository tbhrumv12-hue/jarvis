'use strict';

/**
 * Smoke tests for J.A.R.V.I.S.
 *
 * No call reaches Gemini: the server is booted with a dummy GEMINI_API_KEY
 * (dotenv never overrides an existing env var, so a real key in `.env` is
 * never used here) and every assertion targets static files, health/metrics
 * routes, input validation, the /api/ask SSE envelope and route removal — none
 * of which spend tokens.
 *
 * Run with: npm test
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const SERVER_ENTRY = path.join(ROOT, 'server.js');
const BOOT_TIMEOUT_MS = 30 * 1000;

// Every /api/* route requires `Authorization: Bearer <APP_API_KEY>` (S1). The server is
// spawned with this key below and every API call in this file sends it back.
const TEST_API_KEY = 'test-suite-api-key-0123456789abcdef';

let serverProcess = null;
let baseUrl = null;
const serverLog = [];

function findFreePort() {
    return new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.unref();
        probe.on('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const { port } = probe.address();
            probe.close(() => resolve(port));
        });
    });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForHealth(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let lastError = 'no attempt made';

    while (Date.now() < deadline) {
        if (serverProcess && serverProcess.exitCode !== null) {
            throw new Error(
                `server exited before becoming healthy (code ${serverProcess.exitCode})\n` +
                serverLog.join('')
            );
        }
        try {
            const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
            if (res.ok) return;
            lastError = `HTTP ${res.status}`;
        } catch (err) {
            lastError = err && err.message ? err.message : String(err);
        }
        await sleep(250);
    }

    throw new Error(
        `server did not become healthy within ${timeoutMs}ms (last error: ${lastError})\n` +
        serverLog.join('')
    );
}

before(async () => {
    const port = await findFreePort();
    baseUrl = `http://127.0.0.1:${port}`;

    serverProcess = spawn(process.execPath, [SERVER_ENTRY], {
        cwd: ROOT,
        env: {
            ...process.env,
            PORT: String(port),
            GEMINI_API_KEY: 'test-dummy-key-not-a-real-credential',
            APP_API_KEY: TEST_API_KEY,
            NODE_ENV: 'test',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    const collect = (chunk) => {
        serverLog.push(chunk.toString());
        if (serverLog.length > 500) serverLog.shift();
    };
    serverProcess.stdout.on('data', collect);
    serverProcess.stderr.on('data', collect);

    await waitForHealth(BOOT_TIMEOUT_MS);
});

after(async () => {
    if (!serverProcess || serverProcess.exitCode !== null) return;
    const exited = new Promise((resolve) => serverProcess.once('exit', resolve));
    serverProcess.kill();
    await Promise.race([exited, sleep(5000)]);
    if (serverProcess.exitCode === null) serverProcess.kill('SIGKILL');
});

const authHeaders = (extra) => Object.assign({ Authorization: `Bearer ${TEST_API_KEY}` }, extra || {});

const apiGet = (route, init) => {
    const options = Object.assign({}, init || {});
    options.headers = authHeaders(options.headers);
    if (!options.signal) options.signal = AbortSignal.timeout(10000);
    return fetch(`${baseUrl}${route}`, options);
};

const postJson = (route, body) => fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
});

/**
 * Reads an SSE response to the end and returns the parsed frames in arrival order.
 * Comment frames (`: ping` keep-alives) carry no data and are dropped.
 */
async function readSseEvents(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const events = [];
    let buffer = '';

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);

            const event = { event: 'message', data: null };
            for (const line of frame.split('\n')) {
                if (line.startsWith('event:')) event.event = line.slice(6).trim();
                else if (line.startsWith('data:')) {
                    const raw = line.slice(5).trim();
                    try {
                        event.data = JSON.parse(raw);
                    } catch {
                        event.data = raw;
                    }
                }
            }
            if (event.data !== null) events.push(event);

            boundary = buffer.indexOf('\n\n');
        }
    }

    return events;
}


test('every JavaScript file parses', () => {
    const files = [
        SERVER_ENTRY,
        path.join(ROOT, 'ask-tools.js'),
        path.join(ROOT, 'browser.js'),
        path.join(ROOT, 'gemini-fallback.js'),
        path.join(ROOT, 'whatsapp-bot.js'),
        path.join(ROOT, 'public', 'sw.js'),
    ];

    const jsDir = path.join(ROOT, 'public', 'js');
    if (fs.existsSync(jsDir)) {
        for (const name of fs.readdirSync(jsDir)) {
            if (name.endsWith('.js')) files.push(path.join(jsDir, name));
        }
    }

    for (const file of files) {
        assert.ok(fs.existsSync(file), `missing file: ${file}`);
        // throws (with the offending file in the message) on a syntax error
        execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    }
});

test('GET /api/health reports a healthy kernel', async () => {
    const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(10000) });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(typeof body.model, 'string');
    assert.ok(body.model.length > 0);
    assert.equal(typeof body.knowledgeFiles, 'number');
    assert.ok(body.knowledgeFiles >= 0);
    assert.equal(typeof body.uptime, 'number');
    assert.equal(typeof body.totalRequests, 'number');
});

test('GET /api/metrics and GET /api/knowledge respond', async () => {
    const metricsRes = await apiGet('/api/metrics');
    assert.equal(metricsRes.status, 200);
    const metrics = await metricsRes.json();
    assert.equal(typeof metrics.totalRequests, 'number');

    const knowledgeRes = await apiGet('/api/knowledge');
    assert.equal(knowledgeRes.status, 200);
    const knowledge = await knowledgeRes.json();
    assert.ok(Array.isArray(knowledge.files));
});

test('every /api route except /api/health rejects a missing or wrong key', async () => {
    const noKey = await fetch(`${baseUrl}/api/metrics`, { signal: AbortSignal.timeout(10000) });
    assert.equal(noKey.status, 401);
    assert.match(noKey.headers.get('www-authenticate') || '', /Bearer/);
    const body = await noKey.json();
    assert.equal(body.code, 'UNAUTHORIZED');

    const wrongKey = await fetch(`${baseUrl}/api/metrics`, {
        headers: { Authorization: 'Bearer not-the-configured-key' },
        signal: AbortSignal.timeout(10000),
    });
    assert.equal(wrongKey.status, 401);

    // /api/health stays open: Render's healthcheck has no secret to send.
    const health = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(10000) });
    assert.equal(health.status, 200);

    // Express routing is case-insensitive and percent-decodes escapes, so these
    // spellings reach the same handlers — none of them may skip the key check.
    for (const path of ['/API/metrics', '/Api/Metrics', '/%61pi/metrics']) {
        const res = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(10000) });
        assert.equal(res.status, 401, `${path} must require the key`);
    }
});

test('static pages are served', async () => {
    for (const route of ['/', '/app', '/analytics.html', '/nutrition.html', '/research.html', '/training.html', '/offline.html']) {
        const res = await fetch(`${baseUrl}${route}`, { signal: AbortSignal.timeout(10000) });
        assert.equal(res.status, 200, `${route} should return 200`);
        assert.match(res.headers.get('content-type') || '', /text\/html/, `${route} should be HTML`);
        const html = await res.text();
        assert.ok(html.length > 0, `${route} should not be empty`);
    }
});

test('all six pages carry the PWA shell', () => {
    // The registration snippet used to be copy-pasted inline into five pages
    // (training.html had none at all). Anything that renders HTML also needs the
    // shared escaper loaded synchronously, or the module falls back to its own copy.
    const pages = [
        'index.html',
        'landing.html',
        'analytics.html',
        'nutrition.html',
        'research.html',
        'training.html',
    ];

    for (const page of pages) {
        const html = fs.readFileSync(path.join(ROOT, 'public', page), 'utf8');

        assert.match(html, /<link rel="manifest" href="\/manifest\.json">/, `${page}: manifest link`);
        assert.match(
            html,
            /<link rel="apple-touch-icon"[^>]*href="\/icons\/apple-touch-icon\.png"/,
            `${page}: iOS ignores manifest icons and needs a PNG apple-touch-icon`
        );
        assert.match(html, /<link rel="stylesheet" href="\/css\/pwa\.css">/, `${page}: pwa.css`);
        assert.match(html, /<script src="\/js\/pwa\.js"><\/script>/, `${page}: pwa.js`);
        assert.ok(
            !html.includes('navigator.serviceWorker.register'),
            `${page}: registration belongs in /js/pwa.js only`
        );

        if (page === 'landing.html') continue; // landing.js renders no HTML

        const scripts = [...html.matchAll(/<script src="(\/js\/[^"]+)"/g)].map((m) => m[1]);
        const escapeAt = scripts.indexOf('/js/escape.js');
        assert.ok(escapeAt !== -1, `${page}: must load /js/escape.js`);

        scripts.forEach((src, index) => {
            // api-auth.js wraps window.fetch and pwa.js must keep running even when
            // escape.js is missing, so neither has to wait for it.
            if (src === '/js/escape.js' || src === '/js/api-auth.js' || src === '/js/pwa.js') return;
            assert.ok(escapeAt < index, `${page}: ${src} must load after /js/escape.js`);
        });
    }
});

test('service worker, offline page and manifest are served correctly', async () => {
    const sw = await fetch(`${baseUrl}/sw.js`, { signal: AbortSignal.timeout(10000) });
    assert.equal(sw.status, 200);
    assert.match(sw.headers.get('content-type') || '', /javascript/);
    // A worker served from the HTTP cache can delay an update by up to 24 hours.
    assert.equal(sw.headers.get('cache-control'), 'no-cache');
    assert.equal(sw.headers.get('service-worker-allowed'), '/');
    assert.ok((await sw.text()).includes("addEventListener('fetch'"), 'sw.js should intercept fetches');

    const offline = await fetch(`${baseUrl}/offline.html`, { signal: AbortSignal.timeout(10000) });
    assert.equal(offline.status, 200);
    assert.match(offline.headers.get('content-type') || '', /text\/html/);
    // Rendered when the network is gone, so it cannot rely on a stylesheet that
    // may never have been fetched.
    assert.ok(
        !/<link[^>]+rel="stylesheet"/.test(await offline.text()),
        'offline.html must be self-contained'
    );

    const manifestRes = await fetch(`${baseUrl}/manifest.json`, { signal: AbortSignal.timeout(10000) });
    assert.equal(manifestRes.status, 200);
    const manifest = await manifestRes.json();
    assert.equal(manifest.start_url, '/app', 'start_url must be the live app shell route');
    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'), 'Android crops a maskable icon');

    for (const icon of manifest.icons) {
        const res = await fetch(`${baseUrl}${icon.src}`, { signal: AbortSignal.timeout(10000) });
        assert.equal(res.status, 200, `${icon.src} must exist: the install prompt fetches it`);
    }
});

test('everything the service worker precaches is really served', async () => {
    // caches.addAll() is atomic: a single 404 fails the install and the app loses
    // offline mode without saying anything. The list is small, so this is cheap.
    const source = fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8');
    const start = source.indexOf('const PRECACHE_URLS');
    assert.ok(start !== -1, 'sw.js should declare PRECACHE_URLS');

    // The first entry is the OFFLINE_URL constant, not a literal.
    const offlineUrl = /const OFFLINE_URL = '([^']+)'/.exec(source);
    assert.ok(offlineUrl, 'sw.js should declare OFFLINE_URL');

    const block = source.slice(start, source.indexOf('];', start));
    const urls = [...block.matchAll(/'(\/[^']*)'|(OFFLINE_URL)/g)].map((m) => m[1] || offlineUrl[1]);
    assert.ok(urls.length >= 5, 'PRECACHE_URLS should not be empty');
    assert.ok(urls.includes(offlineUrl[1]), 'the offline fallback must be precached');

    for (const url of urls) {
        const res = await fetch(`${baseUrl}${url}`, { signal: AbortSignal.timeout(10000) });
        assert.equal(res.status, 200, `${url} is precached, so it must return 200`);
    }
});

test('removed dead endpoints stay removed', async () => {
    // Removed because nothing under public/ ever called them.
    for (const route of ['/api/analyze', '/api/browse', '/api/browser/action']) {
        const res = await postJson(route, {});
        assert.equal(res.status, 404, `${route} should be gone (got ${res.status})`);
    }
});

test('GET /api/mega-prompt no longer advertises removed endpoints', async () => {
    const res = await apiGet('/api/mega-prompt');
    assert.equal(res.status, 200);

    const text = await res.text();
    assert.ok(text.length > 0);

    for (const route of ['/api/browse', '/api/browser/action', '/api/analyze']) {
        assert.ok(!text.includes(route), `mega-prompt should not mention ${route}`);
    }
    // a sibling route containing "analyze" must survive the check above
    assert.ok(text.includes('/api/nutrition/analyze'), 'nutrition analyze should still be advertised');
});

test('input validation rejects bad payloads without calling the model', async () => {
    const emptyAsk = await postJson('/api/ask', {});
    assert.equal(emptyAsk.status, 400);

    const tooLongAsk = await postJson('/api/ask', { prompt: 'x'.repeat(4000) });
    assert.equal(tooLongAsk.status, 413);

    const emptyTraining = await postJson('/api/training/analyze', { days: [] });
    assert.equal(emptyTraining.status, 400);
});

test('POST /api/ask streams deltas and a final done event over SSE', async () => {
    // "חפש" on its own short-circuits before Gemini and before browser.js, so the whole SSE path
    // is exercised without spending tokens or touching the network.
    const res = await apiGet('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ prompt: 'חפש', stream: true }),
    });

    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/event-stream/);
    assert.equal(res.headers.get('cache-control'), 'no-cache, no-transform');
    assert.equal(res.headers.get('x-accel-buffering'), 'no');

    const events = await readSseEvents(res);
    const kinds = events.map((e) => e.event);

    assert.ok(kinds.includes('delta'), `expected a delta event, got: ${kinds.join(',') || 'nothing'}`);
    assert.equal(kinds[kinds.length - 1], 'done', 'done must be the last event');

    const streamedText = events
        .filter((e) => e.event === 'delta')
        .map((e) => e.data.text)
        .join('');
    const done = events.find((e) => e.event === 'done');

    assert.ok(streamedText.length > 0);
    assert.equal(streamedText, done.data.reply, 'the deltas must add up to the full reply');
    assert.equal(done.data.streamed, true);
});

test('?stream=1 also opts a request into SSE', async () => {
    const res = await apiGet('/api/ask?stream=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'חפש' }),
    });

    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/event-stream/);

    const events = await readSseEvents(res);
    assert.equal(events[events.length - 1].event, 'done');
});

test('POST /api/ask still answers with plain JSON when streaming is not requested', async () => {
    const res = await postJson('/api/ask', { prompt: 'חפש' });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /application\/json/);

    const body = await res.json();
    assert.equal(body.reply, 'אדוני, אנא ספק מילת חיפוש מדויקת יותר.');
});

test('a streaming request still fails fast with JSON on bad input', async () => {
    // Validation runs before the channel opens, so clients can check res.ok instead of
    // digging an error out of a 200 stream.
    const res = await postJson('/api/ask', { prompt: '', stream: true });
    assert.equal(res.status, 400);
    assert.match(res.headers.get('content-type') || '', /application\/json/);
});

test('unknown API routes return 404', async () => {
    const res = await apiGet('/api/definitely-not-a-route');
    assert.equal(res.status, 404);
});
