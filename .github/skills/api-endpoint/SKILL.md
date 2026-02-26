---
name: api-endpoint
description: >
  Guide for adding a new Vercel serverless API endpoint to Altech Field Lead.
  Use this skill when adding, modifying, or debugging any file in the api/ directory.
  Covers auth middleware patterns, the shared AI router, response format, error handling,
  vercel.json configuration, and environment variables.
---

# Adding a Vercel Serverless API Endpoint to Altech Field Lead

All API endpoints live in `api/` and deploy as Vercel serverless functions.
The app is a vanilla JS SPA with no build step — edit and deploy directly.

---

## File Structure Convention

```
api/
├── _ai-router.js       # Shared AI router — NOT an endpoint, import it
├── your-endpoint.js    # Your new endpoint
```

File names become URL paths: `api/your-endpoint.js` → `/api/your-endpoint`

---

## Auth Middleware Patterns

Every endpoint uses one of three auth levels. Choose based on sensitivity:

### 1. Firebase Auth (user must be logged in)
Use for: user data, quotes, billing, admin actions

```javascript
import { verifyFirebaseToken } from '../lib/auth-middleware.js';

export default async function handler(req, res) {
    const user = await verifyFirebaseToken(req, res);
    if (!user) return; // middleware already sent 401
    
    const uid = user.uid;
    // ... your logic
}
```

### 2. Security Token (server-to-server, not user-specific)
Use for: AI processing, property lookups, scan endpoints

```javascript
import { validateSecurityToken } from '../lib/auth-middleware.js';

export default async function handler(req, res) {
    if (!validateSecurityToken(req, res)) return; // sends 403 if invalid
    // ... your logic
}
```

### 3. Rate-Limit Only (public but throttled)
Use for: phonetics, low-sensitivity endpoints

```javascript
import { checkRateLimit } from '../lib/auth-middleware.js';

export default async function handler(req, res) {
    if (!checkRateLimit(req, res)) return;
    // ... your logic
}
```

---

## Endpoint Template

```javascript
// api/your-endpoint.js
import { verifyFirebaseToken } from '../lib/auth-middleware.js';

export default async function handler(req, res) {
    // CORS headers (required for browser requests)
    res.setHeader('Access-Control-Allow-Origin', process.env.APP_URL || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Auth
    const user = await verifyFirebaseToken(req, res);
    if (!user) return;

    try {
        const { yourParam } = req.body;

        if (!yourParam) {
            return res.status(400).json({ error: 'yourParam is required' });
        }

        // Your logic here
        const result = await doSomething(yourParam);

        return res.status(200).json({ success: true, data: result });

    } catch (error) {
        console.error('your-endpoint error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
```

---

## Using the Shared AI Router

For any AI calls, use `_ai-router.js` instead of calling providers directly:

```javascript
import { routeAIRequest } from './_ai-router.js';

const response = await routeAIRequest({
    provider: 'google',         // 'google' | 'openrouter' | 'openai' | 'anthropic'
    model: 'gemini-2.0-flash',
    systemPrompt: 'You are...',
    userMessage: 'Analyze this...',
    maxTokens: 1000
});
```

---

## Calling from the Frontend

Use `apiFetch()` from `js/auth.js` — it automatically attaches the Firebase ID token:

```javascript
// In your JS module:
const result = await apiFetch('/api/your-endpoint', {
    method: 'POST',
    body: JSON.stringify({ yourParam: value })
});
```

`apiFetch` handles auth headers, error formatting, and token refresh automatically.

---

## `vercel.json` Configuration

If your endpoint needs a custom timeout (default is 10s, max is 60s on Pro):

```json
{
  "functions": {
    "api/your-endpoint.js": {
      "maxDuration": 30
    }
  }
}
```

Long-running endpoints (AI processing, property lookups) typically need 30–60s.

---

## Environment Variables

Add any new secrets to Vercel dashboard → Project Settings → Environment Variables.
Never hardcode API keys. Access them with `process.env.YOUR_KEY`.

After adding, also document in the `AGENTS.md` Section 9 (Pre-Deploy Checklist) env vars table.

---

## Response Format Conventions

All endpoints return JSON. Use consistent shapes:

```javascript
// Success
res.status(200).json({ success: true, data: { ... } });

// Client error
res.status(400).json({ error: 'Descriptive message' });

// Auth error — handled by middleware, but if manual:
res.status(401).json({ error: 'Unauthorized' });

// Server error
res.status(500).json({ error: 'Internal server error' });
```

---

## After Adding an Endpoint

- [ ] Add to the API reference table in `AGENTS.md` Appendix B
- [ ] Add env vars to `AGENTS.md` Section 9 if any new ones required
- [ ] Add rewrite rule to `vercel.json` if needed
- [ ] `npm test` → 0 failures
- [ ] `npm run deploy:vercel` to deploy
- [ ] Run `npm run audit-docs`
- [ ] Commit and push
