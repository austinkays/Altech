/**
 * Satellite/Street View imagery analysis (?mode=satellite).
 * Fetches Google Static Maps satellite + Street View images, runs them
 * through AI Vision for an underwriting-grade risk assessment.
 */

import { createRouter, extractJSON } from './_ai-router.js';
import { getGoogleApiKey, getMapsApiKey } from './_property-shared.js';

export async function handleSatellite(req, res) {
  const { address, city, state, zip } = req.body;

  if (!address || !city || !state) {
    return res.status(400).json({ error: 'Address, city, and state required' });
  }

  const mapsKey = getMapsApiKey();
  const geminiKey = getGoogleApiKey();
  if (!mapsKey && !geminiKey) {
    return res.status(500).json({ error: 'GOOGLE_API_KEY not configured' });
  }
  if (!mapsKey) {
    return res.status(200).json({
      success: false,
      data: {},
      notes: 'Static Maps API key not available. Please use GIS/Zillow buttons or manual entry.'
    });
  }

  const fullAddress = `${address}, ${city}, ${state}${zip ? ' ' + zip : ''}`.trim();
  console.log(`[Smart Extract] Analyzing: ${fullAddress}`);

  // Fetch satellite and street view images in parallel
  const satUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(fullAddress)}&zoom=19&size=640x640&maptype=satellite&key=${mapsKey}`;
  const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=640x480&location=${encodeURIComponent(fullAddress)}&key=${mapsKey}`;

  const [satRes, svRes] = await Promise.all([
    fetch(satUrl).catch(() => null),
    fetch(streetViewUrl).catch(() => null)
  ]);

  if (!satRes || !satRes.ok) {
    return res.status(200).json({
      success: false,
      data: {},
      notes: 'Satellite imagery unavailable. Please use GIS/Zillow buttons or manual entry.'
    });
  }

  const satBuffer = await satRes.arrayBuffer();
  const satBase64 = Buffer.from(satBuffer).toString('base64');

  // Street View may not be available for all addresses
  let svBase64 = null;
  if (svRes && svRes.ok) {
    const svBuffer = await svRes.arrayBuffer();
    svBase64 = Buffer.from(svBuffer).toString('base64');
    console.log(`[Smart Extract] Street View image fetched (${svBuffer.byteLength} bytes)`);
  } else {
    console.log('[Smart Extract] Street View not available for this address');
  }

  const ai = createRouter(req.body.aiSettings);

  const systemPrompt = `You are an insurance property underwriter with expertise in visual risk assessment. Analyze property images for roof condition, construction type, hazards, and underwriting factors. Return ONLY valid JSON.`;

  const userPrompt = `Analyze ${svBase64 ? 'these two images' : 'this satellite image'} of the property at: ${fullAddress}
${svBase64 ? 'Image 1: Satellite/aerial view. Image 2: Street-level view.' : ''}

Evaluate for insurance risk underwriting. Return JSON:
{
  "roof_material": "composition_shingle|architectural_shingle|metal|clay_tile|concrete_tile|wood_shake|slate|flat_membrane|unknown",
  "roof_condition_score": 1-10 integer or null,
  "roof_shape": "gable|hip|flat|gambrel|mansard|unknown",
  "has_pool": true/false/null,
  "pool_fenced": true/false/null,
  "has_trampoline": true/false/null,
  "stories": integer or null,
  "garage_doors": integer or null,
  "visible_hazards": ["list of observed risks"],
  "deck_or_patio": true/false/null,
  "tree_overhang_roof": true/false/null,
  "brush_clearance_adequate": true/false/null,
  "notes": "2-3 sentence underwriter observations"
}

Scoring guide for roof_condition_score: 10=new/excellent, 7-9=good/minor wear, 4-6=aging/moss/staining, 1-3=visible damage/sagging/missing shingles. Use null if roof not clearly visible.`;

  const images = [{ base64: satBase64, mimeType: 'image/png' }];
  if (svBase64) {
    images.push({ base64: svBase64, mimeType: 'image/jpeg' });
  }

  try {
    const responseText = await ai.askVision(systemPrompt, images, userPrompt, {
      temperature: 0.1,
      maxTokens: 2048
    });

    const extracted = extractJSON(responseText);

    if (!extracted) {
      return res.status(200).json({
        success: false,
        data: {},
        satelliteImage: satBase64,
        streetViewImage: svBase64,
        notes: 'Could not extract data. Showing images for review.'
      });
    }

    res.status(200).json({
      success: true,
      data: extracted,
      satelliteImage: satBase64,
      streetViewImage: svBase64,
      aiProvider: ai.provider,
      notes: 'Satellite + Street View analysis - verify all data with public records'
    });
  } catch (err) {
    return res.status(200).json({
      success: false,
      data: {},
      satelliteImage: satBase64,
      streetViewImage: svBase64,
      notes: `AI analysis failed: ${err.message}. Image shown for manual review.`
    });
  }
}
