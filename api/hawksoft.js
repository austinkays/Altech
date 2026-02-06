/**
 * HawkSoft API Integration
 *
 * Provides secure server-side proxy for HawkSoft Partner API V3.0
 * Documentation: https://integration.hawksoft.app
 *
 * SAFETY FEATURES:
 * - ✅ Read-only operations (safe)
 * - ✅ Append-only writes (log notes can't delete/overwrite)
 * - ✅ Dry-run mode for testing
 * - ✅ Input validation
 * - ✅ Audit logging
 * - ❌ NO delete operations (API doesn't support)
 * - ❌ NO data overwriting (API doesn't support)
 *
 * Available endpoints:
 * - GET /api/hawksoft?action=test - Test API connection
 * - GET /api/hawksoft?action=agencies - Get subscribed agencies
 * - GET /api/hawksoft?action=offices - Get agency offices
 * - GET /api/hawksoft?action=client&clientId=123 - Get client details (READ-ONLY)
 * - POST /api/hawksoft?action=log - Add log note to client (APPEND-ONLY, SAFE)
 * - POST /api/hawksoft?action=log&dryRun=true - Preview log note without sending
 */

const crypto = require('crypto');

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Get credentials from environment variables
  const HAWKSOFT_CLIENT_ID = process.env.HAWKSOFT_CLIENT_ID;
  const HAWKSOFT_CLIENT_SECRET = process.env.HAWKSOFT_CLIENT_SECRET;
  const HAWKSOFT_AGENCY_ID = process.env.HAWKSOFT_AGENCY_ID;

  // Validate environment variables
  if (!HAWKSOFT_CLIENT_ID || !HAWKSOFT_CLIENT_SECRET || !HAWKSOFT_AGENCY_ID) {
    console.error('[HawkSoft] Missing environment variables');
    return res.status(500).json({
      success: false,
      error: 'HawkSoft API credentials not configured',
      details: {
        hasClientId: !!HAWKSOFT_CLIENT_ID,
        hasClientSecret: !!HAWKSOFT_CLIENT_SECRET,
        hasAgencyId: !!HAWKSOFT_AGENCY_ID
      }
    });
  }

  // Create Basic Auth header
  const authString = `${HAWKSOFT_CLIENT_ID}:${HAWKSOFT_CLIENT_SECRET}`;
  const authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;

  const BASE_URL = 'https://integration.hawksoft.app';
  const API_VERSION = '3.0';

  try {
    const action = req.query.action || 'test';

    switch (action) {
      case 'test': {
        // Test connection by fetching agencies
        console.log('[HawkSoft] Testing API connection...');
        const response = await fetch(`${BASE_URL}/vendor/agencies?version=${API_VERSION}`, {
          method: 'GET',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          }
        });

        const data = await response.json();

        if (response.ok) {
          console.log('[HawkSoft] Connection successful, agencies:', data);
          return res.status(200).json({
            success: true,
            message: 'HawkSoft API connection successful',
            agencies: data,
            configuredAgencyId: HAWKSOFT_AGENCY_ID
          });
        } else {
          console.error('[HawkSoft] Connection failed:', response.status, data);
          return res.status(response.status).json({
            success: false,
            error: 'Failed to connect to HawkSoft API',
            status: response.status,
            details: data
          });
        }
      }

      case 'agencies': {
        // Get list of subscribed agencies
        const response = await fetch(`${BASE_URL}/vendor/agencies?version=${API_VERSION}`, {
          method: 'GET',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          }
        });

        const data = await response.json();
        return res.status(response.status).json({
          success: response.ok,
          agencies: data
        });
      }

      case 'offices': {
        // Get offices for the configured agency
        const response = await fetch(`${BASE_URL}/vendor/agency/${HAWKSOFT_AGENCY_ID}/offices?version=${API_VERSION}`, {
          method: 'GET',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          }
        });

        const data = await response.json();
        return res.status(response.status).json({
          success: response.ok,
          offices: data
        });
      }

      case 'client': {
        // Get client details
        const clientId = req.query.clientId;
        if (!clientId) {
          return res.status(400).json({
            success: false,
            error: 'clientId parameter required'
          });
        }

        const response = await fetch(
          `${BASE_URL}/vendor/agency/${HAWKSOFT_AGENCY_ID}/client/${clientId}?version=${API_VERSION}`,
          {
            method: 'GET',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json'
            }
          }
        );

        const data = await response.json();
        return res.status(response.status).json({
          success: response.ok,
          client: data
        });
      }

      case 'log': {
        // Add log note to client (SAFE - Append-only, cannot delete or overwrite)
        if (req.method !== 'POST') {
          return res.status(405).json({
            success: false,
            error: 'POST method required'
          });
        }

        const { clientId, note, action = 29, createTask = false, taskDetails = {} } = req.body;
        const dryRun = req.query.dryRun === 'true';

        // Validation
        if (!clientId || !note) {
          return res.status(400).json({
            success: false,
            error: 'clientId and note are required',
            received: { clientId, hasNote: !!note }
          });
        }

        // Validate clientId is numeric
        if (isNaN(parseInt(clientId))) {
          return res.status(400).json({
            success: false,
            error: 'clientId must be a valid number',
            received: clientId
          });
        }

        // Validate note length (reasonable limit)
        if (note.length > 10000) {
          return res.status(400).json({
            success: false,
            error: 'Note is too long (max 10,000 characters)',
            length: note.length
          });
        }

        // Validate action code
        const validActions = [1, 2, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49, 53];
        if (!validActions.includes(action)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid action code',
            received: action,
            validActions: validActions,
            recommended: 29 // Online From Insured
          });
        }

        const logPayload = {
          refId: crypto.randomUUID(),
          ts: new Date().toISOString(),
          action: action,
          note: note
        };

        // Add task if requested
        if (createTask && taskDetails.title) {
          // Validate task details
          if (taskDetails.title.length > 200) {
            return res.status(400).json({
              success: false,
              error: 'Task title is too long (max 200 characters)'
            });
          }

          logPayload.task = {
            title: taskDetails.title,
            description: taskDetails.description || '',
            dueDate: taskDetails.dueDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            assignedToRole: taskDetails.assignedToRole || 'Producer',
            assignedToEmail: taskDetails.assignedToEmail,
            category: taskDetails.category || 'Sales'
          };
        }

        // DRY RUN MODE - Preview without sending
        if (dryRun) {
          console.log('[HawkSoft] DRY RUN - Would create log note:', logPayload);
          return res.status(200).json({
            success: true,
            dryRun: true,
            message: 'Preview only - not sent to HawkSoft',
            payload: logPayload,
            apiUrl: `${BASE_URL}/vendor/agency/${HAWKSOFT_AGENCY_ID}/client/${clientId}/log?version=${API_VERSION}`,
            safety: {
              canDelete: false,
              canOverwrite: false,
              operation: 'APPEND-ONLY',
              risk: 'LOW - Only adds a log entry'
            }
          });
        }

        // ACTUAL API CALL - Add log note
        console.log('[HawkSoft] Creating log note for client:', clientId);
        console.log('[HawkSoft] Payload:', JSON.stringify(logPayload, null, 2));

        const response = await fetch(
          `${BASE_URL}/vendor/agency/${HAWKSOFT_AGENCY_ID}/client/${clientId}/log?version=${API_VERSION}`,
          {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(logPayload)
          }
        );

        const responseText = await response.text();
        let data;
        try {
          data = responseText ? JSON.parse(responseText) : {};
        } catch (e) {
          data = { raw: responseText };
        }

        console.log('[HawkSoft] Log note response:', response.status, data);

        return res.status(response.status).json({
          success: response.ok || response.status === 202,
          status: response.status,
          message: response.status === 200 ? 'Log note created successfully' :
                   response.status === 202 ? 'Log note queued (agency offline - will process when online)' :
                   'Failed to create log note',
          data: data,
          payload: logPayload // Include what was sent for audit trail
        });
      }

      case 'attachment': {
        // Attach file to client (not fully implemented - needs multipart/form-data handling)
        return res.status(501).json({
          success: false,
          error: 'Attachment endpoint not yet implemented'
        });
      }

      case 'search': {
        // Search for clients (note: limited to exact policy number match)
        const policyNumber = req.query.policyNumber;
        if (!policyNumber) {
          return res.status(400).json({
            success: false,
            error: 'policyNumber parameter required'
          });
        }

        const response = await fetch(
          `${BASE_URL}/vendor/agency/${HAWKSOFT_AGENCY_ID}/clients/search?version=${API_VERSION}&policyNumber=${encodeURIComponent(policyNumber)}&include=details,policies`,
          {
            method: 'GET',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json'
            }
          }
        );

        const data = await response.json();
        return res.status(response.status).json({
          success: response.ok,
          results: data
        });
      }

      default: {
        return res.status(400).json({
          success: false,
          error: 'Invalid action parameter',
          availableActions: ['test', 'agencies', 'offices', 'client', 'log', 'search']
        });
      }
    }

  } catch (error) {
    console.error('[HawkSoft] API Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
};
