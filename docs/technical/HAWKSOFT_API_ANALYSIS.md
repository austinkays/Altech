# HawkSoft Partner API V3.0 - Complete Integration Guide

## 🎯 Executive Summary

**Good News:** The HawkSoft API does NOT support creating new clients directly via API. However, it provides powerful capabilities for:
- ✅ Reading existing client data
- ✅ Adding log notes to clients
- ✅ Attaching files to client records
- ✅ Recording payments/receipts
- ✅ Searching for clients

**Reality Check:** We'll need to **keep using CMSMTF file imports for creating new leads**, but we can build powerful features around the API.

---

## 📚 API Endpoints Overview

### Authentication
- **Method:** HTTP Basic Authentication
- **Format:** `username:password` (credentials provided by HawkSoft)
- **Base URL:** `https://integration.hawksoft.app`
- **Version:** All requests require `?version=3.0` parameter

### Available Endpoints

#### 1. **GET /vendor/agencies** 
Get list of agency IDs that have subscribed to your integration.

```bash
curl -v https://integration.hawksoft.app/vendor/agencies?version=3.0 \
  -u [user]:[pwd] --basic
```

**Response:** `[1, 2, 3]` (array of agency IDs)

---

#### 2. **GET /vendor/agency/{agencyId}/offices**
Get list of offices for an agency.

```bash
curl -v https://integration.hawksoft.app/vendor/agency/1/offices?version=3.0 \
  -u [user]:[pwd] --basic
```

**Response:**
```json
[
  {
    "OfficeId": 1,
    "OfficeDescription": "Main Office",
    "SubAgencyName": "Downtown Branch",
    "PrimaryOffice": true,
    "AddressLine1": "123 Main St",
    "City": "Las Vegas",
    "State": "NV",
    "Zipcode": "89101"
  }
]
```

---

#### 3. **GET /vendor/agency/{agencyId}/clients** (Changed Clients)
Get clients that have changed since a specific date.

**Parameters:**
- `asOf`: DateTime (optional) - Get changes since this timestamp
- `officeId`: Int (optional) - Filter by office
- `deleted`: Boolean (optional) - Include deleted clients

```bash
curl -v "https://integration.hawksoft.app/vendor/agency/1/clients?version=3.0&asOf=2025-01-01T00:00:00Z" \
  -u [user]:[pwd] --basic
```

**Response:** `[1, 2, 3, 4]` (array of client IDs that changed)

**Use Case:** Sync changes from HawkSoft → your app

---

#### 4. **GET /vendor/agency/{agencyId}/client/{clientId}**
Get full details for a specific client.

```bash
curl -v https://integration.hawksoft.app/vendor/agency/1/client/12345?version=3.0 \
  -u [user]:[pwd] --basic
```

**Response:** Full client object (see Client Model Reference section)

---

#### 5. **POST /vendor/agency/{agencyId}/clients** (Get Client List)
Get details for multiple clients at once.

**Body:**
```json
{
  "clientNumbers": [1, 2, 3]
}
```

**Response:** Array of client objects

---

#### 6. **GET /vendor/agency/{agencyId}/clients/search** (⚠️ In Development - HS6 Only)
Search for clients by policy number.

**Parameters:**
- `policyNumber`: String (required) - Exact match only
- `include`: String (optional) - `details,policies` (comma-delimited)

```bash
curl "https://integration.hawksoft.app/vendor/agency/1/clients/search?version=3.0&policyNumber=POR83741&include=details,policies" \
  -u [user]:[pwd] --basic
```

---

#### 7. **POST /vendor/agency/{agencyId}/client/{clientId}/log** ⭐
**Add a log note to a client's record.**

**Body:**
```json
{
  "refId": "550e8400-e29b-41d4-a716-446655440000",
  "ts": "2025-02-02T15:13:42.948Z",
  "action": 29,
  "note": "Lead submitted via Altech Field App",
  "policyId": "optional-policy-guid",
  "task": {
    "title": "Follow up with lead",
    "description": "Contact client to finalize quote",
    "dueDate": "2025-02-05T17:00:00Z",
    "assignedToRole": "Producer",
    "assignedToEmail": "agent@agency.com",
    "category": "Sales"
  }
}
```

**Log Actions:**
- `29` = Online From Insured (website form)
- `33` = Email To Insured
- `37` = Email From Insured
- See full list below

**Response:**
- `200` = Created successfully
- `202` = Queued (will create when agency connects to cloud)

---

#### 8. **POST /vendor/agency/{agencyId}/client/{clientId}/attachment**
Attach a file to a client record.

**Headers:**
```
RefId: [guid]
TS: [timestamp]
Desc: [description]
LogNote: [base64 encoded note]
FileName: [filename]
FileExt: [extension like .pdf]
PolicyId: [optional-guid]
Channel: [log action number]
TaskAssignedToEmail: [optional]
TaskAssignedToRole: [optional]
TaskTitle: [optional base64]
```

**Body:** File content (binary or base64)

**Use Case:** Attach the CMSMTF file to the client record after import

---

#### 9. **POST /vendor/agency/{agencyId}/client/{clientId}/receipts** (HS6 Only)
Record a payment received from a client.

**Body:**
```json
{
  "refId": "guid",
  "ts": "2025-02-02T15:13:42.948Z",
  "channel": 29,
  "logNote": "Payment received via online portal",
  "payMethod": "CreditCard",
  "invoices": [
    {
      "invoiceId": "invoice-guid",
      "amount": 250.00
    }
  ],
  "policyId": "optional-guid",
  "officeId": 1
}
```

---

## 🚀 Integration Strategy for Altech App

### Phase 1: Current State (CMSMTF Files) ✅
**Status:** Already implemented and working!

1. User fills out intake form
2. Click "Export HawkSoft"
3. Download CMSMTF file(s)
4. Manually import to HawkSoft

**Pros:** Works immediately, no API credentials needed yet
**Cons:** Manual import step

---

### Phase 2: API-Enhanced Workflow (Recommended Next)

#### Workflow:
1. **User fills out form** → Still generates CMSMTF file(s)
2. **User imports file** → Creates client in HawkSoft (manual step - unavoidable)
3. **User enters HawkSoft Client ID** → New input field in app
4. **App calls API** → Automatically adds log note + attaches original form data

#### Benefits:
- ✅ Automatic activity logging
- ✅ Form data preserved as attachment
- ✅ Can create follow-up tasks
- ✅ Better audit trail

#### Implementation:
```javascript
async function linkToHawkSoft(clientId, hawksoftClientNumber) {
  const apiUrl = `https://integration.hawksoft.app/vendor/agency/${AGENCY_ID}/client/${hawksoftClientNumber}/log?version=3.0`;
  
  const logNote = {
    refId: crypto.randomUUID(),
    ts: new Date().toISOString(),
    action: 29, // Online From Insured
    note: `Lead captured via Altech Field App\n\nClient: ${data.firstName} ${data.lastName}\nEmail: ${data.email}\nPhone: ${data.phone}\n\nQuote Type: ${quoteType}\nProperty: ${data.addrStreet}, ${data.addrCity} ${data.addrState}`,
    task: {
      title: "Follow up on new lead",
      description: "Contact client to discuss insurance needs",
      dueDate: new Date(Date.now() + 24*60*60*1000).toISOString(), // Tomorrow
      assignedToRole: "Producer"
    }
  };
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${API_USER}:${API_PWD}`),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(logNote)
  });
  
  return response.status; // 200 = success
}
```

---

### Phase 3: Advanced Features (Future)

#### A. **Duplicate Detection**
Before generating CMSMTF, search for existing client:
- Search by email address (need to get all clients and filter)
- Search by policy number (if renewal)
- Alert user if duplicate found

#### B. **Status Sync**
- Periodically check for changed clients
- Update local records with HawkSoft data
- Show which leads have been converted to policies

#### C. **Two-Way Sync**
- User updates info in HawkSoft → syncs back to your app
- Keep local database in sync with HawkSoft

#### D. **Analytics Dashboard**
- Track lead conversion rates
- See which leads have been contacted
- Monitor time-to-quote metrics

---

## 📋 Log Action Codes (Complete List)

```javascript
const LOG_ACTIONS = {
  // Phone
  1: 'Phone To Insured',
  2: 'Phone To Carrier',
  5: 'Phone From Insured',
  
  // Mail
  9: 'Mail To Insured',
  13: 'Mail From Insured',
  
  // Walk In
  17: 'Walk In To Insured',
  21: 'Walk In From Insured',
  
  // Online (Website/Portal)
  25: 'Online To Insured',
  29: 'Online From Insured',  // ⭐ Use this for web form submissions
  
  // Email
  33: 'Email To Insured',
  37: 'Email From Insured',  // ⭐ Use for email-generated leads
  
  // Text/SMS
  41: 'Text To Insured',
  45: 'Text From Insured',
  
  // Chat
  49: 'Chat To Insured',
  53: 'Chat From Insured'
};
```

**Recommendation:** Use **Action 29 (Online From Insured)** for your web form submissions.

---

## 🔒 Security & Best Practices

### 1. **Protect API Credentials**
- ❌ **NEVER** hardcode credentials in client-side JavaScript
- ✅ Store credentials server-side only
- ✅ Use environment variables
- ✅ Implement backend proxy endpoint

### 2. **Recommended Architecture**
```
[Browser/App] → [Your Backend API] → [HawkSoft API]
               (Node.js/Python/etc)
```

**Backend endpoint example:**
```javascript
// backend/api/hawksoft-log.js (Node.js)
app.post('/api/hawksoft/log-note', async (req, res) => {
  const { clientId, note } = req.body;
  
  // Validate request
  if (!clientId || !note) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Call HawkSoft API (credentials safe on server)
  const hawksoftUrl = `https://integration.hawksoft.app/vendor/agency/${process.env.HAWKSOFT_AGENCY_ID}/client/${clientId}/log?version=3.0`;
  
  const response = await fetch(hawksoftUrl, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${process.env.HAWKSOFT_USER}:${process.env.HAWKSOFT_PWD}`).toString('base64'),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      refId: crypto.randomUUID(),
      ts: new Date().toISOString(),
      action: 29,
      note: note
    })
  });
  
  res.json({ success: response.ok, status: response.status });
});
```

### 3. **Error Handling**
- `200` = Success
- `202` = Queued (agency offline, will process later)
- `400` = Bad request (check your data)
- `401` = Invalid credentials
- `403` = No permission for this agency
- `404` = Client not found

### 4. **Rate Limiting**
- No documented rate limits, but be respectful
- Batch operations when possible (use bulk client endpoint)
- Don't poll excessively - use webhooks if available

---

## 💡 Immediate Next Steps

### Step 1: Get API Credentials
Reply to Keenan:
> "We've reviewed the API documentation and are ready to proceed. Please generate our API credentials for Altech Insurance Agency. We plan to integrate log note creation and attachment features to streamline our lead management workflow."

### Step 2: Test Connection
Once you have credentials:
```bash
# Test basic auth
curl -v "https://integration.hawksoft.app/vendor/agencies?version=3.0" \
  -u YOUR_USERNAME:YOUR_PASSWORD --basic
```

Should return your agency ID.

### Step 3: Build Backend Proxy
Set up a simple backend service to safely proxy requests to HawkSoft API.

### Step 4: Enhance UI
Add "Link to HawkSoft Client" feature:
- Input field for HawkSoft Client ID
- "Sync to HawkSoft" button
- Shows success/error messages

---

## ⚠️ Important Limitations

### Cannot Create Clients via API
**The API does NOT provide endpoints to:**
- ❌ Create new clients
- ❌ Create new policies
- ❌ Update client basic info (name, address, etc.)

**Must use CMSMTF file import for:**
- ✅ Creating new client records
- ✅ Adding new policies
- ✅ Initial data population

### Read-Mostly API
The API is primarily designed for:
- Reading client data
- Adding notes/logs to existing clients
- Attaching documents
- Recording payments

This is intentional - HawkSoft wants to maintain data integrity by keeping client creation in their controlled import process.

---

## 🎯 Recommended Integration Roadmap

### Month 1: Foundation
- ✅ Get API credentials
- ✅ Build backend proxy service
- ✅ Test basic connectivity
- ✅ Implement log note creation

### Month 2: Enhancement
- Add "Link to HawkSoft" feature in UI
- Auto-create log notes after CMSMTF import
- Attach form data as files to client records
- Create follow-up tasks automatically

### Month 3: Intelligence
- Implement duplicate detection
- Build status dashboard
- Track lead-to-quote conversion
- Generate analytics reports

### Future: Advanced
- Real-time sync of client changes
- Mobile notifications for new leads
- Integration with email/SMS systems
- Custom reporting and analytics

---

## 📊 Client Model Reference

The API returns comprehensive client objects including:
- Basic info (name, address, contact)
- Policies (all active/inactive)
- Drivers and vehicles
- Claims history
- Notes and attachments
- Custom fields (including our ClientMiscData!)

**Next Steps:** Once you have API credentials, I can help you:
1. Build the backend proxy service
2. Add the "Link to HawkSoft" feature
3. Implement automatic log note creation
4. Set up analytics and reporting

Let me know when you get the credentials and we'll start building! 🚀
