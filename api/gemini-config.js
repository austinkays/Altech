export default function handler(req, res) {
  // Serve the Gemini API key to client-side modules that make direct
  // Gemini REST calls (PolicyQA, QuoteCompare, EmailComposer, intake scan).
  // Note: GOOGLE_API_KEY is for Gemini generative AI.
  //       PLACES_API_KEY is for Google Maps/Places — different key.
  const apiKey = (process.env.GOOGLE_API_KEY || '').trim();

  if (!apiKey) {
    return res.status(500).json({ error: 'GOOGLE_API_KEY not configured' });
  }

  res.status(200).json({ apiKey });
}
