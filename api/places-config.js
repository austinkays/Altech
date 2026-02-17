export default function handler(req, res) {
  // Return API keys from environment variables
  // Places key = Google Maps/Places autocomplete
  // Gemini key = Google Generative AI (PolicyQA, QuoteCompare, EmailComposer, scan)
  const apiKey = (process.env.PLACES_API_KEY || '').trim();
  const geminiKey = (process.env.GOOGLE_API_KEY || '').trim();
  
  if (!apiKey && !geminiKey) {
    return res.status(500).json({ error: 'No API keys configured' });
  }
  
  // Always return both keys; clients pick the one they need
  res.status(200).json({ apiKey, geminiKey });
}
