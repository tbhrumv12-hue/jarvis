'use strict';

/**
 * Unit tests for ask-tools.js — the function-calling layer of /api/ask.
 *
 * No server, no Gemini, no browser: every capability is injected, so the whole
 * layer runs synchronously against fakes. Run with: npm test
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    ASK_TOOL_DECLARATIONS,
    ASK_TOOL_SPECS,
    askToolLabel,
    buildAskToolsPayload,
    parseBrowserResults,
    runAskTool,
    toFunctionResponse,
} = require('../ask-tools');

const VALID_TYPES = new Set(['STRING', 'INTEGER', 'NUMBER', 'BOOLEAN', 'ARRAY', 'OBJECT']);

test('every declaration is a valid Gemini function declaration', () => {
    assert.ok(ASK_TOOL_DECLARATIONS.length >= 4);

    const names = new Set();
    for (const declaration of ASK_TOOL_DECLARATIONS) {
        assert.match(declaration.name, /^[a-z][a-z0-9_]*$/, `bad tool name: ${declaration.name}`);
        assert.ok(!names.has(declaration.name), `duplicate tool name: ${declaration.name}`);
        names.add(declaration.name);

        assert.equal(typeof declaration.description, 'string');
        assert.ok(declaration.description.length > 20, `${declaration.name} needs a real description`);

        const schema = declaration.parameters;
        assert.equal(schema.type, 'OBJECT');
        assert.equal(typeof schema.properties, 'object');

        for (const [key, property] of Object.entries(schema.properties)) {
            assert.ok(VALID_TYPES.has(property.type), `${declaration.name}.${key} has type ${property.type}`);
            assert.equal(typeof property.description, 'string');
            assert.ok(property.description.length > 0);
        }

        assert.ok(Array.isArray(schema.required));
        for (const required of schema.required) {
            assert.ok(schema.properties[required], `${declaration.name}.required lists unknown "${required}"`);
        }
    }
});

test('buildAskToolsPayload wraps the declarations the way Gemini expects', () => {
    const payload = buildAskToolsPayload();
    assert.ok(Array.isArray(payload));
    assert.equal(payload.length, 1);
    assert.deepEqual(payload[0].functionDeclarations, ASK_TOOL_DECLARATIONS);
    // A fresh array each time: the request body is serialised per call.
    assert.notEqual(buildAskToolsPayload(), payload);
});

test('askToolLabel falls back to the raw name', () => {
    assert.equal(askToolLabel('web_search'), 'חיפוש בדפדפן');
    assert.equal(askToolLabel('nope'), 'nope');
    assert.equal(askToolLabel(undefined), '');
});

test('parseBrowserResults reads browser.js output and ignores its banners', () => {
    const stdout = [
        '[Browser] Searching DuckDuckGo Lite for: "full planche"',
        '',
        '[Browser] Top 2 results:',
        '',
        '1. Full Planche Tutorial',
        '   https://example.com/planche',
        '   A step by step progression guide.',
        '',
        '2. Planche Strength',
        '   https://example.com/strength',
        '   Bent arm holds.',
        '   Straight arm holds.',
        '',
        '[Browser] Done.',
    ].join('\n');

    const results = parseBrowserResults(stdout);

    assert.equal(results.length, 2);
    assert.deepEqual(results[0], {
        title: 'Full Planche Tutorial',
        url: 'https://example.com/planche',
        snippet: 'A step by step progression guide.',
    });
    assert.equal(results[1].url, 'https://example.com/strength');
    assert.equal(results[1].snippet, 'Bent arm holds. Straight arm holds.');
});

test('parseBrowserResults returns nothing for empty or banner-only output', () => {
    assert.deepEqual(parseBrowserResults(''), []);
    assert.deepEqual(parseBrowserResults('[Browser] Error: timeout'), []);
    assert.deepEqual(parseBrowserResults(null), []);
});

test('parseBrowserResults caps very long titles and snippets', () => {
    const [result] = parseBrowserResults(`1. ${'t'.repeat(500)}\nhttps://x.test\n${'s'.repeat(900)}`);
    assert.ok(result.title.length <= 201);
    assert.ok(result.snippet.length <= 401);
    assert.ok(result.title.endsWith('…'));
});

test('runAskTool reports a successful call with its summary', async () => {
    const seen = [];
    const deps = {
        browse: async (query) => {
            seen.push(query);
            return [
                { title: 'A', url: 'https://a.test', snippet: '' },
                { title: 'B', url: 'https://b.test', snippet: '' },
            ];
        },
    };

    const outcome = await runAskTool({ name: 'web_search', args: { query: '  planche   tutorial ' } }, deps);

    assert.equal(outcome.ok, true);
    assert.equal(outcome.name, 'web_search');
    assert.equal(typeof outcome.ms, 'number');
    assert.equal(outcome.result.query, 'planche tutorial', 'the query is whitespace-normalised');
    assert.equal(outcome.result.resultCount, 2);
    assert.equal(outcome.summary, '2 תוצאות בדפדפן');
    assert.deepEqual(seen, ['planche tutorial']);
});

test('runAskTool turns a throwing tool into a readable error instead of failing the answer', async () => {
    const deps = {
        browse: async () => {
            throw new Error('spawn failed');
        },
    };

    const outcome = await runAskTool({ name: 'web_search', args: { query: 'x' } }, deps);

    assert.equal(outcome.ok, false);
    assert.equal(outcome.result.error, 'spawn failed');
    assert.match(outcome.summary, /spawn failed/);
});

test('runAskTool rejects an unknown tool without throwing', async () => {
    const outcome = await runAskTool({ name: 'rm_rf', args: {} }, {});
    assert.equal(outcome.ok, false);
    assert.equal(outcome.name, 'rm_rf');
    assert.match(outcome.result.error, /unknown tool/);
});

test('runAskTool rejects a missing required query before touching a capability', async () => {
    let called = false;
    const deps = { browse: async () => { called = true; return []; } };

    const outcome = await runAskTool({ name: 'web_search', args: { query: '   ' } }, deps);

    assert.equal(outcome.ok, false);
    assert.equal(called, false);
    assert.match(outcome.result.error, /query/);
});

test('runAskTool clamps youtube max_results and caps the list', async () => {
    let requested = null;
    const deps = {
        youtube: async (query, limit) => {
            requested = limit;
            return Array.from({ length: 20 }, (unused, i) => ({ title: `v${i}`, url: `https://y.test/${i}` }));
        },
    };

    const outcome = await runAskTool({ name: 'youtube_search', args: { query: 'planche', max_results: 99 } }, deps);

    assert.equal(requested, 8, 'requested limit is clamped to the tool maximum');
    assert.equal(outcome.result.resultCount, 8);
    assert.equal(outcome.summary, '8 סרטונים');
});

test('training_data works without a query and reports the excerpts it found', async () => {
    const deps = {
        training: async (topic) => [{ source: 'training.txt', text: `topic=${topic}` }],
    };

    const outcome = await runAskTool({ name: 'training_data', args: {} }, deps);

    assert.equal(outcome.ok, true);
    assert.equal(outcome.result.topic, '');
    assert.equal(outcome.result.resultCount, 1);
    assert.deepEqual(outcome.result.excerpts, [{ source: 'training.txt', text: 'topic=' }]);
    assert.equal(outcome.summary, '1 קטעי אימון');
});

test('an empty capability result is a valid outcome, not an error', async () => {
    const outcome = await runAskTool({ name: 'knowledge_search', args: { query: 'nothing' } }, {
        knowledge: async () => [],
    });

    assert.equal(outcome.ok, true);
    assert.equal(outcome.result.resultCount, 0);
    assert.equal(outcome.summary, 'אין התאמה במאגר');
});

test('toFunctionResponse shapes a Gemini functionResponse part', async () => {
    const outcome = await runAskTool({ name: 'knowledge_search', args: { query: 'protein' } }, {
        knowledge: async () => [{ source: 'fitness.txt', text: 'eat protein' }],
    });

    const part = toFunctionResponse(outcome);

    assert.equal(part.functionResponse.name, 'knowledge_search');
    assert.equal(part.functionResponse.response.query, 'protein');
    assert.equal(part.functionResponse.response.resultCount, 1);
});

test('every spec exposes both a run and a summarize implementation', () => {
    for (const spec of ASK_TOOL_SPECS) {
        assert.equal(typeof spec.run, 'function', `${spec.name} has no run()`);
        assert.equal(typeof spec.summarize, 'function', `${spec.name} has no summarize()`);
        assert.equal(typeof spec.label, 'string');
        assert.ok(spec.label.length > 0);
    }
});
