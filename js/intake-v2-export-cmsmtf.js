// intake-v2-export-cmsmtf.js — Native HawkSoft CMSMTF builder for Intake v2.
//
// Replaces the previous legacy bridge (intake-v2-export-map.js → toLegacyShape
// → App.buildCMSMTF). The legacy path silently dropped multi-home data,
// per-asset lien holders, SR-22 filings, license-status, defensive-driving
// discounts, mortgagee address/loan number, and more. This builder reads the
// v2 nested tree directly and emits every CMSMTF tag the schema supports.
//
// Boats and RVs are intentionally NOT exported — HawkSoft personal-lines
// CMSMTF has no boat/RV schema. The caller (intake-v2-export.js) gates the
// export so a boat/RV-only quote can't reach this builder.
//
// CMSMTF reference: Resources/HawkSoft Import Guide/hawksoft_cmsmtf_generator.py
// and the example_auto.CMSMTF / example_home.CMSMTF samples.

'use strict';

(function () {

    // ─── Value helpers ────────────────────────────────────────────────────────
    function _v(val) {
        if (val === null || val === undefined) return '';
        if (typeof val === 'boolean') return val ? 'Y' : '';
        return String(val).trim();
    }
    function _line(key, val) {
        const v = _v(val);
        return v ? `${key} = ${v}` : '';
    }
    function _yes(val) {
        if (!val) return '';
        const s = String(val).trim().toLowerCase();
        return (s === 'yes' || s === 'true' || s === '1' || s === 'y') ? 'Y' : '';
    }
    function _dateHS(val) {
        // HawkSoft expects MM/DD/YYYY
        if (!val) return '';
        const s = String(val);
        const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
        const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (mdy) return `${mdy[1].padStart(2,'0')}/${mdy[2].padStart(2,'0')}/${mdy[3]}`;
        return s;
    }
    function _genderHS(val) {
        if (!val) return '';
        const v = String(val).trim().toLowerCase();
        if (v === 'm' || v === 'male') return 'Male';
        if (v === 'f' || v === 'female') return 'Female';
        return String(val);
    }
    function _maritalHS(val) {
        if (!val) return '';
        const v = String(val).trim().toLowerCase();
        if (v.startsWith('single')) return 'Single';
        if (v.startsWith('married')) return 'Married';
        if (v.startsWith('divorced')) return 'Divorced';
        if (v.startsWith('widow')) return 'Widowed';
        if (v.includes('domestic') || v.includes('partner')) return 'Domestic Partner';
        return String(val);
    }
    function _filingReasonForOp(op) {
        // SR-22 most often = DUI/major violation, FR-44 = required by some states
        // for DWI. We can't distinguish without explicit input, so default to
        // "SR-22" / "FR-44" as the reason text the agent can edit post-import.
        // HawkSoft's drv_sFilingReason accepts free text.
        if (!op || !op.sr22Required) return '';
        return 'SR-22 / FR-44 required';
    }

    // Convert a v2 operator's license status into HawkSoft's bExcluded /
    // bNonDriver flags. "Excluded" = explicitly excluded from coverage,
    // "Non-driver" = household member who doesn't drive (e.g., revoked).
    function _operatorFlags(op) {
        const status = (op.dl && op.dl.status || '').toString().toLowerCase();
        return {
            excluded: status === 'excluded' ? 'Yes' : 'No',
            nonDriver: status === 'none' || status === 'non-driver' ? 'Yes' : 'No',
            suspended: status === 'suspended' || status === 'revoked' || op.licenseSuspended5y ? 'Yes' : 'No',
        };
    }

    // Map v2 use-type → HawkSoft veh_sUse vocabulary
    function _useTypeHS(useType) {
        const v = String(useType || '').trim();
        if (!v) return 'Pleasure';
        // v2 enum exactly matches HawkSoft's: Pleasure / Commute / Business / Farm / Artisan
        return v;
    }

    // Map v2 anti-theft device → HawkSoft passive-restraint slot. HawkSoft's
    // schema doesn't have a dedicated anti-theft tag (it lives in misc data),
    // but the producer can read it from FSCNotes — included below.
    function _ownershipHS(ownership) {
        const v = String(ownership || '').trim();
        if (!v) return '';
        return v; // Owned / Financed / Leased — accepted by HawkSoft's free-text fields
    }

    // ─── Main builder ────────────────────────────────────────────────────────
    //
    // Returns { content, filename, mime } — same shape as App.buildCMSMTF.
    // Assumes the caller has already verified at least one home or auto exists.
    function buildIntakeV2CMSMTF(v2) {
        v2 = v2 || (window.IntakeV2 && window.IntakeV2.data) || {};

        const homes = Array.isArray(v2.homes) ? v2.homes : [];
        const autos = Array.isArray(v2.autos) ? v2.autos : [];
        const operators = Array.isArray(v2.operators) ? v2.operators : [];

        const hasHome = homes.length > 0;
        const hasAuto = autos.length > 0;

        // Determine line of business — HawkSoft only natively splits AUTO vs HOME
        // policies. Multi-line drops both products into HOME's container with a
        // multi-policy flag, matching v1's behavior. The producer typically
        // imports once, then duplicates the policy record after import.
        const lobCode = hasHome ? 'HOME' : 'AUTOP';
        const policyType = hasHome ? 'HOME' : 'AUTO';
        const policyTitle = hasHome && hasAuto ? 'Home & Auto'
            : hasHome ? 'Homeowners' : 'Personal Auto';

        const a = v2.applicant || {};
        const co = v2.coApplicant || {};
        const addr = v2.address || {};
        const home = homes[0] || null; // primary home for tagged fields
        const household = v2.household || {};

        const lines = [];

        // ─── Client block (gen_*) ─────────────────────────────────────────────
        lines.push(_line('gen_sCustType', 'Personal'));
        lines.push(_line('gen_sLastName', a.lastName));
        lines.push(_line('gen_sFirstName', a.firstName));
        lines.push(_line('gen_cInitial', (a.middleName || '').charAt(0)));
        lines.push(_line('gen_sAddress1', addr.street));
        lines.push(_line('gen_sCity', addr.city));
        lines.push(_line('gen_sState', addr.state));
        lines.push(_line('gen_sZip', addr.zip));
        lines.push(_line('gen_sPhone', a.phone));
        lines.push(_line('gen_sCellPhone', a.phone));
        lines.push(_line('gen_sEmail', a.email));
        lines.push(_line('gen_sClientSource', household.referralSource));

        // ─── Client misc data (catch-all for unmapped personal fields) ────────
        // HawkSoft offers 3 banks × 10 slots = 30 free-text fields. We fill them
        // with the household details that don't have dedicated tags.
        const misc = [];
        if (a.dob)                  misc.push(`DOB: ${_dateHS(a.dob)}`);
        if (a.gender)               misc.push(`Gender: ${_genderHS(a.gender)}`);
        if (a.maritalStatus)        misc.push(`Marital: ${_maritalHS(a.maritalStatus)}`);
        if (a.education)            misc.push(`Education: ${a.education}`);
        if (a.industry)             misc.push(`Industry: ${a.industry}`);
        if (a.occupation)           misc.push(`Occupation: ${a.occupation}`);
        if (a.employerName)         misc.push(`Employer: ${a.employerName}`);
        if (a.yearsEmployed)        misc.push(`Years Employed: ${a.yearsEmployed}`);
        if (a.prefix)               misc.push(`Prefix: ${a.prefix}`);
        if (a.suffix)               misc.push(`Suffix: ${a.suffix}`);
        if (a.ssn)                  misc.push(`SSN: ${a.ssn}`);

        if (co && co.present && (co.firstName || co.lastName)) {
            const coName = [co.prefix, co.firstName, co.lastName, co.suffix].filter(Boolean).join(' ');
            misc.push(`Co-Applicant: ${coName}`);
            if (co.dob)             misc.push(`Co-App DOB: ${_dateHS(co.dob)}`);
            if (co.gender)          misc.push(`Co-App Gender: ${_genderHS(co.gender)}`);
            if (co.maritalStatus)   misc.push(`Co-App Marital: ${_maritalHS(co.maritalStatus)}`);
            if (co.relationship)    misc.push(`Co-App Relationship: ${co.relationship}`);
            if (co.phone)           misc.push(`Co-App Phone: ${co.phone}`);
            if (co.email)           misc.push(`Co-App Email: ${co.email}`);
            if (co.occupation)      misc.push(`Co-App Occupation: ${co.occupation}`);
            if (co.industry)        misc.push(`Co-App Industry: ${co.industry}`);
            if (co.education)       misc.push(`Co-App Education: ${co.education}`);
            if (co.employerName)    misc.push(`Co-App Employer: ${co.employerName}`);
        }

        if (household.contactTime)      misc.push(`Best Contact Time: ${household.contactTime}`);
        if (household.contactMethod)    misc.push(`Contact Method: ${household.contactMethod}`);
        if (household.tcpaConsent)      misc.push('TCPA Consent: Yes');
        if (household.creditCheckAuth)  misc.push('Credit Check Authorized: Yes');
        if (household.homeownership)    misc.push(`Homeownership: ${household.homeownership}`);

        if (addr.county)            misc.push(`County: ${addr.county}`);
        if (addr.yearsAt)           misc.push(`Years at Address: ${addr.yearsAt}`);
        if (addr.previous && addr.previous.street) {
            const prev = [addr.previous.street, addr.previous.city, addr.previous.state, addr.previous.zip]
                .filter(Boolean).join(', ');
            misc.push(`Previous Address: ${prev}`);
        }

        // Prior insurance lines that don't have dedicated tags
        const pi = v2.priorInsurance || {};
        if (pi.continuous)           misc.push(`Continuous Coverage: ${pi.continuous}`);
        if (pi.continuousMonths)     misc.push(`Continuous Months: ${pi.continuousMonths}`);

        // Discounts and affinity programs
        const dc = v2.discounts || {};
        const affinities = [];
        if (dc.affinity && dc.affinity.usaa)     affinities.push('USAA');
        if (dc.affinity && dc.affinity.hog)      affinities.push('Harley Owners Group');
        if (dc.affinity && dc.affinity.uscgAux)  affinities.push('USCG Auxiliary');
        if (dc.affinity && dc.affinity.usps)     affinities.push('US Power Squadron');
        if (affinities.length)       misc.push(`Affinity: ${affinities.join(', ')}`);
        if (dc.homeowner)            misc.push('Homeowner discount eligible');
        if (dc.safetyCourse && dc.safetyCourse.boat) misc.push('Boater safety course');
        if (dc.safetyCourse && dc.safetyCourse.rv)   misc.push('RV safety course');

        // Write misc across three banks
        for (let i = 0; i < misc.length && i < 30; i++) {
            const bank = Math.floor(i / 10);
            const slot = i % 10;
            const key = bank === 0 ? 'gen_sClientMiscData'
                : bank === 1 ? 'gen_sClientMisc2Data'
                : 'gen_sClientMisc3Data';
            lines.push(_line(`${key}[${slot}]`, misc[i]));
        }

        // ─── Policy meta block ────────────────────────────────────────────────
        lines.push(_line('gen_sCMSPolicyType', policyType));
        lines.push(_line('gen_sApplicationType', 'Personal'));
        lines.push(_line('gen_sPolicyTitle', policyTitle));
        lines.push(_line('gen_sLOBCode', lobCode));
        lines.push(_line('gen_tEffectiveDate', '(today)'));
        lines.push(_line('gen_sLeadSource', household.referralSource));
        lines.push(_line('gen_nClientStatus', 'Prospect'));

        // gen_sForm — HO3 / HO5 / HO6 for home, type-of-policy for auto
        if (hasHome) {
            // Try to derive HO form from the home's coverage selections — most
            // common defaults to HO3.
            const dwelling = (home && home.dwellingType || '').toLowerCase();
            let form = 'HO3';
            if (dwelling.includes('condo')) form = 'HO6';
            else if (dwelling === 'tenant-occupied' || dwelling.includes('rent')) form = 'HO4';
            lines.push(_line('gen_sForm', form));
        } else if (hasAuto) {
            lines.push(_line('gen_sForm', 'Standard'));
        }

        // ─── Garaging / property address ──────────────────────────────────────
        lines.push(_line('gen_sGAddress', addr.street));
        lines.push(_line('gen_sGCity', addr.city));
        lines.push(_line('gen_sGState', addr.state));
        lines.push(_line('gen_sGZip', addr.zip));
        lines.push(_line('gen_sCounty', addr.county));

        // ─── Home-specific block ──────────────────────────────────────────────
        if (hasHome && home) {
            const hz = home.hazards || {};
            const sys = home.systems || {};
            const roof = home.roof || {};
            const cov = home.coverages || {};
            const end = home.endorsements || {};
            const mort = home.mortgageCompany || {};

            lines.push(_line('gen_sProtectionClass', hz.protectionClass));
            lines.push(_line('gen_nYearBuilt', home.yrBuilt));
            lines.push(_line('gen_sConstruction', home.construction));
            lines.push(_line('gen_sBurgAlarm', hz.alarms));
            // HawkSoft expects "Smoke Detector" / "Central" / etc. — v2's alarms
            // enum covers both burg + fire; mirror the value into both slots.
            lines.push(_line('gen_sFireAlarm', hz.alarms === 'Central Station' ? 'Central' : (hz.alarms || '')));

            // Coverage A-D + liability + medical + deductible
            lines.push(_line('gen_lCovA', cov.dwellingA));
            lines.push(_line('gen_lCovB', cov.otherStructuresB));
            lines.push(_line('gen_lCovC', cov.personalPropertyC));
            lines.push(_line('gen_lCovD', cov.lossOfUseD));
            lines.push(_line('gen_sLiability', cov.liabilityE));
            lines.push(_line('gen_sMedical', cov.medPayF));
            // CMSMTF uses the typo "gen_sDecuct" — confirmed by the official
            // Python generator and example_home.CMSMTF (line 122). Emit BOTH
            // spellings so we're covered whichever HawkSoft actually parses.
            lines.push(_line('gen_sDecuct', cov.deductible));
            lines.push(_line('gen_sDeduct', cov.deductible));

            // Replacement-cost / settlement-type indicator
            if (cov.replacementType && /replacement/i.test(cov.replacementType)) {
                lines.push(_line('gen_bHomeReplacement', 'Y'));
            }

            // Endorsements
            lines.push(_line('gen_lOrdinanceOrLawIncr', end.ordinanceLaw ? '10%' : ''));
            // Multi-policy credit when bundling home + auto
            if (hasAuto) lines.push(_line('gen_bMultiPolicy', 'Y'));

            // Mortgagee — full block (name + address + loan #)
            if (mort.name) {
                lines.push(_line('gen_sLPType1', 'ML'));   // ML = mortgagee
                lines.push(_line('gen_sLpName1', mort.name));
                if (mort.address) {
                    // HawkSoft schema splits mortgagee into address/city/state/zip
                    // but v2 stores it as a single string. Push the whole thing
                    // into Address1; producer cleans up post-import.
                    lines.push(_line('gen_sLpAddress1', mort.address));
                }
                if (mort.loanNumber) lines.push(_line('gen_sLpLoanNumber1', mort.loanNumber));
            }

            // Territory / EQ zone — leave for producer to fill from carrier rater
            lines.push(_line('hpm_sTerritory', addr.zip));
        }

        // ─── Auto-specific block ──────────────────────────────────────────────
        if (hasAuto) {
            // Policy-wide auto coverages — derived from the first auto's coverage
            // block since HawkSoft's auto schema is policy-wide on gen_*, with
            // per-vehicle overrides in veh_*.
            const a0 = autos[0] || {};
            const c0 = a0.coverages || {};
            // BI/PD split — v2 uses combined "100/300/100" liability strings;
            // pull the first two segments as BI, the third as PD.
            const liab = String(c0.liab || '');
            const bipd = liab.match(/^(\d+\/\d+)\/(\d+)$/);
            if (bipd) {
                lines.push(_line('gen_sBi', bipd[1]));
                lines.push(_line('gen_sPd', bipd[2]));
            } else if (liab) {
                lines.push(_line('gen_sBi', liab));
            }
            // UM/UIM uses a single combined limit in v2 ("100/300"); send to UmBi.
            lines.push(_line('gen_sUmBi', c0.umuim));
            lines.push(_line('gen_sUimBi', c0.umuim));
            lines.push(_line('gen_sMedical', c0.medpay));

            // Per-vehicle blocks
            autos.forEach((veh, i) => {
                const cov = veh.coverages || {};
                lines.push(_line(`veh_sYr[${i}]`, veh.year));
                lines.push(_line(`veh_sMake[${i}]`, veh.make));
                lines.push(_line(`veh_sModel[${i}]`, veh.model));
                lines.push(_line(`veh_sVIN[${i}]`, veh.vin));
                lines.push(_line(`veh_sUse[${i}]`, _useTypeHS(veh.useType)));
                lines.push(_line(`veh_lMileage[${i}]`, veh.annualMiles));
                lines.push(_line(`veh_nCommuteMileage[${i}]`, veh.oneWayMiles));
                lines.push(_line(`veh_sComp[${i}]`, cov.compDed || 'None'));
                lines.push(_line(`veh_sColl[${i}]`, cov.collDed || 'None'));
                lines.push(_line(`veh_sTowing[${i}]`, cov.towingDed === 'Included' ? 'Yes' : 'No'));
                lines.push(_line(`veh_sRentRemb[${i}]`, cov.rentalDed && cov.rentalDed !== 'None' ? 'Yes' : 'No'));
                lines.push(_line(`veh_sGaragingZip[${i}]`, veh.garagingZip || addr.zip));

                // Lien holder → loss payee on the vehicle
                const lh = veh.lienHolder || {};
                if (lh.name) {
                    lines.push(_line(`veh_bLossPayee[${i}]`, 'Yes'));
                    lines.push(_line(`veh_sLossPayeeName[${i}]`, lh.name));
                    if (lh.address) lines.push(_line(`veh_sLossPayeeAddress[${i}]`, lh.address));
                } else {
                    lines.push(_line(`veh_bLossPayee[${i}]`, 'No'));
                }

                // Driver assignment — v2 primaryOperatorId references an operator
                // id; find its index in the (filtered) drivers array below.
                if (veh.primaryOperatorId) {
                    const drvIdx = operators.findIndex(o => o.id === veh.primaryOperatorId);
                    if (drvIdx >= 0) {
                        // HawkSoft's veh_nDriver is 1-based
                        lines.push(_line(`veh_nDriver[${i}]`, drvIdx + 1));
                    }
                }
            });

            // Operators → drivers
            operators.forEach((op, i) => {
                const flags = _operatorFlags(op);
                lines.push(_line(`drv_sFirstName[${i}]`, op.firstName));
                lines.push(_line(`drv_sLastName[${i}]`, op.lastName));
                lines.push(_line(`drv_cInitial[${i}]`, (op.middleName || '').charAt(0)));
                lines.push(_line(`drv_tBirthDate[${i}]`, _dateHS(op.dob)));
                lines.push(_line(`drv_sLicenseNum[${i}]`, op.dl && op.dl.num));
                lines.push(_line(`drv_sLicensingState[${i}]`, op.dl && op.dl.state));
                lines.push(_line(`drv_sSex[${i}]`, _genderHS(op.gender)));
                lines.push(_line(`drv_sMaritalStatus[${i}]`, _maritalHS(op.maritalStatus)));
                lines.push(_line(`drv_sDriversOccupation[${i}]`, op.occupation));
                lines.push(_line(`drv_sRelationship[${i}]`, op.relationship || (op.isPrimaryApplicant ? 'Insured' : '')));
                lines.push(_line(`drv_bPrincipleOperator[${i}]`, op.isPrimaryApplicant ? 'Yes' : 'No'));
                lines.push(_line(`drv_bExcluded[${i}]`, flags.excluded));
                lines.push(_line(`drv_bNonDriver[${i}]`, flags.nonDriver));

                // Date-licensed — derive from DOB + yrsAuto when explicit field missing
                if (op.dob && op.dl && op.dl.yearsAuto) {
                    const dobIso = op.dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                    const yrs = parseInt(op.dl.yearsAuto, 10);
                    if (dobIso && Number.isFinite(yrs) && yrs > 0 && yrs < 100) {
                        const now = new Date();
                        const licYr = now.getFullYear() - yrs;
                        lines.push(_line(`drv_tDateLicensed[${i}]`, `${dobIso[2]}/${dobIso[3]}/${licYr}`));
                    }
                }

                // SR-22 / FR-44 filing
                if (op.sr22Required) {
                    lines.push(_line(`drv_bFiling[${i}]`, 'Y'));
                    lines.push(_line(`drv_sFilingState[${i}]`, addr.state));
                    lines.push(_line(`drv_sFilingReason[${i}]`, _filingReasonForOp(op)));
                }

                // Good student / mature / defensive driver
                if (op.goodStudent) lines.push(_line(`drv_bGoodStudent[${i}]`, 'Yes'));
                if (op.matureDriver) lines.push(_line(`drv_bDefDrvr[${i}]`, 'Yes'));
                if (op.defensiveDriving) lines.push(_line(`drv_bDriverTraining[${i}]`, 'Yes'));
            });
        }

        // ─── FSC / agent notes (gen_sFSCNotes + gen_sClientNotes) ─────────────
        // gen_sFSCNotes is the "Free-form notes for the policy". Prior insurance
        // details + risk flags go here. gen_sClientNotes is the catch-all that
        // HawkSoft surfaces in the client header.
        const fscParts = [];
        if (pi.auto && pi.auto.carrier) {
            const p = [pi.auto.carrier];
            if (pi.auto.years)  p.push(`${pi.auto.years} yrs`);
            if (pi.auto.exp)    p.push(`exp ${_dateHS(pi.auto.exp)}`);
            if (pi.auto.limits) p.push(pi.auto.limits);
            fscParts.push(`Prior Auto: ${p.join(', ')}`);
        }
        if (pi.home && pi.home.carrier) {
            const p = [pi.home.carrier];
            if (pi.home.years)  p.push(`${pi.home.years} yrs`);
            if (pi.home.exp)    p.push(`exp ${_dateHS(pi.home.exp)}`);
            fscParts.push(`Prior Home: ${p.join(', ')}`);
        }
        if (pi.boat && pi.boat.carrier)  fscParts.push(`Prior Boat: ${pi.boat.carrier}${pi.boat.exp ? ' exp ' + _dateHS(pi.boat.exp) : ''}`);
        if (pi.rv && pi.rv.carrier)      fscParts.push(`Prior RV: ${pi.rv.carrier}${pi.rv.exp ? ' exp ' + _dateHS(pi.rv.exp) : ''}`);
        if (fscParts.length) lines.push(_line('gen_sFSCNotes', fscParts.join(' | ')));

        // ─── Comprehensive client notes ───────────────────────────────────────
        const noteParts = [];
        noteParts.push(`Quote Type: ${policyTitle}`);

        if (hasHome && home) {
            const h = [];
            if (home.dwellingType)  h.push(`Type: ${home.dwellingType}`);
            if (home.dwellingUsage) h.push(`Usage: ${home.dwellingUsage}`);
            if (home.occupancyType) h.push(`Occupancy: ${home.occupancyType}`);
            if (home.yrBuilt)       h.push(`Built: ${home.yrBuilt}`);
            if (home.sqFt)          h.push(`${home.sqFt} sqft`);
            if (home.lotSize)       h.push(`Lot: ${home.lotSize}`);
            if (home.numStories)    h.push(`${home.numStories} stories`);
            if (home.bedrooms)      h.push(`${home.bedrooms} br`);
            if (home.fullBaths)     h.push(`${home.fullBaths} fb`);
            if (home.halfBaths)     h.push(`${home.halfBaths} hb`);
            if (home.numOccupants)  h.push(`${home.numOccupants} occupants`);
            if (home.exterior)      h.push(`Ext: ${home.exterior}`);
            if (home.foundation)    h.push(`Foundation: ${home.foundation}`);
            if (home.roof && home.roof.type)  h.push(`Roof: ${home.roof.type}`);
            if (home.roof && home.roof.yr)    h.push(`Roof yr: ${home.roof.yr}`);
            if (home.systems && home.systems.heatingType)  h.push(`Heat: ${home.systems.heatingType}`);
            if (home.systems && home.systems.coolingType)  h.push(`Cool: ${home.systems.coolingType}`);
            if (home.systems && home.systems.plumbingYr)   h.push(`Plumb yr: ${home.systems.plumbingYr}`);
            if (home.systems && home.systems.electricalYr) h.push(`Elec yr: ${home.systems.electricalYr}`);
            if (home.hazards && home.hazards.pool)         h.push('Pool');
            if (home.hazards && home.hazards.trampoline)   h.push('Trampoline');
            if (home.hazards && home.hazards.woodStove)    h.push('Wood stove');
            if (home.hazards && home.hazards.businessOnPremises) h.push('Business on premises');
            if (home.hazards && home.hazards.dogs)         h.push(`Dogs: ${home.hazards.dogs}`);
            if (home.coverages && home.coverages.windHailDeductible) h.push(`Wind ded: ${home.coverages.windHailDeductible}`);
            // Endorsements (only emit those that are true)
            const endorsements = [];
            if (home.endorsements) {
                if (home.endorsements.waterBackup)        endorsements.push('Water backup');
                if (home.endorsements.equipmentBreakdown) endorsements.push('Equip breakdown');
                if (home.endorsements.serviceLine)        endorsements.push('Service line');
                if (home.endorsements.scheduledProperty)  endorsements.push('Scheduled property');
                if (home.endorsements.identityTheft)      endorsements.push('Identity theft');
            }
            if (endorsements.length) h.push(`Endorsements: ${endorsements.join(', ')}`);
            if (h.length) noteParts.push(`HOME #1: ${h.join(', ')}`);

            // Additional homes (2+) — append as supplementary lines
            for (let hi = 1; hi < homes.length; hi++) {
                const extra = homes[hi];
                const eParts = [];
                if (extra.address)      eParts.push(extra.address);
                if (extra.dwellingType) eParts.push(extra.dwellingType);
                if (extra.yrBuilt)      eParts.push(`built ${extra.yrBuilt}`);
                if (extra.sqFt)         eParts.push(`${extra.sqFt} sqft`);
                if (extra.coverages && extra.coverages.dwellingA) eParts.push(`Cov A $${extra.coverages.dwellingA}`);
                if (eParts.length) noteParts.push(`HOME #${hi+1}: ${eParts.join(', ')}`);
            }
        }

        if (hasAuto) {
            const vehiclesSummary = autos.map((v, i) => {
                const parts = [`#${i+1}`, v.year, v.make, v.model].filter(Boolean).join(' ');
                const meta = [];
                if (v.vin)              meta.push(`VIN:${v.vin}`);
                if (v.useType)          meta.push(v.useType);
                if (v.annualMiles)      meta.push(`${v.annualMiles}mi/yr`);
                if (v.ownership)        meta.push(_ownershipHS(v.ownership));
                if (v.antiTheftDevice && v.antiTheftDevice !== 'None') meta.push(`AT:${v.antiTheftDevice}`);
                if (v.lienHolder && v.lienHolder.name) meta.push(`Lien:${v.lienHolder.name}`);
                return `${parts}${meta.length ? ' (' + meta.join('; ') + ')' : ''}`;
            }).join(' | ');
            noteParts.push(`VEHICLES: ${vehiclesSummary}`);

            // Operator highlights — SR-22, license suspensions, good student
            const opNotes = operators.filter(o => o.sr22Required || o.licenseSuspended5y || o.goodStudent || o.distantStudent || o.matureDriver)
                .map(o => {
                    const name = [o.firstName, o.lastName].filter(Boolean).join(' ') || 'Operator';
                    const flags = [];
                    if (o.sr22Required)         flags.push('SR-22 req');
                    if (o.licenseSuspended5y)   flags.push('Suspended 5y');
                    if (o.goodStudent)          flags.push('Good student');
                    if (o.distantStudent)       flags.push('Distant student');
                    if (o.matureDriver)         flags.push('Mature driver');
                    if (o.defensiveDriving)     flags.push('DDC');
                    if (o.mvrStatus)            flags.push(`MVR: ${o.mvrStatus}`);
                    return `${name}: ${flags.join(', ')}`;
                });
            if (opNotes.length) noteParts.push(`DRIVER FLAGS: ${opNotes.join(' | ')}`);
        }

        // Loss / violation history
        const hist = v2.history || {};
        if (hist.hasCleanHistory) {
            noteParts.push('History: Clean (all operators, 35 mo)');
        } else if ((hist.losses || []).length || (hist.violations || []).length) {
            const lossSummary = (hist.losses || []).slice(0, 5).map(L => {
                const op = operators.find(o => o.id === L.operatorId);
                const name = op ? `${op.firstName || ''} ${op.lastName || ''}`.trim() : '';
                return [_dateHS(L.date), L.type, L.amount ? `$${L.amount}` : '', name].filter(Boolean).join(' ');
            }).join('; ');
            const violationSummary = (hist.violations || []).slice(0, 5).map(V => {
                const op = operators.find(o => o.id === V.operatorId);
                const name = op ? `${op.firstName || ''} ${op.lastName || ''}`.trim() : '';
                return [_dateHS(V.date), V.type, name].filter(Boolean).join(' ');
            }).join('; ');
            if (lossSummary)      noteParts.push(`LOSSES: ${lossSummary}`);
            if (violationSummary) noteParts.push(`VIOLATIONS: ${violationSummary}`);
        }

        // Free-form agent notes
        if (v2.notes && v2.notes.freeText) {
            noteParts.push(`Notes: ${v2.notes.freeText}`);
        }

        // HawkSoft caps client notes at 2 KB — truncate with ellipsis
        const NOTES_CAP = 2048;
        let notes = noteParts.join(' | ');
        if (notes.length > NOTES_CAP) notes = notes.slice(0, NOTES_CAP - 1) + '…';
        lines.push(_line('gen_sClientNotes', notes));

        // Filter empties, CRLF join — HawkSoft refuses LF-only files
        const content = lines.filter(l => l).join('\r\n');

        const safeName = (window.App && typeof window.App._safeFileNamePart === 'function')
            ? window.App._safeFileNamePart(a.lastName, 'Export')
            : String(a.lastName || 'Export').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 80);

        return {
            content,
            filename: `Lead_${safeName}.cmsmtf`,
            mime: 'text/plain;charset=utf-8',
        };
    }

    // Expose for the orchestrator (intake-v2-export.js)
    window.IntakeV2CMSMTF = { buildIntakeV2CMSMTF };

})();
