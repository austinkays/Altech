/**
 * Zillow Property Data Extractor
 * Vercel Serverless Function
 *
 * Fetches detailed home attributes (Roof, Heating, Foundation, etc.)
 * from Zillow's Facts & Features for a given address.
 *
 * Three-layer approach:
 *   Layer A: Zillow Autocomplete API (CDN) → get zpid → canonical property page
 *   Layer B: Zillow Search API (GetSearchPageState.htm) → JSON response
 *   Layer C: Direct fetch of search URL → parse JSON-LD / __NEXT_DATA__ (original)
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
// Common browser headers for Zillow requests
// ---------------------------------------------------------------------------

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
};

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

function buildSlug(address, city, state, zip) {
  return `${address} ${city} ${state} ${zip}`
    .toLowerCase()
    .replace(/#\d+/g, '')
    .replace(/apt\.?\s*\d+/gi, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildZillowSearchUrl(address, city, state, zip) {
  return `https://www.zillow.com/homes/${buildSlug(address, city, state, zip)}_rb/`;
}

// ---------------------------------------------------------------------------
// Fuzzy map lookup — finds the best match from a mapping table
// ---------------------------------------------------------------------------

function fuzzyMapLookup(rawValue, map) {
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

  const heatingRaw = raw.heating || raw.heatingFeatures || raw.heatingType || '';
  const heatingVal = fuzzyMapLookup(
    Array.isArray(heatingRaw) ? heatingRaw.join(' ') : heatingRaw,
    HEATING_MAP
  );
  if (heatingVal) { mapped.heatingType = heatingVal; fieldsFound.push('heatingType'); }

  const coolingRaw = raw.cooling || raw.coolingFeatures || raw.coolingType || '';
  const coolingVal = fuzzyMapLookup(
    Array.isArray(coolingRaw) ? coolingRaw.join(' ') : coolingRaw,
    COOLING_MAP
  );
  if (coolingVal) { mapped.cooling = coolingVal; fieldsFound.push('cooling'); }

  const roofRaw = raw.roof || raw.roofType || raw.roofing || '';
  const roofVal = fuzzyMapLookup(
    Array.isArray(roofRaw) ? roofRaw.join(' ') : roofRaw,
    ROOF_MAP
  );
  if (roofVal) { mapped.roofType = roofVal; fieldsFound.push('roofType'); }

  const foundRaw = raw.foundation || raw.foundationDetails || raw.basement || '';
  const foundVal = fuzzyMapLookup(
    Array.isArray(foundRaw) ? foundRaw.join(' ') : foundRaw,
    FOUNDATION_MAP
  );
  if (foundVal) { mapped.foundation = foundVal; fieldsFound.push('foundation'); }

  const constRaw = raw.constructionMaterials || raw.construction || raw.buildingStyle || '';
  const constVal = fuzzyMapLookup(
    Array.isArray(constRaw) ? constRaw.join(' ') : constRaw,
    CONSTRUCTION_MAP
  );
  if (constVal) { mapped.constructionStyle = constVal; fieldsFound.push('constructionStyle'); }

  const extRaw = raw.exteriorFeatures || raw.exterior || raw.siding || '';
  const extVal = fuzzyMapLookup(
    Array.isArray(extRaw) ? extRaw.join(' ') : extRaw,
    EXTERIOR_MAP
  );
  if (extVal) { mapped.exteriorWalls = extVal; fieldsFound.push('exteriorWalls'); }

  const garageRaw = raw.garageSpaces || raw.parkingFeatures || raw.garage || '';
  const garageNum = parseNum(Array.isArray(garageRaw) ? garageRaw.join(' ') : garageRaw);
  if (garageNum && garageNum > 0 && garageNum <= 10) {
    mapped.garageSpaces = garageNum;
    fieldsFound.push('garageSpaces');
  }

  const beds = parseNum(raw.bedrooms || raw.beds);
  if (beds && beds > 0) { mapped.bedrooms = beds; fieldsFound.push('bedrooms'); }

  const baths = parseNum(raw.bathrooms || raw.fullBathrooms || raw.bathroomsFull);
  if (baths && baths > 0) { mapped.fullBaths = baths; fieldsFound.push('fullBaths'); }

  const yr = parseNum(raw.yearBuilt || raw.year_built);
  if (yr && yr > 1800 && yr <= new Date().getFullYear()) {
    mapped.yrBuilt = String(yr);
    mapped.yearBuilt = yr;
    fieldsFound.push('yrBuilt');
  }

  const stories = parseNum(raw.stories || raw.levels);
  if (stories && stories > 0 && stories <= 10) {
    mapped.stories = stories;
    fieldsFound.push('stories');
  }

  const sqft = parseNum(raw.livingArea || raw.totalSqft || raw.finishedSqFt);
  if (sqft && sqft > 0) { mapped.totalSqft = sqft; fieldsFound.push('totalSqft'); }

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
// HTML extraction helpers (shared across all layers)
// ---------------------------------------------------------------------------

function tryExtractFromHtml(html, finalUrl, diag) {
  const attempts = [];

  const jsonLdData = extractJsonLd(html);
  if (jsonLdData && Object.keys(jsonLdData).length > 2) {
    attempts.push('jsonld:true');
    diag.extractionAttempts = attempts;
    return { raw: jsonLdData, source: 'zillow-jsonld', zillowUrl: finalUrl };
  }
  attempts.push('jsonld:false');

  const nextData = extractNextData(html);
  if (nextData && Object.keys(nextData).length > 2) {
    attempts.push('nextdata:true');
    diag.extractionAttempts = attempts;
    return { raw: nextData, source: 'zillow-nextdata', zillowUrl: finalUrl };
  }
  attempts.push('nextdata:false');

  const inlineData = extractInlineJson(html);
  if (inlineData && Object.keys(inlineData).length > 2) {
    attempts.push('inline:true');
    diag.extractionAttempts = attempts;
    return { raw: inlineData, source: 'zillow-inline', zillowUrl: finalUrl };
  }
  attempts.push('inline:false');

  diag.extractionAttempts = attempts;
  return null;
}

function extractJsonLd(html) {
  const regex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
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
      // skip invalid JSON-LD
    }
  }
  return null;
}

function normalizeJsonLdData(ld) {
  return {
    bedrooms: ld.numberOfRooms || ld.numberOfBedrooms,
    bathrooms: ld.numberOfBathroomsTotal || ld.numberOfFullBathrooms,
    yearBuilt: ld.yearBuilt,
    livingArea: ld.floorSize?.value || ld.floorSize,
    ...ld,
  };
}

function extractNextData(html) {
  const regex = /<script\s+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i;
  const match = html.match(regex);
  if (!match) return null;

  try {
    const nextData = JSON.parse(match[1]);
    const props = nextData?.props?.pageProps;
    if (!props) return null;

    const property = props.property || props.initialReduxState?.gdp?.building ||
                     props.componentProps?.gdpClientCache;

    if (property) {
      return flattenZillowProperty(property);
    }

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
        // skip
      }
    }
  }

  return scrapeFactsFromHtml(html);
}

function scrapeFactsFromHtml(html) {
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
  if (!prop || typeof prop !== 'object') return {};

  const flat = {};
  const resoFacts = prop.resoFacts || prop.facts || {};
  const homeFacts = prop.homeFacts || {};
  const allFacts = { ...prop, ...resoFacts, ...homeFacts };

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
// Layer A: Zillow Autocomplete API → Canonical Property Page
// Uses zillowstatic.com CDN (less bot detection than zillow.com)
// ---------------------------------------------------------------------------

async function fetchZillowViaAutocomplete(address, city, state, zip, diag) {
  const query = `${address}, ${city}, ${state} ${zip}`.trim();
  const acUrl = `https://www.zillowstatic.com/autocomplete/v3/suggestions?q=${encodeURIComponent(query)}&resultTypes=allAddress&resultCount=1`;

  console.log(`[Zillow] Layer A: Autocomplete → ${acUrl}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const resp = await fetch(acUrl, {
      signal: controller.signal,
      headers: {
        ...BROWSER_HEADERS,
        'Accept': 'application/json',
        'Referer': 'https://www.zillow.com/',
        'Origin': 'https://www.zillow.com',
      },
    });

    diag.autocompleteStatus = resp.status;

    if (!resp.ok) {
      console.log(`[Zillow] Autocomplete HTTP ${resp.status}`);
      return null;
    }

    const acData = await resp.json();
    console.log(`[Zillow] Autocomplete response: ${JSON.stringify(acData).substring(0, 500)}`);

    // Extract zpid from results
    const results = acData?.results || [];
    let zpid = null;

    for (const r of results) {
      if (r.metaData?.zpid) {
        zpid = r.metaData.zpid;
        break;
      }
    }

    diag.autocompleteFound = !!zpid;
    diag.zpid = zpid;

    if (!zpid) {
      console.log('[Zillow] No zpid in autocomplete results');
      return null;
    }

    // Build canonical property URL using zpid
    const slug = buildSlug(address, city, state, zip);
    const propertyUrl = `https://www.zillow.com/homedetails/${slug}/${zpid}_zpid/`;
    console.log(`[Zillow] Property URL: ${propertyUrl}`);

    // Fetch the canonical property page
    const controller2 = new AbortController();
    const timeout2 = setTimeout(() => controller2.abort(), 8000);

    try {
      const pageResp = await fetch(propertyUrl, {
        signal: controller2.signal,
        headers: {
          ...BROWSER_HEADERS,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
        },
        redirect: 'follow',
      });

      diag.propertyPageStatus = pageResp.status;

      if (!pageResp.ok) {
        console.log(`[Zillow] Property page HTTP ${pageResp.status}`);
        return null;
      }

      const html = await pageResp.text();
      diag.propertyPageLength = html.length;
      diag.propertyPagePreview = html.substring(0, 200).replace(/\n/g, ' ');
      console.log(`[Zillow] Property page: ${html.length} chars`);

      return tryExtractFromHtml(html, pageResp.url || propertyUrl, diag);
    } finally {
      clearTimeout(timeout2);
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      diag.autocompleteError = 'timeout';
    } else {
      diag.autocompleteError = err.message;
    }
    console.log(`[Zillow] Layer A error: ${diag.autocompleteError}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Layer B: Zillow Search API (GetSearchPageState.htm)
// JSON endpoint that powers Zillow's frontend search
// ---------------------------------------------------------------------------

async function fetchZillowSearchAPI(address, city, state, zip, diag) {
  const searchTerm = `${address}, ${city}, ${state} ${zip}`.trim();
  const searchQueryState = JSON.stringify({
    usersSearchTerm: searchTerm,
    mapBounds: { west: -180, east: 180, south: -90, north: 90 },
    filterState: {},
    isListVisible: true,
    isMapVisible: false,
  });

  const wants = JSON.stringify({ cat1: ['listResults'] });
  const searchUrl = `https://www.zillow.com/search/GetSearchPageState.htm?searchQueryState=${encodeURIComponent(searchQueryState)}&wants=${encodeURIComponent(wants)}&requestId=1`;

  console.log(`[Zillow] Layer B: Search API`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const resp = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        ...BROWSER_HEADERS,
        'Accept': '*/*',
        'Referer': 'https://www.zillow.com/',
        'Origin': 'https://www.zillow.com',
      },
    });

    diag.searchApiStatus = resp.status;

    if (!resp.ok) {
      console.log(`[Zillow] Search API HTTP ${resp.status}`);
      return null;
    }

    const text = await resp.text();
    diag.searchApiLength = text.length;
    console.log(`[Zillow] Search API: ${text.length} chars, preview: ${text.substring(0, 300)}`);

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.log('[Zillow] Search API response not valid JSON');
      diag.searchApiJsonError = true;
      return null;
    }

    // Extract property data from search results
    const listResults = data?.cat1?.searchResults?.listResults ||
                       data?.searchResults?.listResults || [];

    if (listResults.length === 0) {
      console.log('[Zillow] Search API: no results');
      diag.searchApiResults = 0;
      return null;
    }

    diag.searchApiResults = listResults.length;
    const first = listResults[0];
    console.log(`[Zillow] Search API first result keys: ${Object.keys(first).join(', ')}`);

    // Extract property data from the search result
    const info = first.hdpData?.homeInfo || {};
    const raw = {};

    // Basic fields from search result
    if (first.beds != null) raw.bedrooms = first.beds;
    if (first.baths != null) raw.bathrooms = first.baths;
    if (first.area != null) raw.livingArea = first.area;

    // Deeper fields from hdpData.homeInfo
    if (info.yearBuilt) raw.yearBuilt = info.yearBuilt;
    if (info.bedrooms) raw.bedrooms = info.bedrooms;
    if (info.bathrooms) raw.bathrooms = info.bathrooms;
    if (info.livingArea) raw.livingArea = info.livingArea;
    if (info.homeType) raw.homeType = info.homeType;

    const nonNullKeys = Object.keys(raw).filter(k => raw[k] != null);
    console.log(`[Zillow] Search API extracted ${nonNullKeys.length} fields: ${nonNullKeys.join(', ')}`);

    if (nonNullKeys.length > 1) {
      const detailUrl = first.detailUrl
        ? (first.detailUrl.startsWith('http') ? first.detailUrl : `https://www.zillow.com${first.detailUrl}`)
        : null;

      return {
        raw,
        source: 'zillow-searchapi',
        zillowUrl: detailUrl,
      };
    }

    // If we got a detail URL but not enough data, try fetching the detail page
    if (first.detailUrl) {
      const detailUrl = first.detailUrl.startsWith('http')
        ? first.detailUrl
        : `https://www.zillow.com${first.detailUrl}`;
      console.log(`[Zillow] Trying detail page: ${detailUrl}`);

      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), 8000);
      try {
        const pageResp = await fetch(detailUrl, {
          signal: controller2.signal,
          headers: {
            ...BROWSER_HEADERS,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
          },
          redirect: 'follow',
        });

        diag.detailPageStatus = pageResp.status;

        if (pageResp.ok) {
          const html = await pageResp.text();
          diag.detailPageLength = html.length;
          return tryExtractFromHtml(html, pageResp.url || detailUrl, diag);
        }
      } finally {
        clearTimeout(timeout2);
      }
    }

    return null;
  } catch (err) {
    if (err.name === 'AbortError') {
      diag.searchApiError = 'timeout';
    } else {
      diag.searchApiError = err.message;
    }
    console.log(`[Zillow] Layer B error: ${diag.searchApiError}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Layer C: Direct fetch of search URL (original approach, kept as fallback)
// ---------------------------------------------------------------------------

async function fetchZillowDirect(url, diag) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        ...BROWSER_HEADERS,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
    });

    diag.directFetchStatus = resp.status;

    if (!resp.ok) {
      console.log(`[Zillow] Direct fetch HTTP ${resp.status}`);
      return null;
    }

    const html = await resp.text();
    diag.directFetchLength = html.length;
    diag.directFetchPreview = html.substring(0, 200).replace(/\n/g, ' ');
    console.log(`[Zillow] Direct fetch: ${html.length} chars`);

    return tryExtractFromHtml(html, resp.url || url, diag);
  } catch (err) {
    if (err.name === 'AbortError') {
      diag.directFetchError = 'timeout';
    } else {
      diag.directFetchError = err.message;
    }
    console.log(`[Zillow] Layer C error: ${diag.directFetchError}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
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

  console.log(`[Zillow] ===== Extracting: ${address}, ${city}, ${state} ${zip || ''} =====`);
  const startTime = Date.now();
  const diag = {};

  try {
    let result = null;

    // Layer A: Autocomplete API → canonical property page
    console.log('[Zillow] --- Layer A: Autocomplete + Property Page ---');
    result = await fetchZillowViaAutocomplete(address, city, state, zip || '', diag);

    // Layer B: Search API (JSON)
    if (!result) {
      console.log('[Zillow] --- Layer B: Search API ---');
      result = await fetchZillowSearchAPI(address, city, state, zip || '', diag);
    }

    // Layer C: Direct fetch (original approach)
    if (!result) {
      console.log('[Zillow] --- Layer C: Direct Fetch ---');
      const searchUrl = buildZillowSearchUrl(address, city, state, zip || '');
      console.log(`[Zillow] Search URL: ${searchUrl}`);
      result = await fetchZillowDirect(searchUrl, diag);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    if (!result || !result.raw) {
      console.log(`[Zillow] No data found (${elapsed}s). Diagnostics:`, JSON.stringify(diag));
      return res.status(200).json({
        success: false,
        error: 'No property data found on Zillow for this address',
        diagnostics: diag,
        elapsedSeconds: parseFloat(elapsed),
      });
    }

    const { data, fieldsFound } = mapZillowToAltech(result.raw);

    console.log(`[Zillow] Success: ${fieldsFound.length} fields via ${result.source} (${elapsed}s)`);
    console.log(`[Zillow] Fields: ${fieldsFound.join(', ')}`);

    return res.status(200).json({
      success: true,
      source: result.source,
      zillowUrl: result.zillowUrl,
      data,
      fieldsFound,
      diagnostics: diag,
      elapsedSeconds: parseFloat(elapsed),
    });
  } catch (error) {
    console.error('[Zillow] Error:', error);
    return res.status(200).json({
      success: false,
      error: error.message || 'Unknown error',
      diagnostics: diag,
    });
  }
}
