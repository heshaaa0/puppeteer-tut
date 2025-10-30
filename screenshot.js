const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: false }); // set headless:false to watch
  const page = await browser.newPage();
  await page.goto("https://www.youtube.com/");

  //screenshot
  await page.screenshot({ path: "screenshot.png", fullPage: true });

  await browser.close();
  console.log("✅ Screenshot saved as screenshot.png");
})();
