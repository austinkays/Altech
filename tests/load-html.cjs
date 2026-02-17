/**
 * Test helper: loads index.html and inlines all external <script src="..."> tags.
 * JSDOM doesn't load external scripts by default, so this helper reads the
 * referenced JS files and replaces `<script src="path">` with `<script>content</script>`.
 * 
 * Usage:
 *   const { loadHTML } = require('./load-html.cjs');
 *   const html = loadHTML();
 *   const dom = new JSDOM(html, { runScripts: 'dangerously' });
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function loadHTML(indexPath) {
    const htmlPath = indexPath || path.join(ROOT, 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');

    // Replace local <script src="..."></script> with inlined content
    // Skip external URLs (CDN scripts like jszip, jspdf, pdf.js)
    html = html.replace(/<script\s+src="([^"]+)"\s*><\/script>/g, (match, src) => {
        // Skip external URLs
        if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
            return match; // Leave CDN scripts as-is (JSDOM won't load them anyway)
        }

        // Resolve the path relative to index.html's directory
        const scriptPath = path.resolve(path.dirname(htmlPath), src);
        
        if (!fs.existsSync(scriptPath)) {
            console.warn(`[load-html] External script not found: ${src} (resolved to ${scriptPath})`);
            return `<script>/* External script not found: ${src} */</script>`;
        }

        const content = fs.readFileSync(scriptPath, 'utf8');
        return `<script>\n${content}\n</script>`;
    });

    return html;
}

module.exports = { loadHTML };
