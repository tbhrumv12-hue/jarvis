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
| `YOUTUBE_API_KEY` | — | ריק | סטטיסטיקות סרטונים וחיפוש הדגמות וידאו |
| `SEMANTIC_SCHOLAR_KEY` / `CORE_API_KEY` | — | ריק | מכסה גבוהה יותר במקורות המחקר; החיפוש עובד גם בלעדיהם |

`GEMINI_TIMEOUT_MS`, `RATE_LIMIT_MAX`, `RESEARCH_BUDGET_MS`, `BM25_*` ועוד ~40 משתנים נוספים
קיימים עם ברירות מחדל בקובץ ה-`CONFIG` שבראש `server.js` ומתועדים בטבלה ב-`PROJECT_MAP.md` §6.
שימו לב: `.env.example` מכסה רק את השלושה הבסיסיים.

## סקריפטים

| פקודה | מה עושה |
|---|---|
| `npm start` | מריץ את השרת (`node server.js`) |
| `npm run check` | בדיקת תחביר ל-`server.js` בלבד |
| `npm test` | בדיקות smoke מלאות (ר' למטה) |

## בדיקות

```bash
npm test
```

`test/smoke.test.js` מריץ את `node --test` ומבצע:

1. **בדיקת תחביר** לכל קובצי ה-JS (`server.js`, `browser.js`, `gemini-fallback.js`, `whatsapp-bot.js`, `public/sw.js`, `public/js/*.js`).
2. **הרמת שרת אמיתית** על פורט פנוי שנבחר דינמית, והמתנה ל-`/api/health`.
3. אימות מסלולים חיים: `/api/health`, `/api/metrics`, `/api/knowledge`, `/api/mega-prompt`, וכן הדפים `/` ו-`/app`.
4. אימות שמסלולי הולידציה דוחים קלט רע (`/api/ask` → 400/413, `/api/training/analyze` → 400).

**הבדיקות לא צורכות טוקנים:** השרת מופעל עם `GEMINI_API_KEY` דמה. `dotenv` לא דורס
משתני סביבה קיימים, ולכן גם אם יש מפתח אמיתי ב-`.env` — הוא לא ישמש את ריצת הבדיקות.
כל הבדיקות נוגעות רק בקבצים סטטיים, בבריאות מערכת, ובוולידציה שמתרחשת לפני הקריאה למודל.

## מבנה הפרויקט

```
server.js              כל השרת: Express 5, כל ה-endpoints, BM25, קריאות Gemini (~5,050 שורות)
gemini-fallback.js     שרשרת מודלי גיבוי + זיהוי שגיאות "high demand" / "model not found"
browser.js             שליפת תוכן אתרים דרך rebrowser-playwright (מוּרץ כ-child process ע"י /api/ask)
whatsapp-bot.js        בוט Green API עצמאי — לא נטען ע"י השרת
knowledge/             מאגר הידע ל-BM25 (.txt/.md); קבצים אישיים git-ignored
public/                צד הלקוח: HTML, CSS, JS, PWA (manifest.json + sw.js)
test/smoke.test.js     בדיקות ה-smoke
PROJECT_MAP.md         מיפוי מפורט של כל endpoint, פונקציה וממצא תפעולי
```

## מה יש באפליקציה

| דף | קובץ | תיאור |
|---|---|---|
| HUD ראשי | `public/index.html` | צ'אט עם J.A.R.V.I.S, היסטוריה, חיפוש ברשת, ראייה (תמונות) |
| אנליטיקס | `public/analytics.html` | נתוני YouTube/TikTok וצ'אט עליהם |
| מחקר | `public/research.html` | חיפוש ב-11 מקורות אקדמיים + ניתוח עם ציטוטים `[N]` |
| תזונה | `public/nutrition.html` | ניתוח ארוחות, מאקרו, צ'אט תזונתי |
| אימונים | `public/training.html` | תוכניות אימון, מאמן AI, ניתוח התקדמות |
| נחיתה | `public/landing.html` | דף השיווק/כניסה |

### API — תמצית

| Method | Path | תפקיד |
|---|---|---|
| `GET` | `/api/health`, `/api/metrics`, `/api/knowledge`, `/api/mega-prompt` | בריאות, מטריקות, רשימת ידע, פרומפט-על לתיעוד עצמי |
| `POST` | `/api/ask` | הצ'אט הראשי — BM25 על הידע + Gemini (+ חיפוש רשת אם מבקשים) |
| `POST` | `/api/vision` | תמונה → תיאור בעברית |
| `POST` | `/api/research`, `/api/research-chat` | מחקר אקדמי וצ'אט על סט מחקרים |
| `POST` | `/api/analytics-chat`, `/api/youtube/fetch`, `/api/tiktok/fetch` | אנליטיקס |
| `POST` | `/api/nutrition/analyze`, `/api/nutrition/chat` | תזונה |
| `POST` | `/api/training/coach`, `/api/training/analyze`, `/api/training/generate` | אימונים |
| `POST/DELETE` | `/api/knowledge/upload`, `/api/knowledge/reload`, `/api/knowledge/:name` | ניהול מאגר הידע |

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
