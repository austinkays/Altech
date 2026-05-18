// intake-v2-export-ezlynx.js — Native EZLynx V200 EZAUTO + EZHOME builders.
//
// Replaces the previous legacy bridge (intake-v2-export-map.js → toLegacyShape
// → App.buildEZLynxXML / App.buildEZLynxHomeXML). The legacy path silently
// dropped CreditCheckAuth, YearsWithContinuousCoverage, vehicle telematics/
// TNC/carpool/anti-lock/DRL, driver SR-22 / FR-44, per-driver occupation, and
// — most importantly for home — the actual deductible value inside the
// (typo-named) <DeductibeInfo/> wrapper, plus PolicyType, PersonalLiability,
// MedicalPayments, NumberOfOccupants, DwellingOccupancy, NumberOfFullBaths/
// HalfBaths, DistanceToFireStation, SwimmingPool, DogOnPremises, Trampoline,
// BusinessOnPremises, Foundation, RoofDesign, all "*UpdateYear" fields,
// PurchaseDate, PreferredContactMethod, YearsAtAddress, Industry/Occupation,
// and the FirstMortgagee flag.
//
// V200 schema references:
//   - Auto: Resources/archive/HawkSoft Export to EZLynx SAMPLE.xml
//   - Home: Resources/John_Smith_Home.xml
//
// Boats and RVs are intentionally NOT exported — EZLynx personal lines has no
// native boat/RV rater. The orchestrator gates this builder accordingly.

'use strict';

(function () {

    // ─── XML helpers ─────────────────────────────────────────────────────────
    function xesc(v) {
        if (v === null || v === undefined) return '';
        return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function tag(name, value) {
        const v = xesc(value);
        return v ? `<${name}>${v}</${name}>` : `<${name}></${name}>`;
    }
    function tagIf(name, value) {
        const v = xesc(value);
        return v ? `<${name}>${v}</${name}>` : '';
    }
    function isoDate(val) {
        if (!val) return '';
        const s = String(val);
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
        return s;
    }
    function splitStreet(raw) {
        if (!raw) return { number: '', name: '' };
        const m = String(raw).trim().match(/^(\d+\S*)\s+(.+)$/);
        return m ? { number: m[1], name: m[2] } : { number: '', name: String(raw).trim() };
    }
    function splitZip(raw) {
        if (!raw) return { zip5: '', zip4: '' };
        const m = String(raw).trim().match(/^(\d{5})(?:-?(\d{4}))?$/);
        return m ? { zip5: m[1], zip4: m[2] || '' } : { zip5: String(raw).trim(), zip4: '' };
    }
    function expandGender(g) {
        const x = String(g || '').trim().toLowerCase();
        if (x === 'm' || x === 'male')   return 'Male';
        if (x === 'f' || x === 'female') return 'Female';
        // Anything else (nonbinary, prefer-not-to-say, blank, junk) → the
        // V200-safe enum. EZLynx <Gender> only accepts Male / Female /
        // Not Specified; passing the raw value through (the old `return g`)
        // failed the server-side deserializer.
        return 'Not Specified';
    }
    // A VIN EZLynx will accept for its decoder: exactly 17 chars, no I/O/Q.
    // Anything else → we must NOT set UseVinLookup=Yes (EZLynx tries to
    // decode it and the whole import fails) and must NOT emit a junk <Vin>.
    function validVin(v) {
        return /^[A-HJ-NPR-Z0-9]{17}$/i.test(String(v || '').trim());
    }
    // Operators that belong on an EZAUTO policy — kept identical to the
    // builder's own filter so the validator and the XML never disagree.
    function driverOpsFor(v2) {
        const operators = Array.isArray(v2.operators) ? v2.operators : [];
        const autos = Array.isArray(v2.autos) ? v2.autos : [];
        const linked = new Set();
        autos.forEach(au => {
            if (au.primaryOperatorId) linked.add(au.primaryOperatorId);
            (au.additionalOperatorIds || []).forEach(id => linked.add(id));
        });
        return operators.filter(op => op.isPrimaryApplicant || op.isCoApplicant || linked.has(op.id));
    }
    function isYes(v) {
        if (v === true) return 'Yes';
        if (!v) return 'No';
        const s = String(v).trim().toLowerCase();
        return (s === 'yes' || s === 'true' || s === '1' || s === 'y') ? 'Yes' : 'No';
    }
    // V200 EZHOME wants the fire-hydrant distance as a range, not raw feet
    function fireHydrantRange(feet) {
        if (feet === undefined || feet === null || feet === '') return '';
        const f = parseInt(String(feet).replace(/\D/g, ''), 10);
        if (!Number.isFinite(f)) return '';
        if (f <= 500)  return '0-500';
        if (f <= 600)  return '501-600';
        if (f <= 1000) return '601-1000';
        return '1001+';
    }
    // EZHOME's deserializer rejects verbose construction strings — normalize
    // to the canonical enum the sample uses.
    function safeConstruction(raw) {
        if (!raw) return '';
        const lower = String(raw).trim().toLowerCase();
        if (!lower) return '';
        if (lower === 'frame' || lower === 'masonry' || lower === 'stucco' || lower === 'log') {
            return lower[0].toUpperCase() + lower.slice(1);
        }
        if (/^(brick|stone|masonry|block|concrete|cinder|cmu)/.test(lower)) return 'Masonry';
        if (/^(frame|wood|vinyl|aluminum|cedar|plank|fiber|hardiplank|hardie|t-?111)/.test(lower)) return 'Frame';
        if (lower.startsWith('siding')) return 'Frame';
        if (lower.includes('stucco')) return 'Stucco';
        if (lower.includes('log')) return 'Log';
        return '';
    }
    // Dwelling type → EZHOME enum
    function dwellingTypeHS(v) {
        const s = String(v || '').trim();
        if (!s) return '';
        // V200 sample uses "One Family", "Two Family", "Three Family",
        // "Four Family", "Condo", "Townhouse", "Manufactured" — same as v2.
        return s;
    }
    // Roof type → EZHOME format (sample uses ALL-CAPS like "COMPOSITION")
    function roofTypeHS(v) {
        const s = String(v || '').trim();
        if (!s) return '';
        const lower = s.toLowerCase();
        if (lower.includes('asphalt') || lower.includes('compos')) return 'COMPOSITION';
        if (lower.includes('wood'))    return 'WOOD SHAKE';
        if (lower.includes('tile'))    return 'TILE';
        if (lower.includes('metal'))   return 'METAL';
        if (lower.includes('slate'))   return 'SLATE';
        if (lower.includes('membrane') || lower.includes('flat')) return 'MEMBRANE';
        return s.toUpperCase();
    }
    // Heating type → EZHOME enum
    function heatingTypeHS(v) {
        const s = String(v || '').trim();
        if (!s) return '';
        // Sample uses "Gas", "Electric", "Oil", "Propane", "Heat Pump", "Wood"
        return s;
    }
    // Map v2 relationships to EZLynx's Relation enum
    function relationHS(r, isPrimary) {
        if (isPrimary) return 'Insured';
        const s = String(r || '').trim().toLowerCase();
        if (s === 'self')               return 'Insured';
        if (s.includes('spouse'))       return 'Spouse';
        if (s.includes('child'))        return 'Child';
        if (s.includes('parent'))       return 'Parent';
        if (s.includes('sibling'))      return 'Sibling';
        if (s.includes('domestic'))     return 'Domestic Partner';
        return r || 'Other';
    }
    // V200 EZAUTO uses the enum {None|Active|Passive|Both Active and Passive|VIN Etching|Recovery System}
    function antiTheftHS(v) {
        const s = String(v || '').trim();
        if (!s || s === 'None') return 'None';
        if (s.toLowerCase().includes('recovery') || s.toLowerCase().includes('lojack')) return 'Recovery System';
        if (s.toLowerCase().includes('active disabling') && s.toLowerCase().includes('passive')) return 'Both Active and Passive';
        if (s.toLowerCase().includes('active'))   return 'Active';
        if (s.toLowerCase().includes('passive'))  return 'Passive';
        if (s.toLowerCase().includes('alarm'))    return 'Alarm Only';
        return s;
    }

    // ─── Shared address builder ──────────────────────────────────────────────
    function buildAddressInner(addr) {
        const street = splitStreet(addr.street);
        const zip = splitZip(addr.zip);
        return [
            '<AddressCode>StreetAddress</AddressCode>',
            '<Addr1>',
            tag('StreetName', street.name),
            tag('StreetNumber', street.number),
            '</Addr1>',
            tag('City', addr.city),
            tag('StateCode', addr.state),
            tag('County', addr.county),
            tag('Zip5', zip.zip5),
            tag('Zip4', zip.zip4),
        ].join('');
    }

    function buildPhoneEmail(applicant) {
        const phone = String(applicant.phone || '').replace(/\D/g, '');
        const out = [];
        if (phone) {
            out.push('<Phone id="0">');
            out.push(tag('PhoneType', 'Mobile'));
            out.push(tag('PhoneNumber', phone));
            out.push('<Extension></Extension>');
            out.push('</Phone>');
        }
        out.push(tag('Email', applicant.email));
        return out.join('');
    }

    // ─── EZAUTO builder ──────────────────────────────────────────────────────
    function buildIntakeV2EZAutoXML(v2) {
        v2 = v2 || (window.IntakeV2 && window.IntakeV2.data) || {};

        const a = v2.applicant || {};
        const co = v2.coApplicant || {};
        const addr = v2.address || {};
        const household = v2.household || {};
        const operators = Array.isArray(v2.operators) ? v2.operators : [];
        const autos = Array.isArray(v2.autos) ? v2.autos : [];
        const pi = v2.priorInsurance || {};
        const hist = v2.history || {};
        const hasHome = (v2.homes || []).length > 0;

        const addrInner = buildAddressInner(addr);
        const phoneEmail = buildPhoneEmail(a);
        const fullAddress = `<Address>${addrInner}${phoneEmail}</Address>`;
        const addressOnly = `<Address>${addrInner}</Address>`;

        // ── Primary applicant ────────────────────────────────────────────────
        // V200 EZAUTO <PersonalInfo> does NOT accept Industry/Occupation/Education —
        // those fail the server-side deserializer ("Error in deserializing to
        // V200 Ezauto"). They flow via filler JSON / CMSMTF instead.
        const primaryApplicant = [
            '<Applicant>',
            tag('ApplicantType', 'Applicant'),
            '<PersonalInfo>',
            '<Name>',
            tag('FirstName', a.firstName),
            tag('MiddleName', a.middleName),
            tag('LastName', a.lastName),
            '</Name>',
            tag('DOB', isoDate(a.dob)),
            tag('Gender', expandGender(a.gender)),
            tagIf('MaritalStatus', a.maritalStatus),
            tag('Relation', 'Insured'),
            '</PersonalInfo>',
            fullAddress,
            '</Applicant>',
        ].join('');

        // ── Co-applicant ─────────────────────────────────────────────────────
        const coApplicant = (() => {
            if (!co.present && !co.firstName && !co.lastName) return '';
            return [
                '<Applicant>',
                tag('ApplicantType', 'CoApplicant'),
                '<PersonalInfo>',
                '<Name>',
                tag('FirstName', co.firstName),
                tag('MiddleName', co.middleName),
                tag('LastName', co.lastName),
                '</Name>',
                tagIf('DOB', isoDate(co.dob)),
                tagIf('Gender', expandGender(co.gender)),
                tagIf('MaritalStatus', co.maritalStatus),
                tag('Relation', co.relationship || 'Spouse'),
                '</PersonalInfo>',
                fullAddress,
                '</Applicant>',
            ].join('');
        })();

        // ── Prior policy info ────────────────────────────────────────────────
        // V200 EZAUTO <PriorPolicyInfo> accepts PriorCarrier / PriorPolicyTerm /
        // Expiration / YearsWithPriorCarrier. It does NOT accept
        // YearsWithContinuousCoverage or PriorLiabilityLimits — those break
        // deserialization. Continuous-coverage data still flows via filler JSON.
        const priorAuto = pi.auto || {};
        const priorPolicy = (() => {
            const hasAny = priorAuto.carrier || priorAuto.exp || priorAuto.term;
            if (!hasAny) return '';
            const yrsWithPrior = (priorAuto.years || priorAuto.months)
                ? `<YearsWithPriorCarrier>${tagIf('Years', priorAuto.years)}${tagIf('Months', priorAuto.months)}</YearsWithPriorCarrier>`
                : '';
            return [
                '<PriorPolicyInfo>',
                tagIf('PriorCarrier', priorAuto.carrier),
                tagIf('PriorPolicyTerm', priorAuto.term),
                tagIf('Expiration', isoDate(priorAuto.exp)),
                yrsWithPrior,
                '</PriorPolicyInfo>',
            ].join('');
        })();

        // ── PolicyInfo ───────────────────────────────────────────────────────
        // V200 EZAUTO <PolicyInfo> accepts PolicyTerm + Effective only.
        // CreditCheckAuth and MultiPolicy are EZHOME-only — emitting them in
        // EZAUTO breaks deserialization. Multi-policy intent flows via
        // <Multicar> in <GeneralCoverage> below. CreditCheckAuth flows via
        // filler JSON.
        const policyInfo = [
            '<PolicyInfo>',
            tag('PolicyTerm', pi.policyTerm || '6 Month'),
            tagIf('Effective', isoDate(pi.effectiveDate)),
            '</PolicyInfo>',
        ].join('');

        // ── ResidenceInfo / GarageLocation ───────────────────────────────────
        // V200 EZAUTO <ResidenceInfo> doesn't accept YearsAtAddress; that
        // field is captured by the home rater. Flows via filler JSON.
        const residenceInfo = `<ResidenceInfo><GarageLocation>${addressOnly}</GarageLocation></ResidenceInfo>`;

        // ── Drivers ──────────────────────────────────────────────────────────
        // Filter to operators that are bound to autos OR the primary/co-applicant.
        // A household member who only drives a boat / RV doesn't belong on an
        // auto policy.
        const linkedOperatorIds = new Set();
        autos.forEach(au => {
            if (au.primaryOperatorId) linkedOperatorIds.add(au.primaryOperatorId);
            (au.additionalOperatorIds || []).forEach(id => linkedOperatorIds.add(id));
        });
        const driverOps = operators.filter(op => op.isPrimaryApplicant || op.isCoApplicant || linkedOperatorIds.has(op.id));

        // Build a map from operator id → 1-based driver index, used when
        // wiring VehicleAssignments + PrincipalVehicle below.
        const driverIdxById = new Map();
        driverOps.forEach((op, i) => driverIdxById.set(op.id, i + 1));

        const driverXml = driverOps.length ? [
            '<Drivers>',
            ...driverOps.map((op, i) => {
                const id = i + 1;
                const dl = op.dl || {};
                // DateLicensed — derive from DOB + yearsAuto
                let dateLicensed = '';
                if (op.dob && dl.yearsAuto) {
                    const m = String(op.dob).match(/^(\d{4})-(\d{2})-(\d{2})$/);
                    const yrs = parseInt(dl.yearsAuto, 10);
                    if (m && Number.isFinite(yrs) && yrs > 0 && yrs < 100) {
                        const licYr = new Date().getFullYear() - yrs;
                        dateLicensed = `${licYr}-${m[2]}-${m[3]}`;
                    }
                }
                // Pick a principal vehicle for this driver — find the first auto
                // whose primaryOperatorId matches this operator. Falls back to
                // "1" for the primary applicant when no explicit binding exists.
                const principalVehicle = (() => {
                    const idx = autos.findIndex(au => au.primaryOperatorId === op.id);
                    if (idx >= 0) return idx + 1;
                    return (op.isPrimaryApplicant && autos.length) ? '1' : '';
                })();

                // Per-driver violations linked via history.violations
                const violations = (hist.violations || [])
                    .filter(V => V.operatorId === op.id)
                    .map(V => `<Violation>${tagIf('Date', isoDate(V.date))}${tagIf('Description', V.type)}</Violation>`)
                    .join('');

                // V200 EZAUTO <Driver> schema (per HawkSoft known-good sample):
                //   Name / Gender / DOB / DLNumber / DLState / DateLicensed /
                //   MaritalStatus / Relation / GoodStudent / MATDriver /
                //   Rated / PrincipalVehicle / Violation*
                // Industry/Occupation/Education, SR22, FR44,
                // LicenseSuspendedRevoked, DriverTraining, DistantStudent are
                // NOT in V200 EZAUTO and break deserialization — they flow via
                // filler JSON / CMSMTF (drv_bFiling, etc.) instead.
                return [
                    `<Driver id="${id}">`,
                    '<Name>',
                    tag('FirstName', op.firstName),
                    tagIf('MiddleName', op.middleName),
                    tag('LastName', op.lastName),
                    '</Name>',
                    tag('Gender', expandGender(op.gender)),
                    tag('DOB', isoDate(op.dob)),
                    tagIf('DLNumber', dl.num),
                    tagIf('DLState', dl.state),
                    tagIf('DateLicensed', dateLicensed),
                    tagIf('MaritalStatus', op.maritalStatus),
                    tag('Relation', relationHS(op.relationship, op.isPrimaryApplicant)),
                    tag('GoodStudent', op.goodStudent ? 'Yes' : 'No'),
                    tag('MATDriver', op.matureDriver ? 'Yes' : 'No'),
                    // EZLynx cannot rate a driver with no license number — a
                    // <Rated>Rated</Rated> driver missing <DLNumber> fails the
                    // import. Degrade to Not Rated so the file imports; the
                    // pre-export validator warns the agent to add the DL#.
                    tag('Rated', (dl.num && String(dl.num).trim()) ? 'Rated' : 'Not Rated'),
                    tagIf('PrincipalVehicle', principalVehicle),
                    violations,
                    '</Driver>',
                ].join('');
            }),
            '</Drivers>',
        ].join('') : '';

        // ── Vehicles ─────────────────────────────────────────────────────────
        // V200 EZAUTO <Vehicle> schema (per HawkSoft known-good sample):
        //   UseVinLookup / Year / Vin / Make / Model / Anti-Theft /
        //   PassiveRestraints
        // LicensePlate, PlateState, Ownership, PurchaseDate, OriginalOwner,
        // ExistingDamage are NOT in V200 EZAUTO — they flow via filler JSON.
        const vehicleXml = autos.length ? [
            '<Vehicles>',
            ...autos.map((veh, i) => {
                const id = i + 1;
                // Only ask EZLynx to VIN-decode a structurally valid VIN.
                // A bad/short VIN with UseVinLookup=Yes fails the whole
                // import; an invalid VIN element can be rejected on its own.
                // Fall back to Year/Make/Model identification instead.
                const vinOk = validVin(veh.vin);
                return [
                    `<Vehicle id="${id}">`,
                    tag('UseVinLookup', vinOk ? 'Yes' : 'No'),
                    tagIf('Year', veh.year),
                    vinOk ? tag('Vin', String(veh.vin).trim().toUpperCase()) : '',
                    tagIf('Make', veh.make),
                    tagIf('Model', veh.model),
                    tagIf('Anti-Theft', antiTheftHS(veh.antiTheftDevice)),
                    tag('PassiveRestraints', 'None'),
                    '</Vehicle>',
                ].join('');
            }),
            '</Vehicles>',
        ].join('') : '';

        // ── VehiclesUse ──────────────────────────────────────────────────────
        // V200 schema uses the typo <Useage> — preserve it. DaysPerWeek is
        // not in V200 EZAUTO — flows via filler JSON.
        const vehicleUseXml = autos.length ? [
            '<VehiclesUse>',
            ...autos.map((veh, i) => {
                const id = i + 1;
                const useage = veh.useType || 'Pleasure';
                const principalOperator = driverIdxById.get(veh.primaryOperatorId) || (driverOps.length ? 1 : '');
                return [
                    `<VehicleUse id="${id}">`,
                    tag('Useage', useage),
                    tagIf('OneWayMiles', veh.oneWayMiles),
                    tagIf('AnnualMiles', veh.annualMiles),
                    tagIf('PrincipalOperator', principalOperator),
                    '</VehicleUse>',
                ].join('');
            }),
            '</VehiclesUse>',
        ].join('') : '';

        // ── Coverages ────────────────────────────────────────────────────────
        // GeneralCoverage uses the first auto's coverage block since EZLynx's
        // V200 schema treats most coverages as policy-wide with per-vehicle
        // deductibles. Liability is split into BI/PD; v2 stores combined
        // strings like "100/300/100".
        const coveragesXml = (() => {
            const a0 = autos[0] || {};
            const c0 = a0.coverages || {};
            const liab = String(c0.liab || '');
            const bipd = liab.match(/^(\d+\/\d+)\/(\d+)$/);
            const bi = bipd ? bipd[1] : liab;
            const pd = bipd ? bipd[2] : '';

            // V200 EZAUTO <GeneralCoverage>: BI / PD / UM / UIM / Multicar only.
            // MedPay is not in V200 EZAUTO — flows via filler JSON.
            const general = [
                '<GeneralCoverage>',
                tagIf('BI', bi),
                tagIf('PD', pd),
                tagIf('UM', c0.umuim),
                tagIf('UIM', c0.umuim),
                autos.length > 1 ? '<Multicar>Yes</Multicar>' : '',
                '</GeneralCoverage>',
            ].join('');

            const perVehicle = autos.map((veh, i) => {
                const id = i + 1;
                const c = veh.coverages || {};
                return [
                    `<VehicleCoverage id="${id}">`,
                    tagIf('OtherCollisionDeductible', c.compDed),
                    tagIf('CollisionDeductible', c.collDed),
                    tagIf('TowingDeductible', c.towingDed),
                    tagIf('RentalDeductible', c.rentalDed),
                    '</VehicleCoverage>',
                ].join('');
            }).join('');

            // State-specific WA-Coverages (PIP / UMPD) — only when state is WA
            const state = (addr.state || '').toUpperCase();
            let stateBlock = '';
            if (state === 'WA') {
                stateBlock = '<StateSpecificCoverage><WA-Coverages>'
                    + '<WA-PIP>10000</WA-PIP>'  // standard WA PIP
                    + '</WA-Coverages></StateSpecificCoverage>';
            }

            return ['<Coverages>', general, perVehicle, stateBlock, '</Coverages>'].join('');
        })();

        // ── VehicleAssignments (driver → vehicle cross-reference) ────────────
        const assignmentsXml = autos.length ? [
            '<VehicleAssignments>',
            ...autos.map((veh, i) => {
                const driverId = driverIdxById.get(veh.primaryOperatorId) || 1;
                return `<VehicleAssignment id="${i + 1}"><DriverAssignment id="${driverId}"/></VehicleAssignment>`;
            }),
            '</VehicleAssignments>',
        ].join('') : '';

        // ── Assemble ─────────────────────────────────────────────────────────
        // V200 EZAUTO has no <LossInfo> slot (the HawkSoft known-good sample
        // has none). Loss history flows via filler JSON / PDF instead.
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

        const lastName = a.lastName || 'Client';
        const safeName = (window.App && typeof window.App._safeFileNamePart === 'function')
            ? window.App._safeFileNamePart(lastName, 'Client')
            : String(lastName).replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 80);

        return {
            content: xml,
            filename: `EZLynx_Import_${safeName}_${new Date().toISOString().split('T')[0]}.xml`,
            mime: 'application/xml;charset=utf-8',
        };
    }

    // ─── EZHOME builder ──────────────────────────────────────────────────────
    function buildIntakeV2EZHomeXML(v2) {
        v2 = v2 || (window.IntakeV2 && window.IntakeV2.data) || {};

        const a = v2.applicant || {};
        const co = v2.coApplicant || {};
        const addr = v2.address || {};
        const household = v2.household || {};
        const homes = Array.isArray(v2.homes) ? v2.homes : [];
        const home = homes[0] || {};
        const pi = v2.priorInsurance || {};
        const hist = v2.history || {};
        const hasAuto = (v2.autos || []).length > 0;

        if (!home) {
            // Shouldn't happen — orchestrator gates this — but emit a minimal
            // shell to avoid throwing on edge cases.
            return {
                content: '<EZHOME xmlns="http://www.ezlynx.com/XMLSchema/Home/V200"></EZHOME>',
                filename: 'EZLynx_Home_Empty.xml',
                mime: 'application/xml;charset=utf-8',
            };
        }

        const hz = home.hazards || {};
        const sys = home.systems || {};
        const roof = home.roof || {};
        const cov = home.coverages || {};
        const end = home.endorsements || {};
        const mort = home.mortgageCompany || {};

        const addrInner = buildAddressInner(addr);
        const phoneEmail = buildPhoneEmail(a);
        const fullAddress = `<Address>${addrInner}${phoneEmail}${tagIf('PreferredContactMethod', household.contactMethod)}${tagIf('YearsAtAddress', addr.yearsAt)}</Address>`;
        const dwellingAddress = `<Address>${addrInner}</Address>`;

        // ── Primary applicant ────────────────────────────────────────────────
        const applicant = [
            '<Applicant>',
            tag('ApplicantType', 'Applicant'),
            '<PersonalInfo>',
            '<Name>',
            tag('FirstName', a.firstName),
            tag('MiddleName', a.middleName),
            tag('LastName', a.lastName),
            '</Name>',
            tag('DOB', isoDate(a.dob)),
            tag('Gender', expandGender(a.gender)),
            tagIf('MaritalStatus', a.maritalStatus),
            tag('Relation', 'Insured'),
            tagIf('Industry', a.industry),
            tagIf('Occupation', a.occupation),
            tagIf('Education', a.education),
            '</PersonalInfo>',
            fullAddress,
            '</Applicant>',
        ].join('');

        const coApplicant = (() => {
            if (!co.present && !co.firstName && !co.lastName) return '';
            return [
                '<Applicant>',
                tag('ApplicantType', 'CoApplicant'),
                '<PersonalInfo>',
                '<Name>',
                tag('FirstName', co.firstName),
                tagIf('MiddleName', co.middleName),
                tag('LastName', co.lastName),
                '</Name>',
                tagIf('DOB', isoDate(co.dob)),
                tagIf('Gender', expandGender(co.gender)),
                tagIf('MaritalStatus', co.maritalStatus),
                tag('Relation', co.relationship || 'Spouse'),
                tagIf('Industry', co.industry),
                tagIf('Occupation', co.occupation),
                '</PersonalInfo>',
                fullAddress,
                '</Applicant>',
            ].join('');
        })();

        // ── AltDwelling — the insured property ───────────────────────────────
        const altDwelling = `<AltDwelling>${dwellingAddress}</AltDwelling>`;

        // ── PriorPolicyInfo ──────────────────────────────────────────────────
        const priorHome = pi.home || {};
        const priorPolicy = (() => {
            if (!priorHome.carrier && !priorHome.exp && !pi.continuous) return '';
            const yrs = (priorHome.years || priorHome.months)
                ? `<YearsWithPriorCarrier>${tagIf('Years', priorHome.years)}${tagIf('Months', priorHome.months)}</YearsWithPriorCarrier>`
                : '';
            const continuous = (pi.continuousMonths || pi.continuous === 'Yes')
                ? `<YearsWithContinuousCoverage>${tagIf('Months', pi.continuousMonths)}</YearsWithContinuousCoverage>`
                : '';
            return [
                '<PriorPolicyInfo>',
                tagIf('PriorCarrier', priorHome.carrier),
                tagIf('Expiration', isoDate(priorHome.exp)),
                yrs,
                continuous,
                '</PriorPolicyInfo>',
            ].join('');
        })();

        // ── PolicyInfo ───────────────────────────────────────────────────────
        // Derive policy type (HO3/HO4/HO5/HO6) from dwelling type when explicit
        // home.policyType isn't set.
        const policyTypeFromDwelling = (() => {
            const d = String(home.dwellingType || '').toLowerCase();
            if (d.includes('condo'))    return 'HO6';
            if (d.includes('rent') || home.occupancyType === 'Tenant-occupied') return 'HO4';
            return 'HO3';
        })();
        const policyInfo = [
            '<PolicyInfo>',
            tag('PolicyTerm', pi.policyTerm || '12 Month'),
            tagIf('Effective', isoDate(pi.effectiveDate)),
            tag('PolicyType', policyTypeFromDwelling),
            tag('Package', hasAuto ? 'Yes' : 'No'),
            tagIf('CreditCheckAuth', household.creditCheckAuth ? 'Yes' : ''),
            '</PolicyInfo>',
        ].join('');

        // ── RatingInfo — the meat of the home application ────────────────────
        // This was where v1's exporter dropped most fields. Now we emit
        // everything the schema supports.
        const ratingInfo = [
            '<RatingInfo>',
            tag('PropertyInsCancelledLapsed', 'No'),
            tagIf('YearBuilt', home.yrBuilt),
            tagIf('Dwelling', dwellingTypeHS(home.dwellingType)),
            tagIf('NumberOfOccupants', home.numOccupants),
            tagIf('DwellingUse', home.dwellingUsage),
            tagIf('DwellingOccupancy', home.occupancyType),
            tagIf('DistanceToFireHydrant', fireHydrantRange(hz.fireHydrantFeet)),
            tagIf('DistanceToFireStation', hz.fireStationDist),
            tagIf('ProtectionClass', hz.protectionClass),
            tagIf('NumberOfStories', home.numStories),
            tagIf('NumberOfFullBaths', home.fullBaths),
            tagIf('NumberOfHalfBaths', home.halfBaths),
            tagIf('Construction', safeConstruction(home.construction)),
            tag('Structure', 'Dwelling'),
            tagIf('Roof', roofTypeHS(roof.type)),
            tagIf('RoofDesign', roof.shape),
            tag('SwimmingPool', hz.pool ? 'Yes' : 'No'),
            tagIf('SwimmingPoolFenced', hz.pool ? 'Yes' : ''),  // assume fenced when present
            tag('DogOnPremises', hz.dogs ? 'Yes' : 'No'),
            tag('Trampoline', hz.trampoline ? 'Yes' : 'No'),
            tag('BusinessOnPremises', hz.businessOnPremises ? 'Yes' : 'No'),
            tagIf('HeatingType', heatingTypeHS(sys.heatingType)),
            // Update indicators — derive "PARTIAL UPDATE" / "NOT UPDATED" from
            // whether a year is recorded. EZLynx's importer uses these to
            // surface roof / electrical / plumbing age in the carrier rater.
            tagIf('RoofingUpdate', roof.yr ? 'PARTIAL UPDATE' : ''),
            tagIf('RoofingUpdateYear', roof.yr),
            tagIf('ElectricalUpdate', sys.electricalYr ? 'PARTIAL UPDATE' : ''),
            tagIf('ElectricalUpdateYear', sys.electricalYr),
            tagIf('PlumbingUpdate', sys.plumbingYr ? 'PARTIAL UPDATE' : ''),
            tagIf('PlumbingUpdateYear', sys.plumbingYr),
            tag('UnderConstruction', 'No'),
            tagIf('SquareFootage', home.sqFt),
            tagIf('PurchaseDate', isoDate(home.purchaseDate)),
            // Mortgagee Yes/No signal lets EZLynx know to request a mortgagee
            // clause certificate; the actual mortgagee record goes elsewhere.
            tag('FirstMortgagee', mort.name ? 'Yes' : 'No'),
            tag('SecondMortgagee', 'No'),
            tag('ThirdMortgagee', 'No'),
            tag('EquityLineOfCredit', 'No'),
            tag('CoSigner', 'No'),
            tag('NumberOfOtherInterests', '0'),
            tagIf('Foundation', home.foundation),
            '</RatingInfo>',
        ].filter(s => s !== '').join('');

        // ── ReplacementCost — coverages + deductible (FIXED) ─────────────────
        // V200 EZHOME nests <Deductible> INSIDE <DeductibeInfo> (preserve the
        // schema's typo on the outer wrapper). v1's exporter emitted an empty
        // <DeductibeInfo/> — that's the major bug we're fixing here.
        const deductibleBlock = cov.deductible
            ? `<DeductibeInfo>${tag('Deductible', cov.deductible)}</DeductibeInfo>`
            : '<DeductibeInfo></DeductibeInfo>';

        const ratingCredits = [
            '<RatingCredits>',
            tag('RetireesCredit', 'No'),
            tag('MatureDiscount', 'No'),
            tag('RetirementCommunity', 'No'),
            tag('LimitedAccessCommunity', 'No'),
            tag('GatedCommunity', 'No'),
            tag('Multipolicy', hasAuto ? 'Yes' : 'No'),
            '</RatingCredits>',
        ].join('');

        const replacementCost = [
            '<ReplacementCost>',
            tagIf('ReplacementCost', cov.dwellingA),
            tagIf('Dwelling', cov.dwellingA),
            tagIf('OtherStructures', cov.otherStructuresB),
            tagIf('PersonalProperty', cov.personalPropertyC),
            tagIf('LossOfUse', cov.lossOfUseD),
            tagIf('PersonalLiability', cov.liabilityE),
            tagIf('MedicalPayments', cov.medPayF),
            tag('NumberOfFamilies', '1'),
            deductibleBlock,
            ratingCredits,
            '</ReplacementCost>',
        ].join('');

        // ── Endorsements ─────────────────────────────────────────────────────
        // V200 schema uses fairly minimal endorsement structure; emit the
        // schema-confirmed set and wire v2's booleans into them.
        const endorsements = [
            '<Endorsements>',
            tag('SpecialPersonalProperty', end.scheduledProperty ? 'Yes' : 'No'),
            '<ProtectiveDevices>',
            '<BurglarAlarm>',
            tag('DeadBolt', 'No'),
            tag('VisibleToNeighbor', hz.alarms === 'Central Station' ? 'Yes' : 'No'),
            tag('MannedSecurity', 'No'),
            '</BurglarAlarm>',
            '</ProtectiveDevices>',
            '<Sinkhole>',
            tag('SinkholeCollapse', 'No'),
            '</Sinkhole>',
            // Earthquake — V1 EZHOME parity (nested <Earthquake> wrapper).
            // V2 previously omitted this entirely, so CEA / earthquake
            // quoting lost the signal on the EZLynx side.
            '<Earthquake>',
            tag('Earthquake', cov.earthquake ? 'Yes' : 'No'),
            '</Earthquake>',
            // Carrier-specific endorsement signals — emitted as ExtendedInfo
            // keys when supported. The valuepairs flow into the rater UI.
            '</Endorsements>',
        ].join('');

        // ── GeneralInfo (rating state) ───────────────────────────────────────
        const generalInfo = `<GeneralInfo>${tag('RatingStateCode', addr.state)}</GeneralInfo>`;

        // ── ExtendedInfo (endorsements carriers ask about) ───────────────────
        // V200 EZHOME's free-form endorsement signal block. Only emit when at
        // least one endorsement is selected — empty key lists clutter the
        // import and slow EZLynx's parsing.
        const extendedEndorsements = (() => {
            const pairs = [];
            pairs.push(['endorsements_equipbreakdown_common', end.equipmentBreakdown ? 'Yes' : 'No']);
            pairs.push(['endorsements_serviceline_common',    end.serviceLine ? 'Yes' : 'No']);
            pairs.push(['endorsements_waterbackup_common',    end.waterBackup ? 'Yes' : 'No']);
            pairs.push(['endorsements_ordinanceorlaw_common', end.ordinanceLaw ? 'Yes' : 'No']);
            pairs.push(['endorsements_identitytheft_common',  end.identityTheft ? 'Yes' : 'No']);
            if (cov.earthquake) {
                pairs.push(['endorsements_earthquake_common', 'Yes']);
                if (cov.earthquakeDeductible) pairs.push(['endorsements_earthquake_deductible', cov.earthquakeDeductible]);
                if (cov.earthquakeZone)       pairs.push(['endorsements_earthquake_zone', cov.earthquakeZone]);
            }
            return '<ExtendedInfo name="ICQ|NAME_VALUE_PAIRS">'
                + pairs.map(([k, v]) => `<valuepair name="${xesc(k)}"><value>${xesc(v)}</value></valuepair>`).join('')
                + '</ExtendedInfo>';
        })();

        // ── LossInfo ─────────────────────────────────────────────────────────
        const lossInfo = (() => {
            const losses = (hist.losses || []).filter(L => !L.asset || /home|property|dwelling/i.test(L.asset));
            if (!losses.length) return '<LossInfo></LossInfo>';
            return '<LossInfo>'
                + losses.map(L => `<Loss>${tagIf('Date', isoDate(L.date))}${tagIf('Description', L.type)}${tagIf('Amount', L.amount)}</Loss>`).join('')
                + '</LossInfo>';
        })();

        // ── Assemble ─────────────────────────────────────────────────────────
        const xml = '<?xml version="1.0" encoding="utf-8"?>'
            + '<EZHOME xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.ezlynx.com/XMLSchema/Home/V200">'
            + applicant
            + coApplicant
            + altDwelling
            + priorPolicy
            + policyInfo
            + ratingInfo
            + replacementCost
            + endorsements
            + generalInfo
            + extendedEndorsements
            + lossInfo
            + '</EZHOME>';

        const lastName = a.lastName || 'Client';
        const safeName = (window.App && typeof window.App._safeFileNamePart === 'function')
            ? window.App._safeFileNamePart(lastName, 'Client')
            : String(lastName).replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 80);

        return {
            content: xml,
            filename: `EZLynx_Home_Import_${safeName}_${new Date().toISOString().split('T')[0]}.xml`,
            mime: 'application/xml;charset=utf-8',
        };
    }

    // ─── Pre-export validation ───────────────────────────────────────────────
    // Catch the things that make EZLynx reject an import BEFORE the file is
    // produced, so the agent sees a clear "your export is missing X" message
    // instead of a silent failure inside EZLynx. `blocking` = the file would
    // not import at all (abort); `warnings` = it imports but fields are blank
    // / a driver is Not Rated (let the agent decide).
    function validateIntakeV2ForEZLynx(v2) {
        v2 = v2 || (window.IntakeV2 && window.IntakeV2.data) || {};
        const blocking = [];
        const warnings = [];

        const a = v2.applicant || {};
        const addr = v2.address || {};
        const autos = Array.isArray(v2.autos) ? v2.autos : [];
        const homes = Array.isArray(v2.homes) ? v2.homes : [];
        const hasAuto = autos.length > 0;
        const hasHome = homes.length > 0;

        // Named insured + address are required for any EZLynx import.
        if (!(a.firstName && String(a.firstName).trim()) || !(a.lastName && String(a.lastName).trim())) {
            blocking.push('No named insured — applicant first and last name are required.');
        }
        if (!(addr.city && addr.state && addr.zip)) {
            blocking.push('Incomplete address — city, state and ZIP are required for rating.');
        }

        if (hasAuto) {
            const driverOps = driverOpsFor(v2);
            if (driverOps.length === 0) {
                blocking.push('Auto policy has no drivers — add at least one operator.');
            }
            driverOps.forEach(op => {
                const nm = [op.firstName, op.lastName].filter(Boolean).join(' ') || 'A driver';
                const dl = op.dl || {};
                if (!(dl.num && String(dl.num).trim())) {
                    warnings.push(`${nm}: no DL number — exported as "Not Rated" (EZLynx will not rate this driver until a license # is added).`);
                } else if (!(dl.state && String(dl.state).trim())) {
                    warnings.push(`${nm}: DL number present but no DL state — add the state so the driver rates.`);
                }
            });
            autos.forEach((veh, i) => {
                const label = [veh.year, veh.make, veh.model].filter(Boolean).join(' ') || `Vehicle #${i + 1}`;
                const idOk = validVin(veh.vin) || (veh.year && veh.make && veh.model);
                if (!idOk) {
                    blocking.push(`${label}: not identifiable — needs a valid 17-character VIN or Year + Make + Model.`);
                } else if (veh.vin && !validVin(veh.vin)) {
                    warnings.push(`${label}: VIN "${String(veh.vin).trim()}" is not a valid 17-character VIN — exported without VIN lookup; EZLynx will rate from Year/Make/Model.`);
                }
            });
            const c0 = (autos[0] && autos[0].coverages) || {};
            if (!c0.liab) {
                warnings.push('No auto liability limits selected — EZLynx may not be able to rate the auto policy.');
            }
        }

        if (hasHome) {
            const h0 = homes[0] || {};
            const hc = h0.coverages || {};
            if (!hc.dwellingA) {
                warnings.push('Home has no Coverage A (dwelling limit) — EZLynx home rating needs it.');
            }
            if (!h0.yrBuilt && !h0.sqFt && !h0.dwellingType) {
                warnings.push('Home has almost no dwelling detail (year built / square footage / type) — the EZLynx home app will be largely blank.');
            }
        }

        return { blocking, warnings };
    }

    // Expose for the orchestrator
    window.IntakeV2EZLynxXML = { buildIntakeV2EZAutoXML, buildIntakeV2EZHomeXML, validateIntakeV2ForEZLynx };

})();
