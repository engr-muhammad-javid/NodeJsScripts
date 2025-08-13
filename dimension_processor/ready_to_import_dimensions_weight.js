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
    SELECT e.sku, e.type_id AS product_type, t.value AS technical_details
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

  for (const row of rows) {
    const { sku, product_type, technical_details } = row;
    const $ = load(technical_details || '');

    let extracted = { sku, product_type, weight: null, depth: null, width: null, height: null };

    // Find "packaging data" section
    let packagingSection = null;
    $('.table-data').each((_, section) => {
      const heading = normalizeLabel($(section).find('.table-row-head .table-cell').first().text());
      if (heading === 'packaging data') {
        packagingSection = section;
        return false; // break
      }
    });

    // Extract from packaging section
    if (packagingSection) {
      const pkg = extractFromScopeExact($, packagingSection, packagingLabels);
      extracted = { sku, product_type, ...pkg };
    }

    // Skip if all values are null
    if (extracted.weight || extracted.depth || extracted.width || extracted.height) {
      results.push(extracted);
    }
  }

  // Write Magento 2 import CSV (skip nulls in additional_attributes)
  const csvHeader = 'sku,product_type,weight,additional_attributes\n';
  const csvRows = results.map(r => {
    const additionalAttrs = [];
    if (r.height !== null) additionalAttrs.push(`ts_dimensions_height=${r.height}`);
    if (r.depth !== null) additionalAttrs.push(`ts_dimensions_length=${r.depth}`);
    if (r.width !== null) additionalAttrs.push(`ts_dimensions_width=${r.width}`);
    return `${r.sku},${r.product_type},${r.weight ?? ''},"${additionalAttrs.join(',')}"`;
  });

  fs.writeFileSync('magento_import_packaging_data.csv', csvHeader + csvRows.join('\n'), 'utf8');
  console.log(`CSV saved as magento_import_packaging_data.csv (${results.length} rows)`);
} catch (err) {
  console.error('Error:', err);
}
