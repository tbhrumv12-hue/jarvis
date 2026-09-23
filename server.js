/**
 * ⚡ J.A.R.V.I.S Server — Neural Kernel V3.2
 * Express + Gemini + Vision + Knowledge Base (BM25) + Conversation Memory
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// ==============================
// 1. קונפיגורציה
// ==============================

const REQUIRED_ENV_VARS = ['GEMINI_API_KEY'];
const missingEnvVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

if (missingEnvVars.length > 0) {
    console.error(`❌ חסרים משתני סביבה קריטיים: ${missingEnvVars.join(', ')}`);
    process.exit(1);
}

const CONFIG = {
    port: process.env.PORT || 3000,
    geminiApiKey: process.env.GEMINI_API_KEY.trim(),
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    geminiTimeoutMs: Number(process.env.GEMINI_TIMEOUT_MS) || 20000,
    geminiVisionTimeoutMs: Number(process.env.GEMINI_VISION_TIMEOUT_MS) || 30000,
    maxPromptLength: Number(process.env.MAX_PROMPT_LENGTH) || 2000,
    maxImageSizeBytes: Number(process.env.MAX_IMAGE_SIZE_BYTES) || 4 * 1024 * 1024,
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000,
    rateLimitMax: Number(process.env.RATE_LIMIT_MAX) || 30,
    visionRateLimitMax: Number(process.env.VISION_RATE_LIMIT_MAX) || 15,
    metricsPollIntervalMs: Number(process.env.METRICS_POLL_INTERVAL_MS) || 3000,
    retryOn429DelayMs: Number(process.env.RETRY_ON_429_DELAY_MS) || 55000,

    // Knowledge
    knowledgeDir: path.join(__dirname, 'knowledge'),
    knowledgeMaxFileSizeBytes: 1024 * 1024,
    knowledgeMaxFiles: 100,
    knowledgeChunkSize: 1200,
    knowledgeTopChunks: 5,
    knowledgeMinScore: 0.4,

    // Conversation
    maxHistoryMessages: Number(process.env.MAX_HISTORY_MESSAGES) || 12,
    maxHistoryCharsPerMessage: 2000,
    maxTotalHistoryChars: 8000,
};

// ==============================
// 2. פרומפטים
// ==============================

const SYSTEM_PROMPT = `אתה ג'רוויס (J.A.R.V.I.S) — עוזר AI אישי, חד, ישיר ואנליטי.

## כללי התנהגות מוחלטים:

### 1. אפס "יאס-מן"
- אל תסכים אוטומטית. אל תלטף אגו. אל תחמיא סתם.
- אם יש רעיון גרוע, לא ריאלי או לא הגיוני — אמור זאת ישירות, עם נימוקים.
- ביקורת חריפה ואנליטית היא כלי עזר, לא פגיעה.

### 2. בחר צד חד-משמעית
- כשנשאלת שאלה עם דילמה — אסור להתחמק עם "יש לכאן ולכאן".
- תגיד בבירור מה אתה היית בוחר, עם נימוקים מוצקים.
- אם אתה לא בטוח — תגיד "אני לא בטוח", אבל עדיין תן את דעתך.

### 3. התבסס רק על עובדות
- אל תמציא נתונים, תאריכים, שמות או מספרים.
- אם אין לך מידע — תגיד "אין לי מידע על זה".
- אל תניח הנחות על המשתמש בלי שהוא אמר.

### 4. תשובות פרקטיות וקצרות
- בלי הקדמות מיותרות ("שאלה טובה!", "בוודאי!", "בשמחה!").
- ישר לעניין. אם אפשר לענות במשפט — ענה במשפט.
- בגובה העיניים, בלי מילים גבוהות מידי.
- אם נדרשת תשובה ארוכה — חלק אותה לסעיפים.

### 5. התאמה אישית
- התבסס על ההעדפות, המטרות והמידע האישי השמור בידע (אם רלוונטי).
- זכור שאתה מדבר עם מתבגר, לא עם מנהל בכיר.
- שפה טבעית, לא רשמית מדי ולא ילדותית.

### 6. סגנון ג'רוויס
- פנה למשתמש כ"אדוני" (או בלי תואר — לפי ההקשר).
- טון רגוע, מדויק, ביטחוני, כמו מערכת הפעלה מתקדמת.
- הומור יבש זה בסדר כשמתאים.

## שפה: עברית בלבד. תמיד.`;

const VISION_SYSTEM_PROMPT = `אתה ג'רוויס (J.A.R.V.I.S), מערכת בינה מלאכותית עם חיישנים אופטיים. אתה מקבל תמונה מהמצלמה של המשתמש ומנתח אותה. תאר בקצרה, בצורה עניינית, בגוף ראשון, בעברית בלבד, מה אתה רואה. היה ספציפי לגבי אנשים, חפצים, צבעים, ותנועות שאתה מזהה. אם יש בן אדם — תאר מה הוא עושה ומצב רוח כללי (אם ניתן להסיק). אם אין — תאר את הסביבה. אל תמציא דברים שלא רואים בתמונה.`;

const KNOWLEDGE_SYSTEM_PROMPT = `אתה ג'רוויס (J.A.R.V.I.S) — עוזר אישי עם גישה למאגר ידע אישי של המשתמש.

## כללים לשימוש בידע:
1. השתמש במידע מהידע רק אם הוא רלוונטי לשאלה.
2. אם הידע סותר את מה שאתה יודע — תן עדיפות לידע (זה מה שהמשתמש אמר על עצמו).
3. אם אין בידע מידע רלוונטי — ענה כרגיל בלי להזכיר את הידע.
4. אל תמציא מידע שלא כתוב במפורש בידע.
5. אל תחשוף את המקורות (שמות קבצים) — פשוט ענה.
6. אם השאלה דורשת מידע שאין לך — תגיד "אין לי מידע על זה במאגר".

## שפה: עברית בלבד.`;

// ==============================
// 3. מטריקות
// ==============================

const metrics = {
    startedAt: Date.now(),
    totalRequests: 0,
    totalErrors: 0,
    totalSuccess: 0,
    totalVisionRequests: 0,
    totalKnowledgeLookups: 0,
    totalKnowledgeHits: 0,
    totalRateLimitHits: 0,
    totalHistoryMessagesSent: 0,
    lastLatencyMs: 0,
    avgLatencyMs: 0,
    lastErrorAt: null,
    lastErrorMessage: null,
    latencySamples: [],
};

function recordLatency(ms) {
    metrics.lastLatencyMs = ms;
    metrics.latencySamples.push(ms);
    if (metrics.latencySamples.length > 50) metrics.latencySamples.shift();
    const sum = metrics.latencySamples.reduce((a, b) => a + b, 0);
    metrics.avgLatencyMs = Math.round(sum / metrics.latencySamples.length);
}

function recordError(message) {
    metrics.totalErrors += 1;
    metrics.lastErrorAt = Date.now();
    metrics.lastErrorMessage = message;
}

// ==============================
// 4. לוגר
// ==============================

function log(level, message, meta = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    if (meta) console.log(`${prefix} ${message}`, meta);
    else console.log(`${prefix} ${message}`);
}

// ==============================
// 5. שגיאות
// ==============================

class GeminiError extends Error {
    constructor(message, statusCode = 500, details = null, isRateLimit = false) {
        super(message);
        this.name = 'GeminiError';
        this.statusCode = statusCode;
        this.details = details;
        this.isRateLimit = isRateLimit;
    }
}

function backoffDelay(attempt) {
    return Math.min(1000 * 2 ** attempt, 5000);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

function isRateLimitError(data, status) {
    if (status === 429) return true;
    if (data && data.error) {
        const msg = (data.error.message || '').toLowerCase();
        const code = data.error.code;
        if (code === 429) return true;
        if (msg.includes('quota') || msg.includes('rate limit') || msg.includes('exceeded')) return true;
    }
    return false;
}

function extractRetryDelay(data) {
    if (!data || !data.error) return null;
    const msg = data.error.message || '';
    const match = msg.match(/retry in ([\d.]+)s/i);
    if (match && match[1]) {
        const seconds = parseFloat(match[1]);
        if (!isNaN(seconds) && seconds > 0) return Math.ceil(seconds * 1000) + 1000;
    }
    return null;
}

// ==============================
// 6. Knowledge Base — BM25
// ==============================

const knowledge = {
    chunks: [],
    files: new Map(),
    loadedAt: null,
    totalChars: 0,
    // BM25 state
    avgDocLength: 0,
    docFreq: new Map(), // token → count of docs containing it
};

const STOP_WORDS_HE = new Set([
    'של', 'את', 'על', 'עם', 'כל', 'זה', 'זו', 'הוא', 'היא', 'הם', 'הן',
    'אני', 'אתה', 'אנחנו', 'אתם', 'אתן', 'לי', 'לך', 'לו', 'לה', 'לנו',
    'יש', 'אין', 'היה', 'היתה', 'יהיה', 'להיות', 'גם', 'רק', 'או', 'אבל',
    'אם', 'כי', 'מה', 'מי', 'איך', 'למה', 'מתי', 'איפה', 'איזה', 'כמה',
    'כן', 'לא', 'אפשר', 'צריך', 'רוצה', 'יכול', 'הולך', 'עושה', 'הופך',
]);

const STOP_WORDS_EN = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'as',
    'and', 'or', 'but', 'if', 'then', 'than', 'so', 'that', 'this',
    'it', 'its', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him',
    'her', 'us', 'them', 'my', 'your', 'his', 'our', 'their',
    'what', 'which', 'who', 'when', 'where', 'why', 'how',
    'can', 'could', 'should', 'would', 'may', 'might', 'will',
    'do', 'does', 'did', 'have', 'has', 'had',
]);

function tokenize(text) {
    if (!text) return [];
    return text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 2)
        .filter((w) => !STOP_WORDS_HE.has(w) && !STOP_WORDS_EN.has(w));
}

function chunkText(text, maxSize) {
    const chunks = [];
    if (!text) return chunks;
    const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const paragraphs = normalized.split(/\n\n+/);
    let current = '';

    for (const para of paragraphs) {
        if ((current + '\n\n' + para).length <= maxSize) {
            current = current ? current + '\n\n' + para : para;
        } else {
            if (current) chunks.push(current.trim());
            if (para.length <= maxSize) {
                current = para;
            } else {
                const sentences = para.split(/(?<=[.!?])\s+/);
                let buf = '';
                for (const sent of sentences) {
                    if ((buf + ' ' + sent).length <= maxSize) {
                        buf = buf ? buf + ' ' + sent : sent;
                    } else {
                        if (buf) chunks.push(buf.trim());
                        buf = sent;
                    }
                }
                if (buf) chunks.push(buf.trim());
                current = '';
            }
        }
    }
    if (current) chunks.push(current.trim());
    return chunks.filter((c) => c.length > 0);
}

function loadKnowledgeBase() {
    knowledge.chunks = [];
    knowledge.files = new Map();
    knowledge.totalChars = 0;
    knowledge.docFreq = new Map();
    knowledge.avgDocLength = 0;

    try {
        if (!fs.existsSync(CONFIG.knowledgeDir)) {
            fs.mkdirSync(CONFIG.knowledgeDir, { recursive: true });
        }

        const files = fs.readdirSync(CONFIG.knowledgeDir).filter((f) => {
            const ext = path.extname(f).toLowerCase();
            return ext === '.txt' || ext === '.md';
        });

        let totalDocLength = 0;

        for (const filename of files) {
            try {
                const fullPath = path.join(CONFIG.knowledgeDir, filename);
                const stat = fs.statSync(fullPath);
                if (!stat.isFile()) continue;
                if (stat.size > CONFIG.knowledgeMaxFileSizeBytes) {
                    log('warn', `Knowledge file too large, skipped: ${filename}`);
                    continue;
                }

                const content = fs.readFileSync(fullPath, 'utf8');
                const chunks = chunkText(content, CONFIG.knowledgeChunkSize);

                let chunkCount = 0;
                for (const chunk of chunks) {
                    const tokens = tokenize(chunk);
                    if (tokens.length === 0) continue;

                    const tokenFreq = new Map();
                    const uniqueTokens = new Set();
                    for (const t of tokens) {
                        tokenFreq.set(t, (tokenFreq.get(t) || 0) + 1);
                        uniqueTokens.add(t);
                    }

                    knowledge.chunks.push({
                        source: filename,
                        text: chunk,
                        tokens,
                        length: tokens.length,
                        tokenFreq,
                        uniqueTokens,
                    });

                    for (const t of uniqueTokens) {
                        knowledge.docFreq.set(t, (knowledge.docFreq.get(t) || 0) + 1);
                    }

                    totalDocLength += tokens.length;
                    chunkCount++;
                }

                knowledge.files.set(filename, {
                    name: filename,
                    size: stat.size,
                    chunks: chunkCount,
                    chars: content.length,
                    modifiedAt: stat.mtimeMs,
                });

                knowledge.totalChars += content.length;
            } catch (err) {
                log('warn', `Failed to load knowledge file: ${filename}`, err.message);
            }
        }

        if (knowledge.chunks.length > 0) {
            knowledge.avgDocLength = totalDocLength / knowledge.chunks.length;
        }

        knowledge.loadedAt = Date.now();
        log('info', `Knowledge base loaded (BM25)`, {
            files: knowledge.files.size,
            chunks: knowledge.chunks.length,
            vocab: knowledge.docFreq.size,
            avgDocLength: Math.round(knowledge.avgDocLength),
        });
    } catch (err) {
        log('error', 'Failed to load knowledge base', err.message);
    }
}

// === BM25 scoring ===
const BM25_K1 = 1.5;
const BM25_B = 0.75;

function bm25Score(queryTokens, chunk, N, avgdl) {
    if (!queryTokens.length || !chunk.tokenFreq) return 0;
    let score = 0;
    const docLen = chunk.length || 1;

    for (const qt of queryTokens) {
        const f = chunk.tokenFreq.get(qt) || 0;
        if (f === 0) continue;

        const df = knowledge.docFreq.get(qt) || 1;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const numerator = f * (BM25_K1 + 1);
        const denominator = f + BM25_K1 * (1 - BM25_B + BM25_B * (docLen / avgdl));

        score += idf * (numerator / denominator);
    }
    return score;
}

function searchKnowledge(query) {
    if (!knowledge.chunks.length) return [];
    const queryTokens = tokenize(query);
    if (!queryTokens.length) return [];

    const N = knowledge.chunks.length;
    const avgdl = knowledge.avgDocLength || 1;

    const scored = [];
    for (const chunk of knowledge.chunks) {
        const score = bm25Score(queryTokens, chunk, N, avgdl);
        if (score >= CONFIG.knowledgeMinScore) {
            scored.push({ chunk, score });
        }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, CONFIG.knowledgeTopChunks).map((s) => s.chunk);
}

function buildKnowledgeContext(chunks) {
    if (!chunks || !chunks.length) return '';
    const parts = chunks.map((c, i) => `[מקור ${i + 1}: ${c.source}]\n${c.text}`);
    return `=== מאגר ידע רלוונטי ===\n${parts.join('\n\n---\n\n')}\n=== סוף מאגר ידע ===`;
}

// ==============================
// 7. Conversation Memory
// ==============================

function sanitizeHistory(history) {
    if (!Array.isArray(history)) return [];
    const cleaned = [];
    let totalChars = 0;

    // הולכים מהסוף להתחלה — שומרים את האחרונות
    for (let i = history.length - 1; i >= 0; i--) {
        const m = history[i];
        if (!m || typeof m !== 'object') continue;
        const role = m.role === 'user' ? 'user' : (m.role === 'jarvis' ? 'model' : null);
        if (!role) continue;
        let text = typeof m.text === 'string' ? m.text.trim() : '';
        if (!text) continue;
        if (text.length > CONFIG.maxHistoryCharsPerMessage) {
            text = text.substring(0, CONFIG.maxHistoryCharsPerMessage) + '...';
        }
        if (totalChars + text.length > CONFIG.maxTotalHistoryChars) break;
        cleaned.unshift({ role, text });
        totalChars += text.length;
        if (cleaned.length >= CONFIG.maxHistoryMessages) break;
    }
    return cleaned;
}

function buildConversationContents(history, newUserQuery) {
    const contents = [];
    for (const m of history) {
        contents.push({
            role: m.role,
            parts: [{ text: m.text }],
        });
    }
    contents.push({
        role: 'user',
        parts: [{ text: newUserQuery }],
    });
    return contents;
}

// ==============================
// 8. Gemini calls
// ==============================

async function callGeminiWithRetry(userQuery, knowledgeContext = '', history = [], retries = 2) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent?key=${CONFIG.geminiApiKey}`;

    // בניית ה-system instruction לפי הצורך
    let systemText;
    if (knowledgeContext) {
        systemText = `${KNOWLEDGE_SYSTEM_PROMPT}\n\n${knowledgeContext}`;
    } else {
        systemText = SYSTEM_PROMPT;
    }

    const contents = buildConversationContents(history, userQuery);

    const body = JSON.stringify({
        systemInstruction: {
            parts: [{ text: systemText }],
        },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    });

    let lastError;
    const coreStart = Date.now();

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetchWithTimeout(
                url,
                { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
                CONFIG.geminiTimeoutMs
            );
            const data = await response.json();

            if (data.error) {
                const rateLimited = isRateLimitError(data, response.status);
                if (rateLimited && attempt < retries) {
                    metrics.totalRateLimitHits += 1;
                    const retryMs = extractRetryDelay(data) || CONFIG.retryOn429DelayMs;
                    log('warn', `Rate limit — waiting ${Math.round(retryMs / 1000)}s`);
                    await sleep(retryMs);
                    continue;
                }
                const isRetryable = response.status >= 500;
                if (!isRetryable || attempt === retries) {
                    throw new GeminiError(
                        data.error.message || 'שגיאה לא ידועה ממערכת הליבה',
                        response.status >= 400 ? response.status : 502,
                        data.error,
                        rateLimited
                    );
                }
                lastError = new GeminiError(data.error.message, response.status, null, rateLimited);
                await sleep(backoffDelay(attempt));
                continue;
            }

            const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!reply) throw new GeminiError('מבנה הנתונים אינו תקין', 502, data);

            return {
                reply: reply.trim(),
                coreLatencyMs: Date.now() - coreStart,
                attempts: attempt + 1,
            };
        } catch (error) {
            if (error instanceof GeminiError) lastError = error;
            else if (error.name === 'AbortError') lastError = new GeminiError('תם הזמן הקצוב', 504);
            else lastError = new GeminiError('תקלת תקשורת זמנית', 502, error.message);

            if (attempt === retries) throw lastError;
            await sleep(backoffDelay(attempt));
        }
    }
    throw lastError;
}

async function callGeminiVision(imageBase64, mimeType, userPrompt, retries = 1) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent?key=${CONFIG.geminiApiKey}`;

    const promptText = userPrompt && userPrompt.trim()
        ? `${VISION_SYSTEM_PROMPT}\n\nהמשתמש שואל: ${userPrompt.trim()}`
        : `${VISION_SYSTEM_PROMPT}\n\nתאר מה אתה רואה בתמונה.`;

    const body = JSON.stringify({
        contents: [{
            parts: [
                { text: promptText },
                { inline_data: { mime_type: mimeType, data: imageBase64 } },
            ],
        }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 512 },
    });

    let lastError;
    const coreStart = Date.now();

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetchWithTimeout(
                url,
                { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
                CONFIG.geminiVisionTimeoutMs
            );
            const data = await response.json();

            if (data.error) {
                const rateLimited = isRateLimitError(data, response.status);
                if (rateLimited && attempt < retries) {
                    metrics.totalRateLimitHits += 1;
                    const retryMs = extractRetryDelay(data) || CONFIG.retryOn429DelayMs;
                    await sleep(retryMs);
                    continue;
                }
                const isRetryable = response.status >= 500;
                if (!isRetryable || attempt === retries) {
                    throw new GeminiError(
                        data.error.message || 'שגיאה בניתוח התמונה',
                        response.status >= 400 ? response.status : 502,
                        data.error,
                        rateLimited
                    );
                }
                lastError = new GeminiError(data.error.message, response.status, null, rateLimited);
                await sleep(backoffDelay(attempt));
                continue;
            }

            const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!reply) throw new GeminiError('מבנה הנתונים אינו תקין', 502, data);

            return { reply: reply.trim(), coreLatencyMs: Date.now() - coreStart, attempts: attempt + 1 };
        } catch (error) {
            if (error instanceof GeminiError) lastError = error;
            else if (error.name === 'AbortError') lastError = new GeminiError('תם הזמן הקצוב', 504);
            else lastError = new GeminiError('תקלת תקשורת זמנית', 502, error.message);

            if (attempt === retries) throw lastError;
            await sleep(backoffDelay(attempt));
        }
    }
    throw lastError;
}

// ==============================
// 9. Express
// ==============================

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (req.path.startsWith('/api/')) {
            log('info', `${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`);
        }
    });
    next();
});

const apiRateLimiter = rateLimit({
    windowMs: CONFIG.rateLimitWindowMs,
    max: CONFIG.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { reply: 'אדון, יותר מדי בקשות בזמן קצר.' },
});

const visionRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: CONFIG.visionRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { reply: 'אדון, יותר מדי בקשות ניתוח תמונה.' },
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', (req, res) => {
    try {
        const uptimeSeconds = Math.floor((Date.now() - metrics.startedAt) / 1000);
        res.json({
            status: 'ok',
            uptime: uptimeSeconds,
            model: CONFIG.geminiModel,
            latencyMs: metrics.lastLatencyMs,
            avgLatencyMs: metrics.avgLatencyMs,
            totalRequests: metrics.totalRequests,
            totalSuccess: metrics.totalSuccess,
            totalErrors: metrics.totalErrors,
            totalVisionRequests: metrics.totalVisionRequests,
            totalKnowledgeLookups: metrics.totalKnowledgeLookups,
            totalKnowledgeHits: metrics.totalKnowledgeHits,
            totalRateLimitHits: metrics.totalRateLimitHits,
            totalHistoryMessagesSent: metrics.totalHistoryMessagesSent,
            knowledgeFiles: knowledge.files.size,
            knowledgeChunks: knowledge.chunks.length,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        res.status(500).json({ status: 'error' });
    }
});

app.get('/api/metrics', (req, res) => {
    try {
        const uptimeSeconds = Math.floor((Date.now() - metrics.startedAt) / 1000);
        res.json({
            uptime: uptimeSeconds,
            model: CONFIG.geminiModel,
            latencyMs: metrics.lastLatencyMs,
            avgLatencyMs: metrics.avgLatencyMs,
            totalRequests: metrics.totalRequests,
            totalErrors: metrics.totalErrors,
            totalVisionRequests: metrics.totalVisionRequests,
            totalKnowledgeLookups: metrics.totalKnowledgeLookups,
            totalKnowledgeHits: metrics.totalKnowledgeHits,
            totalRateLimitHits: metrics.totalRateLimitHits,
            totalHistoryMessagesSent: metrics.totalHistoryMessagesSent,
            knowledgeFiles: knowledge.files.size,
            knowledgeChunks: knowledge.chunks.length,
            pollIntervalMs: CONFIG.metricsPollIntervalMs,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        res.status(500).json({ error: 'Metrics unavailable' });
    }
});

// === Knowledge ===
app.get('/api/knowledge', (req, res) => {
    try {
        const files = Array.from(knowledge.files.values()).map((f) => ({
            name: f.name, size: f.size, chunks: f.chunks, chars: f.chars, modifiedAt: f.modifiedAt,
        })).sort((a, b) => b.modifiedAt - a.modifiedAt);

        res.json({
            files,
            totalFiles: files.length,
            totalChunks: knowledge.chunks.length,
            totalChars: knowledge.totalChars,
            loadedAt: knowledge.loadedAt,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to list knowledge' });
    }
});

app.post('/api/knowledge/upload', (req, res) => {
    try {
        const { name, content } = req.body || {};
        if (!name || typeof name !== 'string') return res.status(400).json({ error: 'חסר שם קובץ' });
        if (!content || typeof content !== 'string') return res.status(400).json({ error: 'חסר תוכן לקובץ' });

        const safeName = path.basename(name).replace(/[^\p{L}\p{N}\-_. ]/gu, '_');
        if (!/\.(txt|md)$/i.test(safeName)) return res.status(400).json({ error: 'רק קבצי .txt או .md נתמכים' });
        if (knowledge.files.size >= CONFIG.knowledgeMaxFiles) return res.status(413).json({ error: `מקסימום ${CONFIG.knowledgeMaxFiles} קבצים` });
        if (Buffer.byteLength(content, 'utf8') > CONFIG.knowledgeMaxFileSizeBytes) return res.status(413).json({ error: 'הקובץ גדול מדי' });

        const fullPath = path.join(CONFIG.knowledgeDir, safeName);
        fs.writeFileSync(fullPath, content, 'utf8');
        loadKnowledgeBase();

        log('info', `Knowledge uploaded: ${safeName}`);
        res.json({ success: true, name: safeName, totalFiles: knowledge.files.size, totalChunks: knowledge.chunks.length });
    } catch (err) {
        res.status(500).json({ error: 'העלאה נכשלה: ' + err.message });
    }
});

app.delete('/api/knowledge/:name', (req, res) => {
    try {
        const safeName = path.basename(req.params.name || '');
        if (!safeName || !/\.(txt|md)$/i.test(safeName)) return res.status(400).json({ error: 'שם קובץ לא תקין' });

        const fullPath = path.join(CONFIG.knowledgeDir, safeName);
        if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'הקובץ לא נמצא' });

        const resolved = path.resolve(fullPath);
        const baseDir = path.resolve(CONFIG.knowledgeDir);
        if (!resolved.startsWith(baseDir + path.sep)) return res.status(400).json({ error: 'נתיב לא חוקי' });

        fs.unlinkSync(fullPath);
        loadKnowledgeBase();

        res.json({ success: true, name: safeName, totalFiles: knowledge.files.size, totalChunks: knowledge.chunks.length });
    } catch (err) {
        res.status(500).json({ error: 'מחיקה נכשלה: ' + err.message });
    }
});

app.post('/api/knowledge/reload', (req, res) => {
    try {
        loadKnowledgeBase();
        res.json({ success: true, totalFiles: knowledge.files.size, totalChunks: knowledge.chunks.length });
    } catch (err) {
        res.status(500).json({ error: 'טעינה מחדש נכשלה' });
    }
});

// === ASK ===
app.post('/api/ask', apiRateLimiter, async (req, res, next) => {
    const requestStart = Date.now();
    metrics.totalRequests += 1;

    try {
        const rawQuery = req.body?.prompt;
        const rawHistory = req.body?.history;

        if (!rawQuery || typeof rawQuery !== 'string' || rawQuery.trim() === '') {
            metrics.totalErrors += 1;
            recordError('Empty prompt');
            return res.status(400).json({ reply: 'אדון, לא התקבלה שאלה תקינה לעיבוד.' });
        }

        const userQuery = rawQuery.trim();
        if (userQuery.length > CONFIG.maxPromptLength) {
            metrics.totalErrors += 1;
            recordError('Prompt too long');
            return res.status(413).json({ reply: `אדון, השאלה ארוכה מדי (מקסימום ${CONFIG.maxPromptLength} תווים).` });
        }

        // === היסטוריה ===
        const history = sanitizeHistory(rawHistory);
        metrics.totalHistoryMessagesSent += history.length;

        // === חיפוש ידע ===
        metrics.totalKnowledgeLookups += 1;
        const matchedChunks = searchKnowledge(userQuery);
        const knowledgeContext = buildKnowledgeContext(matchedChunks);

        if (matchedChunks.length > 0) {
            metrics.totalKnowledgeHits += 1;
            log('info', `Knowledge hit — ${matchedChunks.length} chunks`);
        }

        const { reply, coreLatencyMs, attempts } = await callGeminiWithRetry(userQuery, knowledgeContext, history);
        const totalRoundTripMs = Date.now() - requestStart;

        metrics.totalSuccess += 1;
        recordLatency(coreLatencyMs);

        return res.json({
            reply,
            latencyMs: coreLatencyMs,
            roundTripMs: totalRoundTripMs,
            attempts,
            historyUsed: history.length,
            knowledgeUsed: matchedChunks.length > 0,
            knowledgeChunks: matchedChunks.length,
            knowledgeSources: [...new Set(matchedChunks.map(c => c.source))],
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        next(error);
    }
});

// === VISION === // === Analytics AI Analysis ===
app.post('/api/analyze', apiRateLimiter, async (req, res, next) => {
    const requestStart = Date.now();
    metrics.totalRequests += 1;

    try {
        const videos = req.body?.videos;
        if (!Array.isArray(videos) || videos.length === 0) {
            return res.status(400).json({ reply: 'אין נתונים לניתוח' });
        }

        // === סיכום כללי ===
        const totals = videos.reduce((acc, v) => {
            acc.views += Number(v.views) || 0;
            acc.likes += Number(v.likes) || 0;
            acc.comments += Number(v.comments) || 0;
            acc.shares += Number(v.shares) || 0;
            acc.count += 1;
            if (v.platform) {
                acc.platforms[v.platform] = acc.platforms[v.platform] || { views: 0, likes: 0, comments: 0, count: 0 };
                acc.platforms[v.platform].views += Number(v.views) || 0;
                acc.platforms[v.platform].likes += Number(v.likes) || 0;
                acc.platforms[v.platform].comments += Number(v.comments) || 0;
                acc.platforms[v.platform].count += 1;
            }
            return acc;
        }, { views: 0, likes: 0, comments: 0, shares: 0, count: 0, platforms: {} });

        const ratio = totals.views ? ((totals.likes / totals.views) * 100).toFixed(2) : 0;
        const commentRatio = totals.views ? ((totals.comments / totals.views) * 100).toFixed(2) : 0;

        // === Top/Bottom ===
        const sorted = [...videos].sort((a, b) => (b.views || 0) - (a.views || 0));
        const top5 = sorted.slice(0, 5);
        const bottom5 = sorted.slice(-5).reverse();

        const byRatio = [...videos]
            .filter((v) => (v.views || 0) > 100)
            .sort((a, b) => ((b.likes || 0) / b.views) - ((a.likes || 0) / a.views))
            .slice(0, 3);

        // === בניית הפרומפט ===
        const platformSummary = Object.entries(totals.platforms).map(([name, data]) => {
            const pRatio = data.views ? ((data.likes / data.views) * 100).toFixed(2) : 0;
            return `- ${name}: ${data.count} סרטונים, ${data.views.toLocaleString()} צפיות, ${data.likes} לייקים, ${data.comments} תגובות, יחס לייק/צפייה ${pRatio}%`;
        }).join('\n');

        const topSummary = top5.map((v, i) =>
            `${i + 1}. [${v.platform}] "${v.title}" — ${v.views} צפיות, ${v.likes} לייקים, ${v.comments} תגובות, אורך ${v.duration}s`
        ).join('\n');

        const bottomSummary = bottom5.map((v, i) =>
            `${i + 1}. [${v.platform}] "${v.title}" — ${v.views} צפיות, ${v.likes} לייקים, אורך ${v.duration}s`
        ).join('\n');

        const ratioSummary = byRatio.map((v, i) =>
            `${i + 1}. [${v.platform}] "${v.title}" — ${((v.likes / v.views) * 100).toFixed(2)}% יחס`
        ).join('\n');

        const prompt = `אתה אנליסט תוכן בכיר. קיבלת נתוני ביצועים של ${totals.count} סרטונים מ-${Object.keys(totals.platforms).length} פלטפורמות שונות.

## סיכום כללי
- סה"כ צפיות: ${totals.views.toLocaleString()}
- סה"כ לייקים: ${totals.likes.toLocaleString()}
- סה"כ תגובות: ${totals.comments.toLocaleString()}
- יחס לייק/צפייה: ${ratio}%
- יחס תגובה/צפייה: ${commentRatio}%

## פילוח לפי פלטפורמה
${platformSummary}

## 5 הסרטונים המצליחים ביותר (לפי צפיות)
${topSummary}

## 5 הסרטונים החלשים ביותר (לפי צפיות)
${bottomSummary}

## הסרטונים עם יחס הלייקים הגבוה ביותר
${ratioSummary}

---

## המשימה שלך
תן לי ניתוח אנליטי חד, ישיר וביקורתי בעברית. **אסור לך לחמיא. אסור להגיד "כל הכבוד".**

החזר את הניתוח במבנה הזה בדיוק:

### 🎯 מה עובד
(2-3 תובנות מבוססות מספרים — מה עבד ולמה)

### 🔴 מה לא עובד
(2-3 בעיות אמיתיות — ביקורת ישירה עם מספרים)

### 📊 השוואת פלטפורמות
(איזו פלטפורמה הכי טובה לך, איזו פחות, ולמה — עם מספרים)

### 🚀 3 המלצות קונקרטיות לסרטונים הבאים
(3 פעולות ספציפיות שאני יכול ליישם מיד)

### ⚠️ אזהרה אחת
(משהו שאני עושה לא נכון ואני לא שם לב אליו)

סגנון: ישיר, ביקורתי, מבוסס מספרים. בלי הקדמות מיותרות.`;

        // === שליחה ל-Gemini ===
        const { reply, coreLatencyMs, attempts } = await callGeminiWithRetry(prompt, '', []);
        const totalRoundTripMs = Date.now() - requestStart;

        metrics.totalSuccess += 1;
        recordLatency(coreLatencyMs);

        log('info', `Analyze OK`, { videos: videos.length, coreLatencyMs, totalRoundTripMs });

        return res.json({
            reply,
            latencyMs: coreLatencyMs,
            roundTripMs: totalRoundTripMs,
            attempts,
            videoCount: videos.length,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        next(error);
    }
});

app.post('/api/vision', visionRateLimiter, async (req, res, next) => {
    const requestStart = Date.now();
    metrics.totalRequests += 1;
    metrics.totalVisionRequests += 1;

    try {
        const { image, mimeType, prompt } = req.body || {};
        if (!image || typeof image !== 'string') return res.status(400).json({ reply: 'אדון, לא התקבלה תמונה.' });

        const safeMime = (typeof mimeType === 'string' && /^image\/(jpeg|png|webp)$/i.test(mimeType)) ? mimeType : 'image/jpeg';
        const estimatedBytes = Math.floor((image.length * 3) / 4);
        if (estimatedBytes > CONFIG.maxImageSizeBytes) return res.status(413).json({ reply: 'אדון, התמונה גדולה מדי.' });

        const userPrompt = typeof prompt === 'string' ? prompt : '';
        const { reply, coreLatencyMs, attempts } = await callGeminiVision(image, safeMime, userPrompt);
        const totalRoundTripMs = Date.now() - requestStart;

        metrics.totalSuccess += 1;
        recordLatency(coreLatencyMs);

        return res.json({ reply, latencyMs: coreLatencyMs, roundTripMs: totalRoundTripMs, attempts, timestamp: new Date().toISOString() });
    } catch (error) {
        next(error);
    }
});

app.use((req, res) => {
    res.status(404).json({ reply: 'אדון, הנתיב המבוקש אינו קיים.' });
});

app.use((err, req, res, next) => {
    if (err instanceof GeminiError) {
        log('error', `Gemini ${err.statusCode}: ${err.message}`);
        recordError(err.message);
        if (err.isRateLimit) {
            return res.status(429).json({
                reply: 'אדון, מערכות הליבה שלי הגיעו למכסת השימוש החינמית לרגע זה. אנא המתן כחצי דקה ונסה שוב.',
                rateLimited: true,
            });
        }
        const status = err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
        return res.status(status).json({ reply: `אדון, ${err.message}` });
    }
    log('error', 'Unhandled error', err);
    recordError(err.message || 'Unknown error');
    return res.status(500).json({ reply: 'אדון, אירעה תקלה בלתי צפויה במערכת.' });
});

// ==============================
// 10. הפעלה
// ==============================

loadKnowledgeBase();

const server = app.listen(CONFIG.port, () => {
    log('info', `⚡ J.A.R.V.I.S Server is running securely on: http://localhost:${CONFIG.port}`);
    log('info', `🤖 Active Gemini Model: ${CONFIG.geminiModel}`);
    log('info', `🧠 Knowledge base: ${knowledge.files.size} files, ${knowledge.chunks.length} chunks (BM25)`);
    log('info', `💬 Conversation memory: up to ${CONFIG.maxHistoryMessages} messages per request`);
});

function shutdown(signal) {
    console.log(`\n${signal} התקבל, סוגר את השרת בצורה מסודרת...`);
    server.close(() => {
        console.log('השרת נסגר בהצלחה.');
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => log('error', 'Unhandled Rejection', reason));
process.on('uncaughtException', (err) => log('error', 'Uncaught Exception', err));