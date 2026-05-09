/**
 * Policy Document Scan API
 * 
 * Extracts insurance data from uploaded policy documents, driver's licenses, etc.
 * Uses Google Gemini AI for OCR and structured data extraction.
 * 
 * SECURITY:
 * - Max file size: 20MB (enforced by bodyParser)
 * - Files never stored on server (processed in memory only)
 * - API key stored in environment variables
 * - No PII logged to console
 * - HTTPS enforced by Vercel
 */

import { securityMiddleware } from '../lib/security.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb'
    }
  }
};

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { files } = req.body || {};
    if (!Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: 'No files provided' });
      return;
    }

    // Validate file count and size
    if (files.length > 10) {
      res.status(400).json({ error: 'Maximum 10 files allowed per scan' });
      return;
    }

    // MIME type allowlist — reject anything that isn't a supported document/image format
    const ALLOWED_MIME_TYPES = new Set([
      'application/pdf',
      'image/jpeg', 'image/jpg', 'image/png',
      'image/webp', 'image/heic', 'image/heif', 'image/tiff',
    ]);
    const MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 50MB combined cap
    let totalBytes = 0;
    for (const file of files) {
      if (!file.mimeType || !ALLOWED_MIME_TYPES.has(file.mimeType.toLowerCase())) {
        res.status(400).json({
          error: `Invalid file type: "${file.mimeType || 'unknown'}". Allowed: PDF, JPEG, PNG, WebP, HEIC, TIFF`
        });
        return;
      }
      if (file.data) totalBytes += Math.ceil((file.data.length * 3) / 4);
    }
    if (totalBytes > MAX_TOTAL_BYTES) {
      res.status(400).json({ error: 'Total file payload exceeds 50MB limit.' });
      return;
    }

    // Use GOOGLE_API_KEY only — never use NEXT_PUBLIC_ prefix for server-side secrets
    const apiKey = (process.env.GOOGLE_API_KEY || '').trim();
    if (!apiKey) {
      res.status(500).json({ error: 'GOOGLE_API_KEY not configured' });
      return;
    }

    // Log anonymized request (no file contents)
    console.log(`[Policy Scan] Processing ${files.length} file(s)`);

    // Field name allowlist — kept here as a single source of truth and injected
    // into the prompt rather than sent as a Gemini response_schema. A schema
    // with ~100 properties (×2 for confidence) trips Gemini's "too many states
    // for serving" constraint, so we constrain via prompt + JSON mime type.
    // Must stay in sync with client-side _getScanSchema() in js/app-export.js
    // and the consumer field lists in js/intake-assist.js / js/app-scan.js.
    const FIELD_KEYS = [
      // Applicant
      'prefix','firstName','lastName','suffix','dob','gender','maritalStatus','phone','email','education','occupation','industry',
      // Co-Applicant
      'coFirstName','coLastName','coDob','coGender','coEmail','coPhone','coRelationship',
      // Address
      'addrStreet','addrCity','addrState','addrZip','yearsAtAddress','county',
      // Property
      'dwellingUsage','occupancyType','yrBuilt','sqFt','dwellingType','roofType','roofShape','roofYr','constructionStyle',
      'numStories','foundation','exteriorWalls','heatingType','cooling','heatYr','plumbYr','elecYr','sewer','waterSource',
      'garageType','garageSpaces','lotSize','numOccupants','bedrooms','fullBaths','halfBaths','kitchenQuality','flooring',
      'numFireplaces','purchaseDate','pool','trampoline','dogInfo','businessOnProperty','woodStove',
      // Safety & Protection
      'burglarAlarm','fireAlarm','sprinklers','smokeDetector','fireStationDist','fireHydrantFeet','protectionClass',
      // Home Coverage
      'homePolicyType','dwellingCoverage','personalLiability','medicalPayments','homeDeductible','windDeductible','mortgagee',
      // Auto / Vehicles
      'vin','vehDesc','autoPolicyType','liabilityLimits','pdLimit','umLimits','uimLimits','compDeductible','autoDeductible',
      'medPayments','rentalDeductible','towingDeductible','studentGPA',
      // Policy / Prior
      'policyNumber','effectiveDate','policyTerm','priorCarrier','priorExp','priorPolicyTerm','priorLiabilityLimits',
      'priorYears','continuousCoverage','homePriorCarrier','homePriorExp','homePriorPolicyTerm','homePriorYears',
      'accidents','violations',
      // Additional
      'additionalInsureds','contactTime','referralSource','additionalVehicles','additionalDrivers',
    ];

    const systemInstruction = {
      role: 'system',
      parts: [
        {
          text:
            'You are a senior insurance underwriter and document analyst with 20+ years experience reading policies from every major US carrier ' +
            '(State Farm, Allstate, Progressive, GEICO, Farmers, Safeco, Liberty Mutual, Nationwide, USAA, Erie, Travelers, Hartford, Auto-Owners, ' +
            'American Family, Encompass, MetLife, Kemper, Mercury, Bristol West, National General, Foremost, Stillwater, and many others). ' +
            'You have deep expertise in reading Declarations Pages (dec pages), policy jackets, renewal notices, endorsement pages, and binders. ' +
            'You understand that every carrier formats their documents differently — some use tables, some use flowing text, some use numbered sections. ' +
            'You know that the DECLARATIONS PAGE is the most data-rich page and typically contains: named insured, policy number, effective/expiration dates, ' +
            'coverages with limits, deductibles, vehicles with VINs, listed drivers, premium breakdowns, property address, and mortgagee/lienholder info. ' +
            'You can distinguish between AGENT/AGENCY information and INSURED/POLICYHOLDER information — these are different people. ' +
            'The insured is the customer; the agent is the seller. Only extract the INSURED\'s personal info. ' +
            'You understand that "Named Insured", "Policyholder", "Insured", "Primary Insured", and "First Named Insured" all refer to the same person. ' +
            'You know coverage terminology: "BI" = Bodily Injury, "PD" = Property Damage, "UM/UIM" = Uninsured/Underinsured Motorist, ' +
            '"Comp" = Comprehensive, "Coll" = Collision, "Med Pay" = Medical Payments, "PIP" = Personal Injury Protection. ' +
            'For limits shown as "100/300/100" you know this means $100k BI per person / $300k BI per accident / $100k PD. ' +
            'You recognize home policy types: HO-3 (standard homeowner), HO-5 (comprehensive), HO-4 (renter), HO-6 (condo), DP-1/DP-3 (dwelling/landlord). ' +
            'When reading multi-page documents, you extract data from ALL pages and merge/reconcile. If there are conflicts between pages, prefer the dec page. ' +
            'You handle poor quality scans, rotated pages, faxed documents, and partially obscured text by inferring from context when possible. ' +
            'Return only JSON that matches the schema. Use empty strings for any data not found. ' +
            'Provide confidence scores between 0 and 1 based on how clearly you can read each value and how certain you are of the mapping. ' +
            'Report quality issues like blurry text, missing pages, or ambiguous data in the quality_issues array.' +
            '\n\nCRITICAL FORMATTING RULES:\n' +
            '- Return ONLY valid JSON — no markdown fences, no commentary before or after the JSON.\n' +
            '- Use empty strings "" for any data not found. Never use null.\n' +
            '- Normalize ALL dates to YYYY-MM-DD format (e.g., "01/15/2024" → "2024-01-15").\n' +
            '- Normalize currency to plain numbers without $ or commas (e.g., "$1,250" → "1250").\n' +
            '- State abbreviations must be 2-letter codes (e.g., "Washington" → "WA").\n' +
            '- Gender must be "M" or "F" (not "Male" or "Female").\n' +
            '- Confidence scores: 0.0 (not found/guessed) to 1.0 (clearly readable). Use 0.5-0.7 for inferred values.\n' +
            '- quality_issues array: list any blurry text, missing pages, ambiguous data, or low-confidence extractions.\n' +
            '\nEXAMPLE OUTPUT STRUCTURE:\n' +
            '{"fields":{"firstName":"John","lastName":"Smith","dob":"1985-03-15","addrStreet":"123 Main St","addrCity":"Seattle","addrState":"WA","addrZip":"98101",...},' +
            '"confidence":{"firstName":0.95,"lastName":0.95,"dob":0.8,...},"quality_issues":["Page 2 was partially cut off","Prior carrier name unclear"]}\n\n' +
            'ALLOWED FIELD KEYS (use ONLY these keys inside "fields" and "confidence" — do not invent new keys, do not abbreviate, match casing exactly):\n' +
            FIELD_KEYS.join(', ')
        }
      ]
    };

    const userPrompt =
      'Analyze these insurance policy document(s) and extract ALL available information:\n\n' +
      '**POLICYHOLDER/INSURED:** Prefix (Mr/Mrs/Ms), first name, last name, suffix (Jr/Sr/III), date of birth, gender (M/F), marital status, phone, email, education, occupation, industry\n' +
      '**CO-APPLICANT/SPOUSE:** First name, last name, date of birth, gender (M/F), email, phone, relationship (if listed)\n' +
      '**ADDRESS:** For home/property policies, extract the **property/risk location address** (the physical location of the insured dwelling) — NOT the insured\'s mailing address if the two differ. For auto policies, use the insured\'s mailing/garaging address. Never use the agent or agency address. Fields: street address, city, state (2-letter code), ZIP, county, years at address\n' +
      '**PROPERTY:** Year built, square footage, dwelling type (single family, condo, townhouse, mobile home, etc.), dwelling usage (primary/secondary/rental/vacant), occupancy type, ' +
      'roof type, roof shape (gable/hip/flat/gambrel), roof year, construction style, stories, foundation, ' +
      'exterior walls (vinyl, brick, stucco, wood, etc.), heating type (gas forced air, electric, oil, etc.), heating year, cooling type, ' +
      'plumbing year, electrical year, sewer type, water source, ' +
      'garage type (attached, detached, carport, none), garage spaces, lot size (acres), ' +
      'number of occupants, bedrooms, full baths, half baths, kitchen quality, flooring type, fireplaces, purchase date, ' +
      'pool (yes/no/fenced/unfenced), trampoline (yes/no), dog info (breed if mentioned), business on property (yes/no), wood stove (yes/no)\n' +
      '**SAFETY & PROTECTION:** Burglar alarm (yes/no/type), fire alarm (yes/no), sprinklers (yes/no), smoke detectors (yes/no), ' +
      'fire station distance, fire hydrant distance (feet), protection class\n' +
      '**HOME COVERAGE:** Policy type (HO-3, HO-5, HO-4, HO-6, DP-1, DP-3), dwelling coverage amount, personal liability, medical payments, ' +
      'deductible, wind/hail deductible, mortgagee/lender name\n' +
      '**VEHICLES:** VIN number(s), vehicle description (year/make/model). If multiple vehicles, put each extra one in additionalVehicles separated by semicolons, format: "YYYY Make Model VIN: XXXXX; YYYY Make Model VIN: XXXXX"\n' +
      '**AUTO COVERAGE:** Auto policy type (standard/broad/basic), liability limits (e.g., 100/300/100), property damage limit, UM limits, UIM limits, ' +
      'comprehensive deductible, collision deductible, med pay, rental reimbursement, towing/roadside, student GPA discount\n' +
      '**DRIVERS:** If multiple drivers beyond the primary insured, list them in additionalDrivers separated by semicolons, format: "FirstName LastName DOB: YYYY-MM-DD; FirstName LastName DOB: YYYY-MM-DD"\n' +
      '**POLICY INFO:** Policy number, effective date, policy term (6 month/12 month/annual), prior carrier name, prior expiration date, prior policy term, prior liability limits, ' +
      'years with prior carrier, continuous coverage (yes/no). If separate home/auto carriers, use homePriorCarrier/homePriorExp/homePriorPolicyTerm/homePriorYears for home.\n' +
      '**CLAIMS/VIOLATIONS:** Accidents (count or descriptions), violations (count or descriptions)\n' +
      '**ADDITIONAL:** Additional insureds (names), preferred contact time, referral source\n\n' +
      'IMPORTANT NOTES:\n' +
      '- Different carriers use different labels: "Named Insured", "Policyholder", "Insured", "Primary Insured" all mean the same thing\n' +
      '- Ignore agent/agency information - we only want the INSURED\'s info\n' +
      '- Coverage labels vary: "BI/PD", "Bodily Injury/Property Damage", "Liability Limits" all refer to liability coverage\n' +
      '- Look for the declarations page (dec page) which has the most complete information\n' +
      '- Multi-page policies: extract from ALL pages provided\n' +
      '- Normalize dates to YYYY-MM-DD format when possible\n' +
      '- Normalize currency to plain numbers (no $ or commas)\n' +
      '- Gender must be M or F (not Male/Female)\n' +
      '- If image quality is poor or data is unclear, note it in quality_issues\n\n' +
      'Return structured JSON with the extracted fields.';


    const parts = [{ text: userPrompt }].concat(
      files.map((file) => ({
        inlineData: {
          mimeType: file.mimeType,
          data: file.data
        }
      }))
    );

    const payload = {
      contents: [{ role: 'user', parts }],
      systemInstruction,
      generationConfig: {
        temperature: 0.1,
        response_mime_type: 'application/json'
      }
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();
    if (!response.ok) {
      res.status(500).json({ error: data?.error?.message || 'Gemini request failed' });
      return;
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      res.status(500).json({ error: 'No extraction result returned' });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      res.status(500).json({ error: 'Malformed JSON from Gemini' });
      return;
    }

    res.status(200).json(parsed);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Server error' });
  }
}

export default securityMiddleware(handler);
