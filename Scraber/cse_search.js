import fetch from "node-fetch";
import fs from "fs";
import csv from "csv-parser";
import { parse } from "json2csv";
import stripBomStream from "strip-bom-stream";

const API_KEY = "AIzaSyBoPip85EqB_HnyfSoYSaRp1cHGkn_rUgE";
const CSE_ID = "063f46361ce0643c0";
const inputFile = "input.csv";
const outputFile = "output.csv";

// Google Search API
async function googleSearch(query) {
    const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${API_KEY}&cx=${CSE_ID}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.items && data.items.length > 0) {
        // Try to find a result mentioning specifications/specs/details
        const specResult = data.items.find(item =>
            /specs?|specifications?|details/i.test(item.title + item.snippet + item.link)
        );
        return specResult ? specResult.link : data.items[0].link;
    }
    return null;
}

// Read CSV and remove BOM
function readCSV(filePath) {
    return new Promise((resolve, reject) => {
        let data = [];
        fs.createReadStream(filePath)
            .pipe(stripBomStream()) // Remove BOM
            .pipe(csv())
            .on("data", row => {
                console.log("📄 Row read:", row);
                if (row.sku) {
                    data.push({
                        sku: row.sku.trim()
                    });
                } else {
                    console.warn("⚠️ Skipping invalid row:", row);
                }
            })
            .on("end", () => {
                console.log(`✅ Total valid rows: ${data.length}`);
                resolve(data);
            })
            .on("error", err => reject(err));
    });
}

// Main
async function main() {
    let results = [];
    const rows = await readCSV(inputFile);

    if (rows.length === 0) {
        console.error("❌ No valid rows found in input CSV.");
        return;
    }

    for (let row of rows) {
        const query = row.sku; // Only SKU now
        console.log(`🔍 Searching for: ${query}`);

        const link = await googleSearch(query);
        results.push({
            sku: row.sku,
            specification: link || "Not found"
        });
    }

    const csvOutput = parse(results, { fields: ["sku", "specification"] });
    fs.writeFileSync(outputFile, csvOutput);
    console.log(`✅ Saved output to ${outputFile}`);
}

main();
