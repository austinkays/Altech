// intake-v2-core.js — Save / load / applyData with nested paths.
//
// Mirrors the shape of App.save / App.load (js/app-core.js) but operates on
// the nested IntakeV2.data tree. Per-keystroke debounced autosave (400 ms),
// encrypted via CryptoHelper, written to STORAGE_KEYS.INTAKE_V2.
//
// After every save:
//   - schedules a cloud push via window.Sync.schedulePush() (Firebase or Supabase)
//   - logs to ActivityLog (visible in the header status pill)
//   - recomputes carrier bindability and re-renders the top-bar indicator
//   - refreshes talk-track suggestions
//   - appends to the lastEntries ring buffer
//
// All renderers (operators, products, coverage, history, review) call
// IntakeV2.requestRerender() to redraw their region after structural changes.

'use strict';

(function () {

    const SAVE_DEBOUNCE_MS = 400;

    // ─── Path helpers ──────────────────────────────────────────────────────
    function getByPath(obj, path) {
        if (!obj || !path) return undefined;
        const parts = path.split('.');
        let cur = obj;
        for (const p of parts) {
            if (cur == null) return undefined;
            cur = cur[p];
        }
        return cur;
    }
    function setByPath(obj, path, value) {
        if (!obj || !path) return;
        const parts = path.split('.');
        let cur = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            const k = parts[i];
            if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
            cur = cur[k];
        }
        cur[parts[parts.length - 1]] = value;
    }

    function newId(prefix) {
        return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    }

    // Timezone-safe age from a YYYY-MM-DD string. The naive
    // `new Date(dob)` parses as UTC midnight; for users in negative UTC
    // offsets that can render the previous calendar day locally, which can
    // throw the age off by one on edge dates (Dec 31 → Jan 1 boundary
    // birthdays). Parsing the components manually compares both birth and
    // today in the local calendar — same year/month/day semantics the
    // <input type="date"> picker exposed in the first place.
    function ageFromDobString(dob) {
        if (!dob || typeof dob !== 'string') return 0;
        const parts = dob.split('-');
        if (parts.length !== 3) return 0;
        const y = Number(parts[0]), m = Number(parts[1]), d = Number(parts[2]);
        if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return 0;
        const now = new Date();
        let age = now.getFullYear() - y;
        const nm = now.getMonth() + 1;
        const nd = now.getDate();
        if (nm < m || (nm === m && nd < d)) age--;
        return age;
    }

    function readDomValue(el) {
        if (!el) return '';
        if (el.type === 'checkbox') return !!el.checked;
        if (el.type === 'number')   return el.value === '' ? '' : Number(el.value);
        return el.value;
    }

    function writeDomValue(el, value) {
        if (!el) return;
        if (el.type === 'checkbox') {
            el.checked = !!value;
        } else {
            el.value = value == null ? '' : String(value);
        }
    }

    // ─── Storage I/O ───────────────────────────────────────────────────────
    // CryptoHelper.encrypt/decrypt are async (return Promises) — we await
    // them. When unavailable, we fall back to plaintext JSON so the form
    // works in environments without crypto.subtle (JSDOM tests). When the
    // v2 vault is *locked* (passphrase enrolled but not entered), encrypt
    // throws CRYPTO_LOCKED — we propagate that to save() so we refuse the
    // write rather than silently writing plaintext (which would defeat the
    // user's locking of the vault).
    async function encryptOrPassthrough(plain) {
        if (window.CryptoHelper && typeof window.CryptoHelper.encrypt === 'function') {
            try {
                const r = window.CryptoHelper.encrypt(plain);
                const out = (r && typeof r.then === 'function') ? await r : r;
                if (typeof out === 'string' && out.length) return out;
            } catch (err) {
                if (err && typeof err.message === 'string' && err.message.startsWith('CRYPTO_LOCKED')) {
                    throw err;  // propagate — save() catches and refuses
                }
                /* other errors (e.g. crypto.subtle missing): fall back */
            }
        }
        return plain;
    }
    async function decryptOrPassthrough(stored) {
        if (window.CryptoHelper && typeof window.CryptoHelper.decrypt === 'function') {
            try {
                const r = window.CryptoHelper.decrypt(stored);
                const out = (r && typeof r.then === 'function') ? await r : r;
                if (out != null) return typeof out === 'string' ? out : JSON.stringify(out);
            } catch (_) { /* fall back */ }
        }
        return stored;
    }

    // ─── Core methods (attached to window.IntakeV2) ───────────────────────
    Object.assign(window.IntakeV2, {

        // Path helpers exposed for renderers and tests
        _getByPath: getByPath,
        _setByPath: setByPath,
        _newId: newId,
        _ageFromDob: ageFromDobString,

        // ─── save / load ───────────────────────────────────────────────────
        scheduleSave() {
            if (this._saveTimeout) clearTimeout(this._saveTimeout);
            this._saveTimeout = setTimeout(() => this.save(), SAVE_DEBOUNCE_MS);
        },

        async save(opts) {
            opts = opts || {};
            try {
                if (!this.STORAGE_KEY) return false;
                this.data._schemaVersion = this.SCHEMA_VERSION;
                this.data.meta = this.data.meta || {};
                this.data.meta.updatedAt = new Date().toISOString();
                if (!this.data.meta.createdAt) this.data.meta.createdAt = this.data.meta.updatedAt;
                if (!this.data.meta.quoteId)   this.data.meta.quoteId = newId('iv2-quote');

                const json = JSON.stringify(this.data);
                const stored = await encryptOrPassthrough(json);
                localStorage.setItem(this.STORAGE_KEY, stored);

                this._lastSaveOk = true;
                this._lastSaveLocked = false;
                this._saveToken++;

                if (window.ActivityLog && !opts.silent) {
                    window.ActivityLog.add({
                        type: 'save', area: 'intake-v2',
                        ok: true,
                        message: 'Intake v2 draft saved',
                    });
                }
                if (window.Sync && typeof window.Sync.schedulePush === 'function') {
                    try { window.Sync.schedulePush(); } catch (_) {}
                }
                this._afterSave(opts);
                return true;
            } catch (err) {
                this._lastSaveOk = false;
                const isLocked = err && typeof err.message === 'string' && err.message.startsWith('CRYPTO_LOCKED');
                this._lastSaveLocked = !!isLocked;
                if (window.ActivityLog) {
                    window.ActivityLog.add({
                        type: 'error', area: 'intake-v2', ok: false,
                        message: isLocked ? 'Intake v2 save refused: vault is locked' : 'Intake v2 save failed',
                        detail: isLocked ? 'Unlock the vault to resume saving' : String(err && err.message || err),
                    });
                }
                // CRYPTO_LOCKED is recoverable — re-prompt the unlock modal so
                // the user can unblock themselves instead of being stuck. Use
                // a flag so we only re-prompt once per locked session (avoids
                // a loop of save → fail → open modal → cancel → save again).
                if (isLocked) {
                    if (!this._unlockPromptedThisSession) {
                        this._unlockPromptedThisSession = true;
                        if (typeof VaultUI !== 'undefined' && VaultUI.openUnlock) {
                            try { VaultUI.openUnlock(); } catch (_) {}
                        }
                    }
                    console.warn('IntakeV2.save: vault locked — re-prompting unlock');
                } else {
                    // eslint-disable-next-line no-console
                    console.error('IntakeV2.save failed:', err);
                }
                this._afterSave({ ...opts, error: err });
                return false;
            }
        },

        async load() {
            try {
                if (!this.STORAGE_KEY) return false;
                const raw = localStorage.getItem(this.STORAGE_KEY);
                if (!raw) return false;
                const plain = await decryptOrPassthrough(raw);
                if (!plain) {
                    // Park ciphertext for recovery (mirrors App._parkCiphertextForRecovery)
                    this._parkCiphertextForRecovery(raw);
                    return false;
                }
                let parsed;
                try { parsed = JSON.parse(plain); }
                catch (_) {
                    this._parkCiphertextForRecovery(raw);
                    return false;
                }
                this.data = this._migrateSchema(parsed);
                return true;
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('IntakeV2.load failed:', err);
                return false;
            }
        },

        _migrateSchema(data) {
            // v1 is current. Future migrations branch here.
            const base = this.defaultData();
            const merged = deepMergeDefaults(base, data || {});
            merged._schemaVersion = this.SCHEMA_VERSION;

            // Backfill missing ids on collection items. Loaded data, imports,
            // or older snapshots may have items with `id: ''` (the default)
            // or no id at all — without one, getItem/removeItem/chip-link
            // lookups all fail silently because every comparison is to `id`.
            const idPrefix = (k) => k === 'operators' ? 'op'
                : k === 'homes' ? 'home'
                : k === 'autos' ? 'auto'
                : k === 'boats' ? 'boat'
                : k === 'rvs'   ? 'rv'   : 'item';
            ['operators','homes','autos','boats','rvs'].forEach(k => {
                if (!Array.isArray(merged[k])) return;
                merged[k].forEach(item => {
                    if (!item || typeof item !== 'object') return;
                    if (!item.id) item.id = newId(idPrefix(k));
                });
            });
            return merged;
        },

        _parkCiphertextForRecovery(raw) {
            if (!window.STORAGE_KEYS || !window.STORAGE_KEYS.DECRYPTION_RECOVERY) return;
            try {
                const key = window.STORAGE_KEYS.DECRYPTION_RECOVERY;
                const existing = localStorage.getItem(key);
                let bucket = [];
                if (existing) {
                    try { bucket = JSON.parse(existing); } catch (_) { bucket = []; }
                }
                bucket.push({ source: 'intake-v2', at: new Date().toISOString(), ciphertext: raw });
                localStorage.setItem(key, JSON.stringify(bucket));
            } catch (_) { /* best-effort */ }
        },

        // ─── DOM apply / readback ──────────────────────────────────────────
        applyData() {
            const fields = window.IntakeV2Fields;
            if (!fields) return;

            // Scalar fields
            for (const f of fields.scalar) {
                const el = document.getElementById(f.id);
                if (!el) continue;
                const v = getByPath(this.data, f.path);
                writeDomValue(el, v);
            }
            // Repeating collections are owned by their own renderer (operators,
            // homes, autos, boats, rvs). They listen for requestRerender().
            this.requestRerender();
        },

        // After save: re-run bindability, talk track, defer/follow-up render,
        // last-entries strip update, and emit a change event.
        _afterSave(opts) {
            opts = opts || {};
            try {
                if (window.IntakeV2Bindability) {
                    this.bindability = window.IntakeV2Bindability.computeBindability({ data: this.data });
                }
                if (this._layout && typeof this._layout.renderTopbarStatus === 'function') {
                    this._layout.renderTopbarStatus();
                }
                if (this._defer && typeof this._defer.render === 'function') {
                    this._defer.render();
                }
                if (this._layout && typeof this._layout.renderJumpBadges === 'function') {
                    this._layout.renderJumpBadges();
                }
                if (this._layout && typeof this._layout.renderTalkTrack === 'function') {
                    this._layout.renderTalkTrack();
                }
                if (opts.lastEntry) this._pushLastEntry(opts.lastEntry);
                if (this._layout && typeof this._layout.renderLastEntries === 'function') {
                    this._layout.renderLastEntries();
                }
                // Per-product renderers re-render their region (cheap)
                if (this._review && typeof this._review.render === 'function') this._review.render();
            } catch (err) {
                // eslint-disable-next-line no-console
                console.warn('IntakeV2 _afterSave hook failed:', err);
            }
        },

        // Ring buffer of last 5 field writes for the right-rail peek.
        // Dedupes consecutive writes to the same path so typing "John" shows
        // up as one entry, not four keystrokes monopolizing the buffer.
        _pushLastEntry(entry) {
            this.lastEntries = this.lastEntries || [];
            const head = this.lastEntries[0];
            if (head && head.path === entry.path) {
                this.lastEntries[0] = { ...entry, at: Date.now() };
            } else {
                this.lastEntries.unshift({ ...entry, at: Date.now() });
                this.lastEntries = this.lastEntries.slice(0, 5);
            }
        },

        // Renderers register themselves so requestRerender() can fan out.
        registerRenderer(key, fn) {
            this._renderers = this._renderers || {};
            this._renderers[key] = fn;
        },
        requestRerender(key) {
            this._renderers = this._renderers || {};
            const keys = key ? [key] : Object.keys(this._renderers);
            for (const k of keys) {
                try { this._renderers[k] && this._renderers[k].call(this); }
                catch (err) { console.warn(`IntakeV2 renderer "${k}" failed:`, err); }
            }
        },

        // ─── Mutation helpers used by every renderer ──────────────────────
        addItem(collKey, partial, opts) {
            opts = opts || {};
            const arr = this.data[collKey] = this.data[collKey] || [];
            const idPrefix = collKey === 'operators' ? 'op'
                          : collKey === 'homes'     ? 'home'
                          : collKey === 'autos'     ? 'auto'
                          : collKey === 'boats'     ? 'boat'
                          : collKey === 'rvs'       ? 'rv'
                          : 'item';
            // Deep-merge so nested partials (e.g. inline operator form supplies
            // `dl.state` only) don't replace the entire nested object and leave
            // a half-populated shape (`{dl: {state:'WA'}}` with `num/status/...`
            // gone). Shallow Object.assign was the prior, broken behavior.
            const item = deepMergeDefaults(itemDefaults(collKey), partial || {});
            if (!item.id) item.id = newId(idPrefix);
            arr.push(item);
            // `opts.quiet` skips save + rerender so a caller doing multiple
            // related mutations (e.g. the inline operator picker also linking
            // the new operator to a product's primaryOperatorId) can save once
            // at the end. Avoids a save race where two concurrent in-flight
            // encryptions could land in the wrong order and persist a stale
            // intermediate state to localStorage.
            if (!opts.quiet) {
                this.save();
                this.requestRerender();
            }
            return item;
        },
        removeItem(collKey, itemId) {
            const arr = this.data[collKey] || [];
            this.data[collKey] = arr.filter(x => x.id !== itemId);

            // Defense in depth: when an operator is removed, sever every
            // product link AND every history-row link pointing at them so no
            // auto/boat/RV/loss/violation ends up referencing a ghost id. The
            // UI in operators.js already does the auto/boat/RV unlink with a
            // confirm dialog; this guard catches any other caller (command
            // palette, tests, imports, scripted ops) that goes straight
            // through the model API.
            if (collKey === 'operators') {
                ['autos','boats','rvs'].forEach(coll => {
                    (this.data[coll] || []).forEach(item => {
                        if (item.primaryOperatorId === itemId) item.primaryOperatorId = '';
                        if (Array.isArray(item.additionalOperatorIds)) {
                            item.additionalOperatorIds = item.additionalOperatorIds.filter(id => id !== itemId);
                        }
                    });
                });
                // Also wipe operator references on loss/violation rows so
                // the PDF doesn't dangle "Operator: (none)" entries.
                if (this.data.history) {
                    (this.data.history.losses || []).forEach(L => { if (L.operatorId === itemId) L.operatorId = ''; });
                    (this.data.history.violations || []).forEach(V => { if (V.operatorId === itemId) V.operatorId = ''; });
                }
            }

            // Drop any deferred-field paths anchored to the removed item so
            // the right-rail follow-up list doesn't show ghost entries that
            // can't be jumped to (their target DOM no longer exists).
            if (Array.isArray(this.data.deferred) && this.data.deferred.length) {
                const prefix = `${collKey}#${itemId}.`;
                this.data.deferred = this.data.deferred.filter(p => !p.startsWith(prefix));
            }

            this.save();
            this.requestRerender();
        },
        getItem(collKey, itemId) {
            return (this.data[collKey] || []).find(x => x.id === itemId);
        },
        setItemField(collKey, itemId, path, value) {
            // `__header.*` paths are virtual — the renderer uses them to draw
            // subsection titles (Coverage / Lien holder / Endorsements). They
            // have no inputs and should never reach this method, but guard
            // defensively in case a future renderer accidentally creates one.
            if (typeof path === 'string' && path.startsWith('__header.')) return;
            const item = this.getItem(collKey, itemId);
            if (!item) return;
            setByPath(item, path, value);
            // Mirror setField — surface the write in the right-rail
            // "last entries" peek so the agent can verify mid-call.
            this._pushLastEntry({ path: `${collKey}#${itemId}.${path}`, value });
            this.scheduleSave();
        },
        setField(path, value, opts) {
            opts = opts || {};
            setByPath(this.data, path, value);
            if (opts.immediate) this.save({ lastEntry: { path, value } });
            else { this._pushLastEntry({ path, value }); this.scheduleSave(); }
        },

        // ─── Sync the applicant + co-applicant fields into the operator pool ──
        // Mirrors the v1 pattern from js/app-applicant.js — primary applicant
        // is always operator[0]; co-applicant if present becomes operator[1].
        syncApplicantOperators() {
            const ops = this.data.operators = this.data.operators || [];
            // Primary applicant
            let pri = ops.find(o => o.isPrimaryApplicant);
            if (!pri) {
                pri = Object.assign(itemDefaults('operators'), {
                    id: newId('op'), isPrimaryApplicant: true, relationship: 'Self',
                });
                ops.unshift(pri);
            }
            ['firstName','middleName','lastName','dob','gender','maritalStatus','occupation','industry','education']
                .forEach(k => { if (this.data.applicant[k] != null) pri[k] = this.data.applicant[k]; });

            // Co-applicant
            const co = ops.find(o => o.isCoApplicant);
            if (this.data.coApplicant.present) {
                let coOp = co || Object.assign(itemDefaults('operators'), {
                    id: newId('op'), isCoApplicant: true,
                });
                ['firstName','middleName','lastName','dob','gender','maritalStatus','occupation','industry','education']
                    .forEach(k => { if (this.data.coApplicant[k] != null) coOp[k] = this.data.coApplicant[k]; });
                coOp.relationship = this.data.coApplicant.relationship || coOp.relationship || '';
                if (!co) ops.splice(1, 0, coOp);
            } else if (co) {
                // Remove the co-applicant operator AND unlink from every place
                // their id could be referenced. Mirror removeItem('operators',
                // co.id) so toggling the co-app flag off has the same cleanup
                // behavior as deleting them through the operator pool UI.
                // Defensive: handle the (impossible-via-UI but importable)
                // case of multiple isCoApplicant entries by filtering all.
                const removedIds = ops.filter(o => o.isCoApplicant).map(o => o.id);
                this.data.operators = ops.filter(o => !o.isCoApplicant);
                ['autos','boats','rvs'].forEach(coll => {
                    (this.data[coll] || []).forEach(item => {
                        if (removedIds.includes(item.primaryOperatorId)) item.primaryOperatorId = '';
                        if (Array.isArray(item.additionalOperatorIds)) {
                            item.additionalOperatorIds = item.additionalOperatorIds.filter(id => !removedIds.includes(id));
                        }
                    });
                });
                if (this.data.history) {
                    (this.data.history.losses || []).forEach(L => { if (removedIds.includes(L.operatorId)) L.operatorId = ''; });
                    (this.data.history.violations || []).forEach(V => { if (removedIds.includes(V.operatorId)) V.operatorId = ''; });
                }
            }
        },
    });

    // ─── Default shape for a new collection item ──────────────────────────
    function itemDefaults(collKey) {
        switch (collKey) {
            case 'operators': return {
                id: '', isPrimaryApplicant: false, isCoApplicant: false,
                prefix:'', firstName:'', middleName:'', lastName:'', suffix:'',
                dob:'', ssn:'', gender:'', maritalStatus:'',
                dl:{ num:'', state:'', status:'', ageLicensed:'', yearsAuto:'', yearsBoat:'', yearsRV:'' },
                education:'', industry:'', occupation:'', relationship:'',
                hasCleanHistory: false,
                // Underwriting flags — agent should ask each on the call
                sr22Required: false,
                licenseSuspended5y: false,
                goodStudent: false,
                distantStudent: false,
            };
            case 'homes': return {
                id:'', address:'', yrBuilt:'', sqFt:'', lotSize:'',
                dwellingType:'', dwellingUsage:'', occupancyType:'',
                numStories:'', numOccupants:'', bedrooms:'', fullBaths:'', halfBaths:'',
                construction:'', exterior:'', foundation:'',
                garage:{ type:'', spaces:'' },
                roof:{ type:'', shape:'', yr:'', update:'' },
                systems:{ heatingType:'', coolingType:'', plumbingYr:'', electricalYr:'', water:'', sewer:'' },
                hazards:{ alarms:'', pool:false, trampoline:false, dogs:'', woodStove:false, businessOnPremises:false,
                          fireStationDist:'', fireHydrantFeet:'', protectionClass:'', tidalWaterDist:'' },
                purchaseDate:'',
                // Coverage selections — what's actually being quoted
                coverages:{
                    dwellingA:'', otherStructuresB:'', personalPropertyC:'', lossOfUseD:'',
                    liabilityE:'', medPayF:'',
                    deductible:'', windHailDeductible:'',
                    replacementType:'',
                },
                // Common HO endorsements
                endorsements:{
                    waterBackup:false, equipmentBreakdown:false, serviceLine:false,
                    scheduledProperty:false, ordinanceLaw:false, identityTheft:false,
                },
                // Required for binding any mortgaged home
                mortgageCompany:{ name:'', loanNumber:'', address:'' },
            };
            case 'autos': return {
                id:'', year:'', make:'', model:'', vin:'',
                garagingZip:'', useType:'', annualMiles:'', ownership:'',
                oneWayMiles:'', daysPerWeek:'', antiTheftDevice:'',
                primaryOperatorId:'', additionalOperatorIds:[],
                coverages:{ liab:'', collDed:'', compDed:'', umuim:'', medpay:'', towingDed:'', rentalDed:'' },
                // Required for binding when ownership === 'Financed' or 'Leased'
                lienHolder:{ name:'', address:'', loanNumber:'' },
            };
            case 'boats': return {
                id:'', kind:'boat', year:'', make:'', model:'', length:'', hin:'',
                hullMaterial:'', hullDesign:'', propulsion:'', engineCount:'', totalHP:'', maxSpeed:'',
                modifications:'', mooringZip:'', navigationWaters:'', layUpMonths:'',
                marketValue:'', purchasePrice:'', addlEquipmentValue:'',
                trailer:{ year:'', make:'', capacityLbs:'', axles:'', value:'' },
                docs:{ billOfSale:false, dealerAppraisal:false, photos:false, marineSurvey:false },
                usage:{ pleasure:true, rental:false, charter:false, commercial:false },
                primaryOperatorId:'', additionalOperatorIds:[],
                coverages:{
                    hullValueType:'', liabilityLimit:'', deductible:'',
                    medPay:'', umBoater:'',
                    fuelSpillIncluded:false, personalEffects:'',
                },
                lienHolder:{ name:'', address:'', loanNumber:'' },
            };
            case 'rvs': return {
                id:'', class:'', year:'', make:'', model:'', length:'', vin:'',
                garagingZip:'', fullTimer:false, stationary:false, rentalCharter:false,
                marketValue:'', purchasePrice:'', addlEquipmentValue:'',
                totalLossReplacementRequested:false,
                primaryOperatorId:'', additionalOperatorIds:[],
                coverages:{
                    compDeductible:'', collDeductible:'',
                    liabilityLimit:'', vacationLiability:false, umuim:'', medPay:'',
                    personalEffects:'', awningDamage:false, emergencyExpense:false,
                },
                lienHolder:{ name:'', address:'', loanNumber:'' },
            };
            default: return { id:'' };
        }
    }
    // Exposed for tests
    window.IntakeV2._itemDefaults = itemDefaults;

    // Deep-merge incoming data over the default skeleton so missing keys
    // get their defaults but explicit values (including `false` / `0` / `''`)
    // pass through unchanged.
    function deepMergeDefaults(defaults, incoming) {
        if (incoming == null || typeof incoming !== 'object') return defaults;
        if (Array.isArray(defaults)) return Array.isArray(incoming) ? incoming : defaults;
        // Type-shape guard: if defaults expects an object but incoming is an
        // array (or vice versa, handled above), the shapes are incompatible —
        // fall back to defaults rather than treating the array's numeric
        // indices as object keys. Catches corrupt cloud-pulls cleanly.
        if (Array.isArray(incoming)) return defaults;
        const out = {};
        const keys = new Set([...Object.keys(defaults), ...Object.keys(incoming)]);
        for (const k of keys) {
            const d = defaults[k];
            const i = incoming[k];
            if (i === undefined) { out[k] = d; continue; }
            if (d && typeof d === 'object' && !Array.isArray(d) && i && typeof i === 'object' && !Array.isArray(i)) {
                out[k] = deepMergeDefaults(d, i);
            } else {
                out[k] = i;
            }
        }
        return out;
    }
    window.IntakeV2._deepMerge = deepMergeDefaults;

    // Set of scalar paths whose value is mirrored onto the primary/co-applicant
    // operator by syncApplicantOperators(). Used by the delegation listener to
    // avoid re-rendering the operator pool on every keystroke in non-synced
    // fields (phone, email, ssn, prefix, suffix).
    const OP_SYNC_FIELDS = ['firstName','middleName','lastName','dob','gender','maritalStatus','occupation','industry','education'];
    const OP_SYNC_PATHS = new Set([
        ...OP_SYNC_FIELDS.map(k => `applicant.${k}`),
        ...OP_SYNC_FIELDS.map(k => `coApplicant.${k}`),
        'coApplicant.present',
        'coApplicant.relationship',
    ]);

    // ─── Boot hook: install global delegation listener for scalar fields ──
    window.IntakeV2.onBoot(function () {
        const root = this._container;
        if (!root) return;

        // Cold load. `this.load()` returns a Promise (CryptoHelper.decrypt is
        // async). The boot hook itself is sync — it has to be, every other
        // module's boot hook expects a synchronous baseline — so we do an
        // initial paint with defaults, then re-paint once load resolves.
        // Without this, users with saved data saw the empty default form on
        // open (until something else triggered a rerender).
        const _loadPromise = Promise.resolve(this.load()).then((ok) => {
            if (!ok) return;
            this.syncApplicantOperators();
            this.applyData();
            // applyData runs requestRerender — that fans out to every
            // registered renderer, which by this point all exist.
        }).catch(err => {
            // eslint-disable-next-line no-console
            console.error('IntakeV2 load promise rejected:', err);
        });
        // First-paint with defaults (or with whatever sync-decoded data
        // happened to land in time on the fast path).
        this.syncApplicantOperators();

        // Delegated input listener: every scalar + collection field flows here.
        const handler = (e) => {
            const el = e.target;
            if (!(el instanceof HTMLElement)) return;
            if (!el.matches('input, select, textarea')) return;
            const path = window.FieldMapV2 && window.FieldMapV2.pathForElement(el);
            if (!path) return;
            const value = readDomValue(el);

            // Scalar (no `#` in path) vs collection (`coll#id.field`)
            if (path.indexOf('#') === -1) {
                this.setField(path, value);
                // Only the applicant/co-applicant fields that syncApplicantOperators()
                // actually copies need a resync — everything else (phone, email, ssn,
                // prefix, suffix) doesn't propagate to the operator, so re-rendering
                // the operator pool on every keystroke there was wasted DOM work.
                if (OP_SYNC_PATHS.has(path)) {
                    this.syncApplicantOperators();
                    this.requestRerender('operators');
                }
                // Co-applicant toggle also expands/collapses the Quick Start cluster.
                if (path === 'coApplicant.present') {
                    this.requestRerender('layout');
                }
            } else {
                const [collKey, rest] = path.split('#');
                const dot = rest.indexOf('.');
                const itemId = rest.slice(0, dot);
                const fieldPath = rest.slice(dot + 1);
                this.setItemField(collKey, itemId, fieldPath, value);
                // Operator-pool changes ripple to product cards (chip names)
                if (collKey === 'operators') this.requestRerender('operators');
            }
        };
        root.addEventListener('input',  handler);
        root.addEventListener('change', handler);

        // Initial paint: scalar values + all collection renderers.
        this.applyData();
    });

})();
