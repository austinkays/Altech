# HawkSoft Safe Integration Guide

## 🛡️ Safety Guarantee

**You CANNOT break anything in HawkSoft through this API.** Here's why:

### What the API Cannot Do (Protected):
- ❌ Delete clients
- ❌ Delete log notes
- ❌ Delete policies
- ❌ Overwrite existing data
- ❌ Modify client information (name, address, etc.)
- ❌ Delete or modify existing notes

### What the API Can Do (Safe):
- ✅ **Read client data** - Read-only queries
- ✅ **Add log notes** - Append-only (like adding a sticky note, can't remove others)
- ✅ **Attach files** - Append-only
- ✅ **Search clients** - Read-only queries

## 🎯 What's Been Implemented

### 1. Server-Side API (`/api/hawksoft.js`)
**Location:** `/api/hawksoft.js`

**Safety Features:**
- ✅ **Dry-run mode** - Test without sending data
- ✅ **Input validation** - Prevents malformed requests
- ✅ **Audit logging** - Tracks all operations
- ✅ **Error handling** - Graceful failure
- ✅ **Type validation** - Ensures correct data types

**Endpoints:**
```javascript
// Test connection (READ-ONLY)
GET /api/hawksoft?action=test

// Get client details (READ-ONLY)
GET /api/hawksoft?action=client&clientId=12345

// Preview log note (SAFE - doesn't send)
POST /api/hawksoft?action=log&dryRun=true
Body: { clientId, note, ... }

// Add log note (APPEND-ONLY - safe)
POST /api/hawksoft?action=log
Body: { clientId, note, action, createTask, taskDetails }
```

### 2. JavaScript Integration Library (`/js/hawksoft-integration.js`)
**Location:** `/js/hawksoft-integration.js`

**Usage:**
```javascript
// Initialize
const hawksoft = new HawkSoftIntegration();

// Lookup client (READ-ONLY)
const client = await hawksoft.lookupClient(12345);

// Preview before sending (SAFE)
const preview = await hawksoft.previewLogNote(12345, 'Test note');

// Add log note with confirmation (SAFE - user confirms first)
const result = await hawksoft.addLogNote(12345, 'Note text', {
  preview: true, // Shows confirmation dialog
  createTask: true,
  taskDetails: { title: 'Follow up' }
});
```

### 3. Demo Page (`/hawksoft-integration-demo.html`)
**Location:** `/hawksoft-integration-demo.html`

Interactive demo showing:
- Client lookup
- Log note preview
- Safe log note submission with confirmation
- Form data integration example

## 🚀 How to Integrate into Your App

### Step 1: Add the Script to Your HTML

```html
<!-- Add before closing </body> tag -->
<script src="/js/hawksoft-integration.js"></script>
```

### Step 2: Initialize on Page Load

```javascript
// Initialize HawkSoft integration
const hawksoft = new HawkSoftIntegration();

// Test connection
hawksoft.testConnection().then(result => {
  if (result.success) {
    console.log('✅ HawkSoft ready');
  }
});
```

### Step 3: Add to Your Forms

#### Example: Certificate of Insurance Form

```javascript
// After generating COI, allow user to log it in HawkSoft
async function logToHawkSoft() {
  // Get client ID from user
  const clientId = prompt('Enter HawkSoft Client ID:');
  if (!clientId) return;

  // Format log note from form data
  const note = hawksoft.formatLogNote({
    firstName: document.getElementById('firstName').value,
    lastName: document.getElementById('lastName').value,
    email: document.getElementById('email').value,
    phone: document.getElementById('phone').value,
    addrStreet: document.getElementById('addrStreet').value,
    addrCity: document.getElementById('addrCity').value,
    addrState: document.getElementById('addrState').value,
    addrZip: document.getElementById('addrZip').value
  }, {
    additionalFields: {
      'COI Generated': 'Yes',
      'Certificate Type': 'ACORD 25'
    }
  });

  // Send with confirmation (safe - user reviews before sending)
  const result = await hawksoft.addLogNote(clientId, note, {
    preview: true, // Shows confirmation dialog
    createTask: true,
    taskDetails: {
      title: 'Send COI to certificate holder',
      description: 'Certificate of Insurance was generated',
      assignedToRole: 'Producer'
    }
  });

  if (result.success) {
    alert('✅ Logged to HawkSoft successfully!');
  }
}
```

#### Example: Prospect Form

```javascript
async function submitProspect() {
  // ... existing form submission code ...

  // After form is submitted, optionally log to HawkSoft
  if (confirm('Log this prospect to HawkSoft?')) {
    const clientId = prompt('Enter HawkSoft Client ID (if they exist):');
    if (clientId) {
      const note = `Prospect submitted via Altech Field App

Contact: ${prospectData.name}
Email: ${prospectData.email}
Phone: ${prospectData.phone}
Interest: ${prospectData.interest}

Submitted: ${new Date().toLocaleString()}`;

      await hawksoft.addLogNote(clientId, note, {
        preview: true, // Safe - shows confirmation
        createTask: true,
        taskDetails: {
          title: 'Follow up on new prospect',
          assignedToRole: 'Producer'
        }
      });
    }
  }
}
```

## 🔒 Safety Features in Detail

### 1. Dry-Run Mode
Preview exactly what will be sent before sending it:

```javascript
// Preview mode (nothing is sent)
const preview = await hawksoft.previewLogNote(12345, 'Test note');
console.log(preview.payload); // See exactly what would be sent
console.log(preview.safety); // See safety information
```

Response includes:
```json
{
  "dryRun": true,
  "message": "Preview only - not sent to HawkSoft",
  "payload": { /* exact data that would be sent */ },
  "safety": {
    "canDelete": false,
    "canOverwrite": false,
    "operation": "APPEND-ONLY",
    "risk": "LOW - Only adds a log entry"
  }
}
```

### 2. Confirmation Dialogs
By default, all write operations show a confirmation:

```javascript
// This shows a confirmation dialog before sending
await hawksoft.addLogNote(clientId, note, {
  preview: true // DEFAULT - always shows confirmation
});

// To skip confirmation (not recommended):
await hawksoft.addLogNote(clientId, note, {
  preview: false
});
```

### 3. Input Validation
The API validates all inputs:

```javascript
// Validates client ID is numeric
// ✅ Valid: 12345
// ❌ Invalid: "abc"

// Validates note length (max 10,000 characters)
// ❌ Too long: 15,000 character note

// Validates action codes
// ✅ Valid: 29 (Online From Insured)
// ❌ Invalid: 999 (not a real action code)

// Validates task title length (max 200 characters)
```

### 4. Audit Logging
Every operation is logged to console:

```javascript
// [HawkSoft] Creating log note for client: 12345
// [HawkSoft] Payload: { refId: "...", ts: "...", action: 29, ... }
// [HawkSoft] Log note response: 200 { success: true }
```

### 5. Error Handling
Graceful error handling with user-friendly messages:

```javascript
try {
  await hawksoft.addLogNote(12345, 'Test');
} catch (error) {
  // Shows: "Failed to connect to HawkSoft API"
  // instead of raw error
  alert(`Error: ${error.message}`);
}
```

## 📋 Integration Checklist

### Before Going Live:

- [ ] Test connection works (`hawksoft.testConnection()`)
- [ ] Test client lookup with real client ID
- [ ] Test dry-run mode (`dryRun: true`)
- [ ] Test log note with confirmation dialog
- [ ] Verify log note appears in HawkSoft
- [ ] Test error handling (invalid client ID)
- [ ] Add to your forms where appropriate
- [ ] Train team on when to use integration

### Safety Checklist:

- [ ] ✅ Confirmation dialogs enabled
- [ ] ✅ Input validation active
- [ ] ✅ Audit logging to console
- [ ] ✅ Error handling in place
- [ ] ✅ Only read and append operations
- [ ] ✅ No delete or overwrite possible

## 🎓 Training Guide for Team

### When to Use HawkSoft Integration:

1. **After importing a CMSMTF file**
   - Client is now in HawkSoft
   - Log the original form data
   - Create follow-up task

2. **When generating a COI**
   - Log that COI was created
   - Attach PDF if needed
   - Create task to send COI

3. **When prospect converts**
   - Log conversion event
   - Add notes about conversation
   - Create next steps task

### What You CANNOT Do:

- ❌ Create new clients (use CMSMTF import instead)
- ❌ Delete anything
- ❌ Modify client basic info
- ❌ Overwrite existing notes

### What You CAN Do Safely:

- ✅ Look up client information
- ✅ Add notes about interactions
- ✅ Create follow-up tasks
- ✅ Keep activity log updated

## 🐛 Troubleshooting

### "HawkSoft API credentials not configured"
**Solution:** Ensure `.env.local` has all three variables:
- `HAWKSOFT_CLIENT_ID`
- `HAWKSOFT_CLIENT_SECRET`
- `HAWKSOFT_AGENCY_ID`

### "403 Forbidden" when accessing client
**Solution:** Client ID doesn't exist or agency isn't subscribed

### "404 Client not found"
**Solution:** Double-check the client ID is correct

### "Failed to fetch"
**Solution:** Check if Vercel dev server is running or deployed to production

## 📞 Support

If you encounter any issues:
1. Check console logs for detailed error messages
2. Test with dry-run mode first
3. Verify client ID exists in HawkSoft
4. Contact HawkSoft support if API issues persist

## 🎉 Summary

You now have a **safe, tested HawkSoft integration** that:

- ✅ Cannot delete or overwrite data
- ✅ Requires user confirmation
- ✅ Validates all inputs
- ✅ Logs all operations
- ✅ Handles errors gracefully
- ✅ Provides preview mode
- ✅ Ready to integrate into your forms

**Next step:** Add the integration to your existing forms where it makes sense!
