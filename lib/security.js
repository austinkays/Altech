/**
 * Security Middleware for Altech API Endpoints
 * 
 * Provides:
 * - Rate limiting per IP (anonymous) and per UID (authenticated)
 * - Security headers
 * - CORS (configurable via ALLOWED_ORIGINS env var)
 * - X-Request-ID correlation header for end-to-end tracing
 * - Input validation
 * - Firebase ID token verification for multi-tenant isolation
 * - Request logging (anonymized)
 */

import { randomUUID } from 'crypto';

const rateLimits = new Map(); // key → { count, resetTime }  (key = IP or uid:UID)

// ── Configuration from environment ──────────────────────────────
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX, 10) || 20;
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000;
const RATE_LIMIT_AUTH_MAX = parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10) || 60; // Higher limit for authenticated users
const CLEANUP_AGE_MS = 5 * 60 * 1000; // 5 minutes

// Parse allowed origins from env (comma-separated) or fall back to safe defaults
function getAllowedOrigins() {
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean);
  }
  // Safe defaults: production domains + local dev ports
  return [
    'https://altech.agency',
    'https://www.altech.agency',
    'https://altech-insurance.vercel.app',
    'http://localhost:8000',
    'http://localhost:3000',
  ];
}

export function securityMiddleware(handler) {
  return async (req, res) => {
    // ── X-Request-ID correlation ──
    const requestId = req.headers['x-request-id'] || randomUUID();
    res.setHeader('X-Request-ID', requestId);
    req.requestId = requestId;

    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    // CORS
    const allowedOrigins = getAllowedOrigins();
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID');
    }

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // ── Rate limiting (per-UID if authenticated, per-IP otherwise) ──
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    // Try to extract UID from auth header for per-UID limiting
    let rateLimitKey = ip;
    let rateLimitMax = RATE_LIMIT_MAX;
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      // Quick decode of Firebase ID token (JWT) to get UID without a network call
      try {
        const payload = JSON.parse(Buffer.from(authHeader.slice(7).split('.')[1], 'base64url').toString());
        if (payload.user_id || payload.sub) {
          rateLimitKey = `uid:${payload.user_id || payload.sub}`;
          rateLimitMax = RATE_LIMIT_AUTH_MAX; // Authenticated users get higher limits
        }
      } catch {
        // Invalid token — fall back to IP-based limiting
      }
    }

    const limit = rateLimits.get(rateLimitKey);
    if (limit) {
      if (now < limit.resetTime) {
        if (limit.count >= rateLimitMax) {
          console.log(`[Security] Rate limit exceeded for ${rateLimitKey.substring(0, 15)}... [${requestId}]`);
          res.status(429).json({ error: 'Too many requests. Please wait a moment.', requestId });
          return;
        }
        limit.count++;
      } else {
        // Reset window
        limit.count = 1;
        limit.resetTime = now + RATE_LIMIT_WINDOW_MS;
      }
    } else {
      rateLimits.set(rateLimitKey, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    }

    // Clean old entries every 1000 requests
    if (rateLimits.size > 1000) {
      for (const [key, value] of rateLimits.entries()) {
        if (now > value.resetTime + CLEANUP_AGE_MS) {
          rateLimits.delete(key);
        }
      }
    }

    // Call actual handler
    return handler(req, res);
  };
}

/**
 * Extract and verify a Firebase ID token from the Authorization header.
 *
 * Uses the Firebase Auth REST API (accounts:lookup) — no firebase-admin needed.
 * Returns the Firebase user object on success, or null on failure/missing token.
 *
 * Requires FIREBASE_API_KEY env var (the web API key from Firebase console).
 */
export async function verifyFirebaseToken(req) {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!idToken) return null;

  const firebaseApiKey = (process.env.FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '').trim();
  if (!firebaseApiKey) return null;

  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.users?.[0] || null;
  } catch {
    return null;
  }
}

/**
 * Wraps a handler to require a valid Firebase ID token.
 * Returns 401 if the token is missing or invalid.
 * Injects the verified user as req.user for the inner handler.
 */
export function requireAuth(handler) {
  return async (req, res) => {
    const user = await verifyFirebaseToken(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.', requestId: req.requestId });
    }
    req.user = user;
    req.uid = user.localId;
    req.userEmail = user.email;
    return handler(req, res);
  };
}

export function sanitizeInput(input, maxLength = 500) {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .substring(0, maxLength)
    .replace(/[<>]/g, ''); // Remove angle brackets to prevent XSS
}

export function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email) && email.length < 255;
}

export function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
}

/**
 * Validate a US Social Security Number (SSN).
 * Accepts formats: XXX-XX-XXXX or XXXXXXXXX (9 digits).
 * Rejects all-zeros segments, known invalid numbers (e.g. 000, 666, 900-999 area).
 */
export function validateSSN(ssn) {
  if (!ssn || typeof ssn !== 'string') return false;
  const cleaned = ssn.replace(/\D/g, '');
  if (cleaned.length !== 9) return false;
  const area = parseInt(cleaned.substring(0, 3), 10);
  const group = parseInt(cleaned.substring(3, 5), 10);
  const serial = parseInt(cleaned.substring(5, 9), 10);
  // ITIN numbers (area 900-999) and invalid segments
  if (area === 0 || area === 666 || area >= 900) return false;
  if (group === 0) return false;
  if (serial === 0) return false;
  // All-same-digit patterns (e.g. 111-11-1111, 999-99-9999)
  if (/^(\d)\1{8}$/.test(cleaned)) return false;
  return true;
}

/**
 * Validate a US ZIP code (5-digit or ZIP+4).
 */
export function validateZip(zip) {
  if (!zip || typeof zip !== 'string') return false;
  return /^\d{5}(-\d{4})?$/.test(zip.trim());
}
