import { generate } from 'critical';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputDir = path.join(__dirname, 'critical-css');

// List of pages to generate critical CSS for
const pages = [
  { name: 'home', url: 'https://miatlantic.co.uk/' },
  { name: 'category', url: 'https://miatlantic.co.uk/storage-devices' }, // Replace with real category
  { name: 'product', url: 'https://miatlantic.co.uk/0a74421' }, // Replace with real product
];

// Viewports
const viewports = [
  { name: 'desktop', width: 1300, height: 900 },
  { name: 'mobile', width: 430, height: 932 },
];

async function generateCritical(page, viewport) {
  const fileName = `${page.name}_${viewport.name}_critical.css`;
  const filePath = path.join(outputDir, fileName);

  try {
    console.log(`🔄 Generating: ${fileName}`);
    const { css } = await generate({
      inline: false,
      base: outputDir,
      src: page.url,
      width: viewport.width,
      height: viewport.height,
      ignore: ['@font-face', /url\(/],
    });

    await writeFile(filePath, css);
    console.log(`✅ Saved: ${filePath}`);
  } catch (err) {
    console.error(`❌ Failed for ${fileName}:`, err.message);
  }
}

async function run() {
  await mkdir(outputDir, { recursive: true });

  for (const page of pages) {
    for (const viewport of viewports) {
      await generateCritical(page, viewport);
    }
  }
}

run();
