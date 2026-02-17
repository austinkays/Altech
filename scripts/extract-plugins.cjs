/**
 * extract-plugins.js
 * 
 * Extracts inline <script> plugin blocks from index.html into separate JS files.
 * Each plugin gets its own file in js/. The inline script block is replaced with
 * a <script src="js/filename.js"></script> reference.
 * 
 * Usage: node scripts/extract-plugins.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const JS_DIR = path.join(ROOT, 'js');

// Read index.html
let html = fs.readFileSync(INDEX, 'utf8');
const lines = html.split('\n');

// Define extraction targets: each plugin's script block
// Format: { name, filename, startMarker, endMarker }
// We identify each script block by unique content inside it
const plugins = [
    {
        name: 'CryptoHelper + safeSave',
        filename: 'crypto-helper.js',
        // This is in the main <script> block — we need special handling
        // We'll extract just the CryptoHelper and safeSave from the main script
        type: 'inline-extract',
        startPattern: /\/\/ 🔒 Encryption Utilities/,
        endPattern: /^\s*const App = \{/,
    },
    {
        name: 'COI',
        filename: 'coi.js',
        type: 'inline-extract',
        startPattern: /\/\/ COI Generator Object/,
        endPattern: /\/\/ Prospect Investigator Object/,
    },
    {
        name: 'ProspectInvestigator',
        filename: 'prospect.js',
        type: 'inline-extract',
        startPattern: /\/\/ Prospect Investigator Object/,
        endPattern: /\/\/ Expose App globally/,
    },
    {
        name: 'ComplianceDashboard',
        filename: 'compliance-dashboard.js',
        type: 'script-block',
        contentMarker: 'const ComplianceDashboard = {',
    },
    {
        name: 'PolicyQA',
        filename: 'policy-qa.js',
        type: 'script-block',
        contentMarker: 'const PolicyQA = {',
    },
    {
        name: 'EmailComposer',
        filename: 'email-composer.js',
        type: 'script-block',
        contentMarker: 'const EmailComposer = {',
    },
    {
        name: 'QuickRef',
        filename: 'quick-ref.js',
        type: 'script-block',
        contentMarker: 'const QuickRef = {',
    },
    {
        name: 'AccountingExport',
        filename: 'accounting-export.js',
        type: 'script-block',
        contentMarker: 'const AccountingExport = {',
    },
    {
        name: 'EZLynxTool',
        filename: 'ezlynx-tool.js',
        type: 'script-block',
        contentMarker: 'const EZLynxTool = {',
    },
    {
        name: 'QuoteCompare',
        filename: 'quote-compare.js',
        type: 'script-block',
        contentMarker: 'const QuoteCompare = {',
    },
    {
        name: 'DataBackup + globals',
        filename: 'data-backup.js',
        type: 'script-block',
        contentMarker: 'const DataBackup = {',
    },
];

// Find all <script> blocks (inline, not src)
function findScriptBlocks(lines) {
    const blocks = [];
    let inScript = false;
    let startLine = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!inScript && line.match(/<script>/) && !line.match(/src=/)) {
            inScript = true;
            startLine = i;
        }
        if (inScript && line.match(/<\/script>/)) {
            blocks.push({
                startLine,
                endLine: i,
                // Content is lines between <script> and </script>
                content: lines.slice(startLine + 1, i).join('\n'),
            });
            inScript = false;
        }
    }
    return blocks;
}

const scriptBlocks = findScriptBlocks(lines);
console.log(`Found ${scriptBlocks.length} inline script blocks`);

// Track replacements to apply to html
const replacements = []; // { startLine, endLine, newContent }

// Process each plugin
for (const plugin of plugins) {
    console.log(`\nProcessing: ${plugin.name}`);

    if (plugin.type === 'script-block') {
        // Find the script block containing this plugin's marker
        const block = scriptBlocks.find(b => b.content.includes(plugin.contentMarker));
        if (!block) {
            console.error(`  ❌ Could not find script block containing "${plugin.contentMarker}"`);
            continue;
        }
        console.log(`  Found at lines ${block.startLine + 1}-${block.endLine + 1}`);

        // Dedent the content (remove common leading whitespace)
        const contentLines = block.content.split('\n');
        const nonEmptyLines = contentLines.filter(l => l.trim().length > 0);
        const minIndent = nonEmptyLines.reduce((min, l) => {
            const indent = l.match(/^(\s*)/)[1].length;
            return Math.min(min, indent);
        }, Infinity);
        const dedented = contentLines.map(l => l.slice(minIndent)).join('\n').trim();

        // Add file header
        const fileContent = `// ${plugin.name} - Extracted from index.html\n// Do not edit this section in index.html; edit this file instead.\n\n${dedented}\n`;

        // Write JS file
        const filePath = path.join(JS_DIR, plugin.filename);
        if (DRY_RUN) {
            console.log(`  [DRY RUN] Would write ${filePath} (${fileContent.length} bytes)`);
        } else {
            fs.writeFileSync(filePath, fileContent, 'utf8');
            console.log(`  ✅ Wrote ${plugin.filename} (${fileContent.length} bytes)`);
        }

        // Calculate the indentation of the <script> tag
        const scriptTagLine = lines[block.startLine];
        const indent = scriptTagLine.match(/^(\s*)/)[1];

        // Replace inline script with src reference
        replacements.push({
            startLine: block.startLine,
            endLine: block.endLine,
            newContent: `${indent}<script src="js/${plugin.filename}"></script>`,
        });

    } else if (plugin.type === 'inline-extract') {
        // Extract a portion from inside the main script block
        // Find the main script block (the large one containing App)
        const mainBlock = scriptBlocks.find(b => b.content.includes('const App = {'));
        if (!mainBlock) {
            console.error(`  ❌ Could not find main script block`);
            continue;
        }

        // Find start and end lines within the main block
        let extractStart = -1;
        let extractEnd = -1;

        for (let i = mainBlock.startLine; i <= mainBlock.endLine; i++) {
            if (extractStart === -1 && plugin.startPattern.test(lines[i])) {
                extractStart = i;
            }
            if (extractStart !== -1 && extractEnd === -1 && plugin.endPattern.test(lines[i])) {
                extractEnd = i;
                break;
            }
        }

        if (extractStart === -1 || extractEnd === -1) {
            console.error(`  ❌ Could not find boundaries for "${plugin.name}" (start: ${extractStart}, end: ${extractEnd})`);
            continue;
        }

        console.log(`  Found at lines ${extractStart + 1}-${extractEnd}`);

        // Extract content (up to but not including the end pattern line)
        const extracted = lines.slice(extractStart, extractEnd).join('\n');

        // Dedent
        const contentLines = extracted.split('\n');
        const nonEmptyLines = contentLines.filter(l => l.trim().length > 0);
        const minIndent = nonEmptyLines.reduce((min, l) => {
            const indent = l.match(/^(\s*)/)[1].length;
            return Math.min(min, indent);
        }, Infinity);
        const dedented = contentLines.map(l => l.slice(minIndent)).join('\n').trim();

        const fileContent = `// ${plugin.name} - Extracted from index.html\n// Do not edit this section in index.html; edit this file instead.\n\n${dedented}\n`;

        const filePath = path.join(JS_DIR, plugin.filename);
        if (DRY_RUN) {
            console.log(`  [DRY RUN] Would write ${filePath} (${fileContent.length} bytes)`);
        } else {
            fs.writeFileSync(filePath, fileContent, 'utf8');
            console.log(`  ✅ Wrote ${plugin.filename} (${fileContent.length} bytes)`);
        }

        // Mark these lines for removal from the main script block
        // We'll replace them with a <script src> reference comment
        const lineIndent = lines[extractStart].match(/^(\s*)/)[1];
        replacements.push({
            startLine: extractStart,
            endLine: extractEnd,
            newContent: `${lineIndent}// [Extracted to js/${plugin.filename}]`,
            isInlineExtract: true,
        });
    }
}

// Apply replacements to html (process in reverse order to preserve line numbers)
replacements.sort((a, b) => b.startLine - a.startLine);

console.log(`\nApplying ${replacements.length} replacements...`);

for (const rep of replacements) {
    if (rep.isInlineExtract) {
        // Replace extracted lines with a comment marker
        const count = rep.endLine - rep.startLine;
        console.log(`  Replacing lines ${rep.startLine + 1}-${rep.endLine} with marker comment (${count} lines removed)`);
        if (!DRY_RUN) {
            lines.splice(rep.startLine, count, rep.newContent);
        }
    } else {
        // Replace script block with src reference
        const count = rep.endLine - rep.startLine + 1;
        console.log(`  Replacing lines ${rep.startLine + 1}-${rep.endLine + 1} with <script src="...">`);
        if (!DRY_RUN) {
            lines.splice(rep.startLine, count, rep.newContent);
        }
    }
}

// Write updated index.html
if (!DRY_RUN) {
    // Insert <script src> tags for inline-extracted plugins
    // CryptoHelper goes BEFORE the main <script> (App needs it)
    // COI and ProspectInvestigator go AFTER the main </script> (they need App)
    const inlinePlugins = plugins.filter(p => p.type === 'inline-extract');
    
    // Find main script tag (the one with the App object markers)
    const mainScriptStart = lines.findIndex((l, i) => {
        if (!l.includes('<script>') || l.includes('src=')) return false;
        // Check if this script block contains App
        for (let j = i; j < Math.min(i + 10, lines.length); j++) {
            if (lines[j].includes('[Extracted to js/crypto-helper.js]') || lines[j].includes('const App = {')) return true;
        }
        return false;
    });

    if (mainScriptStart !== -1) {
        const indent = lines[mainScriptStart].match(/^(\s*)/)[1];
        
        // Find the end of the main script (the matching </script>)
        let mainScriptEnd = -1;
        let depth = 0;
        for (let i = mainScriptStart; i < lines.length; i++) {
            if (lines[i].includes('<script>') && !lines[i].includes('src=')) depth++;
            if (lines[i].includes('</script>')) {
                depth--;
                if (depth === 0) { mainScriptEnd = i; break; }
            }
        }

        // Insert COI and Prospect AFTER main script end
        const afterPlugins = inlinePlugins.filter(p => p.filename !== 'crypto-helper.js');
        if (afterPlugins.length > 0 && mainScriptEnd !== -1) {
            const afterTags = afterPlugins.map(p => `${indent}<script src="js/${p.filename}"></script>`);
            lines.splice(mainScriptEnd + 1, 0, ...afterTags);
            console.log(`  Inserted ${afterTags.length} <script src> tags after main script (line ${mainScriptEnd + 2})`);
        }

        // Insert CryptoHelper BEFORE main script
        const beforePlugins = inlinePlugins.filter(p => p.filename === 'crypto-helper.js');
        if (beforePlugins.length > 0) {
            const beforeTags = beforePlugins.map(p => `${indent}<script src="js/${p.filename}"></script>`);
            lines.splice(mainScriptStart, 0, ...beforeTags);
            console.log(`  Inserted ${beforeTags.length} <script src> tags before main script (line ${mainScriptStart + 1})`);
        }
    } else {
        console.error('  ❌ Could not find main script block for <script src> insertion');
    }

    const newHtml = lines.join('\n');
    // Backup original
    const backupPath = path.join(ROOT, 'index.html.bak');
    fs.copyFileSync(INDEX, backupPath);
    console.log(`\n📦 Backup saved to index.html.bak`);

    fs.writeFileSync(INDEX, newHtml, 'utf8');
    const oldSize = html.length;
    const newSize = newHtml.length;
    console.log(`\n✅ index.html updated: ${oldSize.toLocaleString()} → ${newSize.toLocaleString()} bytes (${((1 - newSize/oldSize) * 100).toFixed(1)}% reduction)`);
} else {
    console.log(`\n[DRY RUN] No files modified.`);
}

// Summary
console.log('\n=== Extraction Summary ===');
plugins.forEach(p => {
    const filePath = path.join(JS_DIR, p.filename);
    const exists = !DRY_RUN && fs.existsSync(filePath);
    const size = exists ? fs.statSync(filePath).size : '?';
    console.log(`  ${exists ? '✅' : '📝'} js/${p.filename} (${typeof size === 'number' ? (size / 1024).toFixed(1) + ' KB' : size})`);
});
