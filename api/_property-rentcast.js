/**
 * Rentcast property data helper.
 * Queries /v1/properties. Null on 404/miss, throws on other errors.
 * See docs/RENTCAST_API.md for field schema.
 */

export async function fetchRentcastData(address, city, state, zip) {
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
  if (f.floorCount != null)      mapped.stories         = f.floorCount;
  if (f.garageType != null)      mapped.garageType      = f.garageType;
  if (f.garageSpaces != null)    mapped.garageSpaces    = f.garageSpaces;
  if (f.roofType != null)        mapped.roofType        = f.roofType;
  if (p.lotSize != null)         mapped.lotSize         = p.lotSize;
  if (f.heatingType != null)     mapped.heatingType     = f.heatingType;
  if (f.coolingType != null)     mapped.cooling         = f.coolingType;
  if (f.exteriorType != null)    mapped.exteriorWalls   = f.exteriorType;
  if (f.foundationType != null)  mapped.foundationType  = f.foundationType;
  if (f.pool != null)            mapped.pool            = f.pool === true ? 'Yes' : f.pool === false ? 'No' : null;
  if (f.sewer != null)           mapped.sewer           = f.sewer;
  if (f.waterSource != null)     mapped.waterSource     = f.waterSource;
  if (f.architectureType != null) mapped.architectureType = f.architectureType;
  if (p.hoa?.fee != null)         mapped.hoaFee           = p.hoa.fee;
  if (f.fireplaceType != null)    mapped.fireplaceType    = f.fireplaceType;
  if (f.viewType != null)         mapped.viewType         = f.viewType;

  // Remove null values introduced by the pool conditional
  Object.keys(mapped).forEach(k => { if (mapped[k] === null) delete mapped[k]; });

  mapped.notes = 'Rentcast (assessor/MLS records)';

  const fieldsFound = Object.keys(mapped).filter(k => k !== 'notes');
  const rawPreview = JSON.stringify(json[0]).slice(0, 300);
  console.log(`[Rentcast] Hit — raw: ${rawPreview}${rawPreview.length === 300 ? ' (truncated)' : ''}`);
  return { data: mapped, fieldsFound };
}
