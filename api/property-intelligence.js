/**
 * Property Intelligence - Unified Property Data Endpoint
 * Combines: ArcGIS County Data, Satellite Analysis, AI Search Grounding
 *
 * Usage: POST /api/property-intelligence?mode=arcgis|satellite|zillow|firestation
 * Body: JSON with { address, city, state, zip?, county?, aiSettings? }
 * 
 * Routes AI calls through user's chosen provider via _ai-router.js.
 * Falls back to Google Gemini via env key when no user settings provided.
 * Google Search grounding (zillow mode) is Google-only — other providers
 * use their general knowledge instead.
 */

import { readFileSync } from 'fs';
import { securityMiddleware } from '../lib/security.js';
import { createRouter, extractJSON } from './_ai-router.js';
import { ragHandler } from './_rag-interpreter.js';

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

// ===========================================================================
// FEMA NFHL Flood Zone Lookup (public endpoint — no API key required)
// ===========================================================================
async function fetchFloodZone(lat, lng) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const url = `https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE&returnGeometry=false&f=json`;
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.features || data.features.length === 0) {
      console.log('[FloodZone] miss — no FEMA data for this location');
      return null;
    }
    const attrs = data.features[0].attributes;
    const sfha = attrs.SFHA_TF === 'T';
    const bfe = parseFloat(attrs.STATIC_BFE);
    const result = {
      floodZone: attrs.FLD_ZONE || null,
      floodZoneSubtype: attrs.ZONE_SUBTY || null,
      sfha,
      baseFloodElevation: isNaN(bfe) ? null : bfe
    };
    console.log(`[FloodZone] Zone: ${result.floodZone}, SFHA: ${sfha}`);
    return result;
  } catch (e) {
    if (e.name === 'AbortError') {
      console.warn('[FloodZone] Timed out after 5s — skipping flood data');
    } else {
      console.warn('[FloodZone] Error:', e.message);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
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

  // Run Clark County enrichment and FEMA flood zone lookup in parallel
  const lat = result.parcelData?.latitude;
  const lng = result.parcelData?.longitude;

  const clarkPromise = (result.success && county === 'Clark' && result.rawResponse)
    ? (() => {
        const acctNum = result.rawResponse.DATA_LINK || result.rawResponse.ORIG_PARCEL_ID || result.parcelData?.parcelId;
        if (!acctNum) return Promise.resolve(null);
        console.log(`[ArcGIS] Clark County detected — attempting Fact Sheet enrichment (acct: ${acctNum})`);
        return fetchClarkFactSheet(acctNum);
      })()
    : Promise.resolve(null);

  const floodPromise = (lat && lng) ? fetchFloodZone(lat, lng) : Promise.resolve(null);

  const [clarkSettled, floodSettled] = await Promise.allSettled([clarkPromise, floodPromise]);

  const factSheet = clarkSettled.status === 'fulfilled' ? clarkSettled.value : null;
  if (factSheet) {
    result.parcelData = enrichParcelWithFactSheet(result.parcelData, factSheet);
    result.enrichedBy = 'clark-factsheet';
    result.factSheetFields = factSheet.fieldsFound;
    console.log(`[ArcGIS] Clark enrichment added ${factSheet.fieldsFound.length} fields`);
  }

  result.floodData = floodSettled.status === 'fulfilled' ? floodSettled.value : null;

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

  // Call AI Vision for property analysis
  const ai = createRouter(req.body.aiSettings);

  const systemPrompt = `You are an insurance property underwriter with expertise in visual risk assessment. Analyze property images for roof condition, construction type, hazards, and underwriting factors. Return ONLY valid JSON.`;

  const userPrompt = `Analyze ${svBase64 ? 'these two images' : 'this satellite image'} of the property at: ${fullAddress}
${svBase64 ? 'Image 1: Satellite/aerial view. Image 2: Street-level view.' : ''}

Evaluate for insurance risk underwriting. Return JSON:
{
  "roof_material": "composition_shingle|architectural_shingle|metal|clay_tile|concrete_tile|wood_shake|slate|flat_membrane|unknown",
  "roof_condition_score": 1-10 integer or null,
  "roof_shape": "gable|hip|flat|gambrel|mansard|unknown",
  "has_pool": true/false/null,
  "pool_fenced": true/false/null,
  "has_trampoline": true/false/null,
  "stories": integer or null,
  "garage_doors": integer or null,
  "visible_hazards": ["list of observed risks"],
  "deck_or_patio": true/false/null,
  "tree_overhang_roof": true/false/null,
  "brush_clearance_adequate": true/false/null,
  "notes": "2-3 sentence underwriter observations"
}

Scoring guide for roof_condition_score: 10=new/excellent, 7-9=good/minor wear, 4-6=aging/moss/staining, 1-3=visible damage/sagging/missing shingles. Use null if roof not clearly visible.`;

  // Build image array for AI router
  const images = [{ base64: satBase64, mimeType: 'image/png' }];
  if (svBase64) {
    images.push({ base64: svBase64, mimeType: 'image/jpeg' });
  }

  try {
    const responseText = await ai.askVision(systemPrompt, images, userPrompt, {
      temperature: 0.1,
      maxTokens: 2048
    });

    const extracted = extractJSON(responseText);

    if (!extracted) {
      return res.status(200).json({
        success: false,
        data: {},
        satelliteImage: satBase64,
        streetViewImage: svBase64,
        notes: 'Could not extract data. Showing images for review.'
      });
    }

    res.status(200).json({
      success: true,
      data: extracted,
      satelliteImage: satBase64,
      streetViewImage: svBase64,
      aiProvider: ai.provider,
      notes: 'Satellite + Street View analysis - verify all data with public records'
    });
  } catch (err) {
    return res.status(200).json({
      success: false,
      data: {},
      satelliteImage: satBase64,
      streetViewImage: svBase64,
      notes: `AI analysis failed: ${err.message}. Image shown for manual review.`
    });
  }
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
  if (baths && baths > 0) { mapped.fullBaths = baths; fieldsFound.push('fullBaths'); sources.fullBaths = extractSrc(bathsPick); }

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

  return { data: mapped, fieldsFound, sources };
}

// ===========================================================================
// Gemini Search Grounding — Property Data via Google's Search Index
// ===========================================================================

async function fetchViaGeminiSearch(address, city, state, zip, diag, ai) {
  const fullAddress = `${address}, ${city}, ${state}${zip ? ' ' + zip : ''}`.trim();
  console.log(`[Zillow] AI Search for "${fullAddress}" (provider: ${ai.provider})`);

  const systemPrompt = `You are a property data researcher for insurance underwriting. Search for and extract detailed property facts from real estate listings and public records. Return ONLY valid JSON — no markdown, no code fences, no explanation.`;

  const userPrompt = `Find detailed property/home facts for this specific address: ${fullAddress}

Search real estate listings, public records, and property databases for this exact property. I need EVERY available construction and feature detail for insurance underwriting.

Return ONLY valid JSON with this exact structure. Each field (except notes) must be EITHER {"value": <extracted_value>, "source": "where you found this (e.g. Zillow Facts & Features)"} OR null:
{
  "heating": {"value": "heating system type (e.g. Forced Air, Baseboard, Heat Pump, Boiler, Radiant, Electric)", "source": "source name"} or null,
  "cooling": {"value": "cooling system type (e.g. Central Air, Window Units, None)", "source": "source name"} or null,
  "roofType": {"value": "roof material (e.g. Composition, Asphalt Shingle, Metal, Tile, Wood Shake, Slate)", "source": "source name"} or null,
  "roofYearUpdated": {"value": year_number, "source": "source name"} or null,
  "foundation": {"value": "foundation type (e.g. Crawl Space, Slab, Basement, Pier, Daylight Basement)", "source": "source name"} or null,
  "basementFinishPct": {"value": percentage_number, "source": "source name"} or null,
  "construction": {"value": "construction type (e.g. Wood Frame, Masonry, Brick, Stucco, Log)", "source": "source name"} or null,
  "exterior": {"value": "exterior wall material (e.g. Vinyl Siding, Wood Siding, Brick, Stucco, Fiber Cement, Hardie, Stone)", "source": "source name"} or null,
  "garageType": {"value": "Attached or Detached or Built-in or Carport or None", "source": "source name"} or null,
  "garageSpaces": {"value": number, "source": "source name"} or null,
  "bedrooms": {"value": number, "source": "source name"} or null,
  "bathrooms": {"value": number, "source": "source name"} or null,
  "yearBuilt": {"value": number, "source": "source name"} or null,
  "stories": {"value": number, "source": "source name"} or null,
  "livingArea": {"value": square_feet_number, "source": "source name"} or null,
  "flooring": {"value": "primary flooring (e.g. Hardwood, Carpet, Tile, Laminate, Mixed)", "source": "source name"} or null,
  "fireplaces": {"value": number, "source": "source name"} or null,
  "sewer": {"value": "Public or Septic", "source": "source name"} or null,
  "waterSource": {"value": "Public or Well", "source": "source name"} or null,
  "pool": {"value": "Yes or No", "source": "source name"} or null,
  "woodStove": {"value": "Yes or No", "source": "source name"} or null,
  "notes": "source of data and confidence level"
}

IMPORTANT: Look in the listing description text for renovation info like "New roof 2024" → set roofYearUpdated. Check "Facts & Features" sections thoroughly. Use null for any field you cannot find. Only include data for THIS SPECIFIC address. Return null for ANY field you cannot find explicitly stated in the source data. Never infer, estimate, or use typical values for this property type or neighborhood.`;

  try {
    // askWithSearch returns { text, grounded, groundingMetadata }
    const searchResult = await ai.askWithSearch(systemPrompt, userPrompt, {
      temperature: 0.1,
      maxTokens: 4096
    });

    const text = searchResult?.text || (typeof searchResult === 'string' ? searchResult : '');

    diag.searchResponseLength = text.length;
    diag.aiProvider = ai.provider;
    console.log(`[Zillow] AI response (${text.length} chars): ${text.substring(0, 200)}`);

    if (!text) {
      console.log('[Zillow] Empty AI response');
      return null;
    }

    const raw = extractJSON(text);
    if (!raw) {
      console.log('[Zillow] No JSON found in AI response');
      diag.searchNoJson = true;
      return null;
    }

    const nonNullKeys = Object.keys(raw).filter(k => raw[k] != null && k !== 'notes');

    if (nonNullKeys.length < 2) {
      console.log(`[Zillow] Only ${nonNullKeys.length} non-null fields, skipping`);
      diag.searchFieldCount = nonNullKeys.length;
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
      source: ai.isGoogle ? 'gemini-search' : `${ai.provider}-search`,
      zillowUrl: `https://www.zillow.com/homes/${buildSlug(address, city, state, zip || '')}_rb/`
    };
  } catch (err) {
    diag.searchError = err.message;
    console.log(`[Zillow] AI error: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Rentcast property data helper
// ---------------------------------------------------------------------------
async function fetchRentcastData(address, city, state, zip) {
  if (!process.env.RENTCAST_API_KEY) {
    console.log('[Rentcast] Skipped — RENTCAST_API_KEY not set');
    return null;
  }

  const params = new URLSearchParams({ address, city, state, limit: '1' });
  if (zip) params.set('zipCode', zip);

  const url = `https://api.rentcast.io/v1/properties?${params.toString()}`;
  console.log(`[Rentcast] Requesting: ${url}`);

  let response;
  try {
    response = await fetch(url, {
      headers: { 'X-Api-Key': process.env.RENTCAST_API_KEY, 'Accept': 'application/json' },
    });
  } catch (err) {
    console.log(`[Rentcast] Error: ${err.message}`);
    throw err;
  }

  console.log(`[Rentcast] Response status: ${response.status}`);
  console.log('[Rentcast] Headers:', JSON.stringify(Object.fromEntries(response.headers.entries())));

  if (response.status === 404) {
    console.log('[Rentcast] Miss — 404 status');
    return null;
  }
  if (!response.ok) {
    const msg = `Rentcast ${response.status}: ${response.statusText}`;
    console.log(`[Rentcast] Error: ${msg}`);
    throw new Error(msg);
  }

  const json = await response.json();
  if (!Array.isArray(json) || json.length === 0) {
    console.log('[Rentcast] Miss — empty array returned');
    return null;
  }

  const p = json[0];
  const f = p.features || {};

  const mapped = {};
  if (p.yearBuilt != null)       mapped.yearBuilt       = p.yearBuilt;
  if (p.squareFootage != null)   mapped.totalSqft       = p.squareFootage;
  if (p.bedrooms != null)        mapped.bedrooms        = p.bedrooms;
  if (p.bathrooms != null)       mapped.fullBaths       = p.bathrooms;
  if (f.floorCount != null)      mapped.stories         = f.floorCount;       // Bug 1 fix: was p.stories (doesn't exist top-level)
  if (f.garageType != null)      mapped.garageType      = f.garageType;       // Bug 8 fix: was p.garageType (field is in features)
  if (f.garageSpaces != null)    mapped.garageSpaces    = f.garageSpaces;     // Bug 9 fix: was p.garageSpaces (field is in features)
  if (f.roofType != null)        mapped.roofType        = f.roofType;         // Bug 10 fix: was p.roofType (field is in features)
  if (p.lotSize != null)         mapped.lotSize         = p.lotSize;
  if (f.heatingType != null)     mapped.heatingType     = f.heatingType;      // Bug 4 fix: was f.heating (boolean flag)
  if (f.coolingType != null)     mapped.cooling         = f.coolingType;      // Bug 5 fix: was f.cooling (boolean flag)
  if (f.exteriorType != null)    mapped.exteriorWalls   = f.exteriorType;     // Bug 6 fix: was f.exteriorWalls (field is exteriorType)
  if (f.foundationType != null)  mapped.foundationType  = f.foundationType;  // Bug 7 fix: was f.foundation (field is foundationType)
  if (f.pool != null)            mapped.pool            = f.pool === true ? 'Yes' : f.pool === false ? 'No' : null;
  if (f.sewer != null)           mapped.sewer           = f.sewer;
  if (f.waterSource != null)     mapped.waterSource     = f.waterSource;
  if (f.architectureType != null) mapped.architectureType = f.architectureType;
  if (p.hoa?.fee != null)         mapped.hoaFee           = p.hoa.fee;
  if (f.fireplaceType != null)    mapped.fireplaceType    = f.fireplaceType;
  if (f.viewType != null)         mapped.viewType         = f.viewType;
  // Bug 2 fix: removed f.flooring — field does not exist in Rentcast schema; Gemini handles flooring
  // Bug 3 fix: removed f.fireplaces — no numeric count field; Rentcast has features.fireplace (bool) + fireplaceType (string)

  // Remove null values introduced by the pool conditional
  Object.keys(mapped).forEach(k => { if (mapped[k] === null) delete mapped[k]; });

  mapped.notes = 'Rentcast (assessor/MLS records)';

  const fieldsFound = Object.keys(mapped).filter(k => k !== 'notes');
  const rawPreview = JSON.stringify(json[0]).slice(0, 300);
  console.log(`[Rentcast] Hit — raw: ${rawPreview}${rawPreview.length === 300 ? ' (truncated)' : ''}`);
  return { data: mapped, fieldsFound };
}

async function handleZillow(req, res) {
  const { address, city, state, zip, aiSettings } = req.body;

  if (!address || !city || !state) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters: address, city, state',
    });
  }

  console.log(`[Zillow] ===== Extracting: ${address}, ${city}, ${state} ${zip || ''} =====`);
  const startTime = Date.now();
  const diag = {};

  const ai = createRouter(aiSettings);

  // --- Try Rentcast first ---
  try {
    const rentcast = await fetchRentcastData(address, city, state, zip || '');
    if (rentcast) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[Zillow] Rentcast hit — ${rentcast.fieldsFound.length} fields (${elapsed}s)`);
      const rentcastSources = {};
      const sourceLabel = 'Rentcast (assessor/MLS records)';
      for (const key of Object.keys(rentcast.data)) {
        if (key !== 'notes' && rentcast.data[key] !== null && rentcast.data[key] !== undefined) {
          rentcastSources[key] = sourceLabel;
        }
      }
      return res.status(200).json({
        success: true,
        source: 'Rentcast',
        data: rentcast.data,
        fieldsFound: rentcast.fieldsFound,
        sources: rentcastSources,
        diagnostics: {},
        elapsedSeconds: parseFloat(elapsed),
      });
    }
    console.log('[Zillow] Rentcast miss — falling back to Gemini');
  } catch (rentErr) {
    console.warn('[Zillow] Rentcast error, falling back to Gemini:', rentErr.message);
  }

  try {
    const result = await fetchViaGeminiSearch(address, city, state, zip || '', diag, ai);
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

    const { data, fieldsFound, sources } = mapZillowToAltech(result.raw);

    console.log(`[Zillow] Success: ${fieldsFound.length} fields via ${result.source} (${elapsed}s)`);

    return res.status(200).json({
      success: true,
      source: result.source,
      zillowUrl: result.zillowUrl,
      data,
      fieldsFound,
      sources,
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

async function handler(req, res) {
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
      case 'rentcast': {
        const { address, city, state, zip } = req.body || {};
        if (!address || !city || !state) {
          return res.status(400).json({ error: 'Missing required fields: address, city, state' });
        }
        try {
          const result = await fetchRentcastData(address, city, state, zip || '');
          if (!result) return res.status(404).json({ error: 'not_found' });
          return res.status(200).json({ success: true, source: 'Rentcast', ...result });
        } catch (e) {
          return res.status(500).json({ success: false, error: e.message });
        }
      }
      case 'firestation':
        return await handleFireStation(req, res);
      case 'rag-interpret':
        return await ragHandler(req, res);
      case 'validate-address':
        return await handleValidateAddress(req, res);
      default:
        return res.status(400).json({
          error: `Invalid mode "${mode}". Use ?mode=arcgis|satellite|zillow|rentcast|firestation|rag-interpret|validate-address`
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

// ===========================================================================
// ADDRESS VALIDATION (Google Address Validation API)
// ===========================================================================
async function handleValidateAddress(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { address } = req.body || {};
  if (!address || typeof address !== 'string' || !address.trim()) {
    return res.status(400).json({ error: 'address is required' });
  }
  const apiKey = getMapsApiKey();
  if (!apiKey) return res.status(500).json({ error: 'Google API key not configured' });

  // Try Address Validation API first; fall back to Geocoding API if blocked/not enabled.
  let raw;
  let usedFallback = false;
  try {
    const response = await fetch(
      `https://addressvalidation.googleapis.com/v1:validateAddress?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: { addressLines: [address.trim()] } })
      }
    );
    raw = await response.json();
    if (!response.ok) {
      // If the API is disabled/blocked, fall through to geocoding fallback.
      const errCode = raw.error?.status || '';
      if (response.status === 403 || errCode === 'PERMISSION_DENIED' || errCode === 'API_KEY_HTTP_REFERRER_BLOCKED') {
        usedFallback = true;
      } else {
        return res.status(response.status).json({
          error: raw.error?.message || 'Address Validation API error'
        });
      }
    }
  } catch (fetchErr) {
    usedFallback = true; // Network error — try geocoding
  }

  if (usedFallback) {
    return await _geocodingFallback(address.trim(), apiKey, res);
  }

  const verdict = raw.result?.verdict || {};
  const addr = raw.result?.address || {};
  const comps = addr.addressComponents || [];
  const deliverability = verdict.deliverability || 'UNKNOWN';
  const missing = comps
    .filter(c => c.confirmationLevel === 'UNCONFIRMED_AND_SUSPICIOUS')
    .map(c => c.componentType);
  const unconfirmed = comps
    .filter(c => c.confirmationLevel === 'UNCONFIRMED_BUT_PLAUSIBLE')
    .map(c => c.componentType);
  const inferred = comps
    .filter(c => c.inferred)
    .map(c => c.componentType);

  // Additional signals from Address Validation API response
  const uspsData = raw.result?.uspsData || {};
  const dpvMatchCode = uspsData.dpvMatchCode || '';
  const dpvFootnote = uspsData.dpvFootnote || '';
  const geocodeGranularity = verdict.geocodeGranularity || '';
  const inputHasUnit = /\bapt\b|\bunit\b|\bste\b|\bsuite\b|\b#\s*\d|\bfloor\b|\bfl\.?\s*\d|\broom\b/i.test(address);

  // Multi-unit detection: explicit subpremise flags OR building-level geocode OR USPS secondary required
  const isMultiUnit = !inputHasUnit && (
    missing.includes('subpremise') ||
    unconfirmed.includes('subpremise') ||
    geocodeGranularity === 'PREMISE' ||              // Geocoded to building, not a specific unit
    dpvMatchCode === 'S' ||                          // USPS: secondary address info required
    dpvFootnote.includes('S') ||                     // USPS: high-rise default
    // Address incomplete but street/number are valid → missing unit is likely cause
    (!verdict.addressComplete &&
     !missing.includes('street_number') &&
     !missing.includes('route') &&
     geocodeGranularity !== '')
  );

  let likelyReturnReason;
  if (isMultiUnit) {
    likelyReturnReason = 'Apartment complex or multi-unit building — add apartment or unit number';
  } else if (deliverability === 'UNDELIVERABLE') {
    likelyReturnReason = 'Address not recognized — street number may not exist or street name may be incorrect';
  } else if (inferred.includes('street_number')) {
    likelyReturnReason = 'Street number could not be confirmed — may be invalid for this street';
  } else if (comps.some(c => c.componentType === 'post_box')) {
    likelyReturnReason = 'PO Box address — USPS may not deliver carrier route mail here';
  } else if (deliverability === 'POSSIBLY_DELIVERABLE' && unconfirmed.length) {
    likelyReturnReason = 'Address is incomplete or ambiguous — missing details that USPS requires';
  } else if (deliverability === 'DELIVERABLE' && verdict.addressComplete) {
    likelyReturnReason = 'Address appears valid — return reason may be occupant-related (moved, refused, unknown)';
  } else {
    likelyReturnReason = 'Could not determine return reason — review address manually';
  }
  const _encodedAddr = encodeURIComponent(addr.formattedAddress || address.trim());
  const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=600x340&location=${_encodedAddr}&fov=80&pitch=0&key=${apiKey}`;
  const satelliteUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${_encodedAddr}&zoom=19&size=600x340&maptype=satellite&key=${apiKey}`;
  return res.status(200).json({
    standardizedAddress: addr.formattedAddress || address.trim(),
    deliverability,
    missingComponents: missing,
    unconfirmedComponents: unconfirmed,
    inferredComponents: inferred,
    likelyReturnReason,
    isMultiUnit,
    rawVerdict: verdict,
    streetViewUrl,
    satelliteUrl
  });
}

// Geocoding API fallback for when Address Validation API is not enabled on the key.
async function _geocodingFallback(address, apiKey, res) {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'ZERO_RESULTS' || !data.results?.length) {
      return res.status(200).json({
        standardizedAddress: address,
        deliverability: 'UNDELIVERABLE',
        missingComponents: [],
        unconfirmedComponents: [],
        inferredComponents: [],
        likelyReturnReason: 'Address not recognized — street number may not exist or street name may be incorrect',
        rawVerdict: {},
        source: 'geocoding'
      });
    }

    const result = data.results[0];
    const formatted = result.formatted_address || address;
    const partial = result.partial_match === true;
    const types = result.types || [];
    const comps = result.address_components || [];

    // Approximate deliverability from geocoding data.
    let deliverability;
    if (data.status !== 'OK') {
      deliverability = 'UNKNOWN';
    } else if (partial || types.includes('route') || types.includes('locality')) {
      deliverability = 'POSSIBLY_DELIVERABLE';
    } else {
      deliverability = 'DELIVERABLE';
    }

    // Check for missing unit/subpremise clue.
    const hasSubpremise = comps.some(c => c.types.includes('subpremise'));
    const isPoBox = comps.some(c => c.types.includes('post_box'));
    const locationType = result.geometry?.location_type || '';

    // Detect multi-unit buildings: various geocoding signals for building-level matches.
    const inputHasUnit = /\bapt\b|\bunit\b|\bste\b|\bsuite\b|\b#\s*\d|\bfloor\b|\bfl\.?\s*\d|\broom\b/i.test(address);
    const isMultiUnit = !inputHasUnit && (
      types.includes('premise') ||
      (types.includes('establishment') && !types.includes('street_address')) ||
      comps.some(c => c.types.includes('premise')) ||        // Component-level premise type
      data.results.length > 1                                // Multiple matches = ambiguous address
    );

    if (isMultiUnit) {
      deliverability = 'POSSIBLY_DELIVERABLE';
    } else if (locationType === 'RANGE_INTERPOLATED' || locationType === 'APPROXIMATE') {
      // Less precise geocode — address was estimated, not a confirmed delivery point
      if (deliverability === 'DELIVERABLE') deliverability = 'POSSIBLY_DELIVERABLE';
    }

    let likelyReturnReason;
    if (deliverability === 'UNDELIVERABLE') {
      likelyReturnReason = 'Address not recognized — street number may not exist or street name may be incorrect';
    } else if (isPoBox) {
      likelyReturnReason = 'PO Box address — USPS may not deliver carrier route mail here';
    } else if (isMultiUnit) {
      likelyReturnReason = 'Apartment complex or multi-unit building — add apartment or unit number';
    } else if (partial) {
      likelyReturnReason = 'Address is incomplete or ambiguous — missing details that USPS requires';
    } else if (!hasSubpremise && (address.match(/\bapt\b|\bunit\b|\bste\b|\bsuite\b|\b#/i))) {
      likelyReturnReason = 'Unit number may be unrecognized — verify apartment or suite number';
    } else if (deliverability === 'DELIVERABLE') {
      likelyReturnReason = 'Address appears valid — return reason may be occupant-related (moved, refused, unknown)';
    } else {
      likelyReturnReason = 'Could not determine return reason — review address manually';
    }

    const _encodedFmt = encodeURIComponent(formatted);
    const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=600x340&location=${_encodedFmt}&fov=80&pitch=0&key=${apiKey}`;
    const satelliteUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${_encodedFmt}&zoom=19&size=600x340&maptype=satellite&key=${apiKey}`;

    return res.status(200).json({
      standardizedAddress: formatted,
      deliverability,
      missingComponents: [],
      unconfirmedComponents: [],
      inferredComponents: [],
      likelyReturnReason,
      isMultiUnit,
      rawVerdict: {},
      source: 'geocoding',
      streetViewUrl,
      satelliteUrl
    });
  } catch (err) {
    return res.status(502).json({ error: 'Address lookup failed — check that the address is correct' });
  }
}

export default securityMiddleware(handler);
