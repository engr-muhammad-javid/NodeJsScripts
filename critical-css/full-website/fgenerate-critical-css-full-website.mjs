import { generate } from 'critical';
import fs from 'fs/promises';
import beautify from 'js-beautify';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCssUrlsFromPage } from '../all/get-css-urls.mjs';

const beautifyCss = beautify.css;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const urls = [
  'https://miatlantic.co.uk/',
  'https://miatlantic.co.uk/storage-devices',
  'https://miatlantic.co.uk/d89kz-lmp',
  'https://miatlantic.co.uk/contact',
  'https://miatlantic.co.uk/about-us',
  'https://miatlantic.co.uk/get-a-quote',
  'https://miatlantic.co.uk/brands',
  'https://miatlantic.co.uk/why-us',
  'https://miatlantic.co.uk/customer/account/login/referer/aHR0cHM6Ly9taWF0bGFudGljLmNvLnVrL3doeS11cw~~/',
  'https://miatlantic.co.uk/customer/account/create/',
  'https://miatlantic.co.uk/site-map',
  'https://miatlantic.co.uk/terms-and-conditions',
  'https://miatlantic.co.uk/checkout/cart',
  'https://miatlantic.co.uk/checkout/#shipping',

  // Add more page URLs here
];

const baseOutputDir = path.join(__dirname, 'output');
const criticalOutput = {
  desktop: [],
  mobile: []
};

const seenCritical = {
  desktop: new Set(),
  mobile: new Set()
};

const seenNonCritical = {
  desktop: {},
  mobile: {}
};

async function generateCriticalCssFromPages(deviceLabel, width, height) {
  const deviceCriticalParts = [];
  const deviceDir = path.join(baseOutputDir, 'non-critical-css', deviceLabel);
  await fs.mkdir(deviceDir, { recursive: true });

  for (let pageIndex = 0; pageIndex < urls.length; pageIndex++) {
    const url = urls[pageIndex];
    console.log(`🔍 Processing ${deviceLabel} - ${url}`);
    const cssUrls = await getCssUrlsFromPage(url, deviceLabel);

    for (const cssUrl of cssUrls) {
      const fileName = path.basename(cssUrl).split('?')[0] || `inline-${pageIndex + 1}.css`;
      const fileKey = fileName.replace(/\.[^/.]+$/, '');

      try {
        const result = await generate({
          src: url,
          css: [cssUrl],
          inline: false,
          extract: true,
          dimensions: [{ width, height }]
        });

        // ----- Critical: Deduplicate + Comment
        const dedupedCritical = result.css.split('}').filter(line => {
          const trimmed = line.trim();
          if (!trimmed || seenCritical[deviceLabel].has(trimmed)) return false;
          seenCritical[deviceLabel].add(trimmed);
          return true;
        }).map(line => line + '}').join('\n');

        if (dedupedCritical.trim()) {
          deviceCriticalParts.push(
            `/* From ${fileName} on ${url} */\n${beautifyCss(dedupedCritical)}\n`
          );
        }

        // ----- Non-Critical: Deduplicate per file
        if (!seenNonCritical[deviceLabel][fileName]) seenNonCritical[deviceLabel][fileName] = new Set();

        const dedupedNonCritical = result.uncritical.split('}').filter(line => {
          const trimmed = line.trim();
          if (!trimmed || seenNonCritical[deviceLabel][fileName].has(trimmed)) return false;
          seenNonCritical[deviceLabel][fileName].add(trimmed);
          return true;
        }).map(line => line + '}').join('\n');

        if (dedupedNonCritical.trim()) {
          const filePath = path.join(deviceDir, fileName);
          await fs.appendFile(filePath, `/* From ${url} */\n${beautifyCss(dedupedNonCritical)}\n`, 'utf8');
        }

        console.log(`✅ Done: ${deviceLabel} - ${fileName}`);
      } catch (err) {
        console.error(`❌ Failed: ${fileName} on ${url} (${deviceLabel})`, err.message);
      }
    }
  }

  // Save final merged Critical CSS
  const finalCriticalPath = path.join(baseOutputDir, `critical-${deviceLabel}.css`);
  await fs.writeFile(finalCriticalPath, deviceCriticalParts.join('\n'), 'utf8');
  console.log(`🎉 Saved: ${finalCriticalPath}`);
}

// Run for both desktop and mobile
await generateCriticalCssFromPages('desktop', 1280, 800);
await generateCriticalCssFromPages('mobile', 375, 812);
