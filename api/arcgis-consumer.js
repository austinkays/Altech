/**
 * ArcGIS REST API Consumer
 * 
 * Phase 1: API Consumption Enhancement
 * 
 * This endpoint queries official ArcGIS REST APIs from county assessors
 * to retrieve structured property data (parcel info, lot size, construction details).
 * 
 * COUNTY ENDPOINTS SUPPORTED:
 * - Clark County, WA: https://arcgis.clark.wa.gov/arcgis/rest/services/...
 * - King County, WA: https://gis.kingcounty.gov/arcgis/rest/services/...
 * - Pierce County, WA: https://gis.piercecountywa.gov/arcgis/rest/services/...
 * - Multnomah County, OR: https://ggis.multco.us/arcgis/rest/services/...
 * 
 * FALLBACK: If county API unavailable, returns null (falls back to headless browser in Phase 2)
 */

/**
 * County ArcGIS endpoint configurations
 * Each county has a different API structure; this maps them
 */
const COUNTY_ARCGIS_CONFIG = {
  'Clark': {
    state: 'WA',
    baseUrl: 'https://arcgis.clark.wa.gov/arcgis/rest/services/Assessor/Parcels/MapServer',
    queryService: 0, // Layer index for parcel search
    fields: ['OBJECTID', 'PARCEL_NUMBER', 'OWNER_NAME', 'LAND_USE_CODE', 'TOTAL_LAND_AREA_ACRES', 'YEAR_BUILT', 'BASEMENT_AREA', 'MAIN_FLOOR_AREA', 'UPPER_FLOOR_AREA', 'GARAGE_TYPE'],
    searchField: 'PARCEL_NUMBER'
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
    baseUrl: 'https://ggis.multco.us/arcgis/rest/services/public/Assessor/MapServer',
    queryService: 0,
    fields: ['OBJECTID', 'ACCOUNT_NUMBER', 'OWNER_NAME', 'LAND_USE_STANDARD', 'LOT_SIZE_ACRES', 'YEAR_BUILT', 'TOTAL_LIVING_AREA', 'GARAGE_SQFT', 'STORIES'],
    searchField: 'ACCOUNT_NUMBER'
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

/**
 * State-Level Aggregators (Fallback for all counties in state)
 * These cover 90+ counties with 3 endpoints
 */
const STATE_AGGREGATORS = {
  'WA': {
    name: 'Washington State Parcels',
    baseUrl: 'https://services.arcgis.com/jsu8Pl9v95EonZ7L/arcgis/rest/services/Washington_Parcels/FeatureServer',
    queryService: 0,
    fields: ['OBJECTID', 'PARCEL_ID', 'PARCEL_NUMBER', 'COUNTY_NAME', 'OWNER_NAME', 'YEAR_BUILT', 'TOTAL_SQ_FT', 'LOT_ACRES', 'LAND_USE', 'ASSESSED_VALUE'],
    searchField: 'PARCEL_ID',
    coverage: 39 // 39 WA counties
  },
  'OR': {
    name: 'Oregon ORMAP Tax Lots',
    baseUrl: 'https://gis.odf.oregon.gov/ags1/rest/services/WebMercator/TaxlotsDisplay/MapServer',
    queryService: 0,
    fields: ['OBJECTID', 'TAXLOT', 'COUNTY', 'TOWNSHIP', 'RANGE', 'SECTION', 'MAP_TAXLOT'],
    searchField: 'TAXLOT',
    coverage: 36 // 36 OR counties
  },
  'AZ': {
    name: 'Arizona Counties',
    baseUrl: 'https://azgeo.az.gov/arcgis/rest/services/asld/Counties/MapServer',
    queryService: 0,
    fields: ['OBJECTID', 'COUNTY_NAME', 'FIPS_CODE', 'AREA_SQ_MI'],
    searchField: 'COUNTY_NAME',
    coverage: 15 // 15 AZ counties
  }
};

/**
 * Map of which state each county belongs to (for fallback logic)
 */
const COUNTY_TO_STATE = {
  // Washington counties not individually configured
  'Thurston': 'WA', 'Whatcom': 'WA', 'Yakima': 'WA', 'Kitsap': 'WA', 'Cowlitz': 'WA',
  'Skagit': 'WA', 'Benton': 'WA', 'Franklin': 'WA', 'Walla Walla': 'WA', 'Chelan': 'WA',
  // Oregon counties not individually configured
  'Clackamas': 'OR', 'Lane': 'OR', 'Marion': 'OR', 'Deschutes': 'OR', 'Jackson': 'OR',
  'Linn': 'OR', 'Douglas': 'OR', 'Yamhill': 'OR', 'Polk': 'OR', 'Josephine': 'OR',
  // Arizona counties
  'Maricopa': 'AZ', 'Pima': 'AZ', 'Pinal': 'AZ', 'Yavapai': 'AZ', 'Coconino': 'AZ',
  'Mohave': 'AZ', 'Yuma': 'AZ', 'Apache': 'AZ', 'Navajo': 'AZ', 'Cochise': 'AZ'
};

/**
 * Query ArcGIS Feature Service by location (lat/lng)
 * Returns property parcel data if found
 * Implements hybrid approach: Try individual county first, fall back to state aggregator
 */
async function queryByLocation(latitude, longitude, countyName, state) {
  console.log(`[ArcGIS Consumer] Querying parcel at ${latitude}, ${longitude} in ${countyName} County, ${state}`);

  // Priority 1: Try individual county configuration (rich data)
  const countyConfig = COUNTY_ARCGIS_CONFIG[countyName];
  if (countyConfig) {
    console.log(`[ArcGIS Consumer] Trying individual county API for ${countyName}`);
    const result = await queryEndpoint(latitude, longitude, countyConfig, countyName);
    console.log(`[ArcGIS Consumer] Individual county API result:`, result.success ? 'SUCCESS' : `FAILED: ${result.error}`);
    if (result.success) {
      return result;
    }
  } else {
    console.log(`[ArcGIS Consumer] No individual county config found for ${countyName}`);
  }

  // Priority 2: Fall back to state aggregator (broader coverage)
  const stateCode = state || COUNTY_TO_STATE[countyName];
  if (stateCode && STATE_AGGREGATORS[stateCode]) {
    const stateConfig = STATE_AGGREGATORS[stateCode];
    console.log(`[ArcGIS Consumer] Trying state aggregator for ${stateCode}`);
    const result = await queryEndpoint(latitude, longitude, stateConfig, countyName);
    console.log(`[ArcGIS Consumer] State aggregator result:`, result.success ? 'SUCCESS' : `FAILED: ${result.error}`);
    if (result.success) {
      result.source = `${stateConfig.name} (State Aggregator)`;
      return result;
    }
  }

  console.error(`[ArcGIS Consumer] All methods failed for ${countyName} County`);
  return { success: false, error: 'County not configured for API access', county: countyName };
}

/**
 * Query a specific endpoint configuration
 */
async function queryEndpoint(latitude, longitude, config, countyName) {
  if (!config) {
    return { success: false, error: 'No configuration provided' };
  }

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
    console.log(`[ArcGIS Consumer] Querying: ${fullUrl.substring(0, 200)}...`);

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    console.log(`[ArcGIS Consumer] Response status: ${response.status}`);

    if (!response.ok) {
      console.error(`[ArcGIS Consumer] HTTP error ${response.status}`);
      return { success: false, error: `HTTP ${response.status}`, county: countyName };
    }

    const data = await response.json();
    console.log(`[ArcGIS Consumer] Response data:`, JSON.stringify(data).substring(0, 300));

    if (data.error) {
      console.error(`[ArcGIS Consumer] API error:`, data.error.message);
      return { success: false, error: data.error.message, county: countyName };
    }

    if (!data.features || data.features.length === 0) {
      console.warn(`[ArcGIS Consumer] No features found. Response:`, data);
      return { success: false, error: 'No parcel found at location', county: countyName };
    }

    console.log(`[ArcGIS Consumer] Found ${data.features.length} parcel(s)`);

    // Normalize first result to common format
    const parcel = data.features[0];
    const normalized = normalizeParcelData(parcel, countyName);

    return {
      success: true,
      county: countyName,
      parcelData: normalized,
      rawResponse: parcel.attributes
    };
  } catch (error) {
    console.error(`[ArcGIS Consumer] Exception in queryEndpoint:`, error);
    return { success: false, error: error.message, county: countyName };
  }
}

/**
 * Query by address string
 * First geocodes address, then queries parcel data
 */
async function queryByAddress(address, city, state, countyName) {
  try {
    console.log(`[ArcGIS Consumer] Geocoding address: ${address}, ${city}, ${state}`);

    // Step 1: Geocode address to lat/lng using Google Maps API
    const googleApiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
    if (!googleApiKey) {
      console.error('[ArcGIS Consumer] Google API key not configured');
      return { success: false, error: 'Google API key not configured' };
    }

    const fullAddress = `${address}, ${city}, ${state}`;
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${googleApiKey}`;

    const geocodeResponse = await fetch(geocodeUrl);
    const geocodeData = await geocodeResponse.json();

    if (geocodeData.results.length === 0) {
      console.error('[ArcGIS Consumer] Address not found by Google Geocoding');
      return { success: false, error: 'Address not found', address: fullAddress };
    }

    const location = geocodeData.results[0].geometry.location;
    console.log(`[ArcGIS Consumer] Geocoded to: ${location.lat}, ${location.lng}`);

    // Step 2: Query parcel data at that location (pass state for aggregator fallback)
    return await queryByLocation(location.lat, location.lng, countyName, state);
  } catch (error) {
    console.error('[ArcGIS Consumer] Error in queryByAddress:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Normalize parcel data to common format
 * Different counties return different field names; standardize them
 */
function normalizeParcelData(parcel, countyName) {
  const attrs = parcel.attributes || {};
  const geometry = parcel.geometry || {};

  const normalized = {
    countyName,
    // Parcel ID - handle different county field names + state aggregators
    parcelId: attrs.PARCEL_NUMBER || attrs.PARCELID || attrs.ACCOUNT_NUMBER || attrs.PARCEL_NUMBER_ALTERNATE || attrs.PARCEL_ID || attrs.PID_NUM || attrs.TLID || attrs.TAXLOT || attrs.MAP_TAXLOT || 'N/A',

    // Owner name
    ownerName: attrs.OWNER_NAME || attrs.owner_name || 'N/A',

    // Land use
    landUse: attrs.LAND_USE_CODE || attrs.USE1_DESC || attrs.LAND_USE_STANDARD || attrs.prop_use_desc || attrs.LANDUSE || attrs.LAND_USE || 'N/A',

    // Lot size (acres) - state aggregators use LOT_ACRES
    lotSizeAcres: parseFloat(attrs.TOTAL_LAND_AREA_ACRES || attrs.LOT_SIZE_ACRES || attrs.acreage || attrs.A_T_ACRES || attrs.LOT_ACRES || 0) || 0,

    // Year built - state aggregators may have different field names
    yearBuilt: parseInt(attrs.YEAR_BUILT || attrs.YEARBUILT || attrs.InspectionYear || attrs.YR_BUILT || 0) || 0,

    // Area calculations - state aggregators use TOTAL_SQ_FT
    basementSqft: parseFloat(attrs.BASEMENT_AREA || attrs.BASEMENT_SQFT || 0) || 0,
    mainFloorSqft: parseFloat(attrs.MAIN_FLOOR_AREA || attrs.UPPER_FLOOR_AREA || 0) || 0,
    totalSqft: parseFloat(attrs.TOT_SQFT || attrs.TOTAL_LIVING_AREA || attrs.BLDG_SQFT || attrs.BLDGSQFT || attrs.TOTAL_SQ_FT || attrs.SQFT_GROSS || 0) || 0,
    garageSqft: parseFloat(attrs.GARAGE_SQFT || attrs.GARAGE || 0) || 0,

    // Garage type
    garageType: attrs.GARAGE_TYPE || 'N/A',

    // Stories
    stories: parseInt(attrs.STORIES || 0) || 0,

    // Roof type
    roofType: attrs.ROOF_TYPE || 'N/A',

    // Foundation type (Snohomish has this!)
    foundationType: attrs.FOUNDATION || 'Unknown',

    // Bedrooms (Snohomish has this!)
    bedrooms: parseInt(attrs.BEDROOMS || 0) || 0,

    // Bathrooms (Snohomish has this!)
    bathrooms: parseFloat(attrs.BATHS || attrs.BATHROOMS || 0) || 0,

    // Site address (for some counties)
    siteAddress: attrs.SITE_ADDR || attrs.site_address || attrs.SITEADDR || '',

    // Site city
    siteCity: attrs.site_city || attrs.SITECITY || '',

    // Assessed value (Washington County OR + state aggregators)
    assessedValue: parseFloat(attrs.ASSESSVAL || attrs.ASSESSED_VALUE || 0) || 0,

    // County name (state aggregators include this)
    aggregatorCounty: attrs.COUNTY_NAME || attrs.COUNTY || '',

    // Coordinates
    latitude: geometry.y || attrs.LATITUDE || 0,
    longitude: geometry.x || attrs.LONGITUDE || 0
  };

  return normalized;
}

/**
 * Main handler function
 * Vercel serverless function entry point
 */
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { address, city, state, county } = req.query;

    // Validate inputs
    if (!address || !city || !state || !county) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: address, city, state, county'
      });
    }

    // Query ArcGIS API
    const result = await queryByAddress(address, city, state, county);

    res.status(200).json(result);
  } catch (error) {
    console.error('ArcGIS Consumer Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
