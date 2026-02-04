# 🏠 Altech - Insurance Lead Wizard

Mobile-first AI-powered insurance intake form with document scanning, auto-save, and multi-CRM export.

**Live:** https://altech-rust.vercel.app

---

## 🚀 Quick Start

### Deploy (Vercel - Recommended)
1. Sign in to [vercel.com](https://vercel.com) with GitHub
2. Click "New Project" and select this repo
3. Click "Deploy" — live in ~1 minute

### Local Development
```bash
# Clone the repository
git clone https://github.com/austinkays/Altech.git
cd Altech

# Start local server
npm run dev
# or: python3 -m http.server 8000

# Open http://localhost:8000
```

---

## ✨ Features

- **📱 Mobile-First**: Optimized for iOS Safari & Android Chrome
- **🔐 Encrypted**: AES-256-GCM encryption, all data stays on your device
- **📸 AI Scanning**: Upload policy documents → auto-extract data via Google Gemini
- **📍 Smart Address**: Google Places autocomplete with satellite/street view
- **💾 Auto-Save**: Every keystroke saved to browser (encrypted)
- **📊 Multi-Export**: HawkSoft (CMSMTF), EZLynx (XML), PDF client summary
- **📋 Draft Management**: Save/load multiple quotes, export as ZIP
- **🚗 Vehicle Data**: VIN decoder, auto insurance details
- **🏡 Property Info**: Home basics, coverage needs, risk assessment
- **🔄 Offline-Ready**: Works without internet (uses localStorage)

---

## 📋 Form Steps

1. **Personal Info** — Name, DOB, contact
2. **Address** — Current residence (with autocomplete)
3. **Property Details** — Home basics, roof type, stories
4. **Vehicles** — Auto insurance, VIN, drivers
5. **Coverage Needs** — Policy preferences
6. **Review & Export** — Verify and export to HawkSoft/EZLynx/PDF

---

## 🔒 Security

**Everything is encrypted and stored locally:**
- ✅ AES-256-GCM encryption (military-grade)
- ✅ PBKDF2 key derivation (100,000 iterations)
- ✅ Optional PIN protection
- ✅ No backend database
- ✅ No cloud sync
- ✅ No data sent to servers (except exports you download)

See [SECURITY_AND_DATA_SUMMARY.md](SECURITY_AND_DATA_SUMMARY.md) for full details.

---

## 🛠️ Technology Stack

- **Frontend**: Vanilla JavaScript (no build step, no dependencies)
- **Storage**: Browser localStorage (encrypted)
- **APIs**: Google Places, Google Maps, Google Gemini
- **Testing**: Jest + JSDOM
- **Deployment**: Vercel (serverless functions)

---

## 📦 Project Structure

```
Altech/
├── index.html              # Entire app (3,000+ lines, self-contained)
├── package.json            # NPM scripts
├── jest.config.js          # Test configuration
├── vercel.json             # Deployment config
├── api/                    # Serverless functions
│   ├── places-config.js    # Google Places API key endpoint
│   ├── policy-scan.js      # Document scanning via Gemini
│   ├── smart-extract.js    # Property analysis from satellite
│   ├── send-quotes.js      # Email exports (disabled in UI)
│   └── config.json         # Local dev API key fallback
├── docs/                   # Documentation
│   ├── guides/             # User guides
│   ├── technical/          # Architecture docs
│   └── archive/            # Old documentation
├── tests/                  # Unit tests
│   ├── app.test.js         # All test cases
│   └── setup.js            # Test environment
├── Resources/              # Sample files, references
└── SECURITY_AND_DATA_SUMMARY.md  # Security details
```

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Watch mode (TDD)
npm run test:watch

# Coverage report
npm run test:coverage
```

**Current Status**: ✅ 12/12 tests passing

---

## 🚀 Deployment

### Deploy to Vercel
```bash
vercel --prod
```

### Deploy to GitHub Pages
1. Settings → Pages → Branch: `main`, Folder: `/ (root)`
2. Live at `https://yourusername.github.io/Altech`

---

## 📝 Environment Variables

Required for production:
- `GOOGLE_API_KEY` — Gemini API for policy scanning
- `PLACES_API_KEY` — Google Places for address autocomplete
- `SENDGRID_API_KEY` — Email exports (optional, disabled in UI)

For local dev: Create `.env.local` with these values or use `/api/config.json` fallback.

---

## 🔧 Configuration

### Custom Branding
Edit [index.html](index.html) to change:
- App name (line 9)
- Logo/colors (CSS variables in lines 12-80)
- Company name (search for "Altech")

### Workflows
Three form flows in [App.workflows](index.html#L1511):
- `home` — Property only (skip vehicles)
- `auto` — Vehicles only (skip property)
- `both` — All steps (default)

---

## 📚 Documentation

- [SECURITY_AND_DATA_SUMMARY.md](SECURITY_AND_DATA_SUMMARY.md) — Encryption & data storage
- [docs/guides/](docs/guides/) — User guides & quick starts
- [docs/technical/](docs/technical/) — Architecture & integration
- [docs/archive/](docs/archive/) — Previous documentation

---

## 🐛 Troubleshooting

### Images not loading?
- API key not in localStorage
- Check: DevTools → Application → LocalStorage
- Verify: `altech_device_uuid` and `altech_v6` exist

### Form data lost?
- Data persists in browser localStorage
- Clear site data only if intentional
- Use DevTools → Application → Clear Site Data

### Export failing?
- Verify all required fields filled (name, state, DOB for EZLynx)
- Check browser console for validation errors
- Try exporting with fewer fields first

---

## 🤝 Contributing

1. Create a branch: `git checkout -b feature/your-feature`
2. Make changes (edit index.html directly, no build step)
3. Test: `npm test`
4. Commit: `git commit -m "Feature: description"`
5. Push: `git push origin feature/your-feature`
6. Open a Pull Request

---

## 📄 License

MIT License — See [LICENSE](LICENSE) for details

---

## 💡 Next Steps

- [ ] Multi-vehicle/driver support
- [ ] Backend database integration
- [ ] Email integration (SendGrid)
- [ ] Rate limiting on APIs
- [ ] Offline PWA with service workers
- [ ] Co-applicant support
- [ ] Policy document storage

---

**Questions?** Check the docs or review the code — everything is in `index.html` with detailed comments.

Last updated: February 4, 2026


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