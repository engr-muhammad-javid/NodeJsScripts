import { pool } from './db_config.js';
import { load } from 'cheerio';
import fs from 'fs';

// Helper to convert to cm or kg
function convertValue(value, type) {
  if (!value) return null;

  const match = value.match(/([\d.]+)\s*(cm|mm|inch|inches|in|kg|g|grams|lbs|pounds)?/i);
  if (!match) return value;

  let [ , num, unit ] = match;
  num = parseFloat(num);
  if (isNaN(num)) return null;

  unit = unit?.toLowerCase();

  if (type === 'dimension') {
    if (!unit || unit === 'cm') return num;
    if (unit === 'mm') return num / 10;
    if (['inch', 'inches', 'in'].includes(unit)) return num * 2.54;
  }

  if (type === 'weight') {
    if (!unit || unit === 'kg') return num;
    if (['g', 'grams'].includes(unit)) return num / 1000;
    if (['lbs', 'pounds'].includes(unit)) return num * 0.453592;
  }

  return num;
}

const results = [];

try {
  const [rows] = await pool.execute(`
    SELECT e.sku, t.value AS technical_details
    FROM catalog_product_entity_text t
    JOIN catalog_product_entity e ON t.entity_id = e.entity_id
    WHERE t.attribute_id = (
      SELECT attribute_id FROM eav_attribute 
      WHERE attribute_code = 'technical_details' 
      AND entity_type_id = (
        SELECT entity_type_id FROM eav_entity_type 
        WHERE entity_type_code = 'catalog_product'
      )
    )
    AND t.value IS NOT NULL
    LIMIT 1000
  `);

  for (const row of rows) {
    const { sku, technical_details } = row;
    const $ = load(technical_details);

    const extracted = {
      sku,
      weight: null,
      length: null,
      width: null,
      height: null,
    };

    $('.table-row').each((_, rowEl) => {
      const label = $(rowEl).find('.table-cell').first().text().trim().toLowerCase();
      const value = $(rowEl).find('.table-cell').last().text().trim();

      if (label.includes('length')) extracted.length = convertValue(value, 'dimension');
      if (label.includes('width')) extracted.width = convertValue(value, 'dimension');
      if (label.includes('height') || label.includes('depth')) extracted.height = convertValue(value, 'dimension');
      if (label.includes('weight')) extracted.weight = convertValue(value, 'weight');
    });

    results.push(extracted);
  }

  // Save to CSV
  const csvData = [
    'sku,weight (kg),length (cm),width (cm),height (cm)',
    ...results.map(r =>
      `${r.sku},${r.weight ?? ''},${r.length ?? ''},${r.width ?? ''},${r.height ?? ''}`
    ),
  ].join('\n');

  fs.writeFileSync('products_output.csv', csvData);
  console.log('✅ CSV saved as products_output.csv');
} catch (err) {
  console.error('❌ Error:', err);
}
