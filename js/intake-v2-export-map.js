// intake-v2-export-map.js — Translate IntakeV2 nested data ↔ legacy flat App.data.
//
// The legacy HawkSoft CMSMTF (`App.buildCMSMTF`) and EZLynx XML
// (`App.buildEZLynxXML` / `App.buildEZLynxHomeXML`) builders read flat keys
// off `App.data`, `App.drivers`, and `App.vehicles`. This module collapses
// the v2 nested tree into that shape so the legacy builders keep working
// untouched.
//
// Boats and RVs do NOT route to CMSMTF / XML — they're PDF-only. The
// `toFlatForPDF` helper exposes the full nested tree for the v2 PDF builder.
//
// `fromLegacyShape` is the inverse — used by the optional "import from
// legacy quote" workflow. Operators are seeded from drivers[].

'use strict';

(function () {

function val(v) {
    if (v == null) return '';
    return v;
}

// IntakeV2 → legacy flat (for CMSMTF / EZLynx XML)
function toLegacyShape(v2) {
    if (!v2) return { data: {}, drivers: [], vehicles: [] };
    const home = (v2.homes && v2.homes[0]) || null;

    const data = {
        // Quote type derived from non-empty product arrays. Boats/RVs are
        // not in the legacy qType vocabulary — they don't route to legacy
        // exporters, so we collapse to home/auto/both based on what does.
        qType: deriveQType(v2),
        multiPolicy: deriveQType(v2) === 'both' ? 'yes' : '',
        hasCoApplicant: v2.coApplicant && v2.coApplicant.present ? 'yes' : '',

        // Applicant
        prefix:        val(v2.applicant.prefix),
        firstName:     val(v2.applicant.firstName),
        middleName:    val(v2.applicant.middleName),
        lastName:      val(v2.applicant.lastName),
        suffix:        val(v2.applicant.suffix),
        dob:           val(v2.applicant.dob),
        gender:        val(v2.applicant.gender),
        maritalStatus: val(v2.applicant.maritalStatus),
        phone:         val(v2.applicant.phone),
        email:         val(v2.applicant.email),
        occupation:    val(v2.applicant.occupation),
        industry:      val(v2.applicant.industry),
        education:     val(v2.applicant.education),

        // Co-applicant
        coPrefix:        val(v2.coApplicant.prefix),
        coFirstName:     val(v2.coApplicant.firstName),
        coLastName:      val(v2.coApplicant.lastName),
        coSuffix:        val(v2.coApplicant.suffix),
        coDob:           val(v2.coApplicant.dob),
        coGender:        val(v2.coApplicant.gender),
        coMaritalStatus: val(v2.coApplicant.maritalStatus),
        coPhone:         val(v2.coApplicant.phone),
        coEmail:         val(v2.coApplicant.email),
        coOccupation:    val(v2.coApplicant.occupation),
        coIndustry:      val(v2.coApplicant.industry),
        coEducation:     val(v2.coApplicant.education),
        coRelationship:  val(v2.coApplicant.relationship),

        // Address
        addrStreet:        val(v2.address.street),
        addrCity:          val(v2.address.city),
        addrState:         val(v2.address.state),
        addrZip:           val(v2.address.zip),
        county:            val(v2.address.county),
        yearsAtAddress:    val(v2.address.yearsAt),
        previousAddrStreet: val(v2.address.previous && v2.address.previous.street),
        previousAddrCity:   val(v2.address.previous && v2.address.previous.city),
        previousAddrState:  val(v2.address.previous && v2.address.previous.state),
        previousAddrZip:    val(v2.address.previous && v2.address.previous.zip),
        primaryHomeAddr:    val(v2.address.primaryHome && v2.address.primaryHome.street),
        primaryHomeCity:    val(v2.address.primaryHome && v2.address.primaryHome.city),
        primaryHomeState:   val(v2.address.primaryHome && v2.address.primaryHome.state),
        primaryHomeZip:     val(v2.address.primaryHome && v2.address.primaryHome.zip),

        // Household
        tcpaConsent:     v2.household.tcpaConsent ? true : '',
        creditCheckAuth: v2.household.creditCheckAuth ? true : '',
        contactMethod:   val(v2.household.contactMethod),
        contactTime:     val(v2.household.contactTime),
        referralSource:  val(v2.household.referralSource),

        // Home (first home) → flat property keys
        yrBuilt:           home ? val(home.yrBuilt) : '',
        sqFt:              home ? val(home.sqFt) : '',
        lotSize:           home ? val(home.lotSize) : '',
        dwellingType:      home ? val(home.dwellingType) : '',
        dwellingUsage:     home ? val(home.dwellingUsage) : '',
        occupancyType:     home ? val(home.occupancyType) : '',
        numStories:        home ? val(home.numStories) : '',
        numOccupants:      home ? val(home.numOccupants) : '',
        bedrooms:          home ? val(home.bedrooms) : '',
        fullBaths:         home ? val(home.fullBaths) : '',
        halfBaths:         home ? val(home.halfBaths) : '',
        constructionStyle: home ? val(home.construction) : '',
        exteriorWalls:     home ? val(home.exterior) : '',
        foundation:        home ? val(home.foundation) : '',
        garageType:        home ? val(home.garage && home.garage.type) : '',
        garageSpaces:      home ? val(home.garage && home.garage.spaces) : '',
        roofType:          home ? val(home.roof && home.roof.type) : '',
        roofShape:         home ? val(home.roof && home.roof.shape) : '',
        roofYr:             home ? val(home.roof && home.roof.yr) : '',
        roofUpdate:         home ? val(home.roof && home.roof.update) : '',
        heatingType:        home ? val(home.systems && home.systems.heatingType) : '',
        // heatYr deliberately omitted — v2 schema doesn't capture heating-system
        // year separately. If the legacy CMSMTF/EZLynx exporter needs it, add a
        // `systems.heatingYr` field to the v2 home schema first.
        plumbYr:            home ? val(home.systems && home.systems.plumbingYr) : '',
        elecYr:             home ? val(home.systems && home.systems.electricalYr) : '',
        protectionClass:    home ? val(home.hazards && home.hazards.protectionClass) : '',
        fireStationDist:    home ? val(home.hazards && home.hazards.fireStationDist) : '',
        fireHydrantFeet:    home ? val(home.hazards && home.hazards.fireHydrantFeet) : '',
        burglarAlarm:       home ? val(home.hazards && home.hazards.alarms) : '',
        purchaseDate:       home ? val(home.purchaseDate) : '',

        // ── Home coverage selections ── flat keys the legacy CMSMTF + EZLynx
        // builders read. The HawkSoft template uses `gen_lCovA`/`gen_sLiability`
        // / `gen_sDeduct`; the EZLynx home XML pulls the same flat shape.
        dwellingCoverage:    home ? val(home.coverages && home.coverages.dwellingA) : '',
        otherStructures:     home ? val(home.coverages && home.coverages.otherStructuresB) : '',
        homePersonalProperty:home ? val(home.coverages && home.coverages.personalPropertyC) : '',
        homeLossOfUse:       home ? val(home.coverages && home.coverages.lossOfUseD) : '',
        personalLiability:   home ? val(home.coverages && home.coverages.liabilityE) : '',
        medicalPayments:     home ? val(home.coverages && home.coverages.medPayF) : '',
        homeDeductible:      home ? val(home.coverages && home.coverages.deductible) : '',
        ordinanceOrLaw:      home && home.endorsements && home.endorsements.ordinanceLaw ? 'Yes' : '',

        // Mortgage / lien holder for the home — required for binding when
        // there's a loan against the property.
        mortgagee:           home ? val(home.mortgageCompany && home.mortgageCompany.name) : '',
        mortgageeAddress:    home ? val(home.mortgageCompany && home.mortgageCompany.address) : '',
        mortgageeLoanNum:    home ? val(home.mortgageCompany && home.mortgageCompany.loanNumber) : '',

        // Prior insurance — flatten to legacy field names
        priorCarrier:       val(v2.priorInsurance.auto && v2.priorInsurance.auto.carrier),
        priorYears:         val(v2.priorInsurance.auto && v2.priorInsurance.auto.years),
        priorExp:           val(v2.priorInsurance.auto && v2.priorInsurance.auto.exp),
        priorLiabilityLimits: val(v2.priorInsurance.auto && v2.priorInsurance.auto.limits),
        continuousCoverage:  val(v2.priorInsurance.continuous),
        continuousMonths:    val(v2.priorInsurance.continuousMonths),
        priorHomeCarrier:    val(v2.priorInsurance.home && v2.priorInsurance.home.carrier),

        // Notes
        pdfNotes: val(v2.notes && v2.notes.freeText),
    };

    // Map operators that are linked to autos → drivers[]
    const linkedOperatorIds = collectLinkedOperatorIds(v2);
    const drivers = (v2.operators || [])
        .filter(op => op.isPrimaryApplicant || op.isCoApplicant || linkedOperatorIds.has(op.id))
        .map(op => ({
            id: op.id,
            firstName: val(op.firstName),
            lastName:  val(op.lastName),
            dob:       val(op.dob),
            dlNum:     val(op.dl && op.dl.num),
            dlState:   val(op.dl && op.dl.state),
            relationship: val(op.relationship),
            isPrimaryApplicant: !!op.isPrimaryApplicant,
            isCoApplicant: !!op.isCoApplicant,
            gender:    val(op.gender),
            maritalStatus: val(op.maritalStatus),
            occupation: val(op.occupation),
            accidents: '',     // optional — could derive from history.losses
            violations: '',    // optional — could derive from history.violations
            studentGPA: '',
        }));

    // Map autos to vehicles[]
    const vehicles = (v2.autos || []).map(a => ({
        id: a.id,
        year: val(a.year),
        make: val(a.make),
        model: val(a.model),
        vin:   val(a.vin),
        bodyType: '',
        primaryDriver: a.primaryOperatorId || (drivers[0] && drivers[0].id) || '',
        garagingZip: val(a.garagingZip),
        useType:     val(a.useType),
        annualMiles: val(a.annualMiles),
    }));

    return { data, drivers, vehicles };
}

function collectLinkedOperatorIds(v2) {
    const ids = new Set();
    ['autos','boats','rvs'].forEach(coll => {
        (v2[coll] || []).forEach(item => {
            if (item.primaryOperatorId) ids.add(item.primaryOperatorId);
            if (Array.isArray(item.additionalOperatorIds)) item.additionalOperatorIds.forEach(x => ids.add(x));
        });
    });
    return ids;
}

function deriveQType(v2) {
    const hasHome = (v2.homes || []).length > 0;
    const hasAuto = (v2.autos || []).length > 0;
    if (hasHome && hasAuto) return 'both';
    if (hasHome) return 'home';
    if (hasAuto) return 'auto';
    return 'home'; // fallback for boat/rv-only quotes — legacy exporters need a value
}

// Legacy flat → IntakeV2 nested. Used by optional "import from legacy quote".
function fromLegacyShape(legacy) {
    legacy = legacy || {};
    const v2 = window.IntakeV2.defaultData();
    v2.meta.importedFromLegacy = true;

    // Applicant + co-applicant
    [
        ['prefix','prefix'],['firstName','firstName'],['middleName','middleName'],['lastName','lastName'],['suffix','suffix'],
        ['dob','dob'],['gender','gender'],['maritalStatus','maritalStatus'],['phone','phone'],['email','email'],
        ['occupation','occupation'],['industry','industry'],['education','education'],
    ].forEach(([from, to]) => { if (legacy[from] != null) v2.applicant[to] = legacy[from]; });

    if (legacy.hasCoApplicant === 'yes' || legacy.coFirstName) {
        v2.coApplicant.present = true;
        [
            ['coPrefix','prefix'],['coFirstName','firstName'],['coLastName','lastName'],['coSuffix','suffix'],
            ['coDob','dob'],['coGender','gender'],['coMaritalStatus','maritalStatus'],['coPhone','phone'],['coEmail','email'],
            ['coOccupation','occupation'],['coIndustry','industry'],['coEducation','education'],['coRelationship','relationship'],
        ].forEach(([from, to]) => { if (legacy[from] != null) v2.coApplicant[to] = legacy[from]; });
    }

    // Address
    [
        ['addrStreet','street'],['addrCity','city'],['addrState','state'],['addrZip','zip'],
        ['county','county'],['yearsAtAddress','yearsAt'],
    ].forEach(([from, to]) => { if (legacy[from] != null) v2.address[to] = legacy[from]; });
    [
        ['previousAddrStreet','street'],['previousAddrCity','city'],['previousAddrState','state'],['previousAddrZip','zip'],
    ].forEach(([from, to]) => { if (legacy[from] != null) v2.address.previous[to] = legacy[from]; });

    // Household
    if (legacy.tcpaConsent)     v2.household.tcpaConsent     = !!legacy.tcpaConsent;
    if (legacy.creditCheckAuth) v2.household.creditCheckAuth = !!legacy.creditCheckAuth;
    if (legacy.contactMethod)   v2.household.contactMethod   = legacy.contactMethod;
    if (legacy.contactTime)     v2.household.contactTime     = legacy.contactTime;
    if (legacy.referralSource)  v2.household.referralSource  = legacy.referralSource;

    // Home — only if any home key looks populated
    const homeKeys = ['yrBuilt','sqFt','dwellingType','dwellingUsage','occupancyType','roofType','heatingType'];
    if (homeKeys.some(k => legacy[k])) {
        const home = window.IntakeV2._itemDefaults('homes');
        home.id = window.IntakeV2._newId('home');
        home.address = [legacy.addrStreet, legacy.addrCity, legacy.addrState, legacy.addrZip].filter(Boolean).join(', ');
        home.yrBuilt       = legacy.yrBuilt || '';
        home.sqFt          = legacy.sqFt || '';
        home.lotSize       = legacy.lotSize || '';
        home.dwellingType  = legacy.dwellingType || '';
        home.dwellingUsage = legacy.dwellingUsage || '';
        home.occupancyType = legacy.occupancyType || '';
        home.numStories    = legacy.numStories || '';
        home.numOccupants  = legacy.numOccupants || '';
        home.bedrooms      = legacy.bedrooms || '';
        home.fullBaths     = legacy.fullBaths || '';
        home.halfBaths     = legacy.halfBaths || '';
        home.construction  = legacy.constructionStyle || '';
        home.exterior      = legacy.exteriorWalls || '';
        home.foundation    = legacy.foundation || '';
        home.garage.type   = legacy.garageType || '';
        home.garage.spaces = legacy.garageSpaces || '';
        home.roof.type     = legacy.roofType || '';
        home.roof.shape    = legacy.roofShape || '';
        home.roof.yr       = legacy.roofYr || '';
        home.systems.heatingType  = legacy.heatingType || '';
        home.systems.plumbingYr   = legacy.plumbYr || '';
        home.systems.electricalYr = legacy.elecYr || '';
        home.hazards.protectionClass = legacy.protectionClass || '';
        home.hazards.fireStationDist = legacy.fireStationDist || '';
        home.hazards.fireHydrantFeet = legacy.fireHydrantFeet || '';
        v2.homes = [home];
    }

    // Prior insurance
    if (legacy.priorCarrier)         v2.priorInsurance.auto.carrier = legacy.priorCarrier;
    if (legacy.priorExp)             v2.priorInsurance.auto.exp     = legacy.priorExp;
    if (legacy.priorYears)           v2.priorInsurance.auto.years   = legacy.priorYears;
    if (legacy.priorLiabilityLimits) v2.priorInsurance.auto.limits  = legacy.priorLiabilityLimits;
    if (legacy.continuousCoverage)   v2.priorInsurance.continuous   = legacy.continuousCoverage;
    if (legacy.continuousMonths)     v2.priorInsurance.continuousMonths = legacy.continuousMonths;
    if (legacy.priorHomeCarrier)     v2.priorInsurance.home.carrier = legacy.priorHomeCarrier;

    if (legacy.pdfNotes) v2.notes.freeText = legacy.pdfNotes;

    // Operators / vehicles from legacy arrays
    const legacyDrivers = Array.isArray(legacy.drivers) ? legacy.drivers : [];
    const legacyVehicles = Array.isArray(legacy.vehicles) ? legacy.vehicles : [];
    v2.operators = legacyDrivers.map(d => {
        const op = window.IntakeV2._itemDefaults('operators');
        op.id = d.id || window.IntakeV2._newId('op');
        op.isPrimaryApplicant = !!d.isPrimaryApplicant;
        op.isCoApplicant      = !!d.isCoApplicant;
        op.firstName    = d.firstName || '';
        op.lastName     = d.lastName || '';
        op.dob          = d.dob || '';
        op.dl.num       = d.dlNum || '';
        op.dl.state     = d.dlState || '';
        op.relationship = d.relationship || '';
        op.gender       = d.gender || '';
        op.maritalStatus= d.maritalStatus || '';
        op.occupation   = d.occupation || '';
        return op;
    });
    v2.autos = legacyVehicles.map(v => {
        const a = window.IntakeV2._itemDefaults('autos');
        a.id    = v.id || window.IntakeV2._newId('auto');
        a.year  = v.year || '';
        a.make  = v.make || '';
        a.model = v.model || '';
        a.vin   = v.vin || '';
        a.garagingZip = v.garagingZip || '';
        a.useType     = v.useType || '';
        a.annualMiles = v.annualMiles || '';
        a.primaryOperatorId = v.primaryDriver || '';
        return a;
    });

    return v2;
}

// Direct passthrough for PDF / inspection
function toFlatForPDF(v2) {
    return JSON.parse(JSON.stringify(v2 || window.IntakeV2.data));
}

window.IntakeV2ExportMap = { toLegacyShape, fromLegacyShape, toFlatForPDF, deriveQType };

})();
