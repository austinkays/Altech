#!/usr/bin/env node
/**
 * audit-docs.js — Checks AGENTS.md, .github/copilot-instructions.md, and QUICKREF.md
 * for stale line counts, test counts, and file totals.
 *
 * Usage:  npm run audit-docs
 *         node scripts/audit-docs.js
 *
 * Exit code 0 = all good, 1 = drift detected (prints what needs updating)
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// ── Helpers ──────────────────────────────────────────────────────────────────

function countLines(filePath) {
    try {
        return readFileSync(filePath, 'utf8').split('\n').length;
    } catch { return 0; }
}

function getFilesInDir(dir, ext) {
    try {
        return readdirSync(dir)
            .filter(f => f.endsWith(ext) && statSync(join(dir, f)).isFile())
            .map(f => ({ name: f, lines: countLines(join(dir, f)) }));
    } catch { return []; }
}

function readDoc(relPath) {
    try {
        return readFileSync(join(ROOT, relPath), 'utf8');
    } catch { return ''; }
}

// Extract "(N lines)" or "(N+ lines)" from doc text for a given filename
function extractDocLineCount(docText, filename) {
    // Match patterns like "filename ... (1,234 lines)" or "(~1,234 lines)"
    const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${escaped}[^\\n]*?[~(]([\\d,]+)\\+?\\s*lines`, 'i');
    const m = docText.match(re);
    if (m) return parseInt(m[1].replace(/,/g, ''), 10);
    return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const DRIFT_THRESHOLD = 20; // lines of drift before flagging (ignores tiny edits)

console.log('──────────────────────────────────────────');
console.log('  Altech Documentation Audit');
console.log('──────────────────────────────────────────\n');

const agents = readDoc('AGENTS.md');
const copilot = readDoc('.github/copilot-instructions.md');
const quickref = readDoc('QUICKREF.md');

if (!agents) {
    console.error('ERROR: AGENTS.md not found at project root');
    process.exit(1);
}

let drifts = [];

// ── 1. Check JS file line counts in AGENTS.md ───────────────────────────────

console.log('Checking js/ line counts...');
const jsFiles = getFilesInDir(join(ROOT, 'js'), '.js');
for (const f of jsFiles) {
    const docCount = extractDocLineCount(agents, f.name);
    if (docCount !== null && Math.abs(f.lines - docCount) > DRIFT_THRESHOLD) {
        drifts.push({
            file: `js/${f.name}`,
            documented: docCount,
            actual: f.lines,
            delta: f.lines - docCount,
            doc: 'AGENTS.md'
        });
    }
}

// ── 2. Check CSS file line counts in AGENTS.md ──────────────────────────────

console.log('Checking css/ line counts...');
const cssFiles = getFilesInDir(join(ROOT, 'css'), '.css');
for (const f of cssFiles) {
    const docCount = extractDocLineCount(agents, f.name);
    if (docCount !== null && Math.abs(f.lines - docCount) > DRIFT_THRESHOLD) {
        drifts.push({
            file: `css/${f.name}`,
            documented: docCount,
            actual: f.lines,
            delta: f.lines - docCount,
            doc: 'AGENTS.md'
        });
    }
}

// ── 3. Check plugin HTML line counts in AGENTS.md ───────────────────────────

console.log('Checking plugins/ line counts...');
const pluginFiles = getFilesInDir(join(ROOT, 'plugins'), '.html');
for (const f of pluginFiles) {
    const docCount = extractDocLineCount(agents, f.name);
    if (docCount !== null && Math.abs(f.lines - docCount) > DRIFT_THRESHOLD) {
        drifts.push({
            file: `plugins/${f.name}`,
            documented: docCount,
            actual: f.lines,
            delta: f.lines - docCount,
            doc: 'AGENTS.md'
        });
    }
}

// ── 4. Check summary totals ─────────────────────────────────────────────────

console.log('Checking summary totals...');

const jsTotalActual = jsFiles.reduce((s, f) => s + f.lines, 0);
const cssTotalActual = cssFiles.reduce((s, f) => s + f.lines, 0);
const pluginTotalActual = pluginFiles.reduce((s, f) => s + f.lines, 0);

// Check totals in overview table
const cssTotalMatch = agents.match(/css\/[^~]*?~([\d,]+)\s*lines total/i);
const jsTotalMatch = agents.match(/js\/[^~]*?~([\d,]+)\s*lines total/i);
const pluginTotalMatch = agents.match(/plugins\/[^~]*?~([\d,]+)\s*lines total/i);

if (cssTotalMatch) {
    const docTotal = parseInt(cssTotalMatch[1].replace(/,/g, ''), 10);
    if (Math.abs(cssTotalActual - docTotal) > 200) {
        drifts.push({ file: 'CSS total (overview table)', documented: docTotal, actual: cssTotalActual, delta: cssTotalActual - docTotal, doc: 'AGENTS.md' });
    }
}
if (jsTotalMatch) {
    const docTotal = parseInt(jsTotalMatch[1].replace(/,/g, ''), 10);
    if (Math.abs(jsTotalActual - docTotal) > 200) {
        drifts.push({ file: 'JS total (overview table)', documented: docTotal, actual: jsTotalActual, delta: jsTotalActual - docTotal, doc: 'AGENTS.md' });
    }
}
if (pluginTotalMatch) {
    const docTotal = parseInt(pluginTotalMatch[1].replace(/,/g, ''), 10);
    if (Math.abs(pluginTotalActual - docTotal) > 200) {
        drifts.push({ file: 'Plugins total (overview table)', documented: docTotal, actual: pluginTotalActual, delta: pluginTotalActual - docTotal, doc: 'AGENTS.md' });
    }
}

// ── 5. Check test suite count ────────────────────────────────────────────────

console.log('Checking test suite count...');
const testFiles = getFilesInDir(join(ROOT, 'tests'), '.test.js');
const testCount = testFiles.length;

for (const [docName, docText] of [['AGENTS.md', agents], ['copilot-instructions.md', copilot], ['QUICKREF.md', quickref]]) {
    const suiteMatch = docText.match(/(\d+)\s*(?:test\s*)?suites?/i);
    if (suiteMatch) {
        const docSuites = parseInt(suiteMatch[1], 10);
        if (docSuites !== testCount) {
            drifts.push({ file: 'Test suite count', documented: docSuites, actual: testCount, delta: testCount - docSuites, doc: docName });
        }
    }
}

// ── 6. Check file counts (number of JS/CSS/plugin files) ────────────────────

console.log('Checking file counts...');
const jsCountMatch = agents.match(/(\d+)\s*modules?\s*in\s*`?js/i);
if (jsCountMatch) {
    const docCount = parseInt(jsCountMatch[1], 10);
    if (docCount !== jsFiles.length) {
        drifts.push({ file: 'JS module count', documented: docCount, actual: jsFiles.length, delta: jsFiles.length - docCount, doc: 'AGENTS.md' });
    }
}

const cssCountMatch = agents.match(/(\d+)\s*(?:stylesheets?|files?)\s*in\s*`?css/i);
if (cssCountMatch) {
    const docCount = parseInt(cssCountMatch[1], 10);
    if (docCount !== cssFiles.length) {
        drifts.push({ file: 'CSS file count', documented: docCount, actual: cssFiles.length, delta: cssFiles.length - docCount, doc: 'AGENTS.md' });
    }
}

const pluginCountMatch = agents.match(/(\d+)\s*HTML\s*templates?\s*in\s*`?plugins/i);
if (pluginCountMatch) {
    const docCount = parseInt(pluginCountMatch[1], 10);
    if (docCount !== pluginFiles.length) {
        drifts.push({ file: 'Plugin HTML count', documented: docCount, actual: pluginFiles.length, delta: pluginFiles.length - docCount, doc: 'AGENTS.md' });
    }
}

// ── 7. Check Last Updated date ───────────────────────────────────────────────

console.log('Checking last-updated dates...');
const today = new Date();
const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

for (const [docName, docText] of [['AGENTS.md', agents], ['copilot-instructions.md', copilot]]) {
    const dateMatch = docText.match(/Last\s*updated[:\s]*(\w+\s+\d{1,2},?\s+\d{4})/i);
    if (dateMatch) {
        const docDate = new Date(dateMatch[1]);
        const daysDiff = Math.floor((today - docDate) / (1000 * 60 * 60 * 24));
        if (daysDiff > 7) {
            drifts.push({
                file: `Last updated date`,
                documented: dateMatch[1],
                actual: `${monthNames[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`,
                delta: `${daysDiff} days stale`,
                doc: docName
            });
        }
    }
}

// ── Report ───────────────────────────────────────────────────────────────────

console.log('');

if (drifts.length === 0) {
    console.log('✅ All documentation is up to date!\n');
    console.log(`   JS:      ${jsFiles.length} files, ${jsTotalActual.toLocaleString()} lines`);
    console.log(`   CSS:     ${cssFiles.length} files, ${cssTotalActual.toLocaleString()} lines`);
    console.log(`   Plugins: ${pluginFiles.length} files, ${pluginTotalActual.toLocaleString()} lines`);
    console.log(`   Tests:   ${testCount} suites\n`);
    process.exit(0);
} else {
    console.log(`⚠️  Found ${drifts.length} documentation drift(s):\n`);
    for (const d of drifts) {
        const delta = typeof d.delta === 'number' ? (d.delta > 0 ? `+${d.delta}` : d.delta) : d.delta;
        console.log(`  📄 ${d.doc} → ${d.file}`);
        console.log(`     Documented: ${typeof d.documented === 'number' ? d.documented.toLocaleString() : d.documented}`);
        console.log(`     Actual:     ${typeof d.actual === 'number' ? d.actual.toLocaleString() : d.actual}`);
        console.log(`     Delta:      ${delta}\n`);
    }
    console.log('Fix these in AGENTS.md, .github/copilot-instructions.md, and/or QUICKREF.md.\n');
    process.exit(1);
}
