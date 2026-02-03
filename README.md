# Altech Field Lead

> Mobile-first field intake wizard for insurance lead collection and HawkSoft integration

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/austinkays/Altech)

## 🚀 Quick Start

### Option 1: Deploy to Netlify (Recommended)
1. Click the "Deploy to Netlify" button above
2. Connect your GitHub account
3. Your app will be live in ~30 seconds!

### Option 2: Local Development
```bash
# Clone the repository
git clone https://github.com/austinkays/Altech.git
cd Altech

# Option A: Use a simple HTTP server
python3 -m http.server 8000
# or
npx serve .

# Open browser to http://localhost:8000
```

## 📱 Features

- **Mobile-Optimized**: iOS Safari & Android Chrome ready with PWA support
- **Multi-Step Wizard**: 6-step intake process for complete lead capture
- **Auto-Save**: Progress saved locally - never lose data
- **HawkSoft Export**: Generates `.cmsmtf` files for direct import
- **Offline-First**: Works without internet connection
- **Apple Design**: Polished SF Pro interface with iOS styling

## 📋 Form Steps

1. **Personal Info** - Name, DOB, contact details
2. **Address** - Current residence information  
3. **Policy Details** - Coverage needs and preferences
4. **Vehicles** - Auto insurance details
5. **Additional Info** - Household and history
6. **Review** - Final verification and export

## 🛠️ Technology Stack

- **Frontend**: Vanilla JavaScript (no dependencies!)
- **Storage**: LocalStorage API
- **Styling**: CSS3 with CSS variables
- **Deployment**: Static hosting (Netlify/Vercel/GitHub Pages)

## 📦 Project Structure

```
Altech/
├── index.html             # Main application (self-contained)
├── README.md              # This file
├── package.json           # NPM scripts for local dev
├── netlify.toml           # Netlify deployment config
├── vercel.json            # Vercel deployment config
├── docs/                  # Documentation
│   ├── guides/            # User guides and quickstarts
│   ├── technical/         # Technical architecture docs
│   └── archive/           # Completed work summaries
└── Resources/             # Sample files and reference data  
└── .gitignore             # Git ignore rules
```

## 🚢 Deployment

### Netlify
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --prod
```

### Vercel
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

### GitHub Pages
1. Go to repository Settings → Pages
2. Select branch: `main`
3. Select folder: `/ (root)`
4. Save - your site will be live at `https://austinkays.github.io/Altech`

## 🔧 Configuration

### Custom Branding
Edit [index.html](index.html#L9) to change:
- App name (line 9)
- Logo colors (line 50-60)
- Company name throughout

### Data Storage
Currently uses browser LocalStorage. For production:
- Consider adding backend API
- Integrate with CRM systems
- Add database for lead persistence

## 📱 PWA Installation

Users can "Add to Home Screen" on iOS/Android:
1. Open in Safari/Chrome
2. Tap Share button
3. Select "Add to Home Screen"
4. App installs like native app!

## 🔐 Security Notes

⚠️ **Current limitations:**
- Data stored in browser only (can be cleared)
- No authentication
- No server-side validation
- Suitable for internal tools or MVP

**For production use, consider:**
- Adding user authentication
- Server-side data persistence
- HTTPS-only access
- Input sanitization
- Rate limiting

## 🗺️ Roadmap

- [x] **PDF generation** - Implemented
- [x] **EZLynx XML export** - Implemented
- [x] **HawkSoft CMSMTF export** - Implemented
- [ ] Backend API for data persistence
- [ ] User authentication
- [ ] Multi-user support
- [ ] Email notifications
- [ ] Photo upload for vehicles
- [ ] Digital signature capture
- [ ] Additional CRM integrations (Salesforce, HubSpot)

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - feel free to use for your own projects!

## 🆘 Support

Issues? Questions? Open an issue on GitHub or contact the maintainer.

---

**Built with ❤️ for field insurance agents**