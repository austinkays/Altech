/**
 * Google Places business profile lookup.
 * Supports: (a) direct placeId → full details; (b) text search → first-match details;
 * (c) discover mode → multiple candidates with basic info.
 */

// State centroids for location-biased text search (lat, lng, radius meters)
const STATE_CENTROIDS = {
  WA: { lat: 47.3826, lng: -120.4472, radius: 300000 },
  OR: { lat: 43.8041, lng: -120.5542, radius: 300000 },
  AZ: { lat: 34.0489, lng: -111.0937, radius: 350000 },
  CA: { lat: 36.7783, lng: -119.4179, radius: 500000 },
  ID: { lat: 44.0682, lng: -114.7420, radius: 300000 },
  NV: { lat: 38.8026, lng: -116.4194, radius: 350000 },
};

/**
 * Extract 2-letter state code from a formatted address.
 * e.g. "194 Deweys Pier Rd, Columbia, NC 27925, USA" → "NC"
 */
function _extractStateFromAddress(address) {
  if (!address) return '';
  // ", ST ZIPCODE" pattern (US addresses)
  const match = address.match(/,\s*([A-Z]{2})\s+\d{5}/);
  if (match) return match[1];
  const parts = address.split(',').map(s => s.trim());
  for (const part of parts) {
    const stateMatch = part.match(/^([A-Z]{2})\s+\d{5}/);
    if (stateMatch) return stateMatch[1];
  }
  return '';
}

/**
 * Extract city from a formatted address.
 * e.g. "194 Deweys Pier Rd, Columbia, NC 27925, USA" → "Columbia"
 */
function _extractCityFromAddress(address) {
  if (!address) return '';
  const parts = address.split(',').map(s => s.trim());
  // City is usually the second-to-last part before "ST ZIP" and "COUNTRY"
  if (parts.length >= 3) return parts[parts.length - 3] || '';
  if (parts.length >= 2) return parts[0] || '';
  return '';
}

export async function handlePlacesLookup(query) {
  const { name, city, state, placeId: directPlaceId, discover } = query;

  const apiKey = (process.env.PLACES_API_KEY || process.env.GOOGLE_PLACES_API_KEY || '').trim();
  if (!apiKey) {
    return { success: true, available: false, note: 'Google Places not configured' };
  }

  // ── Direct Place Details lookup (Phase 2 with known placeId) ──
  if (directPlaceId) {
    console.log('[Places Lookup] Direct details for placeId:', directPlaceId);
    try {
      return await _getPlaceDetails(directPlaceId, name || '', apiKey);
    } catch (error) {
      console.error('[Places Lookup] Direct details error:', error);
      return { success: true, available: false, note: 'Google Places details lookup failed' };
    }
  }

  if (!name) {
    return { success: false, available: false, error: 'Missing required parameter: name' };
  }

  console.log('[Places Lookup] Searching for:', { name, city, state, discover });

  try {
    // Build text query biased by state centroid
    const searchQuery = `${name}${city ? ' ' + city : ''}${state ? ' ' + state : ''}`;
    let searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`;

    const centroid = state ? STATE_CENTROIDS[state] : null;
    if (centroid) {
      searchUrl += `&location=${centroid.lat},${centroid.lng}&radius=${centroid.radius}`;
    }

    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) {
      console.warn('[Places] Text Search failed:', searchRes.status);
      return { success: true, available: false, note: 'Google Places search failed' };
    }

    const searchData = await searchRes.json();
    if (!searchData.results?.length) {
      return { success: true, available: false, note: 'Business not found on Google Maps' };
    }

    // ── Discovery mode: return multiple candidates with basic info ──
    if (discover === 'true') {
      const candidates = searchData.results.slice(0, 5).map(r => {
        const resultState = _extractStateFromAddress(r.formatted_address);
        return {
          name: r.name || '',
          address: r.formatted_address || '',
          city: _extractCityFromAddress(r.formatted_address),
          state: resultState,
          stateMatch: resultState === state,
          placeId: r.place_id,
          rating: r.rating || null,
          totalReviews: r.user_ratings_total || 0,
          businessStatus: r.business_status || '',
          types: (r.types || []).filter(t => !t.startsWith('point_of_interest') && t !== 'establishment'),
          location: r.geometry?.location || null
        };
      });

      return {
        success: true,
        available: true,
        source: 'Google Places',
        multipleResults: true,
        results: candidates,
        count: candidates.length
      };
    }

    // ── Standard mode: full details for first result ──
    const placeId = searchData.results[0].place_id;
    return await _getPlaceDetails(placeId, searchData.results[0].name || name, apiKey, searchData.results[0]);
  } catch (error) {
    console.error('[Places Lookup] Error:', error);
    return { success: true, available: false, note: 'Google Places lookup failed' };
  }
}

/**
 * Full Place Details for a known placeId.
 * Used by both standard text-search path and Phase 2 direct placeId path.
 */
async function _getPlaceDetails(placeId, fallbackName, apiKey, basicResult) {
  const detailFields = [
    'name', 'formatted_address', 'formatted_phone_number', 'international_phone_number',
    'website', 'url', 'rating', 'user_ratings_total', 'reviews',
    'opening_hours', 'business_status', 'types', 'price_level',
    'address_components', 'geometry', 'photos', 'plus_code'
  ].join(',');

  const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${detailFields}&key=${apiKey}`;

  const detailRes = await fetch(detailUrl);
  let detail = {};
  if (detailRes.ok) {
    const detailData = await detailRes.json();
    detail = detailData.result || {};
  }

  const reviews = (detail.reviews || []).slice(0, 5).map(r => ({
    author: r.author_name || 'Anonymous',
    rating: r.rating,
    text: (r.text || '').substring(0, 300),
    time: r.relative_time_description || '',
    profileUrl: r.author_url || ''
  }));

  const photos = (detail.photos || []).slice(0, 3).map(p => ({
    reference: p.photo_reference,
    width: p.width,
    height: p.height,
    attribution: (p.html_attributions || [])[0] || ''
  }));

  const br = basicResult || {};

  return {
    success: true,
    available: true,
    source: 'Google Places',
    profile: {
      name: detail.name || br.name || fallbackName,
      address: detail.formatted_address || br.formatted_address || '',
      phone: detail.formatted_phone_number || '',
      internationalPhone: detail.international_phone_number || '',
      website: detail.website || '',
      googleMapsUrl: detail.url || `https://www.google.com/maps/place/?q=place_id:${placeId}`,
      rating: detail.rating || br.rating || null,
      totalReviews: detail.user_ratings_total || br.user_ratings_total || 0,
      businessStatus: detail.business_status || br.business_status || '',
      types: (detail.types || br.types || []).filter(t => !t.startsWith('point_of_interest') && t !== 'establishment'),
      priceLevel: detail.price_level ?? null,
      hours: detail.opening_hours?.weekday_text || [],
      isOpen: detail.opening_hours?.open_now ?? null,
      reviews,
      photos,
      placeId,
      location: detail.geometry?.location || br.geometry?.location || null
    }
  };
}
