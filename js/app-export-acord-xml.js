// js/app-export-acord-xml.js — ACORD-style XML export for EZLynx native Import Applicant
// Sibling of app-export-cmsmtf.js (HawkSoft tagged format) and exportPDF.
//
// Schema reference: Resources/archive/HawkSoft Export to EZLynx SAMPLE.xml.
// EZLynx accepts <EZAUTO xmlns="http://www.ezlynx.com/XMLSchema/Auto/V200">
// at the Import Applicant page; producer drops the .xml file and EZLynx
// parses it server-side. Zero browser automation, zero Material quirks.
//
// This is the safety-net path — when Build A's in-page extension is
// fragile or EZLynx's UI is in a weird state, the producer can always
// fall back to "give me the file, I'll import it."
'use strict';

Object.assign(App, {
    /**
     * Top-level export entry: build Auto and/or Home XML based on
     * the client's qType, download all relevant files, audit-log.
     * Wired to the "EZLynx XML" button in Step 6.
     *
     * V200 schemas are SEPARATE: <EZAUTO> for auto rating quotes,
     * <EZHOME> for home/dwelling. EZLynx Import Applicant accepts
     * either; producer drops the Auto file at Auto Quote import,
     * the Home file at Home Quote import.
     */
    exportEZLynxXML() {
        const data = this.data || {};
        const qType = data.qType || 'both';
        const includeAuto = qType === 'auto' || qType === 'both';
        const includeHome = qType === 'home' || qType === 'both';

        const downloads = [];
        if (includeAuto) {
            const auto = this.buildEZLynxXML();  // Auto path — back-compat name
            this.downloadFile(auto.content, auto.filename, auto.mime);
            downloads.push(auto.filename);
        }
        if (includeHome) {
            const home = this.buildEZLynxHomeXML();
            this.downloadFile(home.content, home.filename, home.mime);
            downloads.push(home.filename);
        }

        const label = downloads.length > 1 ? 'EZLynx XML (Auto + Home)' : 'EZLynx XML';
        this.logExport(label, downloads.join(', '));
        this.toast(`\u{1F4C4} ${downloads.length} file${downloads.length > 1 ? 's' : ''} downloaded — drop in EZLynx Import Applicant`);

        try {
            const key = window.STORAGE_KEYS && window.STORAGE_KEYS.EZLYNX_XML_LAST_EXPORT;
            if (key) {
                localStorage.setItem(key, JSON.stringify({
                    ts: new Date().toISOString(),
                    qType,
                    files: downloads,
                }));
            }
        } catch (_) { /* best-effort audit */ }
    },

    /**
     * Pure data → XML transform. Returns {content, filename, mime}.
     * Uses App.exportClientJsonForFiller() as the data source so the
     * existing wire-format contract test covers field correctness.
     * No DOM access, no side effects — safe for unit testing.
     */
    buildEZLynxXML() {
        const flat = this.exportClientJsonForFiller();
        const drivers = Array.isArray(this.drivers) ? this.drivers : [];
        const vehicles = Array.isArray(this.vehicles) ? this.vehicles : [];
        const data = this.data || {};

        // ── XML helpers ────────────────────────────────────────
        // Escape per XML spec — only the 5 chars matter for element
        // text content. We don't emit attributes from user data so
        // attribute escaping is moot.
        const xesc = (v) => {
            if (v === null || v === undefined) return '';
            return String(v)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        };

        // <Tag>value</Tag> — emits empty self-close-style when value is
        // empty/null so the structure stays parseable.
        const tag = (name, value) => {
            const v = xesc(value);
            return v ? `<${name}>${v}</${name}>` : `<${name}></${name}>`;
        };

        // Conditional tag — only emits the element when value is truthy.
        // Use for optional fields where EZLynx prefers absence over
        // empty-string (Drivers/Vehicles arrays etc.).
        const tagIf = (name, value) => {
            const v = xesc(value);
            return v ? `<${name}>${v}</${name}>` : '';
        };

        // ── Date conversion ────────────────────────────────────
        // Altech stores dates as YYYY-MM-DD (HTML date input native).
        // ACORD/EZLynx XML expects YYYY-MM-DD for DOB/Effective dates,
        // so most pass through unchanged. The wire format (MM/DD/YYYY)
        // we use for the Playwright filler is NOT what XML wants.
        const isoDate = (val) => {
            if (!val) return '';
            const s = String(val);
            // Already YYYY-MM-DD — pass through
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
            // MM/DD/YYYY → YYYY-MM-DD (covers exportClientJsonForFiller's
            // MM/DD/YYYY DOB output, in case caller pre-converted)
            const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (m) {
                const mm = m[1].padStart(2, '0');
                const dd = m[2].padStart(2, '0');
                return `${m[3]}-${mm}-${dd}`;
            }
            return s; // unknown format — emit as-is
        };

        // ── Address parsing ────────────────────────────────────
        // ACORD splits street into <StreetNumber> + <StreetName>.
        // Altech stores combined "123 Main St" — split on first space
        // when the prefix looks numeric. Keeps the rest intact.
        const splitStreet = (raw) => {
            if (!raw) return { number: '', name: '' };
            const s = String(raw).trim();
            const m = s.match(/^(\d+\S*)\s+(.+)$/);
            if (m) return { number: m[1], name: m[2] };
            return { number: '', name: s };
        };

        // ZIP split: "98686-1234" → 98686 + 1234. "98686" → 98686 + ''.
        const splitZip = (raw) => {
            if (!raw) return { zip5: '', zip4: '' };
            const s = String(raw).trim();
            const m = s.match(/^(\d{5})(?:-?(\d{4}))?$/);
            if (m) return { zip5: m[1], zip4: m[2] || '' };
            return { zip5: s, zip4: '' };
        };

        // ── Value normalizers (carrier-agnostic enums) ─────────
        // Altech stores 'M'/'F'/etc. EZLynx expects 'Male'/'Female'.
        const expandGender = (g) => {
            const x = (g || '').toString().trim().toUpperCase();
            if (x === 'M' || x === 'MALE')   return 'Male';
            if (x === 'F' || x === 'FEMALE') return 'Female';
            if (x === 'X' || x === 'NB')     return 'Not Specified';
            return g || '';
        };

        // Altech stores 'BA'/'MA'/etc. abbreviations; EZLynx XML doesn't
        // require Education at all (it's UI-only). Pass-through any
        // other dropdown values that match EZLynx options.
        const passThrough = (v) => v == null ? '' : String(v);

        // ── Build the address blocks (used twice — Applicant + Garage) ─
        // Two variants:
        //   - addr            : street/city/state/zip ONLY, fully closed.
        //                       Used inside <ResidenceInfo><GarageLocation>.
        //   - fullAddress     : adds <Phone> + <Email> before the close.
        //                       Used inside <Applicant>.
        const street = splitStreet(data.addrStreet);
        const zip = splitZip(data.addrZip);
        const addrInner = [
            '<AddressCode>StreetAddress</AddressCode>',
            '<Addr1>',
            tag('StreetName', street.name),
            tag('StreetNumber', street.number),
            '</Addr1>',
            tag('City', data.addrCity),
            tag('StateCode', data.addrState),
            tag('County', data.county),
            tag('Zip5', zip.zip5),
            tag('Zip4', zip.zip4),
        ].join('');
        const addr = `<Address>${addrInner}</Address>`;

        const phoneEmailInsideAddress = (() => {
            const phone = (data.phone || '').replace(/\D/g, '');
            const out = [];
            // V200 EZAUTO uses 0-indexed Phone ids per HawkSoft sample.
            // Multiple phones would be id="0", id="1", ...
            if (phone) {
                out.push('<Phone id="0">');
                out.push(tag('PhoneType', 'Mobile'));
                out.push(tag('PhoneNumber', phone));
                out.push('<Extension></Extension>');
                out.push('</Phone>');
            }
            out.push(tag('Email', data.email));
            return out.join('');
        })();
        // <YearsAtAddress>: V200 EZHOME-confirmed; cross-porting to V200
        // EZAUTO since both schemas share most Address shape. If EZAUTO
        // rejects this, revert this single tag — see PR #58 batch 2 plan.
        const yearsAtAddressTag = tagIf('YearsAtAddress', data.yearsAtAddress);
        const fullAddress = `<Address>${addrInner}${phoneEmailInsideAddress}${yearsAtAddressTag}</Address>`;

        // ── <Applicant> primary ────────────────────────────────
        // Industry/Occupation: V200 EZHOME-confirmed at PersonalInfo level.
        // Cross-porting to V200 EZAUTO at the Applicant level ONLY (not
        // per-driver — that's what likely broke the prior batch in PR #58
        // commit f92247e). If this still breaks deserialization, the next
        // suspect is the Applicant-level pair too — revert as a unit.
        const primaryApplicant = [
            '<Applicant>',
            tag('ApplicantType', 'Applicant'),
            '<PersonalInfo>',
            '<Name>',
            tag('FirstName', data.firstName),
            tag('MiddleName', data.middleName),
            tag('LastName', data.lastName),
            '</Name>',
            tag('DOB', isoDate(data.dob)),
            tag('Gender', expandGender(data.gender)),
            tag('MaritalStatus', passThrough(data.maritalStatus)),
            tag('Relation', 'Insured'),
            tagIf('Industry', data.industry),
            tagIf('Occupation', data.occupation),
            '</PersonalInfo>',
            fullAddress,
            '</Applicant>',
        ].join('');

        // ── Co-applicant (if present) ──────────────────────────
        // Altech stores co-applicant in App.data.coFirstName etc. when
        // populated; we emit an Applicant block when at least the name
        // exists so EZLynx pairs them correctly on import.
        const coApplicant = (() => {
            const co = data;  // co-applicant fields live on App.data with co* prefix
            if (!co.coFirstName && !co.coLastName) return '';
            return [
                '<Applicant>',
                tag('ApplicantType', 'CoApplicant'),
                '<PersonalInfo>',
                '<Name>',
                tag('FirstName', co.coFirstName),
                tag('MiddleName', co.coMiddleName || ''),
                tag('LastName', co.coLastName),
                '</Name>',
                tagIf('DOB', isoDate(co.coDob)),
                tagIf('Gender', expandGender(co.coGender)),
                tagIf('MaritalStatus', co.coMaritalStatus),
                tag('Relation', co.coRelationship || 'Spouse'),
                '</PersonalInfo>',
                fullAddress, // co-app shares address by default
                '</Applicant>',
            ].join('');
        })();

        // ── Prior policy info ──────────────────────────────────
        // Optional — only emit when there's a prior carrier on file.
        // V200 EZHOME's John_Smith sample shows YearsWithPriorCarrier can
        // hold both <Years> and <Months>. Cross-porting <YearsWithContinuousCoverage>
        // (also EZHOME-confirmed) here for EZAUTO too — user reported the
        // continuous coverage field as missing post-import.
        const priorPolicy = (() => {
            if (!data.priorCarrier && !data.priorYears && !data.priorExp && !data.continuousCoverage) return '';
            const yrs = data.priorYears
                ? `<YearsWithPriorCarrier><Years>${xesc(data.priorYears)}</Years></YearsWithPriorCarrier>`
                : '';
            const cont = data.continuousCoverage
                ? `<YearsWithContinuousCoverage><Years>${xesc(data.continuousCoverage)}</Years></YearsWithContinuousCoverage>`
                : '';
            return [
                '<PriorPolicyInfo>',
                tagIf('PriorCarrier', data.priorCarrier),
                tagIf('PriorPolicyTerm', data.priorPolicyTerm),
                tagIf('Expiration', isoDate(data.priorExp)),
                yrs,
                cont,
                '</PriorPolicyInfo>',
            ].join('');
        })();

        // ── Policy info (effective date + term for new policy) ─
        // CreditCheckAuth + Package: V200 EZHOME-confirmed in PolicyInfo.
        // Cross-porting to V200 EZAUTO here. Package=Yes when qType=both
        // (signals "quote auto and home together" — a multi-policy discount
        // hint to the rating engine).
        const policyInfo = (() => {
            const credit = (() => {
                const v = data.creditCheckAuth;
                if (v === true || v === 'true' || v === 'yes' || v === 'Yes' || v === '1') return 'Yes';
                if (v === false || v === 'false' || v === 'no' || v === 'No' || v === '0') return 'No';
                return '';
            })();
            const isPackage = data.qType === 'both';
            if (!data.policyTerm && !data.effectiveDate && !credit && !isPackage) return '';
            return [
                '<PolicyInfo>',
                tagIf('PolicyTerm', data.policyTerm),
                tag('Package', isPackage ? 'Yes' : 'No'),
                tagIf('Effective', isoDate(data.effectiveDate)),
                tagIf('CreditCheckAuth', credit),
                '</PolicyInfo>',
            ].join('');
        })();

        // ── Garage location (mirror of primary address) ────────
        const residenceInfo = [
            '<ResidenceInfo>',
            '<GarageLocation>',
            addr,  // address WITHOUT phone/email (just the location)
            '</GarageLocation>',
            '</ResidenceInfo>',
        ].join('');

        // ── Drivers ────────────────────────────────────────────
        const driverXml = drivers.length ? [
            '<Drivers>',
            ...drivers.map((d, i) => {
                const id = i + 1;
                const violations = (Array.isArray(d.violationList) ? d.violationList : [])
                    .map(v => `<Violation>${tagIf('Date', isoDate(v.date))}${tagIf('Description', v.description)}</Violation>`)
                    .join('');
                // DateLicensed: V200 EZAUTO supports a date — try the
                // driver's stored dateLicensed, else compute DOB + ageLicensed
                // years (fallback from Altech's data shape). YYYY-MM-DD only.
                let dateLicensed = isoDate(d.dateLicensed);
                if (!dateLicensed && d.dob && d.ageLicensed) {
                    const dobIso = isoDate(d.dob);
                    const m = dobIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                    const ageNum = parseInt(String(d.ageLicensed).replace(/\D/g, ''), 10);
                    if (m && Number.isFinite(ageNum) && ageNum > 0 && ageNum < 100) {
                        dateLicensed = `${parseInt(m[1], 10) + ageNum}-${m[2]}-${m[3]}`;
                    }
                }
                // PrincipalVehicle: which vehicle this driver primarily
                // drives. For driver 0 (insured), default to vehicle 1
                // when at least one vehicle exists. Schema confirmed via
                // HawkSoft sample.
                const principalVehicle = d.principalVehicle
                    || (i === 0 && vehicles.length ? '1' : '');
                return [
                    `<Driver id="${id}">`,
                    '<Name>',
                    tag('FirstName', d.firstName),
                    tagIf('MiddleName', d.middleName),
                    tag('LastName', d.lastName),
                    '</Name>',
                    tag('Gender', expandGender(d.gender)),
                    tag('DOB', isoDate(d.dob)),
                    tagIf('DLNumber', d.dlNum),
                    tagIf('DLState', d.dlState),
                    tagIf('DateLicensed', dateLicensed),
                    tagIf('MaritalStatus', d.maritalStatus),
                    i === 0 ? tag('Relation', 'Insured') : tagIf('Relation', d.relationship),
                    tagIf('GoodStudent', d.goodStudent || 'No'),
                    tagIf('MATDriver', d.matureDriver || 'No'),
                    tagIf('Rated', d.ratedDriver || 'Rated'),
                    tagIf('PrincipalVehicle', principalVehicle),
                    violations,
                    '</Driver>',
                ].join('');
            }),
            '</Drivers>',
        ].join('') : '';

        // ── Vehicles ───────────────────────────────────────────
        const vehicleXml = vehicles.length ? [
            '<Vehicles>',
            ...vehicles.map((v, i) => {
                const id = i + 1;
                return [
                    `<Vehicle id="${id}">`,
                    tag('UseVinLookup', v.vin ? 'Yes' : 'No'),
                    tagIf('Year', v.year),
                    tagIf('Vin', v.vin),
                    tagIf('Make', v.make),
                    tagIf('Model', v.model),
                    tagIf('Anti-Theft', v.antiTheft || 'None'),
                    tagIf('PassiveRestraints', v.passiveRestraints || 'None'),
                    tagIf('StatedAmount', v.statedAmount),
                    // OwnershipType: Owned / Leased / Lien — common ACORD field,
                    // user reported as missing post-import. Altech stores this
                    // per-vehicle as vehicle.ownershipType.
                    tagIf('OwnershipType', v.ownershipType),
                    '</Vehicle>',
                ].join('');
            }),
            '</Vehicles>',
        ].join('') : '';

        // ── Vehicle use (usage + miles + principal driver) ─────
        // Schema confirmed via HawkSoft AJK.xml sample. Important:
        //   - <Useage> is spelled with the typo — DO NOT correct.
        //   - <PrincipalOperator> cross-references Driver id.
        //   - Either OneWayMiles or AnnualMiles depending on Use type.
        const vehicleUseXml = vehicles.length ? [
            '<VehiclesUse>',
            ...vehicles.map((v, i) => {
                const id = i + 1;
                // Default Useage = "Pleasure" when not specified, matches
                // HawkSoft's behavior. Altech's vehicle.use field follows
                // the same enum (Pleasure/Commute/Business/Farm/Artisan).
                const useage = v.use || v.useage || 'Pleasure';
                // PrincipalOperator: which driver primarily uses this
                // vehicle. Defaults to driver 1 (insured) when not set.
                const principalOperator = v.principalOperator
                    || (drivers.length ? '1' : '');
                return [
                    `<VehicleUse id="${id}">`,
                    tag('Useage', useage),
                    tagIf('OneWayMiles', v.oneWayMiles),
                    tagIf('AnnualMiles', v.annualMiles),
                    tagIf('PrincipalOperator', principalOperator),
                    '</VehicleUse>',
                ].join('');
            }),
            '</VehiclesUse>',
        ].join('') : '';

        // ── Coverages ──────────────────────────────────────────
        // GeneralCoverage from policy-wide limits (Altech: liabilityLimits,
        // pdLimit, umLimits, uimLimits). VehicleCoverage from per-vehicle
        // deductibles (Altech: compDeductible, autoDeductible, towingDeductible,
        // rentalDeductible — currently policy-wide in Altech, replicated
        // per-vehicle here). StateSpecificCoverage for WA-PIP / WA-UMPD etc.
        const coveragesXml = (() => {
            const general = [
                '<GeneralCoverage>',
                tagIf('BI', data.liabilityLimits),
                tagIf('PD', data.pdLimit),
                tagIf('UM', data.umLimits),
                tagIf('UIM', data.uimLimits),
                vehicles.length > 1 ? '<Multicar>Yes</Multicar>' : '',
                '</GeneralCoverage>',
            ].join('');

            const perVehicle = vehicles.map((_v, i) => {
                const id = i + 1;
                return [
                    `<VehicleCoverage id="${id}">`,
                    tagIf('OtherCollisionDeductible', data.compDeductible),
                    tagIf('CollisionDeductible', data.autoDeductible),
                    tagIf('TowingDeductible', data.towingDeductible),
                    tagIf('RentalDeductible', data.rentalDeductible),
                    '</VehicleCoverage>',
                ].join('');
            }).join('');

            // State-specific block — only emit when applicable state has values.
            const state = (data.addrState || '').toUpperCase();
            const stateBlock = (() => {
                if (state === 'WA' && (data.umpdLimit || data.pipLimit)) {
                    return [
                        '<StateSpecificCoverage>',
                        '<WA-Coverages>',
                        tagIf('WA-UMPD', data.umpdLimit),
                        tagIf('WA-PIP', data.pipLimit),
                        '</WA-Coverages>',
                        '</StateSpecificCoverage>',
                    ].join('');
                }
                return '';
            })();

            return ['<Coverages>', general, perVehicle, stateBlock, '</Coverages>'].join('');
        })();

        // ── VehicleAssignments (driver→vehicle cross-reference) ─
        // Schema confirmed via HawkSoft AJK.xml: each <VehicleAssignment>
        // contains a self-closing <DriverAssignment id="N"/> with the
        // driver id. Empty <DriverAssignment/> (what we used to emit) is
        // useless — the cross-reference is what makes EZLynx's rating
        // engine know which driver primarily uses which vehicle.
        // Default: assign every vehicle to driver 1 (insured) unless
        // the vehicle has its own principalOperator set.
        const assignmentsXml = vehicles.length ? [
            '<VehicleAssignments>',
            ...vehicles.map((v, i) => {
                const driverId = v.principalOperator
                    || (drivers.length ? '1' : '1');
                return `<VehicleAssignment id="${i + 1}"><DriverAssignment id="${driverId}"/></VehicleAssignment>`;
            }),
            '</VehicleAssignments>',
        ].join('') : '';

        // ── Assemble document ──────────────────────────────────
        const xml = '<EZAUTO xmlns="http://www.ezlynx.com/XMLSchema/Auto/V200">'
            + primaryApplicant
            + coApplicant
            + priorPolicy
            + policyInfo
            + residenceInfo
            + driverXml
            + vehicleXml
            + vehicleUseXml
            + coveragesXml
            + assignmentsXml
            + '</EZAUTO>';

        const fileName = `EZLynx_Import_${data.lastName || 'Client'}_${new Date().toISOString().split('T')[0]}.xml`;
        return { content: xml, filename: fileName, mime: 'application/xml;charset=utf-8' };
    },

    /**
     * Pure data → V200 EZHOME XML transform. Returns {content, filename, mime}.
     *
     * Schema reverse-engineered from a real EZLynx export
     * (Resources/John_Smith_Home.xml). Different root (<EZHOME>), different
     * structure than Auto: top-level Applicant/PriorPolicyInfo/PolicyInfo/
     * RatingInfo/ReplacementCost/Endorsements/GeneralInfo with no
     * AltDwelling/ResidenceInfo wrapper — the property is the single
     * subject so applicant address IS the dwelling location.
     *
     * Critical schema gotchas preserved (verified against the real export):
     *   - <DeductibeInfo> (typo — DO NOT correct to "Deductible")
     *   - <ProtectionClass> not <ProtectionClassType>
     *   - DistanceToFireHydrant uses range text ("601-1000"), not raw feet
     *   - V200 EZHOME accepts <Industry>/<Occupation> at PersonalInfo level;
     *     V200 EZAUTO does NOT (caused deserialization error in PR #58).
     *   - Endorsements: ProtectiveDevices wraps BurglarAlarm only — no
     *     SmokeDetector/FireExtinguisher wrappers (sample doesn't have them).
     */
    buildEZLynxHomeXML() {
        const data = this.data || {};

        // Reuse the same XML helpers
        const xesc = (v) => {
            if (v === null || v === undefined) return '';
            return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        };
        const tag = (name, value) => {
            const v = xesc(value);
            return v ? `<${name}>${v}</${name}>` : `<${name}></${name}>`;
        };
        const tagIf = (name, value) => {
            const v = xesc(value);
            return v ? `<${name}>${v}</${name}>` : '';
        };
        const isoDate = (val) => {
            if (!val) return '';
            const s = String(val);
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
            const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
            return s;
        };
        const splitStreet = (raw) => {
            if (!raw) return { number: '', name: '' };
            const m = String(raw).trim().match(/^(\d+\S*)\s+(.+)$/);
            return m ? { number: m[1], name: m[2] } : { number: '', name: String(raw).trim() };
        };
        const splitZip = (raw) => {
            if (!raw) return { zip5: '', zip4: '' };
            const m = String(raw).trim().match(/^(\d{5})(?:-?(\d{4}))?$/);
            return m ? { zip5: m[1], zip4: m[2] || '' } : { zip5: String(raw).trim(), zip4: '' };
        };
        const expandGender = (g) => {
            const x = (g || '').toString().trim().toUpperCase();
            if (x === 'M' || x === 'MALE')   return 'Male';
            if (x === 'F' || x === 'FEMALE') return 'Female';
            if (x === 'X' || x === 'NB')     return 'Not Specified';
            return g || '';
        };

        // ── DistanceToFireHydrant range mapping ────────────────
        // V200 EZHOME wants range text per HawkSoft sample. Altech stores
        // raw feet (number). Standard ISO/HO ranges.
        const fireHydrantRange = (feet) => {
            if (feet === undefined || feet === null || feet === '') return '';
            const f = parseInt(String(feet).replace(/\D/g, ''), 10);
            if (!Number.isFinite(f)) return '';
            if (f <= 500)  return '0-500';
            if (f <= 600)  return '501-600';
            if (f <= 1000) return '601-1000';
            return '1001+';
        };

        // ── Address blocks (reused for Applicant + AltDwelling) ─
        const street = splitStreet(data.addrStreet);
        const zip = splitZip(data.addrZip);
        const addrInner = [
            '<AddressCode>StreetAddress</AddressCode>',
            '<Addr1>',
            tag('StreetName', street.name),
            tag('StreetNumber', street.number),
            '</Addr1>',
            tag('City', data.addrCity),
            tag('StateCode', data.addrState),
            tag('County', data.county),
            tag('Zip5', zip.zip5),
            tag('Zip4', zip.zip4),
        ].join('');

        // V200 EZHOME's Phone block is NOT id-keyed (unlike EZAUTO's
        // Phone id="0"). Sample shows bare <Phone><PhoneType>... with
        // no id attribute. Match exactly.
        const phoneEmailInside = (() => {
            const phone = (data.phone || '').replace(/\D/g, '');
            const out = [];
            if (phone) {
                out.push('<Phone>');
                out.push(tag('PhoneType', 'Mobile'));
                out.push(tag('PhoneNumber', phone));
                out.push('</Phone>');
            }
            out.push(tag('Email', data.email));
            return out.join('');
        })();
        // V200 EZHOME accepts <YearsAtAddress> inside <Address>. User
        // reported this as missing on the Personal Lines Applicant page.
        const yearsAtAddressTag = tagIf('YearsAtAddress', data.yearsAtAddress);
        const fullAddress = `<Address>${addrInner}${phoneEmailInside}${yearsAtAddressTag}</Address>`;

        // ── <Applicant> ────────────────────────────────────────
        // V200 EZHOME PersonalInfo includes Industry & Occupation
        // (verified via real EZLynx export — John_Smith_Home.xml).
        // EZAUTO PersonalInfo does NOT — see PR #58 revert.
        const applicant = [
            '<Applicant>',
            tag('ApplicantType', 'Applicant'),
            '<PersonalInfo>',
            '<Name>',
            tag('FirstName', data.firstName),
            tag('MiddleName', data.middleName),
            tag('LastName', data.lastName),
            '</Name>',
            tag('DOB', isoDate(data.dob)),
            tag('Gender', expandGender(data.gender)),
            tag('MaritalStatus', data.maritalStatus || ''),
            tag('Relation', 'Insured'),
            tagIf('Industry', data.industry),
            tagIf('Occupation', data.occupation),
            '</PersonalInfo>',
            fullAddress,
            '</Applicant>',
        ].join('');

        // ── <PriorPolicyInfo> ──────────────────────────────────
        // V200 EZHOME nests Years and Months separately under both
        // YearsWithPriorCarrier and YearsWithContinuousCoverage.
        const priorPolicy = (() => {
            const carrier = data.homePriorCarrier || data.priorCarrier;
            const exp = data.homePriorExp || data.priorExp;
            const yearsCarrier = data.homePriorYears || data.priorYears;
            const yearsCont = data.continuousCoverage;
            if (!carrier && !exp && !yearsCarrier && !yearsCont) return '';
            const parts = ['<PriorPolicyInfo>'];
            if (carrier) parts.push(tag('PriorCarrier', carrier));
            if (exp) parts.push(tag('Expiration', isoDate(exp)));
            if (yearsCarrier) {
                parts.push('<YearsWithPriorCarrier>');
                parts.push(tag('Years', yearsCarrier));
                parts.push('</YearsWithPriorCarrier>');
            }
            if (yearsCont) {
                parts.push('<YearsWithContinuousCoverage>');
                parts.push(tag('Years', yearsCont));
                parts.push('</YearsWithContinuousCoverage>');
            }
            parts.push('</PriorPolicyInfo>');
            return parts.join('');
        })();

        // ── <PolicyInfo> ────────────────────────────────────────
        // V200 EZHOME PolicyInfo per real export: PolicyTerm, PolicyType,
        // Package, Effective, CreditCheckAuth.
        const policyInfo = (() => {
            const term = data.homePolicyTerm || data.policyTerm;
            const eff = data.homeEffectiveDate || data.effectiveDate;
            const policyType = data.homePolicyType;  // HO3/HO5/HO6
            const isPackage = data.qType === 'both';
            const credit = (() => {
                const v = data.creditCheckAuth;
                if (v === true || v === 'true' || v === 'yes' || v === 'Yes' || v === '1') return 'Yes';
                if (v === false || v === 'false' || v === 'no' || v === 'No' || v === '0') return 'No';
                return '';
            })();
            if (!term && !eff && !policyType && !credit) return '';
            return [
                '<PolicyInfo>',
                tagIf('PolicyTerm', term),
                tagIf('PolicyType', policyType),
                tag('Package', isPackage ? 'Yes' : 'No'),
                tagIf('Effective', isoDate(eff)),
                tagIf('CreditCheckAuth', credit),
                '</PolicyInfo>',
            ].join('');
        })();

        // ── Yes/No coercion for select fields ──────────────────
        const yesNo = (v) => {
            if (v === true) return 'Yes';
            if (v === false) return 'No';
            if (v == null || v === '') return '';
            const s = String(v).trim().toLowerCase();
            if (s === 'yes' || s === 'true' || s === '1' || s === 'y') return 'Yes';
            if (s === 'no'  || s === 'false'|| s === '0' || s === 'n' || s === 'none') return 'No';
            return String(v);  // pass-through for non-boolean values like "Owner Occupied"
        };

        // ── <RatingInfo> — full property characteristics ───────
        // Field names verified against John_Smith_Home.xml. Critical
        // corrections from prior version:
        //   - ProtectionClassType → ProtectionClass
        //   - PurchasePrice removed (not in schema; PurchaseDate is)
        const ratingInfo = [
            '<RatingInfo>',
            tagIf('YearBuilt', data.yrBuilt),
            tagIf('Dwelling', data.dwellingType),
            tagIf('NumberOfOccupants', data.numOccupants),
            tagIf('DwellingUse', data.dwellingUsage),
            tagIf('DwellingOccupancy', data.occupancyType),
            tagIf('DistanceToFireHydrant', fireHydrantRange(data.fireHydrantFeet)),
            tagIf('DistanceToFireStation', data.fireStationDist),
            tagIf('ProtectionClass', data.protectionClass),
            tagIf('NumberOfStories', data.numStories),
            tagIf('NumberOfFullBaths', data.fullBaths),
            tagIf('NumberOfHalfBaths', data.halfBaths),
            tagIf('Construction', data.constructionStyle),
            tag('Structure', 'Dwelling'),
            tagIf('Roof', data.roofType),
            tagIf('SwimmingPool', yesNo(data.pool)),
            tagIf('DogOnPremises', data.dogInfo ? 'Yes' : ''),
            tagIf('HeatingType', data.heatingType),
            tagIf('RoofingUpdateYear', data.roofYr),
            tagIf('ElectricalUpdateYear', data.elecYr),
            tagIf('PlumbingUpdateYear', data.plumbYr),
            tagIf('HeatingUpdateYear', data.heatYr),
            tagIf('SquareFootage', data.sqFt),
            tagIf('PurchaseDate', isoDate(data.purchaseDate)),
            tagIf('Trampoline', yesNo(data.trampoline)),
            tagIf('BusinessOnPremises', yesNo(data.businessOnProperty)),
            tagIf('Foundation', data.foundation),
            tagIf('RoofDesign', data.roofShape),
            '</RatingInfo>',
        ].filter(s => s !== '').join('');

        // ── <ReplacementCost> + <RatingCredits> ────────────────
        // Real V200 EZHOME export structure:
        //   <ReplacementCost>
        //     <ReplacementCost>{total}</ReplacementCost>  (nested!)
        //     <Dwelling>...</Dwelling>
        //     <LossOfUse>...</LossOfUse>
        //     <PersonalLiability>...</PersonalLiability>
        //     <MedicalPayments>...</MedicalPayments>
        //     <DeductibeInfo>            ← typo preserved
        //       <Deductible>500</Deductible>
        //     </DeductibeInfo>
        //     <RatingCredits>...</RatingCredits>
        //   </ReplacementCost>
        const ratingCredits = [
            '<RatingCredits>',
            tag('RetireesCredit', 'No'),
            tag('MatureDiscount', 'No'),
            tag('RetirementCommunity', 'No'),
            tag('LimitedAccessCommunity', 'No'),
            tag('GatedCommunity', 'No'),
            tag('Multipolicy', (data.qType === 'both') ? 'Yes' : 'No'),
            '</RatingCredits>',
        ].join('');

        // DeductibeInfo: nested when value present, self-closing when not.
        const deductibleBlock = data.homeDeductible
            ? `<DeductibeInfo>${tag('Deductible', data.homeDeductible)}</DeductibeInfo>`
            : '<DeductibeInfo/>';

        const replacementCost = [
            '<ReplacementCost>',
            tagIf('ReplacementCost', data.dwellingCoverage),  // total = Dwelling cov A
            tagIf('Dwelling', data.dwellingCoverage),
            tagIf('OtherStructures', data.otherStructures),
            tagIf('LossOfUse', data.homeLossOfUse),
            tagIf('PersonalProperty', data.homePersonalProperty),
            tagIf('PersonalLiability', data.personalLiability),
            tagIf('MedicalPayments', data.medicalPayments),
            deductibleBlock,
            ratingCredits,
            '</ReplacementCost>',
        ].filter(s => s !== '').join('');

        // ── <Endorsements> — match real export structure ───────
        // Real export shows: SpecialPersonalProperty, ProtectiveDevices
        // (BurglarAlarm only — no SmokeDetector wrapper), Sinkhole.
        // Earthquake/SPP/RC nested doubles in prior version were guesses
        // and did not match the real schema.
        const endorsements = [
            '<Endorsements>',
            tag('SpecialPersonalProperty', data.scheduledItems ? 'Yes' : 'No'),
            '<ProtectiveDevices>',
            '<BurglarAlarm>',
            tag('DeadBolt', 'No'),
            tag('VisibleToNeighbor', 'No'),
            tag('MannedSecurity', 'No'),
            '</BurglarAlarm>',
            '</ProtectiveDevices>',
            '<Sinkhole>',
            tag('SinkholeCollapse', 'No'),
            '</Sinkhole>',
            '</Endorsements>',
        ].join('');

        // ── <GeneralInfo> — required by V200 EZHOME ────────────
        // Real export has <RatingStateCode> here. Use addrState since
        // home state = applicant address state.
        const generalInfo = `<GeneralInfo>${tagIf('RatingStateCode', data.addrState)}</GeneralInfo>`;

        // ── Assemble document ──────────────────────────────────
        // Note: real export has no <AltDwelling> and no <LossInfo>;
        // applicant address IS the dwelling location.
        const xml = '<EZHOME xmlns="http://www.ezlynx.com/XMLSchema/Home/V200">'
            + applicant
            + priorPolicy
            + policyInfo
            + ratingInfo
            + replacementCost
            + endorsements
            + generalInfo
            + '</EZHOME>';

        const fileName = `EZLynx_Home_Import_${data.lastName || 'Client'}_${new Date().toISOString().split('T')[0]}.xml`;
        return { content: xml, filename: fileName, mime: 'application/xml;charset=utf-8' };
    },
});
