/**
 * Apify scraper fallbacks — Redfin Detail + Zillow Search.
 * Called when Rentcast returns incomplete data (≥3 critical fields missing).
 * All three sources ultimately normalize through mapZillowToAltech for a
 * consistent output shape.
 */

import { runRedfinDetail, runZillowSearch } from './_apify-client.js';
import { parseNum, mapZillowToAltech } from './_property-mapping.js';

// Critical fields that trigger Apify fallback when ≥3 are missing
export const APIFY_CRITICAL_FIELDS = [
  'yearBuilt', 'totalSqft', 'bedrooms', 'fullBaths',
  'roofType', 'heatingType', 'cooling', 'foundation',
];

export function countMissingCritical(data) {
  return APIFY_CRITICAL_FIELDS.filter(f => data[f] == null || data[f] === '').length;
}

/**
 * Map Redfin Detail actor output → Altech form fields.
 * Redfin nests data under propertyDetails/basicInfo or at top level.
 */
export function mapRedfinDetailToAltech(item) {
  if (!item || typeof item !== 'object') return null;

  const details = item.propertyDetails || item.property_details || {};
  const basic = item.basicInfo || item.basic_info || {};
  const src = item;

  const pick = (...paths) => {
    for (const p of paths) {
      const val = src[p] ?? details[p] ?? basic[p];
      if (val != null && val !== '' && val !== 'N/A' && val !== 'Unknown') return val;
    }
    return null;
  };

  const raw = {};
  const sourceLabel = 'Redfin (Apify scrape)';

  const yr = parseNum(pick('yearBuilt', 'year_built', 'yearbuilt', 'Year Built'));
  if (yr && yr > 1800 && yr <= new Date().getFullYear()) raw.yearBuilt = yr;

  const sqft = parseNum(pick('squareFootage', 'sqFt', 'sqft', 'livingArea', 'living_area', 'Total Sq. Ft.'));
  if (sqft && sqft > 0) raw.livingArea = sqft;

  const beds = parseNum(pick('beds', 'bedrooms', 'Beds'));
  if (beds && beds > 0) raw.bedrooms = beds;

  const baths = parseNum(pick('baths', 'bathrooms', 'Baths'));
  if (baths && baths > 0) raw.bathrooms = baths;

  const halfBaths = parseNum(pick('halfBaths', 'half_baths', 'halfBathrooms'));
  if (halfBaths != null && halfBaths >= 0) raw.halfBathrooms = halfBaths;

  const stories = parseNum(pick('stories', 'levels', 'Stories'));
  if (stories && stories > 0 && stories <= 10) raw.stories = stories;

  const heating = pick('heating', 'heatingType', 'Heating', 'heatingFeatures');
  if (heating) raw.heating = Array.isArray(heating) ? heating.join(', ') : String(heating);

  const cooling = pick('cooling', 'coolingType', 'Cooling', 'coolingFeatures', 'AC Type');
  if (cooling) raw.cooling = Array.isArray(cooling) ? cooling.join(', ') : String(cooling);

  const roof = pick('roof', 'roofType', 'Roof', 'roofMaterial');
  if (roof) raw.roof = Array.isArray(roof) ? roof.join(', ') : String(roof);

  const foundation = pick('foundation', 'foundationType', 'Foundation');
  if (foundation) raw.foundation = Array.isArray(foundation) ? foundation.join(', ') : String(foundation);

  const construction = pick('construction', 'constructionType', 'buildingStyle', 'constructionMaterials', 'Construction');
  if (construction) raw.constructionMaterials = Array.isArray(construction) ? construction.join(', ') : String(construction);

  const exterior = pick('exterior', 'exteriorType', 'siding', 'Exterior', 'exteriorFeatures');
  if (exterior) raw.exteriorFeatures = Array.isArray(exterior) ? exterior.join(', ') : String(exterior);

  const garageSpaces = parseNum(pick('garageSpaces', 'garage_spaces', 'Garage Spaces'));
  if (garageSpaces != null && garageSpaces > 0 && garageSpaces <= 10) raw.garageSpaces = garageSpaces;

  const garageType = pick('garageType', 'garage_type', 'Garage Type');
  if (garageType) raw.garageType = garageType;

  const pool = pick('pool', 'Pool');
  if (pool != null) raw.pool = /yes|in.?ground|above/i.test(String(pool)) ? 'Yes' : /no|none/i.test(String(pool)) ? 'No' : String(pool);

  const fireplace = pick('fireplaces', 'fireplace', 'Fireplaces');
  if (fireplace != null) {
    const fpNum = parseNum(fireplace);
    if (fpNum && fpNum > 0) raw.fireplaces = fpNum;
    else if (/yes|true/i.test(String(fireplace))) raw.fireplaces = 1;
  }

  const lotSize = pick('lotSize', 'lot_size', 'Lot Size', 'lotSizeAcres', 'lotSizeSqFt');
  if (lotSize != null) {
    const lotNum = parseFloat(String(lotSize).replace(/[^0-9.]/g, ''));
    if (!isNaN(lotNum) && lotNum > 0) {
      raw.lotSizeAcres = lotNum > 100 ? Math.round((lotNum / 43560) * 100) / 100 : lotNum;
    }
  }

  const dwelling = pick('propertyType', 'homeType', 'Property Type', 'property_type');
  if (dwelling) raw.dwellingType = String(dwelling);

  const sewer = pick('sewer', 'Sewer');
  if (sewer) raw.sewer = String(sewer);

  const water = pick('water', 'waterSource', 'Water Source');
  if (water) raw.waterSource = String(water);

  const flooring = pick('flooring', 'Flooring');
  if (flooring) raw.flooring = Array.isArray(flooring) ? flooring.join(', ') : String(flooring);

  const county = pick('county', 'County');
  if (county) raw.county = String(county);

  const yearRenovated = parseNum(pick('yearRenovated', 'yearRemodeled', 'Year Renovated'));
  if (yearRenovated && yearRenovated > 1900 && yearRenovated <= new Date().getFullYear()) raw.yearRenovated = yearRenovated;

  const result = mapZillowToAltech(raw);
  for (const key of result.fieldsFound) {
    result.sources[key] = sourceLabel;
  }

  return result;
}

/**
 * Map Zillow Search actor output → Altech form fields.
 * With simple=false, Zillow returns extensive internal data in various shapes.
 */
export function mapZillowSearchToAltech(item) {
  if (!item || typeof item !== 'object') return null;

  const src = item;
  const raw = {};
  const sourceLabel = 'Zillow (Apify scrape)';

  const pick = (...paths) => {
    for (const p of paths) {
      const val = src[p];
      if (val != null && val !== '' && val !== 'N/A') return val;
    }
    return null;
  };

  const yr = parseNum(pick('yearBuilt', 'year_built'));
  if (yr && yr > 1800 && yr <= new Date().getFullYear()) raw.yearBuilt = yr;

  const sqft = parseNum(pick('livingArea', 'sqft', 'area'));
  if (sqft && sqft > 0) raw.livingArea = sqft;

  const beds = parseNum(pick('bedrooms', 'beds'));
  if (beds && beds > 0) raw.bedrooms = beds;

  const baths = parseNum(pick('bathrooms', 'baths'));
  if (baths && baths > 0) raw.bathrooms = baths;

  const stories = parseNum(pick('stories', 'levels'));
  if (stories && stories > 0 && stories <= 10) raw.stories = stories;

  const lotSize = pick('lotSize', 'lotAreaValue');
  if (lotSize != null) {
    const lotNum = parseFloat(String(lotSize).replace(/[^0-9.]/g, ''));
    if (!isNaN(lotNum) && lotNum > 0) {
      raw.lotSizeAcres = lotNum > 100 ? Math.round((lotNum / 43560) * 100) / 100 : lotNum;
    }
  }

  const dwelling = pick('homeType', 'propertyType');
  if (dwelling) raw.dwellingType = String(dwelling);

  const county = pick('county');
  if (county) raw.county = String(county);

  // Parse description text for building systems (heating, cooling, roof, etc.)
  const desc = pick('description', 'homeDescription') || '';
  if (typeof desc === 'string' && desc.length > 20) {
    if (!raw.heating) {
      const heatingMatch = desc.match(/(?:heating|heat(?:ed)?\s+(?:by|with|type))[:\s]*([^.,;]+)/i);
      if (heatingMatch) raw.heating = heatingMatch[1].trim();
    }
    if (!raw.cooling) {
      const coolingMatch = desc.match(/(?:cooling|a\/c|air\s*conditioning)[:\s]*([^.,;]+)/i);
      if (coolingMatch) raw.cooling = coolingMatch[1].trim();
    }
    if (!raw.roof) {
      const roofMatch = desc.match(/(?:new\s+)?roof[:\s]*([^.,;]+)/i);
      if (roofMatch) raw.roof = roofMatch[1].trim();
    }
    if (!raw.foundation) {
      const foundMatch = desc.match(/(?:foundation)[:\s]*([^.,;]+)/i);
      if (foundMatch) raw.foundation = foundMatch[1].trim();
    }
    const renovMatch = desc.match(/(?:renovated|remodeled|updated)\s+(?:in\s+)?(\d{4})/i);
    if (renovMatch) {
      const renovYr = parseInt(renovMatch[1], 10);
      if (renovYr > 1900 && renovYr <= new Date().getFullYear()) raw.yearRenovated = renovYr;
    }
  }

  // Also check Zillow's structured facts if available
  const facts = src.resoFacts || src.facts || {};
  if (typeof facts === 'object') {
    if (!raw.heating && facts.heating) raw.heating = Array.isArray(facts.heating) ? facts.heating.join(', ') : String(facts.heating);
    if (!raw.cooling && facts.cooling) raw.cooling = Array.isArray(facts.cooling) ? facts.cooling.join(', ') : String(facts.cooling);
    if (!raw.roof && facts.roofType) raw.roof = String(facts.roofType);
    if (!raw.foundation && facts.foundationDetails) raw.foundation = Array.isArray(facts.foundationDetails) ? facts.foundationDetails.join(', ') : String(facts.foundationDetails);
    if (!raw.constructionMaterials && facts.constructionMaterials) raw.constructionMaterials = Array.isArray(facts.constructionMaterials) ? facts.constructionMaterials.join(', ') : String(facts.constructionMaterials);
    if (!raw.exteriorFeatures && facts.exteriorFeatures) raw.exteriorFeatures = Array.isArray(facts.exteriorFeatures) ? facts.exteriorFeatures.join(', ') : String(facts.exteriorFeatures);
    if (facts.garageSpaces) raw.garageSpaces = parseNum(facts.garageSpaces);
    if (facts.fireplaces) raw.fireplaces = parseNum(facts.fireplaces);
    if (facts.flooring) raw.flooring = Array.isArray(facts.flooring) ? facts.flooring.join(', ') : String(facts.flooring);
    if (facts.sewer) raw.sewer = Array.isArray(facts.sewer) ? facts.sewer.join(', ') : String(facts.sewer);
    if (facts.waterSource) raw.waterSource = Array.isArray(facts.waterSource) ? facts.waterSource.join(', ') : String(facts.waterSource);
  }

  const result = mapZillowToAltech(raw);
  for (const key of result.fieldsFound) {
    result.sources[key] = sourceLabel;
  }

  return result;
}

export async function fetchApifyRedfin(fullAddress) {
  try {
    const items = await runRedfinDetail({ addresses: [fullAddress] });
    if (!items || items.length === 0) return null;
    return mapRedfinDetailToAltech(items[0]);
  } catch (err) {
    console.warn('[Apify] Redfin error:', err.message);
    return null;
  }
}

export async function fetchApifyZillow(fullAddress) {
  try {
    const items = await runZillowSearch({ search: fullAddress, maxItems: 3, simple: false });
    if (!items || items.length === 0) return null;

    // Fuzzy match: normalize and compare street address
    const normalizeAddr = (a) => String(a || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    const queryNorm = normalizeAddr(fullAddress.split(',')[0]);

    const match = items.find(it => {
      const itemAddr = normalizeAddr(
        it.streetAddress || it.address?.streetAddress || it.addressStreet || ''
      );
      return itemAddr && queryNorm && (
        itemAddr.includes(queryNorm) || queryNorm.includes(itemAddr) ||
        itemAddr.split(' ').slice(0, 2).join(' ') === queryNorm.split(' ').slice(0, 2).join(' ')
      );
    }) || items[0]; // fallback to first result

    return mapZillowSearchToAltech(match);
  } catch (err) {
    console.warn('[Apify] Zillow error:', err.message);
    return null;
  }
}

/**
 * Merge Apify result data into existing data, preserving upstream values.
 * Upstream (e.g. Rentcast) wins on conflicts.
 */
export function mergeApifyResult(existing, apifyResult) {
  if (!apifyResult) return existing;
  const merged = { ...existing };
  const newFields = [];

  for (const [key, val] of Object.entries(apifyResult.data)) {
    if (merged.data[key] == null || merged.data[key] === '') {
      merged.data[key] = val;
      if (!merged.fieldsFound.includes(key)) {
        merged.fieldsFound.push(key);
        newFields.push(key);
      }
      if (apifyResult.sources[key]) {
        merged.sources[key] = apifyResult.sources[key];
      }
    }
  }

  if (newFields.length > 0) {
    console.log(`[Apify] Merged ${newFields.length} new fields: ${newFields.join(', ')}`);
  }
  return merged;
}
