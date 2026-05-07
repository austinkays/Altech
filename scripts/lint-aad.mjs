#!/usr/bin/env node
// scripts/lint-aad.mjs
//
// AAD-construction guard. AES-GCM's `additionalData` parameter binds extra
// authenticated data into the auth tag — encrypt and decrypt MUST pass
// byte-identical AAD or decryption fails. To prevent silent drift, AAD
// construction is centralized in two places:
//
//   - js/crypto-aad.js     (the buildAAD() helper)
//   - js/crypto-helper.js  (encrypt/decrypt wrappers that accept AAD)
//
// Any other file passing `additionalData:` to crypto.subtle.encrypt or
// .decrypt indicates a parallel AAD construction site that could drift.
// Such a file fails this lint and must instead route through
// CryptoHelper.encryptWithAAD / .decryptWithAAD.
//
// Usage:
//   node scripts/lint-aad.mjs          # exits non-zero on any violation
//   node scripts/lint-aad.mjs --json   # emits JSON report

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

// Files allowed to construct or pass AAD directly.
const ALLOW = new Set([
    'js/crypto-aad.js',
    'js/crypto-helper.js',
    // Tests for the helpers themselves are allowed to inspect AAD.
    'tests/crypto-aad.test.js',
    'tests/crypto-helper-v2.test.js',
]);

// Directories to scan. Production source + tests.
const SCAN_DIRS = ['js', 'plugins', 'api', 'tests'];

// Extensions to scan.
const EXTS = new Set(['.js', '.mjs', '.cjs', '.html']);

const PATTERN = /\badditionalData\s*:/;

async function* walk(dir) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch (e) { return; }
    for (const ent of entries) {
        const full = join(dir, ent.name);
        if (ent.isDirectory()) {
            if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
            yield* walk(full);
        } else if (ent.isFile()) {
            const dot = ent.name.lastIndexOf('.');
            if (dot === -1) continue;
            if (EXTS.has(ent.name.slice(dot))) yield full;
        }
    }
}

async function scan() {
    const violations = [];
    for (const dirName of SCAN_DIRS) {
        const root = join(ROOT, dirName);
        for await (const file of walk(root)) {
            const rel = relative(ROOT, file).split(sep).join('/');
            if (ALLOW.has(rel)) continue;

            let text;
            try { text = await readFile(file, 'utf8'); }
            catch { continue; }

            const lines = text.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
                if (PATTERN.test(lines[i])) {
                    violations.push({ file: rel, line: i + 1, text: lines[i].trim() });
                }
            }
        }
    }
    return violations;
}

const args = new Set(process.argv.slice(2));
const violations = await scan();

if (args.has('--json')) {
    process.stdout.write(JSON.stringify({ violations }, null, 2) + '\n');
    process.exit(violations.length === 0 ? 0 : 1);
}

if (violations.length === 0) {
    process.stdout.write('lint-aad: 0 violations.\n');
    process.exit(0);
}

process.stderr.write(`lint-aad: ${violations.length} violation(s) — AAD must be built via js/crypto-aad.js only.\n`);
for (const v of violations) {
    process.stderr.write(`  ${v.file}:${v.line}  ${v.text}\n`);
}
process.stderr.write('\nFix: route the call through CryptoHelper.encryptWithAAD / .decryptWithAAD,\n');
process.stderr.write('     which build AAD via CryptoAAD.buildAAD() — the single source of truth.\n');
process.exit(1);
