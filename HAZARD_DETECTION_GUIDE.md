# 🛡️ Hazard Detection Feature Guide

## Overview
The Hazard Detection feature scans satellite imagery of a property to automatically detect common hazards and property features, then allows you to confirm the findings and auto-fill form fields.

## How It Works

### 1. **Trigger the Scan**
- On Step 3 (Property Details), click the "🛡️ Scan for Hazards (AI-Powered)" button
- Requires a complete address (street, city, state)

### 2. **Satellite Analysis**
The app will:
1. Fetch satellite imagery from Google Maps Static API
2. Send the image to Google Gemini AI with a hazard detection prompt
3. Gemini analyzes the image and returns detected:
   - **Hazards**: Pool, Trampoline, Deck/Patio
   - **Property Details**: Number of stories, roof type, garage spaces

### 3. **Review Findings**
An elegant popup displays:
- **Satellite Image**: Tap to view fullscreen (click anywhere to close)
- **Hazards Detected**: Checkboxes showing what was found
  - 🏊 Pool
  - 🎪 Trampoline  
  - 🛋️ Deck/Patio
- **Property Details**: Extracted features like roof type, stories, garage count

### 4. **Confirm & Auto-Fill**
- **Review the satellite image** to visually confirm detections
- **Check/uncheck** hazards you want to apply to the form
- Click "✅ Apply to Form" to auto-fill matching form fields
- Click "Cancel" to discard findings

### 5. **Form Fields Updated**
When you apply detections, these form fields are automatically filled:
- `hasPool` → "yes" (if pool detected and confirmed)
- `hasTrampoline` → "yes" (if trampoline detected and confirmed)
- `hasDeck` → "yes" (if deck detected and confirmed)

Data is saved to localStorage automatically.

## What It Detects

### Hazards
- **Pool**: Swimming pools (in-ground, above-ground)
- **Trampoline**: Recreational trampolines
- **Deck/Patio**: Large decks, patios, porches

### Property Features
- **Roof Type**: Shingle, metal, tile, etc.
- **Number of Stories**: 1, 2, 3+ stories
- **Garage Spaces**: 1, 2, 3+ car garage

## Limitations

1. **Weather Dependent**: Heavy clouds may obscure hazards
2. **Seasonal**: Snow, vegetation, or seasonal items may affect detection
3. **Small Items**: Very small items (hot tubs, small trampolines) may not be detected
4. **Angle Limitations**: Satellite view limited to overhead perspective
5. **Privacy**: Always verify findings visually—AI may have false positives

## Error Handling

If the scan fails:
- Check your internet connection
- Verify the address is complete and correct
- Try again in a few moments
- Fall back to manual entry or research the property via:
  - Zillow (via Maps)
  - Google Earth
  - County property assessor sites

## Tips for Best Results

1. **Use Complete Address**: Street number + name, city, state
2. **Review Satellite Image**: Always view the image before confirming
3. **Visual Verification**: Compare what you see in the image with detections
4. **Uncheck False Positives**: If AI detected something that's not there, uncheck it
5. **Add Missing Details**: If you see a hazard the AI missed, manually check the box

## Example Workflow

```
1. User enters: "408 NW 116th St, Seattle, WA 98133"
2. Clicks "🛡️ Scan for Hazards"
3. Popup shows:
   - Satellite image (overhead view)
   - Pool ✓ Detected
   - Trampoline (Not detected)
   - Deck ✓ Detected
   - Stories: 2
   - Roof Type: Asphalt Shingle
4. User reviews image and confirms findings
5. Form fields updated:
   - hasPool = "yes"
   - hasDeck = "yes"
   - homeBasicsNumStories = "2"
   - homeBasicsRoofType = "Asphalt Shingle"
```

## Technical Details

### API Endpoint
- **Path**: `/api/smart-extract.js`
- **Method**: POST
- **Payload**: `{ address, city, state, zip }`
- **Response**: `{ pool, trampoline, deck, roofType, numStories, garageSpaces, satelliteImage }`

### Data Flow
```
User clicks button
    ↓
smartAutoFill() method called
    ↓
/api/smart-extract.js endpoint
    ↓
Fetch satellite image from Google Maps Static API
    ↓
Send to Gemini for analysis
    ↓
showHazardDetectionPopup() displays elegant modal
    ↓
User confirms/denies findings
    ↓
applyHazardDetections() auto-fills form
    ↓
Data saved to localStorage
```

## FAQ

**Q: Is the satellite image real-time?**
A: Google Maps satellite imagery is periodically updated (typically several months old). Historical images may not reflect current property state.

**Q: Why wasn't my pool detected?**
A: Possible reasons:
- Pool is covered with tarp
- Recent construction (satellite image outdated)
- Indoor pool
- Pool is too small or distant from property center
- Image quality/resolution limitation

**Q: Can I manually correct detections?**
A: Yes! Uncheck boxes for false positives, check boxes for missed items, then apply.

**Q: What if I see different details in the image?**
A: Always trust what you visually confirm in the satellite image over AI detection. You can manually uncheck/check boxes to override AI findings.

**Q: Is this data saved?**
A: Yes, once you apply detections, the form fields are saved to localStorage immediately.

---

**Last Updated**: February 4, 2026
**Feature Status**: ✅ Active & Tested
**Tests Passing**: 12/12
