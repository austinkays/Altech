/**
 * Form Validation Utilities for Altech
 * Provides real-time validation with user-friendly error messages
 */

const Validation = {
    // Email validation (RFC 5322 simplified)
    email(value) {
        if (!value) return { valid: false, message: 'Email is required' };
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!regex.test(value)) {
            return { valid: false, message: 'Please enter a valid email address' };
        }
        if (value.length > 255) {
            return { valid: false, message: 'Email is too long' };
        }
        return { valid: true };
    },

    // Phone validation (US format)
    phone(value) {
        if (!value) return { valid: false, message: 'Phone number is required' };
        const cleaned = value.replace(/\D/g, '');
        if (cleaned.length < 10) {
            return { valid: false, message: 'Phone must be at least 10 digits' };
        }
        if (cleaned.length > 15) {
            return { valid: false, message: 'Phone number is too long' };
        }
        return { valid: true };
    },

    // Date of birth (must be 16-120 years old)
    dob(value) {
        if (!value) return { valid: false, message: 'Date of birth is required' };
        
        const date = new Date(value);
        const now = new Date();
        const age = Math.floor((now - date) / (365.25 * 24 * 60 * 60 * 1000));
        
        if (isNaN(date.getTime())) {
            return { valid: false, message: 'Invalid date format' };
        }
        if (date > now) {
            return { valid: false, message: 'Date cannot be in the future' };
        }
        if (age < 16) {
            return { valid: false, message: 'Must be at least 16 years old to apply' };
        }
        if (age > 120) {
            return { valid: false, message: 'Please check the date - seems incorrect' };
        }
        return { valid: true };
    },

    // State code (2 letters, US states)
    stateCode(value) {
        if (!value) return { valid: false, message: 'State is required' };
        const states = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];
        const upper = value.toUpperCase();
        if (!states.includes(upper)) {
            return { valid: false, message: 'Please enter a valid 2-letter state code' };
        }
        return { valid: true };
    },

    // ZIP code (5 or 9 digits)
    zipCode(value) {
        if (!value) return { valid: false, message: 'ZIP code is required' };
        const cleaned = value.replace(/\D/g, '');
        if (cleaned.length !== 5 && cleaned.length !== 9) {
            return { valid: false, message: 'ZIP must be 5 or 9 digits' };
        }
        return { valid: true };
    },

    // VIN (exactly 17 characters, alphanumeric)
    vin(value) {
        if (!value) return { valid: true }; // Optional
        const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (cleaned.length !== 17) {
            return { valid: false, message: 'VIN must be exactly 17 characters' };
        }
        // VINs don't use I, O, Q
        if (/[IOQ]/.test(cleaned)) {
            return { valid: false, message: 'VIN cannot contain I, O, or Q' };
        }
        return { valid: true };
    },

    // Year (4 digits, reasonable range)
    year(value, context = 'year') {
        if (!value) return { valid: false, message: `${context} is required` };
        const year = parseInt(value);
        const currentYear = new Date().getFullYear();
        if (isNaN(year) || year < 1800 || year > currentYear + 1) {
            return { valid: false, message: `Please enter a valid ${context} (1800-${currentYear + 1})` };
        }
        return { valid: true };
    },

    // Required text field
    required(value, fieldName = 'This field') {
        if (!value || value.trim() === '') {
            return { valid: false, message: `${fieldName} is required` };
        }
        return { valid: true };
    },

    // Number range validation
    numberRange(value, min, max, fieldName = 'Value') {
        if (value === '' || value === null || value === undefined) {
            return { valid: false, message: `${fieldName} is required` };
        }
        const num = parseFloat(value);
        if (isNaN(num)) {
            return { valid: false, message: `${fieldName} must be a number` };
        }
        if (num < min || num > max) {
            return { valid: false, message: `${fieldName} must be between ${min} and ${max}` };
        }
        return { valid: true };
    },

    // Show validation error on field
    showError(fieldId, message) {
        const field = document.getElementById(fieldId);
        if (!field) return;
        
        // Add error styling
        field.style.borderColor = '#FF3B30';
        field.style.background = 'rgba(255, 59, 48, 0.05)';
        
        // Remove existing error message
        const existingError = field.parentElement.querySelector('.validation-error');
        if (existingError) existingError.remove();
        
        // Add error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'validation-error';
        errorDiv.textContent = message;
        errorDiv.style.cssText = 'color: #FF3B30; font-size: 13px; margin-top: 4px;';
        field.parentElement.appendChild(errorDiv);
    },

    // Clear validation error
    clearError(fieldId) {
        const field = document.getElementById(fieldId);
        if (!field) return;
        
        field.style.borderColor = '';
        field.style.background = '';
        
        const existingError = field.parentElement.querySelector('.validation-error');
        if (existingError) existingError.remove();
    },

    // Validate entire form
    validateStep(step) {
        const errors = [];
        
        switch(step) {
            case 1: // Personal Info
                const email = this.email(document.getElementById('email')?.value);
                if (!email.valid) errors.push({ field: 'email', ...email });
                
                const phone = this.phone(document.getElementById('phone')?.value);
                if (!phone.valid) errors.push({ field: 'phone', ...phone });
                
                const dob = this.dob(document.getElementById('dob')?.value);
                if (!dob.valid) errors.push({ field: 'dob', ...dob });
                
                const firstName = this.required(document.getElementById('firstName')?.value, 'First name');
                if (!firstName.valid) errors.push({ field: 'firstName', ...firstName });
                
                const lastName = this.required(document.getElementById('lastName')?.value, 'Last name');
                if (!lastName.valid) errors.push({ field: 'lastName', ...lastName });
                break;
                
            case 2: // Coverage Type
                const qType = document.querySelector('input[name="qType"]:checked');
                if (!qType) {
                    errors.push({ field: 'qType', message: 'Please select a coverage type' });
                }
                break;
                
            case 3: // Property Details
                const addrStreet = this.required(document.getElementById('addrStreet')?.value, 'Street address');
                if (!addrStreet.valid) errors.push({ field: 'addrStreet', ...addrStreet });
                
                const addrCity = this.required(document.getElementById('addrCity')?.value, 'City');
                if (!addrCity.valid) errors.push({ field: 'addrCity', ...addrCity });
                
                const addrState = this.stateCode(document.getElementById('addrState')?.value);
                if (!addrState.valid) errors.push({ field: 'addrState', ...addrState });
                
                const addrZip = this.zipCode(document.getElementById('addrZip')?.value);
                if (!addrZip.valid) errors.push({ field: 'addrZip', ...addrZip });
                
                const yrBuilt = this.year(document.getElementById('yrBuilt')?.value, 'Year built');
                if (!yrBuilt.valid) errors.push({ field: 'yrBuilt', ...yrBuilt });
                break;
        }
        
        return errors;
    }
};

// Make globally available
if (typeof window !== 'undefined') {
    window.Validation = Validation;
}
