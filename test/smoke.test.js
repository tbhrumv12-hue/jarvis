'use strict';

/**
 * Smoke tests for J.A.R.V.I.S.
 *
 * No call reaches Gemini: the server is booted with a dummy GEMINI_API_KEY
 * (dotenv never overrides an existing env var, so a real key in `.env` is
 * never used here) and every assertion targets static files, health/metrics
 * routes, input validation and route removal — none of which spend tokens.
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


test('every JavaScript file parses', () => {
    const files = [
        SERVER_ENTRY,
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

test('unknown API routes return 404', async () => {
    const res = await fetch(`${baseUrl}/api/definitely-not-a-route`, { signal: AbortSignal.timeout(10000) });
    assert.equal(res.status, 404);
});
