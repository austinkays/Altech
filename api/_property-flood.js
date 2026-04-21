/**
 * FEMA NFHL Flood Zone Lookup (public endpoint — no API key required).
 * 5-second timeout; returns null on miss/error so callers can degrade gracefully.
 */

export async function fetchFloodZone(lat, lng) {
  console.log('[FloodZone] called with lat:', lat, 'lng:', lng);
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
