/**
 * Regression coverage for the push-side sync-conflict pipeline:
 *   - _pushDoc reads the remote doc and short-circuits with a conflict
 *     descriptor when remote.updatedAt > lastSync_<docType> AND the data
 *     actually differs.
 *   - pushToCloud collects those descriptors and routes them to
 *     _showConflictDialog via the existing flow.
 *   - _resolveConflict's local-write path calls _pushDoc with
 *     skipConflictCheck:true so the resolved push doesn't re-detect.
 *   - DOC_LOCAL_KEYS map covers every doc that has a localStorage slot,
 *     so "Use Cloud" generically writes back for any synced doc.
 *   - _buildConflictDiffHTML produces a field-level diff for shallow
 *     objects + degrades to empty string for non-objects / equal payloads.
 *
 * Source-level guards only — the full Firebase + Auth + Crypto stack is too
 * thick to boot in JSDOM. The contract test here protects the wiring;
 * end-to-end behavior is left for manual smoke testing (documented in
 * the PR body).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SRC = readSrc('js/cloud-sync.js');

describe('push-side conflict detection in _pushDoc', () => {
    test('_pushDoc accepts options.skipConflictCheck', () => {
        expect(SRC).toMatch(/async function _pushDoc\(docPath, localData, docType, options = \{\}\)/);
    });

    test('skipConflictCheck=true bypasses the pre-push read', () => {
        const fnStart = SRC.indexOf('async function _pushDoc');
        const fnBlock = SRC.slice(fnStart, fnStart + 3500);
        expect(fnBlock).toContain('if (!options.skipConflictCheck)');
        // The read+compare lives inside that guard, so a forced write skips it.
        const guardIdx = fnBlock.indexOf('if (!options.skipConflictCheck)');
        const readIdx = fnBlock.indexOf('await ref.get()');
        expect(readIdx).toBeGreaterThan(guardIdx);
    });

    test('conflict descriptor includes remoteData, localData, remoteTime, localTime', () => {
        const fnStart = SRC.indexOf('async function _pushDoc');
        const fnBlock = SRC.slice(fnStart, fnStart + 3500);
        expect(fnBlock).toMatch(/ok:\s*false,\s*conflict:\s*true/);
        expect(fnBlock).toContain('remoteData: remote.data');
        expect(fnBlock).toContain('localData,');
        expect(fnBlock).toContain('remoteTime,');
        expect(fnBlock).toContain('localTime:');
    });

    test('conflict only triggers when payloads actually differ', () => {
        // A same-payload echo from another device is not a real conflict —
        // _pushDoc must not surface a dialog for it. The JSON.stringify
        // equality check gates the conflict branch.
        const fnStart = SRC.indexOf('async function _pushDoc');
        const fnBlock = SRC.slice(fnStart, fnStart + 3500);
        expect(fnBlock).toMatch(/JSON\.stringify\(remote\.data\)\s*!==\s*JSON\.stringify\(localData\)/);
    });

    test('read-failure path falls through to a normal write (non-fatal)', () => {
        const fnStart = SRC.indexOf('async function _pushDoc');
        const fnBlock = SRC.slice(fnStart, fnStart + 3500);
        // The catch block must NOT throw — comment says "fall through to the write".
        expect(fnBlock).toMatch(/console\.warn\(`\[CloudSync\] Pre-push conflict check failed/);
        // The success-path write still runs below the catch.
        expect(fnBlock).toMatch(/await ref\.set\(\{[\s\S]*?data:\s*localData/);
    });
});

describe('pushToCloud collects + dispatches push-side conflicts', () => {
    test('filters Promise.allSettled results for conflict descriptors', () => {
        const fnStart = SRC.indexOf('async pushToCloud(options');
        const fnBlock = SRC.slice(fnStart, fnStart + 6000);
        expect(fnBlock).toMatch(/pushConflicts\s*=\s*results[\s\S]+?\.filter\(r\s*=>\s*r\.status\s*===\s*['"]fulfilled['"][\s\S]+?r\.value\.conflict/);
    });

    test('emits an ActivityLog error event when conflicts exist', () => {
        const fnStart = SRC.indexOf('async pushToCloud(options');
        const fnBlock = SRC.slice(fnStart, fnStart + 6000);
        expect(fnBlock).toMatch(/Sync conflict\s*—\s*\$\{pushConflicts\.length\} doc/);
        expect(fnBlock).toMatch(/window\.ActivityLog\.add/);
    });

    test('routes to the existing _showConflictDialog with proper docType + pushSide tag', () => {
        const fnStart = SRC.indexOf('async pushToCloud(options');
        const fnBlock = SRC.slice(fnStart, fnStart + 6000);
        expect(fnBlock).toContain('this._showConflictDialog(conflictsForDialog)');
        expect(fnBlock).toContain('pushSide: true');
        expect(fnBlock).toContain('docType: c.docType');
    });

    test('non-conflict failure path is preserved (failures filter excludes conflicts)', () => {
        // The existing _notify('Sync failed') path is for hard write errors —
        // a conflict isn't a failure, just a pause. The failure filter must
        // skip conflict descriptors to avoid double-notifying.
        const fnStart = SRC.indexOf('async pushToCloud(options');
        const fnBlock = SRC.slice(fnStart, fnStart + 6000);
        expect(fnBlock).toMatch(/failures\s*=\s*results\.filter\([^)]*!r\.value\.conflict/);
    });
});

describe('_resolveConflict — write paths', () => {
    test('Use Cloud path writes locally + marks synced; Keep Local re-pushes with skipConflictCheck', () => {
        const fnStart = SRC.indexOf('async _resolveConflict(');
        const fnBlock = SRC.slice(fnStart, fnStart + 4000);
        // skipConflictCheck on the re-push so we don't re-detect.
        expect(fnBlock).toMatch(/_pushDoc\(['"]currentForm['"],\s*conflict\.local,\s*['"]currentForm['"],\s*\{ skipConflictCheck:\s*true \}\)/);
        expect(fnBlock).toMatch(/_pushDoc\(['"]cglState['"],\s*conflict\.local,\s*['"]cglState['"],\s*\{ skipConflictCheck:\s*true \}\)/);
    });

    test('generic path handles every doc in DOC_LOCAL_KEYS', () => {
        const fnStart = SRC.indexOf('async _resolveConflict(');
        const fnBlock = SRC.slice(fnStart, fnStart + 4000);
        // The else-if cascade falls through to a generic branch that uses
        // DOC_LOCAL_KEYS — so reminders/glossary/carrierOverrides also resolve.
        expect(fnBlock).toContain('DOC_LOCAL_KEYS[docType]');
        expect(fnBlock).toMatch(/_pushDoc\(docType,\s*conflict\.local,\s*docType,\s*\{ skipConflictCheck:\s*true \}\)/);
    });

    test('docType resolution prefers explicit conflict.docType', () => {
        const fnStart = SRC.indexOf('async _resolveConflict(');
        const fnBlock = SRC.slice(fnStart, fnStart + 4000);
        expect(fnBlock).toMatch(/const docType = conflict\.docType\s*\|\|/);
    });
});

describe('DOC_LOCAL_KEYS map covers every writable sync doc', () => {
    test('map is frozen + lists all SYNC_DOCS except settings', () => {
        const docIdx = SRC.indexOf('const DOC_LOCAL_KEYS = Object.freeze');
        expect(docIdx).toBeGreaterThan(0);
        // Settings is a special case (no localStorage equivalent, written via
        // App.loadDarkMode/loadTheme). Confirm it's intentionally absent.
        const block = SRC.slice(docIdx, docIdx + 2000);
        expect(block).not.toMatch(/^\s*settings:/m);
        // But the doc types people will conflict on are all present.
        for (const k of ['currentForm', 'cglState', 'reminders', 'glossary',
                          'commercialDraft', 'commercialQuotes', 'carrierOverrides',
                          'quickRefCards', 'quickRefNumbers', 'quickRefEmojis',
                          'clientHistory', 'vaultMeta']) {
            expect(block).toMatch(new RegExp(`${k}:\\s*STORAGE_KEYS`));
        }
    });
});

describe('_buildConflictDiffHTML — field-level diff', () => {
    test('lives inside the dialog assembly + is called per conflict', () => {
        expect(SRC).toContain('function _buildConflictDiffHTML(c)');
        // Used inside the per-conflict map().
        expect(SRC).toMatch(/diffHtml\s*=\s*_buildConflictDiffHTML\(c\)/);
        expect(SRC).toMatch(/\$\{diffHtml\}/);
    });

    test('returns empty string for arrays / primitives / null', () => {
        // Source guard for the type check that rejects non-shallow-objects.
        const fnStart = SRC.indexOf('function _buildConflictDiffHTML(c)');
        const fnBlock = SRC.slice(fnStart, fnStart + 2500);
        expect(fnBlock).toMatch(/Array\.isArray\(remote\)\s*\|\|\s*Array\.isArray\(local\)/);
    });

    test('skips keys starting with _ (internal/computed fields)', () => {
        const fnStart = SRC.indexOf('function _buildConflictDiffHTML(c)');
        const fnBlock = SRC.slice(fnStart, fnStart + 2500);
        expect(fnBlock).toMatch(/k\.startsWith\(['"]_['"]\)/);
    });

    test('caps row count at 12 and shows an overflow note', () => {
        const fnStart = SRC.indexOf('function _buildConflictDiffHTML(c)');
        const fnBlock = SRC.slice(fnStart, fnStart + 2500);
        expect(fnBlock).toMatch(/MAX\s*=\s*12/);
        expect(fnBlock).toMatch(/and \$\{diffs\.length - MAX\} more field/);
    });

    test('escapes values via Utils.escapeHTML when available', () => {
        // Defense against malicious / unusual field values rendering raw HTML
        // inside the diff table.
        const fnStart = SRC.indexOf('function _buildConflictDiffHTML(c)');
        const fnBlock = SRC.slice(fnStart, fnStart + 2500);
        expect(fnBlock).toContain('Utils.escapeHTML');
    });
});

describe('CSS — conflict diff styles', () => {
    const css = readSrc('css/auth.css');

    test('table layout fixed so wide values wrap', () => {
        expect(css).toMatch(/\.conflict-diff-table\s*\{[\s\S]*?table-layout:\s*fixed/);
    });

    test('cloud/local columns use distinct accent colors', () => {
        expect(css).toMatch(/\.conflict-diff-remote\s*\{[^}]*color:\s*var\(--apple-blue\)/);
        expect(css).toMatch(/\.conflict-diff-local\s*\{[^}]*color:\s*var\(--warning/);
    });

    test('dark-mode override exists for the diff rows', () => {
        expect(css).toMatch(/body\.dark-mode .conflict-diff-table td/);
    });
});
