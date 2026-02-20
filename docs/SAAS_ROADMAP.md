# Altech SaaS Commercialization Roadmap

> **Role:** Principal Cloud Architect & Enterprise SaaS Expert  
> **Objective:** Transition Altech from a single-user internal tool into a commercial, multi-tenant SaaS for P&C insurance agents.  
> **Audience:** Lead developer + founders

---

## Executive Summary

Altech is a mature, feature-rich internal tool with a clean plugin architecture and solid Firebase + Vercel foundation. The path to commercial SaaS requires three parallel workstreams executed in sequence: **harden security first**, **extract architecture second**, **polish UX third**. Each phase builds on the previous without breaking production.

---

## Phase 1 — Security & Account Infrastructure (Weeks 1–4)

*No agent can trust a SaaS product with client data until the security model is airtight.*

### 1.1 Firestore Multi-Tenant Isolation

| Step | Action |
|------|--------|
| 1 | Deploy `firestore.rules` (already created in repo root) |
| 2 | Verify rules in Firebase Emulator: `firebase emulators:start --only firestore` |
| 3 | Run `firebase deploy --only firestore:rules` |
| 4 | Add Firestore indexes for per-user queries if/when needed |

**Key rule:** `allow read, write: if request.auth.uid == userId` — enforces strict tenant isolation at the database layer. No server-side code can accidentally expose one agent's data to another.

### 1.2 Lock Down Vercel API Endpoints

All 13 serverless functions now use one of two security patterns:

| Pattern | Applies To | What It Does |
|---------|-----------|--------------|
| `securityMiddleware` | All AI/data endpoints | Rate limiting (20 req/min/IP), restricted CORS, security headers |
| `requireAuth` | Premium paid-feature endpoints | Validates Firebase ID token before processing |

**Completed in this PR:**
- `api/_security.js` — added `verifyFirebaseToken()` and `requireAuth()` 
- `api/places-config.js` — now requires `Authorization: Bearer <token>` header
- All 9 previously-unprotected endpoints wrapped with `securityMiddleware`
- Wildcard `Access-Control-Allow-Origin: *` removed from all endpoints

**Remaining actions:**
1. Set `FIREBASE_API_KEY` in Vercel Dashboard → Environment Variables
2. Set `ALLOWED_ORIGINS` to your production domain(s)
3. Tune `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` per endpoint class

### 1.3 Firebase Auth — Subscription Model

**Stripe + Firebase Extension (recommended path):**

1. Install [Stripe Firebase Extension](https://extensions.dev/extensions/stripe/firestore-stripe-payments)
2. Configure products/prices in Stripe Dashboard
3. Add `role` custom claim to Firebase Auth on subscription activation:
   ```js
   // Cloud Function triggered on Stripe webhook
   admin.auth().setCustomUserClaims(uid, { plan: 'pro', active: true });
   ```
4. Enforce in Firestore rules:
   ```
   function isPaidSubscriber() {
     return request.auth.token.active == true && request.auth.token.plan == 'pro';
   }
   ```
5. Gate premium API endpoints with `requireAuth()` (already in `api/_security.js`)

**Auth hardening checklist:**
- [ ] Enable Firebase Auth email verification requirement
- [ ] Enable reCAPTCHA on signup flow
- [ ] Set session token expiry to 1 hour (Firebase default is 1 hour, but verify)
- [ ] Enable Firebase App Check (prevents non-app API calls)
- [ ] Monitor Auth logs for brute-force patterns

---

## Phase 2 — Architectural Refactoring (Weeks 5–10)

*The index.html monolith (12,490 lines) must be decomposed without introducing a build step.*

### 2.1 Zero-Build Module Extraction Strategy

The app's plugin system already provides a clean extraction boundary. Use this order:

**Step 1: Audit & annotate** (1 day)
- Tag every code block in `index.html` by its owning plugin/module
- Identify shared utility functions (date formatting, currency, etc.)
- Map all event listeners to their originating feature

**Step 2: Extract shared utilities** (1–2 days)
- Create `js/utils.js` with date/currency formatters, DOM helpers
- Reference via `<script src="js/utils.js">` before plugins load
- No module bundler needed — just `<script>` tag ordering

**Step 3: Extract step-controllers** (2–3 days per step)
Extract each wizard step into its own file:
```
js/steps/
  step-0-landing.js
  step-1-basics.js
  step-2-property.js
  step-3-auto.js
  step-4-coverage.js
  step-5-review.js
  step-6-export.js
```
Each file registers itself on a global `Steps` namespace:
```js
// js/steps/step-2-property.js
window.Steps = window.Steps || {};
window.Steps.property = { init, render, validate };
```

**Step 4: Extract the App coordinator** (3–5 days)
Move `App` object to `js/app-core.js`. The HTML `<script>` load order becomes the dependency graph — no bundler required.

**Step 5: Reduce index.html to a shell** (1–2 days)
```html
<!-- index.html becomes ~200 lines -->
<head><!-- meta, CSS links --></head>
<body>
  <!-- Static HTML structure only -->
  <script src="js/utils.js"></script>
  <script src="js/firebase-config.js"></script>
  <script src="js/auth.js"></script>
  <!-- plugin scripts... -->
  <script src="js/app-core.js"></script>
</body>
```

### 2.2 Data Layer Hardening

- **Schema versioning:** Add `schemaVersion` field to `altech_v6` and write a migration runner for future key renames
- **Conflict resolution:** Current "keep both" strategy is good for beta; add a merge UI in the account modal for GA
- **Offline-first:** Add `ServiceWorker` caching for the app shell and all JS/CSS files

### 2.3 API Architecture

- Move from per-IP rate limiting to per-UID rate limiting (requires auth token verification on all endpoints)
- Add Redis-backed rate limit counters via `api/kv-store.js` for distributed deployments
- Add `X-Request-ID` correlation header for tracing API calls end-to-end

---

## Phase 3 — Commercial UI/UX Polish (Weeks 8–12, parallel with Phase 2)

*A premium desktop-first SaaS must feel enterprise-grade from first login.*

### 3.1 Global Error Boundaries

Currently, unhandled promise rejections silently fail. Add:

```js
// js/utils.js
window.addEventListener('unhandledrejection', (e) => {
  App.showToast(`Unexpected error: ${e.reason?.message || 'Unknown'}`, 'error');
  // Send to Sentry/Datadog if configured
  if (window.Sentry) Sentry.captureException(e.reason);
});
```

Add a `try/catch` boundary around every plugin's `init()` call in `navigateTo()`:
```js
async function navigateTo(key) {
  try {
    await window[module].init();
  } catch (err) {
    showPluginError(key, err); // graceful degradation
  }
}
```

### 3.2 Standardized Loading States

Implement a single, consistent loading pattern:
1. Add `data-loading` attribute to containers
2. CSS: `[data-loading]::after { content: ''; /* spinner */ }`
3. JS: `el.dataset.loading = 'true'` / `delete el.dataset.loading`

Audit and replace all custom "Loading..." strings with this standard pattern.

### 3.3 Layout Shift Prevention

Largest layout shifts occur at:
- Plugin container size changes on load (fix: set `min-height` on `.plugin-container`)
- Font loading (fix: `font-display: swap` on all `@font-face`)
- Firebase/Auth initialization delay (fix: render skeleton UI before auth resolves)

Add `content-visibility: auto` to off-screen plugin containers for paint performance.

### 3.4 Subscription Gate UI

Add a premium paywall component that:
1. Appears when unauthenticated users trigger AI features
2. Shows plan benefits + pricing
3. Links to Stripe checkout
4. Stores `utm_source` / `utm_campaign` for attribution

### 3.5 Onboarding Flow

First-time agent onboarding (already partially implemented in `js/onboarding.js`):
1. Account creation → email verification prompt
2. Agency profile setup (name, state, license number)
3. First scan walkthrough (tooltip-guided)
4. Billing setup (Stripe Customer Portal link)

### 3.6 Desktop-First Optimizations

With 95% desktop usage, prioritize:
- Keyboard navigation (Tab order, Enter-to-submit)
- Multi-column form layouts (already implemented in grid-2-full)
- Drag-and-drop for document uploads
- Side-by-side quote comparison (QuoteCompare plugin)
- Printable / PDF export for all views

---

## Deployment & Ops Checklist

### Before Launch
- [ ] Firestore rules deployed and tested
- [ ] All Vercel env vars set: `FIREBASE_API_KEY`, `ALLOWED_ORIGINS`, `RATE_LIMIT_MAX`
- [ ] Firebase App Check enabled in production
- [ ] Stripe integration tested end-to-end in sandbox
- [ ] Error monitoring (Sentry) configured
- [ ] Uptime monitoring configured (e.g., Better Uptime)

### At Launch
- [ ] Set `ALLOWED_ORIGINS` to production domain only
- [ ] Enable Firebase Auth email enumeration protection
- [ ] Review Vercel function logs for anomalies
- [ ] Set up Vercel spend alerts

### Post-Launch
- [ ] Monthly Firestore rules review as features are added
- [ ] Quarterly dependency security audit (`npm audit`)
- [ ] Review rate limit logs monthly; tune thresholds based on usage patterns

---

## Tech Debt Register

| Item | Priority | Effort | Notes |
|------|----------|--------|-------|
| Remove hardcoded Firebase config from `js/firebase-config.js` | High | 1 day | Move to `NEXT_PUBLIC_*` env vars |
| Migrate from `firebase.auth()` (compat SDK) to modular Firebase v9+ | Medium | 1 week | Reduces bundle size ~40% |
| Replace `new Function(...)` in tests with proper ESM mocking | Medium | 2 days | Current tests are fragile |
| Add `Content-Security-Policy` headers for plugin HTML files | High | 2 days | Currently only on API responses |
| Rate limit by UID instead of IP (post-auth) | High | 1 day | Prevents VPN abuse |

---

*Last updated: February 2026*
