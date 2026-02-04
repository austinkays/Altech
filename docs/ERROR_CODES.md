# Error Code Reference

## Driver License Scanner Error Codes (300-399)

### Client-Side / Input Validation (301-303)
- **301** - No image data provided (file not selected or empty)
- **302** - Image data corrupted or too small (< 100 bytes)
- **303** - API key not configured (GOOGLE_API_KEY missing in Vercel env)

### API Communication (304-307)
- **304** - HTTP error from Gemini API (check httpStatus in error object)
- **305** - Gemini API returned error response (check apiError in response)
- **306** - No candidates returned (blocked by safety filters or unreadable image)
- **307** - Processing stopped with unusual finish reason (SAFETY, MAX_TOKENS, etc.)

### Response Processing (308-312)
- **308** - Empty response from API (no text returned)
- **309** - No JSON found in response (API returned non-JSON text) ← "string did not match expected pattern"
- **310** - JSON parse error (malformed JSON in response)
- **311** - Invalid data structure (parsed but not an object)
- **312** - Low confidence (<30%) - image quality too poor or not a license

### Network/Runtime Errors (320-322, 413, 399, 999)
- **320** - API key format error or authentication failed
- **321** - Rate limit exceeded (quota/throttling)
- **322** - Network/fetch error (timeout, connection failed)
- **413** - Image payload too large (exceeds Vercel 4.5MB limit) - try with smaller photo or crop closer
- **399** - Unknown error (catch-all for unexpected errors)
- **999** - Client-side exception (JavaScript error in browser)

## How to Use Error Codes

### For Users:
When you see an error message like "Unable to parse license data (Error 309)", you can:
1. Take note of the error code (309)
2. Look it up in this document
3. Try the suggested fix (e.g., retake photo with better focus)

### For Developers:
Error codes appear in:
- **UI messages**: Shown to user after scan fails
- **Vercel logs**: Search for `[DL Scan]` entries
- **API responses**: `errorCode` field in JSON response

Example API response with error:
```json
{
  "success": false,
  "error": "Unable to parse license data. The image may be blurry or not a driver's license. (Error 309)",
  "errorCode": 309,
  "data": {},
  "rawResponse": "The image shows..."
}
```

## Troubleshooting by Error Code

### Error 309 (Most Common)
**Symptom:** "string did not match expected pattern"  
**Cause:** Gemini returned plain text instead of JSON  
**Solutions:**
1. Try a clearer photo (better lighting, focus)
2. Ensure entire license is visible in frame
3. Check if image is actually a driver's license
4. Check Vercel logs for `rawResponse` to see what was returned

### Error 306
**Symptom:** "Image could not be processed"  
**Cause:** Safety filters blocking or image unreadable  
**Solutions:**
1. Don't include people's faces in the photo (crop to just license)
2. Ensure license is well-lit and in focus
3. Try a different angle if glare is present

### Error 304/305
**Symptom:** "API error" with HTTP status  
**Cause:** Problem with Gemini API request  
**Solutions:**
1. Check API key is valid
2. Verify API is enabled in Google Cloud Console
3. Check for service outages at status.cloud.google.com

### Error 321
**Symptom:** "Rate limit reached"  
**Cause:** Too many requests in short time  
**Solutions:**
1. Wait 60 seconds and try again
2. Check if multiple users hitting same API key
3. Consider upgrading API quota

### Error 999
**Symptom:** "Client error" with JavaScript exception  
**Cause:** Error in browser before reaching API  
**Solutions:**
1. Check browser console for full error details
2. Try refreshing the page
3. Clear browser cache and reload
4. Try a different browser (Chrome recommended)

## Adding New Error Codes

When adding new error paths:
1. Use sequential numbers in appropriate range
2. Add error code to error message: `(Error XXX)`
3. Include `errorCode: XXX` in return object
4. Document code in this file
5. Add console.error log with descriptive message

### Reserved Ranges:
- **100-199**: Reserved for future use
- **200-299**: Reserved for future use
- **300-399**: Driver license scanner
- **400-499**: Policy document scanner (future)
- **500-599**: Property data extraction (future)
- **600-699**: Export functions (future)
- **700-799**: Authentication/security (future)
- **800-899**: Storage/database (future)
- **900-999**: System/infrastructure (future)

---

**Last Updated:** February 4, 2026  
**Maintained By:** Development Team
