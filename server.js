/**
 * ⚡ J.A.R.V.I.S Server — Neural Kernel V3.4
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const REQUIRED_ENV_VARS = ['GEMINI_API_KEY'];
const missingEnvVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

if (missingEnvVars.length > 0) {
    console.error(`❌ חסרים משתני סביבה קריטיים: ${missingEnvVars.join(', ')}`);
    process.exit(1);
}

const CONFIG = {
    port: process.env.PORT || 3000,
    geminiApiKey: process.env.GEMINI_API_KEY.trim(),
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    geminiTimeoutMs: Number(process.env.GEMINI_TIMEOUT_MS) || 20000,
    geminiVisionTimeoutMs: Number(process.env.GEMINI_VISION_TIMEOUT_MS) || 30000,
    youtubeApiKey: process.env.YOUTUBE_API_KEY || '',
    youtubeTimeoutMs: Number(process.env.YOUTUBE_TIMEOUT_MS) || 10000,
        tiktokTimeoutMs: Number(process.env.TIKTOK_TIMEOUT_MS) || 10000,
    maxPromptLength: Number(process.env.MAX_PROMPT_LENGTH) || 2000,
    maxImageSizeBytes: Number(process.env.MAX_IMAGE_SIZE_BYTES) || 4 * 1024 * 1024,
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000,
    rateLimitMax: Number(process.env.RATE_LIMIT_MAX) || 30,
    visionRateLimitMax: Number(process.env.VISION_RATE_LIMIT_MAX) || 15,
    metricsPollIntervalMs: Number(process.env.METRICS_POLL_INTERVAL_MS) || 3000,
    retryOn429DelayMs: Number(process.env.RETRY_ON_429_DELAY_MS) || 55000,
    knowledgeDir: path.join(__dirname, 'knowledge'),
    knowledgeMaxFileSizeBytes: 1024 * 1024,
    knowledgeMaxFiles: 100,
    knowledgeChunkSize: 1200,
    knowledgeTopChunks: 5,
    knowledgeMinScore: 0.4,
    maxHistoryMessages: Number(process.env.MAX_HISTORY_MESSAGES) || 12,
    maxHistoryCharsPerMessage: 2000,
    maxTotalHistoryChars: 8000,
};

const SYSTEM_PROMPT = `אתה ג'רוויס (J.A.R.V.I.S) — עוזר AI אישי, חד, ישיר ואנליטי.

## כללי התנהגות מוחלטים:

### 1. אפס "יאס-מן"
- אל תסכים אוטומטית. אל תלטף אגו. אל תחמיא סתם.
- אם יש רעיון גרוע, לא ריאלי או לא הגיוני — אמור זאת ישירות, עם נימוקים.

### 2. בחר צד חד-משמעית
- כשנשאלת שאלה עם דילמה — אסור להתחמק עם "יש לכאן ולכאן".
- תגיד בבירור מה אתה היית בוחר, עם נימוקים מוצקים.

### 3. התבסס רק על עובדות
- אל תמציא נתונים, תאריכים, שמות או מספרים.
- אם אין לך מידע — תגיד "אין לי מידע על זה".

### 4. תשובות פרקטיות וקצרות
- בלי הקדמות מיותרות.
- ישר לעניין.

### 5. התאמה אישית
- התבסס על ההעדפות והמידע האישי השמור בידע.

### 6. סגנון ג'רוויס
- פנה למשתמש כ"אדוני".
- טון רגוע, מדויק, ביטחוני.

## שפה: עברית בלבד. תמיד.`;

const VISION_SYSTEM_PROMPT = `אתה ג'רוויס (J.A.R.V.I.S), מערכת בינה מלאכותית עם חיישנים אופטיים. תאר בקצרה, בצורה עניינית, בגוף ראשון, בעברית בלבד, מה אתה רואה. היה ספציפי לגבי אנשים, חפצים, צבעים, ותנועות. אל תמציא דברים שלא רואים בתמונה.`;

const KNOWLEDGE_SYSTEM_PROMPT = `אתה ג'רוויס (J.A.R.V.I.S) — עוזר אישי עם גישה למאגר ידע אישי של המשתמש.

## כללים לשימוש בידע:
1. השתמש במידע מהידע רק אם הוא רלוונטי לשאלה.
2. אם הידע סותר את מה שאתה יודע — תן עדיפות לידע.
3. אם אין בידע מידע רלוונטי — ענה כרגיל.
4. אל תמציא מידע שלא כתוב במפורש בידע.
5. אל תחשוף את המקורות.

## שפה: עברית בלבד.`;

const metrics = {
    startedAt: Date.now(),
    totalRequests: 0,
    totalErrors: 0,
    totalSuccess: 0,
    totalVisionRequests: 0,
    totalYoutubeRequests: 0,
    totalTiktokRequests: 0,
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

function log(level, message, meta = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    if (meta) console.log(`${prefix} ${message}`, meta);
    else console.log(`${prefix} ${message}`);
}

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
// 🆕 YouTube Helper
// ==============================

function parseISODuration(iso) {
    if (!iso || typeof iso !== 'string') return 0;
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const [, h, m, s] = match;
    return (parseInt(h, 10) || 0) * 3600 + (parseInt(m, 10) || 0) * 60 + (parseInt(s, 10) || 0);
}

function extractYouTubeId(input) {
    if (!input || typeof input !== 'string') return null;
    const trimmed = input.trim();

    // אם זה כבר ID (11 תווים)
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

    // נסה לחלץ מ-URL
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /[?&]v=([a-zA-Z0-9_-]{11})/,
    ];

    for (const p of patterns) {
        const match = trimmed.match(p);
        if (match && match[1]) return match[1];
    }

    return null;
}

// ==============================
// Knowledge Base
// ==============================

const knowledge = {
    chunks: [],
    files: new Map(),
    loadedAt: null,
    totalChars: 0,
    avgDocLength: 0,
    docFreq: new Map(),
};

const STOP_WORDS_HE = new Set(['של', 'את', 'על', 'עם', 'כל', 'זה', 'זו', 'הוא', 'היא', 'הם', 'הן', 'אני', 'אתה', 'אנחנו', 'אתם', 'אתן', 'לי', 'לך', 'לו', 'לה', 'לנו', 'יש', 'אין', 'היה', 'היתה', 'יהיה', 'להיות', 'גם', 'רק', 'או', 'אבל', 'אם', 'כי', 'מה', 'מי', 'איך', 'למה', 'מתי', 'איפה', 'איזה', 'כמה', 'כן', 'לא', 'אפשר', 'צריך', 'רוצה', 'יכול', 'הולך', 'עושה', 'הופך']);
const STOP_WORDS_EN = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'as', 'and', 'or', 'but', 'if', 'then', 'than', 'so', 'that', 'this', 'it', 'its', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'our', 'their', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'can', 'could', 'should', 'would', 'may', 'might', 'will', 'do', 'does', 'did', 'have', 'has', 'had']);

function tokenize(text) {
    if (!text) return [];
    return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length >= 2).filter((w) => !STOP_WORDS_HE.has(w) && !STOP_WORDS_EN.has(w));
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

function getEnvKnowledgeFiles() {
    const envMap = {
        'personal.txt': process.env.KNOWLEDGE_PERSONAL,
        'fitness.txt': process.env.KNOWLEDGE_FITNESS,
        'interests.txt': process.env.KNOWLEDGE_INTERESTS,
        'business.txt': process.env.KNOWLEDGE_BUSINESS,
        'preferences.txt': process.env.KNOWLEDGE_PREFERENCES,
        'content.txt': process.env.KNOWLEDGE_CONTENT,
    };
    const result = [];
    for (const [filename, content] of Object.entries(envMap)) {
        if (content && typeof content === 'string' && content.trim().length > 0) {
            result.push({ filename, content: content.trim() });
        }
    }
    return result;
}

function loadFromEnvironment() {
    const envFiles = getEnvKnowledgeFiles();
    if (envFiles.length === 0) return false;

    let totalDocLength = 0;

    for (const { filename, content } of envFiles) {
        try {
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
                size: content.length,
                chunks: chunkCount,
                chars: content.length,
                modifiedAt: Date.now(),
                fromEnv: true,
            });

            knowledge.totalChars += content.length;
        } catch (err) {
            log('warn', `Failed to load from ENV: ${filename}`, err.message);
        }
    }

    if (knowledge.chunks.length > 0) {
        knowledge.avgDocLength = totalDocLength / knowledge.chunks.length;
    }

    log('info', `Knowledge base loaded from ENV`, {
        files: knowledge.files.size,
        chunks: knowledge.chunks.length,
    });

    return true;
}

function loadKnowledgeBase() {
    knowledge.chunks = [];
    knowledge.files = new Map();
    knowledge.totalChars = 0;
    knowledge.docFreq = new Map();
    knowledge.avgDocLength = 0;

    const loadedFromEnv = loadFromEnvironment();
    if (loadedFromEnv) {
        knowledge.loadedAt = Date.now();
        log('info', `Knowledge base loaded (from ENV)`, {
            files: knowledge.files.size,
            chunks: knowledge.chunks.length,
            vocab: knowledge.docFreq.size,
            avgDocLength: Math.round(knowledge.avgDocLength),
        });
        return;
    }

    try {
        if (!fs.existsSync(CONFIG.knowledgeDir)) fs.mkdirSync(CONFIG.knowledgeDir, { recursive: true });
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
                if (stat.size > CONFIG.knowledgeMaxFileSizeBytes) continue;
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
                    knowledge.chunks.push({ source: filename, text: chunk, tokens, length: tokens.length, tokenFreq, uniqueTokens });
                    for (const t of uniqueTokens) knowledge.docFreq.set(t, (knowledge.docFreq.get(t) || 0) + 1);
                    totalDocLength += tokens.length;
                    chunkCount++;
                }
                knowledge.files.set(filename, { name: filename, size: stat.size, chunks: chunkCount, chars: content.length, modifiedAt: stat.mtimeMs });
                knowledge.totalChars += content.length;
            } catch (err) {
                log('warn', `Failed to load knowledge file: ${filename}`, err.message);
            }
        }
        if (knowledge.chunks.length > 0) knowledge.avgDocLength = totalDocLength / knowledge.chunks.length;
        knowledge.loadedAt = Date.now();
        log('info', `Knowledge base loaded (BM25)`, { files: knowledge.files.size, chunks: knowledge.chunks.length, vocab: knowledge.docFreq.size, avgDocLength: Math.round(knowledge.avgDocLength) });
    } catch (err) {
        log('error', 'Failed to load knowledge base', err.message);
    }
}

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
        if (score >= CONFIG.knowledgeMinScore) scored.push({ chunk, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, CONFIG.knowledgeTopChunks).map((s) => s.chunk);
}

function buildKnowledgeContext(chunks) {
    if (!chunks || !chunks.length) return '';
    const parts = chunks.map((c, i) => `[מקור ${i + 1}: ${c.source}]\n${c.text}`);
    return `=== מאגר ידע רלוונטי ===\n${parts.join('\n\n---\n\n')}\n=== סוף מאגר ידע ===`;
}

function sanitizeHistory(history) {
    if (!Array.isArray(history)) return [];
    const cleaned = [];
    let totalChars = 0;
    for (let i = history.length - 1; i >= 0; i--) {
        const m = history[i];
        if (!m || typeof m !== 'object') continue;
        const role = m.role === 'user' ? 'user' : (m.role === 'jarvis' ? 'model' : null);
        if (!role) continue;
        let text = typeof m.text === 'string' ? m.text.trim() : '';
        if (!text) continue;
        if (text.length > CONFIG.maxHistoryCharsPerMessage) text = text.substring(0, CONFIG.maxHistoryCharsPerMessage) + '...';
        if (totalChars + text.length > CONFIG.maxTotalHistoryChars) break;
        cleaned.unshift({ role, text });
        totalChars += text.length;
        if (cleaned.length >= CONFIG.maxHistoryMessages) break;
    }
    return cleaned;
}

function buildConversationContents(history, newUserQuery) {
    const contents = [];
    for (const m of history) contents.push({ role: m.role, parts: [{ text: m.text }] });
    contents.push({ role: 'user', parts: [{ text: newUserQuery }] });
    return contents;
}

async function callGeminiWithRetry(userQuery, knowledgeContext = '', history = [], retries = 2) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent?key=${CONFIG.geminiApiKey}`;
    let systemText;
    if (knowledgeContext) systemText = `${KNOWLEDGE_SYSTEM_PROMPT}\n\n${knowledgeContext}`;
    else systemText = SYSTEM_PROMPT;
    const contents = buildConversationContents(history, userQuery);
    const body = JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    });
    let lastError;
    const coreStart = Date.now();
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, CONFIG.geminiTimeoutMs);
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
                    throw new GeminiError(data.error.message || 'שגיאה לא ידועה ממערכת הליבה', response.status >= 400 ? response.status : 502, data.error, rateLimited);
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

async function callGeminiVision(imageBase64, mimeType, userPrompt, retries = 1) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent?key=${CONFIG.geminiApiKey}`;
    const promptText = userPrompt && userPrompt.trim() ? `${VISION_SYSTEM_PROMPT}\n\nהמשתמש שואל: ${userPrompt.trim()}` : `${VISION_SYSTEM_PROMPT}\n\nתאר מה אתה רואה בתמונה.`;
    const body = JSON.stringify({
        contents: [{ parts: [{ text: promptText }, { inline_data: { mime_type: mimeType, data: imageBase64 } }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 512 },
    });
    let lastError;
    const coreStart = Date.now();
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetchWithTimeout(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, CONFIG.geminiVisionTimeoutMs);
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
                    throw new GeminiError(data.error.message || 'שגיאה בניתוח התמונה', response.status >= 400 ? response.status : 502, data.error, rateLimited);
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

function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function computeAnalyticsSummary(videos) {
    if (!Array.isArray(videos) || videos.length === 0) {
        return { totalVideos: 0, totalViews: 0, totalLikes: 0, totalComments: 0, totalShares: 0, totalSubscribers: 0, totalWatchTimeHours: 0, avgViewPercent: 0, stayToWatch: 0 };
    }
    const sum = (key) => videos.reduce((s, v) => s + (Number(v[key]) || 0), 0);
    return {
        totalVideos: videos.length,
        totalViews: sum('views'),
        totalLikes: sum('likes'),
        totalComments: sum('comments'),
        totalShares: sum('shares'),
        totalSubscribers: sum('subscribers'),
        totalWatchTimeHours: +(sum('watchTimeHours')).toFixed(2),
        avgViewPercent: +(sum('avgViewPercent') / videos.length).toFixed(2),
        stayToWatch: +(videos.reduce((s, v) => s + (Number(v?.retention?.completionRate) || 0), 0) / videos.length).toFixed(2),
    };
}

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
        if (req.path.startsWith('/api/')) log('info', `${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`);
    });
    next();
});

const apiRateLimiter = rateLimit({ windowMs: CONFIG.rateLimitWindowMs, max: CONFIG.rateLimitMax, standardHeaders: true, legacyHeaders: false, message: { reply: 'אדון, יותר מדי בקשות בזמן קצר.' } });
const visionRateLimiter = rateLimit({ windowMs: 60 * 1000, max: CONFIG.visionRateLimitMax, standardHeaders: true, legacyHeaders: false, message: { reply: 'אדון, יותר מדי בקשות ניתוח תמונה.' } });

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/api/health', (req, res) => {
    try {
        const uptimeSeconds = Math.floor((Date.now() - metrics.startedAt) / 1000);
        res.json({ status: 'ok', uptime: uptimeSeconds, model: CONFIG.geminiModel, latencyMs: metrics.lastLatencyMs, avgLatencyMs: metrics.avgLatencyMs, totalRequests: metrics.totalRequests, totalSuccess: metrics.totalSuccess, totalErrors: metrics.totalErrors, totalYoutubeRequests: metrics.totalYoutubeRequests, knowledgeFiles: knowledge.files.size, knowledgeChunks: knowledge.chunks.length, timestamp: new Date().toISOString() });
    } catch (err) { res.status(500).json({ status: 'error' }); }
});

app.get('/api/metrics', (req, res) => {
    try {
        const uptimeSeconds = Math.floor((Date.now() - metrics.startedAt) / 1000);
        res.json({ uptime: uptimeSeconds, model: CONFIG.geminiModel, latencyMs: metrics.lastLatencyMs, avgLatencyMs: metrics.avgLatencyMs, totalRequests: metrics.totalRequests, totalErrors: metrics.totalErrors, totalYoutubeRequests: metrics.totalYoutubeRequests, knowledgeFiles: knowledge.files.size, knowledgeChunks: knowledge.chunks.length, timestamp: new Date().toISOString() });
    } catch (err) { res.status(500).json({ error: 'Metrics unavailable' }); }
});

app.get('/api/knowledge', (req, res) => {
    try {
        const files = Array.from(knowledge.files.values()).map((f) => ({ name: f.name, size: f.size, chunks: f.chunks, chars: f.chars, modifiedAt: f.modifiedAt, fromEnv: !!f.fromEnv })).sort((a, b) => b.modifiedAt - a.modifiedAt);
        res.json({ files, totalFiles: files.length, totalChunks: knowledge.chunks.length, totalChars: knowledge.totalChars, loadedAt: knowledge.loadedAt });
    } catch (err) { res.status(500).json({ error: 'Failed to list knowledge' }); }
});

app.post('/api/knowledge/upload', (req, res) => {
    try {
        const { name, content } = req.body || {};
        if (!name || typeof name !== 'string') return res.status(400).json({ error: 'חסר שם קובץ' });
        if (!content || typeof content !== 'string') return res.status(400).json({ error: 'חסר תוכן לקובץ' });
        const safeName = path.basename(name).replace(/[^\p{L}\p{N}\-_. ]/gu, '_');
        if (!/\.(txt|md)$/i.test(safeName)) return res.status(400).json({ error: 'רק קבצי .txt או .md נתמכים' });
        const fullPath = path.join(CONFIG.knowledgeDir, safeName);
        fs.writeFileSync(fullPath, content, 'utf8');
        loadKnowledgeBase();
        res.json({ success: true, name: safeName, totalFiles: knowledge.files.size, totalChunks: knowledge.chunks.length });
    } catch (err) { res.status(500).json({ error: 'העלאה נכשלה: ' + err.message }); }
});

app.delete('/api/knowledge/:name', (req, res) => {
    try {
        const safeName = path.basename(req.params.name || '');
        if (!safeName || !/\.(txt|md)$/i.test(safeName)) return res.status(400).json({ error: 'שם קובץ לא תקין' });
        const fullPath = path.join(CONFIG.knowledgeDir, safeName);
        if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'הקובץ לא נמצא' });
        fs.unlinkSync(fullPath);
        loadKnowledgeBase();
        res.json({ success: true, name: safeName, totalFiles: knowledge.files.size, totalChunks: knowledge.chunks.length });
    } catch (err) { res.status(500).json({ error: 'מחיקה נכשלה: ' + err.message }); }
});

app.post('/api/knowledge/reload', (req, res) => {
    try { loadKnowledgeBase(); res.json({ success: true, totalFiles: knowledge.files.size, totalChunks: knowledge.chunks.length }); }
    catch (err) { res.status(500).json({ error: 'טעינה מחדש נכשלה' }); }
});app.post('/api/ask', apiRateLimiter, async (req, res, next) => {
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
        const history = sanitizeHistory(rawHistory);
        metrics.totalHistoryMessagesSent += history.length;
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
        return res.json({ reply, latencyMs: coreLatencyMs, roundTripMs: totalRoundTripMs, attempts, historyUsed: history.length, knowledgeUsed: matchedChunks.length > 0, knowledgeChunks: matchedChunks.length, timestamp: new Date().toISOString() });
    } catch (error) { next(error); }
});

app.post('/api/analyze', apiRateLimiter, async (req, res, next) => {
    const requestStart = Date.now();
    metrics.totalRequests += 1;
    try {
        const videos = req.body?.videos;
        if (!Array.isArray(videos) || videos.length === 0) {
            return res.status(400).json({ reply: 'אין נתונים לניתוח' });
        }

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

        const sorted = [...videos].sort((a, b) => (b.views || 0) - (a.views || 0));
        const top5 = sorted.slice(0, 5);
        const bottom5 = sorted.slice(-5).reverse();
        const medianViews = sorted[Math.floor(sorted.length / 2)]?.views || 0;

        const engagementChamps = [...videos].filter(v => (v.views || 0) >= 100).sort((a, b) => ((b.likes || 0) / (b.views || 1)) - ((a.likes || 0) / (a.views || 1))).slice(0, 3);
        const commentChamps = [...videos].filter(v => (v.comments || 0) > 0).sort((a, b) => (b.comments || 0) - (a.comments || 0)).slice(0, 3);

        const platformStats = {};
        for (const v of videos) {
            const p = v.platform || 'youtube';
            if (!platformStats[p]) platformStats[p] = { count: 0, views: 0, likes: 0, comments: 0 };
            platformStats[p].count++;
            platformStats[p].views += Number(v.views) || 0;
            platformStats[p].likes += Number(v.likes) || 0;
            platformStats[p].comments += Number(v.comments) || 0;
        }

        const durationBuckets = { short: [], medium: [], long: [] };
        for (const v of videos) {
            const d = Number(v.duration) || 0;
            if (d <= 10) durationBuckets.short.push(v);
            else if (d <= 20) durationBuckets.medium.push(v);
            else durationBuckets.long.push(v);
        }

        const detailedTable = sorted.map((v, i) => {
            const vr = v.views ? ((v.likes || 0) / v.views * 100).toFixed(2) : '0';
            const cr = v.views ? ((v.comments || 0) / v.views * 100).toFixed(3) : '0';
            return `${i + 1}. [${v.platform || 'youtube'}] "${v.title}" | ${v.date || '—'} | ${v.duration || 0}s | ${(v.views || 0).toLocaleString()} צפיות | ${v.likes || 0} לייקים (${vr}%) | ${v.comments || 0} תגובות (${cr}%)`;
        }).join('\n');

        const platformBlock = Object.entries(platformStats).map(([name, s]) => {
            const avgViews = Math.round(s.views / s.count);
            const pr = s.views ? (s.likes / s.views * 100).toFixed(2) : 0;
            const cr = s.views ? (s.comments / s.views * 100).toFixed(3) : 0;
            return `**${name}**: ${s.count} סרטונים | ${s.views.toLocaleString()} צפיות | ממוצע ${avgViews} צפיות/סרטון | יחס לייקים ${pr}% | יחס תגובות ${cr}%`;
        }).join('\n');

        const durationBlock = `- **קצרים (עד 10s)**: ${durationBuckets.short.length} סרטונים, ממוצע ${durationBuckets.short.length ? Math.round(durationBuckets.short.reduce((s, v) => s + (Number(v.views) || 0), 0) / durationBuckets.short.length) : 0} צפיות/סרטון
- **בינוניים (11-20s)**: ${durationBuckets.medium.length} סרטונים, ממוצע ${durationBuckets.medium.length ? Math.round(durationBuckets.medium.reduce((s, v) => s + (Number(v.views) || 0), 0) / durationBuckets.medium.length) : 0} צפיות/סרטון
- **ארוכים (21s+)**: ${durationBuckets.long.length} סרטונים, ממוצע ${durationBuckets.long.length ? Math.round(durationBuckets.long.reduce((s, v) => s + (Number(v.views) || 0), 0) / durationBuckets.long.length) : 0} צפיות/סרטון`;

        const topBlock = top5.map((v, i) => {
            const vr = v.views ? ((v.likes || 0) / v.views * 100).toFixed(2) : '0';
            return `${i + 1}. [${v.platform || 'youtube'}] "${v.title}" — ${(v.views || 0).toLocaleString()} צפיות | ${v.likes || 0} לייקים (${vr}%) | ${v.comments || 0} תגובות | ${v.duration || 0}s`;
        }).join('\n');

        const bottomBlock = bottom5.map((v, i) => {
            const vr = v.views ? ((v.likes || 0) / v.views * 100).toFixed(2) : '0';
            return `${i + 1}. [${v.platform || 'youtube'}] "${v.title}" — ${(v.views || 0).toLocaleString()} צפיות | ${v.likes || 0} לייקים (${vr}%) | ${v.duration || 0}s`;
        }).join('\n');

        const engagementBlock = engagementChamps.map((v, i) => {
            const vr = ((v.likes || 0) / (v.views || 1) * 100).toFixed(2);
            return `${i + 1}. [${v.platform || 'youtube'}] "${v.title}" — ${vr}% יחס לייקים (${v.likes}/${v.views})`;
        }).join('\n');

        const commentBlock = commentChamps.length
            ? commentChamps.map((v, i) => `${i + 1}. "${v.title}" — ${v.comments} תגובות (${((v.comments / v.views) * 100).toFixed(3)}% מ-${v.views} צפיות)`).join('\n')
            : 'אין סרטונים עם תגובות.';

        const prompt = `אתה אנליסט תוכן אגרסיבי ומדויק. אתה מנתח נתוני ביצועים של יוצר תוכן קליסטניקס.
המטרה שלך: **לתת לו תובנות שיעזרו לו לייצר תוכן ויראלי יותר — לא ללטף אגו.**

## 📊 הנתונים המלאים

### טבלת כל הסרטונים (ממוין לפי צפיות)
${detailedTable}

### סיכום כללי
- סה"כ סרטונים: ${totals.count}
- סה"כ צפיות: ${totals.views.toLocaleString()}
- סה"כ לייקים: ${totals.likes.toLocaleString()} (יחס: ${ratio}%)
- סה"כ תגובות: ${totals.comments} (יחס: ${commentRatio}%)
- **חציון צפיות**: ${medianViews.toLocaleString()}

### פילוח לפי פלטפורמה
${platformBlock}

### פילוח לפי אורך סרטון
${durationBlock}

### 5 הסרטונים המצליחים ביותר (Top 5)
${topBlock}

### 5 הסרטונים החלשים ביותר (Bottom 5)
${bottomBlock}

### הסרטונים עם יחס המעורבות הגבוה ביותר
${engagementBlock}

### הסרטונים עם הכי הרבה תגובות
${commentBlock}

---

## 🎯 המשימה שלך

תן ניתוח **אמיתי, חד, וביקורתי**. 

**אסור לך:**
- ❌ לחמיא ("כל הכבוד!", "מעולה!")
- ❌ לחזור על הנתונים בלי לפרש
- ❌ לתת עצות גנריות
- ❌ לחזור על מה שהמשתמש כבר יודע

## 📐 הפורמט המדויק

### 🎯 מה עובד **באמת** (ולמה)
3 תובנות ספציפיות ומבוססות מספרים.

### 🔴 הבעיות האמיתיות
3 בעיות קונקרטיות. תגיד את האמת.

### 🎬 ניתוח ה-hook (2 השניות הראשונות)
נתח את הסרטון הטוב ביותר מול הגרוע ביותר.

### 📊 הפלטפורמות — אמת קשה
איזו פלטפורמה בזבז זמן? עם מספרים ספציפיים.

### 🔬 ניתוח כותרות
מה עבד ומה לא? מה ההבדל בין Top 3 ל-Bottom 3?

### 🚀 5 כותרות מדויקות לסרטון הבא
5 כותרות ספציפיות שאפשר להשתמש בהן מחר בבוקר.

### ⚠️ האמת שאתה לא רוצה לשמוע
משהו אחד שאתה עושה לא נכון ואתה לא שם לב. בלי לרכך.

### 🎯 תוכנית פעולה לשבוע הבא
3 פעולות קונקרטיות לעשות בשבוע הקרוב.

סגנון: ישיר, ביקורתי, מבוסס מספרים. עברית. בלי הקדמות.`;

        const { reply, coreLatencyMs, attempts } = await callGeminiWithRetry(prompt, '', [], 3);
        const totalRoundTripMs = Date.now() - requestStart;

        metrics.totalSuccess += 1;
        recordLatency(coreLatencyMs);
        log('info', `Analyze OK`, { videos: videos.length, coreLatencyMs, totalRoundTripMs, attempts });

        return res.json({ reply, latencyMs: coreLatencyMs, roundTripMs: totalRoundTripMs, attempts, videoCount: videos.length, timestamp: new Date().toISOString() });
    } catch (error) { next(error); }
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
    } catch (error) { next(error); }
});

// ============================================================
// 🆕 YouTube API — Fetch video data
// ============================================================
app.post('/api/youtube/fetch', apiRateLimiter, async (req, res, next) => {
    const requestStart = Date.now();
    metrics.totalRequests += 1;
    metrics.totalYoutubeRequests += 1;

    try {
        const { url, videoId: rawVideoId } = req.body || {};
        const input = rawVideoId || url;

        if (!input || typeof input !== 'string') {
            metrics.totalErrors += 1;
            recordError('Missing YouTube URL/ID');
            return res.status(400).json({ error: 'חסר קישור או מזהה של סרטון' });
        }

        const videoId = extractYouTubeId(input);
        if (!videoId) {
            metrics.totalErrors += 1;
            recordError('Invalid YouTube URL/ID');
            return res.status(400).json({ error: 'קישור לא תקין — לא הצלחתי לחלץ מזהה סרטון' });
        }

        if (!CONFIG.youtubeApiKey) {
            return res.status(500).json({ error: 'YOUTUBE_API_KEY לא מוגדר בשרת' });
        }

        const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${CONFIG.youtubeApiKey}`;
        const response = await fetchWithTimeout(apiUrl, { method: 'GET' }, CONFIG.youtubeTimeoutMs);
        const data = await response.json();

        if (data.error) {
            log('error', `YouTube API error: ${data.error.message}`);
            metrics.totalErrors += 1;
            recordError('YouTube API: ' + data.error.message);
            return res.status(400).json({ error: data.error.message });
        }

        if (!data.items || data.items.length === 0) {
            return res.status(404).json({ error: 'הסרטון לא נמצא — ייתכן שהוא פרטי או נמחק' });
        }

        const video = data.items[0];
        const snippet = video.snippet || {};
        const stats = video.statistics || {};
        const contentDetails = video.contentDetails || {};

        const publishedAt = (snippet.publishedAt || '').split('T')[0] || '';

        const result = {
            id: videoId,
            title: snippet.title || 'ללא כותרת',
            publishedAt: publishedAt,
            duration: parseISODuration(contentDetails.duration),
            views: parseInt(stats.viewCount, 10) || 0,
            likes: parseInt(stats.likeCount, 10) || 0,
            comments: parseInt(stats.commentCount, 10) || 0,
            platform: 'youtube',
        };

        metrics.totalSuccess += 1;
        recordLatency(Date.now() - requestStart);

        log('info', `YouTube fetch OK`, { videoId, title: result.title });

        return res.json(result);
    } catch (error) {
        next(error);
    }
});
// ============================================================
// 🆕 TikTok oEmbed — Fetch video data (Partial)
// ============================================================
app.post('/api/tiktok/fetch', apiRateLimiter, async (req, res, next) => {
    const requestStart = Date.now();
    metrics.totalRequests += 1;
    metrics.totalTiktokRequests += 1;

    try {
        const { url } = req.body || {};

        if (!url || typeof url !== 'string') {
            metrics.totalErrors += 1;
            recordError('Missing TikTok URL');
            return res.status(400).json({ error: 'חסר קישור TikTok' });
        }

        const videoId = extractTikTokId(url);
        if (!videoId) {
            metrics.totalErrors += 1;
            recordError('Invalid TikTok URL');
            return res.status(400).json({ error: 'קישור TikTok לא תקין — לא הצלחתי לחלץ מזהה סרטון' });
        }

        const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url.trim())}`;

        const response = await fetchWithTimeout(
            oembedUrl,
            {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json',
                },
            },
            CONFIG.tiktokTimeoutMs
        );

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            log('warn', `TikTok oEmbed failed: ${response.status}`, { errText: errText.slice(0, 200) });
            metrics.totalErrors += 1;
            recordError(`TikTok oEmbed ${response.status}`);

            if (response.status === 404) {
                return res.status(404).json({ error: 'הסרטון לא נמצא — ייתכן שהוא פרטי או נמחק' });
            }
            if (response.status === 403 || response.status === 429) {
                return res.status(429).json({ error: 'TikTok חוסם בקשות כרגע — נסה שוב בעוד דקה' });
            }
            return res.status(502).json({ error: 'TikTok לא זמין כרגע — נסה שוב בעוד דקה' });
        }

        const data = await response.json();

        if (!data || !data.title) {
            return res.status(404).json({ error: 'לא הצלחתי לחלץ מידע מהסרטון' });
        }

        const result = {
            id: videoId,
            title: data.title || 'ללא כותרת',
            author: data.author_name || '',
            authorUrl: data.author_url || '',
            thumbnailUrl: data.thumbnail_url || '',
            platform: 'tiktok',
            publishedAt: '',
            duration: 0,
            views: 0,
            likes: 0,
            comments: 0,
            needsManualData: true,
        };

        metrics.totalSuccess += 1;
        recordLatency(Date.now() - requestStart);

        log('info', `TikTok fetch OK`, { videoId, title: result.title.substring(0, 50) });

        return res.json(result);
    } catch (error) {
        next(error);
    }
});

function extractTikTokId(input) {
    if (!input || typeof input !== 'string') return null;
    const trimmed = input.trim();

    if (/^\d{18,20}$/.test(trimmed)) return trimmed;

    const patterns = [
        /tiktok\.com\/@[\w.-]+\/video\/(\d+)/,
        /tiktok\.com\/v\/(\d+)/,
        /vm\.tiktok\.com\/([A-Za-z0-9]+)/,
    ];

    for (const p of patterns) {
        const match = trimmed.match(p);
        if (match && match[1]) return match[1];
    }

    return null;
}

app.get('/api/mega-prompt', async (req, res, next) => {
    try {
        const uptimeSeconds = Math.floor((Date.now() - metrics.startedAt) / 1000);
        const mem = process.memoryUsage();
        const now = new Date().toISOString();
        const knowledgeFilesList = Array.from(knowledge.files.values()).map(f => `- \`knowledge/${f.name}\` — ${f.chunks} chunks, ${f.chars} תווים`).join('\n');
        const megaPrompt = `# 🎯 J.A.R.V.I.S — PROJECT MEGA-PROMPT
# נוצר אוטומטית: ${now}
# Uptime: ${formatUptime(uptimeSeconds)} | Memory: ${(mem.rss / 1024 / 1024).toFixed(1)} MB

## 🎯 הקשר כללי

אני עובד על פרויקט בשם J.A.R.V.I.S — עוזר AI אישי בעברית, בנוי על Node.js/Express + Gemini API.

**סטאק טכנולוגי:**
- Backend: Node.js + Express
- AI: Google Gemini API (מודל: ${CONFIG.geminiModel})
- Frontend: Vanilla JS + HTML + CSS
- אחסון: GitHub + Render

## Endpoints
- /api/ask, /api/vision, /api/analyze, /api/health, /api/metrics
- /api/knowledge, /api/mega-prompt, /api/analytics-chat
- /api/youtube/fetch 🆕

## Knowledge Base
${knowledgeFilesList || '- ⚠️ אין קבצי ידע'}

סה"כ: ${knowledge.files.size} קבצים, ${knowledge.chunks.length} chunks

## מטריקות
\`\`\`json
${JSON.stringify({ uptime: uptimeSeconds, model: CONFIG.geminiModel, totalRequests: metrics.totalRequests, totalSuccess: metrics.totalSuccess, totalErrors: metrics.totalErrors, totalYoutubeRequests: metrics.totalYoutubeRequests, knowledgeFiles: knowledge.files.size, knowledgeChunks: knowledge.chunks.length }, null, 2)}
\`\`\`

*נוצר אוטומטית על ידי GET /api/mega-prompt.*`;
        res.type('text/plain; charset=utf-8').send(megaPrompt);
    } catch (err) { next(err); }
});

app.post('/api/analytics-chat', apiRateLimiter, async (req, res, next) => {
    const requestStart = Date.now();
    metrics.totalRequests += 1;
    try {
        const { message, history: rawHistory, analytics } = req.body || {};
        if (!message || typeof message !== 'string' || !message.trim()) {
            metrics.totalErrors += 1;
            recordError('Empty analytics chat message');
            return res.status(400).json({ reply: 'אדון, לא התקבלה הודעה.' });
        }
        const userMessage = message.trim();
        const videos = Array.isArray(analytics?.videos) ? analytics.videos : [];
        const summary = analytics?.summary || computeAnalyticsSummary(videos);

        const analyticsBlock = videos.length ? `
### סיכום
- סרטונים: ${summary.totalVideos}, צפיות: ${(summary.totalViews || 0).toLocaleString('he-IL')}, לייקים: ${summary.totalLikes || 0}, תגובות: ${summary.totalComments || 0}

### פירוט (${videos.length})
${videos.slice(0, 30).map(v => `**${v.title}** [${v.platform || 'youtube'}] — ${v.views || 0} צפיות, ${v.likes || 0} לייקים, ${v.comments || 0} תגובות, ${v.duration || 0}s`).join('\n')}` : '\n### אין נתונים.\n';

        const personalChunks = searchKnowledge(userMessage);
        let personalContext = '';
        if (personalChunks.length > 0) personalContext = `\n\n### ידע אישי:\n${personalChunks.map(c => `- ${c.text}`).join('\n')}`;

        const analyticsSystemPrompt = `אתה J.A.R.V.I.S — אנליסט תוכן אישי בעברית.

## כללים:
1. ענה בעברית, בטון ישיר וחד.
2. היה ספציפי ומספרי.
3. תן פעולות קונקרטיות, לא קלישאות.
4. אל תמציא נתונים.
5. השתמש ב-Markdown.

## נתונים:
${analyticsBlock}
${personalContext}`;

        const normalizedHistory = Array.isArray(rawHistory) ? rawHistory.map(h => ({ role: h?.role === 'assistant' ? 'jarvis' : 'user', text: h?.content || h?.text || '' })) : [];
        const history = sanitizeHistory(normalizedHistory);
        const combinedContext = `${analyticsSystemPrompt}\n\n---\n(הפעל את ההנחיות של אנליטיקס בלבד.)`;

        const { reply, coreLatencyMs, attempts } = await callGeminiWithRetry(userMessage, combinedContext, history);

        metrics.totalSuccess += 1;
        recordLatency(coreLatencyMs);

        return res.json({ reply, latencyMs: coreLatencyMs, roundTripMs: Date.now() - requestStart, attempts, historyUsed: history.length, timestamp: new Date().toISOString() });
    } catch (error) { next(error); }
});

app.use((req, res) => { res.status(404).json({ reply: 'אדון, הנתיב המבוקש אינו קיים.' }); });

app.use((err, req, res, next) => {
    if (err instanceof GeminiError) {
        log('error', `Gemini ${err.statusCode}: ${err.message}`);
        recordError(err.message);
        if (err.isRateLimit) {
            return res.status(429).json({ reply: 'אדון, מערכות הליבה שלי הגיעו למכסת השימוש החינמית לרגע זה. אנא המתן כחצי דקה ונסה שוב.', rateLimited: true });
        }
        const status = err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
        return res.status(status).json({ reply: `אדון, ${err.message}` });
    }
    log('error', 'Unhandled error', err);
    recordError(err.message || 'Unknown error');
    return res.status(500).json({ reply: 'אדון, אירעה תקלה בלתי צפויה במערכת.' });
});

loadKnowledgeBase();

const server = app.listen(CONFIG.port, () => {
    log('info', `⚡ J.A.R.V.I.S Server is running securely on: http://localhost:${CONFIG.port}`);
    log('info', `🤖 Active Gemini Model: ${CONFIG.geminiModel}`);
    log('info', `🧠 Knowledge base: ${knowledge.files.size} files, ${knowledge.chunks.length} chunks`);
    log('info', `📺 YouTube API: ${CONFIG.youtubeApiKey ? 'configured' : 'NOT configured'}`);
    log('info', `💬 Conversation memory: up to ${CONFIG.maxHistoryMessages} messages per request`);
});

function shutdown(signal) {
    console.log(`\n${signal} התקבל, סוגר את השרת...`);
    server.close(() => { console.log('השרת נסגר בהצלחה.'); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => log('error', 'Unhandled Rejection', reason));
process.on('uncaughtException', (err) => log('error', 'Uncaught Exception', err));