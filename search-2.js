// browser-visit.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');
const path = require('path');

// ---------------- FETCH (native or node-fetch fallback) ----------------
let fetchFunc = globalThis.fetch;
if (!fetchFunc) {
  try {
    const nf = require('node-fetch');
    fetchFunc = nf.default || nf;
  } catch (e) { console.warn('fetch not available'); fetchFunc = null; }
}

let FormDataModule = null;
try { FormDataModule = require('form-data'); } catch (e) { FormDataModule = null; }

// ---------------- CONFIG ----------------
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS, 10) || 5 * 60 * 1000;
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const LOG_DIR = path.join(__dirname, 'logs');
const MAX_SCREENSHOTS = parseInt(process.env.MAX_SCREENSHOTS || '100', 10);

// Keywords & Domains
const KEYWORDS = [
  { keyword: 'makadhillsaklub', domain: 'makadhillsaklub.com' },
  { keyword: 'datajournalism.tools', domain: 'datajournalism.tools' },
  { keyword: 'littlendaba.design', domain: 'littlendaba.design' },
  { keyword: 'weissnat.net', domain: 'weissnat.net' },
  { keyword: 'phongthuynhaxinh.net', domain: 'phongthuynhaxinh.net' },
  { keyword: 'leizelaser.com', domain: 'leizelaser.com' },
];

// Ensure folders
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// ---------------- LOGGING ----------------
function writeLog(message) {
  const logFile = path.join(LOG_DIR, 'browser-visit.log');
  const line = `[${new Date().toISOString()}] ${message}`;
  try { fs.appendFileSync(logFile, line + '\n', 'utf8'); } catch (e) { console.error('Failed to write log:', e); }
}

function maskToken(token) {
  if (!token) return '(empty)';
  if (token.length <= 10) return token.replace(/./g, '*');
  return token.slice(0, 6) + '...' + token.slice(-4);
}

// ---------------- TELEGRAM ----------------
async function sendTelegramMessage(message, screenshotPath = null) {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

  if (!fetchFunc) return writeLog('fetch not available — cannot send Telegram message.');
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    const masked = `BOT=${maskToken(TELEGRAM_BOT_TOKEN)} CHAT=${TELEGRAM_CHAT_ID ? '(set)' : '(empty)'}`;
    writeLog(`Telegram env vars missing — skipping send. ${masked}`);
    return;
  }

  const apiBase = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

  try {
    const textResp = await fetchFunc(`${apiBase}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' }),
    });

    if (!textResp.ok) {
      const body = await safeRead(textResp);
      writeLog(`Telegram sendMessage failed: status=${textResp.status} body=${truncateStr(body, 1000)}`);
    } else { writeLog(`Telegram sendMessage succeeded: status=${textResp.status}`); }

    if (screenshotPath && fs.existsSync(screenshotPath) && FormDataModule) {
      const form = new FormDataModule();
      form.append('chat_id', TELEGRAM_CHAT_ID);
      form.append('photo', fs.createReadStream(screenshotPath));
      const photoResp = await fetchFunc(`${apiBase}/sendPhoto`, { method: 'POST', body: form });
      if (!photoResp.ok) {
        const body = await safeRead(photoResp);
        writeLog(`Telegram sendPhoto failed: status=${photoResp.status} body=${truncateStr(body, 1000)}`);
      } else { writeLog(`Telegram sendPhoto succeeded: status=${photoResp.status}`); }
    }
  } catch (err) { const msg = err && err.message ? err.message : String(err); console.error(msg); writeLog(`Telegram send failed: ${msg}`); }
}

async function safeRead(res) { try { return await res.text(); } catch (e) { return '<unreadable body>'; } }
function truncateStr(s, n) { return !s ? s : s.length > n ? s.slice(0, n) + '... (truncated)' : s; }

// ---------------- UTIL ----------------
function trimOldScreenshots() {
  try {
    const files = fs.readdirSync(SCREENSHOT_DIR)
      .filter(f => /^screenshot-.*\.png$/.test(f))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(SCREENSHOT_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length > MAX_SCREENSHOTS) {
      const toRemove = files.slice(MAX_SCREENSHOTS);
      toRemove.forEach(f => { try { fs.unlinkSync(path.join(SCREENSHOT_DIR, f.name)); } catch {} });
      writeLog(`trimOldScreenshots removed ${toRemove.length} files`);
    }
  } catch (e) { writeLog(`trimOldScreenshots failed: ${e}`); }
}

// ---------------- MAIN ----------------
let isRunning = false;

async function visitKeyword(keywordObj) {
  const { keyword, domain } = keywordObj;
  if (isRunning) return writeLog('Previous run still active — skipping this interval.');
  isRunning = true;
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  let browser;

  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    // Stealth + human-like behavior
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36'
    );

    // Random delay to simulate human
    const randomDelay = ms => new Promise(r => setTimeout(r, ms + Math.random() * 1500));

    // 1️⃣ Google search
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(keyword)}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await randomDelay(2000);

    // Scroll randomly
    await page.evaluate(() => window.scrollBy(0, Math.random() * 400));
    await randomDelay(1000);

    // 2️⃣ Find first result matching domain
    const links = await page.$$eval('a', anchors => anchors.map(a => a.href));
    const targetLink = links.find(link => link.includes(domain));
    if (!targetLink) {
      const msg = `${timestamp} - No matching domain found for keyword: ${keyword}`;
      console.warn(msg);
      writeLog(msg);
      await sendTelegramMessage(msg);
      return;
    }

    // 3️⃣ Open target site
    await page.goto(targetLink, { waitUntil: 'networkidle2', timeout: 30000 });
    await randomDelay(2000);

    // 4️⃣ Click "Login" button
    const loginButton = await page.$x(`//*[contains(text(), 'Login') or contains(text(), 'LOGIN')]`);
    if (loginButton.length > 0) {
      const currentURL = page.url();
      await loginButton[0].click();
      try {
        await page.waitForFunction((oldURL) => window.location.href !== oldURL, { timeout: 10000 }, currentURL);
      } catch { await randomDelay(2000); }
    } else {
      writeLog(`${timestamp} - Login button not found on ${targetLink}`);
    }

    // 5️⃣ Screenshot
    const screenshotPath = path.join(SCREENSHOT_DIR, `screenshot-${keyword}-${timestamp}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const message = `${timestamp} - Keyword "${keyword}" visited and Login clicked on ${targetLink}`;
    console.log(message);
    writeLog(message);
    await sendTelegramMessage(message, screenshotPath);

    trimOldScreenshots();

  } catch (err) {
    const msg = `${timestamp} - Visit failed for ${keyword}: ${err.message || err}`;
    console.error(msg);
    writeLog(msg);
    try { await sendTelegramMessage(msg); } catch {}
  } finally {
    if (browser) try { await browser.close(); } catch {}
    isRunning = false;
  }
}

// ---------------- RUN ----------------
(async () => {
  process.on('unhandledRejection', r => writeLog(`UnhandledRejection: ${r}`));
  process.on('uncaughtException', e => writeLog(`UncaughtException: ${e}`));

  for (const kw of KEYWORDS) await visitKeyword(kw);

  setInterval(async () => {
    for (const kw of KEYWORDS) await visitKeyword(kw);
  }, INTERVAL_MS);
})();
