/**
 * Altech EZLynx V2 — Atom executor (state machine)
 *
 * Implements the per-atom state machine from plan §4.2:
 *   IDLE → LOCATE → PRECHECK → WAIT_PRECONDITIONS → FILL → POST_FILL →
 *   VERIFY → (DONE | RETRY→LOCATE | FAILED)
 *
 * Every atom terminates in exactly one of:
 *   DONE | SKIPPED | FAILED | BLOCKED
 *
 * Each transition is logged to the fill trace. The orchestrator iterates
 * atoms in topological order and calls executeAtom for each; no atom is
 * ever run in parallel with another.
 */
(function (global) {
    'use strict';

    const getDeps = () => {
        if (typeof module !== 'undefined' && module.exports) {
            return {
                findScoped: require('../locator/find-scoped').findScoped,
                fillText: require('../primitives/text').fillText,
                fillNumber: require('../primitives/number').fillNumber,
                fillCurrency: require('../primitives/currency').fillCurrency,
                fillDate: require('../primitives/date').fillDate,
                fillMatSelect: require('../primitives/mat-select').fillMatSelect,
                fillMatToggle: require('../primitives/mat-toggle').fillMatToggle,
                fillMatRadio: require('../primitives/mat-radio').fillMatRadio,
                verifyNgValid: require('../verifier/ng-valid').verifyNgValid,
                verifyValueMatches: require('../verifier/value-matches').verifyValueMatches,
                getErrorText: require('../verifier/error-text').getErrorText,
                waitElement: require('../waits/wait-element').waitElement,
                waitEnabled: require('../waits/wait-enabled').waitEnabled,
                waitDecodeComplete: require('../waits/wait-decode-complete').waitDecodeComplete,
                waitChildAtomsReady: require('../waits/wait-child-atoms-ready').waitChildAtomsReady,
                expand: require('../transforms/abbreviations').expand,
                dismissPacContainer: require('../special-cases/google-places').dismissPacContainer,
            };
        }
        return {
            findScoped: global.AltechV2.locator.findScoped,
            fillText: global.AltechV2.primitives.text.fillText,
            fillNumber: global.AltechV2.primitives.number.fillNumber,
            fillCurrency: global.AltechV2.primitives.currency.fillCurrency,
            fillDate: global.AltechV2.primitives.date.fillDate,
            fillMatSelect: global.AltechV2.primitives.matSelect.fillMatSelect,
            fillMatToggle: global.AltechV2.primitives.matToggle.fillMatToggle,
            fillMatRadio: global.AltechV2.primitives.matRadio.fillMatRadio,
            verifyNgValid: global.AltechV2.verifier.ngValid.verifyNgValid,
            verifyValueMatches: global.AltechV2.verifier.valueMatches.verifyValueMatches,
            getErrorText: global.AltechV2.verifier.errorText.getErrorText,
            waitElement: global.AltechV2.waits.waitElement,
            waitEnabled: global.AltechV2.waits.waitEnabled,
            waitDecodeComplete: global.AltechV2.waits && global.AltechV2.waits.waitDecodeComplete,
            waitChildAtomsReady: global.AltechV2.waits && global.AltechV2.waits.waitChildAtomsReady,
            expand: global.AltechV2.transforms.abbreviations.expand,
            dismissPacContainer: global.AltechV2.specialCases && global.AltechV2.specialCases.dismissPacContainer,
        };
    };

    /**
     * Walk a dot-notation path into the clientData object.
     * `"CoApplicant.FirstName"` → `data["CoApplicant"]["FirstName"]`
     */
    function readSource(data, path) {
        if (!data || !path) return undefined;
        const parts = String(path).split('.');
        let cur = data;
        for (const p of parts) {
            if (cur == null) return undefined;
            cur = cur[p];
        }
        return cur;
    }

    function isLexisNexisLocked(el) {
        if (!el || !el.disabled) return false;
        // Walk up and search for "LexisNexis" in nearby text within 3 ancestors.
        let host = el.parentElement;
        for (let i = 0; i < 3 && host; i++) {
            const text = host.textContent || '';
            if (/LexisNexis/i.test(text)) return true;
            host = host.parentElement;
        }
        return false;
    }

    async function runPostFill(actions, ctx, trace) {
        if (!Array.isArray(actions) || actions.length === 0) return;
        const deps = getDeps();
        for (const action of actions) {
            switch (action.action) {
                case 'dismissPacContainer':
                    if (typeof deps.dismissPacContainer === 'function') {
                        deps.dismissPacContainer();
                        trace.log(ctx.atom.key, 'POST_FILL', { action: action.action, supported: true });
                    } else {
                        trace.log(ctx.atom.key, 'POST_FILL', { action: action.action, supported: false });
                    }
                    break;

                case 'clickVinLookup': {
                    // Phase 2 VIN decoder short-circuit (§7.1). Click
                    // #vin-lookup-btn-{index} — by the time we're here the
                    // VIN field is filled and the button exists. If the
                    // button isn't found, log supported:false so the
                    // downstream waitForDecodeComplete still runs (and
                    // will just time out harmlessly).
                    const vehicleIndex = ctx && ctx.ctx && ctx.ctx.index != null
                        ? ctx.ctx.index : 0;
                    const btn = document.getElementById('vin-lookup-btn-' + vehicleIndex);
                    if (btn) {
                        try { btn.click(); } catch (_) { /* ignore */ }
                        trace.log(ctx.atom.key, 'POST_FILL',
                            { action: action.action, supported: true, index: vehicleIndex });
                    } else {
                        trace.log(ctx.atom.key, 'POST_FILL',
                            { action: action.action, supported: false, index: vehicleIndex, reason: 'button-not-found' });
                    }
                    break;
                }

                case 'waitForDecodeComplete': {
                    // Phase 2 VIN decoder short-circuit. Poll
                    // #selected-year-{index} until it has text OR 10 s
                    // timeout. Whatever the outcome, dependent atoms
                    // (year/make/model/...) run next — they carry
                    // skipIfAlreadyFilled so a successful decode makes
                    // them SKIPped, and a failed decode makes them fill
                    // from clientData.
                    if (typeof deps.waitDecodeComplete !== 'function') {
                        trace.log(ctx.atom.key, 'POST_FILL',
                            { action: action.action, supported: false, reason: 'not-loaded' });
                        break;
                    }
                    const vehicleIndex = ctx && ctx.ctx && ctx.ctx.index != null
                        ? ctx.ctx.index : 0;
                    let decoded = null;
                    try {
                        decoded = await deps.waitDecodeComplete(vehicleIndex);
                    } catch (_) { /* treat as timeout */ }
                    trace.log(ctx.atom.key, 'POST_FILL', {
                        action: action.action,
                        supported: true,
                        index: vehicleIndex,
                        decoded: decoded != null,
                    });
                    break;
                }

                case 'waitForChildAtomsReady': {
                    // Phase 3 dynamic reveal (§7.5). After a Pool / Dog /
                    // Trampoline / Business / Mortgagee toggle goes ON,
                    // EZLynx renders child fields asynchronously. Poll
                    // until every listed child id exists in the DOM, up
                    // to a short timeout. Returns false on timeout —
                    // dependent child atoms will still attempt to run
                    // and FAIL cleanly at LOCATE, which is the correct
                    // audit outcome if the reveal never happened.
                    //
                    // `action.children` is an array of id strings read
                    // directly off the atom spec; the primitive polling
                    // helper accepts an empty array as a no-op (returns
                    // true immediately), which is how we get a
                    // supported:true audit entry for toggles whose
                    // reveal children aren't part of the core registry
                    // yet (see home-coverage mortgagee atoms).
                    if (typeof deps.waitChildAtomsReady !== 'function') {
                        trace.log(ctx.atom.key, 'POST_FILL',
                            { action: action.action, supported: false, reason: 'not-loaded' });
                        break;
                    }
                    const children = Array.isArray(action.children) ? action.children : [];
                    const timeoutMs = typeof action.timeoutMs === 'number' ? action.timeoutMs : 3000;
                    let ready = false;
                    try {
                        ready = await deps.waitChildAtomsReady(children, { timeoutMs });
                    } catch (_) { /* treat as not-ready */ }
                    trace.log(ctx.atom.key, 'POST_FILL', {
                        action: action.action,
                        supported: true,
                        childCount: children.length,
                        ready,
                    });
                    break;
                }

                default:
                    // Unknown postFill action — log as unsupported for audit.
                    trace.log(ctx.atom.key, 'POST_FILL', { action: action.action, supported: false });
            }
        }
    }

    /**
     * @param {object} atom       Atom spec
     * @param {object} opts
     * @param {*}      opts.clientData
     * @param {object} opts.ctx     { index?, entityId?, entityMap? }
     * @param {object} opts.trace   FillTrace instance
     * @returns {Promise<{state: 'DONE'|'SKIPPED'|'FAILED', reason?: string}>}
     */
    async function executeAtom(atom, opts) {
        const deps = getDeps();
        const { clientData, ctx, trace } = opts;
        const log = (state, detail) => trace.log(atom.key, state, detail);

        // ── LOCATE ──────────────────────────────────────────────────
        log('LOCATE', null);
        let el;
        try {
            el = deps.findScoped(atom, ctx);
            if (!el) {
                // Short poll — Angular may still be rendering. The vast
                // majority of "not found" cases are fields that don't
                // exist on this page, so a long timeout just stalls the
                // whole run for nothing. 400 ms is enough for any field
                // that is in fact about to render.
                el = await deps.waitElement(
                    '#' + (atom.idTemplate || ''),
                    { timeoutMs: 400 }
                );
            }
        } catch (e) {
            trace.finalize(atom.key, 'FAILED', { reason: 'locate-exception', error: e && e.message });
            return { state: 'FAILED', reason: 'locate-exception' };
        }
        if (!el) {
            trace.finalize(atom.key, 'FAILED', { reason: 'not-found' });
            return { state: 'FAILED', reason: 'not-found' };
        }

        // ── PRECHECK ────────────────────────────────────────────────
        log('PRECHECK', null);
        if (atom.skipIfLexisNexisLocked !== false && isLexisNexisLocked(el)) {
            trace.finalize(atom.key, 'SKIPPED', { reason: 'lexis-nexis' });
            return { state: 'SKIPPED', reason: 'lexis-nexis' };
        }
        if (atom.skipIfDisabled !== false && el.disabled) {
            trace.finalize(atom.key, 'SKIPPED', { reason: 'disabled' });
            return { state: 'SKIPPED', reason: 'disabled' };
        }

        // Read source value. Multi-entity atoms (drivers/vehicles/incidents)
        // carry their per-entity payload directly on `atom._entity` so the
        // `source` path is relative to a single entity slice rather than
        // the full clientData root. Applicant / co-applicant atoms have no
        // `_entity` and continue to read from the root — backwards compat.
        const sourceRoot = (atom._entity != null) ? atom._entity : clientData;
        const rawValue = readSource(sourceRoot, atom.source);
        if (rawValue == null || rawValue === '') {
            trace.finalize(atom.key, 'SKIPPED', { reason: 'empty-source' });
            return { state: 'SKIPPED', reason: 'empty-source' };
        }

        // Apply abbreviation + valueTransform
        let expected = rawValue;
        if (atom.abbreviationExpand !== false && typeof expected === 'string') {
            expected = deps.expand(expected);
        }
        if (typeof atom.valueTransform === 'function') {
            try { expected = atom.valueTransform(expected); }
            catch (e) {
                trace.finalize(atom.key, 'FAILED', { reason: 'transform-exception', error: e && e.message });
                return { state: 'FAILED', reason: 'transform-exception' };
            }
        }

        // skipIfAlreadyFilled check — compare current input value.
        if (atom.skipIfAlreadyFilled && el.value != null && String(el.value) === String(expected)) {
            trace.finalize(atom.key, 'SKIPPED', { reason: 'already-filled' });
            return { state: 'SKIPPED', reason: 'already-filled' };
        }

        // ── FILL (with retries) ─────────────────────────────────────
        // Defaults tuned down from 3×500ms — the vast majority of
        // failures here are "field really isn't on this page" or "value
        // doesn't match any option", neither of which gets better with
        // retries. One retry covers transient Angular re-renders.
        const maxRetries = atom.maxRetries != null ? atom.maxRetries : 1;
        const retryDelayMs = atom.retryDelayMs != null ? atom.retryDelayMs : 200;
        let attempt = 0;
        let lastResult = null;
        let lastVerify = null;

        while (attempt <= maxRetries) {
            log('FILL', { attempt });
            try {
                lastResult = await fillByType(atom, el, expected, deps);
            } catch (e) {
                lastResult = { ok: false, reason: 'fill-exception', error: e && e.message };
            }

            // ── POST_FILL ───────────────────────────────────────────
            if (lastResult && lastResult.ok) {
                await runPostFill(atom.postFill, { atom, ctx }, trace);
            }

            // ── VERIFY ──────────────────────────────────────────────
            log('VERIFY', { mode: atom.verify || defaultVerifyFor(atom.type) });
            lastVerify = verifyByMode(atom, el, expected, lastResult, deps);
            if (lastResult && lastResult.ok && lastVerify && lastVerify.ok) {
                trace.finalize(atom.key, 'DONE', { attempts: attempt + 1 });
                return { state: 'DONE' };
            }

            attempt++;
            if (attempt > maxRetries) break;
            await new Promise((r) => setTimeout(r, retryDelayMs));
            // Re-locate for next attempt — DOM may have re-rendered.
            const freshEl = deps.findScoped(atom, ctx);
            if (freshEl) el = freshEl;
        }

        trace.finalize(atom.key, 'FAILED', {
            reason: (lastVerify && lastVerify.reason) || (lastResult && lastResult.reason) || 'unknown',
            attempts: attempt,
            fill: lastResult,
            verify: lastVerify,
        });
        return { state: 'FAILED', reason: (lastVerify && lastVerify.reason) || 'verify-failed' };
    }

    function defaultVerifyFor(type) {
        if (type === 'phone' || type === 'ssn') return 'valueMatches';
        if (type === 'mat-select') return 'optionSelected';
        if (type === 'mat-toggle') return 'toggleState';
        return 'ng-valid';
    }

    async function fillByType(atom, el, expected, deps) {
        switch (atom.type) {
            case 'text':
            case 'phone':
            case 'ssn':
                return deps.fillText(el, expected);
            case 'number':
                return deps.fillNumber(el, expected);
            case 'currency':
                return deps.fillCurrency(el, expected);
            case 'date':
                return deps.fillDate(el, expected);
            case 'mat-select':
                return deps.fillMatSelect(el, expected);
            case 'mat-toggle':
                return deps.fillMatToggle(el, expected);
            case 'mat-radio':
                return deps.fillMatRadio(el, expected);
            default:
                return { ok: false, reason: 'unknown-type' };
        }
    }

    function verifyByMode(atom, el, expected, fillResult, deps) {
        const mode = atom.verify || defaultVerifyFor(atom.type);
        // An unsuccessful fill never verifies ok.
        if (!fillResult || !fillResult.ok) {
            return { ok: false, reason: fillResult && fillResult.reason || 'no-fill-result' };
        }
        switch (mode) {
            case 'ng-valid':
                return deps.verifyNgValid(el);
            case 'valueMatches':
                return deps.verifyValueMatches(el, expected);
            case 'optionSelected': {
                const err = deps.getErrorText(el);
                if (err) return { ok: false, reason: 'mat-error', errorText: err };
                return { ok: true };
            }
            case 'toggleState': {
                // mat-toggle fill primitive returned { changed } — treat ok
                // as already validated by the primitive's state comparison.
                return { ok: true };
            }
            case 'custom':
                if (typeof atom.verifyCustom === 'function') {
                    try {
                        const result = atom.verifyCustom(el, expected);
                        return result === true ? { ok: true } : { ok: false, reason: 'custom-failed', detail: result };
                    } catch (e) {
                        return { ok: false, reason: 'custom-exception', error: e && e.message };
                    }
                }
                return { ok: false, reason: 'custom-missing' };
            default:
                return { ok: false, reason: 'unknown-verify-mode' };
        }
    }

    const api = { executeAtom, readSource, isLexisNexisLocked, defaultVerifyFor };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else {
        global.AltechV2.orchestrator.executeAtom = executeAtom;
        global.AltechV2.orchestrator.readSource = readSource;
    }
})(typeof window !== 'undefined' ? window : globalThis);
