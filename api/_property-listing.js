/**
 * Listing search (?mode=listing-search).
 *
 * Accepts either a Redfin/Zillow/Realtor.com URL or a plain address string.
 * For recognized listing domains we try Apify first (structured scrape),
 * then fill gaps with Gemini Search Grounding. Non-listing URLs and plain
 * addresses go straight to Gemini.
 */

import { createRouter, extractJSON } from './_ai-router.js';
import { runRedfinDetail, runZillowSearch } from './_apify-client.js';
import { mapZillowToAltech } from './_property-mapping.js';
import {
  countMissingCritical,
  mapRedfinDetailToAltech,
  mapZillowSearchToAltech,
} from './_property-apify.js';

// Raw AI field name → Altech/Zillow mapper field name
const LISTING_FIELD_MAP = {
  heating: 'heating',
  cooling: 'cooling',
  roofType: 'roof',
  roofYearUpdated: 'roofYearUpdated',
  foundation: 'foundation',
  basementFinishPct: 'basementFinishPct',
  construction: 'constructionMaterials',
  exterior: 'exteriorFeatures',
  garageType: 'garageType',
  garageSpaces: 'garageSpaces',
  bedrooms: 'bedrooms',
  bathrooms: 'bathrooms',
  halfBathrooms: 'halfBathrooms',
  yearBuilt: 'yearBuilt',
  stories: 'stories',
  livingArea: 'livingArea',
  flooring: 'flooring',
  fireplaces: 'fireplaces',
  sewer: 'sewer',
  waterSource: 'waterSource',
  pool: 'pool',
  woodStove: 'woodStove',
  dwellingType: 'dwellingType',
  yearRenovated: 'yearRenovated',
  lotSizeAcres: 'lotSizeAcres',
};

export async function handleListingSearch(req, res) {
  const { query } = req.body;
  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ success: false, error: 'Missing required field: query (URL or address)' });
  }

  const trimmedQuery = query.trim();
  const isUrl = /^https?:\/\//i.test(trimmedQuery);
  console.log(`[ListingSearch] ${isUrl ? 'URL' : 'Address'}: "${trimmedQuery}"`);

  const startTime = Date.now();
  const diag = { inputType: isUrl ? 'url' : 'address' };

  // --- Apify scraper routing for recognized listing domains ---
  let apifyResult = null;
  if (isUrl) {
    const urlLower = trimmedQuery.toLowerCase();
    try {
      if (urlLower.includes('redfin.com')) {
        diag.apifyActor = 'redfin-detail';
        console.log('[ListingSearch] Detected Redfin URL — trying Apify Redfin Detail');
        const items = await runRedfinDetail({ detailUrls: [{ url: trimmedQuery }] });
        if (items && items.length > 0) {
          apifyResult = mapRedfinDetailToAltech(items[0]);
          diag.apifyFields = apifyResult?.fieldsFound?.length || 0;
          console.log(`[ListingSearch] Apify Redfin returned ${diag.apifyFields} fields`);
        }
      } else if (urlLower.includes('zillow.com')) {
        diag.apifyActor = 'zillow-search';
        console.log('[ListingSearch] Detected Zillow URL — trying Apify Zillow Search');
        const items = await runZillowSearch({ startUrls: [trimmedQuery], maxItems: 1, simple: false });
        if (items && items.length > 0) {
          apifyResult = mapZillowSearchToAltech(items[0]);
          diag.apifyFields = apifyResult?.fieldsFound?.length || 0;
          console.log(`[ListingSearch] Apify Zillow returned ${diag.apifyFields} fields`);
        }
      }
    } catch (apifyErr) {
      console.warn('[ListingSearch] Apify error (non-fatal):', apifyErr.message);
      diag.apifyError = apifyErr.message;
    }

    // If Apify got sufficient data (< 3 critical fields missing), return directly
    if (apifyResult && countMissingCritical(apifyResult.data) < 3) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[ListingSearch] Apify sufficient — returning ${apifyResult.fieldsFound.length} fields (${elapsed}s)`);
      return res.status(200).json({
        success: true,
        source: diag.apifyActor === 'redfin-detail' ? 'apify-redfin' : 'apify-zillow',
        data: apifyResult.data,
        fieldsFound: apifyResult.fieldsFound,
        sources: apifyResult.sources,
        addressFields: {},
        diagnostics: diag,
        elapsedSeconds: parseFloat(elapsed),
      });
    }

    if (apifyResult) {
      console.log(`[ListingSearch] Apify incomplete (${countMissingCritical(apifyResult.data)} critical fields missing) — supplementing with Gemini`);
      diag.apifyPartial = true;
    }
  }

  // Gemini search grounding — primary for non-listing URLs / plain addresses,
  // gap-filler for incomplete Apify results
  const ai = createRouter({ provider: 'google' });

  const systemPrompt = `You are a property data extraction specialist for insurance underwriting. Your job is to search for and extract every available property detail from real estate listings and public records. Return ONLY valid JSON — no markdown, no code fences, no explanation.`;

  const userPrompt = isUrl
    ? `Search for detailed property information about this real estate listing: ${trimmedQuery}

Find the listing page and extract ALL available property/home facts from it. Look at the "Facts & Features" section, property details, listing description, and any renovation history. I need every available construction and feature detail for insurance underwriting purposes.`
    : `Find detailed property/home facts for this specific address: ${trimmedQuery}

Search real estate listings (Redfin, Zillow, Realtor.com), public records, and property databases for this exact property. I need EVERY available construction and feature detail for insurance underwriting.`;

  const jsonSchema = `
Return ONLY valid JSON with this exact structure. Each field (except notes) must be EITHER {"value": <extracted_value>, "source": "where you found this"} OR null:
{
  "address": {"value": "full street address", "source": "source name"} or null,
  "city": {"value": "city name", "source": "source name"} or null,
  "state": {"value": "2-letter state code", "source": "source name"} or null,
  "zip": {"value": "5-digit zip", "source": "source name"} or null,
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
  "lotSize": {"value": square_feet_number, "source": "source name"} or null,
  "flooring": {"value": "primary flooring type", "source": "source name"} or null,
  "fireplaces": {"value": number, "source": "source name"} or null,
  "sewer": {"value": "Public or Septic", "source": "source name"} or null,
  "waterSource": {"value": "Public or Well", "source": "source name"} or null,
  "pool": {"value": "Yes or No", "source": "source name"} or null,
  "woodStove": {"value": "Yes or No", "source": "source name"} or null,
  "dwellingType": {"value": "One Family or Two Family or Three Family or Four Family or Condo or Townhome or Row House", "source": "source name"} or null,
  "halfBathrooms": {"value": number_of_half_baths, "source": "source name"} or null,
  "yearRenovated": {"value": year_number, "source": "source name"} or null,
  "county": {"value": "county name without the word County", "source": "source name"} or null,
  "lotSizeAcres": {"value": lot_size_in_acres_as_decimal, "source": "source name"} or null,
  "hoa": {"value": monthly_dollar_amount_number, "source": "source name"} or null,
  "assessedValue": {"value": dollar_amount_number, "source": "source name"} or null,
  "lastSoldPrice": {"value": dollar_amount_number, "source": "source name"} or null,
  "lastSoldDate": {"value": "YYYY-MM-DD", "source": "source name"} or null,
  "notes": "summary of data sources and confidence level"
}

IMPORTANT:
- For bathrooms: if the listing says "3.5 baths", set bathrooms=3 (full baths count) and halfBathrooms=1 (the .5 = one half bath). Always split full/half.
- For lotSizeAcres: return the lot size in ACRES as a decimal (e.g. 0.27). Convert from sqft if needed (sqft ÷ 43560).
- For dwellingType: "Single Family" or "Single Family Residential" → "One Family". "Duplex" → "Two Family". "Triplex" → "Three Family". "Fourplex" → "Four Family".
- Look in the listing description text for renovation info like "New roof 2024" → set roofYearUpdated. Check for "Remodeled", "Renovated", "Updated" → set yearRenovated.
- Check "Facts & Features" and "Public Facts" sections thoroughly.
- Use null for any field you cannot find. Only include data for THIS SPECIFIC property. Return null for ANY field you cannot find explicitly stated in the source data. Never infer, estimate, or use typical values.`;

  try {
    const searchResult = await ai.askWithSearch(systemPrompt, userPrompt + jsonSchema, {
      temperature: 0.1,
      maxTokens: 4096
    });

    const text = searchResult?.text || (typeof searchResult === 'string' ? searchResult : '');
    diag.responseLength = text.length;
    diag.grounded = searchResult?.grounded || false;
    console.log(`[ListingSearch] AI response (${text.length} chars, grounded: ${diag.grounded})`);

    if (!text) {
      return res.status(200).json({ success: false, error: 'Empty AI response', diagnostics: diag });
    }

    const raw = extractJSON(text);
    if (!raw) {
      diag.noJson = true;
      return res.status(200).json({ success: false, error: 'Could not extract JSON from AI response', diagnostics: diag });
    }

    const nonNullKeys = Object.keys(raw).filter(k => raw[k] != null && k !== 'notes');
    diag.fieldsFound = nonNullKeys.length;
    console.log(`[ListingSearch] Extracted ${nonNullKeys.length} fields: ${nonNullKeys.join(', ')}`);

    if (nonNullKeys.length < 2) {
      return res.status(200).json({
        success: false,
        error: `Only ${nonNullKeys.length} fields found — below threshold`,
        diagnostics: diag
      });
    }

    // Normalize to Altech field names + build source attribution
    const normalized = {};
    const sources = {};
    for (const [key, val] of Object.entries(raw)) {
      if (val == null || key === 'notes') continue;
      const fieldValue = typeof val === 'object' && val.value !== undefined ? val.value : val;
      const fieldSource = typeof val === 'object' && val.source ? val.source : 'AI Search';
      if (fieldValue == null) continue;

      const altechKey = LISTING_FIELD_MAP[key] || key;
      normalized[altechKey] = fieldValue;
      sources[altechKey] = fieldSource;
    }

    const { data, fieldsFound: mappedFields, sources: mappedSources } = mapZillowToAltech(normalized);

    // Merge source attribution from AI responses
    for (const [k, v] of Object.entries(sources)) {
      if (!mappedSources[k]) mappedSources[k] = v;
    }

    // If Apify provided partial data, merge: Apify wins (structured > AI inference)
    if (apifyResult) {
      for (const [key, val] of Object.entries(apifyResult.data)) {
        if (val != null && val !== '') {
          data[key] = val;
          if (!mappedFields.includes(key)) mappedFields.push(key);
          if (apifyResult.sources[key]) mappedSources[key] = apifyResult.sources[key];
        }
      }
    }

    // Add address fields if extracted (useful when searching by URL)
    const addressFields = {};
    if (raw.address?.value) addressFields.address = raw.address.value;
    if (raw.city?.value) addressFields.city = raw.city.value;
    if (raw.state?.value) addressFields.state = raw.state.value;
    if (raw.zip?.value) addressFields.zip = raw.zip.value;

    // Add sale/value fields not in standard mapper
    if (raw.assessedValue?.value) { data.assessedValue = raw.assessedValue.value; mappedSources.assessedValue = raw.assessedValue.source || 'AI Search'; }
    if (raw.lastSoldPrice?.value) { data.lastSoldPrice = raw.lastSoldPrice.value; mappedSources.lastSoldPrice = raw.lastSoldPrice.source || 'AI Search'; }
    if (raw.lastSoldDate?.value) { data.lastSoldDate = raw.lastSoldDate.value; mappedSources.lastSoldDate = raw.lastSoldDate.source || 'AI Search'; }
    if (raw.hoa?.value) { data.hoaFee = raw.hoa.value; mappedSources.hoaFee = raw.hoa.source || 'AI Search'; }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[ListingSearch] Success: ${mappedFields.length} mapped fields (${elapsed}s)`);

    const sourceLabel = apifyResult
      ? `${diag.apifyActor === 'redfin-detail' ? 'apify-redfin' : 'apify-zillow'} + gemini`
      : 'gemini-listing-search';

    return res.status(200).json({
      success: true,
      source: sourceLabel,
      data,
      fieldsFound: mappedFields,
      sources: mappedSources,
      addressFields,
      diagnostics: diag,
      elapsedSeconds: parseFloat(elapsed),
    });
  } catch (error) {
    console.error('[ListingSearch] Error:', error);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    return res.status(200).json({
      success: false,
      error: error.message || 'Unknown error',
      diagnostics: diag,
      elapsedSeconds: parseFloat(elapsed),
    });
  }
}
