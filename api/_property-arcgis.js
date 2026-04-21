/**
 * ArcGIS County Parcel Data + Clark County Fact Sheet Enrichment.
 * Provides handleArcgis() endpoint logic and underlying parcel query helpers.
 */

import { getMapsApiKey } from './_property-shared.js';
import { fetchFloodZone } from './_property-flood.js';

// ── Per-county endpoint configuration ────────────────────────────────────────
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

// ── Query helpers ────────────────────────────────────────────────────────────

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

// ── Clark County "Fact Sheet" enrichment ─────────────────────────────────────
// NOTE: Clark County retired reports.cfm in early 2026. The property info page
//       (gis.clark.wa.gov/gishome/property/) now requires reCAPTCHA with no
//       public API alternative. Building details for Clark County properties
//       are now provided by Gemini Search Grounding instead.
//       This function is kept for compatibility but short-circuits early.
async function fetchClarkFactSheet(accountNumber) {
  if (!accountNumber) return null;
  console.log(`[Clark FactSheet] DEPRECATED: reports.cfm endpoint no longer available. Building details will be fetched via Gemini Search Grounding instead.`);
  return null;
}

function enrichParcelWithFactSheet(parcelData, factSheet) {
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

// ── Endpoint handler (POST /api/property-intelligence?mode=arcgis) ───────────
export async function handleArcgis(req, res) {
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
  console.log('[ArcGIS] Flood prereqs — lat:', lat, ', lng:', lng, '| will call flood:', !!(lat && lng));

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
