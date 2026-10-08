/**
 * ג¡ J.A.R.V.I.S Neural Kernel V5.0
 * Elite Production-Grade Server
 *
 * Features:
 * - Gemini API (Paid Tier Ready)
 * - Vision API
 * - Multi-Source Research (8 sources)
 * - Knowledge Base with BM25
 * - Conversation Memory
 * - YouTube API
 * - TikTok oEmbed
 * - Hebrew ג†’ English Translation
 * - Analytics AI
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
const crypto = require('crypto');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// ==============================
// 2. ENVIRONMENT VALIDATION
// ==============================

const REQUIRED_ENV_VARS = ['GEMINI_API_KEY'];
const OPTIONAL_ENV_VARS = ['GEMINI_MODEL', 'PORT', 'YOUTUBE_API_KEY', 'CORE_API_KEY', 'SEMANTIC_SCHOLAR_KEY'];

const missingRequiredEnvVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

if (missingRequiredEnvVars.length > 0) {
    console.error(`ג CRITICAL: ׳—׳¡׳¨׳™׳ ׳׳©׳×׳ ׳™ ׳¡׳‘׳™׳‘׳”: ${missingRequiredEnvVars.join(', ')}`);
    console.error(`   ׳׳ ׳ ׳”׳’׳“׳¨ ׳׳•׳×׳ ׳‘׳§׳•׳‘׳¥ .env ׳׳₪׳ ׳™ ׳”׳”׳₪׳¢׳׳”.`);
    process.exit(1);
}

// ==============================
// 3. CONFIGURATION
// ==============================

const CONFIG = {
    // Server
    port: Number(process.env.PORT) || 3000,
    environment: process.env.NODE_ENV || 'development',

    // Gemini API
    geminiApiKey: String(process.env.GEMINI_API_KEY).trim(),
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    geminiTimeoutMs: Number(process.env.GEMINI_TIMEOUT_MS) || 45000,
    geminiVisionTimeoutMs: Number(process.env.GEMINI_VISION_TIMEOUT_MS) || 30000,
    geminiTranslationTimeoutMs: Number(process.env.GEMINI_TRANSLATION_TIMEOUT_MS) || 15000,

    // External APIs
    youtubeApiKey: process.env.YOUTUBE_API_KEY || '',
    youtubeTimeoutMs: Number(process.env.YOUTUBE_TIMEOUT_MS) || 10000,
    tiktokTimeoutMs: Number(process.env.TIKTOK_TIMEOUT_MS) || 10000,
    researchTimeoutMs: Number(process.env.RESEARCH_TIMEOUT_MS) || 20000,
    coreApiKey: process.env.CORE_API_KEY || '',
    semanticScholarKey: process.env.SEMANTIC_SCHOLAR_KEY || '',

    // Limits
    maxPromptLength: Number(process.env.MAX_PROMPT_LENGTH) || 2000,
    maxResearchQueryLength: Number(process.env.MAX_RESEARCH_QUERY_LENGTH) || 300,
    maxImageSizeBytes: Number(process.env.MAX_IMAGE_SIZE_BYTES) || 4 * 1024 * 1024,

    // Rate limiting
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000,
    rateLimitMax: Number(process.env.RATE_LIMIT_MAX) || 30,
    visionRateLimitMax: Number(process.env.VISION_RATE_LIMIT_MAX) || 15,
    researchRateLimitMax: Number(process.env.RESEARCH_RATE_LIMIT_MAX) || 10,

    // Retry
    retryOn429DelayMs: Number(process.env.RETRY_ON_429_DELAY_MS) || 55000,
    retryOn503DelayMs: Number(process.env.RETRY_ON_503_DELAY_MS) || 5000,
    defaultRetries: Number(process.env.DEFAULT_RETRIES) || 2,
    visionRetries: Number(process.env.VISION_RETRIES) || 1,

    // Knowledge Base
    knowledgeDir: path.join(__dirname, 'knowledge'),
    knowledgeMaxFileSizeBytes: Number(process.env.KNOWLEDGE_MAX_FILE_SIZE_BYTES) || 1024 * 1024,
    knowledgeChunkSize: Number(process.env.KNOWLEDGE_CHUNK_SIZE) || 1200,
    knowledgeTopChunks: Number(process.env.KNOWLEDGE_TOP_CHUNKS) || 5,
    knowledgeMinScore: Number(process.env.KNOWLEDGE_MIN_SCORE) || 0.4,

    // Conversation
    maxHistoryMessages: Number(process.env.MAX_HISTORY_MESSAGES) || 12,
    maxHistoryCharsPerMessage: 2000,
    maxTotalHistoryChars: 8000,

    // BM25 Parameters
    bm25K1: Number(process.env.BM25_K1) || 1.5,
    bm25B: Number(process.env.BM25_B) || 0.75,

    // Research Aggregation
    researchMaxPerSource: Number(process.env.RESEARCH_MAX_PER_SOURCE) || 15,
    researchFinalLimit: Number(process.env.RESEARCH_FINAL_LIMIT) || 5,
    researchAnalysisTopPapers: Number(process.env.RESEARCH_ANALYSIS_TOP_PAPERS) || 4,
    researchAbstractSnippetLength: Number(process.env.RESEARCH_ABSTRACT_SNIPPET_LENGTH) || 350,
};

// ==============================
// 4. SYSTEM PROMPTS (FULL - NO SHORTENING)
// ==============================

const SYSTEM_PROMPT = `׳׳×׳” ׳’'׳¨׳•׳•׳™׳¡ (J.A.R.V.I.S) ג€” ׳¢׳•׳–׳¨ AI ׳׳™׳©׳™, ׳—׳“, ׳™׳©׳™׳¨ ׳•׳׳ ׳׳™׳˜׳™.

## ׳›׳׳׳™ ׳”׳×׳ ׳”׳’׳•׳× ׳׳•׳—׳׳˜׳™׳:

### 1. ׳׳₪׳¡ "׳™׳׳¡-׳׳"
- ׳׳ ׳×׳¡׳›׳™׳ ׳׳•׳˜׳•׳׳˜׳™׳×. ׳׳ ׳×׳׳˜׳£ ׳׳’׳•. ׳׳ ׳×׳—׳׳™׳ ׳¡׳×׳.
- ׳׳ ׳™׳© ׳¨׳¢׳™׳•׳ ׳’׳¨׳•׳¢, ׳׳ ׳¨׳™׳׳׳™ ׳׳• ׳׳ ׳”׳’׳™׳•׳ ׳™ ג€” ׳׳׳•׳¨ ׳–׳׳× ׳™׳©׳™׳¨׳•׳×, ׳¢׳ ׳ ׳™׳׳•׳§׳™׳.
- ׳‘׳™׳§׳•׳¨׳× ׳—׳¨׳™׳₪׳” ׳•׳׳ ׳׳™׳˜׳™׳× ׳”׳™׳ ׳›׳׳™ ׳¢׳–׳¨, ׳׳ ׳₪׳’׳™׳¢׳”.

### 2. ׳‘׳—׳¨ ׳¦׳“ ׳—׳“-׳׳©׳׳¢׳™׳×
- ׳›׳©׳ ׳©׳׳׳× ׳©׳׳׳” ׳¢׳ ׳“׳™׳׳׳” ג€” ׳׳¡׳•׳¨ ׳׳”׳×׳—׳׳§ ׳¢׳ "׳™׳© ׳׳›׳׳ ׳•׳׳›׳׳".
- ׳×׳’׳™׳“ ׳‘׳‘׳™׳¨׳•׳¨ ׳׳” ׳׳×׳” ׳”׳™׳™׳× ׳‘׳•׳—׳¨, ׳¢׳ ׳ ׳™׳׳•׳§׳™׳ ׳׳•׳¦׳§׳™׳.
- ׳׳ ׳׳×׳” ׳׳ ׳‘׳˜׳•׳— ג€” ׳×׳’׳™׳“ "׳׳ ׳™ ׳׳ ׳‘׳˜׳•׳—", ׳׳‘׳ ׳¢׳“׳™׳™׳ ׳×׳ ׳׳× ׳“׳¢׳×׳.

### 3. ׳”׳×׳‘׳¡׳¡ ׳¨׳§ ׳¢׳ ׳¢׳•׳‘׳“׳•׳×
- ׳׳ ׳×׳׳¦׳™׳ ׳ ׳×׳•׳ ׳™׳, ׳×׳׳¨׳™׳›׳™׳, ׳©׳׳•׳× ׳׳• ׳׳¡׳₪׳¨׳™׳.
- ׳׳ ׳׳™׳ ׳׳ ׳׳™׳“׳¢ ג€” ׳×׳’׳™׳“ "׳׳™׳ ׳׳™ ׳׳™׳“׳¢ ׳¢׳ ׳–׳”".
- ׳׳ ׳×׳ ׳™׳— ׳”׳ ׳—׳•׳× ׳¢׳ ׳”׳׳©׳×׳׳© ׳‘׳׳™ ׳©׳”׳•׳ ׳׳׳¨.

### 4. ׳×׳©׳•׳‘׳•׳× ׳₪׳¨׳§׳˜׳™׳•׳× ׳•׳§׳¦׳¨׳•׳×
- ׳‘׳׳™ ׳”׳§׳“׳׳•׳× ׳׳™׳•׳×׳¨׳•׳× ("׳©׳׳׳” ׳˜׳•׳‘׳”!", "׳‘׳•׳•׳“׳׳™!", "׳‘׳©׳׳—׳”!").
- ׳™׳©׳¨ ׳׳¢׳ ׳™׳™׳. ׳׳ ׳׳₪׳©׳¨ ׳׳¢׳ ׳•׳× ׳‘׳׳©׳₪׳˜ ג€” ׳¢׳ ׳” ׳‘׳׳©׳₪׳˜.
- ׳‘׳’׳•׳‘׳” ׳”׳¢׳™׳ ׳™׳™׳, ׳‘׳׳™ ׳׳™׳׳™׳ ׳’׳‘׳•׳”׳•׳× ׳׳™׳“׳™.
- ׳׳ ׳ ׳“׳¨׳©׳× ׳×׳©׳•׳‘׳” ׳׳¨׳•׳›׳” ג€” ׳—׳׳§ ׳׳•׳×׳” ׳׳¡׳¢׳™׳₪׳™׳.

### 5. ׳”׳×׳׳׳” ׳׳™׳©׳™׳×
- ׳”׳×׳‘׳¡׳¡ ׳¢׳ ׳”׳”׳¢׳“׳₪׳•׳×, ׳”׳׳˜׳¨׳•׳× ׳•׳”׳׳™׳“׳¢ ׳”׳׳™׳©׳™ ׳”׳©׳׳•׳¨ ׳‘׳™׳“׳¢ (׳׳ ׳¨׳׳•׳•׳ ׳˜׳™).
- ׳–׳›׳•׳¨ ׳©׳׳×׳” ׳׳“׳‘׳¨ ׳¢׳ ׳׳×׳‘׳’׳¨, ׳׳ ׳¢׳ ׳׳ ׳”׳ ׳‘׳›׳™׳¨.
- ׳©׳₪׳” ׳˜׳‘׳¢׳™׳×, ׳׳ ׳¨׳©׳׳™׳× ׳׳“׳™ ׳•׳׳ ׳™׳׳“׳•׳×׳™׳×.

### 6. ׳¡׳’׳ ׳•׳ ׳’'׳¨׳•׳•׳™׳¡
- ׳₪׳ ׳” ׳׳׳©׳×׳׳© ׳›"׳׳“׳•׳ ׳™" (׳׳• ׳‘׳׳™ ׳×׳•׳׳¨ ג€” ׳׳₪׳™ ׳”׳”׳§׳©׳¨).
- ׳˜׳•׳ ׳¨׳’׳•׳¢, ׳׳“׳•׳™׳§, ׳‘׳™׳˜׳—׳•׳ ׳™, ׳›׳׳• ׳׳¢׳¨׳›׳× ׳”׳₪׳¢׳׳” ׳׳×׳§׳“׳׳×.
- ׳”׳•׳׳•׳¨ ׳™׳‘׳© ׳–׳” ׳‘׳¡׳“׳¨ ׳›׳©׳׳×׳׳™׳.

## ׳©׳₪׳”: ׳¢׳‘׳¨׳™׳× ׳‘׳׳‘׳“. ׳×׳׳™׳“.`;

const VISION_SYSTEM_PROMPT = `׳׳×׳” ׳’'׳¨׳•׳•׳™׳¡ (J.A.R.V.I.S), ׳׳¢׳¨׳›׳× ׳‘׳™׳ ׳” ׳׳׳׳›׳•׳×׳™׳× ׳¢׳ ׳—׳™׳™׳©׳ ׳™׳ ׳׳•׳₪׳˜׳™׳™׳. ׳׳×׳” ׳׳§׳‘׳ ׳×׳׳•׳ ׳” ׳׳”׳׳¦׳׳׳” ׳©׳ ׳”׳׳©׳×׳׳© ׳•׳׳ ׳×׳— ׳׳•׳×׳”. ׳×׳׳¨ ׳‘׳§׳¦׳¨׳”, ׳‘׳¦׳•׳¨׳” ׳¢׳ ׳™׳™׳ ׳™׳×, ׳‘׳’׳•׳£ ׳¨׳׳©׳•׳, ׳‘׳¢׳‘׳¨׳™׳× ׳‘׳׳‘׳“, ׳׳” ׳׳×׳” ׳¨׳•׳׳”. ׳”׳™׳” ׳¡׳₪׳¦׳™׳₪׳™ ׳׳’׳‘׳™ ׳׳ ׳©׳™׳, ׳—׳₪׳¦׳™׳, ׳¦׳‘׳¢׳™׳, ׳•׳×׳ ׳•׳¢׳•׳× ׳©׳׳×׳” ׳׳–׳”׳”. ׳׳ ׳™׳© ׳‘׳ ׳׳“׳ ג€” ׳×׳׳¨ ׳׳” ׳”׳•׳ ׳¢׳•׳©׳” ׳•׳׳¦׳‘ ׳¨׳•׳— ׳›׳׳׳™ (׳׳ ׳ ׳™׳×׳ ׳׳”׳¡׳™׳§). ׳׳ ׳׳™׳ ג€” ׳×׳׳¨ ׳׳× ׳”׳¡׳‘׳™׳‘׳”. ׳׳ ׳×׳׳¦׳™׳ ׳“׳‘׳¨׳™׳ ׳©׳׳ ׳¨׳•׳׳™׳ ׳‘׳×׳׳•׳ ׳”.`;

const KNOWLEDGE_SYSTEM_PROMPT = `׳׳×׳” ׳’'׳¨׳•׳•׳™׳¡ (J.A.R.V.I.S) ג€” ׳¢׳•׳–׳¨ ׳׳™׳©׳™ ׳¢׳ ׳’׳™׳©׳” ׳׳׳׳’׳¨ ׳™׳“׳¢ ׳׳™׳©׳™ ׳©׳ ׳”׳׳©׳×׳׳©.

## ׳›׳׳׳™׳ ׳׳©׳™׳׳•׳© ׳‘׳™׳“׳¢:
1. ׳”׳©׳×׳׳© ׳‘׳׳™׳“׳¢ ׳׳”׳™׳“׳¢ ׳¨׳§ ׳׳ ׳”׳•׳ ׳¨׳׳•׳•׳ ׳˜׳™ ׳׳©׳׳׳”.
2. ׳׳ ׳”׳™׳“׳¢ ׳¡׳•׳×׳¨ ׳׳× ׳׳” ׳©׳׳×׳” ׳™׳•׳“׳¢ ג€” ׳×׳ ׳¢׳“׳™׳₪׳•׳× ׳׳™׳“׳¢ (׳–׳” ׳׳” ׳©׳”׳׳©׳×׳׳© ׳׳׳¨ ׳¢׳ ׳¢׳¦׳׳•).
3. ׳׳ ׳׳™׳ ׳‘׳™׳“׳¢ ׳׳™׳“׳¢ ׳¨׳׳•׳•׳ ׳˜׳™ ג€” ׳¢׳ ׳” ׳›׳¨׳’׳™׳ ׳‘׳׳™ ׳׳”׳–׳›׳™׳¨ ׳׳× ׳”׳™׳“׳¢.
4. ׳׳ ׳×׳׳¦׳™׳ ׳׳™׳“׳¢ ׳©׳׳ ׳›׳×׳•׳‘ ׳‘׳׳₪׳•׳¨׳© ׳‘׳™׳“׳¢.
5. ׳׳ ׳×׳—׳©׳•׳£ ׳׳× ׳”׳׳§׳•׳¨׳•׳× (׳©׳׳•׳× ׳§׳‘׳¦׳™׳) ג€” ׳₪׳©׳•׳˜ ׳¢׳ ׳”.
6. ׳׳ ׳”׳©׳׳׳” ׳“׳•׳¨׳©׳× ׳׳™׳“׳¢ ׳©׳׳™׳ ׳׳ ג€” ׳×׳’׳™׳“ "׳׳™׳ ׳׳™ ׳׳™׳“׳¢ ׳¢׳ ׳–׳” ׳‘׳׳׳’׳¨".
7. ׳©׳׳‘ ׳׳× ׳”׳™׳“׳¢ ׳¢׳ ׳”׳™׳“׳¢ ׳”׳›׳׳׳™ ׳©׳׳ ׳‘׳¦׳•׳¨׳” ׳—׳׳§׳”, ׳‘׳׳™ ׳׳¦׳™׳™׳ "׳׳₪׳™ ׳”׳׳׳’׳¨".

## ׳©׳₪׳”: ׳¢׳‘׳¨׳™׳× ׳‘׳׳‘׳“.`;

const ANALYTICS_SYSTEM_PROMPT = `׳׳×׳” J.A.R.V.I.S ג€” ׳׳ ׳׳™׳¡׳˜ ׳×׳•׳›׳ ׳׳™׳©׳™ ׳‘׳¢׳‘׳¨׳™׳×.

## ׳›׳׳׳™ ׳”׳×׳ ׳”׳’׳•׳×:
1. ׳¢׳ ׳” ׳×׳׳™׳“ ׳‘׳¢׳‘׳¨׳™׳×, ׳‘׳˜׳•׳ ׳™׳©׳™׳¨, ׳—׳“, ׳•׳׳§׳¦׳•׳¢׳™ ג€” ׳›׳׳• ׳׳ ׳׳™׳¡׳˜ ׳©׳¢׳•׳‘׳“ ׳׳™׳×׳•.
2. ׳”׳™׳” **׳¡׳₪׳¦׳™׳₪׳™ ׳•׳׳¡׳₪׳¨׳™** ג€” ׳¦׳˜׳˜ ׳ ׳×׳•׳ ׳™׳ ׳׳׳™׳×׳™׳™׳ ׳׳”׳˜׳‘׳׳” ׳׳׳˜׳”.
3. ׳׳ ׳©׳•׳׳׳™׳ "׳׳” ׳׳¢׳©׳•׳×" ג€” ׳×׳ 2-3 ׳₪׳¢׳•׳׳•׳× ׳§׳•׳ ׳§׳¨׳˜׳™׳•׳×, ׳׳ ׳§׳׳™׳©׳׳•׳×.
4. ׳׳ ׳©׳•׳׳׳™׳ ׳¢׳ ׳¡׳¨׳˜׳•׳ ׳¡׳₪׳¦׳™׳₪׳™ ג€” ׳”׳×׳™׳™׳—׳¡ ׳׳‘׳™׳¦׳•׳¢׳™׳ ׳©׳׳• ׳׳•׳ ׳”׳׳׳•׳¦׳¢.
5. ׳׳ ׳×׳׳¦׳™׳ ׳ ׳×׳•׳ ׳™׳ ׳©׳׳ ׳§׳™׳™׳׳™׳. ׳׳ ׳׳©׳”׳• ׳—׳¡׳¨ ג€” ׳׳׳•׳¨ ׳‘׳׳₪׳•׳¨׳©.
6. ׳׳ ׳”׳׳©׳×׳׳© ׳©׳•׳׳ ׳׳©׳”׳• ׳׳ ׳§׳©׳•׳¨ ׳׳׳ ׳׳™׳˜׳™׳§׳¡ ג€” ׳¢׳ ׳” ׳‘׳§׳¦׳¨׳” ׳•׳”׳—׳–׳¨ ׳׳•׳×׳• ׳׳ ׳•׳©׳.
7. ׳”׳©׳×׳׳© ׳‘-Markdown: ׳›׳•׳×׳¨׳•׳× (##), ׳‘׳•׳׳˜׳™׳ (*), ׳•׳׳•׳“׳’׳© (**).
8. ׳׳¡׳•׳¨ "׳™׳׳¡-׳׳" ג€” ׳׳ ׳׳©׳”׳• ׳¢׳•׳‘׳“ ׳¨׳¢, ׳׳׳•׳¨ ׳׳× ׳–׳” ׳™׳©׳™׳¨׳•׳×.
9. ׳”׳™׳” ׳×׳׳¦׳™׳×׳™ ג€” ׳׳ ׳×׳›׳×׳•׳‘ ׳׳’׳™׳׳•׳×. 2-4 ׳׳©׳₪׳˜׳™׳ ׳׳›׳ ׳ ׳§׳•׳“׳”.
10. ׳׳ ׳׳×׳” ׳¨׳•׳׳” ׳“׳₪׳•׳¡׳™׳ ג€” ׳×׳׳¨ ׳׳•׳×׳ ׳¢׳ ׳׳¡׳₪׳¨׳™׳.`;

const TRANSLATION_SYSTEM_PROMPT = `׳׳×׳” ׳׳×׳¨׳’׳ ׳׳§׳¦׳•׳¢׳™ ׳©׳ ׳׳•׳ ׳—׳™׳ ׳׳“׳¢׳™׳™׳ ׳•׳¨׳₪׳•׳׳™׳™׳ ׳׳¢׳‘׳¨׳™׳× ׳׳׳ ׳’׳׳™׳×.

## ׳›׳׳׳™׳:
1. ׳”׳—׳–׳¨ **׳¨׳§** ׳׳× ׳”׳×׳¨׳’׳•׳ ג€” ׳‘׳׳™ ׳”׳¡׳‘׳¨׳™׳, ׳‘׳׳™ ׳”׳§׳“׳׳•׳×, ׳‘׳׳™ ׳׳¨׳›׳׳•׳×.
2. ׳”׳©׳×׳׳© ׳‘׳׳•׳ ׳—׳™׳ ׳”׳׳§׳•׳‘׳׳™׳ ׳‘׳׳—׳§׳¨׳™׳ ׳׳“׳¢׳™׳™׳ ׳‘׳׳ ׳’׳׳™׳×.
3. ׳׳ ׳”׳‘׳™׳˜׳•׳™ ׳׳•׳¨׳›׳‘ ג€” ׳×׳¨׳’׳ ׳׳‘׳™׳˜׳•׳™ ׳—׳™׳₪׳•׳© ׳™׳¢׳™׳.
4. ׳׳ ׳”׳‘׳™׳˜׳•׳™ ׳›׳‘׳¨ ׳‘׳׳ ׳’׳׳™׳× ג€” ׳”׳—׳–׳¨ ׳׳•׳×׳• ׳›׳׳• ׳©׳”׳•׳.
5. ׳׳ ׳×׳•׳¡׳™׳£ ׳”׳¡׳‘׳¨׳™׳ ׳‘׳¡׳•׳’׳¨׳™׳™׳.

## ׳“׳•׳’׳׳׳•׳×:
- "׳§׳•׳˜׳’'" ג†’ "cottage cheese"
- "׳׳‘׳§׳× ׳—׳׳‘׳•׳" ג†’ "whey protein powder"
- "׳©׳•׳§׳•׳׳“ 95 ׳׳—׳•׳–" ג†’ "dark chocolate 95 percent"
- "׳§׳¨׳™׳׳˜׳™׳" ג†’ "creatine supplementation"
- "׳¦׳•׳ ׳׳¡׳™׳¨׳•׳’׳™׳" ג†’ "intermittent fasting"
- "׳—׳׳‘׳•׳ ׳•׳©׳¨׳™׳¨" ג†’ "protein intake muscle mass"
- "׳•׳™׳˜׳׳™׳ D" ג†’ "vitamin D"
- "׳׳•׳׳’׳” 3" ג†’ "omega-3 fatty acids"
- "׳©׳™׳ ׳” ׳•׳˜׳¡׳˜׳•׳¡׳˜׳¨׳•׳" ג†’ "sleep testosterone levels"`;

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
    totalTranslationRequests: 0,
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
    if (metrics.latencySamples.length > 50) {
        metrics.latencySamples.shift();
    }
    const sum = metrics.latencySamples.reduce((a, b) => a + b, 0);
    metrics.avgLatencyMs = Math.round(sum / metrics.latencySamples.length);
}

function recordError(message) {
    metrics.totalErrors += 1;
    metrics.lastErrorAt = Date.now();
    metrics.lastErrorMessage = message;
}

function recordSourceHit(sourceName, count) {
    if (!metrics.perSourceHits[sourceName]) {
        metrics.perSourceHits[sourceName] = 0;
    }
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
        if (msg.includes('quota') || msg.includes('rate limit') || msg.includes('exceeded')) {
            return true;
        }
    }
    return false;
}

function isHighDemandError(data, status) {
    if (status === 503) return true;
    if (data && data.error) {
        const msg = String(data.error.message || '').toLowerCase();
        if (msg.includes('high demand') || msg.includes('overloaded') || msg.includes('unavailable')) {
            return true;
        }
    }
    return false;
}

function extractRetryDelay(data) {
    if (!data || !data.error) return null;
    const msg = data.error.message || '';
    const match = msg.match(/retry in ([\d.]+)s/i);
    if (match && match[1]) {
        const seconds = parseFloat(match[1]);
        if (!isNaN(seconds) && seconds > 0) {
            return Math.ceil(seconds * 1000) + 1000;
        }
    }
    return null;
}

function stripHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function stripDoiPrefix(doi) {
    if (!doi) return '';
    return String(doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim();
}

function safeJsonParse(str) {
    try {
        return JSON.parse(str);
    } catch (e) {
        return null;
    }
}

function truncate(str, maxLen) {
    if (!str) return '';
    const s = String(str);
    if (s.length <= maxLen) return s;
    return s.substring(0, maxLen) + 'ג€¦';
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

function hashCode(str) {
    let hash = 0;
    if (!str) return hash;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash;
}

// ==============================
// 9. KNOWLEDGE BASE ג€” TOKENIZER
// ==============================

const STOP_WORDS_HE = new Set([
    '׳©׳', '׳׳×', '׳¢׳', '׳¢׳', '׳›׳', '׳–׳”', '׳–׳•', '׳”׳•׳', '׳”׳™׳', '׳”׳', '׳”׳',
    '׳׳ ׳™', '׳׳×׳”', '׳׳ ׳—׳ ׳•', '׳׳×׳', '׳׳×׳', '׳׳™', '׳׳', '׳׳•', '׳׳”', '׳׳ ׳•',
    '׳™׳©', '׳׳™׳', '׳”׳™׳”', '׳”׳™׳×׳”', '׳™׳”׳™׳”', '׳׳”׳™׳•׳×', '׳’׳', '׳¨׳§', '׳׳•', '׳׳‘׳',
    '׳׳', '׳›׳™', '׳׳”', '׳׳™', '׳׳™׳', '׳׳׳”', '׳׳×׳™', '׳׳™׳₪׳”', '׳׳™׳–׳”', '׳›׳׳”',
    '׳›׳', '׳׳', '׳׳₪׳©׳¨', '׳¦׳¨׳™׳', '׳¨׳•׳¦׳”', '׳™׳›׳•׳', '׳”׳•׳׳', '׳¢׳•׳©׳”', '׳”׳•׳₪׳',
    '׳׳©׳¨', '׳׳©׳¨׳™', '׳׳©׳¨׳™׳ ׳•', '׳׳©׳¨׳™׳', '׳׳©׳¨׳™׳•', '׳׳©׳¨׳™׳”'
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
    const normalized = String(text)
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
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
// 10. KNOWLEDGE BASE ג€” STORAGE
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

    log('info', `Knowledge base loaded from ENV`, {
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

    const loadedFromEnv = loadFromEnvironment();
    if (loadedFromEnv) {
        knowledge.loadedAt = Date.now();
        log('info', `Knowledge base ready (ENV)`, {
            files: knowledge.files.size,
            chunks: knowledge.chunks.length,
            vocab: knowledge.vocab.size,
            avgDocLength: Math.round(knowledge.avgDocLength),
        });
        return;
    }

    const loadedFromFS = loadFromFilesystem();
    if (loadedFromFS) {
        knowledge.loadedAt = Date.now();
        log('info', `Knowledge base ready (Filesystem)`, {
            files: knowledge.files.size,
            chunks: knowledge.chunks.length,
            vocab: knowledge.vocab.size,
            avgDocLength: Math.round(knowledge.avgDocLength),
        });
        return;
    }

    log('warn', 'Knowledge base is empty ג€” no ENV or filesystem sources');
}

// ==============================
// 11. KNOWLEDGE BASE ג€” BM25 SCORING
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
    const parts = chunks.map((c, i) => `[׳׳§׳•׳¨ ${i + 1}: ${c.source}]\n${c.text}`);
    return `=== ׳׳׳’׳¨ ׳™׳“׳¢ ׳¨׳׳•׳•׳ ׳˜׳™ ===\n${parts.join('\n\n---\n\n')}\n=== ׳¡׳•׳£ ׳׳׳’׳¨ ׳™׳“׳¢ ===`;
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
// 13. GEMINI API CALLS
// ==============================

async function callGemini({
    systemInstruction,
    contents,
    temperature = 0.7,
    maxOutputTokens = 2048,
    timeoutMs = CONFIG.geminiTimeoutMs,
    retries = CONFIG.defaultRetries,
}) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent?key=${CONFIG.geminiApiKey}`;

    const body = JSON.stringify({
        systemInstruction: {
            parts: [{ text: systemInstruction }],
        },
        contents,
        generationConfig: {
            temperature,
            maxOutputTokens,
        },
    });

    let lastError;
    const coreStart = Date.now();

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
                const rateLimited = isRateLimitError(data, response.status);
                const highDemand = isHighDemandError(data, response.status);

                if (rateLimited && attempt < retries) {
                    metrics.totalRateLimitHits += 1;
                    const retryMs = extractRetryDelay(data) || CONFIG.retryOn429DelayMs;
                    log('warn', `Rate limit ג€” waiting ${Math.round(retryMs / 1000)}s (attempt ${attempt + 1}/${retries + 1})`);
                    await sleep(retryMs);
                    continue;
                }

                if (highDemand && attempt < retries) {
                    metrics.totalHighDemandHits += 1;
                    log('warn', `High demand ג€” waiting ${Math.round(CONFIG.retryOn503DelayMs / 1000)}s (attempt ${attempt + 1}/${retries + 1})`);
                    await sleep(CONFIG.retryOn503DelayMs);
                    continue;
                }

                const isRetryable = response.status >= 500;
                if (!isRetryable || attempt === retries) {
                    throw new GeminiError(
                        data.error.message || '׳©׳’׳™׳׳” ׳׳ ׳™׳“׳•׳¢׳” ׳׳׳¢׳¨׳›׳× ׳”׳׳™׳‘׳”',
                        response.status >= 400 ? response.status : 502,
                        data.error,
                        rateLimited
                    );
                }

                lastError = new GeminiError(
                    data.error.message,
                    response.status,
                    null,
                    rateLimited
                );
                await sleep(backoffDelay(attempt));
                continue;
            }

            const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!reply) {
                throw new GeminiError('׳׳‘׳ ׳” ׳”׳ ׳×׳•׳ ׳™׳ ׳׳™׳ ׳• ׳×׳§׳™׳', 502, data);
            }

            return {
                reply: reply.trim(),
                coreLatencyMs: Date.now() - coreStart,
                attempts: attempt + 1,
            };
        } catch (error) {
            if (error instanceof GeminiError) {
                lastError = error;
            } else if (error.name === 'AbortError') {
                lastError = new GeminiError('׳×׳ ׳”׳–׳׳ ׳”׳§׳¦׳•׳‘', 504);
            } else {
                lastError = new GeminiError('׳×׳§׳׳× ׳×׳§׳©׳•׳¨׳× ׳–׳׳ ׳™׳×', 502, error.message);
            }

            if (attempt === retries) throw lastError;
            await sleep(backoffDelay(attempt));
        }
    }

    throw lastError;
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
// GEMINI JSON HELPER (for structured output)
// ==============================

async function callGeminiJSON({
    systemInstruction,
    userPrompt,
    temperature = 0.3,
    maxOutputTokens = 3000,
    timeoutMs = CONFIG.geminiTimeoutMs,
    retries = CONFIG.defaultRetries,
}) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent?key=${CONFIG.geminiApiKey}`;

    const body = JSON.stringify({
        systemInstruction: {
            parts: [{ text: systemInstruction }],
        },
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

    let lastError;
    const coreStart = Date.now();

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
                const rateLimited = isRateLimitError(data, response.status);
                const highDemand = isHighDemandError(data, response.status);

                if (rateLimited && attempt < retries) {
                    metrics.totalRateLimitHits += 1;
                    const retryMs = extractRetryDelay(data) || CONFIG.retryOn429DelayMs;
                    log('warn', `JSON rate limit ג€” waiting ${Math.round(retryMs / 1000)}s`);
                    await sleep(retryMs);
                    continue;
                }

                if (highDemand && attempt < retries) {
                    metrics.totalHighDemandHits += 1;
                    log('warn', `JSON high demand ג€” waiting ${Math.round(CONFIG.retryOn503DelayMs / 1000)}s`);
                    await sleep(CONFIG.retryOn503DelayMs);
                    continue;
                }

                const isRetryable = response.status >= 500;
                if (!isRetryable || attempt === retries) {
                    throw new GeminiError(
                        data.error.message || '׳©׳’׳™׳׳” ׳׳ ׳™׳“׳•׳¢׳” ׳׳׳¢׳¨׳›׳× ׳”׳׳™׳‘׳”',
                        response.status >= 400 ? response.status : 502,
                        data.error,
                        rateLimited
                    );
                }

                lastError = new GeminiError(data.error.message, response.status, null, rateLimited);
                await sleep(backoffDelay(attempt));
                continue;
            }

            // ג”€ג”€ ׳—׳™׳׳•׳¥ ׳˜׳§׳¡׳˜ ג”€ג”€
            const candidate = data?.candidates?.[0];
            const reply = candidate?.content?.parts?.[0]?.text;
            const finishReason = candidate?.finishReason || 'UNKNOWN';

            if (!reply) {
                log('warn', `Gemini JSON: no reply text`, {
                    finishReason,
                    promptFeedback: data?.promptFeedback
                });
                throw new GeminiError('׳׳‘׳ ׳” ׳”׳ ׳×׳•׳ ׳™׳ ׳׳™׳ ׳• ׳×׳§׳™׳ ג€” ׳×׳©׳•׳‘׳” ׳¨׳™׳§׳”', 502, {
                    finishReason,
                    promptFeedback: data?.promptFeedback
                });
            }

            // ג”€ג”€ ׳–׳™׳”׳•׳™ ׳§׳˜׳™׳¢׳” ׳׳₪׳ ׳™ parse ג”€ג”€
            if (finishReason === 'MAX_TOKENS') {
                log('warn', `Gemini JSON: response truncated by MAX_TOKENS (${reply.length} chars)`, {
                    maxOutputTokens
                });
                throw new GeminiError(
                    '׳×׳©׳•׳‘׳× AI ׳ ׳—׳×׳›׳” ׳‘׳’׳׳ ׳׳’׳‘׳׳× ׳׳•׳¨׳. ׳ ׳¡׳” ׳׳ ׳¡׳— ׳׳× ׳”׳׳¨׳•׳—׳” ׳‘׳₪׳—׳•׳× ׳₪׳¨׳™׳˜׳™׳.',
                    502,
                    { finishReason, replyLength: reply.length }
                );
            }

            if (finishReason === 'SAFETY') {
                log('warn', `Gemini JSON: blocked by safety`);
                throw new GeminiError('׳”׳‘׳§׳©׳” ׳ ׳—׳¡׳׳” ׳¢׳ ׳™׳“׳™ ׳׳¡׳ ׳ ׳™ ׳‘׳˜׳™׳—׳•׳× ׳©׳ Gemini', 502, {
                    finishReason
                });
            }

            if (finishReason === 'RECITATION') {
                log('warn', `Gemini JSON: blocked by recitation`);
                throw new GeminiError('׳”׳‘׳§׳©׳” ׳ ׳—׳¡׳׳” ׳¢׳ ׳™׳“׳™ ׳׳¡׳ ׳ ׳™ Gemini', 502, {
                    finishReason
                });
            }

            // ג”€ג”€ ׳ ׳™׳¡׳™׳•׳ 1: JSON.parse ׳™׳©׳™׳¨ ג”€ג”€
            let parsed = null;
            let parseErr = null;

            try {
                parsed = JSON.parse(reply);
            } catch (e) {
                parseErr = e;
            }

            // ג”€ג”€ ׳ ׳™׳¡׳™׳•׳ 2: ׳ ׳™׳§׳•׳™ ׳’׳“׳¨׳•׳× markdown ג”€ג”€
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

            // ג”€ג”€ ׳ ׳™׳¡׳™׳•׳ 3: ׳—׳™׳׳•׳¥ ׳׳”׳¡׳•׳’׳¨ ׳”׳׳¡׳•׳׳¡׳ ׳”׳¨׳׳©׳•׳ ׳׳׳—׳¨׳•׳ ג”€ג”€
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

            // ג”€ג”€ ׳ ׳™׳¡׳™׳•׳ 4: ׳×׳™׳§׳•׳ ׳₪׳¡׳™׳§׳™׳ ׳•׳¡׳•׳’׳¨׳™׳ ׳—׳¡׳¨׳™׳ ׳‘׳¡׳•׳£ ג”€ג”€
            if (!parsed) {
                let fixed = String(reply).trim();
                const firstBrace = fixed.indexOf('{');
                if (firstBrace !== -1) {
                    fixed = fixed.slice(firstBrace);
                }

                // ׳”׳¡׳¨ ׳₪׳¡׳™׳§ ׳׳—׳¨׳•׳ ׳׳₪׳ ׳™ ׳¡׳•׳’׳¨
                fixed = fixed.replace(/,\s*([}\]])/g, '$1');

                // ׳ ׳¡׳” ׳׳¡׳’׳•׳¨ ׳¡׳•׳’׳¨׳™׳ ׳₪׳×׳•׳—׳™׳
                const openCurly = (fixed.match(/\{/g) || []).length;
                const closeCurly = (fixed.match(/\}/g) || []).length;
                const openSquare = (fixed.match(/\[/g) || []).length;
                const closeSquare = (fixed.match(/\]/g) || []).length;

                if (openCurly > closeCurly) {
                    fixed += '}'.repeat(openCurly - closeCurly);
                }
                if (openSquare > closeSquare) {
                    fixed = fixed.replace(/\}\s*$/, ''); // ׳”׳¡׳¨ } ׳׳—׳¨׳•׳ ׳׳ ׳™׳© ׳‘׳¢׳™׳”
                    fixed += ']'.repeat(openSquare - closeSquare) + '}';
                }

                try {
                    parsed = JSON.parse(fixed);
                    log('warn', 'Gemini JSON: salvaged truncated response with brace-closing');
                } catch (e) {
                    parseErr = e;
                }
            }

            if (!parsed) {
                log('error', 'Gemini JSON: all parse attempts failed', {
                    finishReason,
                    replyLength: reply.length,
                    replyStart: reply.substring(0, 300),
                    replyEnd: reply.substring(Math.max(0, reply.length - 200)),
                    parseError: parseErr?.message
                });
                throw new GeminiError(
                    '׳×׳©׳•׳‘׳× AI ׳׳ ׳‘׳₪׳•׳¨׳׳˜ JSON ׳×׳§׳™׳',
                    502,
                    { raw: reply.substring(0, 500), finishReason }
                );
            }

            return {
                data: parsed,
                coreLatencyMs: Date.now() - coreStart,
                attempts: attempt + 1,
            };
        } catch (error) {
            if (error instanceof GeminiError) {
                lastError = error;
                // ׳׳ ׳×׳ ׳¡׳” ׳©׳•׳‘ ׳¢׳ ׳©׳’׳™׳׳•׳× ׳©׳׳™׳ ׳ ׳–׳׳ ׳™׳•׳×
                if (error.statusCode === 502 && /MAX_TOKENS|SAFETY|RECITATION/.test(error.message)) {
                    throw error;
                }
            } else if (error.name === 'AbortError') {
                lastError = new GeminiError('׳×׳ ׳”׳–׳׳ ׳”׳§׳¦׳•׳‘', 504);
            } else {
                lastError = new GeminiError('׳×׳§׳׳× ׳×ן¿½ komunik׳” ׳–׳׳ ׳™׳×', 502, error.message);
            }

            if (attempt === retries) throw lastError;
            await sleep(backoffDelay(attempt));
        }
    }

    throw lastError;
}
async function callGeminiVision(imageBase64, mimeType, userPrompt, retries = CONFIG.visionRetries) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent?key=${CONFIG.geminiApiKey}`;

    const promptText = userPrompt && userPrompt.trim()
        ? `${VISION_SYSTEM_PROMPT}\n\n׳”׳׳©׳×׳׳© ׳©׳•׳׳: ${userPrompt.trim()}`
        : `${VISION_SYSTEM_PROMPT}\n\n׳×׳׳¨ ׳׳” ׳׳×׳” ׳¨׳•׳׳” ׳‘׳×׳׳•׳ ׳”.`;

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

    let lastError;
    const coreStart = Date.now();

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
                const rateLimited = isRateLimitError(data, response.status);
                const highDemand = isHighDemandError(data, response.status);

                if (rateLimited && attempt < retries) {
                    metrics.totalRateLimitHits += 1;
                    const retryMs = extractRetryDelay(data) || CONFIG.retryOn429DelayMs;
                    log('warn', `Vision rate limit ג€” waiting ${Math.round(retryMs / 1000)}s`);
                    await sleep(retryMs);
                    continue;
                }

                if (highDemand && attempt < retries) {
                    metrics.totalHighDemandHits += 1;
                    log('warn', `Vision high demand ג€” waiting ${Math.round(CONFIG.retryOn503DelayMs / 1000)}s`);
                    await sleep(CONFIG.retryOn503DelayMs);
                    continue;
                }

                const isRetryable = response.status >= 500;
                if (!isRetryable || attempt === retries) {
                    throw new GeminiError(
                        data.error.message || '׳©׳’׳™׳׳” ׳‘׳ ׳™׳×׳•׳— ׳”׳×׳׳•׳ ׳”',
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
            if (!reply) {
                throw new GeminiError('׳׳‘׳ ׳” ׳”׳ ׳×׳•׳ ׳™׳ ׳׳™׳ ׳• ׳×׳§׳™׳', 502, data);
            }

            return {
                reply: reply.trim(),
                coreLatencyMs: Date.now() - coreStart,
                attempts: attempt + 1,
            };
        } catch (error) {
            if (error instanceof GeminiError) {
                lastError = error;
            } else if (error.name === 'AbortError') {
                lastError = new GeminiError('׳×׳ ׳”׳–׳׳ ׳”׳§׳¦׳•׳‘', 504);
            } else {
                lastError = new GeminiError('׳×׳§׳׳× ׳×׳§׳©׳•׳¨׳× ׳–׳׳ ׳™׳×', 502, error.message);
            }

            if (attempt === retries) throw lastError;
            await sleep(backoffDelay(attempt));
        }
    }

    throw lastError;
}

// ==============================
// 14. TRANSLATION (Hebrew ג†’ English)
// ==============================

async function translateToEnglish(hebrewQuery) {
    const trimmed = String(hebrewQuery || '').trim();
    if (!trimmed) return '';

    // ׳׳ ׳–׳” ׳›׳‘׳¨ ׳‘׳׳ ׳’׳׳™׳× ג€” ׳”׳—׳–׳¨ ׳›׳׳• ׳©׳–׳”
    if (!hasHebrew(trimmed)) {
        return trimmed;
    }

    try {
        const prompt = `׳×׳¨׳’׳ ׳׳× ׳”׳‘׳™׳˜׳•׳™ ׳”׳‘׳ ׳׳׳ ׳’׳׳™׳× ׳׳“׳¢׳™׳×/׳¨׳₪׳•׳׳™׳× (׳‘׳׳™ ׳”׳¡׳‘׳¨׳™׳, ׳¨׳§ ׳”׳×׳¨׳’׳•׳):\n\n"${trimmed}"\n\n׳×׳¨׳’׳•׳:`;

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
        log('info', `Translated: "${trimmed}" ג†’ "${translated}"`);

        return translated || trimmed;
    } catch (err) {
        log('warn', `Translation failed: ${err.message}`);
        return trimmed;
    }
}

// ==============================
// 15. HELPERS ג€” YOUTUBE / TIKTOK
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
// 16. ANALYTICS SUMMARY HELPER
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
// 17. RESEARCH ג€” PAPER MAPPERS
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
        title: stripHtml(title) || '׳׳׳ ׳›׳•׳×׳¨׳×',
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
}

// ==============================
// 18. RESEARCH ג€” SOURCE 1: EUROPE PMC
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
            log('warn', `Europe PMC variant failed`, { q: q.substring(0, 60), err: err.message });
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
// 19. RESEARCH ג€” SOURCE 2: PUBMED (E-UTILITIES)
// ==============================

const PUBMED_ESEARCH_API = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
const PUBMED_ESUMMARY_API = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';

async function fetchFromPubMed(query, limit) {
    const cleanQuery = String(query).trim().slice(0, 200);
    if (!cleanQuery) return [];

    try {
        const searchUrl = `${PUBMED_ESEARCH_API}?db=pubmed&term=${encodeURIComponent(cleanQuery)}&retmax=${limit}&retmode=json&sort=relevance`;
        const searchRes = await fetchWithTimeout(searchUrl, { method: 'GET' }, CONFIG.researchTimeoutMs);
        if (!searchRes.ok) return [];

        const searchData = await searchRes.json();
        const ids = searchData?.esearchresult?.idlist || [];

        if (!ids.length) {
            recordSourceHit('PubMed', 0);
            return [];
        }

        const summaryUrl = `${PUBMED_ESUMMARY_API}?db=pubmed&id=${ids.join(',')}&retmode=json`;
        const summaryRes = await fetchWithTimeout(summaryUrl, { method: 'GET' }, CONFIG.researchTimeoutMs);
        if (!summaryRes.ok) return [];

        const summaryData = await summaryRes.json();
        const results = summaryData?.result || {};

        const papers = ids
            .map((id) => {
                const item = results[id];
                if (!item) return null;

                return createPaperObject({
                    id,
                    source: 'PubMed',
                    title: item.title || '',
                    abstract: '',
                    authors: Array.isArray(item.authors)
                        ? item.authors.map((a) => a.name).join(', ')
                        : '',
                    year: (item.pubdate || '').substring(0, 4),
                    journal: item.fulljournalname || item.source || '',
                    citedBy: 0,
                    doi: '',
                    url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
                    openAccess: false,
                });
            })
            .filter(Boolean);

        recordSourceHit('PubMed', papers.length);
        log('info', `PubMed: ${papers.length} papers`);
        return papers;
    } catch (err) {
        log('warn', `PubMed failed: ${err.message}`);
        recordSourceHit('PubMed', 0);
        return [];
    }
}

// ==============================
// 20. RESEARCH ג€” SOURCE 3: OPENALEX
// ==============================

const OPENALEX_API = 'https://api.openalex.org/works';

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

function reconstructOpenAlexAbstract(invertedIndex) {
    if (!invertedIndex || typeof invertedIndex !== 'object') return '';
    const positions = [];
    for (const [word, idxs] of Object.entries(invertedIndex)) {
        if (!Array.isArray(idxs)) continue;
        for (const idx of idxs) {
            positions.push({ word, idx });
        }
    }
    positions.sort((a, b) => a.idx - b.idx);
    return positions.map((p) => p.word).join(' ');
}

// ==============================
// 21. RESEARCH ג€” SOURCE 4: SEMANTIC SCHOLAR
// ==============================

const SEMANTIC_SCHOLAR_API = 'https://api.semanticscholar.org/graph/v1/paper/search';

async function fetchFromSemanticScholar(query, limit) {
    const cleanQuery = String(query).trim().slice(0, 200);
    if (!cleanQuery) return [];

    try {
        const fields = 'title,abstract,authors,year,venue,citationCount,externalIds,openAccessPdf,url';
        const url = `${SEMANTIC_SCHOLAR_API}?query=${encodeURIComponent(cleanQuery)}&limit=${limit}&fields=${fields}`;

        const headers = { 'Accept': 'application/json' };
        if (CONFIG.semanticScholarKey) {
            headers['x-api-key'] = CONFIG.semanticScholarKey;
        }

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
// 22. RESEARCH ג€” SOURCE 5: CROSSREF
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
// 23. RESEARCH ג€” SOURCE 6: DOAJ
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
// 24. RESEARCH ג€” SOURCE 7: bioRxiv
// ==============================

const BIORXIV_API = 'https://api.biorxiv.org/details/biorxiv';

async function fetchFromBioRxiv(query, limit) {
    const cleanQuery = String(query).trim().toLowerCase().slice(0, 200);
    if (!cleanQuery) return [];

    try {
        // bioRxiv ׳׳ ׳×׳•׳׳ ׳‘׳—׳™׳₪׳•׳© ׳—׳•׳₪׳©׳™ ׳˜׳•׳‘ - ׳ ׳ ׳¡׳” ׳“׳¨׳ search ׳©׳׳”׳
        const url = `https://api.biorxiv.org/details/biorxiv/2020-01-01/2026-12-31/${limit}`;
        const response = await fetchWithTimeout(url, { method: 'GET' }, CONFIG.researchTimeoutMs);
        if (!response.ok) {
            recordSourceHit('bioRxiv', 0);
            return [];
        }

        const data = await response.json();
        const results = data?.collection || [];

        // ׳¡׳ ׳ ׳×׳•׳¦׳׳•׳× ׳¨׳׳•׳•׳ ׳˜׳™׳•׳×
        const queryWords = cleanQuery.split(/\s+/).filter((w) => w.length > 2);
        const filtered = results.filter((item) => {
            const combined = `${item.title || ''} ${item.abstract || ''}`.toLowerCase();
            return queryWords.some((w) => combined.includes(w));
        });

        const papers = filtered.slice(0, limit).map((item) => {
            const authors = item.authors || '';
            const doi = item.doi || '';

            return createPaperObject({
                id: doi,
                source: 'bioRxiv',
                title: item.title || '',
                abstract: item.abstract || '',
                authors,
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
// 25. RESEARCH ג€” SOURCE 8: CORE
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
// 26. RESEARCH ג€” AGGREGATOR
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

    // Title match ג€” ׳§׳¨׳™׳˜׳™
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

    // Abstract density
    if (abstract) {
        try {
            const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const matches = abstract.match(new RegExp(esc, 'g')) || [];
            score += Math.min(matches.length * 8, 40);
        } catch (e) {
            // ignore
        }
    }

    // Study type boost
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

    // Health keywords in title
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

    // Off-topic penalty
    const offTopicKeywords = [
        'endometriosis', 'breast cancer', 'bariatric', 'sleep apnea',
        'obstructive', 'ohmic', 'listeria', 'clostridioides', 'biofilm',
        'preservative', 'shelf life', 'menopause', 'pregnancy',
        'infant formula', 'neonatal', 'pediatric oncology',
    ];

    for (const kw of offTopicKeywords) {
        if (title.includes(kw)) score -= 250;
    }

    // Citation boost (capped)
    score += Math.min(paper.citedBy || 0, 500) / 20;

    // Open access boost (small)
    if (paper.openAccess) score += 5;

    return score;
}

async function searchAllSources(query, limitPerSource) {
    log('info', `Research aggregator starting: "${query}"`);

    const results = await Promise.allSettled([
        fetchFromEuropePMC(query, limitPerSource),
        fetchFromPubMed(query, limitPerSource),
        fetchFromOpenAlex(query, limitPerSource),
        fetchFromSemanticScholar(query, limitPerSource),
        fetchFromCrossRef(query, limitPerSource),
        fetchFromDOAJ(query, limitPerSource),
        fetchFromBioRxiv(query, limitPerSource),
        fetchFromCORE(query, limitPerSource),
    ]);

    const allPapers = [];
    const sourceSummary = [];

    for (const result of results) {
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
            allPapers.push(...result.value);
        }
    }

    metrics.totalPapersFetched += allPapers.length;
    log('info', `Total fetched: ${allPapers.length} papers from 8 sources`);

    const unique = deduplicatePapers(allPapers);
    log('info', `After dedup: ${unique.length} papers`);

    unique.sort((a, b) => scorePaperRelevance(b, query) - scorePaperRelevance(a, query));

    return unique;
}

// ==============================
// 27. RESEARCH ג€” ANALYSIS WITH AI
// ==============================

function buildFallbackSummary(query, englishQuery, papers) {
    const top = papers.slice(0, 5);
    const list = top.map((p, i) => {
        const citations = p.citedBy ? ` ג€¢ ${p.citedBy} ׳¦׳™׳˜׳•׳˜׳™׳` : '';
        const year = p.year ? ` (${p.year})` : '';
        const source = p.source ? ` [${p.source}]` : '';
        return `${i + 1}. **"${truncate(p.title, 120)}"**${year}${citations}${source}`;
    }).join('\n');

    const wasTranslated = englishQuery && englishQuery !== query;

    return {
        verdict: 'ג ן¸ ׳¡׳™׳›׳•׳ AI ׳׳ ׳–׳׳™׳ ׳›׳¨׳’׳¢',
        summary: `׳׳¦׳׳×׳™ ${papers.length} ׳׳—׳§׳¨׳™׳ ׳¨׳׳•׳•׳ ׳˜׳™׳™׳ ׳¢׳ "${query}"${wasTranslated ? ` (׳—׳™׳₪׳•׳©: "${englishQuery}")` : ''}.

׳”׳ ׳” ׳”׳׳—׳§׳¨׳™׳ ׳”׳׳•׳‘׳™׳׳™׳:

${list}

נ’¡ ׳ ׳¡׳” ׳©׳•׳‘ ׳‘׳¢׳•׳“ ׳“׳§׳” ׳›׳“׳™ ׳׳§׳‘׳ ׳¡׳™׳›׳•׳ AI ׳׳׳ ׳¢׳ ׳×׳•׳‘׳ ׳•׳× ׳•׳׳™׳×׳•׳¡.`,
        myth: '',
        fallback: true,
        wasTranslated,
    };
}

async function analyzeResearchWithAI(query, englishQuery, papers) {
    const topPapers = papers.slice(0, CONFIG.researchAnalysisTopPapers);

    const papersText = topPapers.map((p, i) => {
        const cite = p.citedBy ? ` [${p.citedBy} citations]` : '';
        const source = p.source ? ` [${p.source}]` : '';
        const snippet = truncate(p.abstract || '׳׳ ׳–׳׳™׳', CONFIG.researchAbstractSnippetLength);
        return `[${i + 1}] "${p.title}" (${p.year})${cite}${source}\n׳×׳§׳¦׳™׳¨: ${snippet}\n`;
    }).join('\n');

    const wasTranslated = englishQuery && englishQuery !== query;

    const prompt = `׳׳×׳” ׳׳“׳¢׳-׳¢׳ ׳‘׳›׳™׳¨. ׳”׳©׳׳׳” ׳©׳׳™: "${query}"${wasTranslated ? `\n(׳—׳™׳₪׳©׳×׳™ ׳‘׳׳׳’׳¨׳™ ׳׳—׳§׳¨׳™׳ ׳‘׳™׳ ׳׳׳•׳׳™׳™׳ ׳¢׳ ׳”׳׳•׳ ׳—: "${englishQuery}")` : ''}

׳”׳ ׳” ${topPapers.length} ׳”׳׳—׳§׳¨׳™׳ ׳”׳¨׳׳•׳•׳ ׳˜׳™׳™׳ ׳‘׳™׳•׳×׳¨ ׳©׳ ׳׳¦׳׳•:

${papersText}

---

׳¢׳ ׳” ׳‘׳׳‘׳ ׳” ׳”׳–׳” ׳‘׳“׳™׳•׳§, ׳‘׳¢׳‘׳¨׳™׳×, ׳‘׳׳™ ׳”׳§׳“׳׳•׳×, ׳‘׳׳™ ׳׳¨׳›׳׳•׳× ׳׳™׳•׳×׳¨׳•׳×:

[VERDICT]
׳›׳ / ׳׳ / ׳×׳׳•׳™ / ׳׳ ׳‘׳¨׳•׳¨ ג€” ׳׳©׳₪׳˜ ׳׳—׳“ ׳—׳“ ׳•׳—׳“-׳׳©׳׳¢׳™.
[/VERDICT]

[SUMMARY]
3-4 ׳׳©׳₪׳˜׳™׳ ׳׳‘׳•׳¡׳¡׳™׳ **׳¨׳§** ׳¢׳ ׳”׳׳—׳§׳¨׳™׳ ׳©׳׳׳¢׳׳”. ׳×׳ ׳׳¡׳₪׳¨׳™׳ ׳¡׳₪׳¦׳™׳₪׳™׳™׳ ׳׳ ׳™׳©. ׳׳ ׳”׳׳—׳§׳¨׳™׳ ׳׳ ׳¢׳•׳ ׳™׳ ׳™׳©׳™׳¨׳•׳× ג€” ׳׳׳•׳¨ ׳׳× ׳–׳” ׳‘׳׳₪׳•׳¨׳©.
[/SUMMARY]

[MYTH]
׳׳™׳×׳•׳¡ ׳׳—׳“ ׳ ׳₪׳•׳¥ ׳¢׳ ׳”׳ ׳•׳©׳ + ׳”׳׳׳× ׳©׳׳—׳§׳¨׳™׳ ׳׳¨׳׳™׳. 2-3 ׳׳©׳₪׳˜׳™׳.
[/MYTH]

[LIMITATIONS]
׳׳©׳₪׳˜ ׳׳—׳“: ׳׳” ׳”׳׳—׳§׳¨׳™׳ ׳”׳׳׳” **׳׳** ׳׳•׳׳¨׳™׳, ׳׳• ׳׳” ׳¢׳•׳“ ׳¦׳¨׳™׳ ׳׳—׳§׳•׳¨.
[/LIMITATIONS]

׳¡׳’׳ ׳•׳: ׳™׳©׳™׳¨, ׳׳“׳¢׳™, ׳׳‘׳•׳¡׳¡ ׳¨׳׳™׳•׳×. ׳¢׳‘׳¨׳™׳×.`;

    const { reply } = await callGemini({
        systemInstruction: '׳׳×׳” ׳׳“׳¢׳-׳¢׳. ׳×׳ ׳×׳©׳•׳‘׳•׳× ׳׳“׳•׳™׳§׳•׳×, ׳׳‘׳•׳¡׳¡׳•׳× ׳¨׳׳™׳•׳×, ׳‘׳¢׳‘׳¨׳™׳×.',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        temperature: 0.4,
        maxOutputTokens: 1500,
        timeoutMs: CONFIG.geminiTimeoutMs,
        retries: CONFIG.defaultRetries,
    });

    const verdictMatch = reply.match(/\[VERDICT\]([\s\S]*?)\[\/VERDICT\]/i);
    const summaryMatch = reply.match(/\[SUMMARY\]([\s\S]*?)\[\/SUMMARY\]/i);
    const mythMatch = reply.match(/\[MYTH\]([\s\S]*?)\[\/MYTH\]/i);
    const limitationsMatch = reply.match(/\[LIMITATIONS\]([\s\S]*?)\[\/LIMITATIONS\]/i);

    return {
        verdict: verdictMatch ? verdictMatch[1].trim() : '׳׳ ׳‘׳¨׳•׳¨',
        summary: summaryMatch ? summaryMatch[1].trim() : reply,
        myth: mythMatch ? mythMatch[1].trim() : '',
        limitations: limitationsMatch ? limitationsMatch[1].trim() : '',
        fallback: false,
        wasTranslated,
    };
}// ==============================
// 28. EXPRESS SETUP
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
            log('info', `${req.method} ${req.path} ג†’ ${res.statusCode} (${duration}ms)`);
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
    message: { reply: '׳׳“׳•׳, ׳™׳•׳×׳¨ ׳׳“׳™ ׳‘׳§׳©׳•׳× ׳‘׳–׳׳ ׳§׳¦׳¨.' },
});

const visionRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: CONFIG.visionRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { reply: '׳׳“׳•׳, ׳™׳•׳×׳¨ ׳׳“׳™ ׳‘׳§׳©׳•׳× ׳ ׳™׳×׳•׳— ׳×׳׳•׳ ׳”.' },
});

const researchRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: CONFIG.researchRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { reply: '׳׳“׳•׳, ׳™׳•׳×׳¨ ׳׳“׳™ ׳‘׳§׳©׳•׳× ׳׳—׳§׳¨.' },
});

// ==============================
// 29. ROUTES ג€” ROOT
// ==============================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==============================
// 30. ROUTES ג€” HEALTH & METRICS
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
            totalTranslationRequests: metrics.totalTranslationRequests,
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
// 31. ROUTES ג€” KNOWLEDGE
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
            return res.status(400).json({ error: '׳—׳¡׳¨ ׳©׳ ׳§׳•׳‘׳¥' });
        }
        if (!content || typeof content !== 'string') {
            return res.status(400).json({ error: '׳—׳¡׳¨ ׳×׳•׳›׳ ׳׳§׳•׳‘׳¥' });
        }

        const safeName = path.basename(name).replace(/[^\p{L}\p{N}\-_. ]/gu, '_');

        if (!/\.(txt|md)$/i.test(safeName)) {
            return res.status(400).json({ error: '׳¨׳§ ׳§׳‘׳¦׳™ .txt ׳׳• .md ׳ ׳×׳׳›׳™׳' });
        }

        if (Buffer.byteLength(content, 'utf8') > CONFIG.knowledgeMaxFileSizeBytes) {
            return res.status(413).json({ error: '׳”׳§׳•׳‘׳¥ ׳’׳“׳•׳ ׳׳“׳™' });
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
        res.status(500).json({ error: '׳”׳¢׳׳׳” ׳ ׳›׳©׳׳”: ' + err.message });
    }
});

app.delete('/api/knowledge/:name', (req, res) => {
    try {
        const safeName = path.basename(req.params.name || '');

        if (!safeName || !/\.(txt|md)$/i.test(safeName)) {
            return res.status(400).json({ error: '׳©׳ ׳§׳•׳‘׳¥ ׳׳ ׳×׳§׳™׳' });
        }

        const fullPath = path.join(CONFIG.knowledgeDir, safeName);

        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: '׳”׳§׳•׳‘׳¥ ׳׳ ׳ ׳׳¦׳' });
        }

        const resolved = path.resolve(fullPath);
        const baseDir = path.resolve(CONFIG.knowledgeDir);

        if (!resolved.startsWith(baseDir + path.sep)) {
            return res.status(400).json({ error: '׳ ׳×׳™׳‘ ׳׳ ׳—׳•׳§׳™' });
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
        res.status(500).json({ error: '׳׳—׳™׳§׳” ׳ ׳›׳©׳׳”: ' + err.message });
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
        res.status(500).json({ error: '׳˜׳¢׳™׳ ׳” ׳׳—׳“׳© ׳ ׳›׳©׳׳”', message: err.message });
    }
});

// ==============================
// 32. ROUTES ג€” ASK
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
            return res.status(400).json({ reply: '׳׳“׳•׳, ׳׳ ׳”׳×׳§׳‘׳׳” ׳©׳׳׳” ׳×׳§׳™׳ ׳” ׳׳¢׳™׳‘׳•׳“.' });
        }

        const userQuery = rawQuery.trim();

        if (userQuery.length > CONFIG.maxPromptLength) {
            metrics.totalErrors += 1;
            recordError('Prompt too long');
            return res.status(413).json({
                reply: `׳׳“׳•׳, ׳”׳©׳׳׳” ׳׳¨׳•׳›׳” ׳׳“׳™ (׳׳§׳¡׳™׳׳•׳ ${CONFIG.maxPromptLength} ׳×׳•׳•׳™׳).`,
            });
        }

        const history = sanitizeHistory(rawHistory);
        metrics.totalHistoryMessagesSent += history.length;

        metrics.totalKnowledgeLookups += 1;
        const matchedChunks = searchKnowledge(userQuery);
        const knowledgeContext = buildKnowledgeContext(matchedChunks);

        if (matchedChunks.length > 0) {
            metrics.totalKnowledgeHits += 1;
            log('info', `Knowledge hit ג€” ${matchedChunks.length} chunks`);
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
// 33. ROUTES ג€” ANALYZE (Analytics)
// ==============================

app.post('/api/analyze', apiRateLimiter, async (req, res, next) => {
    const requestStart = Date.now();
    metrics.totalRequests += 1;

    try {
        const videos = req.body?.videos;

        if (!Array.isArray(videos) || videos.length === 0) {
            return res.status(400).json({ reply: '׳׳™׳ ׳ ׳×׳•׳ ׳™׳ ׳׳ ׳™׳×׳•׳—' });
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
            return `${i + 1}. [${v.platform || 'youtube'}] "${title}" | ${v.date || 'ג€”'} | ${v.duration || 0}s | ${(v.views || 0).toLocaleString()} ׳¦׳₪׳™׳•׳× | ${v.likes || 0} ׳׳™׳™׳§׳™׳ (${vr}%) | ${v.comments || 0} ׳×׳’׳•׳‘׳•׳× (${cr}%)`;
        }).join('\n');

        const platformBlock = Object.entries(platformStats).map(([name, s]) => {
            const avgViews = Math.round(s.views / s.count);
            const pr = s.views ? (s.likes / s.views * 100).toFixed(2) : 0;
            const cr = s.views ? (s.comments / s.views * 100).toFixed(3) : 0;
            return `**${name}**: ${s.count} ׳¡׳¨׳˜׳•׳ ׳™׳ | ${s.views.toLocaleString()} ׳¦׳₪׳™׳•׳× | ׳׳׳•׳¦׳¢ ${avgViews} ׳¦׳₪׳™׳•׳×/׳¡׳¨׳˜׳•׳ | ׳™׳—׳¡ ׳׳™׳™׳§׳™׳ ${pr}% | ׳™׳—׳¡ ׳×׳’׳•׳‘׳•׳× ${cr}%`;
        }).join('\n');

        const durationBlock = [
            `- **׳§׳¦׳¨׳™׳ (׳¢׳“ 10s)**: ${durationBuckets.short.length} ׳¡׳¨׳˜׳•׳ ׳™׳, ׳׳׳•׳¦׳¢ ${durationBuckets.short.length ? Math.round(durationBuckets.short.reduce((s, v) => s + (Number(v.views) || 0), 0) / durationBuckets.short.length) : 0} ׳¦׳₪׳™׳•׳×/׳¡׳¨׳˜׳•׳`,
            `- **׳‘׳™׳ ׳•׳ ׳™׳™׳ (11-20s)**: ${durationBuckets.medium.length} ׳¡׳¨׳˜׳•׳ ׳™׳, ׳׳׳•׳¦׳¢ ${durationBuckets.medium.length ? Math.round(durationBuckets.medium.reduce((s, v) => s + (Number(v.views) || 0), 0) / durationBuckets.medium.length) : 0} ׳¦׳₪׳™׳•׳×/׳¡׳¨׳˜׳•׳`,
            `- **׳׳¨׳•׳›׳™׳ (21s+)**: ${durationBuckets.long.length} ׳¡׳¨׳˜׳•׳ ׳™׳, ׳׳׳•׳¦׳¢ ${durationBuckets.long.length ? Math.round(durationBuckets.long.reduce((s, v) => s + (Number(v.views) || 0), 0) / durationBuckets.long.length) : 0} ׳¦׳₪׳™׳•׳×/׳¡׳¨׳˜׳•׳`,
        ].join('\n');

        const topBlock = top5.map((v, i) => {
            const vr = v.views ? ((v.likes || 0) / v.views * 100).toFixed(2) : '0';
            return `${i + 1}. [${v.platform || 'youtube'}] "${truncate(v.title, 80)}" ג€” ${(v.views || 0).toLocaleString()} ׳¦׳₪׳™׳•׳× | ${v.likes || 0} ׳׳™׳™׳§׳™׳ (${vr}%) | ${v.comments || 0} ׳×׳’׳•׳‘׳•׳× | ${v.duration || 0}s`;
        }).join('\n');

        const bottomBlock = bottom5.map((v, i) => {
            const vr = v.views ? ((v.likes || 0) / v.views * 100).toFixed(2) : '0';
            return `${i + 1}. [${v.platform || 'youtube'}] "${truncate(v.title, 80)}" ג€” ${(v.views || 0).toLocaleString()} ׳¦׳₪׳™׳•׳× | ${v.likes || 0} ׳׳™׳™׳§׳™׳ (${vr}%) | ${v.duration || 0}s`;
        }).join('\n');

        const engagementBlock = engagementChamps.map((v, i) => {
            const vr = ((v.likes || 0) / (v.views || 1) * 100).toFixed(2);
            return `${i + 1}. [${v.platform || 'youtube'}] "${truncate(v.title, 80)}" ג€” ${vr}% ׳™׳—׳¡ ׳׳™׳™׳§׳™׳ (${v.likes}/${v.views})`;
        }).join('\n');

        const commentBlock = commentChamps.length
            ? commentChamps.map((v, i) => {
                const cr = ((v.comments / v.views) * 100).toFixed(3);
                return `${i + 1}. "${truncate(v.title, 80)}" ג€” ${v.comments} ׳×׳’׳•׳‘׳•׳× (${cr}% ׳-${v.views} ׳¦׳₪׳™׳•׳×)`;
            }).join('\n')
            : '׳׳™׳ ׳¡׳¨׳˜׳•׳ ׳™׳ ׳¢׳ ׳×׳’׳•׳‘׳•׳×.';

        const prompt = `׳׳×׳” ׳׳ ׳׳™׳¡׳˜ ׳×׳•׳›׳ ׳׳’׳¨׳¡׳™׳‘׳™ ׳•׳׳“׳•׳™׳§. ׳׳×׳” ׳׳ ׳×׳— ׳ ׳×׳•׳ ׳™ ׳‘׳™׳¦׳•׳¢׳™׳ ׳©׳ ׳™׳•׳¦׳¨ ׳×׳•׳›׳ ׳§׳׳™׳¡׳˜׳ ׳™׳§׳¡.
׳”׳׳˜׳¨׳” ׳©׳׳: **׳׳×׳× ׳׳• ׳×׳•׳‘׳ ׳•׳× ׳©׳™׳¢׳–׳¨׳• ׳׳• ׳׳™׳™׳¦׳¨ ׳×׳•׳›׳ ׳•׳™׳¨׳׳׳™ ׳™׳•׳×׳¨ ג€” ׳׳ ׳׳׳˜׳£ ׳׳’׳•.**

## נ“ ׳”׳ ׳×׳•׳ ׳™׳ ׳”׳׳׳׳™׳

### ׳˜׳‘׳׳× ׳›׳ ׳”׳¡׳¨׳˜׳•׳ ׳™׳ (׳׳׳•׳™׳ ׳׳₪׳™ ׳¦׳₪׳™׳•׳×)
${detailedTable}

### ׳¡׳™׳›׳•׳ ׳›׳׳׳™
- ׳¡׳”"׳› ׳¡׳¨׳˜׳•׳ ׳™׳: ${totals.count}
- ׳¡׳”"׳› ׳¦׳₪׳™׳•׳×: ${totals.views.toLocaleString()}
- ׳¡׳”"׳› ׳׳™׳™׳§׳™׳: ${totals.likes.toLocaleString()} (׳™׳—׳¡: ${ratio}%)
- ׳¡׳”"׳› ׳×׳’׳•׳‘׳•׳×: ${totals.comments} (׳™׳—׳¡: ${commentRatio}%)
- ׳¡׳”"׳› ׳©׳™׳×׳•׳₪׳™׳: ${totals.shares}
- ׳¡׳”"׳› ׳׳ ׳•׳™׳™׳ ׳—׳“׳©׳™׳: ${totals.subscribers}
- **׳—׳¦׳™׳•׳ ׳¦׳₪׳™׳•׳×**: ${medianViews.toLocaleString()}

### ׳₪׳™׳׳•׳— ׳׳₪׳™ ׳₪׳׳˜׳₪׳•׳¨׳׳”
${platformBlock}

### ׳₪׳™׳׳•׳— ׳׳₪׳™ ׳׳•׳¨׳ ׳¡׳¨׳˜׳•׳
${durationBlock}

### 5 ׳”׳¡׳¨׳˜׳•׳ ׳™׳ ׳”׳׳¦׳׳™׳—׳™׳ ׳‘׳™׳•׳×׳¨ (Top 5)
${topBlock}

### 5 ׳”׳¡׳¨׳˜׳•׳ ׳™׳ ׳”׳—׳׳©׳™׳ ׳‘׳™׳•׳×׳¨ (Bottom 5)
${bottomBlock}

### ׳”׳¡׳¨׳˜׳•׳ ׳™׳ ׳¢׳ ׳™׳—׳¡ ׳”׳׳¢׳•׳¨׳‘׳•׳× ׳”׳’׳‘׳•׳” ׳‘׳™׳•׳×׳¨
${engagementBlock}

### ׳”׳¡׳¨׳˜׳•׳ ׳™׳ ׳¢׳ ׳”׳›׳™ ׳”׳¨׳‘׳” ׳×׳’׳•׳‘׳•׳×
${commentBlock}

---

## נ¯ ׳”׳׳©׳™׳׳” ׳©׳׳

׳×׳ ׳ ׳™׳×׳•׳— **׳׳׳™׳×׳™, ׳—׳“, ׳•׳‘׳™׳§׳•׳¨׳×׳™**. 

**׳׳¡׳•׳¨ ׳׳:**
- ג ׳׳—׳׳™׳ ("׳›׳ ׳”׳›׳‘׳•׳“!", "׳׳¢׳•׳׳”!")
- ג ׳׳—׳–׳•׳¨ ׳¢׳ ׳”׳ ׳×׳•׳ ׳™׳ ׳‘׳׳™ ׳׳₪׳¨׳©
- ג ׳׳×׳× ׳¢׳¦׳•׳× ׳’׳ ׳¨׳™׳•׳×
- ג ׳׳—׳–׳•׳¨ ׳¢׳ ׳׳” ׳©׳”׳׳©׳×׳׳© ׳›׳‘׳¨ ׳™׳•׳“׳¢

## נ“ ׳”׳₪׳•׳¨׳׳˜ ׳”׳׳“׳•׳™׳§

### נ¯ ׳׳” ׳¢׳•׳‘׳“ **׳‘׳׳׳×** (׳•׳׳׳”)
3 ׳×׳•׳‘׳ ׳•׳× ׳¡׳₪׳¦׳™׳₪׳™׳•׳× ׳•׳׳‘׳•׳¡׳¡׳•׳× ׳׳¡׳₪׳¨׳™׳.

### נ”´ ׳”׳‘׳¢׳™׳•׳× ׳”׳׳׳™׳×׳™׳•׳×
3 ׳‘׳¢׳™׳•׳× ׳§׳•׳ ׳§׳¨׳˜׳™׳•׳×. ׳×׳’׳™׳“ ׳׳× ׳”׳׳׳×.

### נ¬ ׳ ׳™׳×׳•׳— ׳”-hook (2 ׳”׳©׳ ׳™׳•׳× ׳”׳¨׳׳©׳•׳ ׳•׳×)
׳ ׳×׳— ׳׳× ׳”׳¡׳¨׳˜׳•׳ ׳”׳˜׳•׳‘ ׳‘׳™׳•׳×׳¨ ׳׳•׳ ׳”׳’׳¨׳•׳¢ ׳‘׳™׳•׳×׳¨.

### נ“ ׳”׳₪׳׳˜׳₪׳•׳¨׳׳•׳× ג€” ׳׳׳× ׳§׳©׳”
׳׳™׳–׳• ׳₪׳׳˜׳₪׳•׳¨׳׳” ׳‘׳–׳‘׳– ׳–׳׳? ׳¢׳ ׳׳¡׳₪׳¨׳™׳ ׳¡׳₪׳¦׳™׳₪׳™׳™׳.

### נ”¬ ׳ ׳™׳×׳•׳— ׳›׳•׳×׳¨׳•׳×
׳׳” ׳¢׳‘׳“ ׳•׳׳” ׳׳? ׳׳” ׳”׳”׳‘׳“׳ ׳‘׳™׳ Top 3 ׳-Bottom 3?

### נ€ 5 ׳›׳•׳×׳¨׳•׳× ׳׳“׳•׳™׳§׳•׳× ׳׳¡׳¨׳˜׳•׳ ׳”׳‘׳
5 ׳›׳•׳×׳¨׳•׳× ׳¡׳₪׳¦׳™׳₪׳™׳•׳× ׳©׳׳₪׳©׳¨ ׳׳”׳©׳×׳׳© ׳‘׳”׳ ׳׳—׳¨ ׳‘׳‘׳•׳§׳¨.

### ג ן¸ ׳”׳׳׳× ׳©׳׳×׳” ׳׳ ׳¨׳•׳¦׳” ׳׳©׳׳•׳¢
׳׳©׳”׳• ׳׳—׳“ ׳©׳׳×׳” ׳¢׳•׳©׳” ׳׳ ׳ ׳›׳•׳ ׳•׳׳×׳” ׳׳ ׳©׳ ׳׳‘. ׳‘׳׳™ ׳׳¨׳›׳.

### נ¯ ׳×׳•׳›׳ ׳™׳× ׳₪׳¢׳•׳׳” ׳׳©׳‘׳•׳¢ ׳”׳‘׳
3 ׳₪׳¢׳•׳׳•׳× ׳§׳•׳ ׳§׳¨׳˜׳™׳•׳× ׳׳¢׳©׳•׳× ׳‘׳©׳‘׳•׳¢ ׳”׳§׳¨׳•׳‘.

׳¡׳’׳ ׳•׳: ׳™׳©׳™׳¨, ׳‘׳™׳§׳•׳¨׳×׳™, ׳׳‘׳•׳¡׳¡ ׳׳¡׳₪׳¨׳™׳. ׳¢׳‘׳¨׳™׳×. ׳‘׳׳™ ׳”׳§׳“׳׳•׳×.`;

        const { reply, coreLatencyMs, attempts } = await callGemini({
            systemInstruction: '׳׳×׳” ׳׳ ׳׳™׳¡׳˜ ׳×׳•׳›׳ ׳׳’׳¨׳¡׳™׳‘׳™. ׳×׳ ׳ ׳™׳×׳•׳— ׳™׳©׳™׳¨, ׳‘׳™׳§׳•׳¨׳×׳™, ׳׳‘׳•׳¡׳¡ ׳׳¡׳₪׳¨׳™׳.',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            temperature: 0.6,
            maxOutputTokens: 2048,
            timeoutMs: CONFIG.geminiTimeoutMs,
            retries: CONFIG.defaultRetries,
        });

        const totalRoundTripMs = Date.now() - requestStart;
        metrics.totalSuccess += 1;
        recordLatency(coreLatencyMs);

        log('info', `Analyze OK`, { videos: videos.length, coreLatencyMs, totalRoundTripMs, attempts });

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
// 34. ROUTES ג€” VISION
// ==============================

app.post('/api/vision', visionRateLimiter, async (req, res, next) => {
    const requestStart = Date.now();
    metrics.totalRequests += 1;
    metrics.totalVisionRequests += 1;

    try {
        const { image, mimeType, prompt } = req.body || {};

        if (!image || typeof image !== 'string') {
            return res.status(400).json({ reply: '׳׳“׳•׳, ׳׳ ׳”׳×׳§׳‘׳׳” ׳×׳׳•׳ ׳”.' });
        }

        const safeMime = (typeof mimeType === 'string' && /^image\/(jpeg|png|webp)$/i.test(mimeType))
            ? mimeType
            : 'image/jpeg';

        const estimatedBytes = Math.floor((image.length * 3) / 4);
        if (estimatedBytes > CONFIG.maxImageSizeBytes) {
            return res.status(413).json({ reply: '׳׳“׳•׳, ׳”׳×׳׳•׳ ׳” ׳’׳“׳•׳׳” ׳׳“׳™.' });
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
// 35. ROUTES ג€” YOUTUBE
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
            return res.status(400).json({ error: '׳—׳¡׳¨ ׳§׳™׳©׳•׳¨ ׳׳• ׳׳–׳”׳” ׳©׳ ׳¡׳¨׳˜׳•׳' });
        }

        const videoId = extractYouTubeId(input);

        if (!videoId) {
            metrics.totalErrors += 1;
            recordError('Invalid YouTube URL/ID');
            return res.status(400).json({ error: '׳§׳™׳©׳•׳¨ ׳׳ ׳×׳§׳™׳ ג€” ׳׳ ׳”׳¦׳׳—׳×׳™ ׳׳—׳׳¥ ׳׳–׳”׳” ׳¡׳¨׳˜׳•׳' });
        }

        if (!CONFIG.youtubeApiKey) {
            return res.status(500).json({ error: 'YOUTUBE_API_KEY ׳׳ ׳׳•׳’׳“׳¨ ׳‘׳©׳¨׳×' });
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
            return res.status(404).json({ error: '׳”׳¡׳¨׳˜׳•׳ ׳׳ ׳ ׳׳¦׳ ג€” ׳™׳™׳×׳›׳ ׳©׳”׳•׳ ׳₪׳¨׳˜׳™ ׳׳• ׳ ׳׳—׳§' });
        }

        const video = data.items[0];
        const snippet = video.snippet || {};
        const stats = video.statistics || {};
        const contentDetails = video.contentDetails || {};

        const publishedAt = (snippet.publishedAt || '').split('T')[0] || '';

        const result = {
            id: videoId,
            title: snippet.title || '׳׳׳ ׳›׳•׳×׳¨׳×',
            publishedAt,
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

// ==============================
// 36. ROUTES ג€” TIKTOK
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
            return res.status(400).json({ error: '׳—׳¡׳¨ ׳§׳™׳©׳•׳¨ TikTok' });
        }

        const videoId = extractTikTokId(url);

        if (!videoId) {
            metrics.totalErrors += 1;
            recordError('Invalid TikTok URL');
            return res.status(400).json({ error: '׳§׳™׳©׳•׳¨ TikTok ׳׳ ׳×׳§׳™׳ ג€” ׳׳ ׳”׳¦׳׳—׳×׳™ ׳׳—׳׳¥ ׳׳–׳”׳” ׳¡׳¨׳˜׳•׳' });
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
                return res.status(404).json({ error: '׳”׳¡׳¨׳˜׳•׳ ׳׳ ׳ ׳׳¦׳ ג€” ׳™׳™׳×׳›׳ ׳©׳”׳•׳ ׳₪׳¨׳˜׳™ ׳׳• ׳ ׳׳—׳§' });
            }
            if (response.status === 403 || response.status === 429) {
                return res.status(429).json({ error: 'TikTok ׳—׳•׳¡׳ ׳‘׳§׳©׳•׳× ׳›׳¨׳’׳¢ ג€” ׳ ׳¡׳” ׳©׳•׳‘ ׳‘׳¢׳•׳“ ׳“׳§׳”' });
            }
            return res.status(502).json({ error: 'TikTok ׳׳ ׳–׳׳™׳ ׳›׳¨׳’׳¢ ג€” ׳ ׳¡׳” ׳©׳•׳‘ ׳‘׳¢׳•׳“ ׳“׳§׳”' });
        }

        const data = await response.json();

        if (!data || !data.title) {
            return res.status(404).json({ error: '׳׳ ׳”׳¦׳׳—׳×׳™ ׳׳—׳׳¥ ׳׳™׳“׳¢ ׳׳”׳¡׳¨׳˜׳•׳' });
        }

        const result = {
            id: videoId,
            title: data.title || '׳׳׳ ׳›׳•׳×׳¨׳×',
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

        log('info', `TikTok fetch OK`, { videoId, title: truncate(result.title, 50) });

        return res.json(result);
    } catch (error) {
        next(error);
    }
});

// ==============================
// 37. ROUTES ג€” RESEARCH
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
            return res.status(400).json({ error: '׳—׳¡׳¨׳” ׳©׳׳׳”' });
        }

        const cleanQuery = query.trim();

        if (cleanQuery.length > CONFIG.maxResearchQueryLength) {
            metrics.totalErrors += 1;
            recordError('Research query too long');
            return res.status(400).json({ error: `׳”׳©׳׳׳” ׳׳¨׳•׳›׳” ׳׳“׳™ (׳׳§׳¡׳™׳׳•׳ ${CONFIG.maxResearchQueryLength} ׳×׳•׳•׳™׳)` });
        }

        log('info', `Research query: "${cleanQuery}"`);

        // ׳©׳׳‘ 1: ׳×׳¨׳’׳•׳ ׳׳¢׳‘׳¨׳™׳× ׳׳ ׳¦׳¨׳™׳
        const englishQuery = await translateToEnglish(cleanQuery);

        // ׳©׳׳‘ 2: ׳—׳™׳₪׳•׳© ׳‘׳›׳ 8 ׳”׳׳§׳•׳¨׳•׳× ׳‘׳׳§׳‘׳™׳
        const papers = await searchAllSources(englishQuery, CONFIG.researchMaxPerSource);

        if (!papers.length) {
            return res.json({
                query: cleanQuery,
                englishQuery,
                summary: {
                    verdict: '׳׳ ׳ ׳׳¦׳׳• ׳׳—׳§׳¨׳™׳',
                    summary: `׳—׳™׳₪׳©׳×׳™ "${englishQuery}" ׳‘-8 ׳׳׳’׳¨׳™׳ ׳׳“׳¢׳™׳™׳ ׳•׳׳ ׳׳¦׳׳×׳™ ׳׳—׳§׳¨׳™׳ ׳¨׳׳•׳•׳ ׳˜׳™׳™׳. ׳ ׳¡׳” ׳׳ ׳¡׳— ׳׳—׳¨׳× ג€” ׳׳׳©׳ "${englishQuery}" ׳‘׳׳ ׳’׳׳™׳×.`,
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

        // ׳©׳׳‘ 3: ׳ ׳™׳×׳•׳— ׳¢׳ AI
        let analysis;
        try {
            analysis = await analyzeResearchWithAI(cleanQuery, englishQuery, papers);
        } catch (aiError) {
            log('warn', `AI analysis failed ג€” using fallback`, { err: aiError.message });
            analysis = buildFallbackSummary(cleanQuery, englishQuery, papers);
        }

        const totalRoundTripMs = Date.now() - requestStart;
        metrics.totalSuccess += 1;
        recordLatency(totalRoundTripMs);

        log('info', `Research OK`, {
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
            papers: papers.slice(0, CONFIG.researchFinalLimit),
            totalFound: papers.length,
            sources: [...new Set(papers.map((p) => p.source))],
            searchTimeMs: totalRoundTripMs,
        });
    } catch (error) {
        next(error);
    }
});

// ==============================
// 38. ROUTES ג€” ANALYTICS CHAT
// ==============================

app.post('/api/analytics-chat', apiRateLimiter, async (req, res, next) => {
    const requestStart = Date.now();
    metrics.totalRequests += 1;

    try {
        const { message, history: rawHistory, analytics } = req.body || {};

        if (!message || typeof message !== 'string' || !message.trim()) {
            metrics.totalErrors += 1;
            recordError('Empty analytics chat message');
            return res.status(400).json({ reply: '׳׳“׳•׳, ׳׳ ׳”׳×׳§׳‘׳׳” ׳”׳•׳“׳¢׳”.' });
        }

        const userMessage = message.trim();
        const videos = Array.isArray(analytics?.videos) ? analytics.videos : [];
        const summary = analytics?.summary || computeAnalyticsSummary(videos);

        const analyticsBlock = videos.length
            ? `
### ׳¡׳™׳›׳•׳ ׳›׳׳׳™
- ׳¡׳¨׳˜׳•׳ ׳™׳: ${summary.totalVideos}
- ׳¦׳₪׳™׳•׳×: ${(summary.totalViews || 0).toLocaleString('he-IL')}
- ׳׳™׳™׳§׳™׳: ${summary.totalLikes || 0}
- ׳×׳’׳•׳‘׳•׳×: ${summary.totalComments || 0}
- ׳׳ ׳•׳™׳™׳: ${summary.totalSubscribers || 0}
- ׳™׳—׳¡ ׳׳™׳™׳§׳™׳: ${summary.ratio || 0}%
- ׳™׳—׳¡ ׳×׳’׳•׳‘׳•׳×: ${summary.commentRatio || 0}%

### ׳₪׳™׳¨׳•׳˜ ׳”׳¡׳¨׳˜׳•׳ ׳™׳ (${videos.length})
${videos.slice(0, 30).map((v) => {
    const vr = v.views ? ((v.likes || 0) / v.views * 100).toFixed(2) : '0';
    return `**${truncate(v.title, 80)}** [${v.platform || 'youtube'}] ג€” ${v.views || 0} ׳¦׳₪׳™׳•׳×, ${v.likes || 0} ׳׳™׳™׳§׳™׳ (${vr}%), ${v.comments || 0} ׳×׳’׳•׳‘׳•׳×, ${v.duration || 0}s`;
}).join('\n')}
`
            : '\n### ׳׳™׳ ׳ ׳×׳•׳ ׳™ ׳׳ ׳׳™׳˜׳™׳§׳¡ ׳–׳׳™׳ ׳™׳ ׳›׳¨׳’׳¢.\n';

        metrics.totalKnowledgeLookups += 1;
        const personalChunks = searchKnowledge(userMessage);
        let personalContext = '';

        if (personalChunks.length > 0) {
            metrics.totalKnowledgeHits += 1;
            personalContext = `\n\n### ׳™׳“׳¢ ׳׳™׳©׳™ ׳¨׳׳•׳•׳ ׳˜׳™:\n${personalChunks.map((c) => `- ${c.text}`).join('\n')}`;
        }

        const combinedSystemPrompt = `${ANALYTICS_SYSTEM_PROMPT}\n\n## ׳ ׳×׳•׳ ׳™ ׳”׳׳ ׳׳™׳˜׳™׳§׳¡ ׳©׳ ׳”׳׳©׳×׳׳©:\n${analyticsBlock}\n${personalContext}`;

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

        log('info', `Analytics chat OK`, {
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
// 39. ROUTES ג€” MEGA PROMPT
// ==============================

app.get('/api/mega-prompt', async (req, res, next) => {
    try {
        const uptimeSeconds = Math.floor((Date.now() - metrics.startedAt) / 1000);
        const mem = process.memoryUsage();
        const now = new Date().toISOString();

        const knowledgeFilesList = Array.from(knowledge.files.values())
            .map((f) => `- \`knowledge/${f.name}\` ג€” ${f.chunks} chunks, ${f.chars} ׳×׳•׳•׳™׳`)
            .join('\n');

        const megaPrompt = `# נ¯ J.A.R.V.I.S ג€” PROJECT MEGA-PROMPT
# ׳ ׳•׳¦׳¨ ׳׳•׳˜׳•׳׳˜׳™׳×: ${now}
# Uptime: ${formatUptime(uptimeSeconds)} | Memory: ${(mem.rss / 1024 / 1024).toFixed(1)} MB

## נ¯ ׳”׳§׳©׳¨ ׳›׳׳׳™

׳׳ ׳™ ׳׳₪׳×׳— ׳₪׳¨׳•׳™׳§׳˜ J.A.R.V.I.S ג€” ׳¢׳•׳–׳¨ AI ׳׳™׳©׳™ ׳‘׳¢׳‘׳¨׳™׳×, ׳‘׳ ׳•׳™ ׳¢׳ Node.js/Express + Gemini API.

**׳¡׳˜׳׳§ ׳˜׳›׳ ׳•׳׳•׳’׳™:**
- Backend: Node.js + Express
- AI: Google Gemini API (׳׳•׳“׳: ${CONFIG.geminiModel})
- Frontend: Vanilla JS + HTML + CSS
- ׳׳—׳¡׳•׳: GitHub + Render
- Environment: ${CONFIG.environment}

## נ¯ Endpoints ׳–׳׳™׳ ׳™׳

### ׳¦'׳׳˜ ׳•-Vision
- \`POST /api/ask\` ג€” ׳¦'׳׳˜ ׳¢׳ Gemini + history + BM25 knowledge
- \`POST /api/vision\` ג€” ׳ ׳™׳×׳•׳— ׳×׳׳•׳ ׳•׳×
- \`POST /api/analytics-chat\` ג€” ׳¦'׳׳˜ ׳¢׳ ׳ ׳×׳•׳ ׳™ Analytics

### ׳ ׳™׳×׳•׳— ׳×׳•׳›׳
- \`POST /api/analyze\` ג€” ׳ ׳™׳×׳•׳— ׳׳ ׳׳™׳˜׳™ ׳©׳ ׳¡׳¨׳˜׳•׳ ׳™׳
- \`POST /api/youtube/fetch\` ג€” ׳©׳׳™׳₪׳× ׳ ׳×׳•׳ ׳™ YouTube
- \`POST /api/tiktok/fetch\` ג€” ׳©׳׳™׳₪׳× ׳ ׳×׳•׳ ׳™ TikTok

### ׳׳—׳§׳¨
- \`POST /api/research\` ג€” ׳׳—׳§׳¨ ׳-8 ׳׳§׳•׳¨׳•׳× ׳׳“׳¢׳™׳™׳:
  - Europe PMC, PubMed, OpenAlex, Semantic Scholar
  - CrossRef, DOAJ, bioRxiv, CORE

### Knowledge Base
- \`GET /api/knowledge\` ג€” ׳¨׳©׳™׳׳× ׳§׳‘׳¦׳™ ׳™׳“׳¢
- \`POST /api/knowledge/upload\` ג€” ׳”׳¢׳׳׳× ׳§׳•׳‘׳¥
- \`DELETE /api/knowledge/:name\` ג€” ׳׳—׳™׳§׳× ׳§׳•׳‘׳¥
- \`POST /api/knowledge/reload\` ג€” ׳˜׳¢׳™׳ ׳” ׳׳—׳“׳©

### ׳׳¢׳¨׳›׳×
- \`GET /api/health\` ג€” ׳׳˜׳¨׳™׳§׳•׳× ׳׳•׳¨׳—׳‘׳•׳×
- \`GET /api/metrics\` ג€” ׳׳˜׳¨׳™׳§׳•׳× ׳׳§׳•׳—
- \`GET /api/mega-prompt\` ג€” ׳׳¡׳׳ ׳–׳”

## נ“ Knowledge Base

${knowledgeFilesList || '- ג ן¸ ׳׳™׳ ׳§׳‘׳¦׳™ ׳™׳“׳¢'}

**׳¡׳™׳›׳•׳:**
- ׳§׳‘׳¦׳™׳: ${knowledge.files.size}
- Chunks: ${knowledge.chunks.length}
- ׳׳•׳¦׳¨ ׳׳™׳׳™׳: ${knowledge.vocab.size}
- ׳׳•׳¨׳ ׳׳¡׳׳ ׳׳׳•׳¦׳¢: ${Math.round(knowledge.avgDocLength)} ׳˜׳•׳§׳ ׳™׳

## נ“ ׳׳˜׳¨׳™׳§׳•׳× ׳—׳™׳•׳× (${now})

\`\`\`json
${JSON.stringify({
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
    totalTranslationRequests: metrics.totalTranslationRequests,
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
}, null, 2)}
\`\`\`

## נ”§ ׳×׳›׳•׳ ׳•׳× ׳׳×׳§׳“׳׳•׳×

### BM25 Search
- K1 = ${CONFIG.bm25K1}
- B = ${CONFIG.bm25B}
- Top Chunks = ${CONFIG.knowledgeTopChunks}
- Min Score = ${CONFIG.knowledgeMinScore}

### Retry Logic
- Retries ׳‘׳¨׳™׳¨׳× ׳׳—׳“׳: ${CONFIG.defaultRetries}
- Retries ׳-Vision: ${CONFIG.visionRetries}
- ׳”׳©׳”׳™׳” ׳¢׳ 429: ${CONFIG.retryOn429DelayMs}ms
- ׳”׳©׳”׳™׳” ׳¢׳ 503 (High Demand): ${CONFIG.retryOn503DelayMs}ms

### Rate Limits
- API ׳›׳׳׳™: ${CONFIG.rateLimitMax} ׳‘׳§׳©׳•׳× / ׳“׳§׳”
- Vision: ${CONFIG.visionRateLimitMax} ׳‘׳§׳©׳•׳× / ׳“׳§׳”
- Research: ${CONFIG.researchRateLimitMax} ׳‘׳§׳©׳•׳× / ׳“׳§׳”

### Research Aggregator
- ${8} ׳׳§׳•׳¨׳•׳× ׳׳“׳¢׳™׳™׳
- ${CONFIG.researchMaxPerSource} ׳׳—׳§׳¨׳™׳ ׳׳›׳ ׳׳§׳•׳¨
- ${CONFIG.researchFinalLimit} ׳׳—׳§׳¨׳™׳ ׳¡׳•׳₪׳™׳™׳
- Deduplication by DOI + Title
- Scoring ׳׳₪׳™ ׳¨׳׳•׳•׳ ׳˜׳™׳•׳× (Title match, Study type, Health keywords)

### ׳×׳¨׳’׳•׳ ׳׳•׳˜׳•׳׳˜׳™
- ׳¢׳‘׳¨׳™׳× ג†’ ׳׳ ׳’׳׳™׳× ׳׳“׳¢׳™׳×
- ׳׳•׳“׳: ${CONFIG.geminiModel}
- Timeout: ${CONFIG.geminiTranslationTimeoutMs}ms

## נ¯ ׳”׳׳©׳™׳׳” ׳”׳‘׳׳”

׳׳‘׳ ׳•׳× ׳׳׳©׳§׳™׳ ׳—׳“׳©׳™׳:
1. ׳׳¢׳¨׳›׳× ׳×׳–׳•׳ ׳” ג€” ׳ ׳™׳×׳•׳— ׳׳” ׳׳›׳׳× ׳”׳™׳•׳
2. ׳׳¢׳¨׳›׳× ׳׳™׳׳•׳ ג€” ׳׳¢׳§׳‘ ׳×׳¨׳’׳™׳׳™ ׳§׳׳™׳¡׳˜׳ ׳™׳§׳¡
3. ׳”׳×׳¨׳׳•׳× ג€” ׳¡׳™׳›׳•׳ ׳™׳•׳׳™ + ׳×׳–׳›׳•׳¨׳•׳×

---

*׳ ׳•׳¦׳¨ ׳׳•׳˜׳•׳׳˜׳™׳× ׳¢׳ ׳™׳“׳™ GET /api/mega-prompt.*
*׳”׳¢׳×׳§ ׳׳× ׳›׳ ׳”׳˜׳§׳¡׳˜ ׳”׳–׳” ׳•׳©׳׳— ׳-AI ׳—׳“׳© ׳›׳“׳™ ׳׳”׳׳©׳™׳ ׳׳× ׳”׳₪׳¨׳•׳™׳§׳˜.*`;

        res.type('text/plain; charset=utf-8').send(megaPrompt);
    } catch (err) {
        next(err);
    }
});
// ==============================
// NUTRITION ג€” Analyze endpoint
// ==============================

const NUTRITION_SYSTEM_PROMPT = `׳׳×׳” ׳×׳–׳•׳ ׳׳™ ׳׳§׳¦׳•׳¢׳™. ׳׳×׳” ׳׳ ׳×׳— ׳׳¨׳•׳—׳•׳× ׳‘׳¢׳‘׳¨׳™׳× ׳•׳׳—׳–׳™׳¨ ׳ ׳×׳•׳ ׳™׳ ׳×׳–׳•׳ ׳×׳™׳™׳ ׳׳“׳•׳™׳§׳™׳ ׳‘׳₪׳•׳¨׳׳˜ JSON.

## ׳›׳׳׳™׳:
1. ׳”׳™׳” ׳¨׳™׳׳׳™ ׳‘׳׳¡׳₪׳¨׳™׳ ג€” ׳”׳©׳×׳׳© ׳‘׳׳׳’׳¨׳™ ׳׳™׳“׳¢ ׳×׳–׳•׳ ׳×׳™׳™׳ ׳׳§׳•׳‘׳׳™׳.
2. ׳׳ ׳™׳© ׳¡׳₪׳§ ג€” ׳×׳ ׳”׳¢׳¨׳›׳” ׳©׳׳¨׳ ׳™׳×.
3. ׳׳ ׳׳ ׳–׳™׳”׳™׳× ׳׳׳›׳ ג€” ׳”׳—׳–׳¨ ׳¢׳¨׳›׳™׳ 0 ׳•׳¦׳™׳™׳ ׳‘׳©׳ "׳׳ ׳–׳•׳”׳”".
4. ׳”׳©׳×׳׳© ׳‘׳©׳׳•׳× ׳‘׳¢׳‘׳¨׳™׳× ׳׳׳׳›׳׳™׳, ׳•׳™׳˜׳׳™׳ ׳™׳, ׳•׳׳™׳ ׳¨׳׳™׳.
5. ׳׳—׳•׳–׳™׳ ׳©׳ ׳•׳™׳˜׳׳™׳ ׳™׳/׳׳™׳ ׳¨׳׳™׳ = ׳׳—׳•׳– ׳׳”-RDA ׳”׳™׳•׳׳™.
6. ׳”׳—׳–׳¨ **׳¨׳§** JSON ׳×׳§׳™׳, ׳‘׳׳™ ׳˜׳§׳¡׳˜ ׳ ׳•׳¡׳£.`;

app.post('/api/nutrition/analyze', apiRateLimiter, async (req, res, next) => {
    const requestStart = Date.now();
    metrics.totalRequests += 1;

    try {
        const { meals } = req.body || {};

        if (!meals) {
            metrics.totalErrors += 1;
            recordError('Missing meals in nutrition request');
            return res.status(400).json({ error: '׳—׳¡׳¨׳•׳× ׳׳¨׳•׳—׳•׳× ׳׳ ׳™׳×׳•׳—' });
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
            return res.status(400).json({ error: '׳׳™׳ ׳׳¨׳•׳—׳•׳× ׳׳ ׳™׳×׳•׳—' });
        }

        log('info', `Nutrition analysis: ${cleanMeals.length} meals`);

        const mealsList = cleanMeals
            .map((m, i) => `${i + 1}. ${m}`)
            .join('\n');

        const userPrompt = `׳ ׳×׳— ׳׳× ׳”׳׳¨׳•׳—׳•׳× ׳”׳‘׳׳•׳×:

${mealsList}

׳”׳—׳–׳¨ JSON ׳¢׳ ׳”׳׳‘׳ ׳” ׳”׳–׳” ׳‘׳“׳™׳•׳§:

{
  "totalCalories": <number, ׳§׳׳•׳¨׳™׳•׳× ׳¡׳”"׳›>,
  "totalProtein": <number, ׳’׳¨׳ ׳—׳׳‘׳•׳ ׳¡׳”"׳›>,
  "totalCarbs": <number, ׳’׳¨׳ ׳₪׳—׳׳™׳׳•׳× ׳¡׳”"׳›>,
  "totalFat": <number, ׳’׳¨׳ ׳©׳•׳׳ ׳¡׳”"׳›>,
  "totalSugar": <number, ׳’׳¨׳ ׳¡׳•׳›׳¨ ׳¡׳”"׳›>,
  "totalFiber": <number, ׳’׳¨׳ ׳¡׳™׳‘׳™׳ ׳¡׳”"׳›>,
  "items": [
    {
      "name": "<׳©׳ ׳”׳׳׳›׳ ׳‘׳¢׳‘׳¨׳™׳×>",
      "amount": "<׳›׳׳•׳×: ׳׳׳©׳ '2 ׳‘׳™׳¦׳™׳', '200 ׳’׳¨׳ ׳¢׳•׳£'>",
      "calories": <number>,
      "protein": <number>,
      "carbs": <number>,
      "fat": <number>,
      "sugar": <number>,
      "fiber": <number>
    }
  ],
  "vitamins": [
    { "name": "<׳©׳ ׳”׳•׳™׳˜׳׳™׳ ׳‘׳¢׳‘׳¨׳™׳×: ׳׳׳©׳ '׳•׳™׳˜׳׳™׳ C'>", "percent": <number, ׳׳—׳•׳– RDA ׳™׳•׳׳™>, "source": "<׳׳׳™׳–׳” ׳׳׳›׳>" }
  ],
  "minerals": [
    { "name": "<׳©׳ ׳”׳׳™׳ ׳¨׳ ׳‘׳¢׳‘׳¨׳™׳×: ׳׳׳©׳ '׳‘׳¨׳–׳'>", "percent": <number, ׳׳—׳•׳– RDA ׳™׳•׳׳™>, "source": "<׳׳׳™׳–׳” ׳׳׳›׳>" }
  ],
  "aminoAcids": [
    { "name": "<׳©׳ ׳—׳•׳׳¦׳× ׳”׳׳׳™׳ ׳•: ׳׳׳©׳ 'Leucine'>", "present": <true/false> }
  ],
  "insights": "<׳׳©׳₪׳˜ ׳׳—׳“ ׳§׳¦׳¨: ׳”׳×׳•׳‘׳ ׳” ׳”׳›׳™ ׳—׳©׳•׳‘׳” ׳¢׳ ׳”׳׳¨׳•׳—׳” ׳”׳–׳•>"
}

׳—׳©׳•׳‘:
- ׳›׳ ׳”׳׳¡׳₪׳¨׳™׳ ׳—׳™׳™׳‘׳™׳ ׳׳”׳™׳•׳× ׳׳¡׳₪׳¨׳™׳™׳ (׳‘׳׳™ ׳™׳—׳™׳“׳•׳×).
- ׳׳ ׳׳׳›׳ ׳׳ ׳–׳•׳”׳” ג€” ׳”׳©׳×׳׳© ׳‘-"׳׳ ׳–׳•׳”׳”" ׳›׳©׳, ׳¢׳ ׳¢׳¨׳›׳™ 0.
- vitamins ׳•-minerals ג€” ׳¨׳§ ׳׳׳” ׳©׳‘׳•׳׳˜׳™׳ (percent >= 5).
- aminoAcids ג€” 9 ׳—׳•׳׳¦׳•׳× ׳—׳™׳•׳ ׳™׳•׳×: Histidine, Isoleucine, Leucine, Lysine, Methionine, Phenylalanine, Threonine, Tryptophan, Valine.`;

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

        log('info', `Nutrition OK`, {
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
// 40. 404 HANDLER
// ==============================

app.use((req, res) => {
    res.status(404).json({ reply: '׳׳“׳•׳, ׳”׳ ׳×׳™׳‘ ׳”׳׳‘׳•׳§׳© ׳׳™׳ ׳• ׳§׳™׳™׳.' });
});

// ==============================
// 41. GLOBAL ERROR HANDLER
// ==============================

app.use((err, req, res, next) => {
    if (err instanceof GeminiError) {
        log('error', `Gemini ${err.statusCode}: ${err.message}`);
        recordError(err.message);

        if (err.isRateLimit) {
            return res.status(429).json({
                reply: '׳׳“׳•׳, ׳׳¢׳¨׳›׳•׳× ׳”׳׳™׳‘׳” ׳©׳׳™ ׳”׳’׳™׳¢׳• ׳׳׳›׳¡׳× ׳”׳©׳™׳׳•׳© ׳”׳—׳™׳ ׳׳™׳× ׳׳¨׳’׳¢ ׳–׳”. ׳׳ ׳ ׳”׳׳×׳ ׳›׳—׳¦׳™ ׳“׳§׳” ׳•׳ ׳¡׳” ׳©׳•׳‘.',
                rateLimited: true,
            });
        }

        const status = err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
        return res.status(status).json({ reply: `׳׳“׳•׳, ${err.message}` });
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
    return res.status(500).json({ reply: '׳׳“׳•׳, ׳׳™׳¨׳¢׳” ׳×׳§׳׳” ׳‘׳׳×׳™ ׳¦׳₪׳•׳™׳” ׳‘׳׳¢׳¨׳›׳×.' });
});

// ==============================
// 42. STARTUP
// ==============================

loadKnowledgeBase();

const server = app.listen(CONFIG.port, () => {
    log('info', `ג¡ J.A.R.V.I.S Neural Kernel V5.0 running`);
    log('info', `נ Server: http://localhost:${CONFIG.port}`);
    log('info', `נ₪– Model: ${CONFIG.geminiModel}`);
    log('info', `נ Environment: ${CONFIG.environment}`);
    log('info', `נ§  Knowledge: ${knowledge.files.size} files, ${knowledge.chunks.length} chunks, ${knowledge.vocab.size} vocab`);
    log('info', `נ“÷ YouTube API: ${CONFIG.youtubeApiKey ? 'configured' : 'NOT configured'}`);
    log('info', `נ”¬ Research sources: 8 (Europe PMC, PubMed, OpenAlex, Semantic Scholar, CrossRef, DOAJ, bioRxiv, CORE)`);
    log('info', `נ”‘ CORE API: ${CONFIG.coreApiKey ? 'configured' : 'NOT configured (source disabled)'}`);
    log('info', `נ”‘ Semantic Scholar API: ${CONFIG.semanticScholarKey ? 'configured' : 'public tier'}`);
});

// ==============================
// 43. GRACEFUL SHUTDOWN
// ==============================

let isShuttingDown = false;

function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n${signal} ׳”׳×׳§׳‘׳, ׳¡׳•׳’׳¨ ׳׳× ׳”׳©׳¨׳× ׳‘׳¦׳•׳¨׳” ׳׳¡׳•׳“׳¨׳×...`);

    const forceExit = setTimeout(() => {
        console.error('ג ן¸ Timeout ג€” ׳׳׳׳¥ ׳™׳¦׳™׳׳”');
        process.exit(1);
    }, 10000);

    forceExit.unref();

    server.close(() => {
        console.log('ג… ׳”׳©׳¨׳× ׳ ׳¡׳’׳¨ ׳‘׳”׳¦׳׳—׳”.');
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
