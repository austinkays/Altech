/**
 * Regression coverage for the three migration-aftercare fixes shipped after
 * Austin's first real Firebase → Supabase run on May 11, 2026:
 *
 *   1. VaultMeta._toDbRow strips null values so Argon2id vaults don't send
 *      `pbkdf2_iterations: null` and trip the NOT NULL constraint.
 *   2. ComplianceDashboard.dismissPolicy() + snoozePolicy() reject empty /
 *      non-string policy numbers (Firestore rejects empty field names with
 *      an `invalid-argument` error).
 *   3. Both _scrubUndefined helpers also drop empty-string keys.
 *   4. CryptoHelper.decrypt() no longer console.errors when the input was
 *      simply not base64 — atob's InvalidCharacterError downgrades to a
 *      debug-level breadcrumb.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('VaultMeta._toDbRow — drop null values', () => {
    const src = readSrc('js/vault-meta.js');

    test('_toDbRow source skips null values explicitly', () => {
        const fnStart = src.indexOf('function _toDbRow');
        const fnBlock = src.slice(fnStart, fnStart + 1200);
        expect(fnBlock).toContain('if (val == null) continue');
    });

    test('runnable _toDbRow drops null + undefined values', () => {
        // Pull the JS_TO_DB constant + body and run it inline. Cleanest way
        // to assert the actual filtering behavior without booting the whole
        // module + its supabase deps.
        const map = src.match(/const JS_TO_DB = Object\.freeze\(\{([\s\S]+?)\}\);/)[1];
        const body = src.match(/function _toDbRow\(jsObj\) \{([\s\S]+?)\n    \}/)[1];
        // eslint-disable-next-line no-new-func
        const fn = new Function('jsObj', `
            const JS_TO_DB = Object.freeze({${map}});
            ${body}
        `);
        const row = fn({
            passphraseSaltB64:      'salt-A',
            passphraseWrappedMKB64: 'wrap-A',
            passphraseIterations:   null,    // Argon2id — no iterations
            passphraseKdf:          'argon2id-v1',
            recoverySaltB64:        'salt-R',
            recoveryWrappedMKB64:   'wrap-R',
            recoveryIterations:     null,
            kdfTree:                'hkdf-v1',
        });
        // Critical: NOT NULL columns are absent when we'd otherwise send null.
        expect(row).not.toHaveProperty('pbkdf2_iterations');
        expect(row).not.toHaveProperty('recovery_iterations');
        // Real values still flow through.
        expect(row.passphrase_salt).toBe('salt-A');
        expect(row.passphrase_wrapped_mk).toBe('wrap-A');
        expect(row.kdf_tree).toBe('hkdf-v1');
        expect(row.passphrase_kdf).toBe('argon2id-v1');
    });

    test('legacy PBKDF2 path still sends iterations when present', () => {
        const map = src.match(/const JS_TO_DB = Object\.freeze\(\{([\s\S]+?)\}\);/)[1];
        const body = src.match(/function _toDbRow\(jsObj\) \{([\s\S]+?)\n    \}/)[1];
        // eslint-disable-next-line no-new-func
        const fn = new Function('jsObj', `
            const JS_TO_DB = Object.freeze({${map}});
            ${body}
        `);
        const row = fn({
            passphraseSaltB64:    's',
            passphraseIterations: 600000,
            passphraseKdf:        'pbkdf2-v2',
        });
        expect(row.pbkdf2_iterations).toBe(600000);
        expect(row.passphrase_salt).toBe('s');
        expect(row.passphrase_kdf).toBe('pbkdf2-v2');
    });
});

describe('CGL dismissPolicy / snoozePolicy — reject empty keys', () => {
    const src = readSrc('js/compliance-dashboard.js');

    test('dismissPolicy guards empty / non-string keys', () => {
        const fnStart = src.indexOf('dismissPolicy(policyNumber)');
        const fnBlock = src.slice(fnStart, fnStart + 800);
        expect(fnBlock).toMatch(/if \(!policyNumber \|\| typeof policyNumber !== ['"]string['"]\) return/);
    });

    test('snoozePolicy guards empty / non-string keys', () => {
        const fnStart = src.indexOf('snoozePolicy(policyNumber)');
        const fnBlock = src.slice(fnStart, fnStart + 800);
        expect(fnBlock).toMatch(/if \(!policyNumber \|\| typeof policyNumber !== ['"]string['"]\) return/);
    });
});

describe('_scrubUndefined — drops empty-string keys', () => {
    const cglSrc = readSrc('js/compliance-dashboard.js');
    const syncSrc = readSrc('js/cloud-sync.js');

    test('CGL _scrubUndefined source skips empty-string keys', () => {
        const fnStart = cglSrc.indexOf('_scrubUndefined(obj) {');
        const fnBlock = cglSrc.slice(fnStart, fnStart + 1500);
        expect(fnBlock).toMatch(/if \(k === ['"]{2}\) continue/);
    });

    test('cloud-sync _scrubUndefined source skips empty-string keys', () => {
        const fnStart = syncSrc.indexOf('function _scrubUndefined(value)');
        const fnBlock = syncSrc.slice(fnStart, fnStart + 1500);
        expect(fnBlock).toMatch(/if \(k === ['"]{2}\) continue/);
    });

    test('runnable scrubber drops empty-string keys recursively', () => {
        const body = syncSrc.match(/function _scrubUndefined\(value\) \{([\s\S]+?)\n    \}/)[1];
        // eslint-disable-next-line no-new-func
        const scrub = new Function('value', `
            function _scrubUndefined(value) {${body}}
            return _scrubUndefined(value);
        `);
        const input = {
            dismissedPolicies: {
                '12345': { dismissedAt: '2026-01-01' },
                '':      { dismissedAt: 'oops' }, // bad key
            },
            policyNotes: {
                '67890': {
                    log: [{ note: 'real' }, { '': 'bad-nested-key' }],
                },
            },
        };
        const out = scrub(input);
        expect(out.dismissedPolicies['']).toBeUndefined();
        expect(out.dismissedPolicies['12345']).toEqual({ dismissedAt: '2026-01-01' });
        // Nested empty key inside array element also dropped.
        expect(out.policyNotes['67890'].log[1]).toEqual({});
    });
});

describe('CryptoHelper.decrypt — quiet path for non-base64', () => {
    const src = readSrc('js/crypto-helper.js');

    test('atob InvalidCharacterError is logged at debug level, not error', () => {
        // Look at the final catch in decrypt where the original behavior was
        // an unconditional console.error.
        const idx = src.indexOf("try { return JSON.parse(encryptedData);");
        const block = src.slice(idx, idx + 2500);
        // The downgrade gate: InvalidCharacterError OR atob-mentioning message.
        expect(block).toMatch(/firstErr\.name === ['"]InvalidCharacterError['"]/);
        expect(block).toMatch(/atob/i);
        // Real decryption failures still log at error level.
        expect(block).toContain("console.error('Decryption failed:'");
        // Non-base64 path uses console.debug, not console.error.
        expect(block).toContain('console.debug');
        expect(block).toMatch(/decrypt skipped \(not base64\)/);
    });
});
