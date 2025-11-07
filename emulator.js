// mobile-recaptcha-solver.js
// Usage: node mobile-recaptcha-solver.js <targetUrl>
// Requires env var TWO_CAPTCHA_KEY

const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha');
const { KnownDevices } = require('puppeteer'); // device presets

puppeteerExtra.use(StealthPlugin());
puppeteerExtra.use(
  RecaptchaPlugin({
    provider: { id: '2captcha', token: process.env.TWO_CAPTCHA_KEY || '' },
    visualFeedback: false, // set true to show debug boxes
  })
);

const iPhone = KnownDevices['iPhone 12']; // change to preferred mobile device

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

(async () => {
  if (!process.env.TWO_CAPTCHA_KEY) {
    console.error('TWO_CAPTCHA_KEY not set. Export it before running.');
    process.exit(1);
  }

  const targetUrl = process.argv[2] || 'https://www.google.com/recaptcha/api2/demo';

  const browser = await puppeteerExtra.launch({
    headless: false, // set true to run headless (less reliable for debugging)
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  try {
    const page = await browser.newPage();

    // Emulate a mobile device (this sets viewport, userAgent, touch)
    await page.emulate(iPhone);
    console.log(`📱 Emulating ${iPhone.name}`);

    // Optional: override UA if provided (but emulation already sets UA)
    if (process.env.USER_AGENT) {
      await page.setUserAgent(process.env.USER_AGENT);
    }

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('➡️ Page loaded:', page.url());

    // small human-like pause and scroll so captchas load
    await sleep(1200);
    await page.evaluate(() => window.scrollBy(0, 150));

    // Attempt to detect reCAPTCHA frames (heuristic)
    const recaptchaFrame = page
      .frames()
      .find((f) => /recaptcha\/api2\/anchor|google.com\/recaptcha|api2\/frame/.test(f.url()));
    if (!recaptchaFrame) {
      console.log('ℹ️ No reCAPTCHA iframe detected on the page (by simple heuristic).');
    } else {
      console.log('🔎 reCAPTCHA iframe detected, attempting automatic solve via 2Captcha...');
    }

    // Solve visible captchas on the page using plugin helper.
    // This will find sitekeys and send them to 2Captcha, wait for token and inject it.
    const solveResults = await page.solveRecaptchas();
    console.log('🧾 solveRecaptchas results:', JSON.stringify(solveResults, null, 2));

    // After injection the page sometimes submits or triggers JS; wait up to some seconds for navigation or DOM change
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      console.log('➡️ Navigation occurred after solve. New URL:', page.url());
    } catch (e) {
      console.log('ℹ️ No navigation after solve (this can be normal).');
    }

    // Optional: if you need to programmatically submit a form, do so here.
    // Example: await page.click('button[type="submit"]');

    // Give the page a little time to react to token injection
    await sleep(3000);

    // Save screenshot for verification
    const out = `recaptcha-solve-${Date.now()}.png`;
    await page.screenshot({ path: out, fullPage: true });
    console.log('📷 Screenshot saved to', out);

    // Log summary of solves (if any)
    if (!solveResults || solveResults.length === 0) {
      console.log('⚠️ No captcha solved. Either none present or solving failed.');
    } else {
      for (const r of solveResults) {
        console.log(`- ${r.provider} solved: ${r.text || JSON.stringify(r)}`);
      }
    }
  } catch (err) {
    console.error('❌ Error during run:', err && err.message ? err.message : err);
  } finally {
    await browser.close();
  }
})();
