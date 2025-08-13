import { pool } from './db_config.js';
import { load } from 'cheerio';
import fs from 'fs';

const BATCH_SIZE = 500;

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

function normalizeLabel(s) {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/:$/, '');
}

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

async function updateBatch(batch, attrMap) {
  let updatedCount = 0;

  for (const { entity_id, extracted } of batch) {
    const upsert = async (attrCode, value) => {
      if (value === null) return false; // skip nulls

      const attr = attrMap[attrCode];
      const table = `catalog_product_entity_${attr.type}`;

      const [check] = await pool.execute(
        `SELECT value_id FROM ${table} WHERE entity_id=? AND attribute_id=?`,
        [entity_id, attr.id]
      );

      if (check.length > 0) {
        await pool.execute(
          `UPDATE ${table} SET value=? WHERE entity_id=? AND attribute_id=?`,
          [value, entity_id, attr.id]
        );
      } else {
        await pool.execute(
          `INSERT INTO ${table} (attribute_id, store_id, entity_id, value) VALUES (?, 0, ?, ?)`,
          [attr.id, entity_id, value]
        );
      }
      return true;
    };

    let wasUpdated = false;
    wasUpdated = (await upsert('weight', extracted.weight)) || wasUpdated;
    wasUpdated = (await upsert('ts_dimensions_height', extracted.height)) || wasUpdated;
    wasUpdated = (await upsert('ts_dimensions_width', extracted.width)) || wasUpdated;
    wasUpdated = (await upsert('ts_dimensions_length', extracted.depth)) || wasUpdated;

    if (wasUpdated) {
      updatedCount++;
      console.log(
        `UPDATED SKU: ${extracted.sku} → W:${extracted.weight} D:${extracted.depth} Wd:${extracted.width} H:${extracted.height}`
      );
    }
  }

  return updatedCount;
}

const results = [];

try {
  // Fetch attribute IDs once
  const [attrRows] = await pool.execute(`
    SELECT attribute_id, attribute_code, backend_type
    FROM eav_attribute
    WHERE attribute_code IN ('weight', 'ts_dimensions_height', 'ts_dimensions_width', 'ts_dimensions_length')
    AND entity_type_id = 4
  `);

  const attrMap = {};
  attrRows.forEach(row => {
    attrMap[row.attribute_code] = { id: row.attribute_id, type: row.backend_type };
  });

  // Fetch products with technical_details
  const [rows] = await pool.execute(`
    SELECT e.entity_id, e.sku, t.value AS technical_details
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

  let batch = [];
  let totalUpdated = 0;

  for (const row of rows) {
    const { entity_id, sku, technical_details } = row;
    const $ = load(technical_details || '');

    let extracted = { sku, weight: null, depth: null, width: null, height: null };

    // Find "packaging data" section
    let packagingSection = null;
    $('.table-data').each((_, section) => {
      const heading = normalizeLabel($(section).find('.table-row-head .table-cell').first().text());
      if (heading === 'packaging data') {
        packagingSection = section;
        return false;
      }
    });

    if (packagingSection) {
      const pkg = extractFromScopeExact($, packagingSection, packagingLabels);
      extracted = { sku, ...pkg };
    }

    // Only add if at least one value exists
    if (extracted.weight || extracted.depth || extracted.width || extracted.height) {
      batch.push({ entity_id, extracted });
      results.push(extracted);
    }

    // Process when batch full
    if (batch.length >= BATCH_SIZE) {
      const count = await updateBatch(batch, attrMap);
      totalUpdated += count;
      console.log(`Batch processed: ${count} updated, Total so far: ${totalUpdated}`);
      batch = [];
    }
  }

  // Process remaining batch
  if (batch.length > 0) {
    const count = await updateBatch(batch, attrMap);
    totalUpdated += count;
    console.log(`Final batch processed: ${count} updated, Total updated: ${totalUpdated}`);
  }

  // Save CSV
  const csvHeader = 'sku,weight (kg),depth (cm),width (cm),height (cm)\n';
  const csvRows = results.map(r =>
    `${r.sku},${r.weight ?? ''},${r.depth ?? ''},${r.width ?? ''},${r.height ?? ''}`
  );
  fs.writeFileSync('get_packaging_data_and_update_to_dp.csv', csvHeader + csvRows.join('\n'), 'utf8');

  console.log(`CSV saved. DB updated for ${totalUpdated} products.`);
} catch (err) {
  console.error('Error:', err);
}
