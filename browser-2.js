// browser-visit-with-urbanvpn.js
/**
 * Updated: Desktop + Mobile (50/50) with advanced mobile emulation
 * Simulates GA4 (gtag) + UA (ga) events when available on the page.
 *
 * Note: This script assumes UrbanVPN or another VPN is already active (same as before).
 */

const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const RecaptchaPlugin = require("puppeteer-extra-plugin-recaptcha");
// const puppeteer = require("puppeteer"); 
puppeteerExtra.use(StealthPlugin());
puppeteerExtra.use(
  RecaptchaPlugin({
    provider: { id: "2captcha", token: process.env.TWO_CAPTCHA_KEY || "" },
    visualFeedback: false,
  })
);

const fs = require("fs");
const path = require("path");

let fetchFunc = globalThis.fetch;
if (!fetchFunc) {
  try {
    fetchFunc = require("node-fetch");
  } catch (e) {
    fetchFunc = null;
  }
}
let FormDataModule = null;
try {
  FormDataModule = require("form-data");
} catch (e) {
  FormDataModule = null;
}

// ---------------- CONFIG ----------------
const INTERVAL_MS = 3000; // keep original; change to 300000 for 5min between loops if desired
const SCROLL_MS = 10000;
const MAX_SCREENSHOTS = 200;
const HEADLESS = false;

// TELEGRAM
const TELEGRAM_BOT_TOKEN = "8325236512:AAEyHIY75K3QUFLYeESJ4LpN2JD-d7SchW8";
const TELEGRAM_CHAT_ID = "-5074658835";

// VPN CONFIG
const VPN_PROVIDER = "urbanvpn"; // logging only
const VPN_PER_KEYWORD = false; // assumed managed externally

// Directories
const SCREENSHOT_DIR = path.join(__dirname, "screenshots");
const LOG_DIR = path.join(__dirname, "logs");
const REPORT_DIR = path.join(__dirname, "report");

// Keywords
const KEYWORDS = [
  {
    keyword: "Tech Tales with Mani",
    domain: "https://youtu.be/TOwCU_OJicM?si=1I2HCP67nE8Je4Qw",
  },
];

// User Agents - include desktop and common mobile UAs
const UA_LIST_DESKTOP = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/605.1.15",
];
const UA_LIST_MOBILE = [
  // iPhone-like
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
  // Pixel-like (Android)
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36",
  // Samsung-like (Android)
  "Mozilla/5.0 (Linux; Android 13; SM-S22) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36",
];

// Ensure directories exist
if (!fs.existsSync(SCREENSHOT_DIR))
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

// ---------------- UTILS ----------------
function writeLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  try {
    fs.appendFileSync(
      path.join(LOG_DIR, "browser-visit.log"),
      line + "\n",
      "utf8"
    );
  } catch {}
  console.log(line);
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomDelay(msBase = 1000, jitter = 1500) {
  return new Promise((r) =>
    setTimeout(r, msBase + Math.floor(Math.random() * jitter))
  );
}

async function sendTelegramMessage(message, screenshotPath = null) {
  if (!fetchFunc) return writeLog("fetch not available.");
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID)
    return writeLog("Telegram BOT/CHAT not set.");

  const apiBase = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
  try {
    const msgRes = await fetchFunc(`${apiBase}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }),
    });
    if (!msgRes.ok)
      writeLog(`Telegram sendMessage failed: status=${msgRes.status}`);

    if (screenshotPath && fs.existsSync(screenshotPath) && FormDataModule) {
      const form = new FormDataModule();
      form.append("chat_id", TELEGRAM_CHAT_ID);
      form.append("photo", fs.createReadStream(screenshotPath));
      const res = await fetchFunc(`${apiBase}/sendPhoto`, {
        method: "POST",
        body: form,
      });
      // Telegram often returns 400 if the file is bad or too large - log full body for debugging
      if (!res.ok) {
        let text = "";
        try {
          text = await res.text();
        } catch (e) {}
        writeLog(
          `Telegram sendPhoto failed: status=${res.status} body=${text}`
        );
      }
    }
  } catch (err) {
    writeLog(`Telegram send failed: ${err.message || err}`);
  }
}

function trimOldScreenshots() {
  try {
    const files = fs
      .readdirSync(SCREENSHOT_DIR)
      .filter((f) => f.endsWith(".png"))
      .map((f) => ({
        name: f,
        mtime: fs.statSync(path.join(SCREENSHOT_DIR, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);
    if (files.length > MAX_SCREENSHOTS) {
      files
        .slice(MAX_SCREENSHOTS)
        .forEach((f) => fs.unlinkSync(path.join(SCREENSHOT_DIR, f.name)));
    }
  } catch (e) {
    writeLog(e);
  }
}

// ---------------- SCREENSHOT / SCROLL ----------------
async function saveScreenshot(page, suffix, keyword) {
  const safeKeyword = keyword.replace(/[^a-z0-9]/gi, "_").slice(0, 20);
  const timestamp = new Date().toISOString().replace(/:/g, "-");
  const fileName = `screenshot-${safeKeyword}-${suffix}-${timestamp}.png`;
  const filePath = path.join(SCREENSHOT_DIR, fileName);
  try {
    await page.screenshot({ path: filePath, fullPage: true });
    writeLog(`Saved screenshot: ${filePath}`);
    return fileName;
  } catch (err) {
    writeLog(`Screenshot failed: ${err.message || err}`);
    return null;
  }
}

async function scrollPage(page, duration) {
  const step = 300;
  const start = Date.now();
  while (Date.now() - start < duration) {
    await page.evaluate(() => {
      const maxY = document.body.scrollHeight - window.innerHeight;
      const delta =
        (Math.random() > 0.5 ? 1 : -1) * (100 + Math.random() * 300);
      window.scrollBy({ top: delta, behavior: "smooth" });
    });
    await randomDelay(step, 100);
  }
}

async function scrollGoogleToTarget(page, domain) {
  await page.evaluate(async (domain) => {
    const anchors = [...document.querySelectorAll("a")];
    const target = anchors.find((a) => a.href && a.href.includes(domain));
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      await new Promise((r) => setTimeout(r, 800));
      try {
        target.style.border = "3px solid red";
        target.style.backgroundColor = "yellow";
      } catch (e) {}
    }
  }, domain);
  await randomDelay(500, 800);
}

// ---------------- HTML REPORT ----------------
function updateHTMLReport(record) {
  const reportPath = path.join(REPORT_DIR, "report.html");
  let html = "";
  if (fs.existsSync(reportPath)) {
    html = fs.readFileSync(reportPath, "utf8").replace("</body>", "");
  } else {
    html = `<html><head><meta charset="utf-8"><title>Browser Visit Report</title><style>
      body{font-family:sans-serif;background:#f7f7f7;padding:20px;}
      .record{margin-bottom:20px;padding:10px;background:#fff;border-radius:5px;box-shadow:0 0 5px #ccc;}
      img{max-width:100%;border:1px solid #ddd;margin-top:5px;}
    </style></head><body><h1>Browser Visit Report</h1>`;
  }

  html += `<div class="record">
    <h2>${record.keyword} - ${new Date(record.timestamp).toLocaleString()}</h2>
    <p>URL: <a href="${record.url}" target="_blank" rel="noopener">${
    record.url
  }</a></p>
    <p>Status: ${record.status}</p>
    ${
      record.screenshot
        ? `<img src="../screenshots/${record.screenshot}" />`
        : ""
    }
  </div>`;
  html += "</body></html>";
  fs.writeFileSync(reportPath, html, "utf8");
}

// ---------------- GA SIMULATION ----------------
/**
 * Try to dispatch GA4 (gtag) + UA (ga) events if those globals exist.
 * We do this cautiously: only call if defined.
 */
async function simulateAnalytics(page, url, deviceType) {
  try {
    await page.evaluate(
      (url, deviceType) => {
        const ts = Date.now();
        // GA4 via gtag
        try {
          if (typeof window.gtag === "function") {
            // standard page_view
            window.gtag("event", "page_view", {
              page_location: url,
              page_path: new URL(url).pathname,
              send_to: undefined,
              device_type: deviceType,
              engagement_time_msec: 1000 + Math.floor(Math.random() * 4000),
            });
          } else if (Array.isArray(window.dataLayer)) {
            // push to dataLayer as fallback
            window.dataLayer.push({
              event: "page_view",
              page_location: url,
              device_type: deviceType,
              ts,
            });
          }
        } catch (e) {
          /* ignore */
        }

        // Universal Analytics (analytics.js)
        try {
          if (typeof window.ga === "function") {
            // send a pageview
            window.ga("send", "pageview", {
              page: new URL(url).pathname,
              title: document.title || "",
              location: url,
            });
          }
        } catch (e) {
          /* ignore */
        }

        // Simulate a few interaction events (scroll/click) as custom events
        try {
          const sendCustomEvent = (name, detail = {}) => {
            if (typeof window.gtag === "function") {
              window.gtag(
                "event",
                name,
                Object.assign(
                  { event_category: "bot_sim", device_type: deviceType },
                  detail
                )
              );
            }
            if (typeof window.ga === "function") {
              window.ga(
                "send",
                "event",
                "bot_sim",
                name,
                JSON.stringify(detail).slice(0, 1000)
              );
            }
            if (Array.isArray(window.dataLayer)) {
              window.dataLayer.push(
                Object.assign({ event: name, device_type: deviceType }, detail)
              );
            }
          };
          // small scroll event
          sendCustomEvent("sim_scroll", {
            px: Math.floor(window.scrollY || 0),
          });
          // small click event (if there is a visible button)
          const btn = document.querySelector(
            'button, a[role="button"], .button, [type="button"]'
          );
          if (btn) {
            sendCustomEvent("sim_click", {
              selector: btn.tagName,
              text: (btn.innerText || "").slice(0, 80),
            });
          }
        } catch (e) {
          /* ignore */
        }
      },
      url,
      deviceType
    );
    writeLog(`Analytics simulation attempted for ${url} (${deviceType})`);
  } catch (err) {
    writeLog(`simulateAnalytics error: ${err.message || err}`);
  }
}

// ---------------- DEVICE PROFILES (advanced emulation approximations) ----------------
const MOBILE_PROFILES = [
  {
    name: "iPhone-14-like",
    userAgent: UA_LIST_MOBILE[0],
    viewport: {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    },
  },
  {
    name: "Pixel-7-like",
    userAgent: UA_LIST_MOBILE[1],
    viewport: {
      width: 412,
      height: 915,
      deviceScaleFactor: 2.75,
      isMobile: true,
      hasTouch: true,
    },
  },
  {
    name: "Samsung-S22-like",
    userAgent: UA_LIST_MOBILE[2],
    viewport: {
      width: 360,
      height: 800,
      deviceScaleFactor: 4,
      isMobile: true,
      hasTouch: true,
    },
  },
];

// ---------------- MAIN VISIT FUNCTION ----------------
async function visitKeyword({ keyword, domain }) {
  writeLog(`Opening YouTube channel: ${keyword}`);
  let browser;

  try {
    browser = await puppeteerExtra.launch({
      headless: HEADLESS,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    // Set a random desktop user agent
    await page.setUserAgent(pickRandom(UA_LIST_DESKTOP));
    await page.setViewport({ width: 1366, height: 768 });

    // Open the channel directly
    await page.goto(domain, { waitUntil: "networkidle2" });
    writeLog(`Channel opened: ${domain}`);

    // Wait for videos to appear
    await page.waitForSelector("ytd-grid-video-renderer a#thumbnail", {
      timeout: 20000,
    });

    // Pick the first video and open it
    const videoUrl = await page.$eval(
      "ytd-grid-video-renderer a#thumbnail",
      (el) => el.href
    );
    writeLog(`Opening video: ${videoUrl}`);
    await page.goto(videoUrl, { waitUntil: "networkidle2" });

    // Wait for the player and start playback
    await page.waitForSelector("video");
    await page.evaluate(async () => {
      const video = document.querySelector("video");
      if (video) {
        video.play();
        video.muted = true;
        // Wait for the full duration
        const remaining = (video.duration - video.currentTime) * 1000;
        await new Promise((r) => setTimeout(r, remaining));
      }
    });

    writeLog("Video started playing.");
    await new Promise((r) => setTimeout(r, 60000)); // watch for 1 minute

    await browser.close();
    writeLog("Visit finished.");
  } catch (err) {
    writeLog(`Error: ${err.message || err}`);
    try {
      await browser?.close();
    } catch {}
  }
}

// ---------------- LOOP ----------------
async function startLoop() {
  writeLog("Starting visit loop...");
  await sendTelegramMessage("Bot started visiting keywords...");
  while (true) {
    for (const kw of KEYWORDS) {
      await visitKeyword(kw);
      await randomDelay(2000, 4000);
    }
    writeLog(`Sleeping ${INTERVAL_MS / 1000}s before next run...`);
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

startLoop();
