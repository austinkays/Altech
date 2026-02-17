"""
ACORD 25 PDF Filler
Reads JSON from stdin, fills the fillable ACORD 25 PDF, writes filled PDF to stdout.

Usage:
    echo '{"producer_name": "Test Agency"}' | python fill_acord25.py

Field mapping: HTML form IDs → ACORD 25 fillable PDF field names
"""

import sys
import json
import os
from io import BytesIO

import PyPDF2
from PyPDF2.generic import NameObject, TextStringObject


# Path to the fillable ACORD 25 template
TEMPLATE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'Resources',
    'ACORD 25 fillable.pdf'
)

# Leaf field names in the ACORD 25 PDF annotations (no prefix needed)
# Annotations use /T = leaf name, with /Parent chain for hierarchy


def format_date(date_str):
    """Convert YYYY-MM-DD to MM/DD/YYYY for ACORD forms."""
    if not date_str:
        return ''
    try:
        parts = date_str.split('-')
        if len(parts) == 3:
            return f'{parts[1]}/{parts[2]}/{parts[0]}'
    except Exception:
        pass
    return date_str


def build_field_map(data):
    """
    Map incoming JSON data to ACORD 25 PDF annotation field names (leaf names).
    Returns dict of {leaf_field_name: value}.
    """
    fields = {}

    def s(key, default=''):
        """Safely get a string value from data."""
        val = data.get(key, default)
        return str(val) if val else default

    def nested(section, key, default=''):
        """Safely get a nested value."""
        sec = data.get(section, {})
        if isinstance(sec, dict):
            val = sec.get(key, default)
            return str(val) if val else default
        return default

    # ── Certificate Info ──
    fields['Form_CompletionDate_A[0]'] = format_date(s('date'))
    fields['CertificateOfInsurance_CertificateNumberIdentifier_A[0]'] = s('certNumber')
    fields['CertificateOfInsurance_RevisionNumberIdentifier_A[0]'] = s('revNumber')

    # ── Producer Section ──
    fields['Producer_FullName_A[0]'] = nested('producer', 'name')

    prod_addr = nested('producer', 'address')
    prod_city = nested('producer', 'city')
    prod_state = nested('producer', 'state')
    prod_zip = nested('producer', 'zip')

    fields['Producer_MailingAddress_LineOne_A[0]'] = prod_addr
    fields['Producer_MailingAddress_CityName_A[0]'] = prod_city
    fields['Producer_MailingAddress_StateOrProvinceCode_A[0]'] = prod_state
    fields['Producer_MailingAddress_PostalCode_A[0]'] = prod_zip

    fields['Producer_ContactPerson_FullName_A[0]'] = nested('producer', 'contactName', nested('producer', 'name'))
    fields['Producer_ContactPerson_PhoneNumber_A[0]'] = nested('producer', 'phone')
    fields['Producer_FaxNumber_A[0]'] = nested('producer', 'fax')
    fields['Producer_ContactPerson_EmailAddress_A[0]'] = nested('producer', 'email')

    # ── Insured Section ──
    fields['NamedInsured_FullName_A[0]'] = nested('insured', 'name')
    fields['NamedInsured_MailingAddress_LineOne_A[0]'] = nested('insured', 'address')
    fields['NamedInsured_MailingAddress_CityName_A[0]'] = nested('insured', 'city')
    fields['NamedInsured_MailingAddress_StateOrProvinceCode_A[0]'] = nested('insured', 'state')
    fields['NamedInsured_MailingAddress_PostalCode_A[0]'] = nested('insured', 'zip')

    # ── Insurers A-F ──
    insurers = data.get('insurers', {})
    if isinstance(insurers, dict):
        for letter in ['a', 'b', 'c', 'd', 'e', 'f']:
            upper = letter.upper()
            ins = insurers.get(letter, {})
            if isinstance(ins, dict):
                name = ins.get('name', '')
                naic = ins.get('naic', '')
                if name:
                    fields[f'Insurer_FullName_{upper}[0]'] = name
                if naic:
                    fields[f'Insurer_NAICCode_{upper}[0]'] = naic

    # ── General Liability ──
    gl = data.get('gl', {})
    if isinstance(gl, dict):
        fields['GeneralLiability_InsurerLetterCode_A[0]'] = gl.get('insurerLetter', 'A')
        fields['Policy_GeneralLiability_PolicyNumberIdentifier_A[0]'] = gl.get('policy', '')
        fields['Policy_GeneralLiability_EffectiveDate_A[0]'] = format_date(gl.get('effective', ''))
        fields['Policy_GeneralLiability_ExpirationDate_A[0]'] = format_date(gl.get('expiration', ''))
        fields['GeneralLiability_EachOccurrence_LimitAmount_A[0]'] = gl.get('occurrence', '')
        fields['GeneralLiability_FireDamageRentedPremises_EachOccurrenceLimitAmount_A[0]'] = gl.get('rented', '')
        fields['GeneralLiability_MedicalExpense_EachPersonLimitAmount_A[0]'] = gl.get('med', '')
        fields['GeneralLiability_PersonalAndAdvertisingInjury_LimitAmount_A[0]'] = gl.get('personal', '')
        fields['GeneralLiability_GeneralAggregate_LimitAmount_A[0]'] = gl.get('aggregate', '')
        fields['GeneralLiability_ProductsAndCompletedOperations_AggregateLimitAmount_A[0]'] = gl.get('products', '')
        if gl.get('addl'):
            fields['CertificateOfInsurance_GeneralLiability_AdditionalInsuredCode_A[0]'] = 'X'
        if gl.get('subr'):
            fields['Policy_GeneralLiability_SubrogationWaivedCode_A[0]'] = 'X'

    # ── Automobile Liability ──
    auto = data.get('auto', {})
    if isinstance(auto, dict):
        fields['Vehicle_InsurerLetterCode_A[0]'] = auto.get('insurerLetter', 'B')
        fields['Policy_AutomobileLiability_PolicyNumberIdentifier_A[0]'] = auto.get('policy', '')
        fields['Policy_AutomobileLiability_EffectiveDate_A[0]'] = format_date(auto.get('effective', ''))
        fields['Policy_AutomobileLiability_ExpirationDate_A[0]'] = format_date(auto.get('expiration', ''))
        fields['Vehicle_CombinedSingleLimit_EachAccidentAmount_A[0]'] = auto.get('csl', '')
        fields['Vehicle_BodilyInjury_PerPersonLimitAmount_A[0]'] = auto.get('bodyPerson', '')
        fields['Vehicle_BodilyInjury_PerAccidentLimitAmount_A[0]'] = auto.get('bodyAccident', '')
        fields['Vehicle_PropertyDamage_PerAccidentLimitAmount_A[0]'] = auto.get('prop', '')
        if auto.get('addl'):
            fields['CertificateOfInsurance_AutomobileLiability_AdditionalInsuredCode_A[0]'] = 'X'
        if auto.get('subr'):
            fields['Policy_AutomobileLiability_SubrogationWaivedCode_A[0]'] = 'X'

    # ── Umbrella / Excess Liability ──
    umb = data.get('umbrella', {})
    if isinstance(umb, dict):
        fields['ExcessUmbrella_InsurerLetterCode_A[0]'] = umb.get('insurerLetter', 'D')
        fields['Policy_ExcessLiability_PolicyNumberIdentifier_A[0]'] = umb.get('policy', '')
        fields['Policy_ExcessLiability_EffectiveDate_A[0]'] = format_date(umb.get('effective', ''))
        fields['Policy_ExcessLiability_ExpirationDate_A[0]'] = format_date(umb.get('expiration', ''))
        fields['ExcessUmbrella_Umbrella_EachOccurrenceAmount_A[0]'] = umb.get('occurrence', '')
        fields['ExcessUmbrella_Umbrella_AggregateAmount_A[0]'] = umb.get('aggregate', '')
        fields['ExcessUmbrella_Umbrella_DeductibleOrRetentionAmount_A[0]'] = umb.get('ded', '')
        if umb.get('addl'):
            fields['CertificateOfInsurance_ExcessLiability_AdditionalInsuredCode_A[0]'] = 'X'
        if umb.get('subr'):
            fields['Policy_ExcessLiability_SubrogationWaivedCode_A[0]'] = 'X'

    # ── Workers Compensation ──
    wc = data.get('wc', {})
    if isinstance(wc, dict):
        fields['WorkersCompensationEmployersLiability_InsurerLetterCode_A[0]'] = wc.get('insurerLetter', 'C')
        fields['Policy_WorkersCompensationAndEmployersLiability_PolicyNumberIdentifier_A[0]'] = wc.get('policy', '')
        fields['Policy_WorkersCompensationAndEmployersLiability_EffectiveDate_A[0]'] = format_date(wc.get('effective', ''))
        fields['Policy_WorkersCompensationAndEmployersLiability_ExpirationDate_A[0]'] = format_date(wc.get('expiration', ''))
        fields['WorkersCompensationEmployersLiability_EmployersLiability_EachAccidentLimitAmount_A[0]'] = wc.get('accident', '')
        fields['WorkersCompensationEmployersLiability_EmployersLiability_DiseaseEachEmployeeLimitAmount_A[0]'] = wc.get('employee', wc.get('disease', ''))
        fields['WorkersCompensationEmployersLiability_EmployersLiability_DiseasePolicyLimitAmount_A[0]'] = wc.get('diseasePolicyLimit', wc.get('disease', ''))
        if wc.get('excl'):
            fields['WorkersCompensationEmployersLiability_AnyPersonsExcludedIndicator_A[0]'] = 'Y'
        if wc.get('subr'):
            fields['Policy_WorkersCompensation_SubrogationWaivedCode_A[0]'] = 'X'

    # ── Description of Operations ──
    fields['CertificateOfLiabilityInsurance_ACORDForm_RemarkText_A[0]'] = s('description')

    # ── Certificate Holder ──
    holder = data.get('holder', {})
    if isinstance(holder, dict):
        fields['CertificateHolder_FullName_A[0]'] = holder.get('name', '')
        fields['CertificateHolder_MailingAddress_LineOne_A[0]'] = holder.get('address', '')
        fields['CertificateHolder_MailingAddress_CityName_A[0]'] = holder.get('city', '')
        fields['CertificateHolder_MailingAddress_StateOrProvinceCode_A[0]'] = holder.get('state', '')
        fields['CertificateHolder_MailingAddress_PostalCode_A[0]'] = holder.get('zip', '')

    # ── Authorized Representative ──
    fields['Producer_AuthorizedRepresentative_Signature_A[0]'] = s('authorizedRep', nested('producer', 'name'))

    # Remove empty values to avoid overwriting existing content
    return {k: v for k, v in fields.items() if v}


def fill_pdf(data):
    """Fill the ACORD 25 PDF template using direct annotation manipulation.

    This PDF uses XFA+AcroForm hybrid format. PyPDF2's
    update_page_form_field_values doesn't work because the form hierarchy
    is XFA-based. Instead we:
    1. clone_document_from_reader (preserves AcroForm + XFA structure)
    2. Iterate page annotations directly
    3. Match by /T (leaf field name) and set /V with TextStringObject
    """
    reader = PyPDF2.PdfReader(TEMPLATE_PATH)
    writer = PyPDF2.PdfWriter()
    writer.clone_document_from_reader(reader)

    field_map = build_field_map(data)

    # Fill fields via direct annotation manipulation
    filled_count = 0
    for page in writer.pages:
        annots = page.get('/Annots')
        if not annots:
            continue
        for annot_ref in annots:
            annot = annot_ref.get_object()
            field_name = annot.get('/T')
            if field_name and str(field_name) in field_map:
                value = field_map[str(field_name)]
                annot.update({
                    NameObject('/V'): TextStringObject(value)
                })
                filled_count += 1

    sys.stderr.write(f'Filled {filled_count} fields\n')

    # Write to bytes
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def main():
    """Read JSON from stdin, fill PDF, write to stdout."""
    try:
        input_data = sys.stdin.buffer.read().decode('utf-8')
        data = json.loads(input_data)
    except json.JSONDecodeError as e:
        sys.stderr.write(f'Invalid JSON input: {e}\n')
        sys.exit(1)

    try:
        pdf_bytes = fill_pdf(data)
        sys.stdout.buffer.write(pdf_bytes)
    except FileNotFoundError:
        sys.stderr.write(f'Template not found: {TEMPLATE_PATH}\n')
        sys.exit(2)
    except Exception as e:
        sys.stderr.write(f'PDF fill error: {e}\n')
        sys.exit(3)


if __name__ == '__main__':
    main()
