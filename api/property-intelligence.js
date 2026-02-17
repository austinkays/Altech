/**
 * Property Intelligence - Unified Property Data Endpoint
 * Combines: ArcGIS County Data, Satellite Analysis, Gemini Search Grounding
 *
 * Usage: POST /api/property-intelligence?mode=arcgis|satellite|zillow|firestation
 * Body: JSON with { address, city, state, zip?, county? }
 */

import { readFileSync } from 'fs';

// Helper: resolve Google API key from environment variables only
// Used for Gemini AI calls (generative language API)
function getGoogleApiKey() {
  return (process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY || '').trim() || null;
}

// Helper: resolve key for Google Maps/Geocoding/Places APIs
// Falls back through: GOOGLE_API_KEY → PLACES_API_KEY
function getMapsApiKey() {
  const envKey = (process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY || '').trim();
  if (envKey) return envKey;
  return (process.env.PLACES_API_KEY || process.env.GOOGLE_PLACES_API_KEY || '').trim() || null;
}

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
    const googleApiKey = getMapsApiKey();
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

// ===========================================================================
// Clark County "Fact Sheet" Deep-Link Scraper
// NOTE: Clark County retired reports.cfm in early 2026. The property info
//       page (gis.clark.wa.gov/gishome/property/) now requires reCAPTCHA
//       with no public API alternative. Building details for Clark County
//       properties are now provided by Gemini Search Grounding instead.
//       This function is kept for compatibility but short-circuits early.
// ===========================================================================

async function fetchClarkFactSheet(accountNumber) {
  if (!accountNumber) return null;

  // The reports.cfm endpoint is permanently dead (returns "PAGE NOT FOUND")
  // Clark County property data now requires reCAPTCHA — no programmatic access
  console.log(`[Clark FactSheet] DEPRECATED: reports.cfm endpoint no longer available. Building details will be fetched via Gemini Search Grounding instead.`);

  // The DATA_LINK from ArcGIS contains the account number or full URL
  // Extract just the account number if it's a URL
  let acctKey = accountNumber;
  const urlMatch = String(accountNumber).match(/account_rekey=([^&]+)/);
  if (urlMatch) acctKey = urlMatch[1];
  // Also try extracting from a plain data link path
  const pathMatch = String(accountNumber).match(/\/(\d+)\/?$/);
  if (pathMatch) acctKey = pathMatch[1];

  // Skip the HTTP call — the endpoint is dead
  // If Clark County restores a public API in the future, this is where to add it
  return null;

  // PRESERVED FOR REFERENCE — original reports.cfm scraper:
  // const factUrl = `https://gis.clark.wa.gov/gishome/property/reports.cfm?account_rekey=${acctKey}&item=fact`;

  /*
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const resp = await fetch(factUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Altech PropertyIntel/1.0)',
        'Accept': 'text/html'
      }
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      console.log(`[Clark FactSheet] HTTP ${resp.status}`);
      return null;
    }

    const html = await resp.text();
    console.log(`[Clark FactSheet] Got ${html.length} chars of HTML`);

    // Parse building details from the fact sheet HTML using regex
    // The page has table rows with label/value pairs
    const extract = (pattern) => {
      const m = html.match(pattern);
      return m ? m[1].replace(/<[^>]*>/g, '').trim() : null;
    };
    const extractNum = (pattern) => {
      const v = extract(pattern);
      if (!v) return 0;
      const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
      return Number.isNaN(n) ? 0 : n;
    };
    const extractFloat = (pattern) => {
      const v = extract(pattern);
      if (!v) return 0;
      const n = parseFloat(v.replace(/[^0-9.]/g, ''));
      return Number.isNaN(n) ? 0 : n;
    };

    // Common patterns in Clark County fact sheet HTML tables
    const data = {
      yearBuilt: extractNum(/Year\s*Built[^<]*<[^>]*>\s*([^<]+)/i),
      totalSqft: extractNum(/(?:Total|Living)\s*(?:Area|Sq\s*F|SqFt|Square)[^<]*<[^>]*>\s*([^<]+)/i),
      stories: extractFloat(/Stor(?:ies|y)[^<]*<[^>]*>\s*([^<]+)/i),
      bedrooms: extractNum(/Bedroom[^<]*<[^>]*>\s*([^<]+)/i),
      bathrooms: extractFloat(/(?:Full\s*)?Bath[^<]*<[^>]*>\s*([^<]+)/i),
      halfBaths: extractFloat(/Half\s*Bath[^<]*<[^>]*>\s*([^<]+)/i),
      roofType: extract(/Roof(?:\s*(?:Type|Material|Cover))?[^<]*<[^>]*>\s*([^<]+)/i),
      foundation: extract(/Foundation[^<]*<[^>]*>\s*([^<]+)/i),
      heating: extract(/Heat(?:ing)?(?:\s*Type)?[^<]*<[^>]*>\s*([^<]+)/i),
      construction: extract(/(?:Construction|Exterior\s*Wall|Frame)[^<]*<[^>]*>\s*([^<]+)/i),
      garageType: extract(/Garage(?:\s*Type)?[^<]*<[^>]*>\s*([^<]+)/i),
      garageSqft: extractNum(/Garage\s*(?:Area|Sq\s*F|SqFt)[^<]*<[^>]*>\s*([^<]+)/i),
      basementSqft: extractNum(/Basement\s*(?:Area|Sq\s*F|SqFt)[^<]*<[^>]*>\s*([^<]+)/i),
      fireplace: extractNum(/Fireplace[^<]*<[^>]*>\s*([^<]+)/i),
    };

    // Count how many fields we actually got
    const fieldsFound = Object.entries(data)
      .filter(([k, v]) => v && v !== 0 && v !== 'N/A')
      .map(([k]) => k);

    if (fieldsFound.length < 2) {
      console.log(`[Clark FactSheet] Only ${fieldsFound.length} fields parsed, skipping`);
      return null;
    }

    console.log(`[Clark FactSheet] Extracted ${fieldsFound.length} fields: ${fieldsFound.join(', ')}`);
    return { data, fieldsFound, source: 'clark-factsheet' };
  } catch (err) {
    console.warn(`[Clark FactSheet] Error: ${err.message}`);
    return null;
  }
  */
}

function enrichParcelWithFactSheet(parcelData, factSheet) {
  // Merge fact sheet data into parcel, filling gaps only
  const fs = factSheet.data;
  if (fs.yearBuilt && (!parcelData.yearBuilt || parcelData.yearBuilt === 0)) parcelData.yearBuilt = fs.yearBuilt;
  if (fs.totalSqft && (!parcelData.totalSqft || parcelData.totalSqft === 0)) parcelData.totalSqft = fs.totalSqft;
  if (fs.stories && (!parcelData.stories || parcelData.stories === 0)) parcelData.stories = fs.stories;
  if (fs.bedrooms && (!parcelData.bedrooms || parcelData.bedrooms === 0)) parcelData.bedrooms = fs.bedrooms;
  if (fs.bathrooms && (!parcelData.bathrooms || parcelData.bathrooms === 0)) parcelData.bathrooms = fs.bathrooms;
  if (fs.roofType && (parcelData.roofType === 'N/A' || !parcelData.roofType)) parcelData.roofType = fs.roofType;
  if (fs.foundation && (parcelData.foundationType === 'Unknown' || !parcelData.foundationType)) parcelData.foundationType = fs.foundation;
  if (fs.heating) parcelData.heatingType = fs.heating;
  if (fs.construction) parcelData.constructionStyle = fs.construction;
  if (fs.garageType) parcelData.garageType = fs.garageType;
  if (fs.garageSqft && (!parcelData.garageSqft || parcelData.garageSqft === 0)) parcelData.garageSqft = fs.garageSqft;
  if (fs.basementSqft && (!parcelData.basementSqft || parcelData.basementSqft === 0)) parcelData.basementSqft = fs.basementSqft;
  if (fs.fireplace && fs.fireplace > 0) parcelData.fireplaces = fs.fireplace;
  return parcelData;
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

  // Clark County enrichment: if ArcGIS succeeded, try the Fact Sheet scrape
  if (result.success && county === 'Clark' && result.rawResponse) {
    const acctNum = result.rawResponse.DATA_LINK || result.rawResponse.ORIG_PARCEL_ID || result.parcelData?.parcelId;
    if (acctNum) {
      console.log(`[ArcGIS] Clark County detected — attempting Fact Sheet enrichment (acct: ${acctNum})`);
      const factSheet = await fetchClarkFactSheet(acctNum);
      if (factSheet) {
        result.parcelData = enrichParcelWithFactSheet(result.parcelData, factSheet);
        result.enrichedBy = 'clark-factsheet';
        result.factSheetFields = factSheet.fieldsFound;
        console.log(`[ArcGIS] Clark enrichment added ${factSheet.fieldsFound.length} fields`);
      }
    }
  }

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

  const mapsKey = getMapsApiKey();
  const geminiKey = getGoogleApiKey();
  if (!mapsKey && !geminiKey) {
    return res.status(500).json({ error: 'GOOGLE_API_KEY not configured' });
  }
  if (!mapsKey) {
    return res.status(200).json({
      success: false,
      data: {},
      notes: 'Static Maps API key not available. Please use GIS/Zillow buttons or manual entry.'
    });
  }

  const fullAddress = `${address}, ${city}, ${state}${zip ? ' ' + zip : ''}`.trim();
  console.log(`[Smart Extract] Analyzing: ${fullAddress}`);

  // Fetch satellite and street view images in parallel
  const satUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(fullAddress)}&zoom=19&size=640x640&maptype=satellite&key=${mapsKey}`;
  const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=640x480&location=${encodeURIComponent(fullAddress)}&key=${mapsKey}`;

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
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey || mapsKey}`;

  const prompt = `You are an insurance property underwriter. Analyze ${svBase64 ? 'these two images' : 'this satellite image'} of the property at: ${fullAddress}
${svBase64 ? 'Image 1: Satellite/aerial view. Image 2: Street-level view.' : ''}

Evaluate for insurance risk underwriting. Return ONLY valid JSON (no markdown, no explanation):
{
  "roof_material": "composition_shingle|architectural_shingle|metal|clay_tile|concrete_tile|wood_shake|slate|flat_membrane|unknown",
  "roof_condition_score": 1-10 integer or null,
  "roof_shape": "gable|hip|flat|gambrel|mansard|unknown",
  "has_pool": true/false/null,
  "pool_fenced": true/false/null,
  "has_trampoline": true/false/null,
  "stories": integer or null,
  "garage_doors": integer or null,
  "visible_hazards": ["list of observed risks: dead trees, debris, damaged siding, sagging roof, etc."],
  "deck_or_patio": true/false/null,
  "tree_overhang_roof": true/false/null,
  "brush_clearance_adequate": true/false/null,
  "notes": "2-3 sentence underwriter observations"
}

Scoring guide for roof_condition_score: 10=new/excellent, 7-9=good/minor wear, 4-6=aging/moss/staining, 1-3=visible damage/sagging/missing shingles. Use null if roof not clearly visible.`;

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
// SECTION 3: Property Data via Gemini Search Grounding
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
    mapped.numFireplaces = fpNum;
    fieldsFound.push('fireplace');
  } else if (/yes/i.test(fpStr) || /true/i.test(fpStr)) {
    mapped.fireplace = 'Yes';
    fieldsFound.push('fireplace');
  }

  // Garage type (Attached/Detached/Built-in/Carport/None)
  if (raw.garageType && typeof raw.garageType === 'string') {
    mapped.garageType = raw.garageType;
    fieldsFound.push('garageType');
  }

  // Flooring (Hardwood/Carpet/Tile/Laminate/Mixed)
  const flooringRaw = raw.flooring || raw.flooringType || '';
  const flooringStr = Array.isArray(flooringRaw) ? flooringRaw.join(', ') : String(flooringRaw);
  if (flooringStr && flooringStr.length > 1) {
    mapped.flooring = flooringStr;
    fieldsFound.push('flooring');
  }

  // Sewer (Public/Septic)
  const sewerRaw = raw.sewer || raw.sewerType || '';
  const sewerStr = Array.isArray(sewerRaw) ? sewerRaw.join(' ') : String(sewerRaw);
  if (/public|municipal|city/i.test(sewerStr)) {
    mapped.sewer = 'Public'; fieldsFound.push('sewer');
  } else if (/septic|private/i.test(sewerStr)) {
    mapped.sewer = 'Septic'; fieldsFound.push('sewer');
  }

  // Water source (Public/Well)
  const waterRaw = raw.waterSource || raw.water || '';
  const waterStr = Array.isArray(waterRaw) ? waterRaw.join(' ') : String(waterRaw);
  if (/public|municipal|city/i.test(waterStr)) {
    mapped.waterSource = 'Public'; fieldsFound.push('waterSource');
  } else if (/well|private/i.test(waterStr)) {
    mapped.waterSource = 'Well'; fieldsFound.push('waterSource');
  }

  // Pool (map yes/no to form values)
  const poolRaw = raw.pool || '';
  const poolStr = Array.isArray(poolRaw) ? poolRaw.join(' ') : String(poolRaw);
  if (/yes|in.?ground|above.?ground/i.test(poolStr)) {
    mapped.pool = /above/i.test(poolStr) ? 'Above Ground' : 'In Ground';
    fieldsFound.push('pool');
  } else if (/no|none/i.test(poolStr)) {
    mapped.pool = 'None';
    fieldsFound.push('pool');
  }

  // Wood stove
  const woodRaw = raw.woodStove || raw.woodBurningStove || '';
  const woodStr = Array.isArray(woodRaw) ? woodRaw.join(' ') : String(woodRaw);
  if (/yes|true/i.test(woodStr)) {
    mapped.woodStove = 'Yes'; fieldsFound.push('woodStove');
  } else if (/no|none|false/i.test(woodStr)) {
    mapped.woodStove = 'None'; fieldsFound.push('woodStove');
  }

  // Roof year updated
  const roofYrRaw = raw.roofYearUpdated || raw.roofYear || '';
  const roofYrNum = parseNum(roofYrRaw);
  if (roofYrNum && roofYrNum > 1900 && roofYrNum <= new Date().getFullYear()) {
    mapped.roofYr = String(roofYrNum);
    fieldsFound.push('roofYr');
  }

  // Basement finish percentage
  const bsmtPct = parseNum(raw.basementFinishPct);
  if (bsmtPct != null && bsmtPct >= 0 && bsmtPct <= 100) {
    mapped.basementFinishPct = bsmtPct;
    fieldsFound.push('basementFinishPct');
  }

  return { data: mapped, fieldsFound };
}

// ===========================================================================
// Gemini Search Grounding — Property Data via Google's Search Index
// ===========================================================================

async function fetchViaGeminiSearch(address, city, state, zip, diag) {
  const apiKey = getGoogleApiKey();
  if (!apiKey) {
    diag.geminiSearchError = 'No API key';
    return null;
  }

  const fullAddress = `${address}, ${city}, ${state}${zip ? ' ' + zip : ''}`.trim();
  console.log(`[Zillow] Gemini Search for "${fullAddress}"`);

  const prompt = `Find detailed property/home facts for this specific address: ${fullAddress}

Search real estate listings, public records, and property databases for this exact property. I need EVERY available construction and feature detail for insurance underwriting.

Return ONLY valid JSON (no markdown, no code fences) with this exact structure:
{
  "heating": "heating system type (e.g. Forced Air, Baseboard, Heat Pump, Boiler, Radiant, Electric)",
  "cooling": "cooling system type (e.g. Central Air, Window Units, None)",
  "roofType": "roof material (e.g. Composition, Asphalt Shingle, Metal, Tile, Wood Shake, Slate)",
  "roofYearUpdated": year_number_or_null,
  "foundation": "foundation type (e.g. Crawl Space, Slab, Basement, Pier, Daylight Basement)",
  "basementFinishPct": percentage_number_or_null,
  "construction": "construction type (e.g. Wood Frame, Masonry, Brick, Stucco, Log)",
  "exterior": "exterior wall material (e.g. Vinyl Siding, Wood Siding, Brick, Stucco, Fiber Cement, Hardie, Stone)",
  "garageType": "Attached or Detached or Built-in or Carport or None",
  "garageSpaces": number_or_null,
  "bedrooms": number_or_null,
  "bathrooms": number_or_null,
  "yearBuilt": number_or_null,
  "stories": number_or_null,
  "livingArea": square_feet_number_or_null,
  "flooring": "primary flooring (e.g. Hardwood, Carpet, Tile, Laminate, Mixed)",
  "fireplaces": number_or_null,
  "sewer": "Public or Septic or null",
  "waterSource": "Public or Well or null",
  "pool": "Yes or No or null",
  "woodStove": "Yes or No or null",
  "notes": "source of data and confidence level"
}

IMPORTANT: Look in the listing description text for renovation info like "New roof 2024" → set roofYearUpdated. Check "Facts & Features" sections thoroughly. Use null for any field you cannot find. Only include data for THIS SPECIFIC address.`;

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

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
          maxOutputTokens: 4096
        }
      })
    });

    diag.geminiSearchStatus = resp.status;
    console.log(`[Zillow] Gemini HTTP ${resp.status}`);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.log(`[Zillow] Gemini failed: ${resp.status}, body: ${errText.substring(0, 300)}`);
      diag.geminiSearchBody = errText.substring(0, 300);
      return null;
    }

    const result = await resp.json();
    // Gemini with google_search tool returns multiple parts:
    // parts[0] may be a functionCall (tool invocation), text is in later parts
    const allParts = result.candidates?.[0]?.content?.parts || [];
    const text = allParts.map(p => p.text || '').filter(Boolean).join('');
    diag.geminiSearchResponseLength = text.length;
    diag.geminiSearchPartsCount = allParts.length;
    console.log(`[Zillow] Gemini response (${text.length} chars, ${allParts.length} parts): ${text.substring(0, 200)}`);
    console.log(`[Zillow] Part types: ${allParts.map(p => p.text ? 'text' : p.functionCall ? 'functionCall' : 'other').join(', ')}`);

    if (!text) {
      console.log('[Zillow] Empty Gemini response');
      return null;
    }

    // Extract JSON from response (may be wrapped in markdown code fences)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('[Zillow] No JSON found in Gemini response');
      diag.geminiSearchNoJson = true;
      return null;
    }

    const raw = JSON.parse(jsonMatch[0]);
    const nonNullKeys = Object.keys(raw).filter(k => raw[k] != null && k !== 'notes');

    if (nonNullKeys.length < 2) {
      console.log(`[Zillow] Only ${nonNullKeys.length} non-null fields, skipping`);
      diag.geminiSearchFieldCount = nonNullKeys.length;
      return null;
    }

    console.log(`[Zillow] Extracted ${nonNullKeys.length} fields: ${nonNullKeys.join(', ')}`);

    // Normalize field names to match what mapZillowToAltech expects
    const normalized = {};
    if (raw.heating) normalized.heating = raw.heating;
    if (raw.cooling) normalized.cooling = raw.cooling;
    if (raw.roofType) normalized.roof = raw.roofType;
    if (raw.foundation) normalized.foundation = raw.foundation;
    if (raw.construction) normalized.constructionMaterials = raw.construction;
    if (raw.exterior) normalized.exteriorFeatures = raw.exterior;
    if (raw.garageSpaces != null) normalized.garageSpaces = raw.garageSpaces;
    if (raw.garageType) normalized.garageType = raw.garageType;
    if (raw.bedrooms != null) normalized.bedrooms = raw.bedrooms;
    if (raw.bathrooms != null) normalized.bathrooms = raw.bathrooms;
    if (raw.yearBuilt != null) normalized.yearBuilt = raw.yearBuilt;
    if (raw.stories != null) normalized.stories = raw.stories;
    if (raw.livingArea != null) normalized.livingArea = raw.livingArea;
    if (raw.fireplaces != null) normalized.fireplaces = raw.fireplaces;
    if (raw.roofYearUpdated != null) normalized.roofYearUpdated = raw.roofYearUpdated;
    if (raw.basementFinishPct != null) normalized.basementFinishPct = raw.basementFinishPct;
    if (raw.flooring) normalized.flooring = raw.flooring;
    if (raw.sewer) normalized.sewer = raw.sewer;
    if (raw.waterSource) normalized.waterSource = raw.waterSource;
    if (raw.pool) normalized.pool = raw.pool;
    if (raw.woodStove) normalized.woodStove = raw.woodStove;

    return {
      raw: normalized,
      source: 'gemini-search',
      zillowUrl: `https://www.zillow.com/homes/${buildSlug(address, city, state, zip || '')}_rb/`
    };
  } catch (err) {
    diag.geminiSearchError = err.name === 'AbortError' ? 'timeout' : err.message;
    console.log(`[Zillow] Gemini error: ${diag.geminiSearchError}`);
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
    const result = await fetchViaGeminiSearch(address, city, state, zip || '', diag);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    if (!result || !result.raw) {
      console.log(`[Zillow] Gemini search failed (${elapsed}s)`);
      console.log(`[Zillow] Diagnostics:`, JSON.stringify(diag));
      return res.status(200).json({
        success: false,
        error: 'Could not extract property details via Gemini search',
        zillowUrl: `https://www.zillow.com/homes/${buildSlug(address, city, state, zip || '')}_rb/`,
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
// SECTION 4: Fire Station Distance & Protection Class
// ===========================================================================

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3959; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateProtectionClass(distanceMiles) {
  if (distanceMiles < 1) return 4;
  if (distanceMiles < 2) return 5;
  if (distanceMiles < 3) return 6;
  if (distanceMiles < 4) return 7;
  if (distanceMiles < 5) return 8;
  if (distanceMiles < 7) return 9;
  return 10;
}

// Keywords that indicate a fire station result is NOT a responding station
// Admin offices, training centers, and some volunteer-only facilities
// may appear in Google Places but don't have apparatus (engines/trucks)
const NON_RESPONDING_KEYWORDS = [
  'training', 'training center', 'training facility',
  'admin', 'administrative', 'administration', 'headquarters',
  'museum', 'historical', 'historic',
  'prevention', 'fire prevention', 'fire marshal',
  'dispatch', 'communications',
];

function isRespondingStation(station) {
  const name = (station.name || '').toLowerCase();
  const types = station.types || [];
  // If it's explicitly typed as fire_station by Google, give it some credit
  const isTypedFireStation = types.includes('fire_station');
  // Check for non-responding keywords
  const hasNonRespondingKeyword = NON_RESPONDING_KEYWORDS.some(kw => name.includes(kw));
  if (hasNonRespondingKeyword && !name.includes('station')) {
    // If it says "Training Center" but NOT "Station 5 Training Center", skip it
    return false;
  }
  return true;
}

function classifyStationReliability(station) {
  const name = (station.name || '').toLowerCase();
  if (/volunteer/i.test(name)) return 'volunteer';
  if (NON_RESPONDING_KEYWORDS.some(kw => name.includes(kw))) return 'review';
  return 'responding';
}

async function handleFireStation(req, res) {
  const { address, city, state, zip } = req.body;

  if (!address || !city || !state) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters: address, city, state'
    });
  }

  const apiKey = getMapsApiKey();
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'Google API key not configured' });
  }

  try {
    // Step 1: Geocode the property address
    const fullAddress = `${address}, ${city}, ${state}${zip ? ' ' + zip : ''}`;
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${apiKey}`;

    console.log(`[FireStation] Geocoding: ${fullAddress}`);
    const geocodeResp = await fetch(geocodeUrl);
    const geocodeData = await geocodeResp.json();

    if (!geocodeData.results || geocodeData.results.length === 0) {
      return res.status(200).json({ success: false, error: 'Could not geocode address' });
    }

    const { lat, lng } = geocodeData.results[0].geometry.location;
    console.log(`[FireStation] Property location: ${lat}, ${lng}`);

    // Step 2: Find nearest fire station — try multiple approaches
    let nearest = null;

    // Approach A: Nearby Search with rankby=distance
    const nearbyUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&rankby=distance&type=fire_station&key=${apiKey}`;
    console.log(`[FireStation] Trying Nearby Search (rankby=distance)...`);
    const nearbyResp = await fetch(nearbyUrl);
    const nearbyData = await nearbyResp.json();
    console.log(`[FireStation] Nearby Search status: ${nearbyData.status}, results: ${nearbyData.results?.length || 0}`);

    // Helper: find best responding station from a list of results
    const findBestStation = (results) => {
      if (!results || results.length === 0) return null;
      // Sort by distance, then pick the first one that's a responding station
      const sorted = results
        .map(r => ({
          ...r,
          dist: haversineDistance(lat, lng, r.geometry.location.lat, r.geometry.location.lng),
          responding: isRespondingStation(r),
          reliability: classifyStationReliability(r)
        }))
        .sort((a, b) => a.dist - b.dist);

      // Prefer responding stations, but track the best non-responding as fallback
      const responding = sorted.find(s => s.responding);
      const skipped = sorted.filter(s => !s.responding).map(s => s.name);
      if (skipped.length > 0) {
        console.log(`[FireStation] Skipped non-responding: ${skipped.join(', ')}`);
      }
      return responding || sorted[0]; // Fall back to closest if all are non-responding
    };

    if (nearbyData.results && nearbyData.results.length > 0) {
      nearest = findBestStation(nearbyData.results);
    }

    // Approach B: Nearby Search with radius (if A failed)
    if (!nearest) {
      const radiusUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=16000&type=fire_station&key=${apiKey}`;
      console.log(`[FireStation] Trying Nearby Search (radius=16km)...`);
      const radiusResp = await fetch(radiusUrl);
      const radiusData = await radiusResp.json();
      console.log(`[FireStation] Radius Search status: ${radiusData.status}, results: ${radiusData.results?.length || 0}`);

      if (radiusData.results && radiusData.results.length > 0) {
        nearest = findBestStation(radiusData.results);
      }
    }

    // Approach C: Text Search fallback (if Places Nearby not enabled)
    if (!nearest) {
      const textQuery = `fire station near ${city}, ${state}`;
      const textUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(textQuery)}&location=${lat},${lng}&radius=16000&key=${apiKey}`;
      console.log(`[FireStation] Trying Text Search: "${textQuery}"...`);
      const textResp = await fetch(textUrl);
      const textData = await textResp.json();
      console.log(`[FireStation] Text Search status: ${textData.status}, results: ${textData.results?.length || 0}`);

      if (textData.results && textData.results.length > 0) {
        nearest = findBestStation(textData.results);
      }
    }

    if (!nearest) {
      return res.status(200).json({
        success: false,
        error: 'No fire stations found nearby (Places API may not be enabled)',
        propertyLocation: { lat, lng }
      });
    }

    const stationLat = nearest.geometry?.location?.lat || nearest.geometry.location.lat;
    const stationLng = nearest.geometry?.location?.lng || nearest.geometry.location.lng;
    const distanceMiles = nearest.dist || haversineDistance(lat, lng, stationLat, stationLng);
    const protectionClass = estimateProtectionClass(distanceMiles);
    const reliability = nearest.reliability || classifyStationReliability(nearest);

    console.log(`[FireStation] Nearest: "${nearest.name}" (${reliability}) at ${distanceMiles.toFixed(2)} mi → Protection Class ${protectionClass}`);

    return res.status(200).json({
      success: true,
      fireStationDist: Math.round(distanceMiles * 10) / 10,
      fireStationName: nearest.name,
      fireStationAddress: nearest.vicinity || nearest.formatted_address || '',
      protectionClass,
      stationReliability: reliability,
      reviewNote: reliability === 'volunteer' ? 'Volunteer station — verify response times with local fire district' :
                  reliability === 'review' ? 'Station may be admin/training — verify with local fire department' : null,
      propertyLocation: { lat, lng },
      stationLocation: { lat: stationLat, lng: stationLng },
      note: 'Estimated from distance - verify with local fire department. Hydrant distance not included (affects rural protection class).'
    });
  } catch (error) {
    console.error('[FireStation] Error:', error);
    return res.status(200).json({
      success: false,
      error: error.message || 'Unknown error'
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
      case 'firestation':
        return await handleFireStation(req, res);
      default:
        return res.status(400).json({
          error: `Invalid mode "${mode}". Use ?mode=arcgis|satellite|zillow|firestation`
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
