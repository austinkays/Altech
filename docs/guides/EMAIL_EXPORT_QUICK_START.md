# Email Export: Quick Reference

## What You Just Got

**Email Quote ZIPs directly from Altech app to agent inboxes.**

Before: Download ZIP locally → AirDrop to PC → Email manually
After: Select quotes → Click "Email to Agent" → ZIP in inbox (done in 5 sec)

---

## The 5-Minute Setup

```bash
# 1. Make sure code is in GitHub
git push origin copilot/refactor-intake-app-wizard

# 2. Go to vercel.com → Import from GitHub → select your repo

# 3. Go to sendgrid.com/free → Sign up → Create API key

# 4. Copy key to Vercel Dashboard → Settings → Environment Variables
# (Variable name: SENDGRID_API_KEY)

# 5. Test it → Fill app → Save Draft → Click "Send ZIP"
```

**Done!** ✅

---

## Agent List (In Dropdown)

- Austin: Austin@altechinsurance.com
- Evan: Evan@altechinsurance.com
- Kathleen: Kathleen@altechinsurance.com
- Neil: Neil@altechinsurance.com
- Hollie: Hollie@altechinsurance.com

To add more: Edit `index.html` line ~645 and add `<option>` tags.

---

## File Changes Made

**New files:**
- `api/send-quotes.js` - Serverless function (SendGrid integration)
- `docs/guides/VERCEL_SENDGRID_SETUP.md` - Detailed setup guide (you're reading a summary)

**Modified:**
- `index.html`
  - Added agent dropdown in Step 4 (line ~645)
  - Added "Send ZIP" button (red card, prominent)
  - Added `emailSelectedQuotes()` method (handles ZIP generation + API call)
  - Added `blobToBase64()` helper (ZIP encoding)

---

## Cost Breakdown

| Service | Free Tier | Your Use | Cost |
|---------|-----------|----------|------|
| Vercel | 100 functions/day | ~1-2 emails/day | $0 |
| SendGrid | 100 emails/day | ~1-2 emails/day | $0 |
| GitHub | Unlimited | Host code | $0 |
| Domain | `.vercel.app` free | `your-app.vercel.app` | $0 |

**Total: $0/month** (forever, unless you scale massively)

---

## User Flow

1. User fills out form (steps 1-3)
2. Goes to Step 4 (Review & Export)
3. Saves draft OR uses current form data
4. Selects agent from dropdown
5. Clicks "Send ZIP"
6. App shows loading → "✅ Email sent!"
7. Agent receives email with ZIP attachment (all 4 export formats: PDF, XML, CSV, CMSMTF)
8. Agent imports to their CRM/quoting system

---

## What Gets Emailed

Each draft in the ZIP folder includes:

- `Summary.pdf` - Formatted review document
- `EZLynx.xml` - For instant quoting
- `Export.csv` - For CSV imports
- `HawkSoft.cmsmtf` - For HawkSoft import

All in one ZIP, organized by quote name.

---

## If It Doesn't Work

**Most common issue:** SendGrid API key not in Vercel

1. Vercel Dashboard → Your project → Settings → Environment Variables
2. Check `SENDGRID_API_KEY` exists
3. If not, add it
4. Click "Redeploy" button

**Other common issues:** See "Troubleshooting" section in the full guide (`docs/guides/VERCEL_SENDGRID_SETUP.md`)

---

## Next: Custom Domain (Optional)

Right now: `https://your-app.vercel.app`
Could be: `https://altech.yourdomain.com`

**Cost:** $0 if you own domain, or ~$12/year to buy one
**Setup:** 5 minutes in Vercel dashboard

---

## More Info

- Full setup guide: [docs/guides/VERCEL_SENDGRID_SETUP.md](./VERCEL_SENDGRID_SETUP.md)
- Email code: [api/send-quotes.js](../../api/send-quotes.js)
- App code: [index.html](../../index.html) (search for `emailSelectedQuotes`)

---

*Last updated: February 3, 2026*
