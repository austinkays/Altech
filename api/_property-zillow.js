/**
 * Property lookup via cascading tiered sources (?mode=zillow).
 *
 * Tier order: Rentcast → Apify Redfin → Apify Zillow → Gemini Search.
 * Each tier only runs if ≥3 critical fields are still missing.
 * Upstream (faster/more-structured) sources win on conflicts.
 */

import { createRouter, extractJSON } from './_ai-router.js';
import { buildSlug, mapZillowToAltech } from './_property-mapping.js';
import { fetchRentcastData } from './_property-rentcast.js';
import {
  countMissingCritical,
  fetchApifyRedfin,
  fetchApifyZillow,
  mergeApifyResult,
} from './_property-apify.js';

// ── Gemini Search Grounding: property facts via Google index ─────────────────
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

// ── Endpoint handler (POST /api/property-intelligence?mode=zillow) ───────────
export async function handleZillow(req, res) {
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
  const fullAddress = `${address}, ${city}, ${state}${zip ? ' ' + zip : ''}`;

  // Force Gemini for property search — search grounding is Google-exclusive
  const ai = createRouter({ provider: 'google' });

  let accumulated = { data: {}, fieldsFound: [], sources: {} };

  // --- Tier 1: Rentcast (fastest, most reliable) ---
  try {
    const rentcast = await fetchRentcastData(address, city, state, zip || '');
    if (rentcast) {
      const sourceLabel = 'Rentcast (assessor/MLS records)';
      const rentcastSources = {};
      for (const key of Object.keys(rentcast.data)) {
        if (key !== 'notes' && rentcast.data[key] != null) {
          rentcastSources[key] = sourceLabel;
        }
      }
      accumulated = { data: { ...rentcast.data }, fieldsFound: [...rentcast.fieldsFound], sources: rentcastSources };
      diag.rentcast = 'hit';
      console.log(`[Zillow] Rentcast hit — ${rentcast.fieldsFound.length} fields`);
    } else {
      diag.rentcast = 'miss';
      console.log('[Zillow] Rentcast miss');
    }
  } catch (rentErr) {
    diag.rentcast = 'error';
    console.warn('[Zillow] Rentcast error:', rentErr.message);
  }

  // --- Tier 2: Apify Redfin Detail (if ≥3 critical fields still missing) ---
  const missingAfterRentcast = countMissingCritical(accumulated.data);
  if (missingAfterRentcast >= 3) {
    console.log(`[Zillow] ${missingAfterRentcast} critical fields missing — trying Apify Redfin Detail`);
    try {
      const redfinResult = await fetchApifyRedfin(fullAddress);
      if (redfinResult && redfinResult.fieldsFound.length > 0) {
        accumulated = mergeApifyResult(accumulated, redfinResult);
        diag.apifyRedfin = `hit (${redfinResult.fieldsFound.length} fields)`;
        console.log(`[Zillow] Apify Redfin — ${redfinResult.fieldsFound.length} fields`);
      } else {
        diag.apifyRedfin = 'miss';
        console.log('[Zillow] Apify Redfin — no results');
      }
    } catch (err) {
      diag.apifyRedfin = 'error';
      console.warn('[Zillow] Apify Redfin error:', err.message);
    }
  } else {
    diag.apifyRedfin = 'skipped';
  }

  // --- Tier 3: Apify Zillow Search (if still ≥3 critical fields missing) ---
  const missingAfterRedfin = countMissingCritical(accumulated.data);
  if (missingAfterRedfin >= 3) {
    console.log(`[Zillow] ${missingAfterRedfin} critical fields still missing — trying Apify Zillow`);
    try {
      const zillowResult = await fetchApifyZillow(fullAddress);
      if (zillowResult && zillowResult.fieldsFound.length > 0) {
        accumulated = mergeApifyResult(accumulated, zillowResult);
        diag.apifyZillow = `hit (${zillowResult.fieldsFound.length} fields)`;
        console.log(`[Zillow] Apify Zillow — ${zillowResult.fieldsFound.length} fields`);
      } else {
        diag.apifyZillow = 'miss';
        console.log('[Zillow] Apify Zillow — no results');
      }
    } catch (err) {
      diag.apifyZillow = 'error';
      console.warn('[Zillow] Apify Zillow error:', err.message);
    }
  } else {
    diag.apifyZillow = 'skipped';
  }

  // --- Tier 4: Gemini Search Grounding (if still ≥3 critical fields missing) ---
  const missingAfterApify = countMissingCritical(accumulated.data);
  if (missingAfterApify >= 3) {
    console.log(`[Zillow] ${missingAfterApify} critical fields still missing — trying Gemini`);
    try {
      const result = await fetchViaGeminiSearch(address, city, state, zip || '', diag, ai);
      if (result && result.raw) {
        const geminiMapped = mapZillowToAltech(result.raw);
        for (const key of geminiMapped.fieldsFound) {
          if (!geminiMapped.sources[key]) geminiMapped.sources[key] = result.source || 'Gemini Search';
        }
        accumulated = mergeApifyResult(accumulated, geminiMapped);
        diag.gemini = `hit (${geminiMapped.fieldsFound.length} fields)`;
      } else {
        diag.gemini = 'miss';
      }
    } catch (err) {
      diag.gemini = 'error';
      console.warn('[Zillow] Gemini error:', err.message);
    }
  } else {
    diag.gemini = 'skipped';
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  if (accumulated.fieldsFound.length === 0) {
    console.log(`[Zillow] No data from any source (${elapsed}s)`);
    return res.status(200).json({
      success: false,
      error: 'Could not extract property details from any source',
      zillowUrl: `https://www.zillow.com/homes/${buildSlug(address, city, state, zip || '')}_rb/`,
      diagnostics: diag,
      elapsedSeconds: parseFloat(elapsed),
    });
  }

  const sourceLabels = [...new Set(Object.values(accumulated.sources))];
  const primarySource = sourceLabels.length === 1 ? sourceLabels[0] : sourceLabels.join(' + ');

  console.log(`[Zillow] Success: ${accumulated.fieldsFound.length} fields from ${primarySource} (${elapsed}s)`);

  return res.status(200).json({
    success: true,
    source: primarySource,
    data: accumulated.data,
    fieldsFound: accumulated.fieldsFound,
    sources: accumulated.sources,
    diagnostics: diag,
    elapsedSeconds: parseFloat(elapsed),
  });
}
