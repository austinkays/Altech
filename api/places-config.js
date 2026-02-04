export default function handler(req, res) {
  // Return the Places API key from environment variable
  // This endpoint is intentionally minimal to avoid exposing the key in client-side code
  const apiKey = process.env.PLACES_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ error: 'PLACES_API_KEY not configured' });
  }
  
  res.status(200).json({ apiKey });
}
