# ⚡ Quick Start Guide

Welcome! This guide will get you from zero to deployed in 5 minutes.

## Step 1: Choose Your Deployment Method

### 🟢 Super Easy (Recommended for beginners)
**Vercel Deploy**
1. Go to: https://vercel.com
2. Click "New Project"
3. Choose GitHub → Select "Altech" repository
4. Click "Deploy"
5. ✅ Done! Your app is live!

### 🟡 Medium (Command line)
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

### 🔴 Manual (GitHub Pages - Free but slower)
1. Go to: https://github.com/austinkays/Altech/settings/pages
2. Under "Source": Select `main` branch, `/ (root)` folder
3. Click Save
4. Wait 2 minutes
5. Visit: https://austinkays.github.io/Altech

---

## Step 2: Test Your App

1. Open the URL from Step 1
2. Test on your phone (iOS Safari or Android Chrome)
3. Fill out the form
4. Click "Export to HawkSoft"
5. ✅ You should get a `.cmsmtf` file download

---

## Step 3: Share With Your Team

Send them the URL from Step 1. They can:
- **Use it in browser** → Just visit the URL
- **Install as app** → Click "Add to Home Screen"
- **Use offline** → Works without internet once loaded

---

## Step 4: Customize (Optional)

Edit `index.html` to change:
- Line 9: App name/title
- Line 50-60: Logo colors
- Anywhere: Company name

Then push changes:
```bash
git add .
git commit -m "Customize branding"
git push origin main
```

Your site will auto-update! 🚀

---

## Troubleshooting

**Q: I see a 404 error**
- Make sure `index.html` is in the root directory
- Check your deployment platform's redirect settings

**Q: Form won't submit**
- This is a frontend-only app - data saves to browser
- Export works by downloading a file
- Check browser console for errors (F12)

**Q: Can't install as PWA**
- Make sure you're on HTTPS (not http://)
- Try on actual device (not simulator)
- Some browsers don't support PWA

**Q: Data disappeared**
- Data is stored in browser LocalStorage
- Clearing browser data will delete it
- Use the Export button regularly to save data

---

## What's Next?

Your app is LIVE and ready to use! 🎉

**For production improvements, see:**
- [DEPLOYMENT.md](DEPLOYMENT.md) - Full deployment guide
- [README.md](README.md) - Complete documentation
- [CONTRIBUTING.md](CONTRIBUTING.md) - How to contribute

**Future enhancements to consider:**
- Add a backend to save data permanently
- Add user authentication
- Email notifications
- Mobile app version
- CRM integration

---

**Need Help?**
Open an issue at: https://github.com/austinkays/Altech/issues

**You're all set! Now go collect some leads! 💼**
