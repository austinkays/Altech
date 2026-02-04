import { GoogleGenerativeAI } from "@google/generative-ai";

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
 * Model: gemini-2.0-flash-001 (vision-capable)
 */

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

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
async function processPropertyImage(options) {
  const { base64Data, mimeType, imageType, county } = options;

  if (!base64Data) {
    return {
      success: false,
      error: "No image data provided",
      rawData: {}
    };
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-001" });

    const prompt = `You are a property assessment expert analyzing property images.

Given a ${imageType} image, extract and standardize the following information:

EXTRACTION RULES:
1. ONLY extract information VISIBLE in the image
2. Do NOT guess or estimate
3. If unclear, return "N/A"
4. Be specific and precise

FOR ROOF IMAGES:
- Roof type: [asphalt, metal, tile, slate, wood, composition, flat, other]
- Material condition: [excellent, good, fair, poor]
- Estimated age: [new, recent, moderate, aged, unknown]
- Color: [black, gray, brown, red, tan, other]
- Visible damage: [yes/no, describe briefly]
- Pitch: [low, medium, steep]

FOR FOUNDATION IMAGES:
- Foundation type: [concrete, brick, stone, wood, unknown]
- Material condition: [good, fair, poor]
- Visible cracks: [yes/no, severity if yes]
- Water damage: [yes/no]

FOR EXTERIOR IMAGES:
- Siding type: [vinyl, brick, wood, stucco, composite, other]
- Paint condition: [good, fair, poor, needs painting]
- Visible defects: [list any major issues]
- Estimated age: [rough estimate]

FOR SATELLITE/AERIAL IMAGES:
- Lot size estimate: [small, medium, large, very large]
- Neighboring structures: [describe]
- Tree coverage: [minimal, moderate, heavy]
- Visible additions/structures: [pool, shed, garage, etc.]

Return JSON with extracted values and confidence (0-100).`;

    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            },
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 500
      }
    });

    const responseText = response.content.parts[0].text;
    
    // Try to parse JSON response
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedData = JSON.parse(jsonMatch[0]);
        return {
          success: true,
          rawData: parsedData,
          confidence: parsedData.confidence || 80,
          dataSource: "phase4-vision",
          imageType: imageType
        };
      }
    } catch (parseError) {
      // If JSON parsing fails, extract key-value pairs manually
      return {
        success: true,
        rawData: { raw_response: responseText },
        confidence: 70,
        dataSource: "phase4-vision",
        imageType: imageType
      };
    }
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
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-001" });

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

    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "application/pdf",
                data: base64Data
              }
            },
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1000
      }
    });

    const responseText = response.content.parts[0].text;
    
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedData = JSON.parse(jsonMatch[0]);
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
    } catch (parseError) {
      return {
        success: true,
        rawData: { raw_response: responseText },
        confidence: 70,
        dataSource: "phase4-vision-pdf",
        documentType: documentType
      };
    }
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
async function analyzeAerialImage(options) {
  const { base64Data, lat, lng, county } = options;

  if (!base64Data) {
    return {
      success: false,
      error: "No image data provided",
      hazards: []
    };
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-001" });

    const prompt = `You are an aerial image analyst for property risk assessment.

Analyze this satellite/aerial image of property near ${lat}, ${lng} in ${county} county.

IDENTIFY AND ASSESS:

FLOOD HAZARDS:
- Proximity to water bodies (streams, lakes, ponds)
- Topography (low areas, flood plains)
- Storm drain visibility
- Wetland indicators

WILDFIRE HAZARDS:
- Vegetation density
- Forest proximity
- Defensible space
- Access roads

WIND HAZARDS:
- Open exposure
- Wind break features
- Nearby trees

STRUCTURAL OBSERVATIONS:
- Building footprint
- Roof condition (if visible)
- Outbuildings/structures
- Lot characteristics

Return JSON:
{
  "hazards": [
    { "type": "flood|wildfire|wind|other", "severity": "low|moderate|high", "description": "" }
  ],
  "lotCharacteristics": {
    "terrain": "flat|rolling|steep",
    "coverage": "open|partial|heavily vegetated",
    "structureCount": number
  },
  "confidence": 0-100,
  "caveats": "image age/clarity notes"
}`;

    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Data
              }
            },
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 600
      }
    });

    const responseText = response.content.parts[0].text;
    
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedData = JSON.parse(jsonMatch[0]);
        return {
          success: true,
          hazards: parsedData.hazards || [],
          lotCharacteristics: parsedData.lotCharacteristics || {},
          confidence: parsedData.confidence || 75,
          dataSource: "phase4-vision-aerial"
        };
      }
    } catch (parseError) {
      return {
        success: true,
        rawData: { raw_response: responseText },
        confidence: 65,
        dataSource: "phase4-vision-aerial"
      };
    }
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
async function processDriverLicense(options) {
  const { base64Data, mimeType } = options;

  if (!base64Data) {
    return {
      success: false,
      error: 'No image data provided',
      data: {}
    };
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-001' });

    const prompt = `You are extracting data from a US driver's license image.
Return ONLY JSON with this schema:
{
  "firstName": "",
  "lastName": "",
  "dob": "YYYY-MM-DD",
  "licenseNumber": "",
  "licenseState": "",
  "addressLine1": "",
  "city": "",
  "state": "",
  "zip": "",
  "confidence": 0-100
}
Rules:
- If a field is missing, use empty string
- Normalize DOB to YYYY-MM-DD
- Use 2-letter state code`;

    const response = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: mimeType || 'image/jpeg', data: base64Data } },
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 300
      }
    });

    const responseText = response.content.parts[0].text;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        success: false,
        error: 'Unable to parse license data',
        data: {}
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);
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
      confidence: parsed.confidence || 80
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      data: {}
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
 * Vercel serverless handler
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, base64Data, mimeType, imageType, documentType, county, lat, lng } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'Action required' });
  }

  try {
    let result;

    switch (action) {
      case 'processImage':
        result = await processPropertyImage({
          base64Data,
          mimeType: mimeType || 'image/jpeg',
          imageType: imageType || 'other',
          county: county || 'unknown'
        });
        break;

      case 'processPDF':
        result = await processPDFDocument({
          base64Data,
          documentType: documentType || 'other',
          county: county || 'unknown'
        });
        break;

      case 'analyzeAerial':
        result = await analyzeAerialImage({
          base64Data,
          lat: lat || '0',
          lng: lng || '0',
          county: county || 'unknown'
        });
        break;

      case 'scanDriverLicense':
        result = await processDriverLicense({
          base64Data,
          mimeType: mimeType || 'image/jpeg'
        });
        break;

      case 'consolidate':
        result = consolidateVisionData(req.body.visionResults);
        result.success = true;
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
