// generate-critical-css-single.mjs
import { generate } from 'critical';
import fs from 'fs';
import beautify from 'js-beautify';
const beautifyCss = beautify.css;

const targetUrl = 'https://miatlantic.co.uk/w8r3c-rfb';

const criticalCSSPath = 'output/normal/critical.css';
const nonCriticalCSSPath = 'output/normal/non-critical.css';

const generateCSS = async () => {
  const result = await generate({
    src: targetUrl,
    css: [
      'https://miatlantic.co.uk/static/version1752859700/frontend/Sm/smtheme_mobile/en_US/css/product-style-m.css'
    ],
    inline: false,
    extract: true,
    dimensions: [
      {
        width: 375,
        height: 812,
      }
    ]
    // Removed minify: false
  });

  const prettyCritical = beautifyCss(result.css);
  const prettyUncritical = beautifyCss(result.uncritical);

  fs.writeFileSync(criticalCSSPath, prettyCritical);
  fs.writeFileSync(nonCriticalCSSPath, prettyUncritical);

  console.log('✅ Critical CSS saved to', criticalCSSPath);
  console.log('📄 Non-Critical CSS saved to', nonCriticalCSSPath);
};

generateCSS().catch(console.error);
