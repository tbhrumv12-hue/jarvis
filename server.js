/**
 * ⚡ J.A.R.V.I.S Neural Kernel V6.0
 * Elite Production-Grade Server
 * Rebuilt: 2026-10-11 — UTF-8 Hebrew fixed, 11 research sources, research-chat endpoint
 *
 * Features:
 * - Gemini API (Paid Tier Ready)
 * - Vision API
 * - Multi-Source Research (11 sources)
 * - Knowledge Base with BM25
 * - Conversation Memory
 * - YouTube API + TikTok oEmbed
 * - Hebrew → English Translation
 * - Analytics AI
 * - Nutrition Analyzer (JSON)
 * - Research Chat (AI Analyst)
 * - Mega Prompt Generator
 * - Full Metrics & Monitoring
 */

'use strict';

// ==============================
// 1. IMPORTS
// ==============================

const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// ==============================
// 2. ENVIRONMENT VALIDATION
// ==============================

const REQUIRED_ENV_VARS = ['GEMINI_API_KEY'];
const missingRequiredEnvVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

if (missingRequiredEnvVars.length > 0) {
    console.error(`❌ CRITICAL: חסרים משתני סביבה: ${missingRequiredEnvVars.join(', ')}`);
    console.error('   אנא הגדר אותם בקובץ .env לפני ההפעלה.');
    process.exit(1);
}

// ==============================
// 3. CONFIGURATION
// ==============================

const CONFIG = {
    port: Number(process.env.PORT) || 3000,
    environment: process.env.NODE_ENV || 'development',

    geminiApiKey: String(process.env.GEMINI_API_KEY).trim(),
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    geminiTimeoutMs: Number(process.env.GEMINI_TIMEOUT_MS) || 45000,
    geminiVisionTimeoutMs: Number(process.env.GEMINI_VISION_TIMEOUT_MS) || 30000,
    geminiTranslationTimeoutMs: Number(process.env.GEMINI_TRANSLATION_TIMEOUT_MS) || 15000,

    youtubeApiKey: process.env.YOUTUBE_API_KEY || '',
    youtubeTimeoutMs: Number(process.env.YOUTUBE_TIMEOUT_MS) || 10000,
    tiktokTimeoutMs: Number(process.env.TIKTOK_TIMEOUT_MS) || 10000,
    researchTimeoutMs: Number(process.env.RESEARCH_TIMEOUT_MS) || 20000,
    coreApiKey: process.env.CORE_API_KEY || '',
    semanticScholarKey: process.env.SEMANTIC_SCHOLAR_KEY || '',

    maxPromptLength: Number(process.env.MAX_PROMPT_LENGTH) || 2000,
    maxResearchQueryLength: Number(process.env.MAX_RESEARCH_QUERY_LENGTH) || 300,
    maxImageSizeBytes: Number(process.env.MAX_IMAGE_SIZE_BYTES) || 4 * 1024 * 1024,

    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000,
    rateLimitMax: Number(process.env.RATE_LIMIT_MAX) || 30,
    visionRateLimitMax: Number(process.env.VISION_RATE_LIMIT_MAX) || 15,
    researchRateLimitMax: Number(process.env.RESEARCH_RATE_LIMIT_MAX) || 10,

    retryOn429DelayMs: Number(process.env.RETRY_ON_429_DELAY_MS) || 55000,
    retryOn503DelayMs: Number(process.env.RETRY_ON_503_DELAY_MS) || 5000,
    defaultRetries: Number(process.env.DEFAULT_RETRIES) || 2,
    visionRetries: Number(process.env.VISION_RETRIES) || 1,

    knowledgeDir: path.join(__dirname, 'knowledge'),
    knowledgeMaxFileSizeBytes: Number(process.env.KNOWLEDGE_MAX_FILE_SIZE_BYTES) || 1024 * 1024,
    knowledgeChunkSize: Number(process.env.KNOWLEDGE_CHUNK_SIZE) || 1200,
    knowledgeTopChunks: Number(process.env.KNOWLEDGE_TOP_CHUNKS) || 5,
    knowledgeMinScore: Number(process.env.KNOWLEDGE_MIN_SCORE) || 0.4,

    maxHistoryMessages: Number(process.env.MAX_HISTORY_MESSAGES) || 12,
    maxHistoryCharsPerMessage: 2000,
    maxTotalHistoryChars: 8000,

    bm25K1: Number(process.env.BM25_K1) || 1.5,
    bm25B: Number(process.env.BM25_B) || 0.75,

   researchMaxPerSource: Number(process.env.RESEARCH_MAX_PER_SOURCE) || 150,
    researchFinalLimit: Number(process.env.RESEARCH_FINAL_LIMIT) || 30,
    researchAnalysisTopPapers: Number(process.env.RESEARCH_ANALYSIS_TOP_PAPERS) || 15,
    researchAbstractSnippetLength: Number(process.env.RESEARCH_ABSTRACT_SNIPPET_LENGTH) || 350,
    researchChatContextLimit: Number(process.env.RESEARCH_CHAT_CONTEXT_LIMIT) || 12,
};

// ==============================
// 4. SYSTEM PROMPTS
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
7. שלב את הידע עם הידע הכללי שלך בצורה חלקה, בלי לציין "לפי המאגר".

## שפה: עברית בלבד.`;

const ANALYTICS_SYSTEM_PROMPT = `אתה J.A.R.V.I.S — אנליסט תוכן אישי בעברית.

## כללי התנהגות:
1. ענה תמיד בעברית, בטון ישיר, חד, ומקצועי — כמו אנליסט שעובד איתו.
2. היה ספציפי ומספרי — צטט נתונים אמיתיים מהטבלה למטה.
3. אם שואלים "מה לעשות" — תן 2-3 פעולות קונקרטיות, לא קלישאות.
4. אם שואלים על סרטון ספציפי — התייחס לביצועים שלו מול הממוצע.
5. אל תמציא נתונים שלא קיימים. אם משהו חסר — אמור במפורש.
6. אם המשתמש שואל משהו לא קשור לאנליטיקס — ענה בקצרה והחזר אותו לנושא.
7. השתמש ב-Markdown: כותרות (##), בולטים (*), ומודגש (**).
8. אסור "יאס-מן" — אם משהו עובד רע, אמור את זה ישירות.
9. היה תמציתי — אל תכתוב מגילות. 2-4 משפטים לכל נקודה.
10. אם אתה רואה דפוסים — תאר אותם עם מספרים.`;

const TRANSLATION_SYSTEM_PROMPT = `אתה מתרגם מקצועי של מונחים מדעיים ורפואיים מעברית לאנגלית.

## כללים:
1. החזר רק את התרגום — בלי הסברים, בלי הקדמות, בלי מרכאות.
2. השתמש במונחים המקובלים במחקרים מדעיים באנגלית.
3. אם הביטוי מורכב — תרגם לביטוי חיפוש יעיל.
4. אם הביטוי כבר באנגלית — החזר אותו כמו שהוא.
5. אל תוסיף הסברים בסוגריים.

## דוגמאות:
- "קוטג'" → "cottage cheese"
- "אבקת חלבון" → "whey protein powder"
- "שוקולד 95 אחוז" → "dark chocolate 95 percent"
- "קריאטין" → "creatine supplementation"
- "צום לסירוגין" → "intermittent fasting"
- "חלבון ושריר" → "protein intake muscle mass"
- "ויטמין D" → "vitamin D"
- "אומגה 3" → "omega-3 fatty acids"
- "שינה וטסטוסטרון" → "sleep testosterone levels"`;

const NUTRITION_SYSTEM_PROMPT = `אתה תזונאי מקצועי. אתה מנתח ארוחות בעברית ומחזיר נתונים תזונתיים מדויקים בפורמט JSON.

## כללים:
1. היה ריאלי במספרים — השתמש במאגרי מידע תזונתיים מקובלים.
2. אם יש ספק — תן הערכה שמרנית.
3. אם לא זיהית מאכל — החזר ערכים 0 וציין בשם "לא זוהה".
4. השתמש בשמות בעברית למאכלים, ויטמינים, ומינרלים.
5. אחוזים של ויטמינים/מינרלים = אחוז מה-RDA היומי.
6. החזר רק JSON תקין, בלי טקסט נוסף.`;

const RESEARCH_CHAT_SYSTEM_PROMPT = `אתה מדען-על אנליטי. תפקידך: לענות על שאלות של המשתמש בהתבסס **אך ורק** על המחקרים שסופקו לך.

## כללים מוחלטים:
1. ענה **רק** על בסיס המחקרים שסופקו. אל תמציא נתונים, מספרים או עובדות.
2. אם אין במחקרים תשובה — אמור במפורש: "המחקרים שלפנַי לא עונים על זה".
3. הפנה למחקרים ספציפיים עם מספריהם: "מחקר [3] מצא ש..."
4. אם יש סתירה בין מחקרים — ציין אותה במפורש: "מחקר [2] טוען X, בעוד מחקר [7] טוען Y".
5. אם יש קונצנזוס — אמור "רוב המחקרים מסכימים ש..."
6. סגנון: ישיר, מדעי, מבוסס ראיות, בעברית.
7. אורך: 2-5 פסקאות, תלוי בשאלה. אם השאלה קצרה — תשובה קצרה.
8. השתמש ב-Markdown: **מודגש** לנקודות מפתח, רשימות כשצריך.
9. אסור "יאס-מן" — אם מחקר חלש, אמור את זה.
10. אם המשתמש שואל משהו לא קשור למחקרים — אמור "השאלה לא קשורה למחקרים שלפנַי".`;
const RESEARCH_CHAT_HYBRID_SYSTEM_PROMPT = `אתה ג'רוויס — עוזר AI אישי חכם, חד, ישיר, עם גישה למחקרים מדעיים.

## כללי התנהגות:
1. **השתמש במחקרים קודם כל** — אם יש תשובה במחקרים שסופקו, צטט אותם: "מחקר [3] מצא ש..."
2. **אם המחקרים לא עונים** — אמור את זה במפורש ("המחקרים שלפנַי לא עונים ישירות") ואז תן תשובה כללית מהידע שלך, עם הסתייגות: "אבל ידוע באופן כללי ש..."
3. **אל תמציא מחקרים** — אם אתה אומר "מחקר X", הוא חייב להיות מהרשימה שסופקה.
4. **הבחן בבירור** בין:
   - מה שמוכח במחקרים (עם ציטוט [N])
   - מה שידוע כללית אבל לא הוכח במחקרים שסופקו
   - מה שהוא דעתך/השערה
5. **סגנון**: ישיר, מדעי, מבוסס ראיות, בעברית. אפס "יאס-מן".
6. **אורך**: 2-5 פסקאות. שאלה קצרה = תשובה קצרה.
7. **Markdown**: **מודגש**, רשימות, קוד.

## דוגמאות לתשובות טובות:
- שאלה עם תשובה במחקרים: "מחקר [2] ומחקר [5] 
מצאו ש-X. מחקר [7] טוען ההפך, אבל יש לו מדגם קטן."
- שאלה בלי תשובה במחקרים: "המחקרים שלפנַי לא עונים על זה ישירות. באופן כללי ידוע ש-X, אבל זה לא מבוסס במחקרים שסופקו."
- שאלה היברידית: "מחקר [3] מצא ש-X (בהקשר ספציפי). מהידע הכללי שלי, נראה ש-Y. אני ממליץ לבדוק את [4] להמשך."

## שפה: עברית בלבד.`;

// ==============================
// 5. METRICS
// ==============================

const metrics = {
    startedAt: Date.now(),
    totalRequests: 0,
    totalSuccess: 0,
    totalErrors: 0,
    totalVisionRequests: 0,
    totalYoutubeRequests: 0,
    totalTiktokRequests: 0,
    totalResearchRequests: 0,
    totalResearchChatRequests: 0,
    totalTranslationRequests: 0,
    totalNutritionRequests: 0,
    totalKnowledgeLookups: 0,
    totalKnowledgeHits: 0,
    totalRateLimitHits: 0,
    totalHighDemandHits: 0,
    totalHistoryMessagesSent: 0,
    totalPapersFetched: 0,
    lastLatencyMs: 0,
    avgLatencyMs: 0,
    lastErrorAt: null,
    lastErrorMessage: null,
    latencySamples: [],
    perSourceHits: {},
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

function recordSourceHit(sourceName, count) {
    if (!metrics.perSourceHits[sourceName]) metrics.perSourceHits[sourceName] = 0;
    metrics.perSourceHits[sourceName] += count;
}

// ==============================
// 6. LOGGER
// ==============================

function log(level, message, meta = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    if (meta && typeof meta === 'object') {
        console.log(`${prefix} ${message}`, meta);
    } else if (meta !== null) {
        console.log(`${prefix} ${message} ${meta}`);
    } else {
        console.log(`${prefix} ${message}`);
    }
}

// ==============================
// 7. ERROR CLASSES
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

class ResearchError extends Error {
    constructor(message, statusCode = 500, details = null) {
        super(message);
        this.name = 'ResearchError';
        this.statusCode = statusCode;
        this.details = details;
    }
}

class ValidationError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.name = 'ValidationError';
        this.statusCode = statusCode;
    }
}

// ==============================
// 8. UTILITY FUNCTIONS
// ==============================

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(attempt) {
    return Math.min(1000 * Math.pow(2, attempt), 5000);
}

async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        return response;
    } finally {
        clearTimeout(timeout);
    }
}

function isRateLimitError(data, status) {
    if (status === 429) return true;
    if (data && data.error) {
        const msg = String(data.error.message || '').toLowerCase();
        const code = data.error.code;
        if (code === 429) return true;
        if (msg.includes('quota') || msg.includes('rate limit') || msg.includes('exceeded')) return true;
    }
    return false;
}

function isHighDemandError(data, status) {
    if (status === 503) return true;
    if (data && data.error) {
        const msg = String(data.error.message || '').toLowerCase();
        if (msg.includes('high demand') || msg.includes('overloaded') || msg.includes('unavailable')) return true;
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

function stripHtml(str) {
    if (!str) return '';
    return String(str).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripDoiPrefix(doi) {
    if (!doi) return '';
    return String(doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim();
}

function truncate(str, maxLen) {
    if (!str) return '';
    const s = String(str);
    if (s.length <= maxLen) return s;
    return s.substring(0, maxLen) + '…';
}

function hasHebrew(text) {
    if (!text) return false;
    return /[\u0590-\u05FF]/.test(String(text));
}

function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ==============================
// 9. KNOWLEDGE — TOKENIZER
// ==============================

const STOP_WORDS_HE = new Set([
    'של', 'את', 'על', 'עם', 'כל', 'זה', 'זו', 'הוא', 'היא', 'הם', 'הן',
    'אני', 'אתה', 'אנחנו', 'אתם', 'אתן', 'לי', 'לך', 'לו', 'לה', 'לנו',
    'יש', 'אין', 'היה', 'היתה', 'יהיה', 'להיות', 'גם', 'רק', 'או', 'אבל',
    'אם', 'כי', 'מה', 'מי', 'איך', 'למה', 'מתי', 'איפה', 'איזה', 'כמה',
    'כן', 'לא', 'אפשר', 'צריך', 'רוצה', 'יכול', 'הולך', 'עושה', 'הופך'
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
    'from', 'into', 'through', 'during', 'before', 'after',
    'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under'
]);

function tokenize(text) {
    if (!text) return [];
    return String(text)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 2)
        .filter((w) => !STOP_WORDS_HE.has(w) && !STOP_WORDS_EN.has(w));
}

function chunkText(text, maxSize) {
    const chunks = [];
    if (!text) return chunks;
    const normalized = String(text).replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
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

// ==============================
// 10. KNOWLEDGE — STORAGE
// ==============================

const knowledge = {
    chunks: [],
    files: new Map(),
    loadedAt: null,
    totalChars: 0,
    avgDocLength: 0,
    docFreq: new Map(),
    vocab: new Set(),
};

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
            result.push({ filename, content: content.trim(), fromEnv: true });
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
                    knowledge.vocab.add(t);
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

    log('info', 'Knowledge base loaded from ENV', {
        files: knowledge.files.size,
        chunks: knowledge.chunks.length,
        vocab: knowledge.vocab.size,
    });

    return true;
}

function loadFromFilesystem() {
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
                        knowledge.vocab.add(t);
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

        return true;
    } catch (err) {
        log('error', 'Failed to load knowledge from filesystem', err.message);
        return false;
    }
}

function loadKnowledgeBase() {
    knowledge.chunks = [];
    knowledge.files = new Map();
    knowledge.totalChars = 0;
    knowledge.docFreq = new Map();
    knowledge.avgDocLength = 0;
    knowledge.vocab = new Set();

    // Load from ENV (existing vars)
    const envLoaded = loadFromEnvironment();

    // Load from Filesystem (also, always — merges with ENV)
    const fsLoaded = loadFromFilesystem();

    if (!envLoaded && !fsLoaded) {
        log('warn', 'Knowledge base is empty — no ENV or filesystem sources');
        return;
    }

    knowledge.loadedAt = Date.now();
    log('info', 'Knowledge base ready (merged)', {
        fromEnv: envLoaded,
        fromFilesystem: fsLoaded,
        files: knowledge.files.size,
        chunks: knowledge.chunks.length,
        vocab: knowledge.vocab.size,
        avgDocLength: Math.round(knowledge.avgDocLength),
    });
}

// ==============================
// 11. KNOWLEDGE — BM25 SCORING
// ==============================

function bm25Score(queryTokens, chunk, N, avgdl) {
    if (!queryTokens.length || !chunk.tokenFreq) return 0;
    let score = 0;
    const docLen = chunk.length || 1;

    for (const qt of queryTokens) {
        const f = chunk.tokenFreq.get(qt) || 0;
        if (f === 0) continue;

        const df = knowledge.docFreq.get(qt) || 1;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const numerator = f * (CONFIG.bm25K1 + 1);
        const denominator = f + CONFIG.bm25K1 * (1 - CONFIG.bm25B + CONFIG.bm25B * (docLen / avgdl));

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
// 12. CONVERSATION MEMORY
// ==============================

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
        contents.push({ role: m.role, parts: [{ text: m.text }] });
    }
    contents.push({ role: 'user', parts: [{ text: newUserQuery }] });
    return contents;
}// ==============================
// 13. GEMINI API — CORE CALLS
// ==============================

async function callGemini({
    systemInstruction,
    contents,
    temperature = 0.7,
    maxOutputTokens = 2048,
    timeoutMs = CONFIG.geminiTimeoutMs,
    retries = CONFIG.defaultRetries,
}) {
    const fallback = require('./gemini-fallback');
    const modelsToTry = fallback.getFallbackModels(CONFIG.geminiModel);

    const body = JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: { temperature, maxOutputTokens },
    });

    let lastError = null;
    const coreStart = Date.now();
    const attemptsLog = [];

    for (let modelIdx = 0; modelIdx < modelsToTry.length; modelIdx++) {
        const currentModel = modelsToTry[modelIdx];
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${CONFIG.geminiApiKey}`;

        let modelFailed = false;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const response = await fetchWithTimeout(
                    url,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body,
                    },
                    timeoutMs
                );

                const data = await response.json();

                // ── Success ──
                if (!data.error) {
                    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (reply) {
                        if (modelIdx > 0) {
                            log('info', `Gemini fallback SUCCESS on model: ${currentModel}`, {
                                attempts: attemptsLog,
                            });
                        }
                        return {
                            reply: reply.trim(),
                            coreLatencyMs: Date.now() - coreStart,
                            attempts: attempt + 1,
                            modelUsed: currentModel,
                        };
                    }
                    throw new GeminiError('מבנה הנתונים אינו תקין', 502, data);
                }

                // ── Model not found → try next model immediately ──
                if (fallback.isModelNotFoundError(data, response.status)) {
                    log('warn', `Model ${currentModel} not available, trying next`);
                    attemptsLog.push({ model: currentModel, reason: 'not-found' });
                    modelFailed = true;
                    break;
                }

                // ── High demand / rate limit ──
                const highDemand = fallback.isHighDemandError(data, response.status);

                if (highDemand) {
                    metrics.totalHighDemandHits += 1;

                    if (attempt < retries) {
                        const retryMs = Math.min(
                            extractRetryDelay(data) || CONFIG.retryOn503DelayMs,
                            8000
                        );
                        log('warn', `${currentModel} high demand — retry ${attempt + 1}/${retries} in ${Math.round(retryMs / 1000)}s`);
                        await sleep(retryMs);
                        continue;
                    }

                    // Exhausted retries on this model → move to next model
                    log('warn', `${currentModel} exhausted retries, trying next model`);
                    attemptsLog.push({ model: currentModel, reason: 'high-demand' });
                    modelFailed = true;
                    break;
                }

                // ── Rate limit (429) ──
                if (isRateLimitError(data, response.status)) {
                    metrics.totalRateLimitHits += 1;
                    if (attempt < retries) {
                        const retryMs = Math.min(
                            extractRetryDelay(data) || CONFIG.retryOn429DelayMs,
                            10000
                        );
                        log('warn', `${currentModel} rate limit — retry in ${Math.round(retryMs / 1000)}s`);
                        await sleep(retryMs);
                        continue;
                    }
                    attemptsLog.push({ model: currentModel, reason: 'rate-limit' });
                    modelFailed = true;
                    break;
                }

                // ── Other errors ──
                const isRetryable = response.status >= 500;
                if (isRetryable && attempt < retries) {
                    await sleep(backoffDelay(attempt));
                    continue;
                }

                lastError = new GeminiError(
                    data.error.message || 'שגיאה לא ידועה ממערכת הליבה',
                    response.status >= 400 ? response.status : 502,
                    data.error
                );
                attemptsLog.push({ model: currentModel, reason: 'error', msg: lastError.message });
                modelFailed = true;
                break;

            } catch (error) {
                if (error instanceof GeminiError) {
                    lastError = error;
                } else if (error.name === 'AbortError') {
                    lastError = new GeminiError('תם הזמן הקצוב', 504);
                } else {
                    lastError = new GeminiError('תקלת תקשורת זמנית', 502, error.message);
                }

                if (attempt === retries) {
                    attemptsLog.push({ model: currentModel, reason: 'exception', msg: lastError.message });
                    modelFailed = true;
                    break;
                }
                await sleep(backoffDelay(attempt));
            }
        }

        if (!modelFailed) break;
    }

    log('error', 'All Gemini models failed', { attempts: attemptsLog });
    throw lastError || new GeminiError('כל המודלים עמוסים כרגע — נסה שוב בעוד דקה', 503);
}

async function callGeminiWithRetry(userQuery, knowledgeContext = '', history = [], retries = CONFIG.defaultRetries) {
    let systemText;
    if (knowledgeContext) {
        systemText = `${KNOWLEDGE_SYSTEM_PROMPT}\n\n${knowledgeContext}`;
    } else {
        systemText = SYSTEM_PROMPT;
    }

    const contents = buildConversationContents(history, userQuery);

    return callGemini({
        systemInstruction: systemText,
        contents,
        temperature: 0.7,
        maxOutputTokens: 2048,
        timeoutMs: CONFIG.geminiTimeoutMs,
        retries,
    });
}

// ==============================
// 14. GEMINI JSON — STRUCTURED OUTPUT
// ==============================

async function callGeminiJSON({
    systemInstruction,
    userPrompt,
    temperature = 0.3,
    maxOutputTokens = 8192,
    timeoutMs = CONFIG.geminiTimeoutMs,
    retries = CONFIG.defaultRetries,
}) {
    const fallback = require('./gemini-fallback');
    const modelsToTry = fallback.getFallbackModels(CONFIG.geminiModel);

    const body = JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{
            role: 'user',
            parts: [{ text: userPrompt }],
        }],
        generationConfig: {
            temperature,
            maxOutputTokens,
            responseMimeType: 'application/json',
        },
    });

    let lastError = null;
    const coreStart = Date.now();
    const attemptsLog = [];

    for (let modelIdx = 0; modelIdx < modelsToTry.length; modelIdx++) {
        const currentModel = modelsToTry[modelIdx];
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${CONFIG.geminiApiKey}`;

        let modelFailed = false;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const response = await fetchWithTimeout(
                    url,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body,
                    },
                    timeoutMs
                );

                const data = await response.json();

                if (data.error) {
                    if (fallback.isModelNotFoundError(data, response.status)) {
                        log('warn', `JSON model ${currentModel} not available, trying next`);
                        attemptsLog.push({ model: currentModel, reason: 'not-found' });
                        modelFailed = true;
                        break;
                    }

                    if (fallback.isHighDemandError(data, response.status)) {
                        metrics.totalHighDemandHits += 1;
                        if (attempt < retries) {
                            const retryMs = Math.min(
                                extractRetryDelay(data) || CONFIG.retryOn503DelayMs,
                                8000
                            );
                            log('warn', `JSON ${currentModel} high demand — retry in ${Math.round(retryMs / 1000)}s`);
                            await sleep(retryMs);
                            continue;
                        }
                        attemptsLog.push({ model: currentModel, reason: 'high-demand' });
                        modelFailed = true;
                        break;
                    }

                    if (isRateLimitError(data, response.status)) {
                        metrics.totalRateLimitHits += 1;
                        if (attempt < retries) {
                            const retryMs = Math.min(
                                extractRetryDelay(data) || CONFIG.retryOn429DelayMs,
                                10000
                            );
                            await sleep(retryMs);
                            continue;
                        }
                        attemptsLog.push({ model: currentModel, reason: 'rate-limit' });
                        modelFailed = true;
                        break;
                    }

                    const isRetryable = response.status >= 500;
                    if (isRetryable && attempt < retries) {
                        await sleep(backoffDelay(attempt));
                        continue;
                    }

                    lastError = new GeminiError(
                        data.error.message || 'שגיאה לא ידועה ממערכת הליבה',
                        response.status >= 400 ? response.status : 502,
                        data.error
                    );
                    attemptsLog.push({ model: currentModel, reason: 'error', msg: lastError.message });
                    modelFailed = true;
                    break;
                }

                const candidate = data?.candidates?.[0];
                const reply = candidate?.content?.parts?.[0]?.text;
                const finishReason = candidate?.finishReason || 'UNKNOWN';

                if (!reply) {
                    throw new GeminiError('מבנה הנתונים אינו תקין — תשובה ריקה', 502, { finishReason });
                }

                if (finishReason === 'MAX_TOKENS') {
                    throw new GeminiError(
                        'תשובת AI נחתכה בגלל מגבלת אורך. נסה לנסח את הבקשה בפחות פריטים.',
                        502,
                        { finishReason, replyLength: reply.length }
                    );
                }

                if (finishReason === 'SAFETY') {
                    throw new GeminiError('הבקשה נחסמה על ידי מסנני בטיחות של Gemini', 502, { finishReason });
                }

                if (finishReason === 'RECITATION') {
                    throw new GeminiError('הבקשה נחסמה על ידי מסנני Gemini', 502, { finishReason });
                }

                // ── JSON parsing with multiple salvage attempts ──
                let parsed = null;
                let parseErr = null;

                try {
                    parsed = JSON.parse(reply);
                } catch (e) {
                    parseErr = e;
                }

                if (!parsed) {
                    const stripped = String(reply)
                        .replace(/^\s*```(?:json)?\s*/i, '')
                        .replace(/\s*```\s*$/i, '')
                        .trim();
                    try {
                        parsed = JSON.parse(stripped);
                    } catch (e) {
                        parseErr = e;
                    }
                }

                if (!parsed) {
                    const firstBrace = reply.indexOf('{');
                    const lastBrace = reply.lastIndexOf('}');
                    if (firstBrace !== -1 && lastBrace > firstBrace) {
                        const inner = reply.slice(firstBrace, lastBrace + 1);
                        try {
                            parsed = JSON.parse(inner);
                        } catch (e) {
                            parseErr = e;
                        }
                    }
                }

                if (!parsed) {
                    let fixed = String(reply).trim();
                    const firstBrace = fixed.indexOf('{');
                    if (firstBrace !== -1) fixed = fixed.slice(firstBrace);
                    fixed = fixed.replace(/,\s*([}\]])/g, '$1');

                    const openCurly = (fixed.match(/\{/g) || []).length;
                    const closeCurly = (fixed.match(/\}/g) || []).length;
                    const openSquare = (fixed.match(/\[/g) || []).length;
                    const closeSquare = (fixed.match(/\]/g) || []).length;

                    if (openCurly > closeCurly) fixed += '}'.repeat(openCurly - closeCurly);
                    if (openSquare > closeSquare) {
                        fixed = fixed.replace(/\}\s*$/, '');
                        fixed += ']'.repeat(openSquare - closeSquare) + '}';
                    }

                    try {
                        parsed = JSON.parse(fixed);
                        log('warn', 'Gemini JSON: salvaged truncated response');
                    } catch (e) {
                        parseErr = e;
                    }
                }

                if (!parsed) {
                    log('error', 'Gemini JSON: all parse attempts failed', {
                        finishReason,
                        replyLength: reply.length,
                        parseError: parseErr?.message,
                    });
                    throw new GeminiError(
                        'תשובת AI לא בפורמט JSON תקין',
                        502,
                        { raw: reply.substring(0, 500), finishReason }
                    );
                }

                if (modelIdx > 0) {
                    log('info', `Gemini JSON fallback SUCCESS on model: ${currentModel}`, {
                        attempts: attemptsLog,
                    });
                }

                return {
                    data: parsed,
                    coreLatencyMs: Date.now() - coreStart,
                    attempts: attempt + 1,
                    modelUsed: currentModel,
                };

            } catch (error) {
                if (error instanceof GeminiError) {
                    lastError = error;
                    if (error.statusCode === 502 && /MAX_TOKENS|SAFETY|RECITATION/.test(error.message)) {
                        throw error;
                    }
                } else if (error.name === 'AbortError') {
                    lastError = new GeminiError('תם הזמן הקצוב', 504);
                } else {
                    lastError = new GeminiError('תקלת תקשורת זמנית', 502, error.message);
                }

                if (attempt === retries) {
                    attemptsLog.push({ model: currentModel, reason: 'exception', msg: lastError.message });
                    modelFailed = true;
                    break;
                }
                await sleep(backoffDelay(attempt));
            }
        }

        if (!modelFailed) break;
    }

    log('error', 'All Gemini JSON models failed', { attempts: attemptsLog });
    throw lastError || new GeminiError('כל המודלים עמוסים כרגע — נסה שוב בעוד דקה', 503);
}
// ==============================
// 15. GEMINI VISION
// ==============================
async function callGeminiVision(imageBase64, mimeType, userPrompt, retries = CONFIG.visionRetries) {
    const fallback = require('./gemini-fallback');
    const modelsToTry = fallback.getFallbackModels(CONFIG.geminiModel);

    const promptText = userPrompt && userPrompt.trim()
        ? `${VISION_SYSTEM_PROMPT}\n\nהמשתמש שואל: ${userPrompt.trim()}`
        : `${VISION_SYSTEM_PROMPT}\n\nתאר מה אתה רואה בתמונה.`;

    const body = JSON.stringify({
        contents: [
            {
                parts: [
                    { text: promptText },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: imageBase64,
                        },
                    },
                ],
            },
        ],
        generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 512,
        },
    });

    let lastError = null;
    const coreStart = Date.now();
    const attemptsLog = [];

    for (let modelIdx = 0; modelIdx < modelsToTry.length; modelIdx++) {
        const currentModel = modelsToTry[modelIdx];
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${CONFIG.geminiApiKey}`;

        let modelFailed = false;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const response = await fetchWithTimeout(
                    url,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body,
                    },
                    CONFIG.geminiVisionTimeoutMs
                );

                const data = await response.json();

                if (data.error) {
                    if (fallback.isModelNotFoundError(data, response.status)) {
                        log('warn', `Vision model ${currentModel} not available, trying next`);
                        attemptsLog.push({ model: currentModel, reason: 'not-found' });
                        modelFailed = true;
                        break;
                    }

                    if (fallback.isHighDemandError(data, response.status)) {
                        metrics.totalHighDemandHits += 1;
                        if (attempt < retries) {
                            const retryMs = Math.min(
                                extractRetryDelay(data) || CONFIG.retryOn503DelayMs,
                                8000
                            );
                            log('warn', `Vision ${currentModel} high demand — retry in ${Math.round(retryMs / 1000)}s`);
                            await sleep(retryMs);
                            continue;
                        }
                        attemptsLog.push({ model: currentModel, reason: 'high-demand' });
                        modelFailed = true;
                        break;
                    }

                    if (isRateLimitError(data, response.status)) {
                        metrics.totalRateLimitHits += 1;
                        if (attempt < retries) {
                            const retryMs = Math.min(
                                extractRetryDelay(data) || CONFIG.retryOn429DelayMs,
                                10000
                            );
                            await sleep(retryMs);
                            continue;
                        }
                        attemptsLog.push({ model: currentModel, reason: 'rate-limit' });
                        modelFailed = true;
                        break;
                    }

                    const isRetryable = response.status >= 500;
                    if (isRetryable && attempt < retries) {
                        await sleep(backoffDelay(attempt));
                        continue;
                    }

                    lastError = new GeminiError(
                        data.error.message || 'שגיאה בניתוח התמונה',
                        response.status >= 400 ? response.status : 502,
                        data.error
                    );
                    attemptsLog.push({ model: currentModel, reason: 'error', msg: lastError.message });
                    modelFailed = true;
                    break;
                }

                const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!reply) {
                    throw new GeminiError('מבנה הנתונים אינו תקין', 502, data);
                }

                if (modelIdx > 0) {
                    log('info', `Vision fallback SUCCESS on model: ${currentModel}`);
                }

                return {
                    reply: reply.trim(),
                    coreLatencyMs: Date.now() - coreStart,
                    attempts: attempt + 1,
                    modelUsed: currentModel,
                };

            } catch (error) {
                if (error instanceof GeminiError) {
                    lastError = error;
                } else if (error.name === 'AbortError') {
                    lastError = new GeminiError('תם הזמן הקצוב', 504);
                } else {
                    lastError = new GeminiError('תקלת תקשורת זמנית', 502, error.message);
                }

                if (attempt === retries) {
                    attemptsLog.push({ model: currentModel, reason: 'exception', msg: lastError.message });
                    modelFailed = true;
                    break;
                }
                await sleep(backoffDelay(attempt));
            }
        }

        if (!modelFailed) break;
    }

    log('error', 'All Vision models failed', { attempts: attemptsLog });
    throw lastError || new GeminiError('כל המודלים עמוסים כרגע — נסה שוב בעוד דקה', 503);
}

// ==============================
// 16. TRANSLATION (Hebrew → English)
// ==============================

async function translateToEnglish(hebrewQuery) {
    const trimmed = String(hebrewQuery || '').trim();
    if (!trimmed) return '';

    if (!hasHebrew(trimmed)) {
        return trimmed;
    }

    try {
        const prompt = `תרגם את הביטוי הבא לאנגלית מדעית/רפואית (בלי הסברים, רק התרגום):\n\n"${trimmed}"\n\nתרגום:`;

        const { reply } = await callGemini({
            systemInstruction: TRANSLATION_SYSTEM_PROMPT,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            temperature: 0.2,
            maxOutputTokens: 128,
            timeoutMs: CONFIG.geminiTranslationTimeoutMs,
            retries: 1,
        });

        const translated = String(reply)
            .trim()
            .replace(/^["'`]|["'`]$/g, '')
            .split('\n')[0]
            .trim();

        metrics.totalTranslationRequests += 1;
        log('info', `Translated: "${trimmed}" → "${translated}"`);

        return translated || trimmed;
    } catch (err) {
        log('warn', `Translation failed: ${err.message}`);
        return trimmed;
    }
}

// ==============================
// 17. HELPERS — YOUTUBE / TIKTOK
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

    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

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

// ==============================
// 18. ANALYTICS SUMMARY HELPER
// ==============================

function computeAnalyticsSummary(videos) {
    if (!Array.isArray(videos) || videos.length === 0) {
        return {
            totalVideos: 0,
            totalViews: 0,
            totalLikes: 0,
            totalComments: 0,
            totalShares: 0,
            totalSubscribers: 0,
            totalWatchTimeHours: 0,
            avgViewPercent: 0,
            stayToWatch: 0,
            avgViews: 0,
            avgLikes: 0,
            ratio: 0,
            commentRatio: 0,
        };
    }

    const sum = (key) => videos.reduce((s, v) => s + (Number(v[key]) || 0), 0);

    const totalViews = sum('views');
    const totalLikes = sum('likes');
    const totalComments = sum('comments');
    const totalShares = sum('shares');
    const totalSubscribers = sum('subscribers');
    const totalWatchTimeHours = sum('watchTimeHours');

    return {
        totalVideos: videos.length,
        totalViews,
        totalLikes,
        totalComments,
        totalShares,
        totalSubscribers,
        totalWatchTimeHours: Number(totalWatchTimeHours.toFixed(2)),
        avgViewPercent: Number((sum('avgViewPercent') / videos.length).toFixed(2)),
        stayToWatch: Number((
            videos.reduce((s, v) => s + (Number(v?.retention?.completionRate) || 0), 0) / videos.length
        ).toFixed(2)),
        avgViews: Math.round(totalViews / videos.length),
        avgLikes: Math.round(totalLikes / videos.length),
        ratio: totalViews ? Number(((totalLikes / totalViews) * 100).toFixed(2)) : 0,
        commentRatio: totalViews ? Number(((totalComments / totalViews) * 100).toFixed(3)) : 0,
    };
}

// ==============================
// 19. RESEARCH — PAPER MAPPERS
// ==============================

function createPaperObject({
    id = '',
    source = '',
    title = '',
    abstract = '',
    authors = '',
    year = '',
    journal = '',
    citedBy = 0,
    doi = '',
    url = '',
    openAccess = false,
}) {
    return {
        id: String(id || '').trim(),
        source: String(source || '').trim(),
        title: stripHtml(title) || 'ללא כותרת',
        abstract: stripHtml(abstract) || '',
        authors: String(authors || '').trim(),
        year: String(year || '').trim(),
        journal: String(journal || '').trim(),
        citedBy: Number(citedBy) || 0,
        doi: stripDoiPrefix(doi),
        url: String(url || '').trim(),
        openAccess: Boolean(openAccess),
    };
}

function normalizeDoi(doi) {
    return stripDoiPrefix(String(doi || '').toLowerCase());
}

function normalizeTitle(title) {
    return String(title || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}// ==============================
// 20. RESEARCH — SOURCE 1: EUROPE PMC
// ==============================

const EUROPE_PMC_API = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';

async function fetchFromEuropePMC(query, limit) {
    const cleanQuery = String(query).trim().replace(/"/g, '').slice(0, 200);
    if (!cleanQuery) return [];

    const searchVariants = [
        `TITLE:"${cleanQuery}"`,
        `TITLE:"${cleanQuery}" AND (PUB_TYPE:"Review" OR PUB_TYPE:"Meta-Analysis" OR PUB_TYPE:"Clinical Trial")`,
        `TITLE_ABS:"${cleanQuery}" AND (PUB_TYPE:"Review" OR PUB_TYPE:"Meta-Analysis")`,
        `TITLE_ABS:"${cleanQuery}"`,
    ];

    const results = await Promise.all(searchVariants.map(async (q) => {
        try {
            const url = `${EUROPE_PMC_API}?query=${encodeURIComponent(q)}&format=json&resultType=core&pageSize=${limit}`;
            const response = await fetchWithTimeout(url, { method: 'GET' }, CONFIG.researchTimeoutMs);
            if (!response.ok) return [];
            const data = await response.json();
            return data?.resultList?.result || [];
        } catch (err) {
            log('warn', 'Europe PMC variant failed', { q: q.substring(0, 60), err: err.message });
            return [];
        }
    }));

    const seen = new Set();
    const papers = [];

    for (const batch of results) {
        for (const item of batch) {
            const key = item.pmid || item.id || item.doi;
            if (!key || seen.has(key)) continue;
            seen.add(key);

            papers.push(createPaperObject({
                id: item.pmid || item.id || '',
                source: 'Europe PMC',
                title: item.title || '',
                abstract: item.abstractText || '',
                authors: item.authorString || '',
                year: item.pubYear || '',
                journal: item.journalTitle || '',
                citedBy: item.citedByCount || 0,
                doi: item.doi || '',
                url: item.pmid
                    ? `https://pubmed.ncbi.nlm.nih.gov/${item.pmid}/`
                    : (item.doi ? `https://doi.org/${stripDoiPrefix(item.doi)}` : ''),
                openAccess: item.isOpenAccess === 'Y',
            }));
        }
    }

    recordSourceHit('Europe PMC', papers.length);
    log('info', `Europe PMC: ${papers.length} papers`);
    return papers;
}

// ==============================
// 21. RESEARCH — SOURCE 2: PUBMED
// ==============================

const PUBMED_ESEARCH_API = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
const PUBMED_ESUMMARY_API = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';
const PUBMED_EFETCH_API = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';

async function fetchFromPubMed(query, limit) {
    const cleanQuery = String(query).trim().slice(0, 200);
    if (!cleanQuery) return [];

    try {
        // Step 1: Search — get PMIDs
        const searchUrl = `${PUBMED_ESEARCH_API}?db=pubmed&term=${encodeURIComponent(cleanQuery)}&retmax=${limit}&retmode=json&sort=relevance`;
        const searchRes = await fetchWithTimeout(searchUrl, { method: 'GET' }, CONFIG.researchTimeoutMs);
        if (!searchRes.ok) return [];

        const searchData = await searchRes.json();
        const ids = searchData?.esearchresult?.idlist || [];

        if (!ids.length) {
            recordSourceHit('PubMed', 0);
            return [];
        }

        // Step 2: Fetch — get full records WITH abstracts (XML)
        const fetchUrl = `${PUBMED_EFETCH_API}?db=pubmed&id=${ids.join(',')}&retmode=xml&rettype=abstract`;
        const fetchRes = await fetchWithTimeout(fetchUrl, { method: 'GET' }, CONFIG.researchTimeoutMs);
        if (!fetchRes.ok) return [];

        const xmlText = await fetchRes.text();
        const papers = parsePubMedXML(xmlText);

        recordSourceHit('PubMed', papers.length);
        log('info', `PubMed: ${papers.length} papers (with abstracts)`);
        return papers;
    } catch (err) {
        log('warn', `PubMed failed: ${err.message}`);
        recordSourceHit('PubMed', 0);
        return [];
    }
}

function parsePubMedXML(xmlText) {
    if (!xmlText || typeof xmlText !== 'string') return [];

    const papers = [];
    // Split by <PubmedArticle> blocks
    const articleRegex = /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g;
    let match;

    while ((match = articleRegex.exec(xmlText)) !== null) {
        const block = match[1];

        try {
            const pmidMatch = block.match(/<PMID[^>]*>(\d+)<\/PMID>/);
            const pmid = pmidMatch ? pmidMatch[1] : '';

            const titleMatch = block.match(/<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/);
            const title = titleMatch ? stripXmlTags(titleMatch[1]) : '';

            // Abstract can have multiple sections
            const abstractParts = [];
            const abstractRegex = /<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g;
            let abstractMatch;
            while ((abstractMatch = abstractRegex.exec(block)) !== null) {
                const part = stripXmlTags(abstractMatch[1]);
                if (part) abstractParts.push(part);
            }
            const abstract = abstractParts.join(' ');

            const journalMatch = block.match(/<Journal>[\s\S]*?<Title>([\s\S]*?)<\/Title>/);
            const journal = journalMatch ? stripXmlTags(journalMatch[1]) : '';

            const yearMatch = block.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/);
            const year = yearMatch ? yearMatch[1] : '';

            // Authors
            const authors = [];
            const authorRegex = /<Author[^>]*>[\s\S]*?<LastName>([\s\S]*?)<\/LastName>[\s\S]*?(?:<ForeName>([\s\S]*?)<\/ForeName>)?[\s\S]*?<\/Author>/g;
            let authorMatch;
            while ((authorMatch = authorRegex.exec(block)) !== null) {
                const lastName = authorMatch[1] || '';
                const foreName = authorMatch[2] || '';
                if (lastName) {
                    authors.push(`${foreName} ${lastName}`.trim());
                }
            }

            // DOI
            const doiMatch = block.match(/<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/);
            const doi = doiMatch ? doiMatch[1].trim() : '';

            if (!pmid || !title) continue;

            papers.push(createPaperObject({
                id: pmid,
                source: 'PubMed',
                title,
                abstract,
                authors: authors.join(', '),
                year,
                journal,
                citedBy: 0,
                doi,
                url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
                openAccess: false,
            }));
        } catch (parseErr) {
            log('warn', `PubMed XML parse error for one article: ${parseErr.message}`);
        }
    }

    return papers;
}

function stripXmlTags(xml) {
    if (!xml) return '';
    return String(xml)
        .replace(/<[^>]*>/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
            try { return String.fromCharCode(parseInt(hex, 16)); } catch (e) { return ''; }
        })
        .replace(/&#(\d+);/g, (_, dec) => {
            try { return String.fromCharCode(parseInt(dec, 10)); } catch (e) { return ''; }
        })
        .replace(/\s+/g, ' ')
        .trim();
}

// ==============================
// 22. RESEARCH — SOURCE 3: OPENALEX
// ==============================

const OPENALEX_API = 'https://api.openalex.org/works';

function reconstructOpenAlexAbstract(invertedIndex) {
    if (!invertedIndex || typeof invertedIndex !== 'object') return '';
    const positions = [];
    for (const [word, idxs] of Object.entries(invertedIndex)) {
        if (!Array.isArray(idxs)) continue;
        for (const idx of idxs) positions.push({ word, idx });
    }
    positions.sort((a, b) => a.idx - b.idx);
    return positions.map((p) => p.word).join(' ');
}

async function fetchFromOpenAlex(query, limit) {
    const cleanQuery = String(query).trim().slice(0, 200);
    if (!cleanQuery) return [];

    try {
        const url = `${OPENALEX_API}?search=${encodeURIComponent(cleanQuery)}&per-page=${limit}&sort=cited_by_count:desc&mailto=research@jarvis.local`;
        const response = await fetchWithTimeout(url, { method: 'GET' }, CONFIG.researchTimeoutMs);
        if (!response.ok) return [];

        const data = await response.json();
        const results = data?.results || [];

        const papers = results.map((item) => {
            const authors = Array.isArray(item.authorships)
                ? item.authorships.map((a) => a.author?.display_name).filter(Boolean).join(', ')
                : '';

            return createPaperObject({
                id: item.id || '',
                source: 'OpenAlex',
                title: item.title || item.display_name || '',
                abstract: item.abstract_inverted_index
                    ? reconstructOpenAlexAbstract(item.abstract_inverted_index)
                    : '',
                authors,
                year: item.publication_year || '',
                journal: item.primary_location?.source?.display_name || '',
                citedBy: item.cited_by_count || 0,
                doi: item.doi || '',
                url: item.doi ? `https://doi.org/${stripDoiPrefix(item.doi)}` : (item.id || ''),
                openAccess: item.open_access?.is_oa || false,
            });
        });

        recordSourceHit('OpenAlex', papers.length);
        log('info', `OpenAlex: ${papers.length} papers`);
        return papers;
    } catch (err) {
        log('warn', `OpenAlex failed: ${err.message}`);
        recordSourceHit('OpenAlex', 0);
        return [];
    }
}

// ==============================
// 23. RESEARCH — SOURCE 4: SEMANTIC SCHOLAR
// ==============================

const SEMANTIC_SCHOLAR_API = 'https://api.semanticscholar.org/graph/v1/paper/search';

async function fetchFromSemanticScholar(query, limit) {
    const cleanQuery = String(query).trim().slice(0, 200);
    if (!cleanQuery) return [];

    try {
        const fields = 'title,abstract,authors,year,venue,citationCount,externalIds,openAccessPdf,url';
        const url = `${SEMANTIC_SCHOLAR_API}?query=${encodeURIComponent(cleanQuery)}&limit=${limit}&fields=${fields}`;

        const headers = { 'Accept': 'application/json' };
        if (CONFIG.semanticScholarKey) headers['x-api-key'] = CONFIG.semanticScholarKey;

        const response = await fetchWithTimeout(url, { method: 'GET', headers }, CONFIG.researchTimeoutMs);
        if (!response.ok) return [];

        const data = await response.json();
        const results = data?.data || [];

        const papers = results.map((item) => {
            const authors = Array.isArray(item.authors)
                ? item.authors.map((a) => a.name).filter(Boolean).join(', ')
                : '';
            const doi = item.externalIds?.DOI || '';
            const pmid = item.externalIds?.PubMed || '';

            return createPaperObject({
                id: item.paperId || '',
                source: 'Semantic Scholar',
                title: item.title || '',
                abstract: item.abstract || '',
                authors,
                year: item.year || '',
                journal: item.venue || '',
                citedBy: item.citationCount || 0,
                doi,
                url: pmid
                    ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
                    : (item.url || (doi ? `https://doi.org/${stripDoiPrefix(doi)}` : '')),
                openAccess: Boolean(item.openAccessPdf),
            });
        });

        recordSourceHit('Semantic Scholar', papers.length);
        log('info', `Semantic Scholar: ${papers.length} papers`);
        return papers;
    } catch (err) {
        log('warn', `Semantic Scholar failed: ${err.message}`);
        recordSourceHit('Semantic Scholar', 0);
        return [];
    }
}

// ==============================
// 24. RESEARCH — SOURCE 5: CROSSREF
// ==============================

const CROSSREF_API = 'https://api.crossref.org/works';

async function fetchFromCrossRef(query, limit) {
    const cleanQuery = String(query).trim().slice(0, 200);
    if (!cleanQuery) return [];

    try {
        const url = `${CROSSREF_API}?query=${encodeURIComponent(cleanQuery)}&rows=${limit}&sort=is-referenced-by-count&order=desc&mailto=research@jarvis.local`;
        const response = await fetchWithTimeout(url, { method: 'GET' }, CONFIG.researchTimeoutMs);
        if (!response.ok) return [];

        const data = await response.json();
        const results = data?.message?.items || [];

        const papers = results
            .filter((item) => Array.isArray(item.title) && item.title.length > 0)
            .map((item) => {
                const authors = Array.isArray(item.author)
                    ? item.author.map((a) => `${a.given || ''} ${a.family || ''}`.trim()).filter(Boolean).join(', ')
                    : '';
                const year = item.published?.['date-parts']?.[0]?.[0] || '';
                const doi = item.DOI || '';

                return createPaperObject({
                    id: doi,
                    source: 'CrossRef',
                    title: item.title[0] || '',
                    abstract: item.abstract || '',
                    authors,
                    year,
                    journal: item['container-title']?.[0] || '',
                    citedBy: item['is-referenced-by-count'] || 0,
                    doi,
                    url: doi ? `https://doi.org/${stripDoiPrefix(doi)}` : (item.URL || ''),
                    openAccess: false,
                });
            });

        recordSourceHit('CrossRef', papers.length);
        log('info', `CrossRef: ${papers.length} papers`);
        return papers;
    } catch (err) {
        log('warn', `CrossRef failed: ${err.message}`);
        recordSourceHit('CrossRef', 0);
        return [];
    }
}

// ==============================
// 25. RESEARCH — SOURCE 6: DOAJ
// ==============================

const DOAJ_API = 'https://doaj.org/api/search/articles';

async function fetchFromDOAJ(query, limit) {
    const cleanQuery = String(query).trim().slice(0, 200);
    if (!cleanQuery) return [];

    try {
        const url = `${DOAJ_API}/${encodeURIComponent(cleanQuery)}?pageSize=${limit}`;
        const response = await fetchWithTimeout(url, { method: 'GET' }, CONFIG.researchTimeoutMs);
        if (!response.ok) return [];

        const data = await response.json();
        const results = data?.results || [];

        const papers = results
            .filter((item) => item.bibjson)
            .map((item) => {
                const bj = item.bibjson;
                const authors = Array.isArray(bj.author)
                    ? bj.author.map((a) => a.name).filter(Boolean).join(', ')
                    : '';
                const year = bj.year || '';
                const doi = bj.identifier?.find((i) => i.type === 'doi')?.id || '';

                return createPaperObject({
                    id: item.id || doi,
                    source: 'DOAJ',
                    title: bj.title || '',
                    abstract: bj.abstract || '',
                    authors,
                    year,
                    journal: bj.journal?.title || '',
                    citedBy: 0,
                    doi,
                    url: bj.link?.[0]?.url || (doi ? `https://doi.org/${stripDoiPrefix(doi)}` : ''),
                    openAccess: true,
                });
            });

        recordSourceHit('DOAJ', papers.length);
        log('info', `DOAJ: ${papers.length} papers`);
        return papers;
    } catch (err) {
        log('warn', `DOAJ failed: ${err.message}`);
        recordSourceHit('DOAJ', 0);
        return [];
    }
}

// ==============================
// 26. RESEARCH — SOURCE 7: BIORXIV
// ==============================

async function fetchFromBioRxiv(query, limit) {
    const cleanQuery = String(query).trim().toLowerCase().slice(0, 200);
    if (!cleanQuery) return [];

    try {
        const url = `https://api.biorxiv.org/details/biorxiv/2020-01-01/2026-12-31/${limit}`;
        const response = await fetchWithTimeout(url, { method: 'GET' }, CONFIG.researchTimeoutMs);
        if (!response.ok) {
            recordSourceHit('bioRxiv', 0);
            return [];
        }

        const data = await response.json();
        const results = data?.collection || [];

        const queryWords = cleanQuery.split(/\s+/).filter((w) => w.length > 2);
        const filtered = results.filter((item) => {
            const combined = `${item.title || ''} ${item.abstract || ''}`.toLowerCase();
            return queryWords.some((w) => combined.includes(w));
        });

        const papers = filtered.slice(0, limit).map((item) => {
            const doi = item.doi || '';
            return createPaperObject({
                id: doi,
                source: 'bioRxiv',
                title: item.title || '',
                abstract: item.abstract || '',
                authors: item.authors || '',
                year: (item.date || '').substring(0, 4),
                journal: 'bioRxiv (Preprint)',
                citedBy: 0,
                doi,
                url: doi ? `https://doi.org/${stripDoiPrefix(doi)}` : '',
                openAccess: true,
            });
        });

        recordSourceHit('bioRxiv', papers.length);
        log('info', `bioRxiv: ${papers.length} papers`);
        return papers;
    } catch (err) {
        log('warn', `bioRxiv failed: ${err.message}`);
        recordSourceHit('bioRxiv', 0);
        return [];
    }
}

// ==============================
// 27. RESEARCH — SOURCE 8: CORE
// ==============================

const CORE_API = 'https://api.core.ac.uk/v3/search/works';

async function fetchFromCORE(query, limit) {
    const cleanQuery = String(query).trim().slice(0, 200);
    if (!cleanQuery) return [];
    if (!CONFIG.coreApiKey) {
        log('info', 'CORE: skipped (no API key)');
        recordSourceHit('CORE', 0);
        return [];
    }

    try {
        const url = `${CORE_API}?q=${encodeURIComponent(cleanQuery)}&limit=${limit}`;
        const response = await fetchWithTimeout(
            url,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${CONFIG.coreApiKey}`,
                    'Accept': 'application/json',
                },
            },
            CONFIG.researchTimeoutMs
        );

        if (!response.ok) {
            recordSourceHit('CORE', 0);
            return [];
        }

        const data = await response.json();
        const results = data?.results || [];

        const papers = results.map((item) => {
            const authors = Array.isArray(item.authors)
                ? item.authors.map((a) => a.name).filter(Boolean).join(', ')
                : '';

            return createPaperObject({
                id: item.id || '',
                source: 'CORE',
                title: item.title || '',
                abstract: item.abstract || '',
                authors,
                year: item.yearPublished || '',
                journal: item.publisher || '',
                citedBy: item.citationCount || 0,
                doi: item.doi || '',
                url: item.downloadUrl || item.sourceFulltextUrls?.[0] || '',
                openAccess: true,
            });
        });

        recordSourceHit('CORE', papers.length);
        log('info', `CORE: ${papers.length} papers`);
        return papers;
    } catch (err) {
        log('warn', `CORE failed: ${err.message}`);
        recordSourceHit('CORE', 0);
        return [];
    }
}

// ==============================
// 28. RESEARCH — SOURCE 9: MEDRXIV (NEW)
// ==============================

async function fetchFromMedRxiv(query, limit) {
    const cleanQuery = String(query).trim().toLowerCase().slice(0, 200);
    if (!cleanQuery) return [];

    try {
        const url = `https://api.biorxiv.org/details/medrxiv/2020-01-01/2026-12-31/${limit}`;
        const response = await fetchWithTimeout(url, { method: 'GET' }, CONFIG.researchTimeoutMs);
        if (!response.ok) {
            recordSourceHit('medRxiv', 0);
            return [];
        }

        const data = await response.json();
        const results = data?.collection || [];

        const queryWords = cleanQuery.split(/\s+/).filter((w) => w.length > 2);
        const filtered = results.filter((item) => {
            const combined = `${item.title || ''} ${item.abstract || ''}`.toLowerCase();
            return queryWords.some((w) => combined.includes(w));
        });

        const papers = filtered.slice(0, limit).map((item) => {
            const doi = item.doi || '';
            return createPaperObject({
                id: doi,
                source: 'medRxiv',
                title: item.title || '',
                abstract: item.abstract || '',
                authors: item.authors || '',
                year: (item.date || '').substring(0, 4),
                journal: 'medRxiv (Preprint)',
                citedBy: 0,
                doi,
                url: doi ? `https://doi.org/${stripDoiPrefix(doi)}` : '',
                openAccess: true,
            });
        });

        recordSourceHit('medRxiv', papers.length);
        log('info', `medRxiv: ${papers.length} papers`);
        return papers;
    } catch (err) {
        log('warn', `medRxiv failed: ${err.message}`);
        recordSourceHit('medRxiv', 0);
        return [];
    }
}

// ==============================
// 29. RESEARCH — SOURCE 10: BASE (NEW)
// ==============================

async function fetchFromBASE(query, limit) {
    const cleanQuery = String(query).trim().slice(0, 200);
    if (!cleanQuery) return [];

    try {
        const url = `https://api.base-search.net/cgi-bin/BaseHttpSearchInterface.fcgi?func=PerformSearch&query=${encodeURIComponent(cleanQuery)}&format=json&hits=${limit}`;
        const response = await fetchWithTimeout(url, { method: 'GET' }, CONFIG.researchTimeoutMs);
        if (!response.ok) {
            recordSourceHit('BASE', 0);
            return [];
        }

        const text = await response.text();
        let data = null;
        try {
            data = JSON.parse(text);
        } catch (e) {
            log('warn', `BASE: response not JSON`);
            recordSourceHit('BASE', 0);
            return [];
        }

        const results = data?.response?.docs || [];

        const papers = results.map((item) => {
            const authors = Array.isArray(item.dccreator)
                ? item.dccreator.join(', ')
                : (item.dccreator || '');
            const year = item.dcyear || '';
            const title = Array.isArray(item.dctitle) ? item.dctitle[0] : (item.dctitle || '');

            return createPaperObject({
                id: item.id || '',
                source: 'BASE',
                title,
                abstract: item.dcdescription || '',
                authors,
                year,
                journal: item.dcsource || '',
                citedBy: 0,
                doi: item.dcdoi || '',
                url: item.dclink || (item.dcdoi ? `https://doi.org/${stripDoiPrefix(item.dcdoi)}` : ''),
                openAccess: Boolean(item.dcoa),
            });
        });

        recordSourceHit('BASE', papers.length);
        log('info', `BASE: ${papers.length} papers`);
        return papers;
    } catch (err) {
        log('warn', `BASE failed: ${err.message}`);
        recordSourceHit('BASE', 0);
        return [];
    }
}

// ==============================
// 30. RESEARCH — SOURCE 11: SCIELO (NEW)
// ==============================

async function fetchFromSciELO(query, limit) {
    const cleanQuery = String(query).trim().slice(0, 200);
    if (!cleanQuery) return [];

    try {
        const url = `https://search.scielo.org/?q=${encodeURIComponent(cleanQuery)}&lang=en&count=${limit}&from=0&output=site&format=json`;
        const response = await fetchWithTimeout(url, { method: 'GET' }, CONFIG.researchTimeoutMs);
        if (!response.ok) {
            recordSourceHit('SciELO', 0);
            return [];
        }

        const data = await response.json();
        const results = data?.response?.docs || data?.docs || [];

        const papers = results.slice(0, limit).map((item) => {
            const authors = Array.isArray(item.au)
                ? item.au.join(', ')
                : (item.au || '');
            const doi = item.doi || '';
            const id = item.id || doi;

            return createPaperObject({
                id,
                source: 'SciELO',
                title: item.ti || '',
                abstract: item.ab || '',
                authors,
                year: item.py || '',
                journal: item.ta || item.journal_title || '',
                citedBy: 0,
                doi,
                url: doi ? `https://doi.org/${stripDoiPrefix(doi)}` : (item.url || ''),
                openAccess: true,
            });
        });

        recordSourceHit('SciELO', papers.length);
        log('info', `SciELO: ${papers.length} papers`);
        return papers;
    } catch (err) {
        log('warn', `SciELO failed: ${err.message}`);
        recordSourceHit('SciELO', 0);
        return [];
    }
}

// ==============================
// 31. RESEARCH — AGGREGATOR
// ==============================

function deduplicatePapers(papers) {
    const seenDoi = new Set();
    const seenTitle = new Set();
    const unique = [];

    for (const p of papers) {
        const doi = normalizeDoi(p.doi);
        const title = normalizeTitle(p.title);

        if (doi && seenDoi.has(doi)) continue;
        if (title && seenTitle.has(title)) continue;

        if (doi) seenDoi.add(doi);
        if (title) seenTitle.add(title);
        unique.push(p);
    }

    return unique;
}

function scorePaperRelevance(paper, query) {
    const q = String(query).toLowerCase().trim();
    const title = String(paper.title || '').toLowerCase();
    const abstract = String(paper.abstract || '').toLowerCase();

    let score = 0;

    if (title.includes(q)) {
        score += 500;
    } else {
        const queryWords = q.split(/\s+/).filter((w) => w.length > 2);
        const matchedInTitle = queryWords.filter((w) => title.includes(w)).length;
        score += matchedInTitle * 60;

        if (queryWords.length > 0 && matchedInTitle < Math.ceil(queryWords.length / 2)) {
            score -= 150;
        }
    }

    if (abstract) {
        try {
            const esc = escapeRegex(q);
            const matches = abstract.match(new RegExp(esc, 'g')) || [];
            score += Math.min(matches.length * 8, 40);
        } catch (e) {
            // ignore
        }
    }

    if (title.includes('meta-analysis') || title.includes('meta analysis')) {
        score += 80;
    } else if (title.includes('systematic review')) {
        score += 75;
    } else if (title.includes('review')) {
        score += 50;
    } else if (title.includes('randomized') || title.includes('randomised')) {
        score += 40;
    } else if (title.includes('clinical trial')) {
        score += 40;
    }

    const healthKeywords = [
        'health', 'benefit', 'risk', 'effect', 'impact', 'nutrition',
        'diet', 'human', 'weight', 'diabetes', 'cholesterol', 'protein',
        'muscle', 'metabolic', 'cardiovascular', 'dairy', 'calcium',
        'intake', 'consumption', 'supplementation', 'performance',
        'body composition', 'hypertrophy', 'strength', 'training',
    ];

    for (const kw of healthKeywords) {
        if (title.includes(kw)) score += 12;
        else if (abstract.includes(kw)) score += 2;
    }

    const offTopicKeywords = [
        'endometriosis', 'breast cancer', 'bariatric', 'sleep apnea',
        'obstructive', 'ohmic', 'listeria', 'clostridioides', 'biofilm',
        'preservative', 'shelf life', 'menopause', 'pregnancy',
        'infant formula', 'neonatal', 'pediatric oncology',
    ];

    for (const kw of offTopicKeywords) {
        if (title.includes(kw)) score -= 250;
    }

    score += Math.min(paper.citedBy || 0, 500) / 20;
    if (paper.openAccess) score += 5;

    return score;
}

async function searchAllSources(query, limitPerSource) {
    log('info', `Research aggregator starting: "${query}" (11 sources)`);

    const results = await Promise.allSettled([
        fetchFromEuropePMC(query, limitPerSource),
        fetchFromPubMed(query, limitPerSource),
        fetchFromOpenAlex(query, limitPerSource),
        fetchFromSemanticScholar(query, limitPerSource),
        fetchFromCrossRef(query, limitPerSource),
        fetchFromDOAJ(query, limitPerSource),
        fetchFromBioRxiv(query, limitPerSource),
        fetchFromCORE(query, limitPerSource),
        fetchFromMedRxiv(query, limitPerSource),
        fetchFromBASE(query, limitPerSource),
        fetchFromSciELO(query, limitPerSource),
    ]);

    const allPapers = [];
    for (const result of results) {
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
            allPapers.push(...result.value);
        }
    }

    metrics.totalPapersFetched += allPapers.length;
    log('info', `Total fetched: ${allPapers.length} papers from 11 sources`);

    const unique = deduplicatePapers(allPapers);
    log('info', `After dedup: ${unique.length} papers`);

    unique.sort((a, b) => scorePaperRelevance(b, query) - scorePaperRelevance(a, query));

    return unique;
}

// ==============================
// 32. RESEARCH — AI ANALYSIS
// ==============================

function buildFallbackSummary(query, englishQuery, papers) {
    const top = papers.slice(0, 5);
    const list = top.map((p, i) => {
        const citations = p.citedBy ? ` • ${p.citedBy} ציטוטים` : '';
        const year = p.year ? ` (${p.year})` : '';
        const source = p.source ? ` [${p.source}]` : '';
        return `${i + 1}. **"${truncate(p.title, 120)}"**${year}${citations}${source}`;
    }).join('\n');

    const wasTranslated = englishQuery && englishQuery !== query;

    return {
        verdict: '⚠️ סיכום AI לא זמין כרגע',
        summary: `מצאתי ${papers.length} מחקרים רלוונטיים על "${query}"${wasTranslated ? ` (חיפוש: "${englishQuery}")` : ''}.\n\nהנה המחקרים המובילים:\n\n${list}\n\n💡 נסה שוב בעוד דקה כדי לקבל סיכום AI מלא עם תובנות ומיתוס.`,
        myth: '',
        limitations: '',
        fallback: true,
        wasTranslated,
    };
}

async function analyzeResearchWithAI(query, englishQuery, papers) {
    const topPapers = papers.slice(0, CONFIG.researchAnalysisTopPapers);

    const papersText = topPapers.map((p, i) => {
        const cite = p.citedBy ? ` [${p.citedBy} citations]` : '';
        const source = p.source ? ` [${p.source}]` : '';
        const snippet = truncate(p.abstract || 'לא זמין', CONFIG.researchAbstractSnippetLength);
        return `[${i + 1}] "${p.title}" (${p.year})${cite}${source}\nתקציר: ${snippet}\n`;
    }).join('\n');

    const wasTranslated = englishQuery && englishQuery !== query;

    const prompt = `אתה מדען-על בכיר. השאלה שלי: "${query}"${wasTranslated ? `\n(חיפשתי במאגרי מחקרים בינלאומיים עם המונח: "${englishQuery}")` : ''}\n\nהנה ${topPapers.length} המחקרים הרלוונטיים ביותר שנמצאו:\n\n${papersText}\n\n---\n\nענה במבנה הזה בדיוק, בעברית, בלי הקדמות, בלי מרכאות מיותרות:\n\n[VERDICT]\nכן / לא / תלוי / לא ברור — משפט אחד חד וחד-משמעי.\n[/VERDICT]\n\n[SUMMARY]\n3-4 משפטים מבוססים רק על המחקרים שלמעלה. תן מספרים ספציפיים אם יש. אם המחקרים לא עונים ישירות — אמור את זה במפורש.\n[/SUMMARY]\n\n[MYTH]\nמיתוס אחד נפוץ על הנושא + האמת שמחקרים מראים. 2-3 משפטים.\n[/MYTH]\n\n[LIMITATIONS]\nמשפט אחד: מה המחקרים האלה לא אומרים, או מה עוד צריך לחקור.\n[/LIMITATIONS]\n\nסגנון: ישיר, מדעי, מבוסס ראיות. עברית.`;

    const { reply } = await callGemini({
        systemInstruction: 'אתה מדען-על. תן תשובות מדויקות, מבוססות ראיות, בעברית.',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        temperature: 0.4,
        maxOutputTokens: 2500,
        timeoutMs: CONFIG.geminiTimeoutMs,
        retries: CONFIG.defaultRetries,
    });

    const verdictMatch = reply.match(/\[VERDICT\]([\s\S]*?)\[\/VERDICT\]/i);
    const summaryMatch = reply.match(/\[SUMMARY\]([\s\S]*?)\[\/SUMMARY\]/i);
    const mythMatch = reply.match(/\[MYTH\]([\s\S]*?)\[\/MYTH\]/i);
    const limitationsMatch = reply.match(/\[LIMITATIONS\]([\s\S]*?)\[\/LIMITATIONS\]/i);

    return {
        verdict: verdictMatch ? verdictMatch[1].trim() : 'לא ברור',
        summary: summaryMatch ? summaryMatch[1].trim() : reply,
        myth: mythMatch ? mythMatch[1].trim() : '',
        limitations: limitationsMatch ? limitationsMatch[1].trim() : '',
        fallback: false,
        wasTranslated,
    };
}// ==============================
// 33. EXPRESS SETUP
// ==============================

const app = express();

app.set('trust proxy', 1);

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
}));

app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    etag: true,
}));

// === Request Logger ===
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

// === Rate Limiters ===
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

const researchRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: CONFIG.researchRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { reply: 'אדון, יותר מדי בקשות מחקר.' },
});

// ==============================
// 34. ROUTES — ROOT
// ==============================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==============================
// 35. ROUTES — HEALTH & METRICS
// ==============================

app.get('/api/health', (req, res) => {
    try {
        const uptimeSeconds = Math.floor((Date.now() - metrics.startedAt) / 1000);
        res.json({
            status: 'ok',
            uptime: uptimeSeconds,
            uptimeHuman: formatUptime(uptimeSeconds),
            environment: CONFIG.environment,
            model: CONFIG.geminiModel,
            latencyMs: metrics.lastLatencyMs,
            avgLatencyMs: metrics.avgLatencyMs,
            totalRequests: metrics.totalRequests,
            totalSuccess: metrics.totalSuccess,
            totalErrors: metrics.totalErrors,
            totalVisionRequests: metrics.totalVisionRequests,
            totalYoutubeRequests: metrics.totalYoutubeRequests,
            totalTiktokRequests: metrics.totalTiktokRequests,
            totalResearchRequests: metrics.totalResearchRequests,
            totalResearchChatRequests: metrics.totalResearchChatRequests,
            totalTranslationRequests: metrics.totalTranslationRequests,
            totalNutritionRequests: metrics.totalNutritionRequests,
            totalPapersFetched: metrics.totalPapersFetched,
            totalRateLimitHits: metrics.totalRateLimitHits,
            totalHighDemandHits: metrics.totalHighDemandHits,
            knowledgeFiles: knowledge.files.size,
            knowledgeChunks: knowledge.chunks.length,
            knowledgeVocab: knowledge.vocab.size,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        log('error', 'Health endpoint failed', err.message);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

app.get('/api/metrics', (req, res) => {
    try {
        const uptimeSeconds = Math.floor((Date.now() - metrics.startedAt) / 1000);
        res.json({
            uptime: uptimeSeconds,
            uptimeHuman: formatUptime(uptimeSeconds),
            model: CONFIG.geminiModel,
            latencyMs: metrics.lastLatencyMs,
            avgLatencyMs: metrics.avgLatencyMs,
            totalRequests: metrics.totalRequests,
            totalErrors: metrics.totalErrors,
            knowledgeFiles: knowledge.files.size,
            knowledgeChunks: knowledge.chunks.length,
            perSourceHits: metrics.perSourceHits,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        res.status(500).json({ error: 'Metrics unavailable', message: err.message });
    }
});

// ==============================
// 36. ROUTES — KNOWLEDGE
// ==============================

app.get('/api/knowledge', (req, res) => {
    try {
        const files = Array.from(knowledge.files.values())
            .map((f) => ({
                name: f.name,
                size: f.size,
                chunks: f.chunks,
                chars: f.chars,
                modifiedAt: f.modifiedAt,
                fromEnv: Boolean(f.fromEnv),
            }))
            .sort((a, b) => b.modifiedAt - a.modifiedAt);

        res.json({
            files,
            totalFiles: files.length,
            totalChunks: knowledge.chunks.length,
            totalChars: knowledge.totalChars,
            vocab: knowledge.vocab.size,
            avgDocLength: Math.round(knowledge.avgDocLength),
            loadedAt: knowledge.loadedAt,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to list knowledge', message: err.message });
    }
});

app.post('/api/knowledge/upload', (req, res) => {
    try {
        const { name, content } = req.body || {};

        if (!name || typeof name !== 'string') {
            return res.status(400).json({ error: 'חסר שם קובץ' });
        }
        if (!content || typeof content !== 'string') {
            return res.status(400).json({ error: 'חסר תוכן לקובץ' });
        }

        const safeName = path.basename(name).replace(/[^\p{L}\p{N}\-_. ]/gu, '_');

        if (!/\.(txt|md)$/i.test(safeName)) {
            return res.status(400).json({ error: 'רק קבצי .txt או .md נתמכים' });
        }

        if (Buffer.byteLength(content, 'utf8') > CONFIG.knowledgeMaxFileSizeBytes) {
            return res.status(413).json({ error: 'הקובץ גדול מדי' });
        }

        const fullPath = path.join(CONFIG.knowledgeDir, safeName);
        fs.writeFileSync(fullPath, content, 'utf8');
        loadKnowledgeBase();

        log('info', `Knowledge uploaded: ${safeName}`);
        res.json({
            success: true,
            name: safeName,
            totalFiles: knowledge.files.size,
            totalChunks: knowledge.chunks.length,
        });
    } catch (err) {
        res.status(500).json({ error: 'העלאה נכשלה: ' + err.message });
    }
});

app.delete('/api/knowledge/:name', (req, res) => {
    try {
        const safeName = path.basename(req.params.name || '');

        if (!safeName || !/\.(txt|md)$/i.test(safeName)) {
            return res.status(400).json({ error: 'שם קובץ לא תקין' });
        }

        const fullPath = path.join(CONFIG.knowledgeDir, safeName);

        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'הקובץ לא נמצא' });
        }

        const resolved = path.resolve(fullPath);
        const baseDir = path.resolve(CONFIG.knowledgeDir);

        if (!resolved.startsWith(baseDir + path.sep)) {
            return res.status(400).json({ error: 'נתיב לא חוקי' });
        }

        fs.unlinkSync(fullPath);
        loadKnowledgeBase();

        res.json({
            success: true,
            name: safeName,
            totalFiles: knowledge.files.size,
            totalChunks: knowledge.chunks.length,
        });
    } catch (err) {
        res.status(500).json({ error: 'מחיקה נכשלה: ' + err.message });
    }
});

app.post('/api/knowledge/reload', (req, res) => {
    try {
        loadKnowledgeBase();
        res.json({
            success: true,
            totalFiles: knowledge.files.size,
            totalChunks: knowledge.chunks.length,
            vocab: knowledge.vocab.size,
        });
    } catch (err) {
        res.status(500).json({ error: 'טעינה מחדש נכשלה', message: err.message });
    }
});

// ==============================
// 37. ROUTES — ASK
// ==============================

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
            return res.status(413).json({
                reply: `אדון, השאלה ארוכה מדי (מקסימום ${CONFIG.maxPromptLength} תווים).`,
            });
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

        const { reply, coreLatencyMs, attempts } = await callGeminiWithRetry(
            userQuery,
            knowledgeContext,
            history
        );

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
            knowledgeSources: [...new Set(matchedChunks.map((c) => c.source))],
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        next(error);
    }
});

// ==============================
// 38. ROUTES — ANALYZE (Analytics)
// ==============================

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
            acc.subscribers += Number(v.subscribers) || 0;
            acc.count += 1;

            if (v.platform) {
                acc.platforms[v.platform] = acc.platforms[v.platform] || {
                    views: 0, likes: 0, comments: 0, count: 0,
                };
                acc.platforms[v.platform].views += Number(v.views) || 0;
                acc.platforms[v.platform].likes += Number(v.likes) || 0;
                acc.platforms[v.platform].comments += Number(v.comments) || 0;
                acc.platforms[v.platform].count += 1;
            }

            return acc;
        }, { views: 0, likes: 0, comments: 0, shares: 0, subscribers: 0, count: 0, platforms: {} });

        const ratio = totals.views ? ((totals.likes / totals.views) * 100).toFixed(2) : '0';
        const commentRatio = totals.views ? ((totals.comments / totals.views) * 100).toFixed(2) : '0';

        const sorted = [...videos].sort((a, b) => (b.views || 0) - (a.views || 0));
        const top5 = sorted.slice(0, 5);
        const bottom5 = sorted.slice(-5).reverse();
        const medianViews = sorted[Math.floor(sorted.length / 2)]?.views || 0;

        const engagementChamps = [...videos]
            .filter((v) => (v.views || 0) >= 100)
            .sort((a, b) => ((b.likes || 0) / (b.views || 1)) - ((a.likes || 0) / (a.views || 1)))
            .slice(0, 3);

        const commentChamps = [...videos]
            .filter((v) => (v.comments || 0) > 0)
            .sort((a, b) => (b.comments || 0) - (a.comments || 0))
            .slice(0, 3);

        const platformStats = {};
        for (const v of videos) {
            const p = v.platform || 'youtube';
            if (!platformStats[p]) {
                platformStats[p] = { count: 0, views: 0, likes: 0, comments: 0 };
            }
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
            const title = truncate(v.title, 80);
            return `${i + 1}. [${v.platform || 'youtube'}] "${title}" | ${v.date || '—'} | ${v.duration || 0}s | ${(v.views || 0).toLocaleString()} צפיות | ${v.likes || 0} לייקים (${vr}%) | ${v.comments || 0} תגובות (${cr}%)`;
        }).join('\n');

        const platformBlock = Object.entries(platformStats).map(([name, s]) => {
            const avgViews = Math.round(s.views / s.count);
            const pr = s.views ? (s.likes / s.views * 100).toFixed(2) : 0;
            const cr = s.views ? (s.comments / s.views * 100).toFixed(3) : 0;
            return `**${name}**: ${s.count} סרטונים | ${s.views.toLocaleString()} צפיות | ממוצע ${avgViews} צפיות/סרטון | יחס לייקים ${pr}% | יחס תגובות ${cr}%`;
        }).join('\n');

        const durationBlock = [
            `- **קצרים (עד 10s)**: ${durationBuckets.short.length} סרטונים, ממוצע ${durationBuckets.short.length ? Math.round(durationBuckets.short.reduce((s, v) => s + (Number(v.views) || 0), 0) / durationBuckets.short.length) : 0} צפיות/סרטון`,
            `- **בינוניים (11-20s)**: ${durationBuckets.medium.length} סרטונים, ממוצע ${durationBuckets.medium.length ? Math.round(durationBuckets.medium.reduce((s, v) => s + (Number(v.views) || 0), 0) / durationBuckets.medium.length) : 0} צפיות/סרטון`,
            `- **ארוכים (21s+)**: ${durationBuckets.long.length} סרטונים, ממוצע ${durationBuckets.long.length ? Math.round(durationBuckets.long.reduce((s, v) => s + (Number(v.views) || 0), 0) / durationBuckets.long.length) : 0} צפיות/סרטון`,
        ].join('\n');

        const topBlock = top5.map((v, i) => {
            const vr = v.views ? ((v.likes || 0) / v.views * 100).toFixed(2) : '0';
            return `${i + 1}. [${v.platform || 'youtube'}] "${truncate(v.title, 80)}" — ${(v.views || 0).toLocaleString()} צפיות | ${v.likes || 0} לייקים (${vr}%) | ${v.comments || 0} תגובות | ${v.duration || 0}s`;
        }).join('\n');

        const bottomBlock = bottom5.map((v, i) => {
            const vr = v.views ? ((v.likes || 0) / v.views * 100).toFixed(2) : '0';
            return `${i + 1}. [${v.platform || 'youtube'}] "${truncate(v.title, 80)}" — ${(v.views || 0).toLocaleString()} צפיות | ${v.likes || 0} לייקים (${vr}%) | ${v.duration || 0}s`;
        }).join('\n');

        const engagementBlock = engagementChamps.map((v, i) => {
            const vr = ((v.likes || 0) / (v.views || 1) * 100).toFixed(2);
            return `${i + 1}. [${v.platform || 'youtube'}] "${truncate(v.title, 80)}" — ${vr}% יחס לייקים (${v.likes}/${v.views})`;
        }).join('\n');

        const commentBlock = commentChamps.length
            ? commentChamps.map((v, i) => {
                const cr = ((v.comments / v.views) * 100).toFixed(3);
                return `${i + 1}. "${truncate(v.title, 80)}" — ${v.comments} תגובות (${cr}% מ-${v.views} צפיות)`;
            }).join('\n')
            : 'אין סרטונים עם תגובות.';

        const prompt = `אתה אנליסט תוכן אגרסיבי ומדויק. אתה מנתח נתוני ביצועים של יוצר תוכן קליסטניקס.
המטרה שלך: לתת לו תובנות שיעזרו לו לייצר תוכן ויראלי יותר — לא ללטף אגו.

## 📊 הנתונים המלאים

### טבלת כל הסרטונים (ממוין לפי צפיות)
${detailedTable}

### סיכום כללי
- סה"כ סרטונים: ${totals.count}
- סה"כ צפיות: ${totals.views.toLocaleString()}
- סה"כ לייקים: ${totals.likes.toLocaleString()} (יחס: ${ratio}%)
- סה"כ תגובות: ${totals.comments} (יחס: ${commentRatio}%)
- סה"כ שיתופים: ${totals.shares}
- סה"כ מנויים חדשים: ${totals.subscribers}
- חציון צפיות: ${medianViews.toLocaleString()}

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

תן ניתוח אמיתי, חד, וביקורתי.

**אסור לך:**
- לחמיא ("כל הכבוד!", "מעולה!")
- לחזור על הנתונים בלי לפרש
- לתת עצות גנריות
- לחזור על מה שהמשתמש כבר יודע

## 📐 הפורמט המדויק

### 🎯 מה עובד באמת (ולמה)
3 תובנות ספציפיות ומבוססות מספרים.

### 🔴 הבעיות האמיתיות
3 בעיות קונקרטיות. תגיד את האמת.

### 🎬 ניתוח ה-hook (2 השניות הראשונות)
נתח את הסרטון הטוב ביותר מול הגרוע ביותר.

### 📊 הפלטפורמות — אמת קשה
איזו פלטפורמה בזבזה זמן? עם מספרים ספציפיים.

### 🔬 ניתוח כותרות
מה עבד ומה לא? מה ההבדל בין Top 3 ל-Bottom 3?

### 🚀 5 כותרות מדויקות לסרטון הבא
5 כותרות ספציפיות שאפשר להשתמש בהן מחר בבוקר.

### ⚠️ האמת שאתה לא רוצה לשמוע
משהו אחד שאתה עושה לא נכון ואתה לא שם לב. בלי לרכך.

### 🎯 תוכנית פעולה לשבוע הבא
3 פעולות קונקרטיות לעשות בשבוע הקרוב.

סגנון: ישיר, ביקורתי, מבוסס מספרים. עברית. בלי הקדמות.`;

        const { reply, coreLatencyMs, attempts } = await callGemini({
            systemInstruction: 'אתה אנליסט תוכן אגרסיבי. תן ניתוח ישיר, ביקורתי, מבוסס מספרים.',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            temperature: 0.6,
            maxOutputTokens: 2048,
            timeoutMs: CONFIG.geminiTimeoutMs,
            retries: CONFIG.defaultRetries,
        });

        const totalRoundTripMs = Date.now() - requestStart;
        metrics.totalSuccess += 1;
        recordLatency(coreLatencyMs);

        log('info', 'Analyze OK', { videos: videos.length, coreLatencyMs, totalRoundTripMs, attempts });

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

// ==============================
// 39. ROUTES — VISION
// ==============================

app.post('/api/vision', visionRateLimiter, async (req, res, next) => {
    const requestStart = Date.now();
    metrics.totalRequests += 1;
    metrics.totalVisionRequests += 1;

    try {
        const { image, mimeType, prompt } = req.body || {};

        if (!image || typeof image !== 'string') {
            return res.status(400).json({ reply: 'אדון, לא התקבלה תמונה.' });
        }

        const safeMime = (typeof mimeType === 'string' && /^image\/(jpeg|png|webp)$/i.test(mimeType))
            ? mimeType
            : 'image/jpeg';

        const estimatedBytes = Math.floor((image.length * 3) / 4);
        if (estimatedBytes > CONFIG.maxImageSizeBytes) {
            return res.status(413).json({ reply: 'אדון, התמונה גדולה מדי.' });
        }

        const userPrompt = typeof prompt === 'string' ? prompt : '';

        const { reply, coreLatencyMs, attempts } = await callGeminiVision(image, safeMime, userPrompt);
        const totalRoundTripMs = Date.now() - requestStart;

        metrics.totalSuccess += 1;
        recordLatency(coreLatencyMs);

        return res.json({
            reply,
            latencyMs: coreLatencyMs,
            roundTripMs: totalRoundTripMs,
            attempts,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        next(error);
    }
});

// ==============================
// 40. ROUTES — YOUTUBE
// ==============================

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
            publishedAt,
            duration: parseISODuration(contentDetails.duration),
            views: parseInt(stats.viewCount, 10) || 0,
            likes: parseInt(stats.likeCount, 10) || 0,
            comments: parseInt(stats.commentCount, 10) || 0,
            platform: 'youtube',
        };

        metrics.totalSuccess += 1;
        recordLatency(Date.now() - requestStart);

        log('info', 'YouTube fetch OK', { videoId, title: result.title });

        return res.json(result);
    } catch (error) {
        next(error);
    }
});

// ==============================
// 41. ROUTES — TIKTOK
// ==============================

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

        log('info', 'TikTok fetch OK', { videoId, title: truncate(result.title, 50) });

        return res.json(result);
    } catch (error) {
        next(error);
    }
});

// ==============================
// 42. ROUTES — RESEARCH
// ==============================

app.post('/api/research', researchRateLimiter, async (req, res, next) => {
    const requestStart = Date.now();
    metrics.totalRequests += 1;
    metrics.totalResearchRequests += 1;

    try {
        const { query } = req.body || {};

        if (!query || typeof query !== 'string' || !query.trim()) {
            metrics.totalErrors += 1;
            recordError('Empty research query');
            return res.status(400).json({ error: 'חסרה שאלה' });
        }

        const cleanQuery = query.trim();

        if (cleanQuery.length > CONFIG.maxResearchQueryLength) {
            metrics.totalErrors += 1;
            recordError('Research query too long');
            return res.status(400).json({ error: `השאלה ארוכה מדי (מקסימום ${CONFIG.maxResearchQueryLength} תווים)` });
        }

        log('info', `Research query: "${cleanQuery}"`);

        const englishQuery = await translateToEnglish(cleanQuery);

        const papers = await searchAllSources(englishQuery, CONFIG.researchMaxPerSource);

        if (!papers.length) {
            return res.json({
                query: cleanQuery,
                englishQuery,
                summary: {
                    verdict: 'לא נמצאו מחקרים',
                    summary: `חיפשתי "${englishQuery}" ב-11 מאגרים מדעיים ולא מצאתי מחקרים רלוונטיים. נסה לנסח אחרת — למשל "${englishQuery}" באנגלית.`,
                    myth: '',
                    limitations: '',
                    fallback: true,
                    wasTranslated: englishQuery !== cleanQuery,
                },
                papers: [],
                totalFound: 0,
                searchTimeMs: Date.now() - requestStart,
            });
        }

        let analysis;
        try {
            analysis = await analyzeResearchWithAI(cleanQuery, englishQuery, papers);
        } catch (aiError) {
            log('warn', 'AI analysis failed — using fallback', { err: aiError.message });
            analysis = buildFallbackSummary(cleanQuery, englishQuery, papers);
        }

        const totalRoundTripMs = Date.now() - requestStart;
        metrics.totalSuccess += 1;
        recordLatency(totalRoundTripMs);

        log('info', 'Research OK', {
            query: cleanQuery,
            englishQuery,
            totalPapers: papers.length,
            fallback: analysis.fallback,
            roundTripMs: totalRoundTripMs,
        });

        return res.json({
            query: cleanQuery,
            englishQuery,
            summary: analysis,
            papers,
            totalFound: papers.length,
            sources: [...new Set(papers.map((p) => p.source))],
            searchTimeMs: totalRoundTripMs,
        });
    } catch (error) {
        next(error);
    }
});

// ==============================
// 43. ROUTES — RESEARCH CHAT (AI Analyst)
// ==============================

app.post('/api/research-chat', apiRateLimiter, async (req, res, next) => {
    const requestStart = Date.now();
    metrics.totalRequests += 1;
    metrics.totalResearchChatRequests += 1;

    try {
        const { query, papers, history: rawHistory } = req.body || {};

        if (!query || typeof query !== 'string' || !query.trim()) {
            metrics.totalErrors += 1;
            recordError('Empty research chat query');
            return res.status(400).json({ error: 'חסרה שאלה' });
        }

        if (!Array.isArray(papers) || papers.length === 0) {
            metrics.totalErrors += 1;
            recordError('No papers in research chat');
            return res.status(400).json({ error: 'אין מחקרים לשאול עליהם' });
        }

        const cleanQuery = query.trim();
        if (cleanQuery.length > 500) {
            metrics.totalErrors += 1;
            recordError('Research chat query too long');
            return res.status(400).json({ error: 'השאלה ארוכה מדי (מקסימום 500 תווים)' });
        }

        log('info', `Research chat: "${truncate(cleanQuery, 80)}" (${papers.length} papers available)`);

        const scored = papers.map((p) => ({
            paper: p,
            score: scorePaperRelevance(p, cleanQuery),
        }));
        scored.sort((a, b) => b.score - a.score);
        const topPapers = scored.slice(0, CONFIG.researchChatContextLimit).map((s) => s.paper);

        const papersText = topPapers.map((p, i) => {
            const cite = p.citedBy ? ` [${p.citedBy} citations]` : '';
            const source = p.source ? ` [${p.source}]` : '';
            const year = p.year ? ` (${p.year})` : '';
            const snippet = truncate(p.abstract || 'תקציר לא זמין', 400);
            return `[${i + 1}] "${p.title}"${year}${cite}${source}\n${snippet}\n`;
        }).join('\n');

        const userPrompt = `## השאלה שלי:
${cleanQuery}

## המחקרים הרלוונטיים (${topPapers.length} מתוך ${papers.length} שנמצאו):

${papersText}

---

ענה על השאלה שלי בהתבסס על המחקרים שלמעלה.`;

        const normalizedHistory = Array.isArray(rawHistory)
            ? rawHistory.map((h) => ({
                role: h?.role === 'assistant' ? 'jarvis' : 'user',
                text: h?.content || h?.text || '',
            }))
            : [];

        const history = sanitizeHistory(normalizedHistory);
                const mode = (req.body?.mode === 'papers') ? 'papers' : 'hybrid';
        const systemPromptToUse = (mode === 'papers')
            ? RESEARCH_CHAT_SYSTEM_PROMPT
            : RESEARCH_CHAT_HYBRID_SYSTEM_PROMPT;


        const { reply, coreLatencyMs, attempts } = await callGemini({
                       systemInstruction: systemPromptToUse,
            contents: buildConversationContents(history, userPrompt),
            temperature: 0.5,
            maxOutputTokens: 2048,
            timeoutMs: CONFIG.geminiTimeoutMs,
            retries: CONFIG.defaultRetries,
        });

        const totalRoundTripMs = Date.now() - requestStart;
        metrics.totalSuccess += 1;
        recordLatency(coreLatencyMs);

        log('info', 'Research chat OK', {
            usedPapers: topPapers.length,
            availablePapers: papers.length,
            coreLatencyMs,
            totalRoundTripMs,
        });

        const usedPapers = topPapers.map((p, i) => ({
            index: i + 1,
            title: truncate(p.title, 120),
            source: p.source || '',
            year: p.year || '',
            url: p.url || '',
            doi: p.doi || '',
        }));

        return res.json({
            reply,
           mode,
            usedPapers,
            usedPapersCount: topPapers.length,
            availablePapersCount: papers.length,
            latencyMs: coreLatencyMs,
            roundTripMs: totalRoundTripMs,
            attempts,
            timestamp: new Date().toISOString(),
        });

    } catch (error) {
        next(error);
    }
});

// ==============================
// 44. ROUTES — ANALYTICS CHAT
// ==============================

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

        const analyticsBlock = videos.length
            ? `
### סיכום כללי
- סרטונים: ${summary.totalVideos}
- צפיות: ${(summary.totalViews || 0).toLocaleString('he-IL')}
- לייקים: ${summary.totalLikes || 0}
- תגובות: ${summary.totalComments || 0}
- מנויים: ${summary.totalSubscribers || 0}
- יחס לייקים: ${summary.ratio || 0}%
- יחס תגובות: ${summary.commentRatio || 0}%

### פירוט הסרטונים (${videos.length})
${videos.slice(0, 30).map((v) => {
    const vr = v.views ? ((v.likes || 0) / v.views * 100).toFixed(2) : '0';
    return `**${truncate(v.title, 80)}** [${v.platform || 'youtube'}] — ${v.views || 0} צפיות, ${v.likes || 0} לייקים (${vr}%), ${v.comments || 0} תגובות, ${v.duration || 0}s`;
}).join('\n')}
`
            : '\n### אין נתוני אנליטיקס זמינים כרגע.\n';

        metrics.totalKnowledgeLookups += 1;
        const personalChunks = searchKnowledge(userMessage);
        let personalContext = '';

        if (personalChunks.length > 0) {
            metrics.totalKnowledgeHits += 1;
            personalContext = `\n\n### ידע אישי רלוונטי:\n${personalChunks.map((c) => `- ${c.text}`).join('\n')}`;
        }

        const combinedSystemPrompt = `${ANALYTICS_SYSTEM_PROMPT}\n\n## נתוני האנליטיקס של המשתמש:\n${analyticsBlock}\n${personalContext}`;

        const normalizedHistory = Array.isArray(rawHistory)
            ? rawHistory.map((h) => ({
                role: h?.role === 'assistant' ? 'jarvis' : 'user',
                text: h?.content || h?.text || '',
            }))
            : [];

        const history = sanitizeHistory(normalizedHistory);
        metrics.totalHistoryMessagesSent += history.length;

        const { reply, coreLatencyMs, attempts } = await callGemini({
            systemInstruction: combinedSystemPrompt,
            contents: buildConversationContents(history, userMessage),
            temperature: 0.6,
            maxOutputTokens: 1500,
            timeoutMs: CONFIG.geminiTimeoutMs,
            retries: CONFIG.defaultRetries,
        });

        const totalRoundTripMs = Date.now() - requestStart;
        metrics.totalSuccess += 1;
        recordLatency(coreLatencyMs);

        log('info', 'Analytics chat OK', {
            videos: videos.length,
            historyUsed: history.length,
            personalChunks: personalChunks.length,
            coreLatencyMs,
        });

        return res.json({
            reply,
            latencyMs: coreLatencyMs,
            roundTripMs: totalRoundTripMs,
            attempts,
            historyUsed: history.length,
            knowledgeUsed: personalChunks.length > 0,
            knowledgeChunks: personalChunks.length,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        next(error);
    }
});

// ==============================
// 45. ROUTES — NUTRITION ANALYZE
// ==============================

app.post('/api/nutrition/analyze', apiRateLimiter, async (req, res, next) => {
    const requestStart = Date.now();
    metrics.totalRequests += 1;
    metrics.totalNutritionRequests += 1;

    try {
        const { meals } = req.body || {};

        if (!meals) {
            metrics.totalErrors += 1;
            recordError('Missing meals in nutrition request');
            return res.status(400).json({ error: 'חסרות ארוחות לניתוח' });
        }

        const mealsArray = Array.isArray(meals) ? meals : [meals];
        const cleanMeals = mealsArray
            .map((m) => {
                if (typeof m === 'string') return m.trim();
                if (m && typeof m.text === 'string') return m.text.trim();
                return '';
            })
            .filter((m) => m.length > 0)
            .slice(0, 30);

        if (cleanMeals.length === 0) {
            metrics.totalErrors += 1;
            recordError('Empty meals array after cleanup');
            return res.status(400).json({ error: 'אין ארוחות לניתוח' });
        }

        log('info', `Nutrition analysis: ${cleanMeals.length} meals`);

        const mealsList = cleanMeals
            .map((m, i) => `${i + 1}. ${m}`)
            .join('\n');

        const userPrompt = `נתח את הארוחות הבאות:

${mealsList}

החזר JSON עם המבנה הזה בדיוק:

{
  "totalCalories": <number, קלוריות סה"כ>,
  "totalProtein": <number, גרם חלבון סה"כ>,
  "totalCarbs": <number, גרם פחמימות סה"כ>,
  "totalFat": <number, גרם שומן סה"כ>,
  "totalSugar": <number, גרם סוכר סה"כ>,
  "totalFiber": <number, גרם סיבים סה"כ>,
  "items": [
    {
      "name": "<שם המאכל בעברית>",
      "amount": "<כמות: למשל '2 ביצים', '200 גרם עוף'>",
      "calories": <number>,
      "protein": <number>,
      "carbs": <number>,
      "fat": <number>,
      "sugar": <number>,
      "fiber": <number>
    }
  ],
  "vitamins": [
    { "name": "<שם הויטמין בעברית: למשל 'ויטמין C'>", "percent": <number, אחוז RDA יומי>, "source": "<מאיזה מאכל>" }
  ],
  "minerals": [
    { "name": "<שם המינרל בעברית: למשל 'ברזל'>", "percent": <number, אחוז RDA יומי>, "source": "<מאיזה מאכל>" }
  ],
  "aminoAcids": [
    { "name": "<שם חומצת האמינו: למשל 'Leucine'>", "present": <true/false> }
  ],
  "insights": "<משפט אחד קצר: התובנה הכי חשובה על הארוחה הזו>"
}

חשוב:
- כל המספרים חייבים להיות מספריים (בלי יחידות).
- אם מאכל לא זוהה — השתמש ב-"לא זוהה" כשם, עם ערכי 0.
- vitamins ו-minerals — רק אלה שבולטים (percent >= 5).
- aminoAcids — 9 חומצות חיוניות: Histidine, Isoleucine, Leucine, Lysine, Methionine, Phenylalanine, Threonine, Tryptophan, Valine.`;

        const { data, coreLatencyMs, attempts } = await callGeminiJSON({
            systemInstruction: NUTRITION_SYSTEM_PROMPT,
            userPrompt,
            temperature: 0.3,
            maxOutputTokens: 8192,
            timeoutMs: CONFIG.geminiTimeoutMs,
            retries: CONFIG.defaultRetries,
        });

        const totalRoundTripMs = Date.now() - requestStart;
        metrics.totalSuccess += 1;
        recordLatency(coreLatencyMs);

        log('info', 'Nutrition OK', {
            meals: cleanMeals.length,
            items: Array.isArray(data.items) ? data.items.length : 0,
            coreLatencyMs,
            totalRoundTripMs,
            attempts,
        });

        return res.json({
            analysis: data,
            latencyMs: coreLatencyMs,
            roundTripMs: totalRoundTripMs,
            attempts,
            mealsCount: cleanMeals.length,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        next(error);
    }
});

// ==============================
// 46. ROUTES — TRAINING
// ==============================



// ==============================
// 47. ROUTES — TRAINING COACH
// ==============================

const TRAINING_COACH_SYSTEM_PROMPT = `אתה מאמן קליסטניקס מומחה בגובה העיניים. אתה עונה על שאלות של מתבגר בן 15 וחמישה חודשים שמתאמן בקליסטניקס 4-5 פעמים בשבוע ומטרתו Full Planche + Front Lever.

## כללי התנהגות:
1. ענה בעברית, ישיר, חד, מקצועי. אפס "יאס-מן" ואפס קלישאות.
2. כשאתה מסביר על תרגיל ספציפי או טכניקה — תן 3-5 משפטים של הסבר טכני.
3. אם רלוונטי — תגיד בסוף: "🎥 סרטוני הדגמה זמינים למטה". המערכת תוסיף אותם.
4. אם שואל על תרגיל ספציפי — תן:
   - מה התרגיל (משפט)
   - איך עושים נכון (2-3 משפטים)
   - טעויות נפוצות (2-3)
   - אזהרות בטיחות לגיל 15 אם רלוונטי
5. אם שואל על בטיחות — היה זהיר. Full Planche בגיל 15 מסוכן.
6. אם שואל על מנוחה / סטים / חזרות — תן מספרים ספציפיים.
7. אם שואל משהו לא קשור לקליסטניקס — אמור: "אני מאמן קליסטניקס, לא יכול לעזור עם זה".
8. השתמש ב-Markdown: **מודגש**, רשימות עם -, קוד עם \`\`.
9. אורך: 3-6 פסקאות קצרות.
10. לעולם אל תמציא קישורים ליוטיוב — המערכת תוסיף אותם אוטומטית.

## שפה: עברית בלבד.`;

app.post('/api/training/coach', apiRateLimiter, async (req, res, next) => {
    const requestStart = Date.now();
    metrics.totalRequests += 1;

    try {
        const { query, history: rawHistory } = req.body || {};

        if (!query || typeof query !== 'string' || query.trim().length < 2) {
            metrics.totalErrors += 1;
            recordError('Empty coach query');
            return res.status(400).json({ error: 'חסרה שאלה' });
        }

        const cleanQuery = query.trim();
        if (cleanQuery.length > 500) {
            metrics.totalErrors += 1;
            recordError('Coach query too long');
            return res.status(400).json({ error: 'השאלה ארוכה מדי (מקסימום 500 תווים)' });
        }

        log('info', `Training coach: "${truncate(cleanQuery, 80)}"`);

        const wantsVideo = /סרטון|וידאו|youtube|יוטיוב|הדגמה|איך עושים|איך לעשות|טכניקה/i.test(cleanQuery);

        const geminiPromise = (async () => {
            const normalizedHistory = Array.isArray(rawHistory)
                ? rawHistory.map((h) => ({
                    role: h?.role === 'assistant' ? 'jarvis' : 'user',
                    text: h?.content || h?.text || '',
                }))
                : [];

            const history = sanitizeHistory(normalizedHistory);

            const userPrompt = wantsVideo
                ? `${cleanQuery}\n\n(המשתמש רוצה סרטון הדגמה. תגיד בסוף: "🎥 סרטוני הדגמה זמינים למטה")`
                : cleanQuery;

            return callGemini({
                systemInstruction: TRAINING_COACH_SYSTEM_PROMPT,
                contents: buildConversationContents(history, userPrompt),
                temperature: 0.5,
                maxOutputTokens: 1800,
                timeoutMs: CONFIG.geminiTimeoutMs,
                retries: CONFIG.defaultRetries,
            });
        })();

        const youtubePromise = wantsVideo
            ? searchYouTubeVideos(cleanQuery, 4).catch((err) => {
                log('warn', 'YouTube search failed in coach:', err.message);
                return [];
            })
            : Promise.resolve([]);

        const [geminiResult, videos] = await Promise.all([geminiPromise, youtubePromise]);

        const totalRoundTripMs = Date.now() - requestStart;
        metrics.totalSuccess += 1;
        recordLatency(geminiResult.coreLatencyMs);

        log('info', 'Training coach OK', {
            coreLatencyMs: geminiResult.coreLatencyMs,
            totalRoundTripMs,
            videos: videos.length,
            wantsVideo,
            attempts: geminiResult.attempts,
        });

        return res.json({
            reply: geminiResult.reply,
            videos,
            latencyMs: geminiResult.coreLatencyMs,
            roundTripMs: totalRoundTripMs,
            attempts: geminiResult.attempts,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        next(error);
    }
});

async function searchYouTubeVideos(query, maxResults = 4) {
    if (!CONFIG.youtubeApiKey) {
        log('warn', 'YouTube search skipped — no API key');
        return [];
    }

    const cleanQuery = String(query || '').trim().slice(0, 200);
    if (!cleanQuery) return [];

    try {
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(cleanQuery)}&type=video&maxResults=${maxResults}&key=${CONFIG.youtubeApiKey}&relevanceLanguage=he&safeSearch=moderate`;
        const searchRes = await fetchWithTimeout(searchUrl, { method: 'GET' }, CONFIG.youtubeTimeoutMs);
        if (!searchRes.ok) {
            log('warn', `YouTube search failed: ${searchRes.status}`);
            return [];
        }

        const searchData = await searchRes.json();
        if (searchData.error) {
            log('warn', `YouTube API error: ${searchData.error.message}`);
            return [];
        }

        const items = searchData?.items || [];
        if (!items.length) return [];

        const videoIds = items
            .map((it) => it?.id?.videoId)
            .filter(Boolean);

        if (!videoIds.length) return [];

        const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${videoIds.join(',')}&key=${CONFIG.youtubeApiKey}`;
        const detailsRes = await fetchWithTimeout(detailsUrl, { method: 'GET' }, CONFIG.youtubeTimeoutMs);

        let statsById = {};
        if (detailsRes.ok) {
            try {
                const detailsData = await detailsRes.json();
                for (const v of (detailsData?.items || [])) {
                    statsById[v.id] = v.statistics || {};
                }
            } catch (e) {
                // ignore
            }
        }

        const videos = items.map((item) => {
            const videoId = item?.id?.videoId || '';
            const snippet = item?.snippet || {};
            const stats = statsById[videoId] || {};

            const thumbs = snippet.thumbnails || {};
            const thumb = thumbs.medium?.url || thumbs.default?.url || thumbs.high?.url || '';

            return {
                id: videoId,
                title: snippet.title || 'ללא כותרת',
                channel: snippet.channelTitle || '',
                thumbnail: thumb,
                url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : '',
                views: parseInt(stats.viewCount, 10) || 0,
            };
        }).filter((v) => v.id && v.url);

        log('info', `YouTube search: ${videos.length} videos for "${truncate(cleanQuery, 60)}"`);
        return videos;
    } catch (err) {
        log('warn', `YouTube search error: ${err.message}`);
        return [];
    }
}


app.post('/api/training/analyze', apiRateLimiter, async (req, res, next) => {
    const requestStart = Date.now();
    metrics.totalRequests += 1;

    try {
        const { days } = req.body || {};

        if (!Array.isArray(days) || days.length === 0) {
            metrics.totalErrors += 1;
            recordError('Empty training days');
            return res.status(400).json({ error: 'אין היסטוריית אימונים לניתוח' });
        }

        const recentDays = days.slice(0, 10);

        const daysText = recentDays.map((d) => {
            const workouts = Array.isArray(d.workouts) ? d.workouts : [];
            const workoutLines = workouts.map((w) => {
                const exercises = Array.isArray(w.exercises) ? w.exercises : [];
                const exLines = exercises.map((ex) => {
                    const actual = ex.actual ? ` (בפועל: ${ex.actual})` : '';
                    const done = ex.done ? '✅' : '⬜';
                    return `    ${done} ${ex.name} — ${ex.sets}x${ex.reps}${actual}`;
                }).join('\n');
                return `  • ${w.title} (${w.durationMinutes || 0} דק׳, ${w.time || ''})\n${exLines}`;
            }).join('\n');
            return `📅 ${d.date}:\n${workoutLines || '  (אין אימונים)'}`;
        }).join('\n\n');

        const totalWorkouts = recentDays.reduce((sum, d) => sum + (d.workouts?.length || 0), 0);

        log('info', `Training analyze: ${recentDays.length} days, ${totalWorkouts} workouts`);

        const userPrompt = `## היסטוריית אימונים (${recentDays.length} ימים אחרונים, סה"כ ${totalWorkouts} אימונים):

${daysText}

## המשימה:
נתח את ההתקדמות לפי הפורמט שהוגדר. היה ספציפי ומבוסס מספרים.`;

        const { reply, coreLatencyMs, attempts } = await callGemini({
            systemInstruction: TRAINING_ANALYZE_SYSTEM_PROMPT,
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            temperature: 0.4,
            maxOutputTokens: 2000,
            timeoutMs: CONFIG.geminiTimeoutMs,
            retries: CONFIG.defaultRetries,
        });

        const totalRoundTripMs = Date.now() - requestStart;
        metrics.totalSuccess += 1;
        recordLatency(coreLatencyMs);

        log('info', 'Training analyze OK', {
            days: recentDays.length,
            coreLatencyMs,
            totalRoundTripMs,
            attempts,
        });

        return res.json({
            analysis: reply,
            daysAnalyzed: recentDays.length,
            workoutsAnalyzed: totalWorkouts,
            latencyMs: coreLatencyMs,
            roundTripMs: totalRoundTripMs,
            attempts,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        next(error);
    }
});

// ==============================
// 45.5. TRAINING — GENERATE WORKOUT
// ==============================

const TRAINING_GENERATE_SYSTEM_PROMPT = [
    'אתה מאמן קליסטניקס אישי של Ori, בן 15 וחמישה חודשים מאזור השומרון.',
    '',
    '═══════════════════════════════════════════════════════════',
    '## זהות המשתמש — ELITE',
    '═══════════════════════════════════════════════════════════',
    '',
    '### כוח דינמי',
    '- ~10 עליות כוח (Muscle Ups) נקיות',
    '- ~70 שכיבות סמיכה בטכניקה נקייה',
    '',
    '### אלמנטים סטטיים',
    '- Straddle Planche',
    '- עמידות ידיים מלאות (כולל עמידת ידיים מקסיקנית)',
    '- שכיבות סמיכה ב-90 מעלות (90-degree push-ups)',
    '- Front Lever — מחזיק 4 שניות, שואף ל-5',
    '- Back Lever',
    '- One Arm Back Lever',
    '',
    '### מעברים ותרגילי פרס',
    '- Presses לפלאנץ',
    '- Presses לעמידות ידיים',
    '- Negatives ב-90 מעלות',
    '- 360 (Ginger)',
    '- Ginger Double 360',
    '',
    '### ציוד זמין',
    '- מקבילים נמוכים וגבוהים',
    '- משקולות חופשיות',
    '- רצועת התנגדות 30 ק"ג',
    '- מגנזיום',
    '',
    '### ציוד שאין',
    '- טבעות',
    '- אפוד משקל',
    '',
    '### מטרות ארוכות טווח',
    '- Full Planche',
    '- Front Lever 5 שניות',
    '- Handstand (שיפור)',
    '- חיטוב',
    '',
    '═══════════════════════════════════════════════════════════',
    '## מילון מושגי קליסטניקס — 5 קטגוריות',
    '═══════════════════════════════════════════════════════════',
    '',
    'כשהמשתמש מבקש אימון בקטגוריה כלשהי — הבן את ההגדה המלאה שלה.',
    '',
    '### 1. תרגילים סטטיים (Static / Isometrics)',
    'מה זה: תרגילים שבהם הגוף נמצא במצב קפוא, ללא תנועה במפרקים, אבל שרירי הליבה והשלד עובדים תחת עומס קיצוני ועצום כדי להילחם בכוח הכבידה.',
    'דוגמאות של Ori: Front Lever (מחזיק 4 שניות), Straddle Planche, Back Lever, L-sit, One Arm Back Lever, Handstand.',
    'המטרה: בניית כוח גידים אדיר, יציבות מוחלטת ושליטה אבסולוטית במרחב בלי לייצר מומנטום.',
    '',
    '### 2. תרגילי פוש (Push / Push Elements)',
    'מה זה: כל התרגילים שבהם דוחפים את הגוף הרחק מהקרקע, מהמקבילים או מהמוט (שרירי חזה, כתפיים קדמיות, יד אחורית).',
    'דוגמאות של Ori: 70 שכיבות סמיכה, מקבילים, שכיבות סמיכה בעמידת ידיים (Handstand Push-ups), שכיבות סמיכה ב-90 מעלות.',
    'המטרה: פיתוח כוח דחיפה נפיץ וחזק בפלג הגוף העליון.',
    '',
    '### 3. תרגילי פול (Pull / Pull Elements)',
    'מה זה: כל התרגילים שבהם מושכים את הגוף אל עבר המוט, הטבעות או הקרקע (שרירי גב, בייספס, כתף אחורית).',
    'דוגמאות של Ori: עליות כוח (Muscle Ups), Front Lever, Back Lever, One Arm Back Lever.',
    'המטרה: בניית עוצמה אדירה בגב ובידיים, ויכולת שליטה במשיכה משקל גוף מלא.',
    '',
    '### 4. תנועה דינמית / כוח דינמי (Dynamic & Dynamic Strength)',
    'מה זה: תנועה שזורמת לאורך טווח תנועה מלא (Range of Motion), שדורשת מעבר חלק בין מצבים שונים, לעיתים קרובות תוך כדי שחרור אחיזה, סיבובים במרחב או תאוצה.',
    'דוגמאות של Ori: 10 עליות כוח (עם אלמנט דינמי של מעבר מהמשיכה לדחיפה), 360, ג׳ינג׳ר דאבל 360.',
    'המטרה: שילוב של קואורדינציה, אגירת תנע (Momentum) או שליטה אבסולוטית בכוח מתפרץ תוך כדי תנועה.',
    '',
    '### 5. באלאנס (Balance / Equilibrium)',
    'מה זה: היכולת לשמור על מרכז הכובד (Center of Mass) של הגוף בדיוק מעל בסיס התמיכה, תוך כדי הפעלת תיקונים מיקרו-מוסקולריים בלתי פוסקים בשיווי משקל.',
    'דוגמאות של Ori: עמידת ידיים (Handstand), עמידת ידיים מקסיקנית, One Arm Handstand Drills.',
    'המטרה: שליטה עצבית-שרירית מוחלטת, פרופריוצפציה (חוש המיקום במרחב) ואיזון טוטאלי של כל שרירי הגוף מבהונות הרגליים ועד קצות האצבעות בידיים.',
    '',
    '═══════════════════════════════════════════════════════════',
    '## חוקי הבנה של בקשות',
    '═══════════════════════════════════════════════════════════',
    '',
    '### קרא מילה במילה',
    '- קרא את הבקשה של Ori **מילה במילה**.',
    '- אם הוא כתב "באלאנס" — תן תרגילי באלאנס (One Arm Handstand, weight shifts, equilibrium drills).',
    '- אם הוא כתב "כוח דינמי" — תן תרגילי כוח דינמי (Muscle Ups, 360s, explosive).',
    '- אם הוא כתב "סטטי" — תן תרגילי isometric (Planche, Front Lever, L-sit).',
    '- **אל תחליף מילים דומות**. באלאנס ≠ עמידות ידיים. כוח דינמי ≠ סטטי. פוש ≠ פול.',
    '',
    '### שילוב קטגוריות — חשוב!',
    '- אם Ori ביקש קטגוריה אחת — תן תרגילים **רק** מהקטגוריה הזו.',
    '- אם Ori ביקש 2 קטגוריות — חלק שווה: 50% / 50%.',
    '- אם Ori ביקש 3 קטגוריות — 33% / 33% / 33%.',
    '- **אל תיתן 6 תרגילים מכולם מקטגוריה אחת** כשהמשתמש ביקש שילוב.',
    '',
    '### דוגמאות קונקרטיות',
    '- "אימון באלאנס + עמידות יד" → 3 תרגילי באלאנס (One Arm Handstand Drills, Weight Shifts, Finger Balance) + 3 תרגילי עמידות ידיים (Handstand Press, Mexican Handstand, Wall Handstand).',
    '- "כוח דינמי בפול" → Muscle Ups, Explosive Pull-ups, 360s, Muscle Up Transitions.',
    '- "סטטי + פוש" → Straddle Planche, 90-degree Push-ups, Planche Leans, Tuck Planche.',
    '',
    '═══════════════════════════════════════════════════════════',
    '## המשימה',
    '═══════════════════════════════════════════════════════════',
    '',
    'צור אימון מותאם אישית לבקשה של Ori. האימון ברמת ELITE — לא למתחילים, לא לבינוניים.',
    '',
    '═══════════════════════════════════════════════════════════',
    '## פורמט פלט — חובה JSON בלבד',
    '═══════════════════════════════════════════════════════════',
    '',
    'החזר JSON תקני בלבד. אל תוסיף טקסט לפני או אחרי. אל תוסיף סימוני code block.',
    'המבנה חייב להיות בדיוק כך:',
    '{',
    '  "title": "שם קצר לאימון בעברית",',
    '  "durationMinutes": 40,',
    '  "exercises": [',
    '    {',
    '      "name": "שם התרגיל בעברית",',
    '      "sets": 4,',
    '      "reps": "8-10",',
    '      "rest": "90s",',
    '      "notes": "הערה קצרה על טכניקה"',
    '    }',
    '  ]',
    '}',
    '',
    '═══════════════════════════════════════════════════════════',
    '## חוקים סופיים',
    '═══════════════════════════════════════════════════════════',
    '',
    '1. 6-10 תרגילים לאימון קצר (40 דק), 10-14 לארוך (90 דק).',
    '2. סדר הגיוני: חימום קצר → תרגילי בסיס כבדים → תרגילי עזר → ליבה.',
    '3. התאם את הבקשה של Ori **בדיוק** — קרא מילה במילה.',
    '4. השתמש בשמות תרגילי קליסטניקס ELITE אמיתיים.',
    '5. הערות בעברית, קצרות (עד 12 מילים), עם דגש טכני.',
    '6. כל החזרות כ-string ("8-10", "AMRAP", "4s hold", "5s negative").',
    '7. התאם תרגילים לפי הציוד שיש לו (מקבילים, משקולות, רצועה, מגנזיום) — בלי טבעות, בלי אפוד משקל.',
    '8. אם הבקשה כללית מדי — בחר תרגילי ELITE שמתאימים למטרות שלו (Planche, Front Lever, Handstand).',
    '9. **בכל שילוב קטגוריות — חלק שווה.** אל תיתן הכל מקטגוריה אחת.',
].join('\n');

app.post('/api/training/generate', apiRateLimiter, async (req, res, next) => {
    const requestStart = Date.now();
    metrics.totalRequests += 1;

    try {
        const { request, mode } = req.body || {};

        if (!request || typeof request !== 'string' || request.trim().length < 2) {
            metrics.totalErrors += 1;
            recordError('Empty training request');
            return res.status(400).json({ error: 'חסרה בקשה ליצירת אימון' });
        }

        const cleanRequest = request.trim();
        if (cleanRequest.length > 500) {
            metrics.totalErrors += 1;
            recordError('Training request too long');
            return res.status(400).json({ error: 'הבקשה ארוכה מדי (מקסימום 500 תווים)' });
        }

        const cleanMode = (mode === 'long') ? 'long' : 'short';
        const durationHint = cleanMode === 'long' ? '90 דקות (אימון ארוך)' : '40 דקות (אימון קצר)';

        log('info', `Training generate: mode=${cleanMode}, request="${truncate(cleanRequest, 80)}"`);

        const userPrompt = `## בקשת המשתמש
${cleanRequest}

## אורך מבוקש
${durationHint}

צור אימון מתאים. החזר JSON בלבד.`;

        const { reply, coreLatencyMs, attempts } = await callGemini({
            systemInstruction: TRAINING_GENERATE_SYSTEM_PROMPT,
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            temperature: 0.7,
            maxOutputTokens: 2500,
            timeoutMs: CONFIG.geminiTimeoutMs,
            retries: CONFIG.defaultRetries,
        });

        // Parse JSON reply from Gemini
        let workout = null;
        try {
            let cleaned = (reply || '').trim();
            cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace > firstBrace) {
                cleaned = cleaned.slice(firstBrace, lastBrace + 1);
            }
            workout = JSON.parse(cleaned);
        } catch (parseErr) {
            log('warn', 'Training generate: failed to parse JSON', parseErr.message);
            log('warn', 'Raw reply:', truncate(reply || '', 500));
        }

        if (!workout || !Array.isArray(workout.exercises) || workout.exercises.length === 0) {
            metrics.totalErrors += 1;
            recordError('Training generate: invalid workout JSON');
            return res.status(502).json({
                error: 'לא הצלחתי לייצר אימון תקין. נסה שוב.',
            });
        }

        const normalized = {
            title: typeof workout.title === 'string' ? workout.title : 'אימון',
            durationMinutes: typeof workout.durationMinutes === 'number'
                ? workout.durationMinutes
                : (cleanMode === 'long' ? 90 : 40),
            exercises: workout.exercises.map((ex) => ({
                name: typeof ex.name === 'string' ? ex.name : 'תרגיל',
                sets: typeof ex.sets === 'number' ? ex.sets : (parseInt(ex.sets, 10) || 3),
                reps: ex.reps != null ? String(ex.reps) : '8-10',
                rest: ex.rest != null ? String(ex.rest) : '60s',
                notes: typeof ex.notes === 'string' ? ex.notes : '',
            })),
        };

        const totalRoundTripMs = Date.now() - requestStart;
        metrics.totalSuccess += 1;
        recordLatency(coreLatencyMs);

        log('info', 'Training generate OK', {
            exercises: normalized.exercises.length,
            coreLatencyMs,
            totalRoundTripMs,
            attempts,
        });

        return res.json({
            workout: normalized,
            latencyMs: coreLatencyMs,
            roundTripMs: totalRoundTripMs,
            attempts,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        next(error);
    }
});


// ==============================
// 46. ROUTES — MEGA PROMPT
// ==============================

app.get('/api/mega-prompt', async (req, res, next) => {
    try {
        const uptimeSeconds = Math.floor((Date.now() - metrics.startedAt) / 1000);
        const mem = process.memoryUsage();
        const now = new Date().toISOString();

        const knowledgeFilesList = Array.from(knowledge.files.values())
            .map((f) => `- knowledge/${f.name} — ${f.chunks} chunks, ${f.chars} תווים`)
            .join('\n');

        const metricsSnapshot = {
            uptime: uptimeSeconds,
            environment: CONFIG.environment,
            model: CONFIG.geminiModel,
            totalRequests: metrics.totalRequests,
            totalSuccess: metrics.totalSuccess,
            totalErrors: metrics.totalErrors,
            totalVisionRequests: metrics.totalVisionRequests,
            totalYoutubeRequests: metrics.totalYoutubeRequests,
            totalTiktokRequests: metrics.totalTiktokRequests,
            totalResearchRequests: metrics.totalResearchRequests,
            totalResearchChatRequests: metrics.totalResearchChatRequests,
            totalTranslationRequests: metrics.totalTranslationRequests,
            totalNutritionRequests: metrics.totalNutritionRequests,
            totalPapersFetched: metrics.totalPapersFetched,
            totalKnowledgeLookups: metrics.totalKnowledgeLookups,
            totalKnowledgeHits: metrics.totalKnowledgeHits,
            totalRateLimitHits: metrics.totalRateLimitHits,
            totalHighDemandHits: metrics.totalHighDemandHits,
            totalHistoryMessagesSent: metrics.totalHistoryMessagesSent,
            lastLatencyMs: metrics.lastLatencyMs,
            avgLatencyMs: metrics.avgLatencyMs,
            perSourceHits: metrics.perSourceHits,
            knowledgeFiles: knowledge.files.size,
            knowledgeChunks: knowledge.chunks.length,
            knowledgeVocab: knowledge.vocab.size,
        };

        const sections = [
            '# J.A.R.V.I.S — PROJECT MEGA-PROMPT',
            `# נוצר אוטומטית: ${now}`,
            `# Uptime: ${formatUptime(uptimeSeconds)} | Memory: ${(mem.rss / 1024 / 1024).toFixed(1)} MB`,
            '',
            '## הקשר כללי',
            '',
            'אני מפתח פרויקט J.A.R.V.I.S — עוזר AI אישי בעברית, בנוי על Node.js/Express + Gemini API.',
            '',
            '**סטאק טכנולוגי:**',
            '- Backend: Node.js + Express',
            `- AI: Google Gemini API (מודל: ${CONFIG.geminiModel})`,
            '- Frontend: Vanilla JS + HTML + CSS',
            '- אחסון: GitHub + Render',
            `- Environment: ${CONFIG.environment}`,
            '',
            '## Endpoints זמינים',
            '',
            '### צ\'אט ו-Vision',
            '- POST /api/ask — צ\'אט עם Gemini + history + BM25 knowledge',
            '- POST /api/vision — ניתוח תמונות',
            '- POST /api/analytics-chat — צ\'אט על נתוני Analytics',
            '',
            '### ניתוח תוכן',
            '- POST /api/analyze — ניתוח אנליטי של סרטונים',
            '- POST /api/youtube/fetch — שליפת נתוני YouTube',
            '- POST /api/tiktok/fetch — שליפת נתוני TikTok',
            '',
            '### מחקר',
            '- POST /api/research — מחקר מ-11 מקורות מדעיים',
            '- POST /api/research-chat — צ\'אט AI על מחקרים',
            '',
            '### תזונה',
            '- POST /api/nutrition/analyze — ניתוח ארוחות ל-JSON מובנה',
            '',
            '### Knowledge Base',
            '- GET /api/knowledge — רשימת קבצי ידע',
            '- POST /api/knowledge/upload — העלאת קובץ',
            '- DELETE /api/knowledge/:name — מחיקת קובץ',
            '- POST /api/knowledge/reload — טעינה מחדש',
            '',
            '### מערכת',
            '- GET /api/health — מטריקות מורחבות',
            '- GET /api/metrics — מטריקות לקוח',
            '- GET /api/mega-prompt — מסמך זה',
            '',
            '## Knowledge Base',
            '',
            knowledgeFilesList || '- אין קבצי ידע',
            '',
            `**סיכום:**`,
            `- קבצים: ${knowledge.files.size}`,
            `- Chunks: ${knowledge.chunks.length}`,
            `- אוצר מילים: ${knowledge.vocab.size}`,
            `- אורך מסמך ממוצע: ${Math.round(knowledge.avgDocLength)} טוקנים`,
            '',
            `## מטריקות חיות (${now})`,
            '',
            '```json',
            JSON.stringify(metricsSnapshot, null, 2),
            '```',
            '',
            '## תכונות מתקדמות',
            '',
            '### BM25 Search',
            `- K1 = ${CONFIG.bm25K1}`,
            `- B = ${CONFIG.bm25B}`,
            `- Top Chunks = ${CONFIG.knowledgeTopChunks}`,
            `- Min Score = ${CONFIG.knowledgeMinScore}`,
            '',
            '### Retry Logic',
            `- Retries ברירת מחדל: ${CONFIG.defaultRetries}`,
            `- Retries ל-Vision: ${CONFIG.visionRetries}`,
            `- השהיה על 429: ${CONFIG.retryOn429DelayMs}ms`,
            `- השהיה על 503 (High Demand): ${CONFIG.retryOn503DelayMs}ms`,
            '',
            '### Rate Limits',
            `- API כללי: ${CONFIG.rateLimitMax} בקשות / דקה`,
            `- Vision: ${CONFIG.visionRateLimitMax} בקשות / דקה`,
            `- Research: ${CONFIG.researchRateLimitMax} בקשות / דקה`,
            '',
            '### Research Aggregator',
            '- 11 מקורות מדעיים',
            `- ${CONFIG.researchMaxPerSource} מחקרים לכל מקור`,
            `- ${CONFIG.researchFinalLimit} מחקרים סופיים`,
            '- Deduplication by DOI + Title',
            '- Scoring לפי רלוונטיות (Title match, Study type, Health keywords)',
            '',
            '### תרגום אוטומטי',
            '- עברית → אנגלית מדעית',
            `- מודל: ${CONFIG.geminiModel}`,
            `- Timeout: ${CONFIG.geminiTranslationTimeoutMs}ms`,
            '',
            '---',
            '',
            '*נוצר אוטומטית על ידי GET /api/mega-prompt.*'
        ];

        const megaPrompt = sections.join('\n');
        res.type('text/plain; charset=utf-8').send(megaPrompt);
    } catch (err) {
        next(err);
    }
});

// ==============================
// 47. 404 HANDLER
// ==============================

app.use((req, res) => {
    res.status(404).json({ reply: 'אדון, הנתיב המבוקש אינו קיים.' });
});

// ==============================
// 48. GLOBAL ERROR HANDLER
// ==============================

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

    if (err instanceof ResearchError) {
        log('error', `Research ${err.statusCode}: ${err.message}`);
        recordError(err.message);
        return res.status(err.statusCode).json({ error: err.message });
    }

    if (err instanceof ValidationError) {
        log('warn', `Validation: ${err.message}`);
        return res.status(err.statusCode).json({ error: err.message });
    }

    log('error', 'Unhandled error', err);
    recordError(err.message || 'Unknown error');
    return res.status(500).json({ reply: 'אדון, אירעה תקלה בלתי צפויה במערכת.' });
});

// ==============================
// 49. STARTUP
// ==============================

loadKnowledgeBase();

const server = app.listen(CONFIG.port, () => {
    log('info', 'J.A.R.V.I.S Neural Kernel V6.0 running');
    log('info', `Server: http://localhost:${CONFIG.port}`);
    log('info', `Model: ${CONFIG.geminiModel}`);
    log('info', `Environment: ${CONFIG.environment}`);
    log('info', `Knowledge: ${knowledge.files.size} files, ${knowledge.chunks.length} chunks, ${knowledge.vocab.size} vocab`);
    log('info', `YouTube API: ${CONFIG.youtubeApiKey ? 'configured' : 'NOT configured'}`);
    log('info', 'Research sources: 11 (Europe PMC, PubMed, OpenAlex, Semantic Scholar, CrossRef, DOAJ, bioRxiv, CORE, medRxiv, BASE, SciELO)');
    log('info', `CORE API: ${CONFIG.coreApiKey ? 'configured' : 'NOT configured (source disabled)'}`);
    log('info', `Semantic Scholar API: ${CONFIG.semanticScholarKey ? 'configured' : 'public tier'}`);
});

// ==============================
// 50. GRACEFUL SHUTDOWN
// ==============================

let isShuttingDown = false;

function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n${signal} התקבל, סוגר את השרת בצורה מסודרת...`);

    const forceExit = setTimeout(() => {
        console.error('Timeout — מאלץ יציאה');
        process.exit(1);
    }, 10000);

    forceExit.unref();

    server.close(() => {
        console.log('השרת נסגר בהצלחה.');
        clearTimeout(forceExit);
        process.exit(0);
    });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
    log('error', 'Unhandled Rejection', reason);
});
process.on('uncaughtException', (err) => {
    log('error', 'Uncaught Exception', err);
});