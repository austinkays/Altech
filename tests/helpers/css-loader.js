const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Read all `css/components-*.css` shards as a single string.
 *
 * The monolithic `css/components.css` was split into focused files
 * (components-cards.css, components-inputs.css, etc.) so developers can
 * navigate and edit them more easily. Tests that grep the "components"
 * stylesheet should use this helper — it concatenates every shard in a
 * stable order so content-based assertions still hold.
 */
function readComponentsCss() {
  const cssDir = path.join(ROOT, 'css');
  const files = fs.readdirSync(cssDir)
    .filter(f => f.startsWith('components-') && f.endsWith('.css'))
    .sort();
  return files.map(f => fs.readFileSync(path.join(cssDir, f), 'utf8')).join('\n\n');
}

/**
 * Read all `css/intake-assist-*.css` shards as a single string.
 * Same rationale as readComponentsCss — intake-assist.css was split.
 */
function readIntakeAssistCss() {
  const cssDir = path.join(ROOT, 'css');
  const files = fs.readdirSync(cssDir)
    .filter(f => f.startsWith('intake-assist-') && f.endsWith('.css'))
    .sort();
  return files.map(f => fs.readFileSync(path.join(cssDir, f), 'utf8')).join('\n\n');
}

/**
 * Read all `css/compliance-*.css` shards as a single string.
 */
function readComplianceCss() {
  const cssDir = path.join(ROOT, 'css');
  const files = fs.readdirSync(cssDir)
    .filter(f => f.startsWith('compliance-') && f.endsWith('.css'))
    .sort();
  return files.map(f => fs.readFileSync(path.join(cssDir, f), 'utf8')).join('\n\n');
}

module.exports = { readComponentsCss, readIntakeAssistCss, readComplianceCss };
