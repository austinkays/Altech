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

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb'
    }
  }
};

export default async function handler(req, res) {
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

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'NEXT_PUBLIC_GOOGLE_API_KEY not configured' });
      return;
    }

    // Log anonymized request (no file contents)
    console.log(`[Policy Scan] Processing ${files.length} file(s)`);

    const schema = {
      type: 'object',
      properties: {
        fields: {
          type: 'object',
          properties: {
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            dob: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string' },
            addrStreet: { type: 'string' },
            addrCity: { type: 'string' },
            addrState: { type: 'string' },
            addrZip: { type: 'string' },
            vin: { type: 'string' },
            vehDesc: { type: 'string' },
            liabilityLimits: { type: 'string' },
            homeDeductible: { type: 'string' },
            autoDeductible: { type: 'string' },
            priorCarrier: { type: 'string' },
            priorExp: { type: 'string' }
          }
        },
        confidence: {
          type: 'object',
          properties: {
            firstName: { type: 'number' },
            lastName: { type: 'number' },
            dob: { type: 'number' },
            phone: { type: 'number' },
            email: { type: 'number' },
            addrStreet: { type: 'number' },
            addrCity: { type: 'number' },
            addrState: { type: 'number' },
            addrZip: { type: 'number' },
            vin: { type: 'number' },
            vehDesc: { type: 'number' },
            liabilityLimits: { type: 'number' },
            homeDeductible: { type: 'number' },
            autoDeductible: { type: 'number' },
            priorCarrier: { type: 'number' },
            priorExp: { type: 'number' }
          }
        },
        quality_issues: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['fields']
    };

    const systemInstruction = {
      role: 'system',
      parts: [
        {
          text:
            'You are an insurance policy ingestion assistant. Extract key policy details and map them to the provided schema. ' +
            'Return only JSON that matches the schema. If data is missing, return empty strings. ' +
            'Provide confidence scores between 0 and 1 for each field you populate.'
        }
      ]
    };

    const userPrompt =
      'Extract policyholder information, address, VIN, vehicle description, limits, deductibles, and prior carrier data. ' +
      'Recognize labels like Named Insured, Policyholder, Coverage Limits, Deductibles, Effective Date, Expiration Date. ' +
      'Normalize dates to YYYY-MM-DD when possible. If a photo is blurry or incomplete, add a short note in quality_issues.';

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
