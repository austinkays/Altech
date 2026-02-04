# Environment Setup Guide

This guide explains how to configure environment variables for Altech's serverless API functions.

## Required Environment Variables

### 1. Google Gemini API Key (Required for Policy Scanning)

**Purpose:** Powers the AI-based policy document extraction feature in Step 0.

**How to get it:**
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Create API Key"
3. Copy the key

**Variable name:** `GOOGLE_API_KEY`

**Usage:** `/api/policy-scan.js` - Sends uploaded policy images/PDFs to Google Gemini for structured data extraction.

---

### 2. Google Places API Key (Optional)

**Purpose:** Enables address autocomplete in the Street Address field (Step 2).

**How to get it:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable "Places API"
4. Go to Credentials → Create Credentials → API Key
5. Restrict key to "Places API" for security

**Variable name:** `GOOGLE_PLACES_API_KEY`

**Usage:** `/api/places-config.js` - Returns API key to frontend for Google Places Autocomplete widget.

**Note:** If this is not configured, the address field works as a normal text input. The form will log a warning but continue functioning.

---

### 3. SendGrid API Key (Currently Unused)

**Purpose:** Email functionality (currently disabled in UI).

**Variable name:** `SENDGRID_API_KEY`

**How to get it:**
1. Go to [SendGrid](https://app.sendgrid.com/)
2. Settings → API Keys → Create API Key
3. Give it "Mail Send" permissions

**Usage:** `/api/send-quotes.js` - Sends exported quotes via email (feature currently disabled).

---

## Local Development Setup

### Option 1: Using Vercel CLI (Recommended)

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Link your project:
```bash
vercel link
```

3. Pull environment variables from Vercel:
```bash
vercel env pull .env.local
```

4. Run local dev server:
```bash
vercel dev
```

---

### Option 2: Manual .env.local File

1. Copy the example file:
```bash
cp .env.example .env.local
```

2. Edit `.env.local` and add your keys:
```bash
GOOGLE_API_KEY=AIzaSy...
GOOGLE_PLACES_API_KEY=AIzaSy...
# SENDGRID_API_KEY=SG...  (optional, commented out)
```

3. Run with Vercel dev:
```bash
vercel dev
```

**Note:** `.env.local` is gitignored and will not be committed.

---

## Production Deployment (Vercel)

### Setting Environment Variables in Vercel Dashboard

1. Go to your project at [vercel.com](https://vercel.com)
2. Click Settings → Environment Variables
3. Add each variable:
   - **Key:** `GOOGLE_API_KEY`
   - **Value:** Your API key
   - **Environment:** Production, Preview, Development (select all)
4. Click "Save"
5. Redeploy your app

---

### Setting via Vercel CLI

```bash
# Add production environment variable
vercel env add GOOGLE_API_KEY production

# Add to all environments
vercel env add GOOGLE_PLACES_API_KEY

# View current variables (values hidden)
vercel env ls
```

---

## Testing API Endpoints

### Test Policy Scan API
```bash
curl -X POST http://localhost:3000/api/policy-scan \
  -H "Content-Type: application/json" \
  -d '{
    "files": [
      {
        "mimeType": "image/jpeg",
        "data": "base64_encoded_image_data_here"
      }
    ]
  }'
```

Expected response:
```json
{
  "fields": {
    "firstName": "John",
    "lastName": "Doe",
    ...
  },
  "confidence": {
    "firstName": 0.95,
    ...
  }
}
```

---

### Test Places Config API
```bash
curl http://localhost:3000/api/places-config
```

Expected response:
```json
{
  "apiKey": "AIzaSy..."
}
```

---

## Troubleshooting

### "GOOGLE_API_KEY not configured" Error

**Cause:** Environment variable not set in Vercel or `.env.local`

**Fix:**
1. Check Vercel dashboard → Settings → Environment Variables
2. Ensure `GOOGLE_API_KEY` is added
3. Redeploy the app

---

### Address Field Locks Up and Turns Grey

**Cause:** Google Places API failing to load or API key invalid

**Fix:**
1. Check browser console for errors:
   ```
   Failed to load Places API: 403 (Forbidden)
   ```
2. Verify `GOOGLE_PLACES_API_KEY` is valid
3. Check API key restrictions in Google Cloud Console
4. Ensure "Places API" is enabled for your project
5. If still failing, the form will work without autocomplete (manual entry)

**Workaround:** The app now gracefully handles Places API failures - the address field will work as a normal text input if the API is unavailable.

---

### Policy Scan Returns Empty Results

**Cause:** Gemini API quota exceeded or poor image quality

**Fix:**
1. Check Gemini API quota at [Google AI Studio](https://aistudio.google.com/)
2. Ensure uploaded images are:
   - Clear and in focus
   - High resolution (>1024px width recommended)
   - PDF pages are not scanned sideways
3. Check `/api/policy-scan.js` logs in Vercel dashboard

---

## Security Best Practices

1. **Never commit API keys** - Always use environment variables
2. **Restrict API keys** - Use Google Cloud Console to restrict keys by:
   - HTTP referrer (for Places API)
   - IP address (for Gemini API in Vercel)
3. **Rotate keys regularly** - Especially after public exposure
4. **Use Vercel's environment variable encryption** - Keys are encrypted at rest

---

## Cost Management

### Google Gemini API
- **Free tier:** 15 requests per minute, 1500 requests per day
- **Paid tier:** $0.00025 per 1K characters (text) + $0.0025 per image
- **Monitor usage:** [Google AI Studio Usage](https://aistudio.google.com/app/prompts)

### Google Places API
- **Free tier:** $200 credit per month (covers ~40,000 autocomplete requests)
- **Paid tier:** $0.017 per autocomplete session
- **Monitor usage:** [Google Cloud Console](https://console.cloud.google.com/billing)

### SendGrid
- **Free tier:** 100 emails/day
- **Paid tier:** Starts at $19.95/month for 50,000 emails
- **Note:** Currently disabled in Altech UI

---

*Last updated: February 4, 2026*
