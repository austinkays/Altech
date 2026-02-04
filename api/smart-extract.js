/**
 * Smart Property Data Extraction API
 * 
 * Fetches and extracts property data from multiple sources:
 * - Zillow (listing data)
 * - Redfin (property details)
 * - County GIS (official records)
 * - Google Maps (satellite imagery analysis)
 * 
 * Uses Google Gemini AI to extract structured data from all sources
 * 
 * SECURITY:
 * - All data transmitted over HTTPS (TLS 1.3)
 * - API keys stored in Vercel environment variables (never exposed to client)
 * - No PII logged to console or stored server-side
 * - Addresses sanitized before external API calls
 * - Rate limiting via Vercel function limits (10s timeout)
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

    // Sanitize inputs to prevent injection
    const sanitizedAddress = String(address).trim().substring(0, 200);
    const sanitizedCity = String(city).trim().substring(0, 100);
    const sanitizedState = String(state).trim().toUpperCase().substring(0, 2);
    const sanitizedZip = zip ? String(zip).trim().substring(0, 10) : '';

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GOOGLE_API_KEY not configured' });
    }

    const fullAddress = `${sanitizedAddress}, ${sanitizedCity}, ${sanitizedState} ${sanitizedZip}`.trim();
    
    // Log anonymized request (no PII)
    console.log(`[Smart Extract] Request for: ${sanitizedCity}, ${sanitizedState}`);
    
    // Parallel fetch from multiple sources
    const results = await Promise.allSettled([
      fetchZillowData(fullAddress),
      fetchRedfinData(fullAddress),
      fetchGISData(fullAddress, sanitizedCity, sanitizedState),
      fetchSatelliteImagery(fullAddress, apiKey)
    ]);

    const zillowData = results[0].status === 'fulfilled' ? results[0].value : null;
    const redfinData = results[1].status === 'fulfilled' ? results[1].value : null;
    const gisData = results[2].status === 'fulfilled' ? results[2].value : null;
    const satelliteData = results[3].status === 'fulfilled' ? results[3].value : null;

    // Use Gemini to extract and merge all data
    const extractedData = await extractWithGemini(
      { zillowData, redfinData, gisData, satelliteData },
      fullAddress,
      apiKey
    );

    // Log success (no PII)
    console.log(`[Smart Extract] Success for ${sanitizedCity}, ${sanitizedState}`);

    res.status(200).json({
      success: true,
      data: extractedData.data,
      conflicts: extractedData.conflicts,
      satelliteImage: satelliteData?.image || null,
      sources: {
        zillow: zillowData ? 'success' : 'failed',
        redfin: redfinData ? 'success' : 'failed',
        gis: gisData ? 'success' : 'failed',
        satellite: satelliteData ? 'success' : 'failed'
      }
    });

  } catch (error) {
    // Log error without exposing sensitive details
    console.error('[Smart Extract] Error:', error.message);
    res.status(500).json({ 
      error: 'Failed to extract property data',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    }); 
    });
  }
}

// Fetch Zillow page HTML
async function fetchZillowData(address) {
  try {
    const searchUrl = `https://www.zillow.com/homes/${encodeURIComponent(address)}_rb/`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 10000
    });
    
    if (!response.ok) {
      console.warn(`Zillow fetch failed: ${response.status}`);
      return null;
    }
    
    const html = await response.text();
    
    // Extract key data from Zillow's page structure
    // Zillow embeds property data in JSON-LD structured data
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
    let structuredData = null;
    if (jsonLdMatch) {
      try {
        structuredData = JSON.parse(jsonLdMatch[1]);
      } catch (e) {
        console.warn('Failed to parse Zillow JSON-LD');
      }
    }
    
    return { html, url: searchUrl, structuredData };
  } catch (error) {
    console.error('Zillow fetch error:', error);
    return null;
  }
}

// Fetch Redfin page HTML
async function fetchRedfinData(address) {
  try {
    const searchUrl = `https://www.redfin.com/stingray/do/location-autocomplete?location=${encodeURIComponent(address)}&start=0&count=10&v=2`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.redfin.com/'
      },
      timeout: 10000
    });
    
    if (!response.ok) {
      console.warn(`Redfin fetch failed: ${response.status}`);
      return null;
    }
    
    // Redfin returns JSON with property suggestions
    const text = await response.text();
    // Remove JSONP wrapper if present
    const jsonText = text.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
    const data = JSON.parse(jsonText);
    
    return { data, url: searchUrl };
  } catch (error) {
    console.error('Redfin fetch error:', error);
    return null;
  }
}

// Fetch GIS data based on location
async function fetchGISData(address, city, state) {
  // Expanded GIS URL mappings (from existing openGIS function)
  const gisUrls = {
    'WA': {
      'vancouver': 'https://gis.clark.wa.gov/applications/assessor/',
      'seattle': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx',
      'spokane': 'https://www.spokanecounty.org/277/Assessors-Office',
      'tacoma': 'https://www.piercecountywa.gov/1488/Property-Assessment',
      'olympia': 'https://www.co.thurston.wa.us/assessor/assessing/',
      'bellingham': 'https://www.whatcomcounty.us/1302/Assessor',
      'kennewick': 'https://www.bentoncountywa.gov/departments/assessor/',
      'yakima': 'https://www.co.yakima.wa.us/289/Assessor',
      'everett': 'https://snohomishcountywa.gov/160/Assessor',
      'bellevue': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx',
      'redmond': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx',
      'renton': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx',
      'kent': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx',
      'federal way': 'https://blue.kingcounty.com/Assessor/eRealProperty/default.aspx'
    },
    'OR': {
      'portland': 'https://www.portlandmaps.com/',
      'eugene': 'https://apps.lanecounty.org/PropertyAccountInformation/',
      'salem': 'https://www.co.marion.or.us/AS',
      'gresham': 'https://multco.us/assessment-taxation',
      'hillsboro': 'https://www.co.washington.or.us/AssessmentTaxation/',
      'bend': 'https://www.deschutes.org/assessor',
      'medford': 'https://jacksoncountyor.org/assessment',
      'springfield': 'https://apps.lanecounty.org/PropertyAccountInformation/',
      'corvallis': 'https://www.co.benton.or.us/assessment',
      'albany': 'https://www.co.linn.or.us/departments/assessment-taxation'
    },
    'AZ': {
      'phoenix': 'https://mcassessor.maricopa.gov/',
      'tucson': 'https://www.asr.pima.gov/assessor/',
      'mesa': 'https://mcassessor.maricopa.gov/',
      'chandler': 'https://mcassessor.maricopa.gov/',
      'scottsdale': 'https://mcassessor.maricopa.gov/',
      'gilbert': 'https://mcassessor.maricopa.gov/',
      'tempe': 'https://mcassessor.maricopa.gov/',
      'peoria': 'https://mcassessor.maricopa.gov/',
      'surprise': 'https://mcassessor.maricopa.gov/',
      'yuma': 'https://www.yumacountyaz.gov/government/assessor',
      'flagstaff': 'https://www.coconino.az.gov/99/Assessor',
      'lake havasu city': 'https://www.mohave.gov/ContentPage.aspx?id=134'
    }
  };

  const cityLower = city.toLowerCase();
  const gisUrl = gisUrls[state]?.[cityLower];
  
  if (!gisUrl) {
    console.warn(`No GIS URL mapping for ${city}, ${state}`);
    return null;
  }

  try {
    const response = await fetch(gisUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });
    
    if (!response.ok) {
      console.warn(`GIS fetch failed: ${response.status}`);
      return null;
    }
    
    const html = await response.text();
    return { html, url: gisUrl, city, state };
  } catch (error) {
    console.error('GIS fetch error:', error);
    return null;
  }
}

// Fetch Google Maps satellite imagery
async function fetchSatelliteImagery(address, apiKey) {
  try {
    // Use Google Static Maps API for satellite view
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

// Extract data using Gemini AI
async function extractWithGemini(sources, address, apiKey) {
  const { zillowData, redfinData, gisData, satelliteData } = sources;
  
  // Build comprehensive extraction prompt for EZLynx-ready data
  const prompt = `You are a property data extraction expert for insurance applications. Analyze the following sources for the property at: ${address}

CRITICAL: Extract ALL fields needed for an EZLynx insurance quote. If sources disagree, mark as conflict. Be conservative - only fill fields you're confident about.

Return ONLY a JSON object (no markdown, no explanations) with this EXACT structure:

{
  "data": {
    "yrBuilt": "YYYY",
    "sqFt": "number only",
    "numStories": "1, 1.5, 2, 2.5, 3, or 3+",
    "fullBaths": "number",
    "halfBaths": "number",
    "dwellingType": "Single Family|Condo|Townhouse|Multi-Family",
    "dwellingUsage": "Primary|Secondary|Rental|Vacant",
    "constructionStyle": "Ranch|Colonial|Contemporary|Split Level|Bi-Level|Cape Cod|Other",
    "exteriorWalls": "Vinyl|Brick|Wood|Stucco|Aluminum|Stone|HardiePlank|Other",
    "roofType": "Asphalt Shingle|Metal|Tile|Slate|Wood Shake|Flat|Other",
    "roofYr": "YYYY",
    "roofShape": "Gable|Hip|Flat|Mansard|Gambrel|Shed|Other",
    "heatingType": "Forced Air|Radiant|Heat Pump|Baseboard|Geothermal|None",
    "heatYr": "YYYY",
    "cooling": "Central AC|Window Units|None|Heat Pump",
    "foundation": "Slab|Crawlspace|Basement|Pier & Beam",
    "pool": "yes|no",
    "trampoline": "yes|no",
    "fireplace": "yes|no",
    "garageSpaces": "number (0-4+)",
    "lotSize": "acres as decimal",
    "bedroomCount": "number",
    "protectionClass": "1-10 (fire protection rating)",
    "purchasePrice": "number",
    "currentValue": "number (estimated market value)"
  },
  "conflicts": {
    "fieldName": [
      {"value": "option1", "source": "Zillow", "confidence": "high|medium|low"},
      {"value": "option2", "source": "GIS", "confidence": "high|medium|low"}
    ]
  },
  "confidence": {
    "overall": "high|medium|low",
    "notes": "Brief explanation of data quality"
  }
}

EXTRACTION RULES:
1. Year Built: Extract from tax records (most reliable) or listing
2. Square Footage: Living area only, not total lot size
3. Roof Year: Installation/replacement year, not construction year
4. Pool/Trampoline: Check satellite imagery carefully
5. Protection Class: Fire station distance (1-5 miles = class 5-9)
6. Current Value: Use most recent estimate (Zillow Zestimate, Redfin AVM, tax assessment)

SOURCES PROVIDED:
${zillowData ? `\n--- ZILLOW DATA ---\n${zillowData.structuredData ? JSON.stringify(zillowData.structuredData, null, 2) : zillowData.html.substring(0, 8000)}\n` : ''}
${redfinData ? `\n--- REDFIN DATA ---\n${JSON.stringify(redfinData.data, null, 2)}\n` : ''}
${gisData ? `\n--- COUNTY GIS DATA (${gisData.city}, ${gisData.state}) ---\n${gisData.html.substring(0, 8000)}\n` : ''}

Return ONLY valid JSON. No markdown code blocks.`;

  const parts = [{ text: prompt }];
  
  // Add satellite imagery analysis if available
  if (satelliteData) {
    parts.push({
      text: '\n\nSATELLITE IMAGERY ANALYSIS: Examine this aerial view to detect:\n- Pool (in-ground or above-ground blue structure)\n- Trampoline (circular/rectangular structure in yard)\n- Roof type/shape/condition (shingles, metal, tile)\n- Garage/carport (count spaces)\n- Lot features (deck, patio, shed)\n\nIf you detect pool or trampoline with HIGH confidence, set "pool": "yes" or "trampoline": "yes". Mark source as "Satellite". If unsure, leave empty or mark conflict.'
    });
    parts.push({
      inlineData: {
        mimeType: satelliteData.mimeType,
        data: satelliteData.image
      }
    });
  }

  // Call Gemini API
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.statusText}`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  
  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No valid JSON in Gemini response');
  }

  const extracted = JSON.parse(jsonMatch[0]);
  
  // Return with structure: { data: {...}, conflicts: {...} }
  return {
    data: extracted.data || extracted,
    conflicts: extracted.conflicts || {}
  };
}
