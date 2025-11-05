const puppeteer = require('puppeteer');
const { KnownDevices } = require('puppeteer'); // <-- import devices here

const iPhone = KnownDevices['iPhone 6'];

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  await page.emulate(iPhone);
  await page.goto('https://github.com/heshaaa0', { waitUntil: 'networkidle2' });

  console.log('Emulated iPhone 6 successfully');
//   await browser.close();
})();
                                               

