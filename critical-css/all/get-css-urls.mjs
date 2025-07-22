// get-css-urls.mjs
import puppeteer from 'puppeteer';

export async function getCssUrlsFromPage(url, device = 'desktop') {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  if (device === 'mobile') {
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 13_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Mobile/15E148 Safari/604.1');
    await page.setViewport({ width: 375, height: 812, isMobile: true });
  } else {
    await page.setViewport({ width: 1280, height: 800 });
  }

  await page.goto(url, { waitUntil: 'networkidle0' });

  const cssUrls = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map(link => link.href)
      .filter(href => href.endsWith('.css'));
  });

  await browser.close();
  return cssUrls;
}
