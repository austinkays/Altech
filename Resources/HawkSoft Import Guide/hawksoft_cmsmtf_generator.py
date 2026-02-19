"""
HawkSoft 6 CMSMTF Generator
============================
Generates .CMSMTF tagged files for importing clients and policies into HawkSoft 6.
Supports Personal Auto, Home, and Commercial lines of business.

Usage:
    from hawksoft_cmsmtf_generator import CMSMTFGenerator

    gen = CMSMTFGenerator()
    gen.generate_auto(client_data, policy_data, vehicles, drivers)
    gen.generate_home(client_data, policy_data, property_data)
    gen.generate_commercial(client_data, policy_data, coverages)
"""

import os
from datetime import date
from typing import Optional


def _val(v) -> str:
    """Convert a value to a string safe for CMSMTF (blank if None)."""
    if v is None:
        return ""
    return str(v).strip()


def _write_field(lines: list, key: str, value) -> None:
    lines.append(f"{key} = {_val(value)}")


def _write_block(lines: list, fields: dict) -> None:
    for k, v in fields.items():
        _write_field(lines, k, v)


def _gen_client_block(client: dict) -> list:
    """
    Generate the shared client/general block used by all policy types.

    Required keys:
        last_name, first_name, address1, city, state, zip, email

    Optional keys (all default to blank if missing):
        cust_type       - "Personal" (default) or "Commercial"
        business_type   - C/D/F/J/L/N/P/S (for commercial)
        business_name, dba_name
        middle_initial
        fein, business_license, naics, website
        phone, work_phone, fax, pager, cell_phone, msg_phone, email_work
        client_source   - e.g. "Website", "Yellow Pages", "Call In", "Social Media"
        client_notes
        client_status   - "New Client", "Existing Client", "Prospect", "Cancelled"
        agency_id       - your HawkSoft agency ID number
        client_office   - office number (integer), defaults to 1
        misc_data       - list of up to 10 strings (left misc panel)
        misc2_data      - list of up to 10 strings (right misc panel, page 2)
        misc3_data      - list of up to 10 strings (right misc panel, page 3)
    """
    lines = []
    cust_type = client.get("cust_type", "Personal")
    is_commercial = cust_type == "Commercial"

    _write_block(lines, {
        "gen_bBusinessType":   client.get("business_type", "D" if is_commercial else ""),
        "gen_sCustType":       cust_type,
        "gen_sBusinessName":   client.get("business_name", ""),
        "gen_sDBAName":        client.get("dba_name", ""),
        "gen_sLastName":       client.get("last_name", ""),
        "gen_sFirstName":      client.get("first_name", ""),
        "gen_cInitial":        client.get("middle_initial", ""),
        "gen_sAddress1":       client.get("address1", ""),
        "gen_sCity":           client.get("city", ""),
        "gen_sState":          client.get("state", ""),
        "gen_sZip":            client.get("zip", ""),
        "gen_sFEIN":           client.get("fein", ""),
        "gen_sBusinessLicense": client.get("business_license", ""),
        "gen_sClientSource":   client.get("client_source", ""),
        "gen_sClientNotes":    client.get("client_notes", ""),
        "gen_sNAICS":          client.get("naics", ""),
        "gen_sWebsite":        client.get("website", ""),
        "gen_sPhone":          client.get("phone", ""),
        "gen_sWorkPhone":      client.get("work_phone", ""),
        "gen_sFax":            client.get("fax", ""),
        "gen_sPager":          client.get("pager", ""),
        "gen_sCellPhone":      client.get("cell_phone", ""),
        "gen_sMsgPhone":       client.get("msg_phone", ""),
        "gen_sEmail":          client.get("email", ""),
        "gen_sEmailWork":      client.get("email_work", ""),
        "gen_lClientOffice":   client.get("client_office", 1),
    })

    # Misc data arrays (up to 10 slots each, 3 sets)
    for slot, key in [(client.get("misc_data", []), "gen_sClientMiscData"),
                      (client.get("misc2_data", []), "gen_sClientMisc2Data"),
                      (client.get("misc3_data", []), "gen_sClientMisc3Data")]:
        for i in range(10):
            val = slot[i] if i < len(slot) else ""
            _write_field(lines, f"{key}[{i}]", val)

    return lines


def _gen_policy_meta_block(policy: dict, policy_type: str, lob_code: str,
                            app_type: str = "Personal") -> list:
    """
    Generate the shared policy metadata block.

    Required keys:
        company         - carrier name
        effective_date  - MM/DD/YYYY or "(today)"
        expiration_date - MM/DD/YYYY
        production_date - MM/DD/YYYY

    Optional keys:
        policy_number
        policy_title
        policy_form     - e.g. "Standard", "DP1", "Occurrence"
        program
        status          - Active/New/Renewal/Quote/Prospect/etc.
        client_status   - New Client/Existing Client/Prospect/Cancelled
        lead_source     - e.g. "Website"
        total_premium   - numeric
        term            - 1/3/6/12 (months)
        policy_office   - integer
        producer        - 3-letter producer code
        fsc_notes
        filing_fee, policy_fee, broker_fee
        agency_id
        garaging_address, garaging_city, garaging_state, garaging_zip
        county
    """
    lines = []
    _write_block(lines, {
        "gen_sAgencyID":        policy.get("agency_id", ""),
        "gen_sCMSPolicyType":   policy_type,   # AUTO, HOME, ENHANCED
        "gen_sApplicationType": app_type,       # Personal or Commercial
        "gen_sCompany":         policy.get("company", ""),
        "gen_lPolicyOffice":    policy.get("policy_office", 1),
        "gen_sPolicyTitle":     policy.get("policy_title", ""),
        "gen_sForm":            policy.get("policy_form", ""),
        "gen_sLOBCode":         lob_code,       # AUTOP, HOME, CGL, etc.
        "gen_sPolicyNumber":    policy.get("policy_number", ""),
        "gen_tProductionDate":  policy.get("production_date", ""),
        "gen_tExpirationDate":  policy.get("expiration_date", ""),
        "gen_tEffectiveDate":   policy.get("effective_date", "(today)"),
        "gen_sLeadSource":      policy.get("lead_source", ""),
        "gen_dTotal":           policy.get("total_premium", ""),
        "gen_nTerm":            policy.get("term", ""),
        "gen_nClientStatus":    policy.get("client_status", "PROSPECT"),
        "gen_sStatus":          policy.get("status", "Active"),
        "gen_sFSCNotes":        policy.get("fsc_notes", ""),
        "gen_dFilingFee":       policy.get("filing_fee", ""),
        "gen_dPolicyFee":       policy.get("policy_fee", ""),
        "gen_dBrokerFee":       policy.get("broker_fee", ""),
        "gen_sProducer":        policy.get("producer", ""),
        "gen_sProgram":         policy.get("program", ""),
        "gen_sGAddress":        policy.get("garaging_address", ""),
        "gen_sGCity":           policy.get("garaging_city", ""),
        "gen_sGState":          policy.get("garaging_state", ""),
        "gen_sGZip":            policy.get("garaging_zip", ""),
        "gen_sCounty":          policy.get("county", ""),
    })
    return lines


class CMSMTFGenerator:
    """Generate HawkSoft 6 CMSMTF tagged files for client/policy import."""

    def _assemble(self, blocks: list) -> str:
        """Join all blocks and add Windows-style line endings."""
        all_lines = []
        for block in blocks:
            all_lines.extend(block)
        return "\r\n".join(all_lines) + "\r\n"

    def _write(self, content: str, filepath: str) -> str:
        with open(filepath, "w", encoding="utf-8", newline="") as f:
            f.write(content)
        return filepath

    # ------------------------------------------------------------------
    # AUTO
    # ------------------------------------------------------------------
    def generate_auto(self,
                      client: dict,
                      policy: dict,
                      vehicles: list,
                      drivers: list,
                      output_path: str = "import.CMSMTF") -> str:
        """
        Generate a Personal Auto CMSMTF file.

        vehicles: list of dicts, each with:
            make, model, year, vin
            Optional: symbol, territory, addon_equip, assigned_driver (int index),
                      use (Pleasure/Work/etc.), commute_mileage, annual_mileage,
                      gvw, towing, rental, vehicle_type, four_wd,
                      comp (deductible or None), coll (deductible or None),
                      umpd, uimpd, garaging_zip,
                      loss_payee (bool), loss_payee_name, loss_payee_address,
                      loss_payee_addr2, loss_payee_city, loss_payee_state, loss_payee_zip,
                      additional_interest (bool),
                      premiums: dict of dBi, dPd, dUmBi, dUmPd, dUimBi, dUimPd,
                                dMedical, dPip, dAddOnEquip, dCarLoanProtection,
                                dLienholderDed, dComp, dColl, dTowing, dRentRemb, sClass

        drivers: list of dicts, each with:
            last_name, first_name
            Optional: middle_initial, birth_date (MM/DD/YY), points,
                      license_state, license_number,
                      excluded, principal_operator, only_operator, non_driver,
                      occupation, sex, marital_status,
                      sr22_filing (bool), sr22_state, sr22_reason,
                      date_licensed, hired_date, cdl_date,
                      good_student, driver_training, defensive_driver,
                      ssn, relationship
        """
        # Auto-specific policy fields
        auto_fields = [
            "gen_sBi",       "gen_sPd",      "gen_sUmBi",  "gen_sUimBi",
            "gen_sUmPd",     "gen_sUimPd",   "gen_sPipDeduct", "gen_sPip",
            "gen_sMedical",  "gen_sTypeOfPolicy",
        ]
        auto_block = []
        for f in auto_fields:
            key_short = f.replace("gen_s", "").replace("gen_", "").lower()
            # map common keys
            mapping = {
                "bi": "bi", "pd": "pd", "umbi": "um_bi", "uimbi": "uim_bi",
                "umpd": "um_pd", "uimpd": "uim_pd", "pipdeduct": "pip_deduct",
                "pip": "pip", "medical": "medical", "typeofpolicy": "type_of_policy"
            }
            val = policy.get(mapping.get(key_short, key_short), "")
            _write_field(auto_block, f, val)

        # Vehicle blocks
        veh_block = []
        prm_block = []
        for i, v in enumerate(vehicles):
            idx = f"[{i}]"
            _write_block(veh_block, {
                f"veh_sMake{idx}":               v.get("make", ""),
                f"veh_sModel{idx}":              v.get("model", ""),
                f"veh_sYr{idx}":                 v.get("year", ""),
                f"veh_sSymb{idx}":               v.get("symbol", ""),
                f"veh_sTerr{idx}":               v.get("territory", ""),
                f"veh_lAddonEquip{idx}":         v.get("addon_equip", ""),
                f"veh_nDriver{idx}":             v.get("assigned_driver", ""),
                f"veh_sUse{idx}":                v.get("use", ""),
                f"veh_nCommuteMileage{idx}":     v.get("commute_mileage", ""),
                f"veh_lMileage{idx}":            v.get("annual_mileage", ""),
                f"veh_nGVW{idx}":                v.get("gvw", ""),
                f"veh_sTowing{idx}":             v.get("towing", "No"),
                f"veh_sRentRemb{idx}":           v.get("rental", "No"),
                f"veh_sVehicleType{idx}":        v.get("vehicle_type", ""),
                f"veh_bFourWD{idx}":             v.get("four_wd", "No"),
                f"veh_sComp{idx}":               v.get("comp", "None"),
                f"veh_sColl{idx}":               v.get("coll", "None"),
                f"veh_sUmpd{idx}":               v.get("umpd", ""),
                f"veh_bUmpd{idx}":               v.get("bumpd", "No"),
                f"veh_sUimpd{idx}":              v.get("uimpd", ""),
                f"veh_bUimpd{idx}":              v.get("buimpd", "No"),
                f"veh_sVIN{idx}":                v.get("vin", ""),
                f"veh_sGaragingZip{idx}":        v.get("garaging_zip", ""),
                f"veh_bLossPayee{idx}":          v.get("loss_payee", "No"),
                f"veh_bAdditionalInterest{idx}": v.get("additional_interest", "No"),
                f"veh_sLossPayeeName{idx}":      v.get("loss_payee_name", ""),
                f"veh_sLossPayeeAddress{idx}":   v.get("loss_payee_address", ""),
                f"veh_sLossPayeeAddr2{idx}":     v.get("loss_payee_addr2", ""),
                f"veh_sLossPayeeCity{idx}":      v.get("loss_payee_city", ""),
                f"veh_sLossPayeeState{idx}":     v.get("loss_payee_state", ""),
                f"veh_sLossPayeeZip{idx}":       v.get("loss_payee_zip", ""),
            })
            prm = v.get("premiums", {})
            _write_block(prm_block, {
                f"prm_sClass{idx}":            prm.get("sClass", ""),
                f"prm_dBi{idx}":               prm.get("dBi", ""),
                f"prm_dPd{idx}":               prm.get("dPd", ""),
                f"prm_dUmBi{idx}":             prm.get("dUmBi", ""),
                f"prm_dUmPd{idx}":             prm.get("dUmPd", ""),
                f"prm_dUimBi{idx}":            prm.get("dUimBi", ""),
                f"prm_dUimPd{idx}":            prm.get("dUimPd", ""),
                f"prm_dMedical{idx}":          prm.get("dMedical", ""),
                f"prm_dPip{idx}":              prm.get("dPip", ""),
                f"prm_dAddOnEquip{idx}":       prm.get("dAddOnEquip", ""),
                f"prm_dCarLoanProtection{idx}": prm.get("dCarLoanProtection", ""),
                f"prm_dLienholderDed{idx}":    prm.get("dLienholderDed", ""),
                f"prm_dComp{idx}":             prm.get("dComp", ""),
                f"prm_dColl{idx}":             prm.get("dColl", ""),
                f"prm_dTowing{idx}":           prm.get("dTowing", ""),
                f"prm_dRentRemb{idx}":         prm.get("dRentRemb", ""),
            })

        # Driver blocks
        drv_block = []
        for i, d in enumerate(drivers):
            idx = f"[{i}]"
            _write_block(drv_block, {
                f"drv_sLastName{idx}":           d.get("last_name", ""),
                f"drv_sFirstName{idx}":          d.get("first_name", ""),
                f"drv_cInitial{idx}":            d.get("middle_initial", ""),
                f"drv_tBirthDate{idx}":          d.get("birth_date", ""),
                f"drv_nPoints{idx}":             d.get("points", ""),
                f"drv_sLicensingState{idx}":     d.get("license_state", ""),
                f"drv_sLicenseNum{idx}":         d.get("license_number", ""),
                f"drv_bExcluded{idx}":           d.get("excluded", "No"),
                f"drv_bPrincipleOperator{idx}":  d.get("principal_operator", "No"),
                f"drv_bOnlyOperator{idx}":       d.get("only_operator", "No"),
                f"drv_bNonDriver{idx}":          d.get("non_driver", "No"),
                f"drv_sDriversOccupation{idx}":  d.get("occupation", ""),
                f"drv_sSex{idx}":                d.get("sex", ""),
                f"drv_sMaritalStatus{idx}":      d.get("marital_status", ""),
                f"drv_bFiling{idx}":             d.get("sr22_filing", ""),
                f"drv_sFilingState{idx}":        d.get("sr22_state", ""),
                f"drv_sFilingReason{idx}":       d.get("sr22_reason", ""),
                f"drv_tDateLicensed{idx}":       d.get("date_licensed", ""),
                f"drv_tHiredDate{idx}":          d.get("hired_date", ""),
                f"drv_tDateOfCDL{idx}":          d.get("cdl_date", ""),
                f"drv_bGoodStudent{idx}":        d.get("good_student", "No"),
                f"drv_bDriverTraining{idx}":     d.get("driver_training", "No"),
                f"drv_bDefDrvr{idx}":            d.get("defensive_driver", "No"),
                f"drv_sSSNum{idx}":              d.get("ssn", ""),
                f"drv_sRelationship{idx}":       d.get("relationship", ""),
            })

        content = self._assemble([
            _gen_client_block(client),
            _gen_policy_meta_block(policy, "AUTO", "AUTOP", "Personal"),
            auto_block,
            veh_block,
            prm_block,
            drv_block,
        ])
        return self._write(content, output_path)

    # ------------------------------------------------------------------
    # HOME
    # ------------------------------------------------------------------
    def generate_home(self,
                      client: dict,
                      policy: dict,
                      prop: dict = None,
                      output_path: str = "import.CMSMTF") -> str:
        """
        Generate a Home policy CMSMTF file.

        prop: dict with home-specific fields (all optional):
            protection_class, year_built, construction
            burg_alarm        - None/Local/Central
            fire_alarm        - None/Smoke Detector/Central/etc.

            lienholders: list of up to 2 dicts with:
                lp_type (AD/ML), name, name_line2, address, city, state, zip, loan_number

            deadbolt, fire_extinguisher (bool)
            sprinkler         - None/Partial/Full

            boats: list of up to 2 dicts with: boat_type, horsepower, speed, length

            scheduled_items: dict with keys: jewelry, furs, guns, cameras, coins,
                             stamps, silverware, fine_art, golf_equip, musical_inst, electronics
                             (all integer dollar amounts)

            home_replacement (bool)
            cov_a, cov_b, cov_c, cov_d    - coverage amounts
            contents_replacement (bool)
            liability, medical, deductible
            earthquake (bool), eq_deduct, eq_masonry_veneer (bool)
            ordinance_law_incr
            multi_policy (bool)
            additional_res
            county

            premiums: dict with hpm_ fields (see CMSMTF template for full list)
        """
        if prop is None:
            prop = {}

        home_block = []
        _write_block(home_block, {
            "gen_nAdditionalRes":       prop.get("additional_res", ""),
            "gen_sCounty":              prop.get("county", ""),
            "gen_sProtectionClass":     prop.get("protection_class", ""),
            "gen_nYearBuilt":           prop.get("year_built", ""),
            "gen_sConstruction":        prop.get("construction", ""),
            "gen_sBurgAlarm":           prop.get("burg_alarm", ""),
            "gen_sFireAlarm":           prop.get("fire_alarm", ""),
        })

        # Lienholders (up to 2)
        lienholders = prop.get("lienholders", [])
        for i, lh in enumerate(lienholders[:2], start=1):
            _write_block(home_block, {
                f"gen_sLPType{i}":        lh.get("lp_type", ""),
                f"gen_sLpName{i}":        lh.get("name", ""),
                f"gen_sLPName{i}Line2":   lh.get("name_line2", ""),
                f"gen_sLpAddress{i}":     lh.get("address", ""),
                f"gen_sLpCity{i}":        lh.get("city", ""),
                f"gen_sLpState{i}":       lh.get("state", ""),
                f"gen_sLpZip{i}":         lh.get("zip", ""),
                f"gen_sLpLoanNumber{i}":  lh.get("loan_number", ""),
            })

        _write_block(home_block, {
            "gen_bDeadBolt":            "Y" if prop.get("deadbolt") else "",
            "gen_bFireExtinguisher":    "Y" if prop.get("fire_extinguisher") else "",
            "gen_sSprinkler":           prop.get("sprinkler", ""),
        })

        # Boats (up to 2)
        boats = prop.get("boats", [])
        for i, b in enumerate(boats[:2], start=1):
            _write_block(home_block, {
                f"gen_sBoatType{i}":    b.get("boat_type", ""),
                f"gen_nHorsePower{i}":  b.get("horsepower", ""),
                f"gen_nSpeed{i}":       b.get("speed", ""),
                f"gen_nLength{i}":      b.get("length", ""),
            })

        # Scheduled items
        si = prop.get("scheduled_items", {})
        _write_block(home_block, {
            "gen_lJewelry":             si.get("jewelry", ""),
            "gen_lFurs":                si.get("furs", ""),
            "gen_lGuns":                si.get("guns", ""),
            "gen_lCameras":             si.get("cameras", ""),
            "gen_lCoins":               si.get("coins", ""),
            "gen_lStamps":              si.get("stamps", ""),
            "gen_lSilverware":          si.get("silverware", ""),
            "gen_lFineArt":             si.get("fine_art", ""),
            "gen_lGolfEquip":           si.get("golf_equip", ""),
            "gen_lMusicalInst":         si.get("musical_inst", ""),
            "gen_lElectronics":         si.get("electronics", ""),
        })

        _write_block(home_block, {
            "gen_bHomeReplacement":     "Y" if prop.get("home_replacement") else "",
            "gen_lCovA":                prop.get("cov_a", ""),
            "gen_lCovB":                prop.get("cov_b", ""),
            "gen_lCovC":                prop.get("cov_c", ""),
            "gen_lCovD":                prop.get("cov_d", ""),
            "gen_cContentsReplacement": "Y" if prop.get("contents_replacement") else "",
            "gen_sLiability":           prop.get("liability", ""),
            "gen_sMedical":             prop.get("medical", ""),
            "gen_sDecuct":              prop.get("deductible", ""),
            "gen_bEarthquake":          "Y" if prop.get("earthquake") else "",
            "gen_sEQDeduct":            prop.get("eq_deduct", ""),
            "gen_bEQMasonryVeneer":     "Y" if prop.get("eq_masonry_veneer") else "",
            "gen_lOrdinanceOrLawIncr":  prop.get("ordinance_law_incr", ""),
            "gen_bMultiPolicy":         "Y" if prop.get("multi_policy") else "",
        })

        # Premiums
        prm = prop.get("premiums", {})
        prm_fields = [
            "sTerritory", "sEarthquakeZone", "sPremiumGroup",
            "dDwelling", "dOtherStructures", "dPersonalProp", "dLossOfUse",
            "dLiability", "dMedical", "dAdditionalRes", "dHomeReplacement",
            "dWatercraft", "dEarthquake", "dDeductible", "dJewelry", "dFurs",
            "dGuns", "dCameras", "dCoins", "dStamps", "dSilverware", "dFineArt",
            "dGolfEquip", "dMusicalInst", "dElectronics", "dNewHomeCredit",
            "dProtectiveDeviceCr", "dMultiPolicyCredit", "dRenewalCredit",
            "dSPPSurcharge", "dOrdinanceOrLaw", "dSpecialCovA",
        ]
        for pf in prm_fields:
            _write_field(home_block, f"hpm_{pf}", prm.get(pf, ""))

        content = self._assemble([
            _gen_client_block(client),
            _gen_policy_meta_block(policy, "HOME", "HOME", "Personal"),
            home_block,
        ])
        return self._write(content, output_path)

    # ------------------------------------------------------------------
    # COMMERCIAL
    # ------------------------------------------------------------------
    def generate_commercial(self,
                             client: dict,
                             policy: dict,
                             coverages: list = None,
                             lob_code: str = "CGL",
                             output_path: str = "import.CMSMTF") -> str:
        """
        Generate a Commercial policy CMSMTF file.

        lob_code options: CGL, CommProp, WorkComp, Umbrella, CommUmbrella,
                          InlandMarine, BOP, Crime, or any valid HawkSoft LOB

        coverages: list of dicts with: description, limits, deductible
                   (up to as many as needed, indexed [0], [1], ...)
        """
        if coverages is None:
            coverages = []

        client_commercial = dict(client)
        client_commercial.setdefault("cust_type", "Commercial")

        cov_block = []
        for i, cov in enumerate(coverages):
            idx = f"[{i}]"
            _write_block(cov_block, {
                f"gen_Coverage{idx}":      cov.get("description", ""),
                f"gen_CoverageLimits{idx}": cov.get("limits", ""),
                f"gen_CoverageDeds{idx}":  cov.get("deductible", ""),
            })

        content = self._assemble([
            _gen_client_block(client_commercial),
            _gen_policy_meta_block(policy, "ENHANCED", lob_code, "Commercial"),
            cov_block,
        ])
        return self._write(content, output_path)


# =============================================================================
# ACORD XML → CMSMTF Converter (Personal Auto)
# =============================================================================

def acord_auto_xml_to_cmsmtf(xml_path: str, output_path: str = "import.CMSMTF",
                               agency_id: str = "", producer: str = "") -> str:
    """
    Convert a HawkSoft ACORD Auto XML file (.CMSACORDXML) to a CMSMTF tagged file.
    This lets you parse ACORD data and re-output as the simpler CMSMTF format.
    """
    import xml.etree.ElementTree as ET

    tree = ET.parse(xml_path)
    root = tree.getroot()

    def find(node, *paths):
        for path in paths:
            el = node.find(path)
            if el is not None and el.text:
                return el.text.strip()
        return ""

    ns_rq = root.find(".//PersAutoPolicyQuoteInqRq")
    if ns_rq is None:
        raise ValueError("Not a PersAutoPolicyQuoteInqRq XML")

    # Insured
    insured = ns_rq.find(".//InsuredOrPrincipal/GeneralPartyInfo")
    last_name  = find(insured, ".//PersonName/Surname")
    first_name = find(insured, ".//PersonName/GivenName")
    _addr_primary = insured.find(".//Addr[AddrTypeCd='StreetAddress']")
    addr       = _addr_primary if _addr_primary is not None else insured.find(".//Addr")
    city       = find(addr, "City") if addr is not None else ""
    state      = find(addr, "StateProvCd") if addr is not None else ""
    zip_code   = find(addr, "PostalCode") if addr is not None else ""
    address1   = find(addr, "Addr1") if addr is not None else ""

    phones = insured.findall(".//PhoneInfo")
    phone = work_phone = cell = ""
    for ph in phones:
        ptype = find(ph, "PhoneTypeCd")
        puse  = find(ph, "CommunicationUseCd")
        num   = find(ph, "PhoneNumber")
        if ptype == "Cell":
            cell = num
        elif puse == "Business":
            work_phone = num
        elif puse == "Home" or (not phone):
            phone = num

    person_info = ns_rq.find(".//InsuredOrPrincipal/InsuredOrPrincipalInfo/PersonInfo")
    sex            = find(person_info, "GenderCd") if person_info is not None else ""
    marital_status = find(person_info, "MaritalStatusCd") if person_info is not None else ""

    # Policy
    pers_policy = ns_rq.find(".//PersPolicy")
    policy_number = find(pers_policy, "PolicyNumber") if pers_policy is not None else ""
    contract      = pers_policy.find(".//ContractTerm") if pers_policy is not None else None
    eff_dt        = find(contract, "EffectiveDt") if contract is not None else ""
    exp_dt        = find(contract, "ExpirationDt") if contract is not None else ""
    term_units    = find(contract, "DurationPeriod/NumUnits") if contract is not None else "12"
    total_amt     = find(pers_policy, ".//CurrentTermAmt/Amt") if pers_policy is not None else ""

    # Vehicles
    vehicles = []
    for veh in ns_rq.findall(".//PersVeh"):
        vin   = find(veh, "VehIdentificationNumber")
        make  = find(veh, "Manufacturer")
        model = find(veh, "Model")
        year  = find(veh, "ModelYear")
        use   = find(veh, "VehUseCd")
        # Garaging location
        loc_ref = veh.get("LocationRef", "")
        garaging_zip = ""
        if loc_ref:
            loc = ns_rq.find(f".//Location[@id='{loc_ref}']")
            if loc is not None:
                garaging_zip = find(loc, ".//PostalCode")
        loss_payee_name = find(veh, ".//AdditionalInterest/GeneralPartyInfo/NameInfo/CommlName/CommercialName")
        vehicles.append({
            "make": make, "model": model, "year": year, "vin": vin,
            "use": use, "garaging_zip": garaging_zip,
            "loss_payee": bool(loss_payee_name),
            "loss_payee_name": loss_payee_name,
        })

    # Drivers
    drivers = []
    for drv in ns_rq.findall(".//PersDriver"):
        d_surname  = find(drv, ".//PersonName/Surname")
        d_given    = find(drv, ".//PersonName/GivenName")
        d_bday     = find(drv, ".//PersonInfo/BirthDt")
        d_lic_num  = find(drv, ".//DriversLicenseNumber")
        d_lic_st   = find(drv, ".//DriversLicense/StateProvCd")
        d_gender   = find(drv, ".//PersonInfo/GenderCd")
        d_marital  = find(drv, ".//PersonInfo/MaritalStatusCd")
        d_occ      = find(drv, ".//PersonInfo/OccupationDesc")
        d_filing   = find(drv, ".//FinancialResponsibilityFiling/FilingStatusCd")
        d_fil_st   = find(drv, ".//FinancialResponsibilityFiling/StateProvCd")
        d_fil_rsn  = find(drv, ".//FinancialResponsibilityFiling/ReasonForFilingDesc")
        d_rel      = find(drv, ".//PersDriverInfo/DriverRelationshipToApplicantCd")
        d_good_st  = find(drv, ".//PersDriverInfo/GoodStudentCd")
        d_def_drv  = find(drv, ".//PersDriverInfo/DefensiveDriverCd")
        d_training = find(drv, ".//PersDriverInfo/DriverTrainingInd")
        # Convert ACORD relationship code → HawkSoft label
        rel_map = {"IN": "Insured", "SP": "Spouse", "CH": "Child", "PA": "Parent",
                   "EM": "Employee", "SB": "Sibling", "OT": "Other"}
        drivers.append({
            "last_name": d_surname, "first_name": d_given,
            "birth_date": d_bday, "sex": d_gender, "marital_status": d_marital,
            "license_number": d_lic_num, "license_state": d_lic_st,
            "occupation": d_occ, "relationship": rel_map.get(d_rel, d_rel),
            "sr22_filing": d_filing, "sr22_state": d_fil_st, "sr22_reason": d_fil_rsn,
            "good_student": "Yes" if d_good_st == "Y" else "No",
            "defensive_driver": "Yes" if d_def_drv == "Y" else "No",
            "driver_training": "Yes" if d_training == "1" else "No",
        })

    client_data = {
        "last_name": last_name, "first_name": first_name,
        "address1": address1, "city": city, "state": state, "zip": zip_code,
        "phone": phone, "work_phone": work_phone, "cell_phone": cell,
        "cust_type": "Personal",
    }
    policy_data = {
        "policy_number": policy_number,
        "effective_date": eff_dt,
        "expiration_date": exp_dt,
        "term": term_units,
        "total_premium": total_amt,
        "agency_id": agency_id,
        "producer": producer,
        "lead_source": "Website",
        "status": "Active",
        "client_status": "PROSPECT",
    }

    gen = CMSMTFGenerator()
    return gen.generate_auto(client_data, policy_data, vehicles, drivers, output_path)


# =============================================================================
# Example / Demo
# =============================================================================
if __name__ == "__main__":
    gen = CMSMTFGenerator()

    # --- Personal Auto Example ---
    client = {
        "last_name": "White", "first_name": "John", "middle_initial": "A",
        "address1": "1234 Sample Ave", "city": "San Diego", "state": "CA", "zip": "92014",
        "phone": "(503)587-6587", "cell_phone": "(503)555-1616",
        "email": "john@example.com", "cust_type": "Personal",
        "client_source": "Website", "client_status": "PROSPECT",
    }
    policy = {
        "company": "Safeco", "policy_number": "0101277-12",
        "effective_date": "(today)", "expiration_date": "01/01/2026",
        "production_date": "01/01/2025", "term": 6,
        "total_premium": 199, "lead_source": "Website",
        "status": "Active", "client_status": "PROSPECT",
        "agency_id": "65177", "producer": "BBB",
        "garaging_address": "1234 Sample Ave", "garaging_city": "San Diego",
        "garaging_state": "CA", "garaging_zip": "92014",
        "bi": "25/50", "pd": "25", "medical": "incl",
    }
    vehicles = [{
        "make": "TOYOTA", "model": "4RUNNER", "year": "1988",
        "vin": "1ZVFT80N475211367", "use": "Pleasure",
        "comp": "None", "coll": "None", "towing": "No", "rental": "No",
        "loss_payee": "No", "additional_interest": "No",
        "vehicle_type": "SUV", "four_wd": "Yes",
    }]
    drivers = [{
        "last_name": "White", "first_name": "Jeremy", "middle_initial": "M",
        "birth_date": "08/10/81", "sex": "Male", "marital_status": "Married",
        "license_state": "CA", "license_number": "12345678",
        "principal_operator": "Yes", "relationship": "Insured",
        "good_student": "No", "driver_training": "No", "defensive_driver": "No",
    }]
    path = gen.generate_auto(client, policy, vehicles, drivers, "/mnt/user-data/outputs/example_auto.CMSMTF")
    print(f"Auto CMSMTF written: {path}")

    # --- Home Example ---
    home_client = dict(client)
    home_client.update({"last_name": "Avery", "first_name": "Jane", "email": "jane@example.com"})
    home_policy = dict(policy)
    home_policy.update({"policy_number": "4651265-13", "company": "Safeco", "lob_code": "HOME"})
    prop = {
        "protection_class": "1", "year_built": 2000,
        "construction": "Brick", "burg_alarm": "Central",
        "fire_alarm": "Smoke Detector", "county": "Washington",
        "cov_a": 350000, "cov_b": 35000, "cov_c": 150000, "cov_d": 70000,
        "liability": 300000, "medical": "incl", "deductible": "1000",
        "lienholders": [{"lp_type": "ML", "name": "First Bank Mortgage",
                         "address": "100 Bank St", "city": "Portland",
                         "state": "OR", "zip": "97201", "loan_number": "ML-123456"}],
        "multi_policy": True,
    }
    path = gen.generate_home(home_client, home_policy, prop, "/mnt/user-data/outputs/example_home.CMSMTF")
    print(f"Home CMSMTF written: {path}")

    # --- Commercial CGL Example ---
    comm_client = {
        "last_name": "Brown", "first_name": "Molly",
        "business_name": "Brown Insurance Services LLC", "cust_type": "Commercial",
        "business_type": "L",
        "address1": "3054 Valle Ave", "city": "San Diego", "state": "CA", "zip": "92113",
        "phone": "(503)587-6587", "email": "molly@example.com",
        "client_source": "Website",
    }
    comm_policy = {
        "company": "Safeco", "policy_number": "CGL-0101277-12",
        "effective_date": "(today)", "expiration_date": "01/01/2026",
        "production_date": "01/01/2025", "term": 12,
        "total_premium": 2500, "agency_id": "65177", "producer": "BBB",
        "status": "Active", "client_status": "New Client",
    }
    coverages = [
        {"description": "General Liability", "limits": "$1,000,000 / $2,000,000", "deductible": "$0"},
        {"description": "Products / Completed Ops", "limits": "$1,000,000", "deductible": "$0"},
    ]
    path = gen.generate_commercial(comm_client, comm_policy, coverages, "CGL",
                                   "/mnt/user-data/outputs/example_commercial.CMSMTF")
    print(f"Commercial CMSMTF written: {path}")

    # --- ACORD XML → CMSMTF Conversion ---
    try:
        converted = acord_auto_xml_to_cmsmtf(
            "/mnt/user-data/uploads/Sample_ACORD-AUTO.xml",
            "/mnt/user-data/outputs/acord_auto_converted.CMSMTF",
            agency_id="65177", producer="BBB"
        )
        print(f"ACORD→CMSMTF converted: {converted}")
    except Exception as e:
        print(f"ACORD conversion error: {e}")
