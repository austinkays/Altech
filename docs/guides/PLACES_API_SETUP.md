# Local Development Setup - Enable Address Autocomplete

The address autocomplete feature (Google Places API) requires a Google API key. Here's how to enable it locally:

## Quick Start (3 ways)

### Option 1: Pass API Key via URL Query Parameter (Easiest for Testing)
```bash
http://localhost:8000?placesKey=YOUR_GOOGLE_PLACES_API_KEY
```
- Go to [Google Cloud Console](https://console.cloud.google.com/google/maps-apis/credentials)
- Create API key or copy existing one
- Append `?placesKey=YOUR_KEY` to your local dev URL
- **No file changes needed** - works immediately

### Option 2: Inject API Key via JavaScript Console
```javascript
window.__PLACES_API_KEY__ = 'YOUR_GOOGLE_PLACES_API_KEY';
// Then reload the page - Places API will load
location.reload();
```

### Option 3: Use Vercel CLI Locally (Most Production-like)
```bash
# Install Vercel CLI
npm install -g vercel

# Create .env.local with your keys
echo "PLACES_API_KEY=YOUR_KEY" > .env.local
echo "GOOGLE_API_KEY=YOUR_GEMINI_KEY" >> .env.local

# Run local Vercel environment
vercel dev

# Access at http://localhost:3000 (default Vercel dev port)
```

## Get Google Places API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create new project or select existing
3. Go to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **API Key**
5. Copy the API Key
6. Go to **APIs & Services** → **Enabled APIs & services**
7. Enable these APIs:
   - **Maps SDK for JavaScript**
   - **Places API**
8. Click back to your API key and copy it

## Verify It's Working

Once configured:
1. Navigate to Step 3 (Property Details)
2. Click in the **Street Address** field
3. Start typing "123" - should show address suggestions
4. Select an address - other fields should auto-fill

## Troubleshooting

**"Please enter a complete address" when clicking GIS?**
- This is expected - GIS button requires full address (street, city, state) to work
- First fill in the address fields, then click GIS

**Still no autocomplete?**
- Check browser console (F12) for errors
- Should see "✓ Places API loaded" if working
- If not, API key might be invalid or rate-limited

**Why is autocomplete optional?**
- The form works fine without it - you can type addresses manually
- Autocomplete is a convenience feature only
- The app prioritizes functionality over dependent services

## For Production (Vercel)

When deployed to Vercel:
1. Go to Vercel project settings
2. Add environment variables:
   - `PLACES_API_KEY` = your Google Places API key
   - `GOOGLE_API_KEY` = your Gemini API key
3. Redeploy → autocomplete works automatically
