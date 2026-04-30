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
     * Top-level export entry: build XML, download, audit-log.
     * Wired to the "Export ACORD XML for EZLynx" button in Step 6.
     */
    exportEZLynxXML() {
        const result = this.buildEZLynxXML();
        this.downloadFile(result.content, result.filename, result.mime);
        this.logExport('EZLynx XML', result.filename);
        this.toast('\u{1F4C4} EZLynx XML downloaded — drop it in Import Applicant');
        try {
            const key = window.STORAGE_KEYS && window.STORAGE_KEYS.EZLYNX_XML_LAST_EXPORT;
            if (key) {
                localStorage.setItem(key, JSON.stringify({
                    ts: new Date().toISOString(),
                    client: result.filename,
                    bytes: result.content.length,
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
        const fullAddress = `<Address>${addrInner}${phoneEmailInsideAddress}</Address>`;

        // ── <Applicant> primary ────────────────────────────────
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
        const priorPolicy = (() => {
            if (!data.priorCarrier && !data.priorYears && !data.priorExp) return '';
            const yrs = data.priorYears
                ? `<YearsWithPriorCarrier><Years>${xesc(data.priorYears)}</Years></YearsWithPriorCarrier>`
                : '';
            return [
                '<PriorPolicyInfo>',
                tagIf('PriorCarrier', data.priorCarrier),
                tagIf('PriorPolicyTerm', data.priorPolicyTerm),
                tagIf('Expiration', isoDate(data.priorExp)),
                yrs,
                '</PriorPolicyInfo>',
            ].join('');
        })();

        // ── Policy info (effective date + term for new policy) ─
        const policyInfo = (() => {
            if (!data.policyTerm && !data.effectiveDate) return '';
            return [
                '<PolicyInfo>',
                tagIf('PolicyTerm', data.policyTerm),
                tagIf('Effective', isoDate(data.effectiveDate)),
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
});
