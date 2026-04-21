/**
 * Zillow/Gemini/Apify → Altech form field mapping.
 * Fuzzy dictionaries + normalizer so every source produces the same Altech keys.
 */

// ── Fuzzy dictionaries: raw source text → Altech enum value ──────────────────

export const HEATING_MAP = {
  'forced air': 'Forced Air - Gas',
  'central forced air': 'Forced Air - Gas',
  'forced air gas': 'Forced Air - Gas',
  'gas forced air': 'Forced Air - Gas',
  'forced air electric': 'Forced Air - Electric',
  'electric forced air': 'Forced Air - Electric',
  'baseboard': 'Electric Baseboard',
  'electric baseboard': 'Electric Baseboard',
  'heat pump': 'Heat Pump',
  'mini split': 'Heat Pump',
  'ductless': 'Heat Pump',
  'boiler': 'Boiler (Steam/Water)',
  'steam': 'Boiler (Steam/Water)',
  'hot water': 'Boiler (Steam/Water)',
  'radiant': 'Boiler (Steam/Water)',
  'oil': 'Oil/Kerosene',
  'kerosene': 'Oil/Kerosene',
};

export const COOLING_MAP = {
  'central': 'Central Air',
  'central air': 'Central Air',
  'central a/c': 'Central Air',
  'window': 'Window Units',
  'window unit': 'Window Units',
  'wall unit': 'Window Units',
  'none': 'None',
};

export const ROOF_MAP = {
  'composition': 'Asphalt/Composite Shingle',
  'comp shingle': 'Asphalt/Composite Shingle',
  'composition shingle': 'Asphalt/Composite Shingle',
  'asphalt': 'Asphalt/Composite Shingle',
  'asphalt shingle': 'Asphalt/Composite Shingle',
  'shingle': 'Asphalt/Composite Shingle',
  'architectural shingle': 'Architectural Shingle',
  'dimensional shingle': 'Architectural Shingle',
  'metal': 'Metal',
  'standing seam': 'Metal',
  'steel': 'Metal',
  'tin': 'Metal',
  'tile': 'Clay Tile',
  'clay tile': 'Clay Tile',
  'clay': 'Clay Tile',
  'concrete tile': 'Concrete Tile',
  'wood shake': 'Wood Shake',
  'shake': 'Wood Shake',
  'cedar shake': 'Wood Shake',
  'slate': 'Slate',
  'flat': 'Tar & Gravel',
  'tar': 'Tar & Gravel',
  'tar and gravel': 'Tar & Gravel',
  'built-up': 'Tar & Gravel',
  'rubber': 'Tar & Gravel',
};

export const FOUNDATION_MAP = {
  'finished': 'Basement (Finished)',
  'finished basement': 'Basement (Finished)',
  'full basement': 'Basement (Finished)',
  'daylight': 'Basement (Finished)',
  'walkout': 'Basement (Finished)',
  'unfinished': 'Basement (Unfinished)',
  'unfinished basement': 'Basement (Unfinished)',
  'partial basement': 'Basement (Unfinished)',
  'basement': 'Basement (Unfinished)',
  'slab': 'Slab',
  'concrete slab': 'Slab',
  'slab on grade': 'Slab',
  'crawl space': 'Crawlspace',
  'crawlspace': 'Crawlspace',
  'crawl': 'Crawlspace',
  'pier': 'Pier/Pile',
  'pier and beam': 'Pier/Pile',
  'piling': 'Pier/Pile',
  'pilings': 'Pier/Pile',
};

export const CONSTRUCTION_MAP = {
  'stick': 'Frame',
  'stick built': 'Frame',
  'wood': 'Frame',
  'wood frame': 'Frame',
  'frame': 'Frame',
  'masonry': 'Masonry',
  'brick': 'Masonry Veneer',
  'brick veneer': 'Masonry Veneer',
  'stone': 'Masonry',
  'stucco': 'Stucco',
  'log': 'Log',
  'adobe': 'Adobe',
};

export const EXTERIOR_MAP = {
  'vinyl': 'Vinyl Siding',
  'vinyl siding': 'Vinyl Siding',
  'wood siding': 'Wood Siding',
  'cedar': 'Wood Siding',
  'clapboard': 'Wood Siding',
  'wood': 'Wood Siding',
  'shingle siding': 'Wood Siding',
  'brick': 'Brick',
  'stucco': 'Stucco',
  'fiber cement': 'Fiber Cement',
  'hardie': 'Fiber Cement',
  'hardiplank': 'Fiber Cement',
  'cement board': 'Fiber Cement',
  'aluminum': 'Aluminum',
  'aluminum siding': 'Aluminum',
};

// ── Small utilities ──────────────────────────────────────────────────────────

export function buildSlug(address, city, state, zip) {
  return `${address} ${city} ${state} ${zip}`
    .toLowerCase()
    .replace(/#\d+/g, '')
    .replace(/apt\.?\s*\d+/gi, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function fuzzyMapLookup(rawValue, map) {
  if (!rawValue || typeof rawValue !== 'string') return null;
  const lower = rawValue.toLowerCase().trim();

  if (map[lower]) return map[lower];

  for (const [key, value] of Object.entries(map)) {
    if (lower.includes(key)) return value;
  }

  for (const [key, value] of Object.entries(map)) {
    if (key.includes(lower)) return value;
  }

  return null;
}

export function parseNum(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
  return Number.isNaN(n) ? null : n;
}

// ── Main mapper ──────────────────────────────────────────────────────────────
// Accepts raw source data (from Zillow/Gemini/Apify/etc) and returns
// { data, fieldsFound, sources } normalized to Altech form field IDs.

export function mapZillowToAltech(raw) {
  function extractVal(v) { if (v !== null && v !== undefined && typeof v === 'object' && 'value' in v) return v.value; return v ?? null; }
  function extractSrc(v) { if (v !== null && v !== undefined && typeof v === 'object' && 'source' in v) return v.source; return null; }

  const mapped = {};
  const fieldsFound = [];
  const sources = {};

  const heatingPick = raw.heating || raw.heatingFeatures || raw.heatingType || '';
  const heatingRaw = extractVal(heatingPick);
  const heatingVal = fuzzyMapLookup(
    Array.isArray(heatingRaw) ? heatingRaw.join(' ') : (heatingRaw || ''),
    HEATING_MAP
  );
  if (heatingVal) { mapped.heatingType = heatingVal; fieldsFound.push('heatingType'); sources.heatingType = extractSrc(heatingPick); }

  const coolingPick = raw.cooling || raw.coolingFeatures || raw.coolingType || '';
  const coolingRaw = extractVal(coolingPick);
  const coolingVal = fuzzyMapLookup(
    Array.isArray(coolingRaw) ? coolingRaw.join(' ') : (coolingRaw || ''),
    COOLING_MAP
  );
  if (coolingVal) { mapped.cooling = coolingVal; fieldsFound.push('cooling'); sources.cooling = extractSrc(coolingPick); }

  const roofPick = raw.roof || raw.roofType || raw.roofing || '';
  const roofRaw = extractVal(roofPick);
  const roofVal = fuzzyMapLookup(
    Array.isArray(roofRaw) ? roofRaw.join(' ') : (roofRaw || ''),
    ROOF_MAP
  );
  if (roofVal) { mapped.roofType = roofVal; fieldsFound.push('roofType'); sources.roofType = extractSrc(roofPick); }

  const foundPick = raw.foundation || raw.foundationDetails || raw.basement || '';
  const foundRaw = extractVal(foundPick);
  const foundVal = fuzzyMapLookup(
    Array.isArray(foundRaw) ? foundRaw.join(' ') : (foundRaw || ''),
    FOUNDATION_MAP
  );
  if (foundVal) { mapped.foundation = foundVal; fieldsFound.push('foundation'); sources.foundation = extractSrc(foundPick); }

  const constPick = raw.constructionMaterials || raw.construction || raw.buildingStyle || '';
  const constRaw = extractVal(constPick);
  const constVal = fuzzyMapLookup(
    Array.isArray(constRaw) ? constRaw.join(' ') : (constRaw || ''),
    CONSTRUCTION_MAP
  );
  if (constVal) { mapped.constructionStyle = constVal; fieldsFound.push('constructionStyle'); sources.constructionStyle = extractSrc(constPick); }

  const extPick = raw.exteriorFeatures || raw.exterior || raw.siding || '';
  const extRaw = extractVal(extPick);
  const extVal = fuzzyMapLookup(
    Array.isArray(extRaw) ? extRaw.join(' ') : (extRaw || ''),
    EXTERIOR_MAP
  );
  if (extVal) { mapped.exteriorWalls = extVal; fieldsFound.push('exteriorWalls'); sources.exteriorWalls = extractSrc(extPick); }

  const garagePick = raw.garageSpaces || raw.parkingFeatures || raw.garage || '';
  const garageRaw = extractVal(garagePick);
  const garageNum = parseNum(Array.isArray(garageRaw) ? garageRaw.join(' ') : garageRaw);
  if (garageNum && garageNum > 0 && garageNum <= 10) {
    mapped.garageSpaces = garageNum;
    fieldsFound.push('garageSpaces');
    sources.garageSpaces = extractSrc(garagePick);
  }

  const bedsPick = raw.bedrooms || raw.beds;
  const beds = parseNum(extractVal(bedsPick));
  if (beds && beds > 0) { mapped.bedrooms = beds; fieldsFound.push('bedrooms'); sources.bedrooms = extractSrc(bedsPick); }

  const bathsPick = raw.bathrooms || raw.fullBathrooms || raw.bathroomsFull;
  const baths = parseNum(extractVal(bathsPick));
  if (baths && baths > 0) {
    // Split fractional baths: 3.5 → fullBaths=3, halfBaths=1
    const fullBaths = Math.floor(baths);
    const hasHalf = (baths % 1) >= 0.25;
    mapped.fullBaths = fullBaths;
    fieldsFound.push('fullBaths');
    sources.fullBaths = extractSrc(bathsPick);
    if (hasHalf) {
      mapped.halfBaths = Math.round((baths - fullBaths) / 0.5);
      if (mapped.halfBaths < 1) mapped.halfBaths = 1;
      fieldsFound.push('halfBaths');
      sources.halfBaths = extractSrc(bathsPick);
    }
  }

  // Explicit half bathrooms field (from AI that returns it separately)
  const halfBathPick = raw.halfBathrooms || raw.halfBaths;
  const halfB = parseNum(extractVal(halfBathPick));
  if (halfB != null && halfB >= 0 && !mapped.halfBaths) {
    mapped.halfBaths = halfB;
    fieldsFound.push('halfBaths');
    sources.halfBaths = extractSrc(halfBathPick);
  }

  const yrPick = raw.yearBuilt || raw.year_built;
  const yr = parseNum(extractVal(yrPick));
  if (yr && yr > 1800 && yr <= new Date().getFullYear()) {
    mapped.yrBuilt = String(yr);
    mapped.yearBuilt = yr;
    fieldsFound.push('yrBuilt');
    sources.yrBuilt = extractSrc(yrPick);
  }

  const storiesPick = raw.stories || raw.levels;
  const stories = parseNum(extractVal(storiesPick));
  if (stories && stories > 0 && stories <= 10) {
    mapped.stories = stories;
    fieldsFound.push('stories');
    sources.stories = extractSrc(storiesPick);
  }

  const sqftPick = raw.livingArea || raw.totalSqft || raw.finishedSqFt;
  const sqft = parseNum(extractVal(sqftPick));
  if (sqft && sqft > 0) { mapped.totalSqft = sqft; fieldsFound.push('totalSqft'); sources.totalSqft = extractSrc(sqftPick); }

  const fpPick = raw.fireplaces || raw.fireplace || raw.fireplaceFeatures || '';
  const fpRaw = extractVal(fpPick);
  const fpStr = Array.isArray(fpRaw) ? fpRaw.join(' ') : String(fpRaw ?? '');
  const fpNum = parseNum(fpStr);
  if (fpNum && fpNum > 0) {
    mapped.fireplace = 'Yes';
    mapped.numFireplaces = fpNum;
    fieldsFound.push('fireplace');
    sources.fireplace = extractSrc(fpPick);
  } else if (/yes/i.test(fpStr) || /true/i.test(fpStr)) {
    mapped.fireplace = 'Yes';
    fieldsFound.push('fireplace');
    sources.fireplace = extractSrc(fpPick);
  }

  // Garage type (Attached/Detached/Built-in/Carport/None)
  const garageTypePick = raw.garageType;
  const garageTypeVal = extractVal(garageTypePick);
  if (garageTypeVal && typeof garageTypeVal === 'string') {
    mapped.garageType = garageTypeVal;
    fieldsFound.push('garageType');
    sources.garageType = extractSrc(garageTypePick);
  }

  // Flooring (Hardwood/Carpet/Tile/Laminate/Mixed)
  const flooringPick = raw.flooring || raw.flooringType || '';
  const flooringRaw = extractVal(flooringPick);
  const flooringStr = Array.isArray(flooringRaw) ? flooringRaw.join(', ') : String(flooringRaw ?? '');
  if (flooringStr && flooringStr.length > 1) {
    mapped.flooring = flooringStr;
    fieldsFound.push('flooring');
    sources.flooring = extractSrc(flooringPick);
  }

  // Sewer (Public/Septic)
  const sewerPick = raw.sewer || raw.sewerType || '';
  const sewerRaw = extractVal(sewerPick);
  const sewerStr = Array.isArray(sewerRaw) ? sewerRaw.join(' ') : String(sewerRaw ?? '');
  if (/public|municipal|city/i.test(sewerStr)) {
    mapped.sewer = 'Public'; fieldsFound.push('sewer'); sources.sewer = extractSrc(sewerPick);
  } else if (/septic|private/i.test(sewerStr)) {
    mapped.sewer = 'Septic'; fieldsFound.push('sewer'); sources.sewer = extractSrc(sewerPick);
  }

  // Water source (Public/Well)
  const waterPick = raw.waterSource || raw.water || '';
  const waterRaw = extractVal(waterPick);
  const waterStr = Array.isArray(waterRaw) ? waterRaw.join(' ') : String(waterRaw ?? '');
  if (/public|municipal|city/i.test(waterStr)) {
    mapped.waterSource = 'Public'; fieldsFound.push('waterSource'); sources.waterSource = extractSrc(waterPick);
  } else if (/well|private/i.test(waterStr)) {
    mapped.waterSource = 'Well'; fieldsFound.push('waterSource'); sources.waterSource = extractSrc(waterPick);
  }

  // Pool (map yes/no to form values)
  const poolPick = raw.pool || '';
  const poolRaw = extractVal(poolPick);
  const poolStr = Array.isArray(poolRaw) ? poolRaw.join(' ') : String(poolRaw ?? '');
  if (/yes|in.?ground|above.?ground/i.test(poolStr)) {
    mapped.pool = /above/i.test(poolStr) ? 'Above Ground' : 'In Ground';
    fieldsFound.push('pool');
    sources.pool = extractSrc(poolPick);
  } else if (/no|none/i.test(poolStr)) {
    mapped.pool = 'None';
    fieldsFound.push('pool');
    sources.pool = extractSrc(poolPick);
  }

  // Wood stove
  const woodPick = raw.woodStove || raw.woodBurningStove || '';
  const woodRaw = extractVal(woodPick);
  const woodStr = Array.isArray(woodRaw) ? woodRaw.join(' ') : String(woodRaw ?? '');
  if (/yes|true/i.test(woodStr)) {
    mapped.woodStove = 'Yes'; fieldsFound.push('woodStove'); sources.woodStove = extractSrc(woodPick);
  } else if (/no|none|false/i.test(woodStr)) {
    mapped.woodStove = 'None'; fieldsFound.push('woodStove'); sources.woodStove = extractSrc(woodPick);
  }

  // Roof year updated
  const roofYrPick = raw.roofYearUpdated || raw.roofYear || '';
  const roofYrNum = parseNum(extractVal(roofYrPick));
  if (roofYrNum && roofYrNum > 1900 && roofYrNum <= new Date().getFullYear()) {
    mapped.roofYr = String(roofYrNum);
    fieldsFound.push('roofYr');
    sources.roofYr = extractSrc(roofYrPick);
  }

  // Basement finish percentage
  const bsmtPick = raw.basementFinishPct;
  const bsmtPct = parseNum(extractVal(bsmtPick));
  if (bsmtPct != null && bsmtPct >= 0 && bsmtPct <= 100) {
    mapped.basementFinishPct = bsmtPct;
    fieldsFound.push('basementFinishPct');
    sources.basementFinishPct = extractSrc(bsmtPick);
  }

  // Dwelling type (One Family, Two Family, Condo, Townhome, Row House)
  const dwellingPick = raw.dwellingType || raw.propertyType || raw.homeType || '';
  const dwellingRaw = extractVal(dwellingPick);
  const dwellingStr = String(dwellingRaw ?? '').toLowerCase();
  const DWELLING_MAP = {
    'single family': 'One Family', 'single-family': 'One Family', 'one family': 'One Family',
    'single family residential': 'One Family', 'detached': 'One Family', 'house': 'One Family',
    'duplex': 'Two Family', 'two family': 'Two Family',
    'triplex': 'Three Family', 'three family': 'Three Family',
    'fourplex': 'Four Family', 'four family': 'Four Family', 'quadplex': 'Four Family',
    'condo': 'Condo', 'condominium': 'Condo',
    'townhome': 'Townhome', 'townhouse': 'Townhome',
    'row house': 'Row House', 'rowhouse': 'Row House',
  };
  const dwellingVal = Object.entries(DWELLING_MAP).find(([k]) => dwellingStr.includes(k))?.[1];
  if (dwellingVal) {
    mapped.dwellingType = dwellingVal;
    fieldsFound.push('dwellingType');
    sources.dwellingType = extractSrc(dwellingPick);
  }

  // Year renovated / remodeled
  const renovPick = raw.yearRenovated || raw.yearRemodeled || '';
  const renovYr = parseNum(extractVal(renovPick));
  if (renovYr && renovYr > 1900 && renovYr <= new Date().getFullYear()) {
    mapped.yearRenovated = String(renovYr);
    fieldsFound.push('yearRenovated');
    sources.yearRenovated = extractSrc(renovPick);
  }

  // Lot size in acres
  const lotPick = raw.lotSizeAcres || raw.lotSize || '';
  const lotRaw = extractVal(lotPick);
  let lotAcres = parseNum(lotRaw);
  if (lotAcres != null && lotAcres > 100) {
    // Probably sqft, convert to acres
    lotAcres = Math.round((lotAcres / 43560) * 100) / 100;
  }
  if (lotAcres != null && lotAcres > 0 && lotAcres < 10000) {
    mapped.lotSize = lotAcres;
    fieldsFound.push('lotSize');
    sources.lotSize = extractSrc(lotPick);
  }

  // County
  const countyPick = raw.county || '';
  const countyRaw = extractVal(countyPick);
  if (countyRaw && typeof countyRaw === 'string' && countyRaw.length > 1) {
    // Strip trailing " County" if present
    mapped.county = countyRaw.replace(/\s+county$/i, '').trim();
    fieldsFound.push('county');
    sources.county = extractSrc(countyPick);
  }

  return { data: mapped, fieldsFound, sources };
}
