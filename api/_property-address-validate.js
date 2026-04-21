/**
 * Address Validation (?mode=validate-address).
 *
 * Uses Google Address Validation API first; falls back to Geocoding API
 * when the Validation API is blocked or returns PERMISSION_DENIED.
 * Both paths return the same shape: { standardizedAddress, deliverability,
 * missingComponents, unconfirmedComponents, inferredComponents,
 * likelyReturnReason, isMultiUnit, rawVerdict, streetViewUrl, satelliteUrl }.
 */

import { getMapsApiKey } from './_property-shared.js';

const UNIT_REGEX = /\bapt\b|\bunit\b|\bste\b|\bsuite\b|\b#\s*\d|\bfloor\b|\bfl\.?\s*\d|\broom\b/i;

export async function handleValidateAddress(req, res) {
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

  // Signals from Address Validation API response
  const uspsData = raw.result?.uspsData || {};
  const dpvMatchCode = uspsData.dpvMatchCode || '';
  const dpvFootnote = uspsData.dpvFootnote || '';
  const geocodeGranularity = verdict.geocodeGranularity || '';
  const inputHasUnit = UNIT_REGEX.test(address);

  // Multi-unit detection: explicit subpremise flags OR building-level geocode OR USPS secondary required
  const isMultiUnit = !inputHasUnit && (
    missing.includes('subpremise') ||
    unconfirmed.includes('subpremise') ||
    geocodeGranularity === 'PREMISE' ||              // Geocoded to building, not a specific unit
    dpvMatchCode === 'S' ||                          // USPS: secondary address info required
    dpvFootnote.includes('S') ||                     // USPS: high-rise default
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
  const encodedAddr = encodeURIComponent(addr.formattedAddress || address.trim());
  const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=600x340&location=${encodedAddr}&fov=80&pitch=0&key=${apiKey}`;
  const satelliteUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${encodedAddr}&zoom=19&size=600x340&maptype=satellite&key=${apiKey}`;
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

    const hasSubpremise = comps.some(c => c.types.includes('subpremise'));
    const isPoBox = comps.some(c => c.types.includes('post_box'));
    const locationType = result.geometry?.location_type || '';

    // Multi-unit detection: building-level geocode signals
    const inputHasUnit = UNIT_REGEX.test(address);
    const isMultiUnit = !inputHasUnit && (
      types.includes('premise') ||
      (types.includes('establishment') && !types.includes('street_address')) ||
      comps.some(c => c.types.includes('premise')) ||
      data.results.length > 1                                // Multiple matches = ambiguous address
    );

    if (isMultiUnit) {
      deliverability = 'POSSIBLY_DELIVERABLE';
    } else if (locationType === 'RANGE_INTERPOLATED' || locationType === 'APPROXIMATE') {
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

    const encodedFmt = encodeURIComponent(formatted);
    const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=600x340&location=${encodedFmt}&fov=80&pitch=0&key=${apiKey}`;
    const satelliteUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${encodedFmt}&zoom=19&size=600x340&maptype=satellite&key=${apiKey}`;

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
