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
const baseOutputDir = path.join(__dirname, 'single-critical-output');

async function generateCriticalPerFile(cssUrls, deviceLabel, index, isMobileCombined = false) {
  const deviceDir = path.join(baseOutputDir, `${index}-${deviceLabel}`);
  await fs.mkdir(deviceDir, { recursive: true });

  let combinedMobileCriticalCss = '';
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

      // Save non-critical per file (same for desktop and mobile)
      await fs.writeFile(
        path.join(fileDir, 'non-critical.css'),
        beautifyCss(result.uncritical),
        'utf8'
      );

      // Save critical per file for Desktop
      if (!isMobileCombined) {
        await fs.writeFile(
          path.join(fileDir, 'critical.css'),
          beautifyCss(result.css),
          'utf8'
        );
      } else {
        // For mobile, collect all into one file
        combinedMobileCriticalCss += `/* ===== From: ${fileName} ===== */\n`;
        combinedMobileCriticalCss += beautifyCss(result.css) + '\n\n';
      }

      console.log(`✅ Output saved: ${deviceLabel}/${folderName}`);
    } catch (err) {
      console.error(`❌ Failed to process ${fileName}`, err.message);
    }

    count++;
  }

  // Save the combined mobile critical CSS
  if (isMobileCombined) {
    const combinedPath = path.join(deviceDir, 'all-critical.css');
    await fs.writeFile(combinedPath, combinedMobileCriticalCss.trim(), 'utf8');
    console.log(`📦 Combined critical CSS saved: ${combinedPath}`);
  }
}

// --- Run Process ---

// Desktop: regular
const cssUrlsDesktop = await getCssUrlsFromPage(targetUrl, 'desktop');
// await generateCriticalPerFile(cssUrlsDesktop, 'Desktop', 1);

await generateCriticalPerFile(cssUrlsDesktop, 'Desktop', 1, true);

// Mobile: combined critical
const cssUrlsMobile = await getCssUrlsFromPage(targetUrl, 'mobile');
await generateCriticalPerFile(cssUrlsMobile, 'Mobile', 2, true);
