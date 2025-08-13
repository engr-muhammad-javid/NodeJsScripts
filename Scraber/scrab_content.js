// scrab_content.js
import fs from 'fs';
import csv from 'csv-parser';
import { parse } from 'json2csv';
import puppeteer from 'puppeteer';

const inputFile = 'input.csv';
const outputFile = 'output.csv';

let results = [];

async function scrapeSpecs(sku, brand) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    try {
        console.log(`Processing ${sku} (${brand})...`);

        const query = `${sku} ${brand} site:${brand}.com`;
        await page.goto(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded' });

        // Get first organic search result link
        const firstLink = await page.$eval('li.b_algo h2 a', el => el.href);

        if (!firstLink) {
            console.warn(`⚠️ No result found for ${sku}`);
            return null;
        }

        console.log(`🔗 Found page for ${sku}: ${firstLink}`);

        await page.goto(firstLink, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const htmlContent = await page.evaluate(() => document.body.innerHTML);

        return htmlContent.replace(/\s+/g, ' ').trim();
    } catch (err) {
        console.error(`❌ Error scraping ${sku}: ${err.message}`);
        return null;
    } finally {
        await browser.close();
    }
}

function readCSV(filePath) {
    return new Promise((resolve, reject) => {
        let data = [];
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', row => {
                // Normalize and trim both SKU and Brand
                const sku = (row.sku || row.SKU || '').trim();
                const brand = (row.brand || row.Brand || '').trim();

                if (sku.length > 0 && brand.length > 0) {
                    data.push({ sku, brand });
                } else {
                    console.warn(`⚠️ Skipping invalid row: ${JSON.stringify(row)}`);
                }
            })
            .on('end', () => resolve(data))
            .on('error', err => reject(err));
    });
}


async function main() {
    const rows = await readCSV(inputFile);

    if (!rows.length) {
        console.error('❌ No valid rows found in input CSV.');
        return;
    }

    for (let row of rows) {
        const specs = await scrapeSpecs(row.sku, row.brand);
        results.push({
            sku: row.sku,
            specification: specs || 'Not found'
        });
    }

    const csvOutput = parse(results);
    fs.writeFileSync(outputFile, csvOutput);
    console.log(`✅ Saved output to ${outputFile}`);
}

main();
