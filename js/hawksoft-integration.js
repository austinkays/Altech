/**
 * HawkSoft Integration Module
 *
 * SAFETY GUARANTEED:
 * - Read-only client lookups
 * - Append-only log notes (cannot delete or overwrite)
 * - Dry-run preview before sending
 * - Input validation
 * - User confirmation dialogs
 *
 * Usage:
 *   const hawksoft = new HawkSoftIntegration();
 *   await hawksoft.lookupClient(clientId);
 *   await hawksoft.addLogNote(clientId, note, options);
 */

class HawkSoftIntegration {
  constructor() {
    this.apiBase = '/api/hawksoft';
    this.initialized = false;
  }

  /**
   * Test API connection
   * @returns {Promise<Object>} Connection status
   */
  async testConnection() {
    try {
      const response = await fetch(`${this.apiBase}?action=test`);
      const data = await response.json();
      this.initialized = data.success;
      return data;
    } catch (error) {
      console.error('[HawkSoft] Connection test failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Lookup client details (READ-ONLY - Safe)
   * @param {string|number} clientId - HawkSoft client ID
   * @returns {Promise<Object>} Client details or error
   */
  async lookupClient(clientId) {
    if (!clientId) {
      throw new Error('Client ID is required');
    }

    try {
      const response = await fetch(`${this.apiBase}?action=client&clientId=${clientId}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch client');
      }

      return data.client;
    } catch (error) {
      console.error('[HawkSoft] Client lookup failed:', error);
      throw error;
    }
  }

  /**
   * Preview log note before sending (DRY RUN - Safe)
   * @param {string|number} clientId - HawkSoft client ID
   * @param {string} note - Log note text
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Preview of what will be sent
   */
  async previewLogNote(clientId, note, options = {}) {
    const payload = {
      clientId: clientId,
      note: note,
      action: options.action || 29, // Default: Online From Insured
      createTask: options.createTask || false,
      taskDetails: options.taskDetails || {}
    };

    try {
      const response = await fetch(`${this.apiBase}?action=log&dryRun=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      return await response.json();
    } catch (error) {
      console.error('[HawkSoft] Preview failed:', error);
      throw error;
    }
  }

  /**
   * Add log note to client (APPEND-ONLY - Safe, cannot delete or overwrite)
   * @param {string|number} clientId - HawkSoft client ID
   * @param {string} note - Log note text
   * @param {Object} options - Additional options
   * @param {number} options.action - Log action code (default: 29 = Online From Insured)
   * @param {boolean} options.createTask - Create a follow-up task
   * @param {Object} options.taskDetails - Task details if createTask is true
   * @param {boolean} options.preview - Show preview before sending (default: true)
   * @returns {Promise<Object>} Result status
   */
  async addLogNote(clientId, note, options = {}) {
    // Set default to preview first for safety
    const shouldPreview = options.preview !== false;

    // Preview first if requested
    if (shouldPreview) {
      const preview = await this.previewLogNote(clientId, note, options);

      // Show confirmation dialog
      const confirmed = confirm(
        `📝 Preview Log Note\n\n` +
        `Client ID: ${clientId}\n` +
        `Action: ${options.action || 29} (Online From Insured)\n` +
        `Create Task: ${options.createTask ? 'Yes' : 'No'}\n\n` +
        `Note:\n${note.substring(0, 200)}${note.length > 200 ? '...' : ''}\n\n` +
        `⚠️ SAFETY:\n` +
        `✅ This will ADD a log entry (append-only)\n` +
        `✅ Cannot delete or overwrite existing data\n` +
        `✅ Safe operation\n\n` +
        `Do you want to send this to HawkSoft?`
      );

      if (!confirmed) {
        return { success: false, cancelled: true, message: 'User cancelled operation' };
      }
    }

    // Send the log note
    const payload = {
      clientId: clientId,
      note: note,
      action: options.action || 29,
      createTask: options.createTask || false,
      taskDetails: options.taskDetails || {}
    };

    try {
      const response = await fetch(`${this.apiBase}?action=log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.success) {
        console.log('[HawkSoft] Log note created successfully:', result);
      } else {
        console.error('[HawkSoft] Log note failed:', result);
      }

      return result;
    } catch (error) {
      console.error('[HawkSoft] Add log note error:', error);
      throw error;
    }
  }

  /**
   * Get list of subscribed agencies (READ-ONLY - Safe)
   * @returns {Promise<Array>} Array of agency IDs
   */
  async getAgencies() {
    try {
      const response = await fetch(`${this.apiBase}?action=agencies`);
      const data = await response.json();
      return data.agencies || [];
    } catch (error) {
      console.error('[HawkSoft] Get agencies failed:', error);
      throw error;
    }
  }

  /**
   * Get agency offices (READ-ONLY - Safe)
   * @returns {Promise<Array>} Array of office objects
   */
  async getOffices() {
    try {
      const response = await fetch(`${this.apiBase}?action=offices`);
      const data = await response.json();
      return data.offices || [];
    } catch (error) {
      console.error('[HawkSoft] Get offices failed:', error);
      throw error;
    }
  }

  /**
   * Create a formatted log note from form data
   * @param {Object} formData - Data from your intake form
   * @param {Object} options - Additional options
   * @returns {string} Formatted log note
   */
  formatLogNote(formData, options = {}) {
    const sections = [];

    // Header
    sections.push(`Lead submitted via Altech Field App`);
    sections.push(''); // Empty line

    // Contact Information
    if (formData.firstName || formData.lastName) {
      sections.push(`Contact: ${formData.firstName || ''} ${formData.lastName || ''}`);
    }
    if (formData.email) {
      sections.push(`Email: ${formData.email}`);
    }
    if (formData.phone) {
      sections.push(`Phone: ${formData.phone}`);
    }
    sections.push(''); // Empty line

    // Property Information
    if (formData.addrStreet || formData.addrCity || formData.addrState) {
      sections.push('Property:');
      if (formData.addrStreet) sections.push(`  ${formData.addrStreet}`);
      if (formData.addrCity || formData.addrState || formData.addrZip) {
        sections.push(`  ${formData.addrCity || ''}, ${formData.addrState || ''} ${formData.addrZip || ''}`);
      }
      sections.push(''); // Empty line
    }

    // Quote Type
    if (formData.quoteType) {
      sections.push(`Quote Type: ${formData.quoteType}`);
    }

    // Additional fields
    if (options.additionalFields) {
      sections.push(''); // Empty line
      sections.push('Additional Information:');
      for (const [key, value] of Object.entries(options.additionalFields)) {
        if (value) {
          sections.push(`  ${key}: ${value}`);
        }
      }
    }

    // Timestamp
    sections.push(''); // Empty line
    sections.push(`Submitted: ${new Date().toLocaleString()}`);

    return sections.join('\n');
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.HawkSoftIntegration = HawkSoftIntegration;
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HawkSoftIntegration;
}
