/**
 * Local Development Server
 * Serves static files + runs API handlers (no Vercel needed)
 * 
 * Usage: node server.js
 * 
 * Reads HawkSoft credentials from .env file
 */

import { createServer } from 'http';
import { readFileSync, existsSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { join, extname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Load .env ───────────────────────────────────────
function loadEnv() {
    const envPath = join(__dirname, '.env');
    if (!existsSync(envPath)) {
        console.warn('⚠️  No .env file found. Copy .env.example to .env and add your credentials.');
        return;
    }
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim();
        if (key && value) {
            process.env[key] = value;
        }
    }
}
loadEnv();

// ─── MIME types ──────────────────────────────────────
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.pdf': 'application/pdf',
    '.xml': 'application/xml',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.webp': 'image/webp',
};

// ─── API Route Handlers ─────────────────────────────
// Dynamically import and run Vercel-style serverless functions

async function handleApiRoute(routePath, req, res) {
    // Map route to file: /api/compliance -> ./api/compliance.js
    const apiFile = join(__dirname, routePath + '.js');

    if (!existsSync(apiFile)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `API route not found: ${routePath}` }));
        return;
    }

    // Build a mock req/res that matches Vercel's interface
    const mockReq = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        query: Object.fromEntries(new URL(req.url, `http://localhost`).searchParams),
        body: null,
    };

    // Read body for POST/PUT (with size limit)
    if (req.method === 'POST' || req.method === 'PUT') {
        const MAX_BODY = 10 * 1024 * 1024; // 10MB
        mockReq.body = await new Promise((resolve, reject) => {
            let body = '';
            let bytes = 0;
            req.on('data', chunk => {
                bytes += chunk.length;
                if (bytes > MAX_BODY) {
                    req.destroy();
                    reject(new Error('Request body too large'));
                    return;
                }
                body += chunk;
            });
            req.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch { resolve(body); }
            });
            req.on('error', reject);
        }).catch(err => {
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
            return null;
        });
        if (mockReq.body === null) return;
    }

    const mockRes = {
        _statusCode: 200,
        _headers: {},
        _body: null,
        _ended: false,

        status(code) { this._statusCode = code; return this; },
        setHeader(key, val) { this._headers[key] = val; return this; },
        json(data) {
            this._headers['Content-Type'] = 'application/json';
            this._body = JSON.stringify(data);
            this._ended = true;
            return this;
        },
        send(data) {
            this._body = data;
            this._ended = true;
            return this;
        },
        end(data) {
            if (data) this._body = data;
            this._ended = true;
            return this;
        },
    };

    try {
        // Dynamic import of the serverless function
        const module = await import(`file://${apiFile}`);
        const handler = module.default || module.handler;

        if (typeof handler !== 'function') {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'API module has no default export handler' }));
            return;
        }

        await handler(mockReq, mockRes);

        // Write the mock response back to the real response
        res.writeHead(mockRes._statusCode, mockRes._headers);
        res.end(mockRes._body || '');

    } catch (err) {
        console.error(`[Server] API Error (${routePath}):`, err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
    }
}

// ─── Static File Server ──────────────────────────────

// Helper: read POST body with size limit
async function readBody(req, maxBytes = 1048576) {
    return new Promise((resolve, reject) => {
        let data = '';
        let bytes = 0;
        req.on('data', chunk => {
            bytes += chunk.length;
            if (bytes > maxBytes) { reject(new Error('Body too large')); req.destroy(); }
            data += chunk;
        });
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}

// Factory for simple local file persistence endpoints (GET/POST read/write JSON)
function handleLocalFileEndpoint(req, res, filePath, options = {}) {
    const { maxBytes = 1048576, defaultValue = null, onPost = null } = options;

    if (req.method === 'GET') {
        if (existsSync(filePath)) {
            const content = readFileSync(filePath, 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(content);
        } else if (defaultValue !== null) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(defaultValue));
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
        }
        return true;
    }

    if (req.method === 'POST' || req.method === 'PUT') {
        return readBody(req, maxBytes).then(body => {
            const dataToWrite = onPost ? onPost(body, filePath) : body;
            writeFileSync(filePath, dataToWrite, 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
        }).catch(e => {
            const code = e.message === 'Body too large' ? 413 : 400;
            res.writeHead(code, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }).then(() => true);
    }

    return false;
}

function serveStatic(filePath, res) {
    try {
        const fullPath = resolve(join(__dirname, filePath));

        // Path traversal protection
        if (!fullPath.startsWith(resolve(__dirname))) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden');
            return;
        }
        // Block sensitive/hidden files (.env, .gitignore, dotfiles, etc.)
        const segments = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
        if (segments.some(s => s.startsWith('.')) || segments.some(s => /^(\.env|\.git|node_modules|src-tauri|python_backend)$/i.test(s))) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden');
            return;
        }
        if (!existsSync(fullPath) || !statSync(fullPath).isFile()) {
            // SPA fallback: serve index.html for non-file routes
            const indexPath = join(__dirname, 'index.html');
            const content = readFileSync(indexPath);
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
            return;
        }

        const ext = extname(fullPath).toLowerCase();
        const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
        const content = readFileSync(fullPath);

        res.writeHead(200, {
            'Content-Type': mimeType,
            'Cache-Control': 'no-cache',
        });
        res.end(content);
    } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
    }
}

// ─── Main Server ─────────────────────────────────────

// ── Compliance fetch progress (shared state for SSE) ──
global.__complianceProgress = { chunk: 0, totalChunks: 0, phase: 'idle', startedAt: 0 };

const PORT = process.env.PORT || 8000;

const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = decodeURIComponent(url.pathname);

    // CORS headers — restrict to local development + Tauri
    const allowedOrigins = [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`, 'tauri://localhost', 'https://tauri.localhost'];
    const origin = req.headers.origin || '';
    if (allowedOrigins.includes(origin) || !origin) {
        res.setHeader('Access-Control-Allow-Origin', origin || `http://localhost:${PORT}`);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // ── Local-only endpoints (not Vercel serverless) ──
    // Reject non-loopback requests to /local/* endpoints
    const clientIP = req.socket.remoteAddress;
    if (pathname.startsWith('/local/') && !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(clientIP)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Local-only endpoint' }));
        return;
    }

    // SSE endpoint for compliance fetch progress
    if (pathname === '/local/compliance-progress') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });
        res.write('data: ' + JSON.stringify(global.__complianceProgress) + '\n\n');
        const interval = setInterval(() => {
            try {
                res.write('data: ' + JSON.stringify(global.__complianceProgress) + '\n\n');
                if (global.__complianceProgress.phase === 'done' || global.__complianceProgress.phase === 'idle') {
                    clearInterval(interval);
                    res.end();
                }
            } catch (e) { clearInterval(interval); }
        }, 300);
        req.on('close', () => clearInterval(interval));
        return;
    }

    // Simple file-backed persistence endpoints
    const LOCAL_ENDPOINTS = {
        '/local/cgl-state':      { file: 'cgl-state.json' },
        '/local/cgl-cache':      { file: '.cgl-cache.json', maxBytes: 5242880 },
        '/local/scan-history':   { file: '.scan-history.json', defaultValue: { recentPolicies: [] } },
        '/local/email-drafts':   { file: '.email-drafts.json', defaultValue: { encrypted: null } },
        '/local/quickref-cards': { file: '.quickref-cards.json', defaultValue: { cards: [] } },
        '/local/ezlynx-schema-data': { file: 'ezlynx_schema.json', maxBytes: 5242880, defaultValue: {} },
    };

    const localCfg = LOCAL_ENDPOINTS[pathname];
    if (localCfg) {
        await handleLocalFileEndpoint(req, res, join(__dirname, localCfg.file), {
            maxBytes: localCfg.maxBytes,
            defaultValue: localCfg.defaultValue,
        });
        return;
    }

    // Export history: special handling (append + cap at 200 entries)
    if (pathname === '/local/export-history') {
        const histFile = join(__dirname, '.export-history.json');
        await handleLocalFileEndpoint(req, res, histFile, {
            defaultValue: { entries: [] },
            onPost: (body, filePath) => {
                let history = { entries: [] };
                if (existsSync(filePath)) {
                    try { history = JSON.parse(readFileSync(filePath, 'utf8')); } catch (e) {}
                }
                const entry = JSON.parse(body);
                history.entries.unshift(entry);
                history.entries = history.entries.slice(0, 200);
                return JSON.stringify(history, null, 2);
            }
        });
        return;
    }

    // ── Accounting Export (Playwright → HawkSoft) ──────────────────
    if (pathname === '/local/hawksoft-export' && req.method === 'POST') {
        try {
            const body = JSON.parse(await readBody(req));
            const outputFile = (body.output || 'hawksoft_receipts.csv').replace(/[^a-zA-Z0-9_\-.]/g, '_');
            const outputPath = join(__dirname, outputFile);
            const username = body.username || '';
            const password = body.password || '';

            // Find Python executable — prefer venv, fallback to system
            const venvPy = join(__dirname, '.venv', 'Scripts', 'python.exe');
            const pyCmd = existsSync(venvPy) ? venvPy : 'python';
            const scriptPath = join(__dirname, 'python_backend', 'hawksoft_export.py');

            if (!existsSync(scriptPath)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'hawksoft_export.py not found' }));
                return;
            }

            const args = [scriptPath, '--output', outputPath];
            if (username) args.push('--username', username);
            if (password) args.push('--password', password);

            const proc = spawn(pyCmd, args, {
                stdio: ['inherit', 'pipe', 'pipe'],
                cwd: __dirname,
                detached: false
            });

            let stdout = '', stderr = '';
            proc.stdout.on('data', d => { stdout += d.toString(); });
            proc.stderr.on('data', d => { stderr += d.toString(); });

            // Send immediate response that the process was launched
            // The Python script opens a browser for manual login, so it runs async
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                ok: true,
                message: 'Export process launched — browser will open for login.',
                pid: proc.pid,
                outputFile
            }));

            proc.on('close', (code) => {
                console.log(`[Accounting Export] Process exited with code ${code}`);
                if (stdout) console.log(`[Accounting Export] stdout: ${stdout.slice(-500)}`);
                if (stderr) console.error(`[Accounting Export] stderr: ${stderr.slice(-500)}`);
            });

        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    if (pathname === '/local/hawksoft-export/status' && req.method === 'GET') {
        // Check if the output file exists (simple poll for completion)
        const outputFile = (new URL(req.url, 'http://localhost').searchParams.get('file') || 'hawksoft_receipts.csv').replace(/[^a-zA-Z0-9_\-.]/g, '_');
        const outputPath = join(__dirname, outputFile);
        const exists = existsSync(outputPath);
        let size = 0;
        if (exists) {
            size = statSync(outputPath).size;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ exists, file: outputFile, size }));
        return;
    }

    // ── Trust Report Generation (CSV → formatted Excel) ──────────
    if (pathname === '/local/trust-report' && req.method === 'POST') {
        try {
            const body = JSON.parse(await readBody(req));
            const inputFile = (body.input || 'hawksoft_receipts.csv').replace(/[^a-zA-Z0-9_\-.]/g, '_');
            const outputFile = (body.output || 'Trust_Deposit_Report.xlsx').replace(/[^a-zA-Z0-9_\-.]/g, '_');
            const inputPath = join(__dirname, inputFile);
            const outputPath = join(__dirname, outputFile);

            if (!existsSync(inputPath)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `${inputFile} not found. Run the export first.` }));
                return;
            }

            const venvPy = join(__dirname, '.venv', 'Scripts', 'python.exe');
            const pyCmd = existsSync(venvPy) ? venvPy : 'python';
            const scriptPath = join(__dirname, 'python_backend', 'trust_accountant.py');

            if (!existsSync(scriptPath)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'trust_accountant.py not found' }));
                return;
            }

            const proc = spawn(pyCmd, [scriptPath, '--input', inputPath, '--output', outputPath], {
                stdio: ['ignore', 'pipe', 'pipe'],
                cwd: __dirname
            });

            let stdout = '', stderr = '';
            proc.stdout.on('data', d => { stdout += d.toString(); });
            proc.stderr.on('data', d => { stderr += d.toString(); });

            proc.on('close', (code) => {
                if (code === 0) {
                    const size = existsSync(outputPath) ? statSync(outputPath).size : 0;
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        ok: true,
                        output: outputFile,
                        size,
                        log: stdout.trim()
                    }));
                } else {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: 'Report generation failed',
                        log: (stderr || stdout).trim(),
                        code
                    }));
                }
            });

            proc.on('error', (err) => {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            });

        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // ── EZLynx Schema Scraper (launches Playwright) ──────────────
    if (pathname === '/local/ezlynx-schema' && req.method === 'POST') {
        try {
            const venvPy = join(__dirname, '.venv', 'Scripts', 'python.exe');
            const pyCmd = existsSync(venvPy) ? venvPy : 'python';
            const scriptPath = join(__dirname, 'python_backend', 'scrape_ezlynx_schema.py');
            const outputPath = join(__dirname, 'ezlynx_schema.json');

            if (!existsSync(scriptPath)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'scrape_ezlynx_schema.py not found' }));
                return;
            }

            const proc = spawn(pyCmd, [scriptPath, '--output', outputPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: __dirname,
                detached: false
            });
            // No stdin needed — controls are injected into the browser page
            proc.stdin.end();

            let stdout = '', stderr = '';
            proc.stdout.on('data', d => { stdout += d.toString(); });
            proc.stderr.on('data', d => { stderr += d.toString(); });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                ok: true,
                message: 'Schema scraper launched — log in and navigate to the form.',
                pid: proc.pid
            }));

            proc.on('close', (code) => {
                console.log(`[EZLynx Schema] Process exited with code ${code}`);
                if (stdout) console.log(`[EZLynx Schema] stdout: ${stdout.slice(-500)}`);
                if (stderr) console.error(`[EZLynx Schema] stderr: ${stderr.slice(-500)}`);
            });

        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // ── EZLynx Schema Status (check if schema file exists) ──────
    if (pathname === '/local/ezlynx-schema' && req.method === 'GET') {
        const schemaPath = join(__dirname, 'ezlynx_schema.json');
        const exists = existsSync(schemaPath);
        let dropdownCount = 0, lastModified = null, pages = null;
        if (exists) {
            try {
                const stat = statSync(schemaPath);
                lastModified = stat.mtime.toISOString();
                const data = JSON.parse(readFileSync(schemaPath, 'utf8'));
                // Extract page metadata if present
                if (data._pages) {
                    pages = data._pages;
                }
                // Count only actual dropdowns (skip _pages and _meta keys)
                dropdownCount = Object.keys(data).filter(k => !k.startsWith('_')).length;
            } catch (e) { /* corrupt */ }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ exists, dropdownCount, lastModified, pages }));
        return;
    }

    // ── EZLynx Form Filler (launches Playwright with client data) ─
    if (pathname === '/local/ezlynx-fill' && req.method === 'POST') {
        try {
            const body = JSON.parse(await readBody(req));
            const clientData = body.clientData || body;

            const venvPy = join(__dirname, '.venv', 'Scripts', 'python.exe');
            const pyCmd = existsSync(venvPy) ? venvPy : 'python';
            const scriptPath = join(__dirname, 'python_backend', 'ezlynx_filler.py');
            const tempClientPath = join(__dirname, 'python_backend', 'temp_client_data.json');
            const schemaPath = join(__dirname, 'ezlynx_schema.json');

            if (!existsSync(scriptPath)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'ezlynx_filler.py not found' }));
                return;
            }

            // Save client data to temp file
            writeFileSync(tempClientPath, JSON.stringify(clientData, null, 2), 'utf8');

            const args = [scriptPath, '--client', tempClientPath];
            if (existsSync(schemaPath)) {
                args.push('--schema', schemaPath);
            }

            const proc = spawn(pyCmd, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: __dirname,
                detached: false
            });
            // No stdin needed — controls are injected into the browser page
            proc.stdin.end();

            let stdout = '', stderr = '';
            proc.stdout.on('data', d => { stdout += d.toString(); });
            proc.stderr.on('data', d => { stderr += d.toString(); });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                ok: true,
                message: 'EZLynx filler launched — browser will open for login.',
                pid: proc.pid
            }));

            proc.on('close', (code) => {
                console.log(`[EZLynx Fill] Process exited with code ${code}`);
                if (stdout) console.log(`[EZLynx Fill] stdout: ${stdout.slice(-500)}`);
                if (stderr) console.error(`[EZLynx Fill] stderr: ${stderr.slice(-500)}`);
                // Clean up temp file
                try { unlinkSync(tempClientPath); } catch (e) { /* ok */ }
            });

        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    // API routes: /api/* → run serverless handler
    // Serve non-.js, non-sensitive files under /api/ as static
    if (pathname.startsWith('/api/') && !pathname.endsWith('.js')) {
        // Never serve config files that may contain secrets
        const basename = pathname.split('/').pop();
        if (basename === 'config.json' || basename.startsWith('.')) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Forbidden' }));
            return;
        }
        const staticApiPath = join(__dirname, pathname);
        if (existsSync(staticApiPath)) {
            const ext = extname(pathname);
            const mimeTypes = { '.json': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml' };
            const contentType = mimeTypes[ext] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(readFileSync(staticApiPath));
            return;
        }
    }
    if (pathname.startsWith('/api/')) {
        // Strip .js extension if present in the URL
        const routePath = pathname.replace(/\.js$/, '');
        await handleApiRoute(routePath, req, res);
        return;
    }

    // Static files
    const filePath = pathname === '/' ? '/index.html' : pathname;
    serveStatic(filePath, res);
});

server.listen(PORT, () => {
    const hasHawkSoft = !!(process.env.HAWKSOFT_CLIENT_ID && process.env.HAWKSOFT_CLIENT_SECRET && process.env.HAWKSOFT_AGENCY_ID);
    const hasGemini = !!(process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY);

    console.log('');
    console.log('  ┌─────────────────────────────────────────────────┐');
    console.log(`  │  🚀 Altech Local Server                         │`);
    console.log(`  │  http://localhost:${PORT}                          │`);
    console.log('  ├─────────────────────────────────────────────────┤');
    console.log(`  │  HawkSoft API: ${hasHawkSoft ? '✅ Configured' : '❌ Missing — fill .env'}        │`);
    console.log(`  │  Gemini AI:    ${hasGemini ? '✅ Configured' : '❌ Missing — fill .env'}        │`);
    console.log(`  │  Static files: ✅ Serving from ./               │`);
    console.log(`  │  API routes:   ✅ /api/* → ./api/*.js           │`);
    console.log('  └─────────────────────────────────────────────────┘');
    console.log('');
    if (!hasHawkSoft) {
        console.log('  ⚠️  To enable CGL Dashboard:');
        console.log('     Edit .env and add your HawkSoft credentials:');
        console.log('     HAWKSOFT_CLIENT_ID=your_client_id');
        console.log('     HAWKSOFT_CLIENT_SECRET=your_client_secret');
        console.log('     HAWKSOFT_AGENCY_ID=your_agency_id');
        console.log('');
    }
});
