const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: false }); // set true to hide browser
  const page = await browser.newPage();

  await page.goto('https://www.google.com');

  // Accept cookies if the popup appears (Google sometimes shows one)
  try {
    await page.click('button:has-text("Accept all")', { timeout: 2000 });
  } catch (e) {}

  // search query and press Enter
  await page.type('textarea[name="q"]', 'best coffee shops in Colombo');
  await page.keyboard.press('Enter');

  // results to load
  await page.waitForSelector('h3');

  // Get the result titles and links
  const results = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('h3')).map(el => el.innerText);
  });

  console.log(results);

//   await browser.close();
})();
