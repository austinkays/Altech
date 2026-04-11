/**
 * Altech EZLynx V2 — Recon Tool public API (§11)
 *
 * Admin-only diagnostic subsystem. Dispatches to one of 6 features based on
 * the feature name. Admin gate is enforced here — non-admin callers get an
 * error, never partial results.
 *
 * Feature names:
 *   'page-inventory'  → runPageInventory
 *   'registry-audit'  → runRegistryAudit
 *   'dry-run'         → runDryRun
 *   'issue-capture'   → runIssueCapture
 *   'cascade-test'    → runCascadeTest
 *   'diff-registry'   → runDiffRegistry
 *
 * opts shape: { routeKey, clientData, lastTrace, uid }
 */
(function (global) {
    'use strict';

    const getDeps = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return {
                runPageInventory: require('./page-inventory').runPageInventory,
                runRegistryAudit: require('./registry-audit').runRegistryAudit,
                runDryRun: require('./dry-run').runDryRun,
                runIssueCapture: require('./issue-capture').runIssueCapture,
                runCascadeTest: require('./cascade-test').runCascadeTest,
                runDiffRegistry: require('./diff-registry').runDiffRegistry,
                c3: require('./output').c3,
            };
        }
        return {
            runPageInventory: global.AltechV2.recon.pageInventory.runPageInventory,
            runRegistryAudit: global.AltechV2.recon.registryAudit.runRegistryAudit,
            runDryRun: global.AltechV2.recon.dryRun.runDryRun,
            runIssueCapture: global.AltechV2.recon.issueCapture.runIssueCapture,
            runCascadeTest: global.AltechV2.recon.cascadeTest.runCascadeTest,
            runDiffRegistry: global.AltechV2.recon.diffRegistry.runDiffRegistry,
            c3: global.AltechV2.recon.output.c3,
        };
    };

    /**
     * @returns {Promise<boolean>}
     */
    function getIsAdmin() {
        return new Promise((resolve) => {
            try {
                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.get(['isAdmin'], (data) => resolve(!!(data && data.isAdmin)));
                } else {
                    resolve(false);
                }
            } catch (_) {
                resolve(false);
            }
        });
    }

    /**
     * Run a recon feature.
     *
     * @param {string} featureName  One of the 6 feature names above
     * @param {object} opts         { routeKey, clientData, lastTrace, uid }
     * @returns {Promise<object>}   Feature result (always JSON-serialisable)
     * @throws  If called by a non-admin user
     */
    async function run(featureName, opts) {
        const isAdmin = await getIsAdmin();
        if (!isAdmin) throw new Error('recon: admin only — set isAdmin in chrome.storage.local');

        const o = opts || {};
        const { routeKey, clientData, lastTrace, uid } = o;
        const deps = getDeps();

        switch (featureName) {
            case 'page-inventory': {
                const result = deps.runPageInventory(routeKey);
                await deps.c3(result, `page-inventory-${Date.now()}.json`);
                return result;
            }
            case 'registry-audit': {
                const result = deps.runRegistryAudit(routeKey, clientData);
                await deps.c3(result, `registry-audit-${routeKey}-${Date.now()}.json`);
                return result;
            }
            case 'dry-run': {
                const result = deps.runDryRun(routeKey, clientData);
                await deps.c3(result.markdown, `dry-run-${routeKey}-${Date.now()}.md`);
                return result;
            }
            case 'issue-capture': {
                // c5() is called internally by runIssueCapture
                return await deps.runIssueCapture(routeKey, clientData, lastTrace, uid);
            }
            case 'cascade-test': {
                const result = await deps.runCascadeTest(routeKey, clientData);
                await deps.c3(result, `cascade-test-${routeKey}-${Date.now()}.json`);
                return result;
            }
            case 'diff-registry': {
                const result = deps.runDiffRegistry(routeKey, clientData);
                await deps.c3(result, `diff-registry-${routeKey}-${Date.now()}.json`);
                return result;
            }
            default:
                throw new Error(`recon: unknown feature '${featureName}'`);
        }
    }

    const api = { run, getIsAdmin };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2 = global.AltechV2 || {};
        global.AltechV2.recon = global.AltechV2.recon || {};
        Object.assign(global.AltechV2.recon, api);
    }
})(typeof window !== 'undefined' ? window : globalThis);
