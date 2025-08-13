import { pool } from './db_config.js';
import { load } from 'cheerio';
import fs from 'fs';

// Convert to cm or kg (rounded to 2 decimals)
function convertValue(value, type = 'length') {
  if (!value) return null;
  const match = value.match(/([\d.,]+)\s*(cm|mm|inch|inches|in|kg|g|lbs|pounds)?/i);
  if (!match) return null;

  let num = parseFloat(match[1].replace(',', '.'));
  if (isNaN(num)) return null;

  const unit = (match[2] || '').toLowerCase();

  if (type === 'length') {
    if (!unit || unit === 'cm') num = num;
    else if (unit === 'mm') num = num / 10;
    else if (['inch', 'inches', 'in'].includes(unit)) num = num * 2.54;
  } else if (type === 'weight') {
    if (!unit || unit === 'kg') num = num;
    else if (unit === 'g') num = num / 1000;
    else if (['lbs', 'pounds'].includes(unit)) num = num * 0.453592;
  }

  return Math.round(num * 100) / 100;
}

// Normalize label
function normalizeLabel(s) {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/:$/, '');
}

// Extract from a cheerio scope using exact labels
function extractFromScopeExact($, scope, labelsMap) {
  const extracted = { weight: null, depth: null, width: null, height: null };

  $(scope).find('.table-row').each((_, rowEl) => {
    const label = normalizeLabel($(rowEl).find('.table-cell').first().text());
    const value = $(rowEl).find('.table-cell').last().text().trim();

    for (const key of Object.keys(labelsMap)) {
      if (label === labelsMap[key]) {
        extracted[key] = convertValue(value, key === 'weight' ? 'weight' : 'length');
      }
    }
  });

  return extracted;
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
  `);

  const packagingLabels = {
    weight: 'package weight',
    depth: 'package depth',
    width: 'package width',
    height: 'package height',
  };

  const fallbackLabels = {
    weight: 'weight',
    depth: 'depth',
    width: 'width',
    height: 'height',
  };

  for (const row of rows) {
    const { sku, technical_details } = row;
    const $ = load(technical_details || '');

    let extracted = { sku, weight: null, depth: null, width: null, height: null };

    // Find packaging section
    let packagingSection = null;
    $('.table-data').each((_, section) => {
      const heading = normalizeLabel($(section).find('.table-row-head .table-cell').first().text());
      if (heading === 'packaging data') {
        packagingSection = section;
        return false; // break
      }
    });

    // Extract from packaging section first
    if (packagingSection) {
      const pkg = extractFromScopeExact($, packagingSection, packagingLabels);
      extracted = { sku, ...pkg };
    }

    // Fallback to rest of document for missing fields
    if (Object.values(extracted).some(v => v === null)) {
      const fb = extractFromScopeExact($, $.root(), fallbackLabels);
      for (const key of Object.keys(fb)) {
        if (extracted[key] === null && fb[key] !== null) {
          extracted[key] = fb[key];
        }
      }
    }

    // Skip if all are null
    if (extracted.weight || extracted.depth || extracted.width || extracted.height) {
      results.push(extracted);
    }
  }

  // Write CSV
  const csvHeader = 'sku,weight (kg),depth (cm),width (cm),height (cm)\n';
  const csvRows = results.map(r =>
    `${r.sku},${r.weight ?? ''},${r.depth ?? ''},${r.width ?? ''},${r.height ?? ''}`
  );

  fs.writeFileSync('strict_products_output_dimensions.csv', csvHeader + csvRows.join('\n'), 'utf8');
  console.log(`CSV saved as strict_products_output_dimensions.csv (${results.length} rows)`);
} catch (err) {
  console.error('Error:', err);
}
