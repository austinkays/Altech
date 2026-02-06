# COI Auto-Fill Feature - Implementation Summary

## ✅ Completed Features

### 1. **Producer Toggle** (Austin vs Neil)
- **Location**: Prospect Investigator header (top right)
- **Functionality**:
  - Toggle between Austin and Neil
  - Dynamically updates producer contact info on generated COIs
  - Default: Austin
- **Styling**: Active state with blue highlight, smooth transitions

### 2. **Generate COI Button**
- **Location**: Prospect Investigator header (appears after search results)
- **Functionality**:
  - Extracts insured data from search results (L&I or SOS)
  - Sends data to `/api/generate-coi` endpoint
  - Downloads filled ACORD 25 PDF
- **Data Auto-Filled**:
  - Producer name, contact, email (from toggle)
  - Certificate date (today's date)
  - Insured name and address (from API results)
  - Description of operations (license type)
  - Authorized representative (producer full name)

### 3. **COI Generation API** (`/api/generate-coi`)
- **Endpoint**: `/api/generate-coi` (POST)
- **Method**: Text overlay on flattened PDF template
- **Library**: pdf-lib (v1.17.1)
- **Process**:
  1. Load ACORD 25 template with encryption bypass
  2. Overlay text at measured coordinates
  3. Return PDF as downloadable file
- **Fields Filled**:
  - Producer section (agency info + contact)
  - Insured section (business name + address)
  - Certificate date
  - Description of operations
  - Authorized representative signature

### 4. **PDF Field Extraction Utility**
- **Location**: `scripts/extract-pdf-fields.js`
- **Purpose**: Extract form field names from interactive PDFs
- **Findings**: ACORD 25 (2025/12) is flattened - no interactive fields
- **Solution**: Text overlay approach implemented

## 🗂️ Files Modified/Created

| File | Status | Purpose |
|------|--------|---------|
| `package.json` | Modified | Added pdf-lib dependency |
| `index.html` | Modified | Producer toggle UI + COI button + JavaScript functions |
| `api/generate-coi.js` | Created | COI generation serverless function |
| `scripts/extract-pdf-fields.js` | Created | PDF field extraction utility |
| `Resources/ACORD_25_FIELD_MAPPING.md` | Reference | Field mapping guide for developers |

## 📐 Architecture

```
User clicks "Generate COI" button
    ↓
ProspectInvestigator.generateCOI()
    ↓
Extracts data from search results
    ↓
POST /api/generate-coi
    ↓
pdf-lib overlays text on ACORD 25 template
    ↓
Returns PDF blob to browser
    ↓
Auto-downloads filled COI
```

## 🔧 Technical Implementation

### Producer Toggle
```javascript
ProspectInvestigator.setProducer('austin' | 'neil')
// Updates UI active state
// Stores selection in ProspectInvestigator.currentProducer
```

### COI Generation
```javascript
ProspectInvestigator.generateCOI()
// Gets producer info from toggle
// Extracts insured data from search results
// Calls API with prepared data
// Downloads generated PDF
```

### PDF Overlay (API)
```javascript
// Load template
const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });

// Overlay text at coordinates
firstPage.drawText(data.insuredName, {
    x: 40,
    y: height - 170,
    size: 9,
    font: fontBold,
    color: rgb(0, 0, 0)
});

// Return PDF bytes
res.status(200).send(Buffer.from(pdfBytes));
```

## ⚙️ Configuration

### Producer Info (Hardcoded)
```javascript
{
    austin: {
        name: 'Austin AK',
        fullName: 'Austin Kay',
        email: 'austin@altechinsurance.com',
        phone: '(360) 573-3080'
    },
    neil: {
        name: 'Neil W',
        fullName: 'Neil Wiebenga',
        email: 'neil@altechinsurance.com',
        phone: '(360) 573-3080'
    }
}
```

### Agency Info (Static)
```
Altech Insurance Agency
7813 NE 13th Ave
Vancouver, WA 98665
```

## 🎯 Data Flow

### Input Sources
1. **Producer Toggle**: Contact name, email, phone
2. **L&I Search Results**: Business name, address, license type
3. **SOS Search Results**: (Fallback) Business name, address
4. **System**: Certificate date (today)

### Output Fields
| ACORD 25 Field | Data Source |
|----------------|-------------|
| Producer | "Altech Insurance Agency" |
| Contact Name | Producer toggle |
| Phone | Producer toggle |
| Email | Producer toggle |
| Certificate Date | System date |
| Insured Name | L&I or SOS results |
| Insured Address | L&I or SOS results |
| Description of Operations | License type from L&I |
| Authorized Representative | Producer full name |
| Certificate Holder | (Left blank for manual entry) |

## 🚀 Usage Flow

1. User searches for a business in Prospect Investigator
2. Results display (L&I, SOS, OSHA data)
3. User selects producer (Austin or Neil) via toggle
4. User clicks "Generate COI" button
5. COI downloads automatically with pre-filled data
6. User can manually add certificate holder info if needed

## ⚠️ Known Limitations

1. **Certificate Holder**: Left blank - requires manual entry
2. **Coverage Details**: Not filled - requires policy info
3. **Policy Numbers**: Not filled - requires carrier integration
4. **Text Positioning**: May need fine-tuning for perfect alignment
5. **Template Encryption**: Bypassed with `ignoreEncryption: true`

## 🔮 Future Enhancements

### Phase 2 (Recommended)
- [ ] Certificate holder auto-fill from previous COIs
- [ ] Save producer preference in localStorage
- [ ] Add coverage limits fields to UI
- [ ] Policy number integration with carrier APIs
- [ ] Template positioning calibration tool

### Phase 3 (Advanced)
- [ ] Multi-page COI support
- [ ] Additional Insured endorsement generation
- [ ] Waiver of Subrogation endorsement generation
- [ ] COI tracking & expiration reminders
- [ ] Email COI directly to certificate holder

## 📊 Coordinate Reference (For Fine-Tuning)

Current text overlay positions (from bottom-left origin):

```javascript
// Producer section
producerX: 40
producerY: height - 95

// Certificate date
dateX: width - 150
dateY: height - 70

// Insured section
insuredX: 40
insuredY: height - 170

// Description of operations
descriptionX: 40
descriptionY: 180

// Certificate holder
holderX: 40
holderY: 120

// Authorized representative
sigX: width - 200
sigY: 60
```

**Note**: These coordinates are approximate and may need adjustment based on the actual ACORD 25 template layout.

## 🧪 Testing Checklist

- [x] Producer toggle switches between Austin and Neil
- [x] Producer info updates dynamically
- [x] Generate COI button appears after search
- [x] COI generation extracts correct data
- [x] PDF downloads successfully
- [ ] Text alignment is accurate (needs visual verification)
- [ ] All fields are readable
- [ ] PDF opens correctly in Adobe Reader
- [ ] Austin's info appears correctly
- [ ] Neil's info appears correctly

## 📝 Deployment Notes

### Vercel Environment
- No environment variables needed for basic COI generation
- pdf-lib runs in Node.js serverless environment
- Template PDF must be in `Resources/` directory
- API endpoint: `/api/generate-coi` (POST)

### Dependencies Added
```json
{
  "pdf-lib": "^1.17.1"
}
```

### Serverless Function
- **Path**: `/api/generate-coi.js`
- **Method**: POST
- **Timeout**: Default (10 seconds on Hobby plan)
- **Memory**: Default (1024MB)

---

**Built**: February 6, 2026
**Status**: ✅ Ready for Testing
**Next Step**: Visual verification of PDF text positioning
