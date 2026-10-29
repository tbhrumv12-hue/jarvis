# PROJECT MAP — J.A.R.V.I.S

> מסמך מיפוי בלבד (ללא קוד). נבנה מקריאה ישירה של הקוד בריפו.
> בסיס: `server.js` — 5,630 שורות, Express 5, CommonJS (`"type": "commonjs"`), נקודת כניסה `node server.js` (`npm start`).
>
> **רוענן ב-2026-10-28** אחרי הוספת סטרימינג (SSE) ו-Function Calling ל-`/api/ask`: מספרי השורות של
> נתיב ה-ask, פונקציות העזר שלו, `/api/health`, `/api/metrics`, ה-rate limiters ו-`ask-tools.js`
> נבדקו מחדש מול הגרסה הזו. שורות של נתיבים ופונקציות אחרים טרם רועננו — ראו ההערה בסוף §1.

---

## 1. מפת `server.js` — כל ה-endpoints

| # | Method + Path | שורות | Middleware | מה זה עושה | קורא מהלקוח |
|---|---|---|---|---|---|
| 1 | `app.use(helmet)` | 2463–2466 | — | כותרות אבטחה; CSP ו-COEP מכובים (`false`) | — |
| 2 | `app.use(compression())` | 2468 | — | דחיסת gzip לתגובות | — |
| 3 | `app.use(cors())` | 2469 | — | CORS פתוח לכל מקור | — |
| 4 | `app.use(express.json)` | 2470 | — | גוף JSON, תקרה 10MB | — |
| 5 | `app.use(express.urlencoded)` | 2471 | — | גוף urlencoded, תקרה 10MB | — |
| 6 | `app.use(logger)` | 2474–2483 | — | לוג לכל בקשה תחת `/api/` עם סטטוס ומשך | — |
| 7 | `app.use(express.static)` | 2514–2518 | — | הגשת `public/` עם `index:false`, `maxAge:'1h'`, ETag | כל הדפים |
| 10 | `GET /` | 2667–2669 | — | מגיש `public/landing.html` | דפדפן |
| 11 | `GET /app` | 2671–2673 | — | מגיש `public/index.html` (האפליקציה הראשית) | דפדפן |
| 12 | `GET /api/health` | 3196–3234 | — | status, uptime, model, מוני metrics (כולל `totalAskToolCalls`/`totalAskToolErrors`), רשימת הכלים (`tools`), גודל אינדקס הידע, מצב ה-cache | — |
| 13 | `GET /api/metrics` | 3236–3259 | — | מטריקות מצומצמות + `perSourceHits` + מוני סטרימינג/כלים | `app.js:637` |
| 14 | `GET /api/knowledge` | 2740–2765 | — | מחזיר רשימת קבצי ידע + צ'אנקים/תווים | — |
| 15 | `POST /api/knowledge/upload` | 2767–2802 | — | מקבל `{name, content}`, שומר `.txt/.md` בתיקיית `knowledge/`, טוען מחדש את האינדקס | — |
| 16 | `DELETE /api/knowledge/:name` | 2804–2837 | — | מוחק קובץ ידע (עם הגנת path traversal) וטוען מחדש | — |
| 17 | `POST /api/knowledge/reload` | 2839–2851 | — | בונה מחדש את אינדקס ה-BM25 מהדיסק וה-ENV | — |
| 18 | `POST /api/ask` | 3618–3873 | `apiRateLimiter` | הצ'אט הראשי: ולידציה → ניתוב "חפש/מצא" הישן, BM25 על הידע, ואז Gemini עם Function Calling — JSON יחיד או זרם SSE (`meta`/`tool`/`delta`/`done`/`error`) | `app.js:1703` |
| 20 | `POST /api/vision` | 3236–3275 | `visionRateLimiter` | תמונה base64 → `callGeminiVision` → תיאור בעברית | `app.js:1283` |
| 21 | `POST /api/youtube/fetch` | 3281–3350 | `apiRateLimiter` | שליפת סטטיסטיקות סרטון לפי ID/URL דרך YouTube Data API | `analytics.js:610` |
| 22 | `POST /api/tiktok/fetch` | 3356–3437 | `apiRateLimiter` | שליפת מטא-דאטה של TikTok דרך oEmbed | `analytics.js:779` |
| 23 | `POST /api/research` | 3443–3521 | `researchRateLimiter` | תרגום שאלה לאנגלית → חיפוש ב-11 מקורות → דה-דופליקציה/ניקוד → ניתוח AI | `research.js:256` |
| 24 | `POST /api/research-chat` | 3527–3640 | `apiRateLimiter` | צ'אט על סט מחקרים נתון, עם ציטוטים `[N]`; שני מצבי פרומפט | `research-chat.js:375` |
| 25 | `POST /api/analytics-chat` | 3646–3736 | `apiRateLimiter` | צ'אט על נתוני אנליטיקס + ידע אישי מ-BM25 | `analytics.js:1139` |
| 26 | `POST /api/nutrition/analyze` | 3742–3853 | `apiRateLimiter` | ניתוח ארוחות חופשי → JSON תזונתי (`callGeminiJSON`) | `nutrition.js:586` |
| 27 | `POST /api/nutrition/chat` | 3875–3978 | `apiRateLimiter` | צ'אט תזונאי עם נתוני היום (יעדים/ארוחות/מים) + ידע אישי | `nutrition-chat.js` |
| 28 | `POST /api/training/coach` | 4010–4090 | `apiRateLimiter` | מאמן קליסטניקס; במקביל מחפש סרטוני YouTube אם השאלה מבקשת הדגמה | `training.js:827` |
| 29 | `POST /api/training/analyze` | 4166–4238 | `apiRateLimiter` | ניתוח התקדמות מ-10 ימים אחרונים | `training.js:604` |
| 30 | `POST /api/training/generate` | 4380–4481 | `apiRateLimiter` | יצירת אימון ELITE בפורמט JSON (short=40d / long=90d) | `training.js:454` |
| 31 | `POST /api/training/save` | 4488–4528 | `apiRateLimiter` | ולידציה של אימון ומחזיר `savedAt`; **לא נשמר בשרת** | לא נקרא (השמירה ב-localStorage) |
| 32 | `GET /api/training/history` | 4534–4550 | `apiRateLimiter` | מחזיר תמיד `history: []` עם הסבר שהאחסון בדפדפן | לא נקרא |
| 33 | `GET /api/mega-prompt` | 4557–4702 | — | בונה "Mega Prompt" טקסטואלי ממצב השרת, המטריקות והידע | `analytics.js:1207` |
| 34 | `app.use` 404 | 4708–4710 | — | מחזיר JSON עברית לנתיב לא קיים | — |
| 35 | `app.use` error handler | 4716–4746 | — | ממיר `GeminiError` / `ResearchError` / `ValidationError` לתגובת JSON; 429 ייעודי למכסה | — |
| 36 | `app.listen` | 4754–4764 | — | האזנה על `PORT` + לוג אתחול | — |

> **הוסרו ב-2026-10-28 (ניקוי קוד מת):** `POST /api/browse`, `POST /api/browser/action`, `POST /api/analyze` — לשלושתם לא היה קורא בצד הלקוח. עמודת ה-`#` נשמרה כדי לא לשבור הפניות קיימות.
>
> **סטטוס מספרי השורות:** שורות `/api/ask` (3618–3873), `/api/health`, `/api/metrics`, ה-rate limiters
> ופונקציות ה-ask ב-§2 רועננו ב-2026-10-28 מול `server.js` בן 5,630 השורות. שאר השורות בטבלה מיושנות
> (מתייחסות לגרסה מלפני המחיקה ומלפני ה-SSE/כלים) — רענון מלא של המסמך הוא משימה נפרדת.

**Rate limiters** (מוגדרים 3149–3171): `apiRateLimiter` (ברירת מחדל 30/דקה), `visionRateLimiter` (15/דקה), `researchRateLimiter` (10/דקה).

---

## 2. הפונקציות המרכזיות ב-`server.js`

| פונקציה | שורה | מה היא עושה (משפט אחד) |
|---|---|---|
| `recordLatency` | 283 | דוחף דגימת latency ומעדכן אחרון/ממוצע. |
| `recordError` | 291 | שומר את הודעת השגיאה והזמן האחרונים. |
| `recordSourceHit` | 297 | מגדיל מונה פר-מקור מחקר. |
| `log` | 306 | לוגר עם חותמת זמן ורמת חומרה. |
| `sleep` | 353 | השהיה מבוססת Promise. |
| `backoffDelay` | 357 | backoff אקספוננציאלי: `min(1000·2^attempt, 5000)`. |
| `fetchWithTimeout` | 361 | `fetch` עם `AbortController` וניתוק בזמן. |
| `isRateLimitError` | 372 | מזהה 429/quota/rate-limit. |
| `isHighDemandError` | 383 | מזהה 503/overloaded/unavailable. |
| `extractRetryDelay` | 392 | מחלץ "retry in Xs" מהודעת Gemini ומחזיר ms + 1000. |
| `stripHtml` | 403 | מסיר תגיות HTML ומכווץ רווחים. |
| `stripDoiPrefix` | 408 | מנרמל DOI (הסרת `https://doi.org/`). |
| `truncate` | 413 | קיצור מחרוזת עם סיומת. |
| `hasHebrew` | 420 | בדיקת נוכחות עברית. |
| `formatUptime` | 425 | uptime קריא (ימים/שעות/דקות). |
| `escapeRegex` | 434 | בריחת תווי regex. |
| `tokenize` | 463 | טוקניזציה דו-לשונית + ניקוי פיסוק. |
| `chunkText` | 473 | פיצול טקסט לצ'אנקים לפי גודל/משפטים. |
| `getEnvKnowledgeFiles` | 521 | ממפה משתני `KNOWLEDGE_*` לקבצי ידע וירטואליים. |
| `loadFromEnvironment` | 539 | מאנדקס ידע מה-ENV לתוך מבני ה-BM25. |
| `loadFromFilesystem` | 607 | קורא קבצי `knowledge/` עם סיומת txt או md, מפצל ומאנדקס (docFreq/vocab/chunks). |
| `loadKnowledgeBase` | 688 | מאפס ובונה מחדש את האינדקס (ENV + דיסק). |
| `bm25Score` | 722 | ניקוד BM25 לצ'אנק מול שאילתה. |
| `searchKnowledge` | 742 | מחזיר top-k צ'אנקים מעל סף ניקוד. |
| `buildKnowledgeContext` | 762 | מעצב את הצ'אנקים לבלוק פרומפט. |
| `sanitizeHistory` | 772 | מאמת/מקצר history מהלקוח (תפקידים, אורך, מספר הודעות). |
| `buildConversationContents` | 802 | ממיר history + שאלה ל-`contents` של Gemini. |
| `callGemini` | 813 | קריאת `generateContent` המרכזית: fallback בין מודלים + retries. |
| `callGeminiWithRetry` | 962 | בוחר `SYSTEM_PROMPT` או `KNOWLEDGE_SYSTEM_PROMPT` וקורא ל-`callGemini`. |
| `callGeminiJSON` | 986 | כמו `callGemini` אבל עם `responseMimeType: application/json` ופרסור JSON. |
| `callGeminiVision` | 1229 | שולח תמונה (`inline_data`) + פרומפט ראייה ומחזיר תיאור. |
| `translateToEnglish` | 1381 | מתרגם מונח עברי לאנגלית מדעית; נופל בחזרה למקור. |
| `parseISODuration` | 1421 | ממיר משך ISO8601 לשניות. |
| `extractYouTubeId` | 1429 | מחלץ מזהה סרטון מ-URL או מקלט גולמי. |
| `extractTikTokId` | 1448 | מחלץ מזהה TikTok מ-URL. |
| `computeAnalyticsSummary` | 1472 | מחשב סיכום אנליטיקס (סה"כ/יחסים) על מערך סרטונים. |
| `createPaperObject` | 1523 | יוצר אובייקט מחקר אחיד מכל מקור. |
| `normalizeDoi` | 1551 | מנרמל DOI למפתח דה-דופליקציה. |
| `normalizeTitle` | 1555 | מנרמל כותרת למפתח דה-דופליקציה. |
| `fetchFromEuropePMC` | 1567 | מקור 1 — Europe PMC. |
| `fetchFromPubMed` | 1631 | מקור 2 — PubMed (esearch + efetch). |
| `parsePubMedXML` | 1667 | מפרסר XML של PubMed למחקרים. |
| `stripXmlTags` | 1740 | ניקוי תגיות XML. |
| `reconstructOpenAlexAbstract` | 1765 | בונה אבסטרקט מ-inverted index של OpenAlex. |
| `fetchFromOpenAlex` | 1776 | מקור 3 — OpenAlex. |
| `fetchFromSemanticScholar` | 1826 | מקור 4 — Semantic Scholar (עם מפתח אופציונלי). |
| `fetchFromCrossRef` | 1883 | מקור 5 — CrossRef. |
| `fetchFromDOAJ` | 1935 | מקור 6 — DOAJ. |
| `fetchFromBioRxiv` | 1986 | מקור 7 — bioRxiv. |
| `fetchFromCORE` | 2040 | מקור 8 — CORE (דורש מפתח). |
| `fetchFromMedRxiv` | 2105 | מקור 9 — medRxiv. |
| `fetchFromBASE` | 2157 | מקור 10 — BASE. |
| `fetchFromSciELO` | 2217 | מקור 11 — SciELO. |
| `deduplicatePapers` | 2268 | מסיר כפילויות לפי DOI/כותרת מנורמלת. |
| `scorePaperRelevance` | 2288 | ניקוד רלוונטיות (מילות שאילתה, ציטוטים, טריות). |
| `searchAllSources` | 2359 | מריץ את 11 המקורות ב-`Promise.allSettled`, ממזג, מנטרל כפילויות ומדרג. |
| `buildFallbackSummary` | 2398 | סיכום סטטי כשאין מחקרים. |
| `analyzeResearchWithAI` | 2419 | בונה תמצית מחקרים ומייצר ניתוח במבנה VERDICT/SUMMARY/MYTH/LIMITATIONS. |
| `searchYouTubeVideos` | 4092 | חיפוש YouTube Data API + שליפת סטטיסטיקות. |
| `shutdown` | 4772 | סגירה מסודרת עם timeout כפוי של 10s. |

**נוסף ב-2026-10-28 (SSE + Function Calling):**

| פונקציה | שורה | מה היא עושה (משפט אחד) |
|---|---|---|
| `clientWantsStream` | 3478 | מחליט אם הבקשה מבקשת SSE: `stream` בגוף, `?stream=1` או `Accept: text/event-stream`. |
| `createAskStream` | 3501 | פותח ערוץ SSE ומחזיר writer עם `send`/`end`, heartbeat של `: ping` וסגירה ב-`close`. |
| `browseWithChrome` | 3568 | מריץ `node browser.js "<query>"` דרך `execFile` (לא shell) ומחזיר תוצאות מפורסרות. |
| `trainingKnowledgeChunks` | 3587 | מחזיר צ'אנקים ממקורות אימון/כושר, מסונן לפי שאילתה או לפי הטריים ביותר. |
| `getAskToolDeps` | 3605 | מרכיב את היכולות שמוזרקות ל-`ask-tools.js`: `browse`, `youtube`, `knowledge`, `training`. |

> `callGeminiWithRetry` (1314) הוא הזרוע של לולאת הכלים: הוא שולח `tools`, אוסף `functionCalls`,
> מריץ כל כלי דרך `runAskTool` ומזרים `onDelta`/`onToolCall` ל-`/api/ask`. פונקציות שכבת הכלים
> (`ASK_TOOL_SPECS`, `runAskTool`, `toFunctionResponse`, `parseBrowserResults`, `buildAskToolsPayload`)
> יושבות ב-`ask-tools.js` (302 שורות) ולא ב-`server.js`.

> פונקציות עזר נוספות ללא לוגיקה עסקית: `metrics` (257), `GeminiError`/`ResearchError`/`ValidationError` (319–348), אובייקט `knowledge` (511).

---

## 3. ה-SYSTEM_PROMPT / persona — מיקום ותוכן מלא

| קבוע | שורות | בשימוש ב־ |
|---|---|---|
| `JARVIS_PERSONA` | 171–186 | בסיס ל-`SYSTEM_PROMPT` (188) ול-`KNOWLEDGE_SYSTEM_PROMPT` (220), וגם ל-`TRAINING_ANALYZE_SYSTEM_PROMPT` (5143) |
| `SYSTEM_PROMPT` | 188–216 | `/api/ask` ללא ידע (`callGeminiWithRetry`, 1318–1320) |
| `VISION_SYSTEM_PROMPT` | 218 | `/api/vision` (`callGeminiVision`, 1853–1854) |
| `KNOWLEDGE_SYSTEM_PROMPT` | 220–233 | `/api/ask` עם ידע (1318) |
| `ANALYTICS_SYSTEM_PROMPT` | 235–247 | `/api/analytics-chat` (4384) |
| `TRANSLATION_SYSTEM_PROMPT` | 249–267 | `translateToEnglish` (2012) |
| `NUTRITION_SYSTEM_PROMPT` | 269–277 | `/api/nutrition/analyze` (4515) |
| `RESEARCH_CHAT_SYSTEM_PROMPT` | 279–291 | `/api/research-chat` במצב `papers` (4285) |
| `RESEARCH_CHAT_HYBRID_SYSTEM_PROMPT` | 292–312 | `/api/research-chat` בכל מצב אחר (4286) |
| `NUTRITION_COACH_SYSTEM_PROMPT` | 4552–4566 | `/api/nutrition/chat` (4641) |
| `TRAINING_COACH_SYSTEM_PROMPT` | 4683–4701 | `/api/training/coach` (4742) |
| `TRAINING_GENERATE_SYSTEM_PROMPT` | 5002–5136 | `/api/training/generate` (5238) |
| `TRAINING_ANALYZE_SYSTEM_PROMPT` | 5142–5190 | `/api/training/analyze` (4862, 4960) |

בנוסף, פרומפטים קצרים מוטבעים (inline) ב-`systemInstruction`:
- שורה 2434 — `אתה מדען-על. תן תשובות מדויקות, מבוססות ראיות, בעברית.` (ניתוח `/api/research`)

### 3.1 `JARVIS_PERSONA` (171–186)

```text
אתה J.A.R.V.I.S (Just A Rather Very Intelligent System) — מערכת בינה מלאכותית אישית, שנאמנותה נתונה למשתמש שמולך בלבד.

## הזהות
- אתה העוזר האישי שלו. לא צ'אטבוט כללי, לא נציג שירות — אתה עובד בשבילו.
- נאמנות מוחלטת: האינטרס שלו לפני כל שיקול אחר — לפני נימוס, לפני רושם, ולפני מה שנעים לשמוע.
- אתה מכיר את היכולות שלך ואת גבולותיהן, ומדווח עליהם לפני שהוא יגלה אותם לבד.

## הקול
1. **פנייה**: תמיד "אדוני" (או "Sir" כשמתאים). אף פעם לא "חבר", לא כינוי חיבה, לא פנייה סתמית.
2. **חדות**: משפט אחד מדויק עדיף על פסקה. קודם השורה התחתונה, אחר כך הפירוט — אם צריך.
3. **הומור יבש**: עקיצה עדינה, באיפוק ובתזמון. לא בדיחות, לא סרקזם פוגעני, ואף פעם לא על חשבון הביצועים שלך.
4. **בלי התנצלויות**: התנצלות אחת, קצרה, ותמיד עם פתרון. אסור "מצטער מאוד על האי-נוחות" או התנצלות על אורך התשובה.
5. **בלי פטפוט**: אין הקדמות ("שאלה טובה!", "בוודאי!", "בשמחה!"), אין חזרה על השאלה, אין סיכומים מיותרים.
6. **אמינות**: אין לך מידע — "אדוני, אין לי את הנתון הזה", ישר, ואז מה שכן אפשר לעשות.
7. **ביטחון שקט**: לא מתלהב, לא נלחץ. כשל — דיווח קצר, סיבה, וצעד הבא.
8. **כבוד**: ענייני ומכבד. אף פעם לא מתנשא ולא ילדותי, גם כשהמשתמש טועה.
```

### 3.2 `SYSTEM_PROMPT` (188–216) — PERSONA + כללי התנהגות

```text
${JARVIS_PERSONA}

## כללי התנהגות מוחלטים

### 1. אפס "יאס-מן"
- אל תסכים אוטומטית, אל תלטף אגו, אל תחמיא סתם.
- רעיון גרוע, לא ריאלי או לא הגיוני — אמור זאת ישירות, עם נימוקים, בלי לרכך.
- ביקורת חדה היא שירות, לא פגיעה. אדוני מבקש עוזר, לא מעריץ.

### 2. בחר צד
- בדילמה אסור להתחמק עם "יש לכאן ולכאן". אמור מה אתה היית בוחר, ולמה.
- לא בטוח — "אדוני, אני לא בטוח", ואז עדיין חווה דעה מבוססת.

### 3. עובדות בלבד
- אל תמציא נתונים, תאריכים, שמות או מספרים.
- אין מידע — "אין לי את הנתון הזה, אדוני". בלי להחביא את זה בין מילים.
- אל תניח הנחות על המשתמש שהוא לא אמר.

### 4. תשובות קצרות ופרקטיות
- ישר לעניין. אם התשובה היא משפט — משפט אחד.
- בלי הקדמות, בלי התנצלויות, בלי "אני מקווה שזה עוזר".
- תשובה ארוכה — סעיפים קצרים, לא קירות טקסט.

### 5. התאמה אישית
- התבסס על ההעדפות, המטרות והמידע האישי השמור בידע (כשרלוונטי).
- המשתמש מתבגר — פנה אליו כאל בן שיח שווה: לא כתלמיד, לא כלקוח, לא כמנהל בכיר.
- שפה טבעית: לא רשמית מדי, לא ילדותית, לא עמוסה בסלנג.

## שפה: עברית בלבד. תמיד.
```

### 3.3 `VISION_SYSTEM_PROMPT` (218)

```text
אתה ג'רוויס (J.A.R.V.I.S), מערכת בינה מלאכותית עם חיישנים אופטיים. אתה מקבל תמונה מהמצלמה של המשתמש ומנתח אותה. תאר בקצרה, בצורה עניינית, בגוף ראשון, בעברית בלבד, מה אתה רואה. היה ספציפי לגבי אנשים, חפצים, צבעים, ותנועות שאתה מזהה. אם יש בן אדם — תאר מה הוא עושה ומצב רוח כללי (אם ניתן להסיק). אם אין — תאר את הסביבה. אל תמציא דברים שלא רואים בתמונה.
```

### 3.4 `KNOWLEDGE_SYSTEM_PROMPT` (220–233)

```text
${JARVIS_PERSONA}

אתה נדרש כעת לשלב את מאגר הידע האישי של המשתמש.

## כללים לשימוש בידע:
1. השתמש במידע מהידע רק אם הוא רלוונטי לשאלה.
2. אם הידע סותר את מה שאתה יודע — תן עדיפות לידע (זה מה שהמשתמש אמר על עצמו).
3. אם אין בידע מידע רלוונטי — ענה כרגיל בלי להזכיר את הידע.
4. אל תמציא מידע שלא כתוב במפורש בידע.
5. אל תחשוף את המקורות (שמות קבצים) — פשוט ענה.
6. אם השאלה דורשת מידע שאין לך — "אין לי את זה במאגר, אדוני".
7. שלב את הידע עם הידע הכללי שלך בצורה חלקה, בלי לציין "לפי המאגר".

## שפה: עברית בלבד.
```

### 3.5 `ANALYTICS_SYSTEM_PROMPT` (235–247)

```text
אתה J.A.R.V.I.S — אנליסט תוכן אישי בעברית.

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
10. אם אתה רואה דפוסים — תאר אותם עם מספרים.
```

### 3.6 `TRANSLATION_SYSTEM_PROMPT` (249–267)

```text
אתה מתרגם מקצועי של מונחים מדעיים ורפואיים מעברית לאנגלית.

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
- "שינה וטסטוסטרון" → "sleep testosterone levels"
```

### 3.7 `NUTRITION_SYSTEM_PROMPT` (269–277)

```text
אתה תזונאי מקצועי. אתה מנתח ארוחות בעברית ומחזיר נתונים תזונתיים מדויקים בפורמט JSON.

## כללים:
1. היה ריאלי במספרים — השתמש במאגרי מידע תזונתיים מקובלים.
2. אם יש ספק — תן הערכה שמרנית.
3. אם לא זיהית מאכל — החזר ערכים 0 וציין בשם "לא זוהה".
4. השתמש בשמות בעברית למאכלים, ויטמינים, ומינרלים.
5. אחוזים של ויטמינים/מינרלים = אחוז מה-RDA היומי.
6. החזר רק JSON תקין, בלי טקסט נוסף.
```

### 3.8 `RESEARCH_CHAT_SYSTEM_PROMPT` (279–291) — מצב `papers`

```text
אתה מדען-על אנליטי. תפקידך: לענות על שאלות של המשתמש בהתבסס **אך ורק** על המחקרים שסופקו לך.

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
10. אם המשתמש שואל משהו לא קשור למחקרים — אמור "השאלה לא קשורה למחקרים שלפנַי".
```

### 3.9 `RESEARCH_CHAT_HYBRID_SYSTEM_PROMPT` (292–312)

```text
אתה ג'רוויס — עוזר AI אישי חכם, חד, ישיר, עם גישה למחקרים מדעיים.

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

## שפה: עברית בלבד.
```

### 3.10 `NUTRITION_COACH_SYSTEM_PROMPT` (4552–4566)

```text
אתה J.A.R.V.I.S — תזונאי אישי בעברית, בגובה העיניים. אתה עונה על שאלות של מתבגר בן 15 וחמישה חודשים שמתאמן בקליסטניקס 4-5 פעמים בשבוע, במטרה לבנות שריר ולהישאר חטוב.

## כללי התנהגות:
1. ענה בעברית, ישיר ופרקטי. אפס קלישאות ואפס "יאס-מן".
2. התבסס קודם כל על נתוני היום שסופקו (קלוריות, חלבון, פחמימות, שומן, סיבים, סוכר, מים, ארוחות) — צטט מספרים אמיתיים.
3. אם חסר נתון — אמור במפורש שאין נתון, ואל תמציא מספרים.
4. תן המלצות אוכל קונקרטיות (מה וכמה) שמתאימות לתפריט ישראלי זמין.
5. אם שואל על תוספים — היה זהיר, הדגש שאוכל עדיף על תוסף, והפנה לרופא/דיאטן לפני התחלה.
6. אם עולה נושא של ירידה חדה במשקל, הפרעות אכילה או מצב רפואי — אמור בעדינות שזה מחייב איש מקצוע, ואל תיתן המלצות מסוכנות.
7. אם השואל מבקש תפריט — תן תפריט יומי קצר עם 3-4 ארוחות ומספרים.
8. השתמש ב-Markdown: **מודגש**, רשימות עם -, קוד עם \`\`\.
9. אורך: 2-5 פסקאות קצרות, בלי חזרות.
10. אל תמציא קישורים, תוספים, מרשמים או בדיקות דם.

## שפה: עברית בלבד.
```

### 3.11 `TRAINING_COACH_SYSTEM_PROMPT` (4683–4701)

```text
אתה מאמן קליסטניקס מומחה בגובה העיניים. אתה עונה על שאלות של מתבגר בן 15 וחמישה חודשים שמתאמן בקליסטניקס 4-5 פעמים בשבוע ומטרתו Full Planche + Front Lever.

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
8. השתמש ב-Markdown: **מודגש**, רשימות עם -, קוד עם \`\`\.
9. אורך: 3-6 פסקאות קצרות.
10. לעולם אל תמציא קישורים ליוטיוב — המערכת תוסיף אותם אוטומטית.

## שפה: עברית בלבד.
```

### 3.12 `TRAINING_GENERATE_SYSTEM_PROMPT` (5002–5136)

מערך שורות שמצטרף ב-`\n` (שורה 4378). תוכן מלא:

```text
אתה מאמן קליסטניקס אישי של Ori, בן 15 וחמישה חודשים מאזור השומרון.

═══════════════════════════════════════════════════════════
## זהות המשתמש — ELITE
═══════════════════════════════════════════════════════════

### כוח דינמי
- ~10 עליות כוח (Muscle Ups) נקיות
- ~70 שכיבות סמיכה בטכניקה נקייה

### אלמנטים סטטיים
- Straddle Planche
- עמידות ידיים מלאות (כולל עמידת ידיים מקסיקנית)
- שכיבות סמיכה ב-90 מעלות (90-degree push-ups)
- Front Lever — מחזיק 4 שניות, שואף ל-5
- Back Lever
- One Arm Back Lever

### מעברים ותרגילי פרס
- Presses לפלאנץ
- Presses לעמידות ידיים
- Negatives ב-90 מעלות
- 360 (Ginger)
- Ginger Double 360

### ציוד זמין
- מקבילים נמוכים וגבוהים
- משקולות חופשיות
- רצועת התנגדות 30 ק"ג
- מגנזיום

### ציוד שאין
- טבעות
- אפוד משקל

### מטרות ארוכות טווח
- Full Planche
- Front Lever 5 שניות
- Handstand (שיפור)
- חיטוב

═══════════════════════════════════════════════════════════
## מילון מושגי קליסטניקס — 5 קטגוריות
═══════════════════════════════════════════════════════════

כשהמשתמש מבקש אימון בקטגוריה כלשהי — הבן את ההגדה המלאה שלה.

### 1. תרגילים סטטיים (Static / Isometrics)
מה זה: תרגילים שבהם הגוף נמצא במצב קפוא, ללא תנועה במפרקים, אבל שרירי הליבה והשלד עובדים תחת עומס קיצוני ועצום כדי להילחם בכוח הכבידה.
דוגמאות של Ori: Front Lever (מחזיק 4 שניות), Straddle Planche, Back Lever, L-sit, One Arm Back Lever, Handstand.
המטרה: בניית כוח גידים אדיר, יציבות מוחלטת ושליטה אבסולוטית במרחב בלי לייצר מומנטום.

### 2. תרגילי פוש (Push / Push Elements)
מה זה: כל התרגילים שבהם דוחפים את הגוף הרחק מהקרקע, מהמקבילים או מהמוט (שרירי חזה, כתפיים קדמיות, יד אחורית).
דוגמאות של Ori: 70 שכיבות סמיכה, מקבילים, שכיבות סמיכה בעמידת ידיים (Handstand Push-ups), שכיבות סמיכה ב-90 מעלות.
המטרה: פיתוח כוח דחיפה נפיץ וחזק בפלג הגוף העליון.

### 3. תרגילי פול (Pull / Pull Elements)
מה זה: כל התרגילים שבהם מושכים את הגוף אל עבר המוט, הטבעות או הקרקע (שרירי גב, בייספס, כתף אחורית).
דוגמאות של Ori: עליות כוח (Muscle Ups), Front Lever, Back Lever, One Arm Back Lever.
המטרה: בניית עוצמה אדירה בגב ובידיים, ויכולת שליטה במשיכה משקל גוף מלא.

### 4. תנועה דינמית / כוח דינמי (Dynamic & Dynamic Strength)
מה זה: תנועה שזורמת לאורך טווח תנועה מלא (Range of Motion), שדורשת מעבר חלק בין מצבים שונים, לעיתים קרובות תוך כדי שחרור אחיזה, סיבובים במרחב או תאוצה.
דוגמאות של Ori: 10 עליות כוח (עם אלמנט דינמי של מעבר מהמשיכה לדחיפה), 360, ג׳ינג׳ר דאבל 360.
המטרה: שילוב של קואורדינציה, אגירת תנע (Momentum) או שליטה אבסולוטית בכוח מתפרץ תוך כדי תנועה.

### 5. באלאנס (Balance / Equilibrium)
מה זה: היכולת לשמור על מרכז הכובד (Center of Mass) של הגוף בדיוק מעל בסיס התמיכה, תוך כדי הפעלת תיקונים מיקרו-מוסקולריים בלתי פוסקים בשיווי משקל.
דוגמאות של Ori: עמידת ידיים (Handstand), עמידת ידיים מקסיקנית, One Arm Handstand Drills.
המטרה: שליטה עצבית-שרירית מוחלטת, פרופריוצפציה (חוש המיקום במרחב) ואיזון טוטאלי של כל שרירי הגוף מבהונות הרגליים ועד קצות האצבעות בידיים.

═══════════════════════════════════════════════════════════
## חוקי הבנה של בקשות
═══════════════════════════════════════════════════════════

### קרא מילה במילה
- קרא את הבקשה של Ori **מילה במילה**.
- אם הוא כתב "באלאנס" — תן תרגילי באלאנס (One Arm Handstand, weight shifts, equilibrium drills).
- אם הוא כתב "כוח דינמי" — תן תרגילי כוח דינמי (Muscle Ups, 360s, explosive).
- אם הוא כתב "סטטי" — תן תרגילי isometric (Planche, Front Lever, L-sit).
- **אל תחליף מילים דומות**. באלאנס ≠ עמידות ידיים. כוח דינמי ≠ סטטי. פוש ≠ פול.

### שילוב קטגוריות — חשוב!
- אם Ori ביקש קטגוריה אחת — תן תרגילים **רק** מהקטגוריה הזו.
- אם Ori ביקש 2 קטגוריות — חלק שווה: 50% / 50%.
- אם Ori ביקש 3 קטגוריות — 33% / 33% / 33%.
- **אל תיתן 6 תרגילים מכולם מקטגוריה אחת** כשהמשתמש ביקש שילוב.

### דוגמאות קונקרטיות
- "אימון באלאנס + עמידות יד" → 3 תרגילי באלאנס (One Arm Handstand Drills, Weight Shifts, Finger Balance) + 3 תרגילי עמידות ידיים (Handstand Press, Mexican Handstand, Wall Handstand).
- "כוח דינמי בפול" → Muscle Ups, Explosive Pull-ups, 360s, Muscle Up Transitions.
- "סטטי + פוש" → Straddle Planche, 90-degree Push-ups, Planche Leans, Tuck Planche.

═══════════════════════════════════════════════════════════
## המשימה
═══════════════════════════════════════════════════════════

צור אימון מותאם אישית לבקשה של Ori. האימון ברמת ELITE — לא למתחילים, לא לבינוניים.

═══════════════════════════════════════════════════════════
## פורמט פלט — חובה JSON בלבד
═══════════════════════════════════════════════════════════

החזר JSON תקני בלבד. אל תוסיף טקסט לפני או אחרי. אל תוסיף סימוני code block.
המבנה חייב להיות בדיוק כך:
{
  "title": "שם קצר לאימון בעברית",
  "durationMinutes": 40,
  "exercises": [
    {
      "name": "שם התרגיל בעברית",
      "sets": 4,
      "reps": "8-10",
      "rest": "90s",
      "notes": "הערה קצרה על טכניקה"
    }
  ]
}

═══════════════════════════════════════════════════════════
## חוקים סופיים
═══════════════════════════════════════════════════════════

1. 6-10 תרגילים לאימון קצר (40 דק), 10-14 לארוך (90 דק).
2. סדר הגיוני: חימום קצר → תרגילי בסיס כבדים → תרגילי עזר → ליבה.
3. התאם את הבקשה של Ori **בדיוק** — קרא מילה במילה.
4. השתמש בשמות תרגילי קליסטניקס ELITE אמיתיים.
5. הערות בעברית, קצרות (עד 12 מילים), עם דגש טכני.
6. כל החזרות כ-string ("8-10", "AMRAP", "4s hold", "5s negative").
7. התאם תרגילים לפי הציוד שיש לו (מקבילים, משקולות, רצועה, מגנזיום) — בלי טבעות, בלי אפוד משקל.
8. אם הבקשה כללית מדי — בחר תרגילי ELITE שמתאימים למטרות שלו (Planche, Front Lever, Handstand).
9. **בכל שילוב קטגוריות — חלק שווה.** אל תיתן הכל מקטגוריה אחת.
```

---

## 4. איך נקרא Gemini

**הפונקציה המרכזית:** `callGemini` — שורה 1020 (עד 1444): שרשרת המודלים, ה-retries ו**שני מסלולי תעבורה** — `generateContent` (JSON) או `streamGenerateContent?alt=sse` ברגע שיש `onDelta`.
**עטיפה לשיחה חופשית:** `callGeminiWithRetry` — שורה 1314 (מריץ גם את לולאת ה-Function Calling).
**עטיפה ל-JSON:** `callGeminiJSON` — שורה 1446.
**עטיפה לראייה:** `callGeminiVision` — שורה 1848.

### 4.1 מה נשלח בפועל

| רכיב | مقدار |
|---|---|
| Endpoint | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}` (1082), או `…:streamGenerateContent?alt=sse&key=…` (1081) כשנשלח `onDelta` |
| `model` | לא נשלח בגוף הבקשה — הוא חלק מה-URL. ברירת מחדל: `CONFIG.geminiModel` (`GEMINI_MODEL`, ברירת מחדל `gemini-3.8-flash`) |
| `systemInstruction` | `{ parts: [{ text: systemInstruction }] }` (שורה 1043) |
| `contents` | מערך `{ role, parts: [{ text }] }` — היסטוריה + השאלה החדשה (`buildConversationContents`, 868) |
| `tools` | רק כשה-`/api/ask` לא מריץ סבב "בלי כלים": `{ tools: [{ functionDeclarations: [...] }] }` (1036; ההצהרות עצמן ב-`ask-tools.js`) |
| `temperature` | ברירת מחדל `0.7` (`callGemini`), `0.3` (`callGeminiJSON`), `0.5` (`callGeminiVision`) |
| `maxOutputTokens` | ברירת מחדל `2048` (`callGemini`), `8192` (`callGeminiJSON`), `512` (`callGeminiVision`) |
| `responseMimeType` | רק ב-`callGeminiJSON`: `application/json` (שורה 1473) |
| timeout | `GEMINI_TIMEOUT_MS` (45s), ראייה 30s, תרגום 15s |
| `retries` | `DEFAULT_RETRIES` = 2 (`VISION_RETRIES` = 1) |
| שלא נשלח | `safetySettings`, `responseSchema`, `topP`, `topK`, `candidateCount` |

**שרשרת מודלים** (`gemini-fallback.js`, שורות 8–23): המודל הראשי מ-`GEMINI_MODEL`, ואחריו `gemini-3.8-flash` → `gemini-2.5-flash` → `gemini-2.0-flash` → `gemini-1.5-flash` (ללא כפילויות). מודל שלא נמצא (404) מדלג מיד למודל הבא בלי לבזבז ניסיונות.

### 4.2 פרמטרים לפי endpoint

| Endpoint / פונקציה | פונקציית הקריאה | `temperature` | `maxOutputTokens` | `systemInstruction` |
|---|---|---|---|---|
| `/api/ask` | `callGeminiWithRetry` (1314) | 0.7 | 2048 | `SYSTEM_PROMPT` או `KNOWLEDGE_SYSTEM_PROMPT` + צ'אנקים; `tools` מוצעים בכל סבב חוץ מהאחרון |
| `/api/research` (ניתוח) | `callGemini` (2433) | 0.4 | 2500 | inline (2434) |
| `/api/research-chat` | `callGemini` (3596) | 0.5 | 2048 | `RESEARCH_CHAT_*` לפי `mode` + תמצית מחקרים |
| `/api/analytics-chat` | `callGemini` (3703) | 0.6 | 1500 | `ANALYTICS_SYSTEM_PROMPT` + נתוני אנליטיקס + ידע |
| `/api/nutrition/analyze` | `callGeminiJSON` (3821) | 0.3 | 8192 | `NUTRITION_SYSTEM_PROMPT` |
| `/api/nutrition/chat` | `callGemini` (3947) | 0.6 | 1500 | `NUTRITION_COACH_SYSTEM_PROMPT` + נתוני היום + ידע |
| `/api/training/coach` | `callGemini` (4048) | 0.5 | 1800 | `TRAINING_COACH_SYSTEM_PROMPT` |
| `/api/training/analyze` | `callGemini` (4206) | 0.4 | 2000 | `TRAINING_ANALYZE_SYSTEM_PROMPT` |
| `/api/training/generate` | `callGemini` (4413) | 0.7 | 2500 | `TRAINING_GENERATE_SYSTEM_PROMPT` |
| `/api/vision` | `callGeminiVision` (1229) | 0.5 | 512 | `VISION_SYSTEM_PROMPT` כחלק מ-`contents` (ללא שדה `systemInstruction`) |
| `translateToEnglish` | `callGemini` (1392) | 0.2 | 128 | `TRANSLATION_SYSTEM_PROMPT`, `retries: 1` |

### 4.3 מה מוחזר

`{ reply, coreLatencyMs, attempts, modelUsed }` מ-`callGemini`, ובנוסף `functionCalls` (הקריאות שהמודל ביקש) ו-`modelParts` (החלקים המקוריים, כולל `functionCall`) בסבב כלים; `{ data, coreLatencyMs, attempts, modelUsed }` מ-`callGeminiJSON` (JSON מפורסר); `callGeminiWithRetry` מוסיף `toolsUsed: [{ name, ok, ms }]`. ה-endpoints עוטפים זאת ב-`{ reply / analysis, latencyMs, roundTripMs, attempts, timestamp }`, ו-`/api/ask` מחזיר גם `toolsUsed`.

### 4.4 Function calling — הכלים של `/api/ask`

`/api/ask` שולח `functionDeclarations` ומאפשר למודל להחליט בעצמו אם להפעיל כלי לפני שהוא עונה.
ההצהרות, ההרצה ובניית ה-`functionResponse` יושבות ב-`ask-tools.js` (302 שורות) — מודול טהור; כל
יכולת (דפדפן, YouTube, מאגר ידע) מוזרקת מ-`getAskToolDeps`, ולכן אפשר לבדוק אותו בלי רשת ובלי מפתח.

| כלי | `run(args, deps)` | `summarize(result)` | מקור הנתונים |
|---|---|---|---|
| `web_search` | `deps.browse(query)` → עד 5 `{title,url,snippet}` | `N תוצאות בדפדפן` | `browseWithChrome` → `node browser.js` |
| `youtube_search` | `deps.youtube(query, max_results)` → עד 8 סרטונים | `N סרטונים` | `searchYouTubeVideos` |
| `knowledge_search` | `deps.knowledge(query)` → עד 4 קטעים | `N קטעים מהמאגר` | `searchKnowledge` (BM25) |
| `training_data` | `deps.training(topic)` → עד 4 קטעים | `N קטעי אימון` | `trainingKnowledgeChunks` |

**הלופ** (`callGeminiWithRetry`, 1314–1444):

1. `withTools = !forceAnswer && round < askToolsMaxRounds` — כל סבב שולח `tools`, חוץ מהאחרון.
2. אין `functionCalls` בתשובה → מוחזרת התשובה יחד עם `toolsUsed`.
3. לכל קריאה: `metrics.totalAskToolCalls += 1` (ובכשל גם `totalAskToolErrors`), `runAskTool` מריצה
   אותה עם `getAskToolDeps()`, והתוצאה נדחפת כ-`functionResponse` לתור `user` שאחרי תור ה-`model`.
4. אם נגמרה התקרה `askToolsBudgetMs` — נזרק `GeminiError` עם 504 ("הכלים דרשו יותר מדי זמן").
5. בסבב האחרון `forceAnswer = true`: נוסף לתור `user` מסר שמחייב תשובה מהמידע שכבר נאסף — כך
   המודל לא יכול להיתקע בלולאת כלים אינסופית.
6. כלי שנכשל **לעולם לא זורק**: `runAskTool` מחזיר `{ ok: false, result: { error }, summary: 'הכלי נכשל: …' }`
   והמודל מנסח את הכשל בתשובה.

מגבלות הטקסט בתוך `ask-tools.js`: שאילתה 300 תווים, כותרת 200, תקציר 400, קטע 1,200; עד 5 תוצאות
ווב, 8 סרטונים ו-4 קטעים. כלי לא מוכר או `query` חסר מוחזרים כשגיאה למודל — לא כתקלת שרת.
תשובה שנענתה מנתוני כלים לא נכנסת ל-`askCache`.

### 4.5 SSE — חוזה האירועים של `/api/ask`

`clientWantsStream` (3478) מחליט אם הבקשה סטרימינג: `stream: true` בגוף, `?stream=1|true`, או
`Accept: text/event-stream`. `ASK_STREAM_DISABLED=1` מכבה את המסלול לגמרי, וכל תשובה חוזרת כ-JSON.

`createAskStream` (3501) מחזיר writer עם `send(event, payload)` ו-`end()`, קובע
`Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`
ו-`X-Accel-Buffering: no` (בלי זה nginx/Render מאגדים את התשובה למכה אחת), ומריץ heartbeat של
`: ping` כל `ASK_STREAM_HEARTBEAT_MS`. `res.on('close')` מסמן סגירה ומפסיק את ה-heartbeat; ב-`/api/ask`
הוא גם מפעיל `AbortController`, כדי לא לשלם על טוקנים שאין למי למסור.

| אירוע | data | הערות |
|---|---|---|
| `meta` | `{ historyUsed, knowledgeUsed, knowledgeChunks, knowledgeSources }` | פעם אחת, לפני הקריאה למודל |
| `tool` | `{ name, label, status: 'running'\|'done'\|'error', args?, summary?, ms? }` | `running` לפני ההרצה ו-`done`/`error` אחריה — זוג פריימים לכל קריאת כלי, נכתב מ-`onToolCall` |
| `delta` | `{ text }` | נכתב לכל `onDelta`; מסמן `answerStreamed` כדי ש-`done` לא ישכפל את הטקסט |
| `done` | כל ה-payload של `/api/ask` (`reply`, `toolsUsed`, `attempts`, `knowledgeUsed`, …) + `streamed: true` | תמיד האירוע האחרון |
| `error` | `{ reply, partial, status }` | רק אחרי שהערוץ נפתח (אי אפשר לשנות סטטוס HTTP); `partial: true` = כבר נשלח טקסט |

ולידציה (ריק/ארוך מדי) רצה **לפני** פתיחת הערוץ, ולכן קלט רע מקבל `400`/`413` עם JSON גם כשהבקשה
ביקשה סטרימינג. בצד הלקוח `consumeAskStream` (ב-`public/js/app.js`) מפצל פריימים ומנתב
`delta`/`tool`/`done`/`error` ל-callbacks; אירוע `tool` מצייר צ'יפ בבועה (`drawToolEvent`), והצ'יפ
נשאר תצוגה בלבד — לא נשמר בהיסטוריה ולא מועתק.

---

## 5. קבצים חיצוניים שנטענים (`require`)

| מודול | שורה | מאיפה |
|---|---|---|
| `express` | 27 | `node_modules` |
| `path` | 28 | מודול מובנה של Node |
| `fs` | 29 | מודול מובנה של Node |
| `helmet` | 30 | `node_modules` |
| `cors` | 31 | `node_modules` |
| `compression` | 32 | `node_modules` |
| `express-rate-limit` | 33 | `node_modules` |
| `dotenv` | 34 | `node_modules` (`.config()` טוען `.env` מהתיקייה הראשית) |
| `./gemini-fallback` | 1033, 1458, 1849 | מודול מקומי — שרשרת fallback בין מודלים |
| `./ask-tools` | 47 | מודול מקומי — הצהרות הכלים, `runAskTool`, `toFunctionResponse` (302 שורות, מוזרק כולו) |
| `child_process` | 3569 | מודול מובנה — הרצת `node browser.js "<query>"` בתוך `browseWithChrome` |
| `rebrowser-playwright` | — | לא נטען ב-`server.js` — בשימוש ב-`browser.js` בלבד |

בנוסף: `server.js` מפעיל תהליך חיצוני `node browser.js` (סקרייפינג DuckDuckGo Lite), ו-`whatsapp-bot.js` (לא נטען מהשרת) משתמש ב-`fetch` גלובלי / `node-fetch` מול `/api/ask`.

---

## 6. משתני סביבה בשימוש (שמות בלבד)

| קבוצה | משתנים |
|---|---|
| ליבה | `PORT`, `NODE_ENV`, `GEMINI_API_KEY` (חובה — אחרת השרת יוצא ב-`process.exit(1)`), `GEMINI_MODEL` |
| זמני timeout | `GEMINI_TIMEOUT_MS`, `GEMINI_TIMEOUT_CEILING_MS`, `GEMINI_VISION_TIMEOUT_MS`, `GEMINI_TRANSLATION_TIMEOUT_MS`, `YOUTUBE_TIMEOUT_MS`, `TIKTOK_TIMEOUT_MS`, `RESEARCH_TIMEOUT_MS` |
| מפתחות שירות | `YOUTUBE_API_KEY`, `CORE_API_KEY`, `SEMANTIC_SCHOLAR_KEY` |
| גבולות קלט | `MAX_PROMPT_LENGTH`, `MAX_RESEARCH_QUERY_LENGTH`, `MAX_IMAGE_SIZE_BYTES` |
| Rate limiting | `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `VISION_RATE_LIMIT_MAX`, `RESEARCH_RATE_LIMIT_MAX` |
| Retry | `RETRY_ON_429_DELAY_MS`, `RETRY_ON_503_DELAY_MS`, `DEFAULT_RETRIES`, `VISION_RETRIES` |
| מאגר ידע | `KNOWLEDGE_MAX_FILE_SIZE_BYTES`, `KNOWLEDGE_CHUNK_SIZE`, `KNOWLEDGE_TOP_CHUNKS`, `KNOWLEDGE_MIN_SCORE`, `KNOWLEDGE_PERSONAL`, `KNOWLEDGE_FITNESS`, `KNOWLEDGE_INTERESTS`, `KNOWLEDGE_BUSINESS`, `KNOWLEDGE_PREFERENCES`, `KNOWLEDGE_CONTENT` |
| זיכרון שיחה | `MAX_HISTORY_MESSAGES` |
| BM25 | `BM25_K1`, `BM25_B` |
| מחקר | `RESEARCH_MAX_PER_SOURCE`, `RESEARCH_FINAL_LIMIT`, `RESEARCH_ANALYSIS_TOP_PAPERS`, `RESEARCH_ABSTRACT_SNIPPET_LENGTH`, `RESEARCH_CHAT_CONTEXT_LIMIT` |
| cache תשובות `/api/ask` | `ASK_CACHE_ENABLED` (`0` מכבה), `ASK_CACHE_TTL_MS` (5 דק׳), `ASK_CACHE_MAX_ENTRIES` (100), `ASK_CACHE_MIN_QUERY_LENGTH` (8), `ASK_CACHE_ALLOW_HISTORY` (`1` = גם עם היסטוריה) |
| סטרימינג `/api/ask` (SSE) | `ASK_STREAM_DISABLED` (`1` מכבה), `ASK_STREAM_HEARTBEAT_MS` (10,000) |
| כלים (Function Calling) | `ASK_TOOLS_DISABLED` (`1` מכבה), `ASK_TOOLS_MAX_ROUNDS` (3), `ASK_TOOLS_BUDGET_MS` (100,000), `ASK_TOOL_TIMEOUT_MS` (30,000) |

> `.env.example` מתעד את הליבה (`GEMINI_API_KEY`, `GEMINI_MODEL`, `PORT`), את מפתחות השירות ואת כל
> משתני `/api/ask` — cache, סטרימינג וכלים (בשורות מוערות). כל השאר אופציונליים עם ברירת מחדל
> ב-`CONFIG` (56–162).

---

## 7. קבצי `public/js` ו-`public/css`

### 7.1 `public/js`

| קובץ | שורות | מה הוא עושה |
|---|---|---|
| `app.js` | 1891 | ליבת האפליקציה הראשית (`index.html`): צ'אט `/api/ask` (SSE — `consumeAskStream`, `appendStreamBubble`, צ'יפי כלים), היסטוריה, מיקרופון, מצלמה + `/api/vision`, TTS, פולינג `/api/metrics`. |
| `neural.js` | 476 | אנימציית "מוח חלקיקים" כפול (כדור בפאנל + רקע) עם `prefers-reduced-motion`. |
| `landing.js` | 299 | עמוד הנחיתה: כדור חלקיקים על קנבס, כפתורי CTA, שמירת שאלה ממתינה ב-`sessionStorage`. |
| `landing.js.backup` | 64 | גיבוי ישן שאינו נטען. |
| `training.js` | 1019 | עמוד אימון: יצירת אימון (`/api/training/generate`), צ'ק-ליסט, סטטיסטיקות, שמירה ב-`localStorage` (`jarvis_training_v1`), ניתוח (`/api/training/analyze`), צ'אט מאמן + FAB (`/api/training/coach`). |
| `nutrition.js` | 816 | מעקב תזונה יומי: ארוחות, סה"כ מול יעדים, מים, תובנות; `/api/nutrition/analyze`; `localStorage` (`jarvis_nutrition_v2`). |
| `nutrition-chat.js` | 305 | צ'אט תזונאי צף (FAB + חלון) ששולח את נתוני היום ל-`/api/nutrition/chat`, עם היסטוריה מקומית. |
| `analytics.js` | 1601 | דשבורד אנליטיקס: טבלה/פילטרים, ייבוא YouTube/TikTok/Instagram, צ'אט `/api/analytics-chat`, מודל Mega Prompt; `localStorage` (`jarvis_analytics_v1`, `jarvis_analytics_chat_v1`). |
| `research.js` | 343 | עמוד מחקר: שאילתה → `/api/research`, רינדור מאמרים וסיכום, היסטוריית חיפושים ב-`localStorage`. |
| `research-chat.js` | 509 | צ'אט מחקרים: FAB, מצבי `papers`/`hybrid`, צ'יפים, ייצוא PDF, אינטגרציה עם היסטוריית שיחות. |
| `research-chat-history.js` | 450 | שמירת שיחות מחקר ב-`localStorage` (`jarvis_research_chat_history_v1`), עד 20 שיחות, ייצוא/הדפסה. |

### 7.2 `public/css`

| קובץ | שורות | מה הוא עושה |
|---|---|---|
| `main.css` | 1975 | עיצוב האפליקציה הראשית (`index.html`) — HUD קינמטי בזהב/טורקיז, כולל `.tool-trace`/`.tool-chip` לצ'יפי הכלים. |
| `mobile.css` | 289 | אובריידים למובייל לאפליקציה הראשית (`max-width: 1024px`). |
| `hud-theme.css` | 316 | טוקנים ופרימיטיבים משותפים (רקע, צבעים, כרטיסים/כפתורים) ל-4 עמודי המודולים. |
| `hud-chat.css` | 389 | רכיב צ'אט צף משותף: `hud-chat-fab` + חלון שיחה (נטען ב-nutrition/analytics/research). |
| `landing.css` | 422 | עמוד הנחיתה — Stark Industries HUD. |
| `landing.css.backup` | 301 | גיבוי ישן שאינו נטען. |
| `training.css` | 1929 | עמוד האימון + חלון הצ'אט של המאמן. |
| `nutrition.css` | 1140 | עמוד התזונה (טבלאות, יעדים, טפסים). |
| `analytics.css` | 2826 | דשבורד האנליטיקס + מעטפת `.hud-chat-window--analytics` לחלון הצ'אט. |
| `research.css` | 2186 | עמוד המחקר + מודל הצ'אט וההיסטוריה. |

---

## 8. Cache ו-Retry

### 8.1 Cache — מה קיים ומה לא

| סוג | מיקום | פירוט |
|---|---|---|
| Cache לתגובות AI | `/api/ask` בלבד — `askCacheGet` (3414), `askCacheSet` (3434), `askCacheInfo` (3457) | LRU בזיכרון: TTL 5 דק׳, עד 100 ערכים, שאילתה ≥ 8 תווים, וברירת מחדל רק בלי היסטוריה (`ASK_CACHE_*`). **תשובה שנעזרה בכלים אינה נכנסת ל-cache** (3820), כי נתוני כלים מתיישנים מיד. אין cache ל-`/api/research` ולשאר ה-endpoints. |
| אינדקס ידע בזיכרון | `knowledge` (511–519), `loadKnowledgeBase` (688) | `chunks`, `files` (Map), `docFreq` (Map), `vocab` (Set), `avgDocLength`, `loadedAt`. נבנה באתחול (4752) ונבנה מחדש בכל upload/delete/reload (2790, 2830, 2841). |
| Cache סטטי HTTP | `express.static` (2514–2518) | `maxAge: '1h'` + ETag; `index: false` (כדי ש-`/` יעבור דרך ה-handler). |
| מטריקות | `metrics` (257–281) | `latencySamples` נשמר ל-50 דגימות אחרונות בלבד (`shift` ב-286); `perSourceHits` Counter פר-מקור. |
| Service Worker | `public/sw.js` (3 שורות) | pass-through בלבד: `fetch(e.request)` — אין `caches`, אין גרסת cache, ולכן אין צורך ב"bump" בעת שינוי נכסים. |
| צד לקוח | `localStorage` | `jarvis_history_v1`, `jarvis_tts_enabled_v1`, `jarvis_analytics_v1`, `jarvis_analytics_chat_v1`, `jarvis_research_history_v1`, `jarvis_research_chat_history_v1`, `jarvis_nutrition_v2`, `jarvis_training_v1` |
| צד לקוח | `sessionStorage` | `jarvis_pending_question` (העברת שאלה מהנחיתה לאפליקציה). |

> מסקנה: אין שכבת caching לשאר הנתיבים — רק ה-LRU של `/api/ask` (מפתח לפי שאילתה, בלי היסטוריה
> ובלי כלים), אינדקס הידע שנטען לזיכרון, וה-static cache של הדפדפן.

### 8.2 Retry logic — היכן ואיך

| רכיב | שורות | התנהגות |
|---|---|---|
| קונפיגורציה | 79–82 | `RETRY_ON_429_DELAY_MS`=55,000, `RETRY_ON_503_DELAY_MS`=5,000, `DEFAULT_RETRIES`=2, `VISION_RETRIES`=1 |
| `sleep` | 353–355 | השהיה |
| `backoffDelay` | 357–359 | `min(1000·2^attempt, 5000)` — 1s, 2s, 4s… תקרה 5s |
| `fetchWithTimeout` | 361–370 | Abort אחרי `timeoutMs` |
| זיהוי שגיאות | 372–401 | `isRateLimitError` (429/quota), `isHighDemandError` (503/overloaded), `extractRetryDelay` (Regex `retry in Xs` => ms+1000) |
| לולאת `callGemini` | 1091–1444 | לולאה כפולה: מודל × ניסיון. 404 → מודל הבא מיד; 503 → sleep `min(retryDelay, 8000)`; 429 → sleep `min(retryDelay, 10,000)`; 5xx אחר → `backoffDelay`; מיצוי ניסיונות → מודל הבא. שני מסלולי תעבורה: `generateContent` (JSON) או `streamGenerateContent?alt=sse` כשיש `onDelta`, ותקרה קשיחה `deadlineMs` שגם ההמתנות לא חוצות אותה |
| לולאת `callGeminiJSON` | 1446–1846 | אותה סכמה בדיוק, עם `responseMimeType: application/json` ופרסור |
| לולאת `callGeminiVision` | 1848–1998 | אותה סכמה, `VISION_RETRIES`=1 |
| לולאת הכלים | 1335–1444 | סבבי כלים בתוך `callGeminiWithRetry`: כל סבב יורש את `deadlineMs` שנותר מתקציב `ASK_TOOLS_BUDGET_MS`; כלי בודד כפוף ל-`ASK_TOOL_TIMEOUT_MS` (‏`execFile` timeout ב-`web_search`) |
| Fallback מודלים | `gemini-fallback.js` 8–23 | הראשי + 3 חלופות |
| תרגום | 2000–2020 | `retries: 1`, timeout 15s, נפילה שקטה למקור במקרה כשל |
| מקורות מחקר | 2359–2393 | **אין retry** — `Promise.allSettled` על 11 מקורות; מקור שנכשל נזרק |
| YouTube/TikTok | 3281–3437, 4092–4163 | **אין retry** — `fetchWithTimeout` בודד; כשל מחזיר תוצאה ריקה/שגיאה ידידותית |

---

## 9. ממצאים תפעוליים (מהמיפוי)

1. ~~`POST /api/training/analyze` שבור~~ **נבדק מחדש (2026-10-28) — עובד.** `TRAINING_ANALYZE_SYSTEM_PROMPT` מוגדר ב-`server.js:5142` (module scope, מאותחל לפני `app.listen`) ומשמש ב-4862/4960; לכן אין `ReferenceError`. אומת אמפירית: בקשה תקינה ל-endpoint מגיעה לקריאת Gemini ומחזירה `GeminiError` (`API key not valid` עם מפתח מזויף) ולא את הודעת השגיאה הגנרית של `ReferenceError`. הטענה הקודמת הוסרה.
2. ~~קוד יתום~~ **נמחק (2026-10-28):** `POST /api/analyze` הוסר מ-`server.js` יחד עם `POST /api/browse` ו-`POST /api/browser/action` — לשלושתם לא היה קורא בצד הלקוח. `computeAnalyticsSummary` **לא** נמחק כי `/api/analytics-chat` עדיין משתמש בו.
3. **`/api/training/save` ו-`/api/training/history` לא באמת שומרים דבר** — הראשון מחזיר `savedAt` בלבד, השני מחזיר מערך ריק. האחסון האמיתי הוא `localStorage` (`jarvis_training_v1`).
4. ~~**`.env.example` לא מסונכרן**~~ **נסגר (2026-10-28):** `.env.example` מתעד עכשיו את הליבה, את מפתחות השירות (`YOUTUBE_API_KEY`, `SEMANTIC_SCHOLAR_KEY`, `CORE_API_KEY`) ואת כל משתני `/api/ask` — `ASK_CACHE_*`, `ASK_STREAM_*`, `ASK_TOOLS_*`, `ASK_TOOL_TIMEOUT_MS` (בשורות מוערות). המודל עודכן ל-`gemini-3.8-flash` בהתאם ל-`CONFIG`. שאר 40+ המשתנים מופיעים רק בטבלה ב-§6.
5. **סודות בקוד מקור** — `whatsapp-bot.js` מכיל מזהה מופע וטוקן של Green API Hardcoded (שורות 9–10 בקובץ). יש להעביר ל-`.env` ולסובב את הטוקן; הקובץ לא נטען מהשרת אבל נמצא ב-Git.
6. **קבצי גיבוי/שאריות בריפו** — `server.js.broken`, `landing.js.backup`, `landing.css.backup`, `landing.html.backup`, ותיקיית `.aider.tags.cache.v4` (מטמון SQLite של aider). אינם נטענים ע"י השרת.
7. ~~אין בדיקות אוטומטיות~~ **נסגר (2026-10-28):** נוסף `test/smoke.test.js` (`node:test`, ללא תלות חדשה) ו-`npm test` מריץ `node --test` על שני קבצים. הבדיקות מרימות את השרת על פורט פנוי עם `GEMINI_API_KEY` דמה (אין עלות טוקנים) ומכסות: תחביר של כל קובצי ה-JS (כולל `ask-tools.js`), `/api/health`, `/api/metrics`, `/api/knowledge`, `/api/mega-prompt`, הדפים `/` ו-`/app`, היעדרות שלושת ה-endpoints שנמחקו, ווולידציית קלט (`/api/ask` → 400/413, `/api/training/analyze` → 400). נוספו גם בדיקות לחוזה ה-SSE (`text/event-stream`, `delta` שמסתכם ל-`reply`, `done` אחרון, JSON כשלא ביקשו סטרימינג) וליחידות של שכבת הכלים (`test/ask-tools.test.js`). סה"כ 27 בדיקות. `npm run check` נשאר לבדיקת תחביר מהירה של `server.js` בלבד.
8. **ניתוב "חפש/מצא" הישן מקדים את הכלים** — `/api/ask` מנתב בקשה שמכילה `חפש`/`מצא`/`search`/`google` ל-YouTube או ל-`browser.js` **לפני** Gemini (נתיב ישן מלפני ה-Function Calling). בשאלות כאלה המודל לא נקרא, אין אירועי `tool` בבועה, והתשובה היא פלט הסקרייפר. זה גם מה שמאפשר לבדיקות ה-SSE לרוץ בלי טוקנים (`prompt: 'חפש'` נעצר בוולידציה).
9. **צ'יפי הכלים קיימים רק במסלול ה-SSE** — הבקשה הלא-סטרימינג מחזירה `toolsUsed` ב-JSON, אבל `public/js/app.js` מצייר צ'יפים רק מאירועי `tool`, ולכן שם הם לא מוצגים. כמו כן הצ'יפים אינם נשמרים ב-`jarvis_history_v1` — הם תצוגה חיה בלבד.
10. **מדדי הכלים נחשפים רק דרך metrics** — `totalAskToolCalls` / `totalAskToolErrors` (ו-`totalAskStreamRequests`) מוחזרים ב-`/api/health` וב-`/api/metrics`; אין התראה או סף על אחוז כשל של כלים.

---

## 10. אימות שנעשה עבור מסמך זה

- `node --check server.js` — עובר (תחביר תקין).
- הרמת השרת בפועל (`PORT=4023`) — `GET /api/health` החזיר `status: ok`, `model: gemini-3.8-flash`, `knowledgeFiles: 8`.
- ~~קריאה ל-`POST /api/training/analyze` החזירה `500` עם `ReferenceError`~~ — **בוטל ב-2026-10-28:** ה-endpoint עובד (`TRAINING_ANALYZE_SYSTEM_PROMPT` מוגדר ב-module scope); ראה §9.1.
- `npm test` — 27/27 עוברות (smoke + יחידות שכבת הכלים), כולל בדיקות חוזה ה-SSE.
- **SSE + כלים, בדיקה חיה (2026-10-28):** בקשה על `/api/ask` עם `stream: true` —
  שאלת YouTube הפיקה שני אירועי `tool` שהסתיימו ב-`✅ 4 סרטונים`, ושאלת מחירים הפיקה שלושה;
  `totalAskToolCalls` ב-`/api/health` עלה 0→2 ואז 2→5, ובלי כלים `trace.hidden` נשאר `true`.
  אומת גם מסלול ה-JSON (בלי `stream`) — אותה תשובה, בלי אירועי `tool`.
- מספרי השורות במסמך נבדקו מול `server.js` (גרסה בת 5,630 שורות) ומול ספירת השורות בפועל של כל קובץ ב-`public/js` ו-`public/css`. השורות של נתיב ה-ask, `/api/health`, `/api/metrics`, ה-rate limiters ופונקציות ה-ask נבדקו מחדש ב-2026-10-28; השאר טרם רועננו.

_עודכן: 2026-10-28_
