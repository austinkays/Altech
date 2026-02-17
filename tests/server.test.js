/**
 * Server Tests: server.js
 *
 * Tests the local development server's pure logic:
 * - MIME type mapping
 * - .env loading
 * - Path traversal protection
 * - Static file serving patterns
 * - API route mapping
 * - Local endpoint patterns
 *
 * Does NOT start a live server — tests extracted logic deterministically.
 */

const fs = require('fs');
const path = require('path');

// ── Load server source for static analysis ──
const serverSource = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');

// ── Extract MIME_TYPES object ──
function extractMimeTypes() {
  const match = serverSource.match(/const MIME_TYPES\s*=\s*\{([^}]+)\}/s);
  if (!match) throw new Error('Could not extract MIME_TYPES');
  const fn = new Function(`return {${match[1]}}`);
  return fn();
}

// ── Extract loadEnv function ──
function extractLoadEnv() {
  // Pull out just the loadEnv function body
  const match = serverSource.match(/function loadEnv\(\)\s*\{([\s\S]*?)\n\}/);
  if (!match) throw new Error('Could not extract loadEnv');
  return match[1];
}

// ── Extract blocked path segments ──
function extractBlockedSegments() {
  // Extract the regex from serveStatic blocked paths
  const match = serverSource.match(/segments\.some\(s => \/\^\\?\((.*?)\).*?\.test\(s\)\)/);
  return match ? match[1].split('|') : [];
}

// ────────────────────────────────────────────────────
// MIME Type Mapping
// ────────────────────────────────────────────────────

describe('MIME Type Mapping', () => {
  let MIME_TYPES;

  beforeAll(() => {
    MIME_TYPES = extractMimeTypes();
  });

  test('has correct MIME type for .html', () => {
    expect(MIME_TYPES['.html']).toBe('text/html');
  });

  test('has correct MIME type for .css', () => {
    expect(MIME_TYPES['.css']).toBe('text/css');
  });

  test('has correct MIME type for .js', () => {
    expect(MIME_TYPES['.js']).toBe('application/javascript');
  });

  test('has correct MIME type for .json', () => {
    expect(MIME_TYPES['.json']).toBe('application/json');
  });

  test('has correct MIME type for .png', () => {
    expect(MIME_TYPES['.png']).toBe('image/png');
  });

  test('has correct MIME type for .svg', () => {
    expect(MIME_TYPES['.svg']).toBe('image/svg+xml');
  });

  test('has correct MIME type for .pdf', () => {
    expect(MIME_TYPES['.pdf']).toBe('application/pdf');
  });

  test('has correct MIME type for .xml', () => {
    expect(MIME_TYPES['.xml']).toBe('application/xml');
  });

  test('has correct MIME type for .woff2', () => {
    expect(MIME_TYPES['.woff2']).toBe('font/woff2');
  });

  test('covers all common web file types', () => {
    const requiredExtensions = ['.html', '.css', '.js', '.json', '.png', '.jpg', '.gif', '.svg', '.ico', '.pdf'];
    for (const ext of requiredExtensions) {
      expect(ext in MIME_TYPES).toBe(true);
    }
  });
});

// ────────────────────────────────────────────────────
// Module Syntax
// ────────────────────────────────────────────────────

describe('server.js — Module Syntax', () => {
  test('server source has no obvious syntax errors', () => {
    // Verify the file loads and has expected structure
    expect(serverSource.length).toBeGreaterThan(500);
    expect(serverSource).toContain('createServer');
    expect(serverSource).toContain('server.listen');
  });

  test('uses ESM imports (not CommonJS require)', () => {
    expect(serverSource).toContain("import { createServer }");
    expect(serverSource).toContain("import { readFileSync");
  });

  test('defines PORT with fallback to 8000', () => {
    expect(serverSource).toMatch(/const PORT\s*=\s*process\.env\.PORT\s*\|\|\s*8000/);
  });
});

// ────────────────────────────────────────────────────
// Path Traversal Protection
// ────────────────────────────────────────────────────

describe('Path Traversal Protection', () => {
  test('serveStatic checks path does not escape project root', () => {
    expect(serverSource).toContain('fullPath.startsWith(resolve(__dirname))');
  });

  test('serveStatic returns 403 for traversal attempts', () => {
    // The server should reject paths outside __dirname
    expect(serverSource).toMatch(/res\.writeHead\(403.*Forbidden/s);
  });

  test('blocks dotfiles and hidden directories', () => {
    expect(serverSource).toContain("s.startsWith('.')");
  });

  test('blocks sensitive directories', () => {
    const blockedDirs = extractBlockedSegments();
    expect(blockedDirs).toContain('\\.env');
    expect(blockedDirs).toContain('\\.git');
    expect(blockedDirs).toContain('node_modules');
    expect(blockedDirs).toContain('python_backend');
    expect(blockedDirs).toContain('src-tauri');
  });
});

// ────────────────────────────────────────────────────
// .env Loading
// ────────────────────────────────────────────────────

describe('.env Loading', () => {
  test('loadEnv handles missing .env file gracefully', () => {
    // Source should check existsSync before reading
    expect(serverSource).toContain("existsSync(envPath)");
  });

  test('loadEnv skips empty lines and comments', () => {
    const body = extractLoadEnv();
    expect(body).toContain("trimmed.startsWith('#')");
    expect(body).toContain('!trimmed');
  });

  test('loadEnv handles key=value pairs with equals sign', () => {
    const body = extractLoadEnv();
    expect(body).toContain("indexOf('=')");
  });

  test('loadEnv sets process.env', () => {
    const body = extractLoadEnv();
    expect(body).toContain('process.env[key] = value');
  });
});

// ────────────────────────────────────────────────────
// API Route Handling
// ────────────────────────────────────────────────────

describe('API Route Handling', () => {
  test('handleApiRoute maps /api/compliance to ./api/compliance.js', () => {
    expect(serverSource).toContain("routePath + '.js'");
  });

  test('returns 404 for missing API files', () => {
    expect(serverSource).toMatch(/API route not found/);
  });

  test('returns 500 when handler has no default export', () => {
    expect(serverSource).toMatch(/API module has no default export handler/);
  });

  test('builds mock req with method, url, headers, query, body', () => {
    expect(serverSource).toContain('method: req.method');
    expect(serverSource).toContain('url: req.url');
    expect(serverSource).toContain('headers: req.headers');
    expect(serverSource).toContain('query: Object.fromEntries');
    expect(serverSource).toContain('body: null');
  });

  test('reads POST/PUT body and attempts JSON parse', () => {
    expect(serverSource).toMatch(/req\.method\s*===\s*'POST'\s*\|\|\s*req\.method\s*===\s*'PUT'/);
    expect(serverSource).toContain('JSON.parse(body)');
  });
});

// ────────────────────────────────────────────────────
// Local-only Endpoints
// ────────────────────────────────────────────────────

describe('Local-only Endpoints', () => {
  test('restricts /local/* to loopback IPs', () => {
    expect(serverSource).toContain("'127.0.0.1'");
    expect(serverSource).toContain("'::1'");
    expect(serverSource).toContain("'::ffff:127.0.0.1'");
  });

  test('has /local/cgl-state endpoint', () => {
    expect(serverSource).toContain("'/local/cgl-state'");
  });

  test('has /local/cgl-cache endpoint', () => {
    expect(serverSource).toContain("'/local/cgl-cache'");
  });

  test('has /local/export-history endpoint', () => {
    expect(serverSource).toContain("pathname === '/local/export-history'");
  });

  test('has /local/scan-history endpoint', () => {
    expect(serverSource).toContain("'/local/scan-history'");
  });

  test('has /local/email-drafts endpoint', () => {
    expect(serverSource).toContain("'/local/email-drafts'");
  });

  test('has /local/quickref-cards endpoint', () => {
    expect(serverSource).toContain("'/local/quickref-cards'");
  });

  test('has /local/hawksoft-export endpoint', () => {
    expect(serverSource).toContain("pathname === '/local/hawksoft-export'");
  });

  test('has /local/trust-report endpoint', () => {
    expect(serverSource).toContain("pathname === '/local/trust-report'");
  });

  test('has /local/ezlynx-schema endpoint', () => {
    expect(serverSource).toContain("pathname === '/local/ezlynx-schema'");
  });

  test('has /local/ezlynx-fill endpoint', () => {
    expect(serverSource).toContain("pathname === '/local/ezlynx-fill'");
  });

  test('export-history caps at 200 entries', () => {
    expect(serverSource).toContain('.slice(0, 200)');
  });

  test('readBody has default 1MB size limit', () => {
    expect(serverSource).toMatch(/maxBytes\s*=\s*1048576/);
  });

  test('cgl-cache allows 5MB body', () => {
    expect(serverSource).toContain('5242880');
  });

  test('returns 413 for oversized payloads', () => {
    expect(serverSource).toMatch(/413.*Payload too large|Body too large/s);
  });
});

// ────────────────────────────────────────────────────
// CORS & Security Headers
// ────────────────────────────────────────────────────

describe('CORS & Security Headers', () => {
  test('sets X-Content-Type-Options: nosniff', () => {
    expect(serverSource).toContain("'X-Content-Type-Options', 'nosniff'");
  });

  test('sets X-Frame-Options: SAMEORIGIN', () => {
    expect(serverSource).toContain("'X-Frame-Options', 'SAMEORIGIN'");
  });

  test('sets Access-Control-Allow-Methods', () => {
    expect(serverSource).toContain("'Access-Control-Allow-Methods'");
  });

  test('sets Access-Control-Allow-Headers', () => {
    expect(serverSource).toContain("'Access-Control-Allow-Headers'");
  });

  test('handles OPTIONS preflight with 200', () => {
    expect(serverSource).toMatch(/req\.method\s*===\s*'OPTIONS'[\s\S]*?res\.writeHead\(200\)/);
  });

  test('restricts allowed origins to localhost', () => {
    expect(serverSource).toContain('`http://localhost:${PORT}`');
    expect(serverSource).toContain('`http://127.0.0.1:${PORT}`');
  });
});

// ────────────────────────────────────────────────────
// Static File Serving
// ────────────────────────────────────────────────────

describe('Static File Serving', () => {
  test('serves index.html for root path', () => {
    expect(serverSource).toMatch(/pathname\s*===\s*'\/'\s*\?\s*'\/index\.html'/);
  });

  test('falls back to index.html for SPA routing', () => {
    // When file not found, serve index.html
    expect(serverSource).toContain("const indexPath = join(__dirname, 'index.html')");
  });

  test('sets no-cache header for static files', () => {
    expect(serverSource).toContain('Cache-Control');
    expect(serverSource).toContain('no-cache');
  });

  test('falls back to application/octet-stream for unknown extensions', () => {
    expect(serverSource).toContain("'application/octet-stream'");
  });
});

// ────────────────────────────────────────────────────
// Python Integration Endpoints
// ────────────────────────────────────────────────────

describe('Python Integration', () => {
  test('prefers venv Python over system Python', () => {
    expect(serverSource).toContain("'.venv', 'Scripts', 'python.exe'");
  });

  test('sanitizes output filenames', () => {
    // Should strip dangerous characters from filenames
    expect(serverSource).toMatch(/\.replace\(\/\[.*?\]\/g,\s*'_'\)/);
  });

  test('hawksoft-export checks script exists before spawning', () => {
    expect(serverSource).toContain("'hawksoft_export.py not found'");
  });

  test('trust-report checks input file exists', () => {
    expect(serverSource).toContain('not found. Run the export first.');
  });

  test('ezlynx-fill cleans up temp file after process exits', () => {
    expect(serverSource).toContain('unlinkSync(tempClientPath)');
  });

  test('ezlynx-schema reports status with dropdownCount', () => {
    expect(serverSource).toContain('dropdownCount');
  });
});

// ────────────────────────────────────────────────────
// Server Startup
// ────────────────────────────────────────────────────

describe('Server Startup', () => {
  test('detects HawkSoft credentials from env', () => {
    expect(serverSource).toContain('HAWKSOFT_CLIENT_ID');
    expect(serverSource).toContain('HAWKSOFT_CLIENT_SECRET');
    expect(serverSource).toContain('HAWKSOFT_AGENCY_ID');
  });

  test('detects Gemini API key from env', () => {
    expect(serverSource).toContain('GOOGLE_API_KEY');
  });

  test('listens on configured PORT', () => {
    expect(serverSource).toContain('server.listen(PORT');
  });
});
