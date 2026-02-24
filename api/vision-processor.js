/**
 * Phase 4: Multimodal Vision Processing
 * 
 * Gemini Vision API for:
 * - Property tax documents (PDFs)
 * - Assessment images
 * - Historical photos
 * - Satellite imagery analysis
 * - Roof condition assessment
 * - Foundation inspection images
 * 
 * Temperature: 0.2 (strict interpretation, minimal hallucination)
 * Model: gemini-1.5-flash-latest (vision-capable, stable)
 * 
 * Uses REST API directly (no SDK dependencies needed)
 */

import { securityMiddleware } from '../lib/security.js';
import { createRouter, extractJSON } from './_ai-router.js';

const GEMINI_API_KEY = (process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY || '').trim();
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * Call Gemini REST API with vision content
 * @param {string} prompt - Text prompt
 * @param {Object} imageData - { data: base64, mime_type: string }
 * @param {Object} [config] - Generation config overrides
 * @returns {Promise<string>} Response text from Gemini
 */
async function callGeminiVision(prompt, imageData, config = {}) {
    if (!GEMINI_API_KEY) throw new Error('GOOGLE_API_KEY not configured');

    const requestBody = {
        contents: [{
            parts: [
                { inline_data: imageData },
                { text: prompt }
            ]
        }],
        generationConfig: {
            temperature: config.temperature ?? 0.2,
            maxOutputTokens: config.maxOutputTokens ?? 2048
        }
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Gemini API error ${response.status}: ${errorData.error?.message || 'Unknown'}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Process a single property image (base64 or URL)
 * 
 * @param {Object} options
 * @param {string} options.base64Data - Base64 encoded image data
 * @param {string} options.mimeType - Image MIME type (image/jpeg, image/png, etc.)
 * @param {string} options.imageType - Type of image: roof, foundation, exterior, other
 * @param {string} options.county - County name for context
 * @returns {Promise<Object>} Extracted property data {roofType, condition, color, etc.}
 */
async function processPropertyImage(options, ai) {
  const { base64Data, mimeType, imageType, county } = options;

  if (!base64Data) {
    return {
      success: false,
      error: "No image data provided",
      rawData: {}
    };
  }

  try {
    const systemPrompt = `You are an expert property insurance image analyst. Analyze images with precision for underwriting purposes. Return ONLY valid JSON — no markdown, no code fences, no explanation text.`;

    const prompt = `Analyze this ${imageType} property image${county ? ` in ${county} county` : ''}.

EXTRACTION RULES:
1. ONLY extract information VISIBLE in the image
2. Do NOT guess or estimate values you cannot see
3. If unclear, return "N/A"
4. Be specific — insurance underwriters need precise details

${imageType === 'roof' ? `ROOF ANALYSIS:
- roof_type: "asphalt_shingle" | "architectural_shingle" | "metal" | "tile" | "slate" | "wood_shake" | "flat_membrane" | "composition" | "unknown"
- material_condition: "excellent" | "good" | "fair" | "poor"
- estimated_age: "new (0-5yr)" | "recent (5-10yr)" | "moderate (10-20yr)" | "aged (20+yr)" | "unknown"
- color: specific color
- visible_damage: true/false, damage_description if true
- pitch: "low" | "medium" | "steep"
- moss_algae: true/false
- missing_shingles: true/false` :
  imageType === 'foundation' ? `FOUNDATION ANALYSIS:
- foundation_type: "poured_concrete" | "cinder_block" | "brick" | "stone" | "wood" | "unknown"
- material_condition: "good" | "fair" | "poor"
- visible_cracks: true/false, crack_severity: "hairline" | "moderate" | "structural" if true
- water_damage: true/false, water_description if true
- efflorescence: true/false
- height_exposure: estimated inches visible above grade` :
  imageType === 'exterior' ? `EXTERIOR ANALYSIS:
- siding_type: "vinyl" | "brick" | "wood" | "stucco" | "fiber_cement" | "stone" | "composite" | "other"
- paint_condition: "good" | "fair" | "poor" | "needs_painting"
- visible_defects: [list any issues: "peeling paint", "rot", "cracks", etc.]
- stories_visible: number
- windows_condition: "good" | "fair" | "poor"
- gutters_present: true/false` :
  `SATELLITE/AERIAL ANALYSIS:
- lot_size_estimate: "small (<0.25ac)" | "medium (0.25-0.5ac)" | "large (0.5-1ac)" | "very_large (1+ac)"
- structure_count: number of buildings visible
- tree_coverage: "minimal" | "moderate" | "heavy"
- tree_overhang_roof: true/false
- visible_features: ["pool", "shed", "detached_garage", "deck", "driveway", etc.]
- terrain: "flat" | "sloped" | "hilly"
- water_proximity: true/false, description if true`}

Return JSON:
{
  ...extracted fields above...,
  "confidence": 0-100,
  "underwriter_notes": "1-2 sentence summary of key observations for insurance"
}`;

    let responseText;
    if (ai) {
      responseText = await ai.askVision(systemPrompt, [{ base64Data, mimeType }], prompt, { temperature: 0.2, maxTokens: 2048 });
    } else {
      responseText = await callGeminiVision(prompt, { mime_type: mimeType, data: base64Data });
    }
    
    const parsedData = extractJSON(responseText);
    if (parsedData) {
      return {
        success: true,
        rawData: parsedData,
        confidence: parsedData.confidence || 80,
        dataSource: "phase4-vision",
        imageType: imageType
      };
    }

    return {
      success: true,
      rawData: { raw_response: responseText },
      confidence: 70,
      dataSource: "phase4-vision",
      imageType: imageType
    };
  } catch (error) {
    console.error(`Vision processing error for ${imageType}:`, error.message);
    return {
      success: false,
      error: error.message,
      rawData: {}
    };
  }
}

/**
 * Process a PDF document (base64 encoded)
 * 
 * @param {Object} options
 * @param {string} options.base64Data - Base64 encoded PDF data
 * @param {string} options.documentType - Type: tax_summary, assessment, deed, other
 * @param {string} options.county - County name for context
 * @returns {Promise<Object>} Extracted property data
 */
async function processPDFDocument(options) {
  const { base64Data, documentType, county } = options;

  if (!base64Data) {
    return {
      success: false,
      error: "No PDF data provided",
      rawData: {}
    };
  }

  try {
    const prompt = `You are a property document analysis expert.

Given a ${documentType} PDF document, extract and standardize property information:

EXTRACTION RULES:
1. ONLY extract information explicitly stated in document
2. Do NOT calculate or estimate values
3. If field missing, return "N/A"
4. Preserve exact values from document

FOR TAX SUMMARY DOCUMENTS:
- Property ID / Parcel Number
- Year built
- Number of stories
- Square footage (living area)
- Garage/carport spaces
- Lot size (acres or sq ft)
- Land use classification
- Assessed value
- Tax year

FOR ASSESSMENT DOCUMENTS:
- Property condition rating
- Roof type and condition
- Foundation type
- Exterior material
- HVAC system type
- Utilities (water, sewer, electric)
- Year of last major renovation
- Any noted defects or concerns

FOR DEED DOCUMENTS:
- Current owner name
- Previous owner name
- Transaction date
- Consideration/price paid
- Property description
- Easements or restrictions

Return JSON with:
{
  "success": true,
  "data": { extracted fields },
  "confidence": 0-100,
  "missingFields": [ list of important fields not found ],
  "warnings": [ any data quality issues ]
}`;

    let responseText;
    if (options._ai) {
      responseText = await options._ai.askVision(
        'You are an expert insurance document analyst. Extract data precisely as stated in documents. Return ONLY valid JSON.',
        [{ base64Data, mimeType: 'application/pdf' }],
        prompt,
        { temperature: 0.2, maxTokens: 2048 }
      );
    } else {
      responseText = await callGeminiVision(prompt, { mime_type: "application/pdf", data: base64Data });
    }
    
    const parsedData = extractJSON(responseText);
    if (parsedData) {
      return {
        success: true,
        rawData: parsedData.data || parsedData,
        confidence: parsedData.confidence || 85,
        dataSource: "phase4-vision-pdf",
        documentType: documentType,
        missingFields: parsedData.missingFields || [],
        warnings: parsedData.warnings || []
      };
    }

    return {
      success: true,
      rawData: { raw_response: responseText },
      confidence: 70,
      dataSource: "phase4-vision-pdf",
      documentType: documentType
    };
  } catch (error) {
    console.error(`PDF processing error:`, error.message);
    return {
      success: false,
      error: error.message,
      rawData: {}
    };
  }
}

/**
 * Analyze satellite/aerial image for hazard assessment
 * 
 * @param {Object} options
 * @param {string} options.base64Data - Base64 encoded image
 * @param {string} options.lat - Latitude
 * @param {string} options.lng - Longitude
 * @param {string} options.county - County name
 * @returns {Promise<Object>} Hazard assessment data
 */
async function analyzeAerialImage(options, ai) {
  const { base64Data, lat, lng, county } = options;

  if (!base64Data) {
    return {
      success: false,
      error: "No image data provided",
      hazards: []
    };
  }

  try {
    const systemPrompt = `You are an expert aerial image analyst specializing in property risk assessment for insurance underwriting. Identify hazards with specificity. Return ONLY valid JSON.`;

    const prompt = `Analyze this satellite/aerial image of property near ${lat}, ${lng} in ${county} county.

IDENTIFY AND ASSESS ALL HAZARDS:

FLOOD HAZARDS:
- Proximity to water bodies (streams, lakes, ponds, rivers)
- Topographic indicators (low areas, flood plains, drainage patterns)
- Visible storm drains or drainage infrastructure
- Wetland indicators (discolored vegetation, standing water)

WILDFIRE HAZARDS:
- Vegetation density and type (grass, brush, forest)
- Defensible space clearance around structures
- Proximity to wildland-urban interface
- Access road width and condition

WIND HAZARDS:
- Open exposure (no windbreaks)
- Tall trees that could fall on structures
- Loose outdoor items visible

STRUCTURAL OBSERVATIONS:
- Building footprint size and shape
- Roof condition from above (discoloration, debris, damage)
- Outbuildings, sheds, detached structures
- Driveway, parking areas
- Pool, trampoline, or other liability features

Return JSON:
{
  "hazards": [
    { "type": "flood|wildfire|wind|liability|structural", "severity": "low|moderate|high", "description": "specific finding" }
  ],
  "lotCharacteristics": {
    "terrain": "flat|rolling|steep",
    "coverage": "open|partial|heavily_vegetated",
    "structureCount": number,
    "estimatedLotAcres": number_or_null
  },
  "confidence": 0-100,
  "caveats": "note any image quality or age concerns"
}`;

    let responseText;
    if (ai) {
      responseText = await ai.askVision(systemPrompt, [{ base64Data, mimeType: 'image/jpeg' }], prompt, { temperature: 0.2, maxTokens: 2048 });
    } else {
      responseText = await callGeminiVision(prompt, { mime_type: "image/jpeg", data: base64Data });
    }
    
    const parsedData = extractJSON(responseText);
    if (parsedData) {
      return {
        success: true,
        hazards: parsedData.hazards || [],
        lotCharacteristics: parsedData.lotCharacteristics || {},
        confidence: parsedData.confidence || 75,
        dataSource: "phase4-vision-aerial"
      };
    }

    return {
      success: true,
      rawData: { raw_response: responseText },
      confidence: 65,
      dataSource: "phase4-vision-aerial"
    };
  } catch (error) {
    console.error(`Aerial analysis error:`, error.message);
    return {
      success: false,
      error: error.message,
      hazards: []
    };
  }
}

/**
 * Process a driver's license image
 * Extracts name, DOB, license number/state, and address
 */
async function processDriverLicense(options, ai) {
  const { base64Data, mimeType } = options;

  if (!base64Data) {
    console.error('[DL Scan] No base64 data provided');
    return {
      success: false,
      error: 'No image data provided (Error 301)',
      errorCode: 301,
      data: {}
    };
  }

  // Validate and normalize MIME type
  const validMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const normalizedMimeType = mimeType?.toLowerCase() || 'image/jpeg';
  
  if (!validMimeTypes.includes(normalizedMimeType)) {
    console.warn(`[DL Scan] Unsupported MIME type: ${mimeType}, using image/jpeg`);
  }

  // Validate base64 data
  if (base64Data.length < 100) {
    console.error('[DL Scan] Base64 data too short, likely invalid');
    return {
      success: false,
      error: 'Image data appears to be invalid or corrupted (Error 302)',
      errorCode: 302,
      data: {}
    };
  }

  console.log(`[DL Scan] Processing image: ${normalizedMimeType}, data length: ${base64Data.length}`);

  // Check for API key availability
  if (!ai && !GEMINI_API_KEY) {
    console.error('[DL Scan] No API key configured');
    return {
      success: false,
      error: 'API key not configured. Please contact support. (Error 303)',
      errorCode: 303,
      data: {}
    };
  }

  try {
    const systemPrompt = `You are an expert OCR system specialized in reading US driver's licenses. Extract all fields with maximum accuracy. Return ONLY valid JSON \u2014 no markdown, no explanation.`;

    const prompt = `Extract data from this US driver's license image and return ONLY valid JSON with this exact structure:
{
  "firstName": "",
  "lastName": "",
  "dob": "YYYY-MM-DD",
  "gender": "",
  "licenseNumber": "",
  "licenseState": "",
  "addressLine1": "",
  "city": "",
  "state": "",
  "zip": "",
  "confidence": 50
}

Rules:
- Use empty string for any missing fields
- Format DOB as YYYY-MM-DD (convert any format you see)
- Gender should be "M", "F", or "" if not visible
- Use 2-letter state codes (e.g., "WA", "OR", "CA")
- licenseState = the STATE that ISSUED the license (from the card header)
- state = the state in the ADDRESS on the card
- Set confidence 0-100 based on image quality and readability
- Return only the JSON object, no other text`;

    let responseText;

    if (ai) {
      // Use user's chosen AI provider via router
      responseText = await ai.askVision(
        systemPrompt,
        [{ base64Data, mimeType: normalizedMimeType }],
        prompt,
        { temperature: 0.1, maxTokens: 2048 }
      );
    } else {
      // Legacy direct Gemini call with detailed error handling
      const requestBody = {
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: normalizedMimeType, data: base64Data } }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
      };

      const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[DL Scan] API error:', response.status, errorData);
        return {
          success: false,
          error: `API error (${response.status}): ${errorData.error?.message || 'Unknown error'} (Error 304)`,
          errorCode: 304,
          httpStatus: response.status,
          data: {}
        };
      }

      const data = await response.json();

      if (data.error) {
        return { success: false, error: `Vision API error: ${data.error.message || 'Unknown error'} (Error 305)`, errorCode: 305, data: {} };
      }
      if (!data.candidates || data.candidates.length === 0) {
        return { success: false, error: 'Image could not be processed. It may be blocked by safety filters or unreadable. (Error 306)', errorCode: 306, data: {} };
      }

      const candidate = data.candidates[0];
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        return { success: false, error: `Processing stopped: ${candidate.finishReason}. Please try a different image. (Error 307)`, errorCode: 307, data: {} };
      }

      responseText = candidate?.content?.parts?.[0]?.text;
      if (!responseText) {
        return { success: false, error: 'No response from vision API. The image may be unreadable. (Error 308)', errorCode: 308, data: {} };
      }
    }

    console.log('[DL Scan] AI response text:', responseText.substring(0, 200));

    // Parse with robust JSON extraction
    const parsed = extractJSON(responseText);

    if (!parsed || typeof parsed !== 'object') {
      console.error('[DL Scan] Could not extract JSON from response');
      return {
        success: false,
        error: 'Unable to parse license data. The image may be blurry or not a driver\'s license. (Error 309)',
        errorCode: 309,
        data: {},
        rawResponse: responseText?.substring(0, 500)
      };
    }
        errorCode: 311,
        data: {}
      };
    }
    
    // Check if confidence is too low
    const confidence = parseInt(parsed.confidence) || 0;
    if (confidence < 30) {
      console.warn('[DL Scan] Low confidence response:', confidence);
      return {
        success: false,
        error: 'Image quality too low or document not recognized. Please try again with better lighting. (Error 312)',
        errorCode: 312,
        data: parsed,
        confidence: confidence
      };
    }

    console.log('[DL Scan] Success! Extracted:', Object.keys(parsed).filter(k => parsed[k]).join(', '));

    return {
      success: true,
      data: {
        firstName: parsed.firstName || '',
        lastName: parsed.lastName || '',
        dob: parsed.dob || '',
        licenseNumber: parsed.licenseNumber || '',
        licenseState: parsed.licenseState || parsed.state || '',
        addressLine1: parsed.addressLine1 || '',
        city: parsed.city || '',
        state: parsed.state || '',
        zip: parsed.zip || ''
      },
      confidence: confidence
    };
  } catch (error) {
    console.error('[DL Scan] Error:', error.message);
    if (error.stack) {
      console.error('[DL Scan] Stack trace:', error.stack.substring(0, 500));
    }
    
    // Provide more specific error messages
    let errorMessage = 'Vision API error. Please try again.';
    let errorCode = 399;
    
    if (error.message.includes('API key')) {
      errorMessage = 'API key error. Please check that GOOGLE_API_KEY is configured correctly.';
      errorCode = 320;
    } else if (error.message.includes('quota') || error.message.includes('limit')) {
      errorMessage = 'API rate limit reached. Please try again in a moment.';
      errorCode = 321;
    } else if (error.message.includes('network') || error.message.includes('fetch')) {
      errorMessage = 'Network error. Please check your connection and try again.';
      errorCode = 322;
    }
    
    return {
      success: false,
      error: `${errorMessage} (Error ${errorCode})`,
      errorCode: errorCode,
      data: {},
      errorDetails: error.message
    };
  }
}

/**
 * Batch process multiple images/documents
 * 
 * @param {Array} items - Array of {base64Data, type, ...options}
 * @returns {Promise<Array>} Processed results
 */
async function batchProcessVisionData(items) {
  const results = await Promise.all(
    items.map(item => {
      if (item.type === 'pdf') {
        return processPDFDocument(item);
      } else if (item.type === 'aerial') {
        return analyzeAerialImage(item);
      } else {
        return processPropertyImage(item);
      }
    })
  );
  
  return {
    success: true,
    results: results,
    processedCount: results.filter(r => r.success).length,
    failedCount: results.filter(r => !r.success).length
  };
}

/**
 * Consolidate vision results into standardized property data
 * 
 * @param {Object} visionResults - Results from one or more vision processing calls
 * @returns {Object} Consolidated property data
 */
function consolidateVisionData(visionResults) {
  const consolidated = {
    roofType: "N/A",
    roofCondition: "N/A",
    exteriorType: "N/A",
    foundationType: "N/A",
    yearBuilt: "N/A",
    lotSize: "N/A",
    hazards: [],
    confidence: 0,
    sources: []
  };

  if (!visionResults) return consolidated;

  // If single result
  if (visionResults.rawData) {
    const data = visionResults.rawData;
    consolidated.roofType = data.roof_type || data.roofType || "N/A";
    consolidated.roofCondition = data.material_condition || data.condition || "N/A";
    consolidated.exteriorType = data.siding_type || data.exteriorType || "N/A";
    consolidated.foundationType = data.foundation_type || data.foundationType || "N/A";
    consolidated.yearBuilt = data.estimated_age || data.yearBuilt || "N/A";
    consolidated.lotSize = data.lot_size_estimate || data.lotSize || "N/A";
    consolidated.confidence = visionResults.confidence || 0;
    consolidated.sources.push(visionResults.dataSource);
  }

  // If multiple results (array)
  if (Array.isArray(visionResults)) {
    visionResults.forEach(result => {
      if (result.success && result.rawData) {
        const data = result.rawData;
        if (data.roof_type && consolidated.roofType === "N/A") {
          consolidated.roofType = data.roof_type;
        }
        if (data.foundation_type && consolidated.foundationType === "N/A") {
          consolidated.foundationType = data.foundation_type;
        }
        if (data.year_built && consolidated.yearBuilt === "N/A") {
          consolidated.yearBuilt = data.year_built;
        }
      }
      
      if (result.hazards) {
        consolidated.hazards.push(...result.hazards);
      }
      
      if (result.dataSource) {
        consolidated.sources.push(result.dataSource);
      }
    });
    
    // Average confidence
    const confidences = visionResults
      .map(r => r.confidence || 0)
      .filter(c => c > 0);
    if (confidences.length > 0) {
      consolidated.confidence = Math.round(
        confidences.reduce((a, b) => a + b, 0) / confidences.length
      );
    }
  }

  return consolidated;
}

/**
 * Process document intelligence (merged from document-intel.js)
 * Accepts inline document data (images/PDFs) and returns structured insights
 */
async function processDocumentIntel(files, ai) {
  if (!files.length) {
    return { success: false, error: 'No documents provided' };
  }

  if (!ai && !GEMINI_API_KEY) {
    return {
      success: true,
      summary: 'Document intake ready. Set GOOGLE_API_KEY to enable AI extraction.',
      documents: files.map((f, idx) => ({
        title: `Document ${idx + 1}`,
        type: f?.mimeType || 'unknown',
        details: 'AI extraction not enabled (missing GOOGLE_API_KEY).'
      }))
    };
  }

  const systemPrompt = `You are an expert insurance document analyst. Extract structured data from insurance and property documents with high precision. Return ONLY valid JSON — no markdown, no code fences.`;

  const prompt = `Analyze the provided insurance/property documents. Extract every available field.

Return JSON:
{
  "summary": "Brief overview of documents analyzed",
  "fields": {
    "yearBuilt": "",
    "assessedValue": "",
    "ownerName": "",
    "policyNumber": "",
    "effectiveDate": "",
    "expirationDate": "",
    "mortgagee": "",
    "addressLine1": "",
    "city": "",
    "state": "",
    "zip": "",
    "source": "doc-intel"
  },
  "documents": [
    {"title": "Document Title", "type": "tax|assessment|deed|policy|other", "details": "key fields extracted"}
  ]
}
Use empty string for any field not found. Be precise — do not guess values.`;

  try {
    let responseText;

    if (ai) {
      // Use AI router with user's provider
      const images = files.filter(f => f?.data).map(f => ({
        base64Data: f.data,
        mimeType: f.mimeType || 'application/octet-stream'
      }));
      if (images.length === 0) {
        return { success: false, error: 'No valid document data provided' };
      }
      responseText = await ai.askVision(systemPrompt, images, prompt, { temperature: 0.2, maxTokens: 2048 });
    } else {
      // Legacy Gemini direct call
      const geminiUrl = `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`;
      const parts = [{ text: prompt }];
      for (const file of files) {
        if (file?.data) {
          parts.push({ inlineData: { mimeType: file.mimeType || 'application/octet-stream', data: file.data } });
        }
      }
      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
        })
      });
      if (!geminiRes.ok) {
        return { success: false, summary: 'AI extraction failed. Try again later.', documents: [] };
      }
      const geminiResult = await geminiRes.json();
      responseText = geminiResult?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    }

    const parsed = extractJSON(responseText);
    if (!parsed) {
      return { success: true, summary: 'Analysis completed, but structured data was not returned.', documents: [] };
    }

    return {
      success: true,
      summary: parsed.summary || 'Document analysis complete.',
      fields: parsed.fields || {},
      documents: parsed.documents || []
    };
  } catch (error) {
    console.error('Document intel error:', error.message);
    return { success: false, summary: 'AI extraction failed.', documents: [] };
  }
}

/**
 * Vercel serverless handler
 */
async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, base64Data, mimeType, imageType, documentType, county, lat, lng, aiSettings } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'Action required' });
  }

  // Create AI router from user settings (falls back to env GOOGLE_API_KEY)
  const ai = createRouter(aiSettings);

  try {
    let result;

    switch (action) {
      case 'processImage':
        result = await processPropertyImage({
          base64Data,
          mimeType: mimeType || 'image/jpeg',
          imageType: imageType || 'other',
          county: county || 'unknown'
        }, ai);
        break;

      case 'processPDF':
        result = await processPDFDocument({
          base64Data,
          documentType: documentType || 'other',
          county: county || 'unknown',
          _ai: ai
        });
        break;

      case 'analyzeAerial':
        result = await analyzeAerialImage({
          base64Data,
          lat: lat || '0',
          lng: lng || '0',
          county: county || 'unknown'
        }, ai);
        break;

      case 'scanDriverLicense':
        result = await processDriverLicense({
          base64Data,
          mimeType: mimeType || 'image/jpeg'
        }, ai);
        break;

      case 'consolidate':
        result = consolidateVisionData(req.body.visionResults);
        result.success = true;
        break;

      case 'documentIntel':
        result = await processDocumentIntel(req.body.files || [], ai);
        break;

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Vision processor error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export default securityMiddleware(handler);
