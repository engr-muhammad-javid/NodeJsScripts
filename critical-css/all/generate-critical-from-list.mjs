// generate-critical-from-list.mjs
import { generate } from 'critical';
import fs from 'fs/promises';
import beautify from 'js-beautify';
import path from 'path';
import { fileURLToPath } from 'url';

const beautifyCss = beautify.css;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const targetUrl = 'https://miatlantic.co.uk/w8r3c-rfb'; // Replace with your test page
const outputDir = path.join(__dirname, 'list-output');

// Manually provided CSS URLs (you can add more or load from a config file if preferred)
const cssUrlsDesktop = [
  'https://miatlantic.co.uk/static/version1753103996/frontend/Sm/market_2/en_US/css/styles-m.css',
  'https://miatlantic.co.uk/static/version1753103996/frontend/Sm/market_2/en_US/css/styles-l.css'
];

const cssUrlsMobile = [
  'https://miatlantic.co.uk/static/version1753103996/frontend/Sm/smtheme_mobile/en_US/css/product-style-m.css',
  'https://miatlantic.co.uk/static/version1753103996/frontend/Sm/smtheme_mobile/en_US/css/product-pagetheme.css',
  'https://miatlantic.co.uk/static/version1753103996/frontend/Sm/smtheme_mobile/en_US/css/product-bootstrap.css',
  'https://miatlantic.co.uk/media/sm/configed_css/settings_default.css',
  'https://miatlantic.co.uk/static/version1753185782/frontend/Sm/smtheme_mobile/en_US/css/custom_style_co_uk_mobile.css',
  'https://miatlantic.co.uk/static/version1753185782/frontend/Sm/smtheme_mobile/en_US/css/header-mobile.css',
  
];

async function generateCritical(cssUrls, deviceLabel) {
  const deviceOutputDir = path.join(outputDir, deviceLabel);

  await fs.mkdir(deviceOutputDir, { recursive: true });

  for (let i = 0; i < cssUrls.length; i++) {
    const cssUrl = cssUrls[i];
    const fileName = path.basename(cssUrl).split('?')[0] || `style-${i}.css`;
    const folderName = `${fileName.replace(/\.css$/, '')}`;
    const fileOutputDir = path.join(deviceOutputDir, folderName);
    await fs.mkdir(fileOutputDir, { recursive: true });

    try {
      const result = await generate({
        src: targetUrl,
        css: [cssUrl],
        inline: false,
        extract: true,
        dimensions: [
          deviceLabel === 'Mobile'
            ? { width: 375, height: 812 }
            : { width: 1280, height: 800 },
        ],
      });

      await fs.writeFile(
        path.join(fileOutputDir, 'critical.css'),
        beautifyCss(result.css),
        'utf8'
      );
      await fs.writeFile(
        path.join(fileOutputDir, 'non-critical.css'),
        beautifyCss(result.uncritical),
        'utf8'
      );

      console.log(`✅ ${deviceLabel}: ${fileName} processed`);
    } catch (err) {
      console.error(`❌ ${deviceLabel}: ${fileName} failed -`, err.message);
    }
  }
}

await generateCritical(cssUrlsDesktop, 'Desktop');
await generateCritical(cssUrlsMobile, 'Mobile');
