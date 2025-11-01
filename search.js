const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Set a realistic User-Agent
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });

  // Accept cookies if popup appears
  try {
    await page.click('button:has-text("Accept all")', { timeout: 2000 });
  } catch (e) {}

  // Type query with human-like delay
  await page.type('textarea[name="q"]', 'best coffee shops in Colombo', { delay: 150 });
  await page.keyboard.press('Enter');

  // Move mouse & wait randomly
  await page.mouse.move(100, 200); 
  await sleep(1000 + Math.random() * 1000);

  // Scroll a bit
  await page.evaluate(() => window.scrollBy(0, window.innerHeight));
  await sleep(1000 + Math.random() * 1000);

  // Wait for results
  await page.waitForSelector('h3');
  const results = await page.evaluate(() =>
    Array.from(document.querySelectorAll('h3')).map(el => el.innerText)
  );

  console.log(results);
  // await browser.close();
})();
