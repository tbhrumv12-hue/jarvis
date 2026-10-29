'use strict';

/* ═══════════════════════════════════════════════════════════════════════════════
   J.A.R.V.I.S // ASK TOOLS v1.0
   Gemini function declarations for /api/ask, plus the executor that runs a
   requested tool and shapes its answer as a functionResponse payload.

   Pure module — every capability (browser, YouTube, knowledge base) is injected
   by server.js through `deps`, so this layer is unit-testable without a network,
   a browser window or an API key.
   ═══════════════════════════════════════════════════════════════════════════════ */

// Caps keep a chatty source from blowing the model's context — and the SSE payload.
const MAX_QUERY_CHARS = 300;
const MAX_TITLE_CHARS = 200;
const MAX_SNIPPET_CHARS = 400;
const MAX_EXCERPT_CHARS = 1200;
const MAX_WEB_RESULTS = 5;
const MAX_VIDEOS = 8;
const MAX_EXCERPTS = 4;

function clampText(value, max) {
    const text = typeof value === 'string' ? value : String(value === null || value === undefined ? '' : value);
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

function cleanQuery(value) {
    return clampText(String(value || '').replace(/\s+/g, ' ').trim(), MAX_QUERY_CHARS);
}

function clampInt(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

/**
 * Parses the stdout of browser.js (`node browser.js "<query>"`).
 *
 * The script prints one block per result:
 *     1. <title>
 *        <url>
 *        <snippet>
 * Everything else — the `[Browser] Searching …` banners — is ignored.
 */
function parseBrowserResults(stdout) {
    const results = [];
    let current = null;

    for (const line of String(stdout || '').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const numbered = trimmed.match(/^(\d+)\.\s+(.+)$/);
        if (numbered) {
            if (current) results.push(current);
            current = { title: numbered[2].trim(), url: '', snippet: '' };
            continue;
        }

        if (!current) continue;

        if (trimmed.startsWith('http')) {
            if (!current.url) current.url = trimmed;
        } else if (trimmed.indexOf('[Browser]') === -1) {
            current.snippet = `${current.snippet} ${trimmed}`.trim();
        }
    }

    if (current) results.push(current);

    return results
        .filter((item) => item.title)
        .map((item) => ({
            title: clampText(item.title, MAX_TITLE_CHARS),
            url: item.url,
            snippet: clampText(item.snippet, MAX_SNIPPET_CHARS),
        }));
}

// ── Tool specifications ──
// `run(args, deps)` resolves with the object handed back to Gemini;
// `summarize(result)` renders the one-line Hebrew status shown in the HUD.
const ASK_TOOL_SPECS = [
    {
        name: 'web_search',
        label: 'חיפוש בדפדפן',
        needsQuery: true,
        description:
            'מפעיל דפדפן Chrome אמיתי, מבצע חיפוש ב-DuckDuckGo ומחזיר עד חמישה קישורים עם כותרת ותקציר. ' +
            'השתמש בו לכל דבר שעשוי להשתנות או שאינו בידע שלך: חדשות, מחירים, מזג אוויר, שעות פתיחה, ' +
            'אירועים, ספורט, מוצרים, אנשים ותאריכים. החיפוש אורך כמה שניות.',
        parameters: {
            type: 'OBJECT',
            properties: {
                query: {
                    type: 'STRING',
                    description: 'שאילתת החיפוש. אנגלית מניבה תוצאות טובות יותר ממקורות בינלאומיים.',
                },
            },
            required: ['query'],
        },
        async run(args, deps) {
            const query = cleanQuery(args.query);
            const results = await deps.browse(query);
            const limited = (Array.isArray(results) ? results : []).slice(0, MAX_WEB_RESULTS);
            return { query, resultCount: limited.length, results: limited };
        },
        summarize(result) {
            const count = Number(result && result.resultCount) || 0;
            return count ? `${count} תוצאות בדפדפן` : 'לא נמצאו תוצאות בדפדפן';
        },
    },
    {
        name: 'youtube_search',
        label: 'חיפוש ב-YouTube',
        needsQuery: true,
        description:
            'מחפש סרטונים ב-YouTube ומחזיר כותרת, קישור, ערוץ ומספר צפיות. ' +
            'השתמש בו כשהמשתמש מבקש סרטון, הדגמה, תרגול או הסבר וידאו.',
        parameters: {
            type: 'OBJECT',
            properties: {
                query: { type: 'STRING', description: 'נושא החיפוש ב-YouTube.' },
                max_results: { type: 'INTEGER', description: 'כמה סרטונים להחזיר (1-8, ברירת מחדל 4).' },
            },
            required: ['query'],
        },
        async run(args, deps) {
            const query = cleanQuery(args.query);
            const limit = clampInt(args.max_results, 1, MAX_VIDEOS, 4);
            const videos = await deps.youtube(query, limit);
            const limited = (Array.isArray(videos) ? videos : []).slice(0, MAX_VIDEOS);
            return { query, resultCount: limited.length, videos: limited };
        },
        summarize(result) {
            const count = Number(result && result.resultCount) || 0;
            return count ? `${count} סרטונים` : 'לא נמצאו סרטונים';
        },
    },
    {
        name: 'knowledge_search',
        label: 'חיפוש במאגר הידע',
        needsQuery: true,
        description:
            'מחפש במאגר הידע האישי של המשתמש (קבצי הטקסט שהוא העלה) ומחזיר את הקטעים הרלוונטיים. ' +
            'השתמש בו כשהשאלה נוגעת להעדפות, למטרות, לרעיונות או למידע אישי שהמשתמש שמר.',
        parameters: {
            type: 'OBJECT',
            properties: {
                query: { type: 'STRING', description: 'נושא החיפוש במאגר הידע האישי.' },
            },
            required: ['query'],
        },
        async run(args, deps) {
            const query = cleanQuery(args.query);
            const chunks = await deps.knowledge(query);
            const excerpts = shapeExcerpts(chunks);
            return { query, resultCount: excerpts.length, excerpts };
        },
        summarize(result) {
            const count = Number(result && result.resultCount) || 0;
            return count ? `${count} קטעים מהמאגר` : 'אין התאמה במאגר';
        },
    },
    {
        name: 'training_data',
        label: 'קריאת נתוני אימון',
        needsQuery: false,
        description:
            'קורא את נתוני האימון והכושר שנשמרו במאגר (תוכניות אימון, תרגילים, משקלים והתקדמות). ' +
            'השתמש בו לפני שאתה עונה על שאלות אימון, התקדמות, נפח או תוכנית אימונים. ' +
            'אפשר להעביר נושא לסינון, או להשאיר ריק כדי לקבל את הקטעים האחרונים.',
        parameters: {
            type: 'OBJECT',
            properties: {
                topic: {
                    type: 'STRING',
                    description: 'נושא לסינון (למשל "כתפיים", "נפח אימון", "Full Planche"). אופציונלי.',
                },
            },
            required: [],
        },
        async run(args, deps) {
            const topic = cleanQuery(args.topic || args.query);
            const chunks = await deps.training(topic);
            const excerpts = shapeExcerpts(chunks);
            return { topic, resultCount: excerpts.length, excerpts };
        },
        summarize(result) {
            const count = Number(result && result.resultCount) || 0;
            return count ? `${count} קטעי אימון` : 'אין נתוני אימון במאגר';
        },
    },
];

function shapeExcerpts(chunks) {
    return (Array.isArray(chunks) ? chunks : []).slice(0, MAX_EXCERPTS).map((chunk) => ({
        source: clampText(chunk && chunk.source, MAX_TITLE_CHARS),
        text: clampText(chunk && chunk.text, MAX_EXCERPT_CHARS),
    }));
}

// Gemini expects `tools: [{ functionDeclarations: [...] }]`.
const ASK_TOOL_DECLARATIONS = ASK_TOOL_SPECS.map((spec) => ({
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
}));

function buildAskToolsPayload() {
    return [{ functionDeclarations: ASK_TOOL_DECLARATIONS }];
}

function getAskToolSpec(name) {
    return ASK_TOOL_SPECS.find((spec) => spec.name === name) || null;
}

function askToolLabel(name) {
    const spec = getAskToolSpec(name);
    return spec ? spec.label : String(name || '');
}

/**
 * Runs one functionCall requested by the model.
 *
 * Never throws: a broken tool must degrade into an error the model can read and
 * phrase around, not into a failed answer.
 *
 * @returns {Promise<{ok: boolean, name: string, ms: number, result: object, summary: string}>}
 */
async function runAskTool(call, deps) {
    const started = Date.now();
    const capabilities = deps || {};
    const name = typeof (call && call.name) === 'string' ? call.name.trim() : '';
    const args = call && typeof call.args === 'object' && call.args ? call.args : {};
    const elapsed = () => Date.now() - started;
    const spec = getAskToolSpec(name);

    if (!spec) {
        return {
            ok: false,
            name: name || 'unknown',
            ms: elapsed(),
            result: { error: `unknown tool: ${name || '(empty)'}` },
            summary: 'כלי לא מוכר',
        };
    }

    if (spec.needsQuery && !cleanQuery(args.query)) {
        return {
            ok: false,
            name,
            ms: elapsed(),
            result: { error: 'missing required parameter: query' },
            summary: 'חסרה שאילתת חיפוש',
        };
    }

    try {
        const result = await spec.run(args, capabilities);
        return {
            ok: true,
            name,
            ms: elapsed(),
            result: result || {},
            summary: spec.summarize(result || {}),
        };
    } catch (err) {
        const message = err && err.message ? err.message : String(err);
        return {
            ok: false,
            name,
            ms: elapsed(),
            result: { error: clampText(message, MAX_SNIPPET_CHARS) },
            summary: `הכלי נכשל: ${clampText(message, 80)}`,
        };
    }
}

// Shape one outcome as a Gemini functionResponse part.
function toFunctionResponse(outcome) {
    return {
        functionResponse: {
            name: outcome.name,
            response: outcome.result && typeof outcome.result === 'object'
                ? outcome.result
                : { value: outcome.result },
        },
    };
}

module.exports = {
    ASK_TOOL_DECLARATIONS,
    ASK_TOOL_SPECS,
    askToolLabel,
    buildAskToolsPayload,
    getAskToolSpec,
    parseBrowserResults,
    runAskTool,
    toFunctionResponse,
};
