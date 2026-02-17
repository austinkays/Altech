# 🚨 IMPORTANT: Update Vercel Environment Variable

## New Socrata App Token

Your Socrata App Token has been updated to support both **Washington (L&I)** and **Oregon (CCB)** data sources.

**New Token:** `W6r9WmhDxx16bq7hKsimDvb71`

---

## Action Required

You **MUST** update the environment variable in Vercel for the Oregon CCB integration to work:

### Steps:

1. **Go to Vercel Dashboard:** https://vercel.com/dashboard

2. **Select your Altech project**

3. **Click "Settings"** → **"Environment Variables"**

4. **Find existing `SOCRATA_APP_TOKEN` variable**

5. **Click "Edit"** (pencil icon)

6. **Replace old value with:**
   ```
   W6r9WmhDxx16bq7hKsimDvb71
   ```

7. **Save changes**

8. **Redeploy** (Vercel usually auto-redeploys when env vars change)

---

## What This Enables

### Before (Old Token):
- ✅ Washington L&I contractor data
- ❌ Oregon CCB contractor data (would use HTML scraper fallback)

### After (New Token):
- ✅ Washington L&I contractor data via Socrata API
- ✅ **Oregon CCB contractor data via Socrata API** ← NEW!
  - Bond information (company, amount, expiration)
  - Insurance information (company, amount, expiration)
  - Responsible Managing Individual (RMI)
  - County information
  - Phone numbers

---

## How It Works Now

**When you search a contractor:**

| State | What Happens |
|-------|--------------|
| **Washington (WA)** | Calls `/api/prospect-lookup?type=li` → WA L&I Socrata API (dataset: m8qx-ubtq) |
| **Oregon (OR)** | Calls `/api/prospect-lookup?type=or-ccb` → OR CCB Socrata API (dataset: g77e-6bhs) |
| **Arizona (AZ)** | Uses Secretary of State lookup only (no contractor registry API available) |

---

## Testing After Update

1. **Wait ~30 seconds** for Vercel to redeploy with new token

2. **Test WA Contractor:**
   - Search: "construction" + State: WA
   - Should return real L&I license data

3. **Test OR Contractor:**
   - Search: "construction" + State: OR
   - Should return real CCB license data with bond/insurance info

4. **Check DevTools Console:**
   - Should see `[OR CCB Lookup] Querying Socrata API...`
   - Should see `[OR CCB Lookup] Found X result(s)`
   - **No errors or 403 Forbidden**

---

## Rate Limits

With the new token:
- **1,000 requests/hour** shared across both WA and OR APIs
- More than enough for production commercial quoting workflow
- No more HTML scraping fragility for Oregon!

---

## Support

If you see errors after updating:
1. Verify the token is exactly: `W6r9WmhDxx16bq7hKsimDvb71`
2. Ensure it's set for all environments (Production, Preview, Development)
3. Check that Vercel redeployed after the change
4. Test with DevTools console open to see detailed logs

---

**Updated:** February 5, 2026
**Status:** ⚠️ Awaiting Vercel environment variable update
