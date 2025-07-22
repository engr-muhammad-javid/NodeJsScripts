import puppeteer from 'puppeteer';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postcss from 'postcss';
import safeParser from 'postcss-safe-parser';

// Get __dirname equivalent in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function extractUsedCSS(url, cssFilename, outputFile) {
  let browser;
  try {
    // Step 1: Launch Puppeteer
    console.log('Launching Puppeteer...');
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // Define viewports to capture media queries
    const viewports = [
      { width: 375, height: 812, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.2 Mobile/15E148 Safari/604.1' },
      { width: 1280, height: 800, isMobile: false, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
    ];

    // Step 2: Check for CSS file in page
    console.log('Checking for CSS file in page...');
    await page.setViewport(viewports[0]); // Set mobile viewport for initial check
    await page.setUserAgent(viewports[0].userAgent);
    try {
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    } catch (error) {
      console.error(`Failed to load page ${url}:`, error);
      throw error;
    }
    const cssLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
      return links.map(link => link.href);
    });
    console.log('Found CSS files:', cssLinks);
    if (!cssLinks.some(link => link.includes(cssFilename))) {
      console.warn(`CSS file ${cssFilename} not found in page. Available CSS files:`, cssLinks);
    }

    // Step 3: Collect used CSS across viewports
    let usedCSS = '';
    for (const viewport of viewports) {
      console.log(`Testing viewport: ${viewport.width}x${viewport.height} (isMobile: ${viewport.isMobile})`);
      await page.setViewport(viewport);
      await page.setUserAgent(viewport.userAgent);

      // Start CSS coverage
      console.log('Starting CSS coverage...');
      await page.coverage.startCSSCoverage();

      // Load page and ensure dynamic content
      console.log(`Loading page: ${url}`);
      try {
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      } catch (error) {
        console.error(`Failed to load page ${url} in viewport ${viewport.width}x${viewport.height}:`, error);
        throw error;
      }
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(resolve => setTimeout(resolve, 10000)); // Increased delay for dynamic content

      // Stop CSS coverage
      console.log('Collecting CSS coverage data...');
      const cssCoverage = await page.coverage.stopCSSCoverage();
      console.log('CSS coverage entries:', cssCoverage.map(entry => entry.url));

      // Merge ranges for the target CSS file
      for (const entry of cssCoverage) {
        if (entry.url.includes(cssFilename)) {
          console.log(`Found coverage for ${cssFilename}, processing ranges...`);
          const sortedRanges = entry.ranges.sort((a, b) => a.start - b.start);
          let mergedCSS = '';
          for (const range of sortedRanges) {
            const snippet = entry.text.slice(range.start, range.end);
            console.log(`Range [${range.start}-${range.end}]:`, snippet);
            mergedCSS += snippet + '\n';
          }
          usedCSS += mergedCSS;
        }
      }
    }

    if (!usedCSS) {
      console.warn(`No used CSS found for ${cssFilename}`);
      await fs.writeFile(outputFile, '', 'utf8');
      console.log(`✅ Saved empty file: ${outputFile}`);
      return;
    }

    // Step 4: Log raw used CSS for debugging
    console.log('Raw used CSS:', usedCSS);

    // Step 5: Parse and format CSS using PostCSS
    console.log('Parsing and formatting used CSS...');
    let result;
    try {
      result = await postcss([]).process(usedCSS, { parser: safeParser, from: undefined });
    } catch (parseError) {
      console.error('Error parsing used CSS:', parseError);
      throw parseError;
    }

    // Log parsed nodes for debugging
    console.log('Parsed CSS nodes:', JSON.stringify(result.root.nodes.map(node => ({
      type: node.type,
      selector: node.selector,
      name: node.name,
      params: node.params,
      nodes: node.nodes ? node.nodes.map(n => ({
        type: n.type,
        prop: n.prop,
        value: n.value
      })) : undefined
    })), null, 2));

    function formatCss(nodes, indent = '') {
      return nodes.map(node => {
        if (node.type === 'rule') {
          const declarations = node.nodes
            .filter(n => n.type === 'decl' && n.prop && n.value && n.prop !== 'undefined' && n.value !== 'undefined')
            .map(decl => `${indent}  ${decl.prop}: ${decl.value};`)
            .join('\n');
          return declarations ? `${indent}${node.selector} {\n${declarations}\n${indent}}` : '';
        }
        if (node.type === 'atrule' && node.name === 'media') {
          const innerRules = formatCss(node.nodes, indent + '  ');
          return innerRules ? `${indent}@media ${node.params} {\n${innerRules}\n${indent}}` : '';
        }
        if (node.type === 'atrule') {
          const innerRules = node.nodes ? formatCss(node.nodes, indent + '  ') : '';
          return innerRules ? `${indent}@${node.name} ${node.params} {\n${innerRules}\n${indent}}` : `${indent}@${node.name} ${node.params};`;
        }
        console.warn(`Ignored node type: ${node.type}`);
        return '';
      }).filter(Boolean).join('\n\n');
    }

    const formattedCSS = formatCss(result.root.nodes);

    // Step 6: Save the formatted CSS to a file
    console.log(`Saving used CSS to ${outputFile}...`);
    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(outputFile, formattedCSS, 'utf8');
    console.log(`✅ Formatted CSS saved to ${outputFile}`);
  } catch (error) {
    console.error('Error extracting or saving used CSS:', error);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

// Usage
const url = 'https://miatlantic.co.uk/0a74093';
const cssFilename = 'styles-m.css';
const outputFile = path.join(__dirname, `used-styles-m-${Date.now()}.css`);

(async () => {
  try {
    await extractUsedCSS(url, cssFilename, outputFile);
  } catch (error) {
    console.error('Script execution failed:', error);
    process.exit(1);
  }
})();