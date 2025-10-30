const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: false }); // set headless:false to watch
  const page = await browser.newPage();
  await page.goto("http://localhost:3000/index.html");

  // wait for the button and click it
  await page.waitForSelector("#cta-button", { timeout: 10000 });
  await page.click("#cta-button");

  // read the page log content to verify
  const text = await page.$eval("#log", (el) => el.innerText);
  console.log("Page log after click:", text);

  await browser.close();
})();
