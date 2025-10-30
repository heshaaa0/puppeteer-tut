const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: false }); // set headless:false to watch
  const page = await browser.newPage();
  await page.goto("https://quotes.toscrape.com/");

  // web scraping
  const quotes = await page.evaluate(() => {
    const elements = document.querySelectorAll(".quote");
    const data = [];
    elements.forEach((element) => {
      data.push({
        text: element.querySelector(".text")?.innerText,
        author: element.querySelector(".author")?.innerText,
        tags: Array.from(element.querySelectorAll(".tag")).map(
          (tag) => tag.innerText
        ),
      });
    });
    return data;
  });

  console.log("scaraped data:", quotes);

  await browser.close();
})();
