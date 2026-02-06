/**
 * Property Intelligence - Unified Property Data Endpoint
 * Combines: ArcGIS County Data, Satellite Analysis, Zillow Extraction
 *
 * Usage: POST /api/property-intelligence?mode=arcgis|satellite|zillow
 * Body: JSON with { address, city, state, zip?, county? }
 */

// ===========================================================================
// SECTION 1: ArcGIS County Parcel Data
// ===========================================================================

const COUNTY_ARCGIS_CONFIG = {
  'Clark': {
    state: 'WA',
    baseUrl: 'https://services.arcgis.com/jsIt88o09Q0r1j8h/arcgis/rest/services/Current_Parcels/FeatureServer',
    queryService: 0,
    fields: ['OBJECTID', 'PARCEL_ID_NR', 'ORIG_PARCEL_ID', 'COUNTY_NM', 'SITUS_ADDRESS', 'SUB_ADDRESS', 'SITUS_CITY_NM', 'SITUS_ZIP_NR', 'LANDUSE_CD', 'VALUE_LAND', 'VALUE_BLDG', 'DATA_LINK'],
    searchField: 'PARCEL_ID_NR'
  },
  'King': {
    state: 'WA',
    baseUrl: 'https://gis.kingcounty.gov/arcgis/rest/services/iMap_external/Parcels/MapServer',
    queryService: 0,
    fields: ['OBJECTID', 'PARCEL_NUMBER_ALTERNATE', 'PARCEL_NUMBER_PREVIOUS', 'OWNER_NAME', 'USE1_DESC', 'SQFT_GROSS', 'YEAR_BUILT', 'BASEMENT_SQFT', 'GARAGE_SQFT'],
    searchField: 'PARCEL_NUMBER_ALTERNATE'
  },
  'Pierce': {
    state: 'WA',
    baseUrl: 'https://gis.piercecountywa.gov/arcgis/rest/services/Public/Parcels/MapServer',
    queryService: 0,
    fields: ['OBJECTID', 'PARCELID', 'OWNER_NAME', 'YEAR_BUILT', 'TOT_SQFT', 'GARAGE_SQFT', 'STORIES', 'ROOF_TYPE'],
    searchField: 'PARCELID'
  },
  'Multnomah': {
    state: 'OR',
    baseUrl: 'https://www.portlandmaps.com/arcgis/rest/services/Public/Taxlots/MapServer',
    queryService: 0,
    fields: ['OBJECTID', 'STATE_ID', 'OWNER1', 'OWNER2', 'OWNER3', 'SITEADDR', 'SITECITY', 'SITEZIP', 'YEARBUILT', 'BLDGSQFT', 'BEDROOMS', 'FLOORS', 'LANDUSE', 'PRPCD_DESC', 'A_T_ACRES', 'TOTALVAL1', 'COUNTY'],
    searchField: 'STATE_ID'
  },
  'Snohomish': {
    state: 'WA',
    baseUrl: 'https://gis.snoco.org/arcgis/rest/services/Landbase/Parcels/MapServer',
    queryService: 0,
    fields: ['OBJECTID', 'PARCEL_ID', 'OWNER_NAME', 'SITE_ADDR', 'YEAR_BUILT', 'BLDG_SQFT', 'BEDROOMS', 'BATHS', 'GARAGE', 'STORIES', 'ROOF_TYPE', 'FOUNDATION'],
    searchField: 'PARCEL_ID'
  },
  'Spokane': {
    state: 'WA',
    baseUrl: 'https://gismo.spokanecounty.org/arcgis/rest/services/SCOUT/PropertyLookup/MapServer',
    queryService: 0,
    fields: ['OBJECTID', 'PID_NUM', 'site_address', 'site_city', 'owner_name', 'prop_use_desc', 'acreage', 'InspectionYear'],
    searchField: 'PID_NUM'
  },
  'Washington': {
    state: 'OR',
    baseUrl: 'https://services2.arcgis.com/McQ0OlIABe29rJJy/arcgis/rest/services/Taxlots_(Public)/FeatureServer',
    queryService: 3,
    fields: ['OBJECTID', 'TLID', 'PRIMACCNUM', 'SITEADDR', 'SITECITY', 'BLDGSQFT', 'A_T_ACRES', 'YEARBUILT', 'LANDUSE', 'ASSESSVAL'],
    searchField: 'TLID'
  }
};

const STATE_AGGREGATORS = {
  'WA': {
    name: 'Washington State Current Parcels',
    baseUrl: 'https://services.arcgis.com/jsIt88o09Q0r1j8h/arcgis/rest/services/Current_Parcels/FeatureServer',
    queryService: 0,
    fields: ['OBJECTID', 'PARCEL_ID_NR', 'ORIG_PARCEL_ID', 'COUNTY_NM', 'SITUS_ADDRESS', 'SUB_ADDRESS', 'SITUS_CITY_NM', 'SITUS_ZIP_NR', 'LANDUSE_CD', 'VALUE_LAND', 'VALUE_BLDG', 'DATA_LINK'],
    searchField: 'PARCEL_ID_NR',
    coverage: 39
  },
  'OR': {
    name: 'Oregon ORMAP Tax Lots',
    baseUrl: 'https://gis.odf.oregon.gov/ags1/rest/services/WebMercator/TaxlotsDisplay/MapServer',
    queryService: 0,
    fields: ['OBJECTID', 'TAXLOT', 'COUNTY', 'TOWNSHIP', 'RANGE', 'SECTION', 'MAP_TAXLOT'],
    searchField: 'TAXLOT',
    coverage: 36
  },
  'AZ': {
    name: 'Arizona Counties',
    baseUrl: 'https://azgeo.az.gov/arcgis/rest/services/asld/Counties/MapServer',
    queryService: 0,
    fields: ['OBJECTID', 'COUNTY_NAME', 'FIPS_CODE', 'AREA_SQ_MI'],
    searchField: 'COUNTY_NAME',
    coverage: 15
  }
};

const COUNTY_TO_STATE = {
  'Thurston': 'WA', 'Whatcom': 'WA', 'Yakima': 'WA', 'Kitsap': 'WA', 'Cowlitz': 'WA',
  'Skagit': 'WA', 'Benton': 'WA', 'Franklin': 'WA', 'Walla Walla': 'WA', 'Chelan': 'WA',
  'Clackamas': 'OR', 'Lane': 'OR', 'Marion': 'OR', 'Deschutes': 'OR', 'Jackson': 'OR',
  'Linn': 'OR', 'Douglas': 'OR', 'Yamhill': 'OR', 'Polk': 'OR', 'Josephine': 'OR',
  'Maricopa': 'AZ', 'Pima': 'AZ', 'Pinal': 'AZ', 'Yavapai': 'AZ', 'Coconino': 'AZ',
  'Mohave': 'AZ', 'Yuma': 'AZ', 'Apache': 'AZ', 'Navajo': 'AZ', 'Cochise': 'AZ'
};

async function arcgisQueryByLocation(latitude, longitude, countyName, state) {
  console.log(`[ArcGIS] Querying parcel at ${latitude}, ${longitude} in ${countyName} County, ${state}`);

  const countyConfig = COUNTY_ARCGIS_CONFIG[countyName];
  if (countyConfig) {
    console.log(`[ArcGIS] Trying individual county API for ${countyName}`);
    const result = await arcgisQueryEndpoint(latitude, longitude, countyConfig, countyName);
    if (result.success) return result;
  }

  const stateCode = state || COUNTY_TO_STATE[countyName];
  if (stateCode && STATE_AGGREGATORS[stateCode]) {
    const stateConfig = STATE_AGGREGATORS[stateCode];
    console.log(`[ArcGIS] Trying state aggregator for ${stateCode}`);
    const result = await arcgisQueryEndpoint(latitude, longitude, stateConfig, countyName);
    if (result.success) {
      result.source = `${stateConfig.name} (State Aggregator)`;
      return result;
    }
  }

  return { success: false, error: 'County not configured for API access', county: countyName };
}

async function arcgisQueryEndpoint(latitude, longitude, config, countyName) {
  if (!config) return { success: false, error: 'No configuration provided' };

  try {
    const url = `${config.baseUrl}/${config.queryService}/query`;
    const params = new URLSearchParams({
      geometry: JSON.stringify({ x: longitude, y: latitude, spatialReference: { wkid: 4326 } }),
      geometryType: 'esriGeometryPoint',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: config.fields.join(','),
      returnGeometry: true,
      f: 'json'
    });

    const fullUrl = `${url}?${params}`;
    console.log(`[ArcGIS] Querying: ${fullUrl.substring(0, 200)}...`);

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, county: countyName };
    }

    const data = await response.json();

    if (data.error) {
      return { success: false, error: data.error.message, county: countyName };
    }

    if (!data.features || data.features.length === 0) {
      return { success: false, error: 'No parcel found at location', county: countyName };
    }

    const parcel = data.features[0];
    const normalized = normalizeParcelData(parcel, countyName);

    return {
      success: true,
      county: countyName,
      parcelData: normalized,
      rawResponse: parcel.attributes
    };
  } catch (error) {
    return { success: false, error: error.message, county: countyName };
  }
}

async function arcgisQueryByAddress(address, city, state, countyName) {
  try {
    const googleApiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
    if (!googleApiKey) {
      return { success: false, error: 'Google API key not configured' };
    }

    const fullAddress = `${address}, ${city}, ${state}`;
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${googleApiKey}`;

    const geocodeResponse = await fetch(geocodeUrl);
    const geocodeData = await geocodeResponse.json();

    if (geocodeData.results.length === 0) {
      return { success: false, error: 'Address not found', address: fullAddress };
    }

    const location = geocodeData.results[0].geometry.location;
    return await arcgisQueryByLocation(location.lat, location.lng, countyName, state);
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function normalizeParcelData(parcel, countyName) {
  const attrs = parcel.attributes || {};
  const geometry = parcel.geometry || {};

  return {
    countyName,
    parcelId: attrs.STATE_ID || attrs.PARCEL_ID_NR || attrs.ORIG_PARCEL_ID || attrs.PARCEL_NUMBER || attrs.PARCELID || attrs.ACCOUNT_NUMBER || attrs.PARCEL_NUMBER_ALTERNATE || attrs.PARCEL_ID || attrs.PID_NUM || attrs.TLID || attrs.TAXLOT || attrs.MAP_TAXLOT || 'N/A',
    ownerName: (() => {
      if (attrs.OWNER1 || attrs.OWNER2 || attrs.OWNER3) {
        return [attrs.OWNER1, attrs.OWNER2, attrs.OWNER3].filter(Boolean).join(', ');
      }
      return attrs.OWNER_NAME || attrs.owner_name || 'N/A';
    })(),
    landUse: attrs.LAND_USE_CODE || attrs.USE1_DESC || attrs.LAND_USE_STANDARD || attrs.PRPCD_DESC || attrs.prop_use_desc || attrs.LANDUSE || attrs.LAND_USE || attrs.LANDUSE_CD || 'N/A',
    lotSizeAcres: parseFloat(attrs.TOTAL_LAND_AREA_ACRES || attrs.LOT_SIZE_ACRES || attrs.acreage || attrs.A_T_ACRES || attrs.LOT_ACRES || 0) || 0,
    yearBuilt: parseInt(attrs.YEAR_BUILT || attrs.YEARBUILT || attrs.InspectionYear || attrs.YR_BUILT || 0) || 0,
    basementSqft: parseFloat(attrs.BASEMENT_AREA || attrs.BASEMENT_SQFT || 0) || 0,
    mainFloorSqft: parseFloat(attrs.MAIN_FLOOR_AREA || attrs.UPPER_FLOOR_AREA || 0) || 0,
    totalSqft: parseFloat(attrs.TOT_SQFT || attrs.TOTAL_LIVING_AREA || attrs.BLDG_SQFT || attrs.BLDGSQFT || attrs.TOTAL_SQ_FT || attrs.SQFT_GROSS || 0) || 0,
    garageSqft: parseFloat(attrs.GARAGE_SQFT || attrs.GARAGE || 0) || 0,
    garageType: attrs.GARAGE_TYPE || 'N/A',
    stories: parseInt(attrs.STORIES || attrs.FLOORS || 0) || 0,
    roofType: attrs.ROOF_TYPE || 'N/A',
    foundationType: attrs.FOUNDATION || 'Unknown',
    bedrooms: parseInt(attrs.BEDROOMS || 0) || 0,
    bathrooms: parseFloat(attrs.BATHS || attrs.BATHROOMS || 0) || 0,
    siteAddress: attrs.SITE_ADDR || attrs.site_address || attrs.SITEADDR || attrs.SITUS_ADDRESS || '',
    siteCity: attrs.site_city || attrs.SITECITY || attrs.SITUS_CITY_NM || '',
    assessedValue: (() => {
      if (attrs.VALUE_LAND !== undefined || attrs.VALUE_BLDG !== undefined) {
        return (parseFloat(attrs.VALUE_LAND || 0) + parseFloat(attrs.VALUE_BLDG || 0)) || 0;
      }
      return parseFloat(attrs.ASSESSVAL || attrs.ASSESSED_VALUE || attrs.TOTALVAL1 || 0) || 0;
    })(),
    aggregatorCounty: attrs.COUNTY_NAME || attrs.COUNTY || attrs.COUNTY_NM || '',
    latitude: geometry.y || attrs.LATITUDE || 0,
    longitude: geometry.x || attrs.LONGITUDE || 0
  };
}

async function handleArcgis(req, res) {
  const { address, city, state, county } = req.body;

  if (!address || !city || !state || !county) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters: address, city, state, county'
    });
  }

  const result = await arcgisQueryByAddress(address, city, state, county);
  res.status(200).json(result);
}

// ===========================================================================
// SECTION 2: Satellite Imagery Analysis (Smart Extract)
// ===========================================================================

async function handleSatellite(req, res) {
  const { address, city, state, zip } = req.body;

  if (!address || !city || !state) {
    return res.status(400).json({ error: 'Address, city, and state required' });
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'NEXT_PUBLIC_GOOGLE_API_KEY not configured' });
  }

  const fullAddress = `${address}, ${city}, ${state}${zip ? ' ' + zip : ''}`.trim();
  console.log(`[Smart Extract] Analyzing: ${fullAddress}`);

  // Fetch satellite and street view images in parallel
  const satUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(fullAddress)}&zoom=19&size=640x640&maptype=satellite&key=${apiKey}`;
  const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=640x480&location=${encodeURIComponent(fullAddress)}&key=${apiKey}`;

  const [satRes, svRes] = await Promise.all([
    fetch(satUrl).catch(() => null),
    fetch(streetViewUrl).catch(() => null)
  ]);

  if (!satRes || !satRes.ok) {
    return res.status(200).json({
      success: false,
      data: {},
      notes: 'Satellite imagery unavailable. Please use GIS/Zillow buttons or manual entry.'
    });
  }

  const satBuffer = await satRes.arrayBuffer();
  const satBase64 = Buffer.from(satBuffer).toString('base64');

  // Street View may not be available for all addresses
  let svBase64 = null;
  if (svRes && svRes.ok) {
    const svBuffer = await svRes.arrayBuffer();
    svBase64 = Buffer.from(svBuffer).toString('base64');
    console.log(`[Smart Extract] Street View image fetched (${svBuffer.byteLength} bytes)`);
  } else {
    console.log('[Smart Extract] Street View not available for this address');
  }

  // Call Gemini Vision API with both images
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const prompt = `Analyze ${svBase64 ? 'these two images' : 'this satellite image'} for the property at: ${fullAddress}
${svBase64 ? '\nImage 1 is a satellite/aerial view. Image 2 is a street-level view of the home.' : ''}

Detect and identify:
- Pool (visible blue water feature in satellite image)
- Trampoline (circular or rectangular structure in yard)
- Roof material (asphalt shingles, metal, tile, flat, or unknown)
- Roof shape (look at the roof structure${svBase64 ? ' in both images' : ''} — is it gable, hip, flat, or gambrel?)
- Number of stories (1, 1.5, 2, 2.5, 3, or 3+)
- Garage spaces (count visible garage doors: 0, 1, 2, 3+)
- Deck or patio (wooden deck or concrete patio visible)
- Tree coverage (minimal, moderate, heavy)

Return ONLY valid JSON with this structure:
{
  "pool": "yes|no|unknown",
  "trampoline": "yes|no|unknown",
  "roofType": "asphalt|metal|tile|flat|unknown",
  "roofShape": "gable|hip|flat|gambrel|unknown",
  "numStories": "1|1.5|2|2.5|3|3+|unknown",
  "garageSpaces": "0|1|2|3+|unknown",
  "deck": "yes|no|unknown",
  "treeCoverage": "minimal|moderate|heavy|unknown",
  "notes": "Brief observations"
}`;

  // Build image parts array
  const imageParts = [
    { inline_data: { mime_type: 'image/png', data: satBase64 } }
  ];
  if (svBase64) {
    imageParts.push({ inline_data: { mime_type: 'image/jpeg', data: svBase64 } });
  }

  const geminiRes = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          ...imageParts
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048
      }
    })
  });

  if (!geminiRes.ok) {
    const errorText = await geminiRes.text().catch(() => 'Unknown error');
    return res.status(200).json({
      success: false,
      data: {},
      satelliteImage: satBase64,
      streetViewImage: svBase64,
      notes: `AI analysis failed (${geminiRes.status}). Image shown for manual review.`,
      error: errorText
    });
  }

  const result = await geminiRes.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

  const jsonMatch = text.match(/\{[^{}]*\}/);
  if (!jsonMatch) {
    return res.status(200).json({
      success: false,
      data: {},
      satelliteImage: satBase64,
      streetViewImage: svBase64,
      notes: 'Could not extract data. Showing images for review.'
    });
  }

  const extracted = JSON.parse(jsonMatch[0]);

  res.status(200).json({
    success: true,
    data: extracted,
    satelliteImage: satBase64,
    streetViewImage: svBase64,
    notes: 'Satellite + Street View analysis - verify all data with public records'
  });
}

// ===========================================================================
// SECTION 3: Zillow Property Data Extraction
// ===========================================================================

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

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
};

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

function parseNum(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
  return Number.isNaN(n) ? null : n;
}

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

async function fetchZillowViaAutocomplete(address, city, state, zip, diag) {
  const query = `${address}, ${city}, ${state} ${zip}`.trim();
  const acUrl = `https://www.zillowstatic.com/autocomplete/v3/suggestions?q=${encodeURIComponent(query)}&resultTypes=allAddress&resultCount=1`;

  console.log(`[Zillow] Layer A: Autocomplete`);

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
    console.log(`[Zillow] Layer A autocomplete HTTP ${resp.status}`);

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      console.log(`[Zillow] Layer A autocomplete failed: ${resp.status}, body: ${errBody.substring(0, 200)}`);
      diag.autocompleteBody = errBody.substring(0, 200);
      return null;
    }

    const acData = await resp.json();
    const results = acData?.results || [];
    console.log(`[Zillow] Layer A autocomplete results: ${results.length}, keys: ${JSON.stringify(acData).substring(0, 300)}`);
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
      console.log(`[Zillow] Layer A: no zpid found in ${results.length} results`);
      return null;
    }
    console.log(`[Zillow] Layer A: found zpid ${zpid}`);

    const slug = buildSlug(address, city, state, zip);
    const propertyUrl = `https://www.zillow.com/homedetails/${slug}/${zpid}_zpid/`;

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
      console.log(`[Zillow] Layer A property page HTTP ${pageResp.status}, url: ${pageResp.url}`);
      if (!pageResp.ok) {
        console.log(`[Zillow] Layer A property page failed: ${pageResp.status}`);
        return null;
      }

      const html = await pageResp.text();
      diag.propertyPageLength = html.length;

      return tryExtractFromHtml(html, pageResp.url || propertyUrl, diag);
    } finally {
      clearTimeout(timeout2);
    }
  } catch (err) {
    diag.autocompleteError = err.name === 'AbortError' ? 'timeout' : err.message;
    console.log(`[Zillow] Layer A error: ${diag.autocompleteError}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

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
    console.log(`[Zillow] Layer B search API HTTP ${resp.status}`);
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      console.log(`[Zillow] Layer B search API failed: ${resp.status}, body: ${errBody.substring(0, 200)}`);
      diag.searchApiBody = errBody.substring(0, 200);
      return null;
    }

    const text = await resp.text();
    diag.searchApiLength = text.length;

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      diag.searchApiJsonError = true;
      return null;
    }

    const listResults = data?.cat1?.searchResults?.listResults ||
                       data?.searchResults?.listResults || [];

    if (listResults.length === 0) {
      diag.searchApiResults = 0;
      return null;
    }

    diag.searchApiResults = listResults.length;
    const first = listResults[0];

    const info = first.hdpData?.homeInfo || {};
    const raw = {};

    if (first.beds != null) raw.bedrooms = first.beds;
    if (first.baths != null) raw.bathrooms = first.baths;
    if (first.area != null) raw.livingArea = first.area;

    if (info.yearBuilt) raw.yearBuilt = info.yearBuilt;
    if (info.bedrooms) raw.bedrooms = info.bedrooms;
    if (info.bathrooms) raw.bathrooms = info.bathrooms;
    if (info.livingArea) raw.livingArea = info.livingArea;
    if (info.homeType) raw.homeType = info.homeType;

    const nonNullKeys = Object.keys(raw).filter(k => raw[k] != null);

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

    if (first.detailUrl) {
      const detailUrl = first.detailUrl.startsWith('http')
        ? first.detailUrl
        : `https://www.zillow.com${first.detailUrl}`;

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
    diag.searchApiError = err.name === 'AbortError' ? 'timeout' : err.message;
    console.log(`[Zillow] Layer B error: ${diag.searchApiError}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

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
    console.log(`[Zillow] Layer C direct fetch HTTP ${resp.status}`);
    if (!resp.ok) {
      console.log(`[Zillow] Layer C direct fetch failed: ${resp.status}`);
      return null;
    }

    const html = await resp.text();
    diag.directFetchLength = html.length;

    return tryExtractFromHtml(html, resp.url || url, diag);
  } catch (err) {
    diag.directFetchError = err.name === 'AbortError' ? 'timeout' : err.message;
    console.log(`[Zillow] Layer C error: ${diag.directFetchError}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ===========================================================================
// Layer D: Gemini Search Grounding (bypasses Zillow blocking entirely)
// Uses Google's search index to find property details from any real estate site
// ===========================================================================

async function fetchViaGeminiSearch(address, city, state, zip, diag) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  if (!apiKey) {
    diag.geminiSearchError = 'No API key';
    return null;
  }

  const fullAddress = `${address}, ${city}, ${state}${zip ? ' ' + zip : ''}`.trim();
  console.log(`[Zillow] Layer D: Gemini Search for "${fullAddress}"`);

  const prompt = `Find detailed property/home facts for this specific address: ${fullAddress}

Search real estate listings and public records for this exact property. I need these specific construction and feature details:

Return ONLY valid JSON (no markdown, no code fences) with this exact structure:
{
  "heating": "the heating system type (e.g. Forced Air, Baseboard, Heat Pump, Boiler, Radiant)",
  "cooling": "the cooling system type (e.g. Central Air, Window Units, None)",
  "roofType": "roof material (e.g. Composition, Asphalt Shingle, Metal, Tile, Wood Shake)",
  "foundation": "foundation type (e.g. Crawl Space, Slab, Basement, Pier)",
  "construction": "construction type (e.g. Wood Frame, Masonry, Brick)",
  "exterior": "exterior wall material (e.g. Vinyl Siding, Wood Siding, Brick, Stucco, Fiber Cement)",
  "garageSpaces": number_or_null,
  "bedrooms": number_or_null,
  "bathrooms": number_or_null,
  "yearBuilt": number_or_null,
  "stories": number_or_null,
  "livingArea": square_feet_number_or_null,
  "fireplaces": number_or_null,
  "notes": "source of data and confidence level"
}

Use null for any field you cannot find. Only include data for THIS SPECIFIC address.`;

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const resp = await fetch(geminiUrl, {
      signal: controller.signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024
        }
      })
    });

    diag.geminiSearchStatus = resp.status;
    console.log(`[Zillow] Layer D Gemini HTTP ${resp.status}`);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.log(`[Zillow] Layer D Gemini failed: ${resp.status}, body: ${errText.substring(0, 300)}`);
      diag.geminiSearchBody = errText.substring(0, 300);
      return null;
    }

    const result = await resp.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    diag.geminiSearchResponseLength = text.length;
    console.log(`[Zillow] Layer D Gemini response (${text.length} chars): ${text.substring(0, 200)}`);

    if (!text) {
      console.log('[Zillow] Layer D: empty Gemini response');
      return null;
    }

    // Extract JSON from response (may be wrapped in markdown code fences)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('[Zillow] Layer D: no JSON found in Gemini response');
      diag.geminiSearchNoJson = true;
      return null;
    }

    const raw = JSON.parse(jsonMatch[0]);
    const nonNullKeys = Object.keys(raw).filter(k => raw[k] != null && k !== 'notes');

    if (nonNullKeys.length < 2) {
      console.log(`[Zillow] Layer D: only ${nonNullKeys.length} non-null fields, skipping`);
      diag.geminiSearchFieldCount = nonNullKeys.length;
      return null;
    }

    console.log(`[Zillow] Layer D: extracted ${nonNullKeys.length} fields: ${nonNullKeys.join(', ')}`);

    // Normalize field names to match what mapZillowToAltech expects
    const normalized = {};
    if (raw.heating) normalized.heating = raw.heating;
    if (raw.cooling) normalized.cooling = raw.cooling;
    if (raw.roofType) normalized.roof = raw.roofType;
    if (raw.foundation) normalized.foundation = raw.foundation;
    if (raw.construction) normalized.constructionMaterials = raw.construction;
    if (raw.exterior) normalized.exteriorFeatures = raw.exterior;
    if (raw.garageSpaces != null) normalized.garageSpaces = raw.garageSpaces;
    if (raw.bedrooms != null) normalized.bedrooms = raw.bedrooms;
    if (raw.bathrooms != null) normalized.bathrooms = raw.bathrooms;
    if (raw.yearBuilt != null) normalized.yearBuilt = raw.yearBuilt;
    if (raw.stories != null) normalized.stories = raw.stories;
    if (raw.livingArea != null) normalized.livingArea = raw.livingArea;
    if (raw.fireplaces != null) normalized.fireplaces = raw.fireplaces;

    return {
      raw: normalized,
      source: 'gemini-search',
      zillowUrl: diag.zpid
        ? `https://www.zillow.com/homedetails/${buildSlug(address, city, state, zip || '')}/${diag.zpid}_zpid/`
        : null
    };
  } catch (err) {
    diag.geminiSearchError = err.name === 'AbortError' ? 'timeout' : err.message;
    console.log(`[Zillow] Layer D error: ${diag.geminiSearchError}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function handleZillow(req, res) {
  const { address, city, state, zip } = req.body;

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

    // Layer A: Autocomplete API -> canonical property page
    result = await fetchZillowViaAutocomplete(address, city, state, zip || '', diag);

    // Layer B: Search API (JSON)
    if (!result) {
      console.log('[Zillow] Layer A returned null, trying Layer B');
      result = await fetchZillowSearchAPI(address, city, state, zip || '', diag);
    }

    // Layer C: Direct fetch (fallback)
    if (!result) {
      console.log('[Zillow] Layer B returned null, trying Layer C');
      const searchUrl = buildZillowSearchUrl(address, city, state, zip || '');
      console.log(`[Zillow] Layer C URL: ${searchUrl}`);
      result = await fetchZillowDirect(searchUrl, diag);
    }

    // Layer D: Gemini Search Grounding (bypasses site blocking via Google's index)
    if (!result) {
      console.log('[Zillow] Layer C returned null, trying Layer D (Gemini Search)');
      result = await fetchViaGeminiSearch(address, city, state, zip || '', diag);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    if (!result || !result.raw) {
      // Even when scraping fails, return the Zillow URL if autocomplete found a zpid
      const zillowUrl = diag.zpid
        ? `https://www.zillow.com/homedetails/${buildSlug(address, city, state, zip || '')}/${diag.zpid}_zpid/`
        : null;
      console.log(`[Zillow] ALL LAYERS FAILED (${elapsed}s). zpid=${diag.zpid || 'none'}, url=${zillowUrl || 'none'}`);
      console.log(`[Zillow] Diagnostics:`, JSON.stringify(diag));
      return res.status(200).json({
        success: false,
        error: 'Could not extract property details from Zillow (site blocks server requests)',
        zillowUrl,
        zpid: diag.zpid || null,
        diagnostics: diag,
        elapsedSeconds: parseFloat(elapsed),
      });
    }

    const { data, fieldsFound } = mapZillowToAltech(result.raw);

    console.log(`[Zillow] Success: ${fieldsFound.length} fields via ${result.source} (${elapsed}s)`);

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

// ===========================================================================
// MAIN HANDLER — Routes by ?mode= query parameter
// ===========================================================================

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' });

  const { mode } = req.query;

  try {
    switch (mode) {
      case 'arcgis':
        return await handleArcgis(req, res);
      case 'satellite':
        return await handleSatellite(req, res);
      case 'zillow':
        return await handleZillow(req, res);
      default:
        return res.status(400).json({
          error: `Invalid mode "${mode}". Use ?mode=arcgis|satellite|zillow`
        });
    }
  } catch (error) {
    console.error(`[PropertyIntelligence] ${mode} error:`, error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}
