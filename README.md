# J.A.R.V.I.S

עוזר AI אישי בעברית — צ'אט ראשי, אנליטיקס, מחקר אקדמי, תזונה ואימונים, על גבי Gemini.
שרת Node.js יחיד (Express 5) שמגיש גם את צד הלקוח, בלי שלב build.

---

## דרישות

- **Node.js 18+** (נבדק על v24)
- מפתח API של Google Gemini

## התקנה והרצה

```bash
# 1. תלויות
npm install

# 2. משתני סביבה (חובה — השרת מסרב לעלות בלי GEMINI_API_KEY)
cp .env.example .env
# ערכו את .env והזינו GEMINI_API_KEY אמיתי

# 3. הרצה
npm start
```

לאחר מכן:

| כתובת | תוכן |
|---|---|
| `http://localhost:3000/` | דף נחיתה (`public/landing.html`) |
| `http://localhost:3000/app` | האפליקציה הראשית — HUD צ'אט (`public/index.html`) |
| `http://localhost:3000/api/health` | בדיקת חיים + מטריקות |

הפורט נקרא מ-`PORT` (ברירת מחדל `3000`).

## משתני סביבה

| משתנה | חובה | ברירת מחדל | תיאור |
|---|---|---|---|
| `GEMINI_API_KEY` | ✅ | — | מפתח Gemini; השרת עוצר עם קוד יציאה 1 אם הוא חסר |
| `GEMINI_MODEL` | — | `gemini-3.8-flash` | מודל ראשי (יש שרשרת fallback אוטומטית) |
| `PORT` | — | `3000` | פורט האזנה |
| `YOUTUBE_API_KEY` | — | ריק | סטטיסטיקות סרטונים וכלי `youtube_search` |
| `SEMANTIC_SCHOLAR_KEY` / `CORE_API_KEY` | — | ריק | מכסה גבוהה יותר במקורות המחקר; החיפוש עובד גם בלעדיהם |
| `ASK_TOOLS_DISABLED` | — | ריק (כלים דלוקים) | `1` = בלי Function Calling: קריאת Gemini אחת ותשובת טקסט |
| `ASK_TOOLS_MAX_ROUNDS` | — | `3` | סבבי קריאות כלים לפני הקריאה האחרונה שנשלחת בלי כלים ומאלצת תשובה |
| `ASK_TOOLS_BUDGET_MS` | — | `100000` | תקרת זמן לכל לולאת הכלים יחד — סבבים, כלים ו-retries |
| `ASK_TOOL_TIMEOUT_MS` | — | `30000` | תקרת זמן לכלי בודד; `web_search` מרים דפדפן Chrome אמיתי |
| `ASK_STREAM_DISABLED` | — | ריק (SSE דלוק) | `1` = בלי סטרימינג: כל תשובת `/api/ask` חוזרת כ-JSON אחד |
| `ASK_STREAM_HEARTBEAT_MS` | — | `10000` | תדירות פריימי ההערה `: ping` בזמן שהמודל עוד חושב |

`GEMINI_TIMEOUT_MS`, `RATE_LIMIT_MAX`, `RESEARCH_BUDGET_MS`, `BM25_*` ועוד ~40 משתנים נוספים
קיימים עם ברירות מחדל בקובץ ה-`CONFIG` שבראש `server.js` ומתועדים בטבלה ב-`PROJECT_MAP.md` §6.
`.env.example` מתעד את הליבה ואת משתני `/api/ask` (סטרימינג, כלים, cache) — כל השאר אופציונליים.

## סקריפטים

| פקודה | מה עושה |
|---|---|
| `npm start` | מריץ את השרת (`node server.js`) |
| `npm run check` | בדיקת תחביר ל-`server.js` בלבד |
| `npm test` | כל הבדיקות (`node --test`): smoke של השרת + יחידה לשכבת הכלים |

## בדיקות

```bash
npm test
```

`npm test` מריץ את `node --test` על שני קבצי הבדיקה. `test/smoke.test.js` מבצע:

1. **בדיקת תחביר** לכל קובצי ה-JS (`server.js`, `ask-tools.js`, `browser.js`, `gemini-fallback.js`, `whatsapp-bot.js`, `public/sw.js`, `public/js/*.js`).
2. **הרמת שרת אמיתית** על פורט פנוי שנבחר דינמית, והמתנה ל-`/api/health`.
3. אימות מסלולים חיים: `/api/health`, `/api/metrics`, `/api/knowledge`, `/api/mega-prompt`, וכן הדפים `/` ו-`/app`.
4. אימות שמסלולי הוולידציה דוחים קלט רע (`/api/ask` → 400/413, `/api/training/analyze` → 400).
5. **חוזה ה-SSE של `/api/ask`** — בקשה עם `stream` מקבלת `text/event-stream` עם הכותרות הנכונות,
   `delta` שמסתכמים בדיוק ל-`reply`, `done` כאירוע אחרון, ובלי `stream` — JSON רגיל.

`test/ask-tools.test.js` בודק את שכבת הכלים ביחידה: הצהרות הפונקציה מול סכמת Gemini, פרסור הפלט
של `browser.js`, הרצת כלי עם יכולות מוזרקות (הצלחה / כשל / כלי לא מוכר / פרמטר חסר), ובניית
`functionResponse`. אין בו רשת, דפדפן או מפתח.

**הבדיקות לא צורכות טוקנים:** השרת מופעל עם `GEMINI_API_KEY` דמה. `dotenv` לא דורס
משתני סביבה קיימים, ולכן גם אם יש מפתח אמיתי ב-`.env` — הוא לא ישמש את ריצת הבדיקות.
כל הבדיקות נוגעות רק בקבצים סטטיים, בבריאות מערכת, בוולידציה שמתרחשת לפני הקריאה למודל,
ובמסלול `/api/ask` שנעצר לפני Gemini (השאילתה `חפש` מנותבת לבדיקת קלט ולא למודל).

## מבנה הפרויקט

```
server.js              כל השרת: Express 5, כל ה-endpoints, BM25, קריאות Gemini (~5,630 שורות)
ask-tools.js           שכבת ה-Function Calling של /api/ask: הצהרות הכלים, הרצה, functionResponse
gemini-fallback.js     שרשרת מודלי גיבוי + זיהוי שגיאות "high demand" / "model not found"
browser.js             שליפת תוכן אתרים דרך rebrowser-playwright (מוּרץ כ-child process ע"י /api/ask)
whatsapp-bot.js        בוט Green API עצמאי — לא נטען ע"י השרת
knowledge/             מאגר הידע ל-BM25 (.txt/.md); קבצים אישיים git-ignored
public/                צד הלקוח: HTML, CSS, JS, PWA (manifest.json + sw.js)
test/smoke.test.js     בדיקות ה-smoke (שרת אמיתי, ולידציה, חוזה ה-SSE)
test/ask-tools.test.js בדיקות יחידה לשכבת הכלים — ללא רשת, דפדפן או מפתח
PROJECT_MAP.md         מיפוי מפורט של כל endpoint, פונקציה וממצא תפעולי
```

## מה יש באפליקציה

| דף | קובץ | תיאור |
|---|---|---|
| HUD ראשי | `public/index.html` | צ'אט עם J.A.R.V.I.S (SSE + צ'יפי כלים), היסטוריה, חיפוש ברשת, ראייה (תמונות) |
| אנליטיקס | `public/analytics.html` | נתוני YouTube/TikTok וצ'אט עליהם |
| מחקר | `public/research.html` | חיפוש ב-11 מקורות אקדמיים + ניתוח עם ציטוטים `[N]` |
| תזונה | `public/nutrition.html` | ניתוח ארוחות, מאקרו, צ'אט תזונתי |
| אימונים | `public/training.html` | תוכניות אימון, מאמן AI, ניתוח התקדמות |
| נחיתה | `public/landing.html` | דף השיווק/כניסה |

### API — תמצית

| Method | Path | תפקיד |
|---|---|---|
| `GET` | `/api/health`, `/api/metrics`, `/api/knowledge`, `/api/mega-prompt` | בריאות, מטריקות, רשימת ידע, פרומפט-על לתיעוד עצמי |
| `POST` | `/api/ask` | הצ'אט הראשי — BM25 על הידע + Gemini עם Function Calling, בתשובת JSON או בזרם SSE |
| `POST` | `/api/vision` | תמונה → תיאור בעברית |
| `POST` | `/api/research`, `/api/research-chat` | מחקר אקדמי וצ'אט על סט מחקרים |
| `POST` | `/api/analytics-chat`, `/api/youtube/fetch`, `/api/tiktok/fetch` | אנליטיקס |
| `POST` | `/api/nutrition/analyze`, `/api/nutrition/chat` | תזונה |
| `POST` | `/api/training/coach`, `/api/training/analyze`, `/api/training/generate` | אימונים |
| `POST/DELETE` | `/api/knowledge/upload`, `/api/knowledge/reload`, `/api/knowledge/:name` | ניהול מאגר הידע |

### Function calling ב-`/api/ask`

המודל לא רק עונה — הוא מקבל הצהרות פונקציה ומחליט בעצמו אם להפעיל כלי לפני שהוא מנסח תשובה.
ארבעת הכלים מוגדרים ב-`ask-tools.js`:

| כלי | מה מחזיר למודל | מקור הנתונים |
|---|---|---|
| `web_search` | עד 5 תוצאות (כותרת, קישור, תקציר) | דפדפן Chrome אמיתי דרך `browser.js` (DuckDuckGo) |
| `youtube_search` | עד 8 סרטונים (כותרת, קישור, ערוץ, צפיות) | YouTube Data API (`YOUTUBE_API_KEY`) |
| `knowledge_search` | עד 4 קטעים מהמאגר האישי | BM25 על `knowledge/` |
| `training_data` | עד 4 קטעי אימון/כושר, עם סינון נושא אופציונלי | צ'אנקים ממקורות `train*`/`fit*` |

הלופ עצמו יושב ב-`callGeminiWithRetry`: עד `ASK_TOOLS_MAX_ROUNDS` סבבי כלים בתקרת
`ASK_TOOLS_BUDGET_MS`, ובסבב האחרון הכלים מוסרים והמודל מחויב לענות מהמידע שכבר נאסף. כלי
שנכשל **לא מפיל את התשובה** — הוא מוחזר למודל כ-`{error}` והמודל מנסח אותו. תשובה שנענתה מנתוני
כלי לא נכנסת ל-cache (הנתונים מתיישנים מיד). סיכום הקריאות מוחזר בשדה `toolsUsed`.

### סטרימינג (SSE)

בקשה עם `stream: true` בגוף, `?stream=1` או `Accept: text/event-stream` מקבלת
`text/event-stream` במקום JSON. האירועים:

| אירוע | data | מתי |
|---|---|---|
| `meta` | `{ historyUsed, knowledgeUsed, knowledgeChunks, knowledgeSources }` | פעם אחת, עם פתיחת הערוץ |
| `tool` | `{ name, label, status: 'running'\|'done'\|'error', args?, summary?, ms? }` | זוג פריימים לכל קריאת כלי — `running` ואז `done`/`error` |
| `delta` | `{ text }` | שברי טקסט מהמודל, לפי הסדר |
| `done` | כל ה-payload של התשובה הרגילה (`reply`, `toolsUsed`, `attempts`, `knowledgeUsed`…) + `streamed: true` | בסוף |
| `error` | `{ reply, partial, status }` | כשל אחרי שהערוץ נפתח; `partial: true` = כבר נשלח טקסט |

בזמן שהמודל חושב נשלחים פריימי הערה `: ping` (`ASK_STREAM_HEARTBEAT_MS`) כדי שפרוקסי לא יסגור
חיבור שנראה תקוע. ולידציה רצה **לפני** פתיחת הערוץ, ולכן קלט רע עדיין מקבל `400` עם JSON.

בצד הלקוח (`public/js/app.js`) כל אירוע `tool` מצייר צ'יפ בבועה — `🔍 מחפש בדפדפן…` בזמן ריצה
ואז `✅ 5 תוצאות בדפדפן` (או `⚠️` בכשל). הצ'יפים הם תצוגה בלבד: הם לא נשמרים בהיסטוריה, לא
מועתקים עם התשובה ולא נכנסים ל-markdown.

המיפוי המלא — כולל מספרי שורות, פרומפטים, מודלים וטמפרטורות — נמצא ב-**[PROJECT_MAP.md](PROJECT_MAP.md)**.

## אבטחה ונקודות לתשומת לב

- `.env` **לעולם** לא נכנס ל-git (מוגן ב-`.gitignore`). אין לשמור מפתחות בקוד.
- `knowledge/*.txt` — קבצי ידע אישיים מוחרגים מ-git; רק `nutrition.txt` ו-`training.txt` נכללים.
- ⚠️ `whatsapp-bot.js` מכיל פרטי Green API מוטבעים בקוד (שורות 9–10) ואינו קורא משתני סביבה
  כלל. השרת לא טוען אותו, אבל הוא נמצא בהיסטוריית git — יש להעביר ל-`.env` ולסובב את הטוקן.
- `TWILIO_*` שמופיעים ב-`.env` **אינם בשימוש**: אין אזכור ל-TWILIO באף קובץ קוד. בטוח להסירם.
- `CSP` מושבת (`contentSecurityPolicy: false`) ב-helmet, ו-CORS פתוח לכל מקור. מתאים לפיתוח;
  יש להדק לפני פריסה ציבורית.
- קבצי גיבוי מקומיים (`server.js.broken`, `*.backup`, `.aider*`) אינם tracked ומכוסים ב-`.gitignore`.

## רישיון

ISC
