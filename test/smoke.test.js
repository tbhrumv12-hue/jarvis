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

const postJson = (route, body) => fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    const metricsRes = await fetch(`${baseUrl}/api/metrics`, { signal: AbortSignal.timeout(10000) });
    assert.equal(metricsRes.status, 200);
    const metrics = await metricsRes.json();
    assert.equal(typeof metrics.totalRequests, 'number');

    const knowledgeRes = await fetch(`${baseUrl}/api/knowledge`, { signal: AbortSignal.timeout(10000) });
    assert.equal(knowledgeRes.status, 200);
    const knowledge = await knowledgeRes.json();
    assert.ok(Array.isArray(knowledge.files));
});

test('static pages are served', async () => {
    for (const route of ['/', '/app']) {
        const res = await fetch(`${baseUrl}${route}`, { signal: AbortSignal.timeout(10000) });
        assert.equal(res.status, 200, `${route} should return 200`);
        assert.match(res.headers.get('content-type') || '', /text\/html/, `${route} should be HTML`);
        const html = await res.text();
        assert.ok(html.length > 0, `${route} should not be empty`);
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
    const res = await fetch(`${baseUrl}/api/mega-prompt`, { signal: AbortSignal.timeout(20000) });
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
    const res = await fetch(`${baseUrl}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ prompt: 'חפש', stream: true }),
        signal: AbortSignal.timeout(10000),
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
    const res = await fetch(`${baseUrl}/api/ask?stream=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'חפש' }),
        signal: AbortSignal.timeout(10000),
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
    const res = await fetch(`${baseUrl}/api/definitely-not-a-route`, { signal: AbortSignal.timeout(10000) });
    assert.equal(res.status, 404);
});
