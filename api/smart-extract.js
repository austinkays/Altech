/**
 * Smart Property Data Extraction API (Simplified)
 * 
 * Uses Google Gemini AI with satellite imagery to extract property data
 * Note: Web scraping (Zillow, Redfin, GIS) was unreliable and has been removed
 * This now focuses on satellite imagery analysis + user guidance
 * 
 * SECURITY:
 * - All data transmitted over HTTPS
 * - API keys stored in Vercel environment variables
 * - No PII logged or stored
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { address, city, state, zip } = req.body;
    
    if (!address || !city || !state) {
      return res.status(400).json({ error: 'Address, city, and state are required' });
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GOOGLE_API_KEY not configured' });
    }

    const fullAddress = `${address}, ${city}, ${state} ${zip || ''}`.trim();
    
    // Get satellite imagery
    const satelliteData = await fetchSatelliteImagery(fullAddress, apiKey);

    // Analyze satellite imagery with Gemini
    const extractedData = await extractWithGemini(
      fullAddress,
      satelliteData,
      apiKey
    );

    res.status(200).json({
      success: true,
      data: extractedData.data,
      satellites: extractedData.confidence,
      satelliteImage: satelliteData?.image || null,
      notes: "Analysis based on satellite imagery only. Manual verification recommended."
    });

  } catch (error) {
    console.error('[Smart Extract] Error:', error.message);
    res.status(500).json({ 
      error: 'Failed to extract property data',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please use manual entry or external sources'
    }); 
  }
}

// Fetch satellite imagery from Google Maps Static API
async function fetchSatelliteImagery(address, apiKey) {
  try {
    const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(address)}&zoom=19&size=640x640&maptype=satellite&key=${apiKey}`;
    
    const response = await fetch(mapUrl);
    if (!response.ok) return null;
    
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    
    return {
      image: base64,
      mimeType: 'image/png',
      url: mapUrl
    };
  } catch (error) {
    console.error('Satellite imagery error:', error);
    return null;
  }
}

// Extract data using Gemini AI + satellite imagery
async function extractWithGemini(address, satelliteData, apiKey) {
  const prompt = `Analyze the satellite image for property at: ${address}

Extract what you can visually see:
- Pool? (blue water - in-ground or above-ground)
- Trampoline? (circular/rectangular structure)
- Roof type? (shingles, metal, tile, flat, wood)
- Roof color?
- Stories? (1, 1.5, 2, 2.5, 3+)
- Garage count? (visible spaces)
- Deck/patio present?
- Tree coverage?

Return ONLY JSON (no markdown):
{
  "data": {
    "pool": "yes|no|unknown",
    "trampoline": "yes|no|unknown",
    "roofType": "type or unknown",
    "roofColor": "color or unknown",
    "numStories": "count or unknown",
    "garageSpaces": "count or unknown",
    "deck": "yes|no|unknown",
    "patio": "yes|no|unknown",
    "treesCoverage": "minimal|moderate|heavy|unknown"
  },
  "confidence": "high|medium|low",
  "notes": "Satellite analysis only. Missing: construction, systems, interiors, year built, sqft, lot size. User must verify with public records."
}`;

  const parts = [{ text: prompt }];
  
  if (satelliteData) {
    parts.push({
      inlineData: {
        mimeType: satelliteData.mimeType,
        data: satelliteData.image
      }
    });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.statusText}`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) {
    throw new Error('Invalid response format');
  }

  return JSON.parse(jsonMatch[0]);
}
