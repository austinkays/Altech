/**
 * Build script: copies web assets into dist/ for Tauri production builds.
 * Tauri's frontendDist points to ../dist (relative to src-tauri/).
 * This avoids bundling src-tauri/target/ which causes cargo lock conflicts.
 */

import { cpSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dist = join(root, 'dist');

// Clean
if (existsSync(dist)) rmSync(dist, { recursive: true });
mkdirSync(dist, { recursive: true });

// Copy web assets
const assets = [
    'index.html',
    'css',
    'js',
    'plugins',
    'Resources',
];

for (const item of assets) {
    const src = join(root, item);
    const dest = join(dist, item);
    if (existsSync(src)) {
        cpSync(src, dest, { recursive: true });
        console.log(`  ✓ ${item}`);
    } else {
        console.warn(`  ⚠ ${item} not found, skipping`);
    }
}

console.log('\n✅ dist/ ready for Tauri build');
