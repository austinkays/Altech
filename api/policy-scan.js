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

import { securityMiddleware } from './_security.js';

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

    const apiKey = (process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY || '').trim();
    if (!apiKey) {
      res.status(500).json({ error: 'GOOGLE_API_KEY not configured' });
      return;
    }

    // Log anonymized request (no file contents)
    console.log(`[Policy Scan] Processing ${files.length} file(s)`);

    const fieldProps = {
      // Applicant
      firstName: { type: 'string' }, lastName: { type: 'string' },
      dob: { type: 'string' }, gender: { type: 'string' }, maritalStatus: { type: 'string' },
      phone: { type: 'string' }, email: { type: 'string' },
      education: { type: 'string' }, occupation: { type: 'string' },
      // Co-Applicant
      coFirstName: { type: 'string' }, coLastName: { type: 'string' },
      coDob: { type: 'string' }, coGender: { type: 'string' }, coRelationship: { type: 'string' },
      // Address
      addrStreet: { type: 'string' }, addrCity: { type: 'string' },
      addrState: { type: 'string' }, addrZip: { type: 'string' },
      // Property
      yrBuilt: { type: 'string' }, sqFt: { type: 'string' }, dwellingType: { type: 'string' },
      roofType: { type: 'string' }, constructionStyle: { type: 'string' },
      numStories: { type: 'string' }, foundation: { type: 'string' },
      exteriorWalls: { type: 'string' }, heatingType: { type: 'string' },
      garageType: { type: 'string' }, lotSize: { type: 'string' },
      pool: { type: 'string' }, trampoline: { type: 'string' }, dogInfo: { type: 'string' },
      // Home Coverage
      homePolicyType: { type: 'string' }, dwellingCoverage: { type: 'string' },
      personalLiability: { type: 'string' }, medicalPayments: { type: 'string' },
      homeDeductible: { type: 'string' }, mortgagee: { type: 'string' },
      // Auto / Vehicles
      vin: { type: 'string' }, vehDesc: { type: 'string' },
      liabilityLimits: { type: 'string' }, pdLimit: { type: 'string' },
      umLimits: { type: 'string' }, uimLimits: { type: 'string' },
      compDeductible: { type: 'string' }, autoDeductible: { type: 'string' },
      medPaymentsAuto: { type: 'string' },
      rentalDeductible: { type: 'string' }, towingDeductible: { type: 'string' },
      // Policy / Prior
      policyNumber: { type: 'string' },
      effectiveDate: { type: 'string' }, policyTerm: { type: 'string' },
      priorCarrier: { type: 'string' }, priorExp: { type: 'string' },
      priorPolicyTerm: { type: 'string' }, priorLiabilityLimits: { type: 'string' },
      homePriorCarrier: { type: 'string' }, homePriorExp: { type: 'string' },
      // Additional vehicles/drivers (text descriptions)
      additionalVehicles: { type: 'string' }, additionalDrivers: { type: 'string' },
    };

    const confProps = {};
    Object.keys(fieldProps).forEach(k => { confProps[k] = { type: 'number' }; });

    const schema = {
      type: 'object',
      properties: {
        fields: { type: 'object', properties: fieldProps },
        confidence: { type: 'object', properties: confProps },
        quality_issues: { type: 'array', items: { type: 'string' } }
      },
      required: ['fields']
    };

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
            'Report quality issues like blurry text, missing pages, or ambiguous data in the quality_issues array.'
        }
      ]
    };

    const userPrompt =
      'Analyze these insurance policy document(s) and extract ALL available information:\n\n' +
      '**POLICYHOLDER/INSURED:** First name, last name, date of birth, gender (M/F), marital status, phone, email, education, occupation\n' +
      '**CO-APPLICANT/SPOUSE:** First name, last name, date of birth, gender, relationship (if listed)\n' +
      '**ADDRESS:** Street address, city, state (2-letter code), ZIP (insured\'s address, NOT the agency/agent address)\n' +
      '**PROPERTY:** Year built, square footage, dwelling type (single family, condo, townhouse, mobile home, etc.), roof type, construction style, stories, foundation, ' +
      'exterior walls (vinyl, brick, stucco, wood, etc.), heating type (gas forced air, electric, oil, etc.), garage type (attached, detached, carport, none), lot size (acres), ' +
      'pool (yes/no/fenced/unfenced), trampoline (yes/no), dog info (breed if mentioned)\n' +
      '**HOME COVERAGE:** Policy type (HO-3, HO-5, HO-4, HO-6, DP-1, DP-3), dwelling coverage amount, personal liability, medical payments, deductible, mortgagee/lender name\n' +
      '**VEHICLES:** VIN number(s), vehicle description (year/make/model). If multiple vehicles, put each extra one in additionalVehicles separated by semicolons, format: "YYYY Make Model VIN: XXXXX; YYYY Make Model VIN: XXXXX"\n' +
      '**AUTO COVERAGE:** Liability limits (e.g., 100/300/100), property damage limit, UM limits, UIM limits, comprehensive deductible, collision deductible, med pay (auto), rental reimbursement, towing/roadside\n' +
      '**DRIVERS:** If multiple drivers beyond the primary insured, list them in additionalDrivers separated by semicolons, format: "FirstName LastName DOB: YYYY-MM-DD; FirstName LastName DOB: YYYY-MM-DD"\n' +
      '**POLICY INFO:** Policy number, effective date, policy term (6 month/12 month/annual), prior carrier name, prior expiration date, prior policy term, prior liability limits. ' +
      'If separate home/auto carriers, use homePriorCarrier/homePriorExp for home.\n\n' +
      'IMPORTANT NOTES:\n' +
      '- Different carriers use different labels: "Named Insured", "Policyholder", "Insured", "Primary Insured" all mean the same thing\n' +
      '- Ignore agent/agency information - we only want the INSURED\'s info\n' +
      '- Coverage labels vary: "BI/PD", "Bodily Injury/Property Damage", "Liability Limits" all refer to liability coverage\n' +
      '- Look for the declarations page (dec page) which has the most complete information\n' +
      '- Multi-page policies: extract from ALL pages provided\n' +
      '- Normalize dates to YYYY-MM-DD format when possible\n' +
      '- Normalize currency to plain numbers (no $ or commas)\n' +
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
        response_mime_type: 'application/json',
        response_schema: schema
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
