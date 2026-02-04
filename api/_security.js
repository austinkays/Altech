/**
 * Security Middleware for Altech API Endpoints
 * 
 * Provides:
 * - Rate limiting per IP
 * - Security headers
 * - Input validation
 * - Request logging (anonymized)
 */

const rateLimits = new Map(); // IP → { count, resetTime }

export function securityMiddleware(handler) {
  return async (req, res) => {
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'");

    // CORS for production domain
    const allowedOrigins = [
      'https://altech-insurance.vercel.app',
      'http://localhost:8000',
      'http://localhost:3000'
    ];
    
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // Rate limiting: 20 requests per minute per IP
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const limit = rateLimits.get(ip);

    if (limit) {
      if (now < limit.resetTime) {
        if (limit.count >= 20) {
          console.log(`[Security] Rate limit exceeded for IP: ${ip.substring(0, 10)}...`);
          res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
          return;
        }
        limit.count++;
      } else {
        // Reset window
        limit.count = 1;
        limit.resetTime = now + 60000; // 1 minute
      }
    } else {
      rateLimits.set(ip, { count: 1, resetTime: now + 60000 });
    }

    // Clean old entries every 1000 requests
    if (rateLimits.size > 1000) {
      for (const [key, value] of rateLimits.entries()) {
        if (now > value.resetTime + 300000) { // 5 minutes old
          rateLimits.delete(key);
        }
      }
    }

    // Call actual handler
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
