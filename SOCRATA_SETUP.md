# Socrata API Token Setup

## What is this?

The Prospect Investigator tool uses the Socrata Open Data API to fetch WA L&I contractor data. An API token increases rate limits from **50 to 1,000 requests per hour**, preventing throttling errors.

## Your Credentials

**API Key (App Token):** `W6r9WmhDxx16bq7hKsimDvb71`

**API Key Secret:** `2zb3i7a1cvpuooldeeic9mxnrczdhyr80v5x7n2t4focpcgz5q`

⚠️ **IMPORTANT:** The App Token (first value) is what you need for the API. The secret is for account management only and should be retained securely but is not used in API calls.

---

## Setup Instructions for Vercel

### Step 1: Add Environment Variable to Vercel

1. Go to your Vercel dashboard: https://vercel.com/dashboard
2. Select your **Altech** project
3. Click **Settings** (top navigation)
4. Click **Environment Variables** (left sidebar)
5. Add a new variable:
   - **Name:** `SOCRATA_APP_TOKEN`
   - **Value:** `jina0tch4fpsn7v1dwy3tzwk`
   - **Environments:** Select all (Production, Preview, Development)
6. Click **Save**

### Step 2: Redeploy (Automatic)

Vercel will automatically rebuild your application with the new environment variable. The next deployment will include the token.

If you want to force an immediate rebuild:
```bash
git commit --allow-empty -m "Trigger rebuild with Socrata token"
git push origin main
```

### Step 3: Verify Token is Working

After deployment:

1. Open the Prospect Investigator tool: https://altechintake.vercel.app
2. Search for a WA contractor (e.g., "ABC Construction")
3. Open browser DevTools (F12) → Console tab
4. Check the logs for: `[L&I Lookup] Querying Socrata API...`
5. Look for successful responses (should NOT see 429 rate limit errors)

---

## Testing Locally (Optional)

If you want to test locally before deploying:

### Option 1: Create `.env.local` file (Recommended)

```bash
# In your project root
echo "SOCRATA_APP_TOKEN=jina0tch4fpsn7v1dwy3tzwk" > .env.local
```

Then run:
```bash
vercel dev
```

### Option 2: Export environment variable

```bash
export SOCRATA_APP_TOKEN=jina0tch4fpsn7v1dwy3tzwk
vercel dev
```

---

## How It Works

The token is automatically added to API requests in `/api/prospect-lookup.js`:

```javascript
headers: {
  'Accept': 'application/json',
  'User-Agent': 'Altech-Insurance-Platform/1.0',
  'X-App-Token': process.env.SOCRATA_APP_TOKEN || ''
}
```

**Without token:** 50 requests/hour per IP
**With token:** 1,000 requests/hour

---

## Rate Limits

| Scenario | Limit | Status |
|----------|-------|--------|
| **No Token** | 50 req/hour | ⚠️ May hit limits with multiple users |
| **With Token** | 1,000 req/hour | ✅ Sufficient for production use |
| **Throttled API Key** | 10,000 req/hour | Requires application to Socrata |

Your current token provides the **1,000 req/hour** tier, which is more than enough for Altech's usage.

---

## Troubleshooting

### "429 Too Many Requests" Error

**Cause:** Rate limit exceeded
**Fix:** Ensure environment variable is set correctly in Vercel (see Step 1)

### Token Not Being Used

**Check:**
1. Vercel Environment Variables are set
2. Deployment happened AFTER adding the variable
3. Console logs show `X-App-Token` header being sent

### Still Getting Rate Limited

If you consistently hit 1,000 requests/hour:
1. Consider implementing request caching (cache results for 24 hours)
2. Apply for throttled API key from Socrata (10,000 req/hour)

---

## Security Notes

✅ **Safe to use in environment variables:** The App Token is designed to be sent in API requests and is not a secret that needs encryption.

✅ **Safe to share within your team:** This token is specific to your WA data.gov account and only affects rate limiting.

❌ **Do NOT commit to Git:** The `.env.local` file should never be committed (already in `.gitignore`).

✅ **API Secret:** Keep the API Key Secret (`2zb3i...`) securely stored. This is only needed if you regenerate tokens or modify your Socrata account.

---

## Need Help?

- **Socrata Documentation:** https://dev.socrata.com/docs/app-tokens.html
- **WA Data Portal:** https://data.wa.gov
- **Manage Your Tokens:** https://data.wa.gov/profile/edit/developer_settings

---

**Setup Date:** February 5, 2026
**Token Status:** Active ✅
**Registered To:** Altech Insurance (austinkays@gmail.com)
