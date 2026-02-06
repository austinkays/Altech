# ACORD 25 (2025/12) - PDF Form Field Mapping Guide

## For Developer: PDF Auto-Fill Implementation

This document maps the visible form labels to their likely PDF field names for use with `pdf-lib`, `pdfrw`, or similar PDF manipulation libraries.

---

## 🔍 How to Extract EXACT Field Names

Before implementing, run this Python script on your local machine to get the exact internal field names:

```python
import PyPDF2

pdf_path = "CERTIFICATE OF INSURANCE (202512).PDF"
pdf = PyPDF2.PdfReader(pdf_path)

fields = pdf.get_fields()
if fields:
    print("=== ACORD 25 PDF Form Fields ===\n")
    for field_name, field_info in fields.items():
        field_type = field_info.get('/FT', 'Unknown')
        print(f"{field_name} (Type: {field_type})")
else:
    print("No form fields found")
```

**Alternative:** Use `pdf-lib` in Node.js:
```javascript
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

async function extractFields() {
    const pdfBytes = fs.readFileSync('CERTIFICATE OF INSURANCE (202512).PDF');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    const fields = form.getFields();

    fields.forEach(field => {
        console.log(`${field.getName()}`);
    });
}

extractFields();
```

---

## 📋 ACORD 25 Field Structure (Based on Form Layout)

### **PRODUCER SECTION** (Top Left)

| Visible Label | Likely Field Name | Data Source |
|---------------|-------------------|-------------|
| PRODUCER (full address block) | `Producer` or `ProducerName` | "Altech Insurance Agency, 7813 NE 13th Ave, Vancouver, WA 98665" |
| CONTACT NAME: | `ProducerContactName` | "Austin AK" or "Neil W" (from toggle) |
| PHONE (A/C, No, Ext): | `ProducerPhone` | "(360) 573-3080" |
| FAX (A/C, No): | `ProducerFax` | Leave blank or agency fax |
| E-MAIL ADDRESS: | `ProducerEmail` | "austin@altechinsurance.com" or "neil@altechinsurance.com" |

### **CERTIFICATE INFO** (Top Right)

| Visible Label | Likely Field Name | Data Source |
|---------------|-------------------|-------------|
| DATE (MM/DD/YYYY) | `CertificateDate` | Today's system date |
| CERTIFICATE NUMBER: | `CertificateNumber` | Auto-generate (e.g., `ALT-{YYYY}-{###}`) |
| REVISION NUMBER: | `RevisionNumber` | "0" (for new certs) |

### **INSURERS SECTION** (Center)

| Visible Label | Likely Field Name | Notes |
|---------------|-------------------|-------|
| INSURER A : | `InsurerA` or `InsurerAName` | Insurance carrier name |
| NAIC # (next to Insurer A) | `InsurerA_NAIC` | NAIC number for Insurer A |
| INSURER B : | `InsurerB` | Insurance carrier name |
| NAIC # (next to Insurer B) | `InsurerB_NAIC` | NAIC number for Insurer B |
| INSURER C : | `InsurerC` | Insurance carrier name |
| INSURER D : | `InsurerD` | Insurance carrier name |
| INSURER E : | `InsurerE` | Insurance carrier name |
| INSURER F : | `InsurerF` | Insurance carrier name |

### **INSURED SECTION** (Left Side)

| Visible Label | Likely Field Name | Data Source |
|---------------|-------------------|-------------|
| INSURED (full name/address block) | `InsuredName` | Business Name from API |
| INSURED (address line 1) | `InsuredAddress1` | Address from WA L&I or OR CCB |
| INSURED (address line 2) | `InsuredAddress2` | City, State, ZIP |
| INSURED (address line 3) | `InsuredAddress3` | Additional address info if needed |

### **COVERAGES TABLE**

#### **Column Headers**
| Visible Label | Likely Field Name |
|---------------|-------------------|
| INSR LTR | Insurance letter reference (A, B, C, etc.) - typically not a fillable field per row |
| ADDL INSD | `AdditionalInsured_[Coverage]` (checkbox) |
| SUBR WVD | `SubrogationWaived_[Coverage]` (checkbox) |
| POLICY NUMBER | `PolicyNumber_[Coverage]` |
| POLICY EFF (MM/DD/YYYY) | `PolicyEffective_[Coverage]` |
| POLICY EXP (MM/DD/YYYY) | `PolicyExpiration_[Coverage]` |
| LIMITS | Various limit fields (see below) |

#### **COMMERCIAL GENERAL LIABILITY**

| Visible Label | Likely Field Name | Notes |
|---------------|-------------------|-------|
| COMMERCIAL GENERAL LIABILITY (row) | `GLInsurer` | Letter reference (A/B/C) |
| CLAIMS-MADE (checkbox) | `GL_ClaimsMade` | Checkbox |
| OCCUR (checkbox) | `GL_Occur` | Checkbox |
| GEN'L AGGREGATE LIMIT APPLIES PER: | `GL_AggregateAppliesPer` | Radio buttons below |
| - POLICY (checkbox) | `GL_AggregatePerPolicy` | Checkbox |
| - PROJECT (checkbox) | `GL_AggregatePerProject` | Checkbox |
| - LOC (checkbox) | `GL_AggregatePerLoc` | Checkbox |
| - OTHER: (text field) | `GL_AggregateOther` | Text field |
| POLICY NUMBER | `GL_PolicyNumber` | Policy # |
| POLICY EFF | `GL_PolicyEffective` | MM/DD/YYYY |
| POLICY EXP | `GL_PolicyExpiration` | MM/DD/YYYY |
| EACH OCCURRENCE | `GL_EachOccurrence` | Dollar amount |
| DAMAGE TO RENTED PREMISES (Ea occurrence) | `GL_DamageToRentedPremises` | Dollar amount |
| MED EXP (Any one person) | `GL_MedicalExpense` | Dollar amount |
| PERSONAL & ADV INJURY | `GL_PersonalAdvInjury` | Dollar amount |
| GENERAL AGGREGATE | `GL_GeneralAggregate` | Dollar amount |
| PRODUCTS - COMP/OP AGG | `GL_ProductsCompOpAgg` | Dollar amount |

#### **AUTOMOBILE LIABILITY**

| Visible Label | Likely Field Name | Notes |
|---------------|-------------------|-------|
| AUTOMOBILE LIABILITY (row) | `AutoInsurer` | Letter reference |
| ANY AUTO (checkbox) | `Auto_AnyAuto` | Checkbox |
| OWNED AUTOS ONLY (checkbox) | `Auto_OwnedAutosOnly` | Checkbox |
| SCHEDULED AUTOS (checkbox) | `Auto_ScheduledAutos` | Checkbox |
| HIRED AUTOS ONLY (checkbox) | `Auto_HiredAutosOnly` | Checkbox |
| NON-OWNED AUTOS ONLY (checkbox) | `Auto_NonOwnedAutosOnly` | Checkbox |
| POLICY NUMBER | `Auto_PolicyNumber` | Policy # |
| POLICY EFF | `Auto_PolicyEffective` | MM/DD/YYYY |
| POLICY EXP | `Auto_PolicyExpiration` | MM/DD/YYYY |
| COMBINED SINGLE LIMIT (Ea accident) | `Auto_CombinedSingleLimit` | Dollar amount |
| BODILY INJURY (Per person) | `Auto_BodilyInjuryPerPerson` | Dollar amount |
| BODILY INJURY (Per accident) | `Auto_BodilyInjuryPerAccident` | Dollar amount |
| PROPERTY DAMAGE (Per accident) | `Auto_PropertyDamage` | Dollar amount |

#### **UMBRELLA LIABILITY**

| Visible Label | Likely Field Name | Notes |
|---------------|-------------------|-------|
| UMBRELLA LIAB (row) | `UmbrellaInsurer` | Letter reference |
| OCCUR (checkbox) | `Umbrella_Occur` | Checkbox |
| CLAIMS-MADE (checkbox) | `Umbrella_ClaimsMade` | Checkbox |
| POLICY NUMBER | `Umbrella_PolicyNumber` | Policy # |
| POLICY EFF | `Umbrella_PolicyEffective` | MM/DD/YYYY |
| POLICY EXP | `Umbrella_PolicyExpiration` | MM/DD/YYYY |
| EACH OCCURRENCE | `Umbrella_EachOccurrence` | Dollar amount |
| AGGREGATE | `Umbrella_Aggregate` | Dollar amount |

#### **EXCESS LIABILITY**

| Visible Label | Likely Field Name | Notes |
|---------------|-------------------|-------|
| EXCESS LIAB (row) | `ExcessInsurer` | Letter reference |
| OCCUR (checkbox) | `Excess_Occur` | Checkbox |
| CLAIMS-MADE (checkbox) | `Excess_ClaimsMade` | Checkbox |
| DED (text field) | `Excess_Deductible` | Dollar amount |
| RETENTION (text field) | `Excess_Retention` | Dollar amount |
| POLICY NUMBER | `Excess_PolicyNumber` | Policy # |
| POLICY EFF | `Excess_PolicyEffective` | MM/DD/YYYY |
| POLICY EXP | `Excess_PolicyExpiration` | MM/DD/YYYY |
| EACH OCCURRENCE | `Excess_EachOccurrence` | Dollar amount |
| AGGREGATE | `Excess_Aggregate` | Dollar amount |

#### **WORKERS COMPENSATION**

| Visible Label | Likely Field Name | Notes |
|---------------|-------------------|-------|
| WORKERS COMPENSATION (row) | `WCInsurer` | Letter reference |
| ANY PROPRIETOR/PARTNER/EXECUTIVE OFFICER/MEMBER EXCLUDED? | `WC_ExclusionsQuestion` | Y/N radio buttons |
| Y / N (radio buttons) | `WC_ExclusionsYN` | Y or N |
| N / A (checkbox) | `WC_ExclusionsNA` | Checkbox |
| (Mandatory in NH) | `WC_MandatoryNH` | Informational text |
| If yes, describe under DESCRIPTION OF OPERATIONS below | - | Instruction text |
| POLICY NUMBER | `WC_PolicyNumber` | Policy # |
| POLICY EFF | `WC_PolicyEffective` | MM/DD/YYYY |
| POLICY EXP | `WC_PolicyExpiration` | MM/DD/YYYY |
| PER STATUTE (label) | - | Label for WC coverage |
| OTH-ER (text field) | `WC_Other` | Dollar amount for non-statutory states |
| E.L. EACH ACCIDENT | `WC_EL_EachAccident` | Employers Liability - Each Accident |
| E.L. DISEASE - EA EMPLOYEE | `WC_EL_DiseaseEachEmployee` | Employers Liability - Disease per Employee |
| E.L. DISEASE - POLICY LIMIT | `WC_EL_DiseasePolicyLimit` | Employers Liability - Disease Policy Limit |

### **DESCRIPTION OF OPERATIONS** (Bottom Section)

| Visible Label | Likely Field Name | Data Source |
|---------------|-------------------|-------------|
| DESCRIPTION OF OPERATIONS / LOCATIONS / VEHICLES | `DescriptionOfOperations` | Default: "General Contracting" (editable) |

### **CERTIFICATE HOLDER** (Bottom Left)

| Visible Label | Likely Field Name | Data Source |
|---------------|-------------------|-------------|
| CERTIFICATE HOLDER (multi-line) | `CertificateHolderName` | Name of entity receiving certificate |
| CERTIFICATE HOLDER (address line 1) | `CertificateHolderAddress1` | Address line 1 |
| CERTIFICATE HOLDER (address line 2) | `CertificateHolderAddress2` | City, State, ZIP |
| CERTIFICATE HOLDER (address line 3) | `CertificateHolderAddress3` | Additional address |

### **CANCELLATION NOTICE** (Bottom Right)

| Visible Label | Likely Field Name | Notes |
|---------------|-------------------|-------|
| SHOULD ANY OF THE ABOVE... (text block) | - | Pre-printed text (not fillable) |

### **AUTHORIZED REPRESENTATIVE** (Bottom Right)

| Visible Label | Likely Field Name | Data Source |
|---------------|-------------------|-------------|
| AUTHORIZED REPRESENTATIVE (signature line) | `AuthorizedRepresentative` | "Austin Kay" or "Neil Wiebenga" (from producer toggle) |

**Note:** The signature itself is typically a digital signature field or an image field, not a text field.

---

## 🎯 Auto-Fill Priority Map (For Prospect Investigator Integration)

### **High Priority - Always Fill from API Data:**

```javascript
const autoFillData = {
    // Producer Info (from producer toggle)
    ProducerContactName: producerToggle === 'austin' ? 'Austin AK' : 'Neil W',
    ProducerPhone: '(360) 573-3080',
    ProducerEmail: producerToggle === 'austin' ? 'austin@altechinsurance.com' : 'neil@altechinsurance.com',
    Producer: 'Altech Insurance Agency\n7813 NE 13th Ave\nVancouver, WA 98665',

    // Certificate Date
    CertificateDate: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),

    // Insured Info (from WA L&I or OR CCB API)
    InsuredName: apiData.contractor.businessName,
    InsuredAddress1: apiData.contractor.address.street,
    InsuredAddress2: `${apiData.contractor.address.city}, ${apiData.contractor.address.state} ${apiData.contractor.address.zip}`,

    // Description of Operations
    DescriptionOfOperations: 'General Contracting', // Default, allow manual edit

    // Authorized Representative
    AuthorizedRepresentative: producerToggle === 'austin' ? 'Austin Kay' : 'Neil Wiebenga'
};
```

### **Medium Priority - Fill if Available from Commercial Quote:**

- Insurance carrier names (InsurerA, InsurerB, etc.)
- NAIC numbers
- Policy numbers
- Policy effective/expiration dates
- Coverage limits

### **Low Priority - Manual Entry Required:**

- Certificate Holder information (varies per request)
- Specific coverage checkboxes (depends on policy type)
- Workers Compensation exclusions

---

## 🔧 Implementation Notes

### **Using `pdf-lib` (Recommended for Node.js/Vercel):**

```javascript
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

async function fillACORD25(data) {
    // Load template
    const templateBytes = fs.readFileSync('CERTIFICATE OF INSURANCE (202512).PDF');
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();

    // Fill fields (use exact field names from extraction script)
    const fields = {
        'ProducerContactName': data.producerName,
        'ProducerPhone': data.producerPhone,
        'ProducerEmail': data.producerEmail,
        'InsuredName': data.insuredName,
        'InsuredAddress1': data.insuredAddress1,
        'InsuredAddress2': data.insuredAddress2,
        'CertificateDate': data.certificateDate,
        'DescriptionOfOperations': data.description,
        'AuthorizedRepresentative': data.authorizedRep
    };

    // Apply values
    for (const [fieldName, value] of Object.entries(fields)) {
        try {
            const field = form.getTextField(fieldName);
            field.setText(value);
        } catch (error) {
            console.warn(`Field not found: ${fieldName}`);
        }
    }

    // Save filled PDF
    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
}
```

### **Field Name Variations to Check:**

Some ACORD PDFs use different naming conventions:
- `ProducerContactName` vs `Producer.ContactName` vs `ContactName`
- `InsuredName` vs `Insured.Name` vs `NamedInsured`
- `GL_PolicyNumber` vs `GeneralLiability.PolicyNumber` vs `PolicyNumber_GL`

**Always run the extraction script first to get exact names!**

---

## 📊 State-Specific Data Mapping

### **Washington L&I Data → ACORD 25:**

```
API Field                          → ACORD Field
--------------------------------------------------
contractor.businessName            → InsuredName
contractor.address.street          → InsuredAddress1
contractor.address.city/state/zip  → InsuredAddress2
contractor.licenseType             → DescriptionOfOperations (prepend to default text)
```

### **Oregon CCB Data → ACORD 25:**

```
API Field                          → ACORD Field
--------------------------------------------------
contractor.businessName            → InsuredName
contractor.address.street          → InsuredAddress1
contractor.address.city/state/zip  → InsuredAddress2
contractor.licenseType             → DescriptionOfOperations (prepend to default text)
contractor.rmi                     → DescriptionOfOperations (add "RMI: {name}")
```

---

## ⚠️ Important Reminders

1. **Run the field extraction script first** - Field names may vary by PDF version
2. **Flatten the PDF after filling** - Use `form.flatten()` to prevent editing
3. **Test with different browsers** - PDF rendering varies across Chrome/Firefox/Safari
4. **Handle missing fields gracefully** - Not all ACORD 25 PDFs have identical field names
5. **Validate date formats** - ACORD expects MM/DD/YYYY format
6. **Handle dollar amounts** - Format as "$1,000,000" not "1000000"

---

## 🧪 Testing Checklist

- [ ] Extract actual field names from the PDF
- [ ] Verify producer toggle updates contact info correctly
- [ ] Test with WA L&I data (business name, address)
- [ ] Test with OR CCB data (business name, address, RMI)
- [ ] Verify date formatting (MM/DD/YYYY)
- [ ] Check authorized representative signature/name
- [ ] Test PDF download and print functionality
- [ ] Verify PDF opens correctly in Adobe Reader, Chrome, Firefox
- [ ] Test "Description of Operations" default + manual edit workflow

---

**Last Updated:** February 6, 2026
**ACORD Version:** 2025/12
**Template File:** `CERTIFICATE OF INSURANCE (202512).PDF`
