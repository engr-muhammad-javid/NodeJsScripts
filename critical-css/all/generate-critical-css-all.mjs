// generate-critical-css-all.mjs
import { generate } from 'critical';
import fs from 'fs/promises';
import beautify from 'js-beautify';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCssUrlsFromPage } from './get-css-urls.mjs';

const beautifyCss = beautify.css;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetUrl = 'https://miatlantic.co.uk/w8r3c-rfb';
const baseOutputDir = path.join(__dirname, 'critical-output');

async function generateCriticalPerFile(cssUrls, deviceLabel, index) {
  const deviceDir = path.join(baseOutputDir, `${index}-${deviceLabel}`);
  await fs.mkdir(deviceDir, { recursive: true });

  let count = 1;
  for (const cssUrl of cssUrls) {
    const fileName = path.basename(cssUrl).split('?')[0] || `inline-${count}.css`;
    const folderName = `${count}.${fileName.replace(/\.[^/.]+$/, '')}`;
    const fileDir = path.join(deviceDir, folderName);

    try {
      const result = await generate({
        src: targetUrl,
        css: [cssUrl],
        inline: false,
        extract: true,
        dimensions: [
          deviceLabel === 'mobile'
            ? { width: 375, height: 812 }
            : { width: 1280, height: 800 },
        ],
      });

      await fs.mkdir(fileDir, { recursive: true });

      await fs.writeFile(path.join(fileDir, 'critical.css'), beautifyCss(result.css), 'utf8');
      await fs.writeFile(path.join(fileDir, 'non-critical.css'), beautifyCss(result.uncritical), 'utf8');

      console.log(`✅ Output saved: ${deviceLabel}/${folderName}`);
    } catch (err) {
      console.error(`❌ Failed to process ${fileName}`, err.message);
    }

    count++;
  }
}

const cssUrlsDesktop = await getCssUrlsFromPage(targetUrl, 'desktop');
await generateCriticalPerFile(cssUrlsDesktop, 'Desktop', 1);

const cssUrlsMobile = await getCssUrlsFromPage(targetUrl, 'mobile');
await generateCriticalPerFile(cssUrlsMobile, 'Mobile', 2);
