# 🚀 Deployment Guide - Altech Field Lead

This guide will help you deploy your Altech Field Lead app to production.

## Prerequisites

- GitHub account
- Git installed locally
- Your code committed to GitHub

## Option 1: Vercel (Recommended)

### Method A: GitHub Integration
1. Go to [vercel.com](https://vercel.com)
2. Sign up/login with GitHub
3. Click "New Project"
4. Select your Altech repository
5. Click "Deploy"
6. Your app is live! 🎉

### Method B: CLI Deploy
```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

---

## Option 2: GitHub Pages (Free)

1. Go to your repository on GitHub
2. Click **Settings** → **Pages**
3. Under "Source", select branch: `main`
4. Select folder: `/ (root)`
5. Click **Save**
6. Wait 1-2 minutes
7. Your site will be live at: `https://austinkays.github.io/Altech`

**Note:** If you want a custom path, update the repo settings.

---

## Option 3: Firebase Hosting

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize
firebase init hosting
# Select: Use an existing project or create new
# Public directory: . (current directory)
# Single-page app: Yes
# Overwrite index.html: No

# Deploy
firebase deploy --only hosting
```

---

## Post-Deployment Checklist

✅ **Test on Multiple Devices**
- [ ] iPhone Safari
- [ ] Android Chrome
- [ ] Desktop browsers

✅ **Verify Features**
- [ ] Form submission works
- [ ] Data saves to LocalStorage
- [ ] Export to HawkSoft works
- [ ] PWA install works
- [ ] Offline mode works

✅ **Security**
- [ ] HTTPS enabled (automatic on most platforms)
- [ ] No sensitive data exposed
- [ ] CORS configured if using API

✅ **Performance**
- [ ] Page loads in < 3 seconds
- [ ] No console errors
- [ ] Mobile-friendly (test with Google Mobile-Friendly Test)

✅ **SEO (Optional)**
- [ ] Add meta description
- [ ] Add Open Graph tags
- [ ] Submit sitemap to Google

---

## Updating Your App

After making changes:

```bash
# Commit changes
git add .
git commit -m "Your update message"
git push origin main

# Most platforms auto-deploy on push!
# Or manually deploy:
vercel --prod
```

---

## Monitoring & Analytics (Optional)

### Add Google Analytics
1. Get tracking ID from [analytics.google.com](https://analytics.google.com)
2. Add to index.html before `</head>`:
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

### Add Error Tracking (Sentry)
1. Sign up at [sentry.io](https://sentry.io)
2. Get your DSN
3. Add Sentry SDK to your HTML

---

## Troubleshooting

### "Page Not Found" Error
- Check your `vercel.json` redirect rules
- Verify the main file is `index.html`

### "Cannot Read Property" Errors
- Check browser console for JavaScript errors
- Test in incognito mode (clears cache/localStorage)

### PWA Not Installing
- Verify HTTPS is enabled
- Check manifest.json (if added)
- Test on actual device, not simulator

### Need Help?
Open an issue on GitHub with:
- What platform you're deploying to
- Error messages
- Screenshots
- Browser/device info

---

## Next Steps

🎯 **Production Enhancements to Consider:**
- Add backend API for data persistence
- Implement user authentication
- Add email notifications
- Integrate with CRM (Salesforce, HubSpot)
- Add analytics and monitoring
- Create admin dashboard
- Add PDF generation for receipts

**Your app is ready to launch! Good luck! 🚀**
