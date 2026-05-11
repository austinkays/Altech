#!/usr/bin/env node
// scripts/bump-sw-version.mjs — Bump the CACHE_VERSION string in sw.js.
//
// Used by .githooks/pre-commit to auto-bump the service-worker cache when
// any source-file change is staged. Without this, deploying JS or CSS without
// bumping CACHE_VERSION means users on the old service-worker continue to
// serve stale cached assets until they hard-refresh — see LAUNCH_PREP §C6.
//
// Idempotent: re-running on an already-bumped sw.js will bump again. The
// hook only invokes this when a bump is actually needed.
//
// Stand-alone usage:
//   node scripts/bump-sw-version.mjs
//   node scripts/bump-sw-version.mjs --dry-run   # print but don't write

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SW_PATH = path.resolve(__dirname, '..', 'sw.js');

const DRY = process.argv.includes('--dry-run');

function main() {
    let src;
    try {
        src = readFileSync(SW_PATH, 'utf8');
    } catch (e) {
        console.error(`[bump-sw] Could not read ${SW_PATH}:`, e.message);
        process.exit(1);
    }
    // Match: const CACHE_VERSION = 'altech-v<N>'; — N is one or more digits.
    const re = /const\s+CACHE_VERSION\s*=\s*['"]altech-v(\d+)['"]/;
    const match = src.match(re);
    if (!match) {
        console.error('[bump-sw] CACHE_VERSION pattern not found in sw.js. Aborting.');
        process.exit(1);
    }
    const currentN = Number(match[1]);
    const nextN = currentN + 1;
    const updated = src.replace(re, `const CACHE_VERSION = 'altech-v${nextN}'`);
    if (DRY) {
        console.log(`[bump-sw] (dry-run) would bump altech-v${currentN} → altech-v${nextN}`);
        return;
    }
    writeFileSync(SW_PATH, updated);
    console.log(`[bump-sw] altech-v${currentN} → altech-v${nextN}`);
}

main();
