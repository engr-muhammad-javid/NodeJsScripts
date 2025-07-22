import puppeteer from 'puppeteer';
import fs from 'fs';
import postcss from 'postcss';
import safeParser from 'postcss-safe-parser';

const url = process.argv[2] || 'https://miatlantic.co.uk/0a74093';
const targetCssFilename = process.argv[3] || 'styles-m.css';
const outputFile = `used-styles-m-${Date.now()}.css`;

async function extractUsedCss() {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // Test multiple viewports to capture media queries
    const viewports = [
      { width: 375, height: 812, isMobile: true }, // Mobile
      { width: 1280, height: 800, isMobile: false } // Desktop
    ];

    let usedCSS = '';

    for (const viewport of viewports) {
      await page.setViewport(viewport);
      await page.setUserAgent(viewport.isMobile
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_6 like Mac OS X)'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');

      await page.coverage.startCSSCoverage();
      await page.goto(url, { waitUntil: 'networkidle0' });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(resolve => setTimeout(resolve, 2000)); // Increased delay for dynamic content
      const cssCoverage = await page.coverage.stopCSSCoverage();

      for (const entry of cssCoverage) {
        if (entry.url.includes(targetCssFilename)) {
          for (const range of entry.ranges) {
            usedCSS += entry.text.slice(range.start, range.end) + '\n';
          }
        }
      }
    }

    if (!usedCSS) {
      console.warn(`No used CSS found for ${targetCssFilename}`);
      fs.writeFileSync(outputFile, '', 'utf8');
      console.log(`✅ Saved empty file: ${outputFile}`);
      return;
    }

    const result = await postcss([])
      .process(usedCSS, { parser: safeParser, from: undefined });

    function formatCss(nodes, indent = '') {
      return nodes.map(node => {
        if (node.type === 'rule') {
          const declarations = node.nodes.map(decl =>
            `${indent}  ${decl.prop}: ${decl.value};`
          ).join('\n');
          return `${indent}${node.selector} {\n${declarations}\n${indent}}`;
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
    fs.writeFileSync(outputFile, formattedCSS, 'utf8');
    console.log(`✅ Formatted CSS saved to ${outputFile}`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (browser) await browser.close();
  }
}

extractUsedCss();