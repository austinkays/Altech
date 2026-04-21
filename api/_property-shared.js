/**
 * Shared helpers for property-intelligence endpoint family.
 * NOT a serverless function (underscore prefix — Vercel ignores it).
 */

// Resolve Google API key from environment — used for Gemini generative calls
export function getGoogleApiKey() {
  return (process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY || '').trim() || null;
}

// Resolve key for Maps/Geocoding/Places APIs
// Falls back: GOOGLE_API_KEY → PLACES_API_KEY
export function getMapsApiKey() {
  const envKey = (process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY || '').trim();
  if (envKey) return envKey;
  return (process.env.PLACES_API_KEY || process.env.GOOGLE_PLACES_API_KEY || '').trim() || null;
}
