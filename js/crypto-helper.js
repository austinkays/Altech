// CryptoHelper + safeSave - Extracted from index.html
// Do not edit this section in index.html; edit this file instead.

// 🔒 Encryption Utilities (AES-256-GCM via Web Crypto API)
const CryptoHelper = {
    async getEncryptionKey() {
        const fingerprint = await this.getDeviceFingerprint();
        const keySource = fingerprint;
        
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(keySource),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );
        
        const salt = new TextEncoder().encode('altech_v6_salt_2026');
        return await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    },

    async getDeviceFingerprint() {
        // Use a stable random salt stored in localStorage — immune to
        // browser updates, daylight savings, or device changes that would
        // silently break decryption of all saved data.
        const SALT_KEY = 'altech_encryption_salt';
        let salt = localStorage.getItem(SALT_KEY);
        if (!salt) {
            // Generate a random 256-bit salt on first use
            const arr = new Uint8Array(32);
            crypto.getRandomValues(arr);
            salt = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
            localStorage.setItem(SALT_KEY, salt);
        }

        const components = [
            salt,
            'ALTECH_FIELD_PRO_v2'
        ];

        const msgBuffer = new TextEncoder().encode(components.join('||'));
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    },

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    async encrypt(data) {
        try {
            const key = await this.getEncryptionKey();
            const iv = crypto.getRandomValues(new Uint8Array(12)); // GCM standard IV
            const encodedData = new TextEncoder().encode(JSON.stringify(data));
            
            const encrypted = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                key,
                encodedData
            );
            
            // Combine IV + encrypted data for storage
            const combined = new Uint8Array(iv.length + encrypted.byteLength);
            combined.set(iv, 0);
            combined.set(new Uint8Array(encrypted), iv.length);
            
            // Convert to base64 for localStorage
            return btoa(String.fromCharCode(...combined));
        } catch (error) {
            console.error('Encryption failed:', error);
            // Fallback: store unencrypted (backwards compatible)
            return JSON.stringify(data);
        }
    },

    async decrypt(encryptedData) {
        try {
            // Try decrypting first
            const key = await this.getEncryptionKey();
            const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
            
            const iv = combined.slice(0, 12);
            const data = combined.slice(12);
            
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                key,
                data
            );
            
            const decoded = new TextDecoder().decode(decrypted);
            return JSON.parse(decoded);
        } catch (error) {
            // Fallback: try parsing as plain JSON (backwards compatible)
            try {
                return JSON.parse(encryptedData);
            } catch (e) {
                console.error('Decryption failed:', error);
                return null;
            }
        }
    }
};

// ── Safe localStorage wrapper (handles QuotaExceededError) ──────────
function safeSave(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        console.error(`[safeSave] Failed to write "${key}":`, e.name, e.message);
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            if (typeof App !== 'undefined' && App.toast) {
                App.toast('⚠️ Storage full! Export your data to free space.', 4000);
            }
        }
        return false;
    }
}
