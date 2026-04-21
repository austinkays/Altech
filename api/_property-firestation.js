/**
 * Fire Station Distance + Protection Class estimation (?mode=firestation).
 * Uses Google Places (Nearby → Radius → Text Search) with reliability tiers
 * (responding/volunteer/review) to filter out admin/training/museum results.
 */

import { getMapsApiKey } from './_property-shared.js';

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

// Admin offices, training centers, museums: not responding stations (no apparatus)
const NON_RESPONDING_KEYWORDS = [
  'training', 'training center', 'training facility',
  'admin', 'administrative', 'administration', 'headquarters',
  'museum', 'historical', 'historic',
  'prevention', 'fire prevention', 'fire marshal',
  'dispatch', 'communications',
];

function isRespondingStation(station) {
  const name = (station.name || '').toLowerCase();
  const hasNonRespondingKeyword = NON_RESPONDING_KEYWORDS.some(kw => name.includes(kw));
  if (hasNonRespondingKeyword && !name.includes('station')) {
    // "Training Center" fails but "Station 5 Training Center" passes
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

export async function handleFireStation(req, res) {
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

    // Step 2: Find nearest responding fire station — three fallback approaches
    let nearest = null;

    const findBestStation = (results) => {
      if (!results || results.length === 0) return null;
      const sorted = results
        .map(r => ({
          ...r,
          dist: haversineDistance(lat, lng, r.geometry.location.lat, r.geometry.location.lng),
          responding: isRespondingStation(r),
          reliability: classifyStationReliability(r)
        }))
        .sort((a, b) => a.dist - b.dist);

      const responding = sorted.find(s => s.responding);
      const skipped = sorted.filter(s => !s.responding).map(s => s.name);
      if (skipped.length > 0) {
        console.log(`[FireStation] Skipped non-responding: ${skipped.join(', ')}`);
      }
      return responding || sorted[0];
    };

    // Approach A: Nearby Search with rankby=distance
    const nearbyUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&rankby=distance&type=fire_station&key=${apiKey}`;
    console.log(`[FireStation] Trying Nearby Search (rankby=distance)...`);
    const nearbyResp = await fetch(nearbyUrl);
    const nearbyData = await nearbyResp.json();
    console.log(`[FireStation] Nearby Search status: ${nearbyData.status}, results: ${nearbyData.results?.length || 0}`);
    if (nearbyData.results && nearbyData.results.length > 0) {
      nearest = findBestStation(nearbyData.results);
    }

    // Approach B: Nearby Search with radius
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

    // Approach C: Text Search fallback
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
