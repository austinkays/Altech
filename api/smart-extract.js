/**
 * Smart Property Data Extraction API (Simplified)
 * Analyzes satellite imagery to extract property features
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { address, city, state, zip } = req.body;
    
    if (!address || !city || !state) {
      return res.status(400).json({ error: 'Address, city, and state required' });
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GOOGLE_API_KEY not configured' });
    }

    const fullAddress = `${address}, ${city}, ${state}${zip ? ' ' + zip : ''}`.trim();
    
    console.log(`[Smart Extract] Analyzing: ${fullAddress}`);
    
    // Get satellite image
    const satUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(fullAddress)}&zoom=19&size=640x640&maptype=satellite&key=${apiKey}`;
    console.log(`[Smart Extract] Fetching satellite: ${satUrl.substring(0, 80)}...`);
    
    const satRes = await fetch(satUrl, { timeout: 10000 });
    if (!satRes.ok) {
      console.error(`[Smart Extract] Satellite fetch failed: ${satRes.status}`);
      return res.status(200).json({
        success: false,
        data: {},
        notes: 'Satellite imagery unavailable. Please use GIS/Zillow buttons or manual entry.'
      });
    }
    
    const buffer = await satRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    
    console.log(`[Smart Extract] Image retrieved: ${buffer.byteLength} bytes`);
    
    // Call Gemini
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    console.log(`[Smart Extract] Calling Gemini...`);
    
    const prompt = `Analyze satellite image for: ${fullAddress}\n\nDetect:\n- Pool (blue water)\n- Trampoline (circular/rect structure)\n- Roof type (shingles/metal/tile/flat)\n- Stories (1, 1.5, 2, 2.5, 3, 3+)\n- Garage (count spaces)\n- Deck/patio\n- Trees\n\nReturn ONLY JSON:\n{"pool":"yes|no|unknown","trampoline":"yes|no|unknown","roofType":"type|unknown","numStories":"count|unknown","garageSpaces":"count|unknown","deck":"yes|no|unknown","notes":"Satellite only. Verify with public records."}`;
    
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType: 'image/png', data: base64 } }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 512 }
      }),
      timeout: 30000
    });
    
    if (!geminiRes.ok) {
      console.error(`[Smart Extract] Gemini error: ${geminiRes.status}`);
      return res.status(200).json({
        success: false,
        data: {},
        satelliteImage: base64,
        notes: 'AI analysis failed. Image shown for manual review.'
      });
    }
    
    const result = await geminiRes.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    console.log(`[Smart Extract] Gemini response length: ${text.length}`);
    
    const jsonMatch = text.match(/\{[^{}]*\}/);
    if (!jsonMatch) {
      console.error(`[Smart Extract] No JSON found in response: ${text.substring(0, 200)}`);
      return res.status(200).json({
        success: false,
        data: {},
        satelliteImage: base64,
        notes: 'Could not extract data. Showing satellite image for review.'
      });
    }
    
    const extracted = JSON.parse(jsonMatch[0]);
    console.log(`[Smart Extract] Success for ${city}, ${state}`);
    
    res.status(200).json({
      success: true,
      data: extracted,
      satelliteImage: base64,
      notes: 'Satellite analysis - verify all data with public records'
    });

  } catch (error) {
    console.error(`[Smart Extract] Error: ${error.message}`);
    res.status(500).json({ 
      error: 'Failed to extract property data',
      details: error.message
    }); 
  }
}
