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
    // them. When unavailable or when they fail, we fall back to plaintext
    // JSON so the form is never blocked by a crypto failure.
    async function encryptOrPassthrough(plain) {
        if (window.CryptoHelper && typeof window.CryptoHelper.encrypt === 'function') {
            try {
                const r = window.CryptoHelper.encrypt(plain);
                const out = (r && typeof r.then === 'function') ? await r : r;
                if (typeof out === 'string' && out.length) return out;
            } catch (_) { /* fall back */ }
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
                if (window.ActivityLog) {
                    window.ActivityLog.add({
                        type: 'error', area: 'intake-v2', ok: false,
                        message: 'Intake v2 save failed',
                        detail: String(err && err.message || err),
                    });
                }
                // eslint-disable-next-line no-console
                console.error('IntakeV2.save failed:', err);
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

        // Ring buffer of last 5 field writes for the right-rail peek
        _pushLastEntry(entry) {
            this.lastEntries = this.lastEntries || [];
            this.lastEntries.unshift({ ...entry, at: Date.now() });
            this.lastEntries = this.lastEntries.slice(0, 5);
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
        addItem(collKey, partial) {
            const arr = this.data[collKey] = this.data[collKey] || [];
            const idPrefix = collKey === 'operators' ? 'op'
                          : collKey === 'homes'     ? 'home'
                          : collKey === 'autos'     ? 'auto'
                          : collKey === 'boats'     ? 'boat'
                          : collKey === 'rvs'       ? 'rv'
                          : 'item';
            const item = Object.assign(itemDefaults(collKey), partial || {});
            if (!item.id) item.id = newId(idPrefix);
            arr.push(item);
            this.save();
            this.requestRerender();
            return item;
        },
        removeItem(collKey, itemId) {
            const arr = this.data[collKey] || [];
            this.data[collKey] = arr.filter(x => x.id !== itemId);
            this.save();
            this.requestRerender();
        },
        getItem(collKey, itemId) {
            return (this.data[collKey] || []).find(x => x.id === itemId);
        },
        setItemField(collKey, itemId, path, value) {
            const item = this.getItem(collKey, itemId);
            if (!item) return;
            setByPath(item, path, value);
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
                // Remove the co-applicant operator AND unlink from products
                this.data.operators = ops.filter(o => !o.isCoApplicant);
                ['autos','boats','rvs'].forEach(coll => {
                    (this.data[coll] || []).forEach(item => {
                        if (item.primaryOperatorId === co.id) item.primaryOperatorId = '';
                        if (Array.isArray(item.additionalOperatorIds)) {
                            item.additionalOperatorIds = item.additionalOperatorIds.filter(id => id !== co.id);
                        }
                    });
                });
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
            };
            case 'autos': return {
                id:'', year:'', make:'', model:'', vin:'',
                garagingZip:'', useType:'', annualMiles:'', ownership:'',
                primaryOperatorId:'', additionalOperatorIds:[],
                coverages:{ liab:'', collDed:'', compDed:'', umuim:'', medpay:'', towingDed:'', rentalDed:'' },
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
            };
            case 'rvs': return {
                id:'', class:'', year:'', make:'', model:'', length:'', vin:'',
                garagingZip:'', fullTimer:false, stationary:false, rentalCharter:false,
                marketValue:'', purchasePrice:'', addlEquipmentValue:'',
                totalLossReplacementRequested:false,
                primaryOperatorId:'', additionalOperatorIds:[],
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

    // ─── Boot hook: install global delegation listener for scalar fields ──
    window.IntakeV2.onBoot(function () {
        const root = this._container;
        if (!root) return;

        // Cold load
        this.load();
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
                if (path.startsWith('applicant.') || path.startsWith('coApplicant.')) {
                    this.syncApplicantOperators();
                    this.requestRerender('operators');
                }
                if (path === 'coApplicant.present') {
                    this.syncApplicantOperators();
                    this.requestRerender('operators');
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
