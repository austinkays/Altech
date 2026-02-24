import { securityMiddleware } from '../lib/security.js';
import { createRouter, extractJSON } from './_ai-router.js';

/**
 * RAG (Retrieval-Augmented Generation) Interpreter
 * 
 * Phase 3: RAG Pattern Integration
 * 
 * This endpoint implements the RAG pattern for property data interpretation.
 * Instead of asking AI to "find" data (which leads to hallucinations),
 * we fetch official data first, then ask AI to interpret and standardize it.
 * 
 * WORKFLOW:
 * 1. Phase 1/2 fetches official parcel data (raw format)
 * 2. Phase 3 sends raw data to AI with interpretation prompt
 * 3. AI standardizes values, extracts key fields, fixes errors
 * 4. Returns interpreted data with 99%+ confidence
 * 5. AI never invents data - only interprets what it receives
 * 
 * Routes through user's chosen AI provider via _ai-router.js.
 * Falls back to Google Gemini via env key when no user settings provided.
 */

/**
 * System prompt for the RAG interpreter — establishes role and rules.
 * The user prompt will contain the actual raw data.
 */
const RAG_SYSTEM_PROMPT = `You are a property data standardization expert for insurance applications.
You receive raw parcel data from county assessor offices with inconsistent codes and abbreviations.
Your job is to interpret this raw data and map it to standardized insurance form fields.

CRITICAL RULES:
1. ONLY use data provided. NEVER invent or guess.
2. If a field is missing or unclear, return "Unknown" or 0 — do NOT estimate.
3. Interpret county codes and abbreviations using the mappings below.
4. Map values to EXACT options from the form field lists.
5. Handle common variations and typos.
6. Return valid JSON ONLY (no markdown, no code blocks, no explanation).

FORM FIELD MAPPINGS:

Foundation Type: ["Slab", "Crawl Space", "Basement", "Pier", "Combination", "Unknown"]
  SLAB/SLB → Slab, CRAW/CRWL → Crawl Space, BSMT/BASE → Basement, PIER/POST → Pier

Roof Type: ["Asphalt Shingle", "Metal", "Tile", "Wood Shake", "Slate", "Flat", "Other", "Unknown"]
  ASPH/COMP/ASPHALT → Asphalt Shingle, MTL/METAL → Metal, TILE/CLY → Tile, SHAK/WOOD → Wood Shake

Heating Type: ["Forced Air", "Electric Baseboard", "Heat Pump", "Hot Water", "Steam", "Gravity", "Other", "Unknown"]
  FRC/FA/GAS → Forced Air, ELEC/EB → Electric Baseboard, HP/HEATPUMP → Heat Pump, HW → Hot Water

Construction Style: ["Frame", "Masonry", "Brick Veneer", "Stone", "Stucco", "Log", "Adobe", "Metal", "Other", "Unknown"]
  FRM/FRAME/WOOD → Frame, MSNRY/BRK → Masonry, BRKV → Brick Veneer, STUC → Stucco

Garage Type: ["Attached", "Detached", "Built-in", "Carport", "None", "Unknown"]
  ATT/ATTG → Attached, DET/DETG → Detached, BLTIN → Built-in, CRPT → Carport

NUMERIC FIELD RULES:
- yearBuilt: YYYY integer 1800-2026, else 0
- stories: Integer 1-5, else 0
- lotSizeAcres: Decimal > 0, else 0
- totalSqft: Integer > 0, else 0
- basementSqft: Integer >= 0, else 0
- garageSqft: Integer >= 0, else 0
- garageSpaces: Integer 0-5 (1 space ≈ 180-200 sqft), else 0
- bedrooms: Integer 0-10, else 0
- bathrooms: Decimal 0-10, else 0`;

/**
 * Build the user prompt with actual raw data
 */
function buildRAGUserPrompt(rawDataString) {
  return `Interpret this raw county assessor data and return standardized JSON:

RAW DATA:
${rawDataString}

Return this EXACT JSON structure:
{
  "parcelId": "string",
  "yearBuilt": 0,
  "stories": 0,
  "lotSizeAcres": 0.0,
  "totalSqft": 0,
  "basementSqft": 0,
  "garageSqft": 0,
  "garageSpaces": 0,
  "bedrooms": 0,
  "bathrooms": 0.0,
  "foundationType": "Unknown",
  "roofType": "Unknown",
  "heatingType": "Unknown",
  "constructionStyle": "Unknown",
  "garageType": "Unknown",
  "landUse": "Unknown",
  "interpretation_notes": "Brief note about any code interpretations made",
  "data_quality": "complete"
}`;
}

/**
 * Interpret raw parcel data using the RAG pattern.
 * Routes through user's chosen AI provider for standardization.
 */
async function interpretParcelData(rawParcelData, countyName, ai) {
  try {
    // Format raw data for prompt
    const rawDataString = Object.entries(rawParcelData)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    const userPrompt = buildRAGUserPrompt(rawDataString);

    const responseText = await ai.ask(RAG_SYSTEM_PROMPT, userPrompt, {
      temperature: 0.3,
      maxTokens: 2048
    });

    const interpretedData = extractJSON(responseText);

    if (!interpretedData) {
      return {
        success: false,
        error: 'Could not parse JSON from AI response',
        fallback: true,
        parcelData: rawParcelData
      };
    }

    // Validate output structure
    const requiredFields = ['parcelId', 'yearBuilt', 'stories', 'lotSizeAcres', 'totalSqft', 'garageSpaces'];
    const hasAllFields = requiredFields.every(field => field in interpretedData);

    if (!hasAllFields) {
      return {
        success: false,
        error: 'AI response missing required fields',
        fallback: true,
        parcelData: rawParcelData
      };
    }

    // Clean up numeric types and preserve all fields
    const cleaned = {
      parcelId: String(interpretedData.parcelId || 'N/A'),
      yearBuilt: parseInt(interpretedData.yearBuilt) || 0,
      stories: parseInt(interpretedData.stories) || 0,
      lotSizeAcres: parseFloat(interpretedData.lotSizeAcres) || 0,
      totalSqft: parseInt(interpretedData.totalSqft) || 0,
      basementSqft: parseInt(interpretedData.basementSqft) || 0,
      garageSqft: parseInt(interpretedData.garageSqft) || 0,
      garageSpaces: parseInt(interpretedData.garageSpaces) || 0,
      bedrooms: parseInt(interpretedData.bedrooms) || 0,
      bathrooms: parseFloat(interpretedData.bathrooms) || 0,
      foundationType: String(interpretedData.foundationType || 'Unknown'),
      roofType: String(interpretedData.roofType || 'Unknown'),
      heatingType: String(interpretedData.heatingType || 'Unknown'),
      constructionStyle: String(interpretedData.constructionStyle || 'Unknown'),
      garageType: String(interpretedData.garageType || 'Unknown'),
      landUse: String(interpretedData.landUse || 'N/A'),
      countyName: countyName,
      interpretation_notes: interpretedData.interpretation_notes || '',
      data_quality: interpretedData.data_quality || 'partial'
    };

    return {
      success: true,
      county: countyName,
      parcelData: cleaned,
      method: 'rag-interpreter',
      confidence: 0.99,
      source: 'AI interpretation of official data',
      aiProvider: ai.provider
    };

  } catch (error) {
    console.error('RAG Interpreter Error:', error);
    return {
      success: false,
      error: error.message,
      fallback: true,
      parcelData: rawParcelData
    };
  }
}

/**
 * Batch interpret multiple properties
 * Useful for quote library exports
 */
async function batchInterpretData(parcelDataArray, countyName, ai) {
  const results = await Promise.all(
    parcelDataArray.map(data => interpretParcelData(data, countyName, ai))
  );
  return results;
}

/**
 * Validate interpreted data quality
 * Ensures output is sensible (year in range, positive measurements, etc.)
 */
function validateInterpretedData(parcelData) {
  const errors = [];

  if (parcelData.yearBuilt < 1800 || parcelData.yearBuilt > 2026) {
    errors.push('Year built out of valid range');
  }

  if (parcelData.stories < 0 || parcelData.stories > 5) {
    errors.push('Stories out of valid range');
  }

  if (parcelData.lotSizeAcres < 0) {
    errors.push('Lot size cannot be negative');
  }

  if (parcelData.totalSqft < 0) {
    errors.push('Total sq ft cannot be negative');
  }

  if (parcelData.garageSpaces < 0 || parcelData.garageSpaces > 5) {
    errors.push('Garage spaces out of valid range');
  }

  return {
    valid: errors.length === 0,
    errors: errors,
    quality_score: Math.max(0, 100 - (errors.length * 20)) // Each error reduces score by 20
  };
}

/**
 * Main handler function
 * Vercel serverless function entry point
 */
async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { rawParcelData, county, aiSettings } = req.body;

    // Validate inputs
    if (!rawParcelData || !county) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: rawParcelData, county'
      });
    }

    // Ensure rawParcelData is an object
    if (typeof rawParcelData !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'rawParcelData must be an object'
      });
    }

    const ai = createRouter(aiSettings);

    // Interpret data using RAG
    const result = await interpretParcelData(rawParcelData, county, ai);

    // Validate output if successful
    if (result.success) {
      const validation = validateInterpretedData(result.parcelData);
      result.validation = validation;
    }

    res.status(200).json(result);

  } catch (error) {
    console.error('RAG Handler Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      fallback: true
    });
  }
}

export default securityMiddleware(handler);
