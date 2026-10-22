/* ═══════════════════════════════════════════════════════════════════
   J.A.R.V.I.S — Browser Automation
   Usage: node browser.js "your search query"
   ═══════════════════════════════════════════════════════════════════ */

const { chromium } = require('rebrowser-playwright');

async function main() {
    const query = process.argv[2] || 'calisthenics Full Planche tutorial';

    console.log(`[Browser] Searching DuckDuckGo Lite for: "${query}"`);
    
    const browser = await chromium.launch({
        headless: false,
        channel: 'chrome',
        args: ['--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext({
        locale: 'en-US',
        viewport: { width: 1920, height: 1080 }
    });

    await context.addInitScript(() => {
        delete Object.getPrototypeOf(navigator).webdriver;
    });

    const page = await context.newPage();

    // Use DuckDuckGo Lite — much simpler and faster
    await page.goto('https://lite.duckduckgo.com/lite/', { waitUntil: 'domcontentloaded' });

    // Fill the search box
    await page.fill('input[name="q"]', query);
    
    // Click the search button (instead of pressing Enter)
    await page.click('input[type="submit"]');

    // Wait for results
    await page.waitForSelector('a.result-link', { timeout: 15000 });

    const results = await page.evaluate(() => {
        const items = document.querySelectorAll('a.result-link');
        return Array.from(items).slice(0, 5).map((el) => {
            return {
                title: el.innerText,
                url: el.href,
                snippet: el.closest('tr')?.nextElementSibling?.innerText || ''
            };
        });
    });

    console.log(`\n[Browser] Top ${results.length} results:\n`);
    results.forEach((r, i) => {
        console.log(`${i + 1}. ${r.title}`);
        console.log(`   ${r.url}`);
        console.log(`   ${r.snippet}\n`);
    });

    await browser.close();
    console.log('[Browser] Done.');
}

main().catch((err) => {
    console.error('[Browser] Error:', err.message);
    process.exit(1);
});