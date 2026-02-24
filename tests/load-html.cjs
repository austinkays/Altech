/**
 * Test helper: loads index.html, inlines all external <script src="..."> tags,
 * and injects plugin HTML from plugins/*.html files into empty plugin containers.
 * 
 * JSDOM doesn't load external scripts or support fetch() for local files,
 * so this helper pre-processes everything into a single HTML string.
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

    // ── Inline plugin HTML files into empty plugin containers ──
    // Matches: <div id="coiTool" class="plugin-container">\n        <!-- Plugin HTML loaded dynamically from plugins/ -->\n    </div>
    html = html.replace(
        /(<div\s+id="(\w+)"\s+class="plugin-container">)\s*<!--\s*Plugin HTML loaded dynamically from plugins\/\s*-->\s*(<\/div>)/g,
        (match, openTag, containerId, closeTag) => {
            // Map container IDs to plugin HTML file names
            const pluginMap = {
                coiTool: 'coi',
                prospectTool: 'prospect',
                complianceTool: 'compliance',
                qnaTool: 'qna',
                emailTool: 'email',
                quickrefTool: 'quickref',
                accountingTool: 'accounting',
                ezlynxTool: 'ezlynx',
                quoteCompareTool: 'quotecompare',
                intakeTool: 'intake-assist'
            };

            const pluginName = pluginMap[containerId];
            if (!pluginName) return match;

            const pluginPath = path.resolve(path.dirname(htmlPath), 'plugins', `${pluginName}.html`);
            if (!fs.existsSync(pluginPath)) {
                console.warn(`[load-html] Plugin HTML not found: ${pluginPath}`);
                return match;
            }

            const pluginContent = fs.readFileSync(pluginPath, 'utf8');
            return `${openTag}\n${pluginContent}\n${closeTag}`;
        }
    );

    // ── Inline external <script src="..."> tags ──
    // Skip external URLs (CDN scripts like jszip, jspdf, pdf.js)
    html = html.replace(/<script\s+src="([^"]+)"\s*><\/script>/g, (match, src) => {
        // Skip external URLs
        if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
            return match; // Leave CDN scripts as-is (JSDOM won't load them anyway)
        }

        // Strip cache-busting query params (e.g. ?v=20260217j)
        const cleanSrc = src.split('?')[0];

        // Resolve the path relative to index.html's directory
        const scriptPath = path.resolve(path.dirname(htmlPath), cleanSrc);
        
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
