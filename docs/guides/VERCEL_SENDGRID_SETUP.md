# Vercel + SendGrid Email Integration Setup

**Goal:** Send quote ZIPs directly to agent inboxes from the Altech app. No manual downloads or AirDrop needed.

**Cost:** $0/month (free tier covers your needs)

**Time to Setup:** ~20 minutes

---

## 🚀 Quick Start Overview

1. ✅ Push code to GitHub (your repo)
2. ✅ Deploy to Vercel (connects to GitHub auto)
3. ✅ Create SendGrid account & API key
4. ✅ Add API key to Vercel dashboard
5. ✅ Test the email feature

---

## Step 1: Prepare Your GitHub Repository

**What you have:**
- `index.html` (main app with email button)
- `api/send-quotes.js` (serverless function)
- `package.json` (already includes nodemailer dependencies)

**Required `package.json` dependencies:**
```json
{
  "dependencies": {
    "nodemailer": "^6.9.7",
    "nodemailer-sendgrid-transport": "^1.0.4"
  }
}
```

**Check:** Make sure your repo has these packages already (they should be there).

```bash
# In workspace root:
cat package.json | grep -A5 dependencies
```

If not present, add them:
```bash
npm install nodemailer nodemailer-sendgrid-transport
```

Then commit to GitHub:
```bash
git add -A
git commit -m "feat: add email export integration with Vercel + SendGrid"
git push origin copilot/refactor-intake-app-wizard
```

---

## Step 2: Deploy to Vercel (Free Tier)

### Option A: Connect GitHub (Recommended - Auto-deploys)

1. **Go to [vercel.com](https://vercel.com)**
2. **Sign up** (GitHub login recommended)
3. **Click "Import Project"**
4. **Select your GitHub repo** (`austinkays/Altech`)
5. **Vercel will auto-detect:**
   - Framework: Other (static + serverless)
   - Root Directory: `/`
   - Build Command: (leave blank)
6. **Click Deploy**

**⏳ Wait 2-3 minutes.** You'll get a deployment URL like:
```
https://altech-123abc.vercel.app
```

### Option B: Deploy from CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy (in workspace root)
vercel
```

Follow prompts, accept defaults.

---

## Step 3: Create SendGrid Account

### Step 3a: Sign up for Free

1. **Go to [sendgrid.com/free](https://sendgrid.com/free)**
2. **Sign up** (email + password)
3. **Verify email**
4. **Create "Sender Identity"** (who emails come from)
   - Use something like: `noreply@altechinsurance.com`
   - OR: `quotes@altechinsurance.com`
   - (Must match a domain you own or use SendGrid's test domain initially)

### Step 3b: Create API Key

1. **In SendGrid dashboard → Settings → [API Keys](https://app.sendgrid.com/settings/api_keys)**
2. **Click "Create API Key"**
3. **Name it:** `Altech Vercel` (for reference)
4. **Permissions:** 
   - Select "Mail Send" (that's all we need)
   - Full Access is fine too
5. **Click Create**
6. **Copy the key** (looks like: `SG.a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`)
   - ⚠️ **Save this somewhere safe** - you can't view it again

---

## Step 4: Add API Key to Vercel

### In Vercel Dashboard:

1. **Go to your project:** [vercel.com/dashboard](https://vercel.com/dashboard)
2. **Select** `altech` project
3. **Click "Settings" tab**
4. **Left sidebar → "Environment Variables"**
5. **Click "Add"**
   - **Name:** `SENDGRID_API_KEY`
   - **Value:** (paste your SendGrid API key from Step 3b)
   - **Select environments:** Production (+ Preview if you want)
6. **Click "Save"**

**Vercel auto-redeploys** with the new env var. ✅

---

## Step 5: Test the Email Feature

### Local Testing (Dev Server)

1. **Create a `.env.local` file** in workspace root:
   ```
   SENDGRID_API_KEY=SG.your_key_here
   ```

2. **Start dev server:**
   ```bash
   npm run dev
   # OR
   python3 -m http.server 8000
   ```

3. **Open app:** `http://localhost:8000`

4. **Fill out a quote:**
   - Step 1: Name, email, phone
   - Select "Home" or "Both"
   - Fill basic fields
   - Go to Step 4

5. **Test email:**
   - **Save Draft** (or fill current form)
   - **Select agent** in dropdown
   - **Click "Send ZIP"**
   - Should see ✅ success message (or ❌ error if API key wrong)

### Live Testing (Vercel URL)

1. **Go to:** `https://your-app.vercel.app`
2. **Repeat steps above**

---

## 📋 What Happens When User Clicks "Send ZIP"

```
User clicks "Send ZIP" button
    ↓
App checks: Agent selected? Quotes selected?
    ↓
App generates ZIP in browser (in memory)
    ↓
App converts ZIP blob to base64
    ↓
App sends HTTP POST to /api/send-quotes with:
  - base64Zip (ZIP file data)
  - agentEmail (recipient)
  - senderEmail (reply-to)
  - senderName (for context)
    ↓
Vercel function receives request
    ↓
Function decodes base64 back to buffer
    ↓
Function creates email with ZIP as attachment
    ↓
Function sends via SendGrid SMTP
    ↓
SendGrid routes to agent's inbox
    ↓
Function returns success JSON
    ↓
App shows "✅ Email sent!" and clears loading state
```

**Time to completion:** ~3-5 seconds

---

## 🔧 Troubleshooting

### ❌ "Email failed to send" 

**Check 1: Is API key in Vercel?**
- Vercel Dashboard → Settings → Environment Variables
- Verify `SENDGRID_API_KEY` exists
- If changed, trigger redeploy: Push empty commit to GitHub or click "Redeploy" button

**Check 2: Is SendGrid API key valid?**
- Go to [SendGrid Settings → API Keys](https://app.sendgrid.com/settings/api_keys)
- Verify key is active (green checkmark)
- If unsure, create a new one and update Vercel

**Check 3: Did you select an agent?**
- Look at Step 4 dropdown
- Must select before clicking "Send ZIP"

**Check 4: Are there quotes to send?**
- Must either:
  - Save a draft and check its checkbox, OR
  - Have selected checkboxes in Quote Library
- If no quotes selected, user sees warning

### ❌ "Function not found" or 404 error

**Cause:** `/api/send-quotes` endpoint not deployed

**Fix:**
1. Verify `api/send-quotes.js` exists in repo
2. Push to GitHub
3. Go to Vercel dashboard
4. Click "Redeploy" button (or wait for auto-deploy)
5. Check deployment logs (Dashboard → Deployments → Latest)

### ❌ "ZIP is too large"

**Cause:** Vercel has max request body size ~4.5 MB

**Fix:** Tell users to limit selected quotes. Typical quote = 500 KB, so 8-10 quotes should be fine.

---

## 🎯 Agent Email Customization

**Currently hardcoded agents in dropdown:**
```
Austin, Evan, Kathleen, Neil, Hollie
Emails: firstname@altechinsurance.com
```

**To add more agents:**
1. Edit [index.html](../../index.html) around line 645
2. Find the `<select id="agentEmail">` element
3. Add new `<option>`:
   ```html
   <option value="newagent@altechinsurance.com">New Agent Name</option>
   ```
4. Push to GitHub → auto-deploys

**Future enhancement:** Load agent list from external JSON file or admin panel.

---

## 📧 Email Sender Settings

**From address:** Currently `noreply@altechinsurance.com` (hardcoded in `api/send-quotes.js`)

**To customize:**
1. Edit [api/send-quotes.js](../../api/send-quotes.js) line 48
2. Change: `from: 'noreply@altechinsurance.com'` to your domain
3. Verify in SendGrid Sender Identities first (see Step 3a)

---

## 💰 Free Tier Limits

| Service | Limit | Typical Use |
|---------|-------|------------|
| **Vercel Functions** | 100/day (free) | ~1-2 emails per user per day = OK |
| **SendGrid** | 100 emails/day (free) | Same as above = OK |
| **Bandwidth** | 100 GB/month | Not a concern for this app |

**Your projected usage:** 5 agents × 10 emails/day = 50/day (well under limits)

---

## 🚀 Next Steps (Optional Enhancements)

1. **Custom Domain**
   - Replace `vercel.app` with your domain
   - Vercel → Settings → Domains → Add custom domain
   - Update DNS (follow Vercel's instructions)
   - Cost: $0 (if you own domain) or ~$12/year new domain

2. **Email Branding**
   - SendGrid → Settings → Sender Identities
   - Verify your `@altechinsurance.com` domain
   - Emails will come from your company email

3. **Email Templates**
   - Update `api/send-quotes.js` HTML email template (lines 60-70)
   - Add logo, styling, legal disclaimers, etc.

4. **Track Email Opens**
   - SendGrid → Settings → Tracking → Email Activity
   - See when agents open/click links

5. **Admin Panel**
   - Store agent list in database
   - Add/remove agents without code changes
   - Requires backend (optional future work)

---

## 📞 Support Resources

- **Vercel Docs:** https://vercel.com/docs
- **SendGrid Docs:** https://docs.sendgrid.com
- **Nodemailer Docs:** https://nodemailer.com/
- **SendGrid Free Tier FAQ:** https://sendgrid.com/free

---

## ✅ Deployment Checklist

- [ ] Code pushed to GitHub with `api/send-quotes.js`
- [ ] Vercel project created and linked to GitHub
- [ ] Deployment URL working (can view app)
- [ ] SendGrid account created
- [ ] SendGrid API key generated
- [ ] API key added to Vercel environment variables
- [ ] Vercel redeployed with env var
- [ ] Test email sent successfully
- [ ] Agent dropdown populated with team members
- [ ] Email sender verified in SendGrid

**Once all checked:** You're live! 🎉

---

*Last updated: February 3, 2026*
