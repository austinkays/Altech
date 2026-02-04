/**
 * Phase 7: Document Intelligence API
 * Accepts inline document data (images/PDFs) and returns structured insights
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { files = [] } = req.body || {};
    if (!files.length) {
      return res.status(400).json({ error: 'No documents provided' });
    }

    const apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      return res.status(200).json({
        success: true,
        summary: 'Document intake ready. Set GOOGLE_API_KEY to enable AI extraction.',
        documents: files.map((f, idx) => ({
          title: `Document ${idx + 1}`,
          type: f?.mimeType || 'unknown',
          details: 'AI extraction not enabled (missing GOOGLE_API_KEY).'
        }))
      });
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
    const prompt = `You are an insurance document analyst. Extract structured fields from each document.
Return ONLY JSON with this shape:
{
  "summary": "...",
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
    {"title":"Tax Document","type":"tax","details":"key fields extracted"}
  ]
}
If unsure, return best-effort details.`;

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
        generationConfig: { temperature: 0.2, maxOutputTokens: 512 }
      })
    });

    if (!geminiRes.ok) {
      return res.status(200).json({
        success: false,
        summary: 'AI extraction failed. Try again later.',
        documents: []
      });
    }

    const result = await geminiRes.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(200).json({
        success: true,
        summary: 'Analysis completed, but structured data was not returned.',
        documents: []
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return res.status(200).json({
      success: true,
      summary: parsed.summary || 'Document analysis complete.',
      fields: parsed.fields || {},
      documents: parsed.documents || []
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Document intelligence failed',
      details: error.message
    });
  }
}
