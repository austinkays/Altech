/**
 * Zillow Property Data Extractor
 * Vercel Serverless Function
 *
 * Fetches detailed home attributes (Roof, Heating, Foundation, etc.)
 * from Zillow's Facts & Features for a given address.
 *
 * Two-layer approach:
 *   Layer A: Direct fetch with browser-like headers → parse JSON-LD / __NEXT_DATA__
 *   Layer B: Playwright fallback if Layer A returns no data
 */

// ---------------------------------------------------------------------------
// Zillow → Altech form value mapping tables
// ---------------------------------------------------------------------------

const HEATING_MAP = {
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

const COOLING_MAP = {
  'central': 'Central Air',
  'central air': 'Central Air',
  'central a/c': 'Central Air',
  'window': 'Window Units',
  'window unit': 'Window Units',
  'wall unit': 'Window Units',
  'none': 'None',
};

const ROOF_MAP = {
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

const FOUNDATION_MAP = {
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

const CONSTRUCTION_MAP = {
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

const EXTERIOR_MAP = {
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

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

function buildZillowSearchUrl(address, city, state, zip) {
  // Zillow search URL pattern: /homes/{slugified-address}_rb/
  const slug = `${address} ${city} ${state} ${zip}`
    .toLowerCase()
    .replace(/#\d+/g, '')          // strip unit numbers (#204)
    .replace(/apt\.?\s*\d+/gi, '') // strip apartment numbers
    .replace(/[^a-z0-9\s]/g, '')   // strip special chars
    .replace(/\s+/g, '-')          // spaces → dashes
    .replace(/-+/g, '-')           // collapse double dashes
    .replace(/^-|-$/g, '');        // trim leading/trailing dashes
  return `https://www.zillow.com/homes/${slug}_rb/`;
}

// ---------------------------------------------------------------------------
// Fuzzy map lookup — finds the best match from a mapping table
// ---------------------------------------------------------------------------

function fuzzyMapLookup(rawValue, map) {
  if (!rawValue || typeof rawValue !== 'string') return null;
  const lower = rawValue.toLowerCase().trim();

  // Exact match first
  if (map[lower]) return map[lower];

  // Partial match: check if any map key is contained in the raw value
  for (const [key, value] of Object.entries(map)) {
    if (lower.includes(key)) return value;
  }

  // Reverse partial: check if raw value is contained in any map key
  for (const [key, value] of Object.entries(map)) {
    if (key.includes(lower)) return value;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Parse a numeric value from a string
// ---------------------------------------------------------------------------

function parseNum(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
  return Number.isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Map raw Zillow data → Altech form fields
// ---------------------------------------------------------------------------

function mapZillowToAltech(raw) {
  const mapped = {};
  const fieldsFound = [];

  // Heating
  const heatingRaw = raw.heating || raw.heatingFeatures || raw.heatingType || '';
  const heatingVal = fuzzyMapLookup(
    Array.isArray(heatingRaw) ? heatingRaw.join(' ') : heatingRaw,
    HEATING_MAP
  );
  if (heatingVal) { mapped.heatingType = heatingVal; fieldsFound.push('heatingType'); }

  // Cooling
  const coolingRaw = raw.cooling || raw.coolingFeatures || raw.coolingType || '';
  const coolingVal = fuzzyMapLookup(
    Array.isArray(coolingRaw) ? coolingRaw.join(' ') : coolingRaw,
    COOLING_MAP
  );
  if (coolingVal) { mapped.cooling = coolingVal; fieldsFound.push('cooling'); }

  // Roof
  const roofRaw = raw.roof || raw.roofType || raw.roofing || '';
  const roofVal = fuzzyMapLookup(
    Array.isArray(roofRaw) ? roofRaw.join(' ') : roofRaw,
    ROOF_MAP
  );
  if (roofVal) { mapped.roofType = roofVal; fieldsFound.push('roofType'); }

  // Foundation / Basement
  const foundRaw = raw.foundation || raw.foundationDetails || raw.basement || '';
  const foundVal = fuzzyMapLookup(
    Array.isArray(foundRaw) ? foundRaw.join(' ') : foundRaw,
    FOUNDATION_MAP
  );
  if (foundVal) { mapped.foundation = foundVal; fieldsFound.push('foundation'); }

  // Construction style
  const constRaw = raw.constructionMaterials || raw.construction || raw.buildingStyle || '';
  const constVal = fuzzyMapLookup(
    Array.isArray(constRaw) ? constRaw.join(' ') : constRaw,
    CONSTRUCTION_MAP
  );
  if (constVal) { mapped.constructionStyle = constVal; fieldsFound.push('constructionStyle'); }

  // Exterior walls
  const extRaw = raw.exteriorFeatures || raw.exterior || raw.siding || '';
  const extVal = fuzzyMapLookup(
    Array.isArray(extRaw) ? extRaw.join(' ') : extRaw,
    EXTERIOR_MAP
  );
  if (extVal) { mapped.exteriorWalls = extVal; fieldsFound.push('exteriorWalls'); }

  // Garage spaces
  const garageRaw = raw.garageSpaces || raw.parkingFeatures || raw.garage || '';
  const garageNum = parseNum(Array.isArray(garageRaw) ? garageRaw.join(' ') : garageRaw);
  if (garageNum && garageNum > 0 && garageNum <= 10) {
    mapped.garageSpaces = garageNum;
    fieldsFound.push('garageSpaces');
  }

  // Bedrooms
  const beds = parseNum(raw.bedrooms || raw.beds);
  if (beds && beds > 0) { mapped.bedrooms = beds; fieldsFound.push('bedrooms'); }

  // Bathrooms
  const baths = parseNum(raw.bathrooms || raw.fullBathrooms || raw.bathroomsFull);
  if (baths && baths > 0) { mapped.fullBaths = baths; fieldsFound.push('fullBaths'); }

  // Year built
  const yr = parseNum(raw.yearBuilt || raw.year_built);
  if (yr && yr > 1800 && yr <= new Date().getFullYear()) {
    mapped.yrBuilt = String(yr);
    mapped.yearBuilt = yr;
    fieldsFound.push('yrBuilt');
  }

  // Stories
  const stories = parseNum(raw.stories || raw.levels);
  if (stories && stories > 0 && stories <= 10) {
    mapped.stories = stories;
    fieldsFound.push('stories');
  }

  // Total sqft
  const sqft = parseNum(raw.livingArea || raw.totalSqft || raw.finishedSqFt);
  if (sqft && sqft > 0) { mapped.totalSqft = sqft; fieldsFound.push('totalSqft'); }

  // Fireplace
  const fpRaw = raw.fireplaces || raw.fireplace || raw.fireplaceFeatures || '';
  const fpStr = Array.isArray(fpRaw) ? fpRaw.join(' ') : String(fpRaw);
  const fpNum = parseNum(fpStr);
  if (fpNum && fpNum > 0) {
    mapped.fireplace = 'Yes';
    fieldsFound.push('fireplace');
  } else if (/yes/i.test(fpStr) || /true/i.test(fpStr)) {
    mapped.fireplace = 'Yes';
    fieldsFound.push('fireplace');
  }

  return { data: mapped, fieldsFound };
}

// ---------------------------------------------------------------------------
// Layer A: Direct fetch → JSON-LD and __NEXT_DATA__ extraction
// ---------------------------------------------------------------------------

async function fetchZillowDirect(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
    });

    if (!resp.ok) {
      console.log(`[Zillow] Direct fetch status: ${resp.status}`);
      return null;
    }

    const html = await resp.text();
    const finalUrl = resp.url || url;

    // Try JSON-LD first
    const jsonLdData = extractJsonLd(html);
    if (jsonLdData && Object.keys(jsonLdData).length > 2) {
      console.log('[Zillow] Extracted JSON-LD data');
      return { raw: jsonLdData, source: 'zillow-jsonld', zillowUrl: finalUrl };
    }

    // Try __NEXT_DATA__
    const nextData = extractNextData(html);
    if (nextData && Object.keys(nextData).length > 2) {
      console.log('[Zillow] Extracted __NEXT_DATA__');
      return { raw: nextData, source: 'zillow-nextdata', zillowUrl: finalUrl };
    }

    // Try inline JSON patterns (Zillow sometimes embeds data differently)
    const inlineData = extractInlineJson(html);
    if (inlineData && Object.keys(inlineData).length > 2) {
      console.log('[Zillow] Extracted inline JSON data');
      return { raw: inlineData, source: 'zillow-inline', zillowUrl: finalUrl };
    }

    console.log('[Zillow] Direct fetch got HTML but no extractable data');
    return null;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('[Zillow] Direct fetch timed out');
    } else {
      console.log('[Zillow] Direct fetch failed:', err.message);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractJsonLd(html) {
  // Find all JSON-LD script blocks
  const regex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      // Look for SingleFamilyResidence or Product with property data
      if (data['@type'] === 'SingleFamilyResidence' || data['@type'] === 'Residence') {
        return normalizeJsonLdData(data);
      }
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item['@type'] === 'SingleFamilyResidence' || item['@type'] === 'Residence') {
            return normalizeJsonLdData(item);
          }
        }
      }
    } catch (e) {
      // skip invalid JSON-LD blocks
    }
  }
  return null;
}

function normalizeJsonLdData(ld) {
  // JSON-LD uses schema.org properties – normalize to flat keys we can map
  return {
    bedrooms: ld.numberOfRooms || ld.numberOfBedrooms,
    bathrooms: ld.numberOfBathroomsTotal || ld.numberOfFullBathrooms,
    yearBuilt: ld.yearBuilt,
    livingArea: ld.floorSize?.value || ld.floorSize,
    // JSON-LD may not have detailed features – return what's there
    ...ld,
  };
}

function extractNextData(html) {
  // __NEXT_DATA__ is embedded as a script tag by Next.js apps (Zillow uses Next.js)
  const regex = /<script\s+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i;
  const match = html.match(regex);
  if (!match) return null;

  try {
    const nextData = JSON.parse(match[1]);
    // Navigate to property data — Zillow nests it in props.pageProps.componentProps or similar
    const props = nextData?.props?.pageProps;
    if (!props) return null;

    // Try common Zillow data paths
    const property = props.property || props.initialReduxState?.gdp?.building ||
                     props.componentProps?.gdpClientCache;

    if (property) {
      return flattenZillowProperty(property);
    }

    // Look for resoFacts in any nested structure
    const str = JSON.stringify(props);
    const resoMatch = str.match(/"resoFacts"\s*:\s*(\{[^}]+(?:\{[^}]*\}[^}]*)*\})/);
    if (resoMatch) {
      try { return JSON.parse(resoMatch[1]); } catch (e) { /* skip */ }
    }

    return null;
  } catch (e) {
    return null;
  }
}

function extractInlineJson(html) {
  // Look for Zillow property data in inline scripts — various patterns
  const patterns = [
    /window\.__PRELOADED_STATE__\s*=\s*({[\s\S]*?});\s*<\/script>/,
    /"buildingAttributes"\s*:\s*(\{[\s\S]*?\})\s*[,}]/,
    /"resoFacts"\s*:\s*(\{[\s\S]*?\})\s*[,}]/,
    /"homeFacts"\s*:\s*(\{[\s\S]*?\})\s*[,}]/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        if (data && typeof data === 'object') return data;
      } catch (e) {
        // try to salvage partial JSON
      }
    }
  }

  // Fallback: scrape visible text for key facts
  return scrapeFactsFromHtml(html);
}

function scrapeFactsFromHtml(html) {
  // Parse text-based facts from the HTML even without React data
  const facts = {};

  const factPatterns = [
    { regex: /Heating[:\s]*([^<,]+)/i, key: 'heating' },
    { regex: /Cooling[:\s]*([^<,]+)/i, key: 'cooling' },
    { regex: /Roof[:\s]*([^<,]+)/i, key: 'roof' },
    { regex: /Foundation[:\s]*([^<,]+)/i, key: 'foundation' },
    { regex: /Basement[:\s]*([^<,]+)/i, key: 'basement' },
    { regex: /Construction[:\s]*([^<,]+)/i, key: 'constructionMaterials' },
    { regex: /Exterior[:\s]*([^<,]+)/i, key: 'exteriorFeatures' },
    { regex: /Year\s*built[:\s]*(\d{4})/i, key: 'yearBuilt' },
    { regex: /Bedrooms[:\s]*(\d+)/i, key: 'bedrooms' },
    { regex: /Full\s*bathrooms[:\s]*(\d+)/i, key: 'bathrooms' },
    { regex: /Garage\s*spaces?[:\s]*(\d+)/i, key: 'garageSpaces' },
    { regex: /Fireplaces?[:\s]*(\d+|Yes)/i, key: 'fireplaces' },
    { regex: /Stories[:\s]*(\d+)/i, key: 'stories' },
    { regex: /Living\s*area[:\s]*([\d,]+)/i, key: 'livingArea' },
  ];

  for (const { regex, key } of factPatterns) {
    const match = html.match(regex);
    if (match) {
      facts[key] = match[1].trim();
    }
  }

  return Object.keys(facts).length > 0 ? facts : null;
}

function flattenZillowProperty(prop) {
  // Flatten nested Zillow property object into a simple key-value map
  if (!prop || typeof prop !== 'object') return {};

  const flat = {};
  const resoFacts = prop.resoFacts || prop.facts || {};
  const homeFacts = prop.homeFacts || {};

  // Merge all fact sources
  const allFacts = { ...prop, ...resoFacts, ...homeFacts };

  // Copy relevant keys
  const keys = [
    'heating', 'heatingFeatures', 'cooling', 'coolingFeatures',
    'roof', 'roofType', 'roofing',
    'foundation', 'foundationDetails', 'basement',
    'constructionMaterials', 'construction',
    'exteriorFeatures', 'exterior', 'siding',
    'garageSpaces', 'parkingFeatures',
    'bedrooms', 'beds', 'bathrooms', 'bathroomsFull', 'fullBathrooms',
    'yearBuilt', 'year_built',
    'stories', 'levels',
    'livingArea', 'totalSqft', 'finishedSqFt',
    'fireplaces', 'fireplace', 'fireplaceFeatures',
  ];

  for (const key of keys) {
    if (allFacts[key] != null) flat[key] = allFacts[key];
  }

  return flat;
}

// ---------------------------------------------------------------------------
// Layer B: Playwright fallback
// ---------------------------------------------------------------------------

async function fetchZillowPlaywright(url) {
  let browser = null;
  try {
    // Dynamic Playwright import (same pattern as headless-browser.js)
    let playwright;
    try {
      playwright = await import('playwright');
    } catch (e) {
      try {
        playwright = await import('playwright-core');
      } catch (e2) {
        console.log('[Zillow] Playwright not available, skipping Layer B');
        return null;
      }
    }

    browser = await playwright.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();

    // Navigate with a generous timeout
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Wait a bit for React to hydrate
    await page.waitForTimeout(2000);

    // Try to extract __NEXT_DATA__ from the page context
    const nextData = await page.evaluate(() => {
      try {
        const el = document.getElementById('__NEXT_DATA__');
        if (el) return JSON.parse(el.textContent);
      } catch (e) { /* skip */ }
      return null;
    });

    if (nextData?.props?.pageProps) {
      const property = nextData.props.pageProps.property ||
                       nextData.props.pageProps.initialReduxState?.gdp?.building;
      if (property) {
        return { raw: flattenZillowProperty(property), source: 'zillow-playwright', zillowUrl: page.url() };
      }
    }

    // Fallback: scrape text from Facts & Features section
    const facts = await page.evaluate(() => {
      const result = {};
      // Try data-testid selectors (Zillow uses these)
      const factGroups = document.querySelectorAll('[data-testid="fact-category"], .fact-group, .home-facts-group');
      factGroups.forEach(group => {
        const items = group.querySelectorAll('.fact-value, .fact-label, dt, dd, li');
        items.forEach(item => {
          const text = item.textContent.trim();
          if (text.includes(':')) {
            const [label, ...rest] = text.split(':');
            result[label.trim().toLowerCase()] = rest.join(':').trim();
          }
        });
      });

      // Also try generic text extraction
      const allText = document.body.innerText;
      const patterns = [
        { regex: /Heating[:\s]+([^\n]+)/i, key: 'heating' },
        { regex: /Cooling[:\s]+([^\n]+)/i, key: 'cooling' },
        { regex: /Roof[:\s]+([^\n]+)/i, key: 'roof' },
        { regex: /Foundation[:\s]+([^\n]+)/i, key: 'foundation' },
        { regex: /Basement[:\s]+([^\n]+)/i, key: 'basement' },
        { regex: /Year\s*built[:\s]+(\d{4})/i, key: 'yearBuilt' },
        { regex: /Bedrooms[:\s]+(\d+)/i, key: 'bedrooms' },
      ];
      patterns.forEach(({ regex, key }) => {
        const m = allText.match(regex);
        if (m) result[key] = m[1].trim();
      });

      return result;
    });

    if (facts && Object.keys(facts).length > 0) {
      return { raw: facts, source: 'zillow-playwright', zillowUrl: page.url() };
    }

    console.log('[Zillow] Playwright found no extractable data');
    return null;
  } catch (err) {
    console.log('[Zillow] Playwright error:', err.message);
    return null;
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) { /* ignore */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { address, city, state, zip } = req.query;

  if (!address || !city || !state) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters: address, city, state',
    });
  }

  console.log(`[Zillow] Extracting data for: ${address}, ${city}, ${state} ${zip || ''}`);
  const startTime = Date.now();

  try {
    const searchUrl = buildZillowSearchUrl(address, city, state, zip || '');
    console.log(`[Zillow] Search URL: ${searchUrl}`);

    // Layer A: Direct fetch
    let result = await fetchZillowDirect(searchUrl);

    // Layer B: Playwright fallback
    if (!result) {
      console.log('[Zillow] Layer A failed, trying Playwright...');
      result = await fetchZillowPlaywright(searchUrl);
    }

    if (!result || !result.raw) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[Zillow] No data found (${elapsed}s)`);
      return res.status(200).json({
        success: false,
        error: 'No property data found on Zillow for this address',
        searchUrl,
        elapsedSeconds: parseFloat(elapsed),
      });
    }

    // Map raw Zillow data to Altech form values
    const { data, fieldsFound } = mapZillowToAltech(result.raw);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Zillow] Success: ${fieldsFound.length} fields mapped (${elapsed}s) via ${result.source}`);
    console.log(`[Zillow] Fields found: ${fieldsFound.join(', ')}`);

    return res.status(200).json({
      success: true,
      source: result.source,
      zillowUrl: result.zillowUrl,
      data,
      fieldsFound,
      elapsedSeconds: parseFloat(elapsed),
    });
  } catch (error) {
    console.error('[Zillow] Error:', error);
    return res.status(200).json({
      success: false,
      error: error.message || 'Unknown error',
    });
  }
}
