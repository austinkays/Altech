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
  }
};

/**
 * Query ArcGIS Feature Service by location (lat/lng)
 * Returns property parcel data if found
 */
async function queryByLocation(latitude, longitude, countyName) {
  const config = COUNTY_ARCGIS_CONFIG[countyName];
  if (!config) {
    return { success: false, error: 'County not configured for API access', county: countyName };
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

    const response = await fetch(`${url}?${params}`, {
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
    return { success: false, error: error.message, county: countyName };
  }
}

/**
 * Query by address string
 * First geocodes address, then queries parcel data
 */
async function queryByAddress(address, city, state, countyName) {
  try {
    // Step 1: Geocode address to lat/lng using Google Maps API
    const googleApiKey = process.env.GOOGLE_API_KEY;
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

    // Step 2: Query parcel data at that location
    return await queryByLocation(location.lat, location.lng, countyName);
  } catch (error) {
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
    parcelId: attrs.PARCEL_NUMBER || attrs.PARCELID || attrs.ACCOUNT_NUMBER || attrs.PARCEL_NUMBER_ALTERNATE || 'N/A',
    ownerName: attrs.OWNER_NAME || 'N/A',
    landUse: attrs.LAND_USE_CODE || attrs.USE1_DESC || attrs.LAND_USE_STANDARD || 'N/A',
    lotSizeAcres: parseFloat(attrs.TOTAL_LAND_AREA_ACRES || attrs.LOT_SIZE_ACRES || 0) || 0,
    yearBuilt: parseInt(attrs.YEAR_BUILT || 0) || 0,
    basementSqft: parseFloat(attrs.BASEMENT_AREA || attrs.BASEMENT_SQFT || 0) || 0,
    mainFloorSqft: parseFloat(attrs.MAIN_FLOOR_AREA || attrs.UPPER_FLOOR_AREA || 0) || 0,
    totalSqft: parseFloat(attrs.TOT_SQFT || attrs.TOTAL_LIVING_AREA || 0) || 0,
    garageSqft: parseFloat(attrs.GARAGE_SQFT || 0) || 0,
    garageType: attrs.GARAGE_TYPE || 'N/A',
    stories: parseInt(attrs.STORIES || 0) || 0,
    roofType: attrs.ROOF_TYPE || 'N/A',
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
