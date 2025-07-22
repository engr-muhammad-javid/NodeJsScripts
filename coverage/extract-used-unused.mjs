import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function analyze(url, device, label) {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    if (device === 'mobile') {
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 13_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Mobile/15E148 Safari/604.1');
        await page.setViewport({ width: 375, height: 812, isMobile: true });
    } else {
        await page.setViewport({ width: 1280, height: 800 });
    }

    await Promise.all([page.coverage.startCSSCoverage()]);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 0 });
    const cssCoverage = await page.coverage.stopCSSCoverage();

    const usedDir = path.join(__dirname, 'output', label, 'used');
    const unusedDir = path.join(__dirname, 'output', label, 'unused');
    await fs.mkdir(usedDir, { recursive: true });
    await fs.mkdir(unusedDir, { recursive: true });

    for (const entry of cssCoverage) {
        const fileName = path.basename(entry.url).split('?')[0] || 'inline.css';

        const usedRules = [];
        const usedRanges = entry.ranges;

        for (const range of usedRanges) {
            usedRules.push(entry.text.slice(range.start, range.end));
        }

        const usedCSS = usedRules.join('\n');

        // Generate unused by removing used ranges
        let unusedCSS = entry.text;
        usedRanges.sort((a, b) => b.start - a.start); // reverse sort
        for (const range of usedRanges) {
            unusedCSS = unusedCSS.slice(0, range.start) + unusedCSS.slice(range.end);
        }

        await fs.writeFile(path.join(usedDir, fileName), usedCSS, 'utf8');
        await fs.writeFile(path.join(unusedDir, fileName), unusedCSS, 'utf8');
    }

    await browser.close();
    console.log(`✅ CSS coverage extracted for ${label}`);
}

// Replace with your actual website
const TARGET_URL = 'https://miatlantic.co.uk/storage-devices';

// Run for both desktop and mobile
await analyze(TARGET_URL, 'desktop', 'desktop');
await analyze(TARGET_URL, 'mobile', 'mobile');
