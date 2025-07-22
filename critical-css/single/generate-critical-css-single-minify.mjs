// generate-css.mjs
import { generate } from 'critical';
import fs from 'fs';

// Source URL
const targetUrl = 'https://miatlantic.co.uk/w8r3c-rfb';

// Output paths
const criticalCSSPath = 'output/minified/critical.css';
const nonCriticalCSSPath = 'output/minified/non-critical.css';

const generateCSS = async () => {
  const result = await generate({
    src: targetUrl,
    css: [
      'https://miatlantic.co.uk/static/version1752859700/frontend/Sm/smtheme_mobile/en_US/css/product-style-m.css'
    ],
    inline: false,
    extract: true, // Enables separating critical and non-critical
    dimensions: [
      {
        width: 375,
        height: 812, // Mobile
      }
    ],
  });

  fs.writeFileSync(criticalCSSPath, result.css);
  fs.writeFileSync(nonCriticalCSSPath, result.uncritical);

  console.log('✅ Critical CSS saved to', criticalCSSPath);
  console.log('📄 Non-Critical CSS saved to', nonCriticalCSSPath);
};

generateCSS().catch(console.error);