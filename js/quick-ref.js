// QuickRef - Extracted from index.html
// Do not edit this section in index.html; edit this file instead.

const QR_STORAGE_KEY = 'altech_quickref_cards';
const QR_NUMBERS_KEY = 'altech_quickref_numbers';
const PHONETIC_ALPHABET = {
    A:'Adam',B:'Boy',C:'Charles',D:'David',E:'Edward',F:'Frank',
    G:'George',H:'Henry',I:'Ida',J:'John',K:'King',L:'Lincoln',
    M:'Mary',N:'Nora',O:'Ocean',P:'Paul',Q:'Queen',R:'Robert',
    S:'Sam',T:'Tom',U:'Union',V:'Victor',W:'William',
    X:'X-ray',Y:'Young',Z:'Zebra',
    '0':'Zero','1':'One','2':'Two','3':'Three','4':'Four',
    '5':'Five','6':'Six','7':'Seven','8':'Eight','9':'Nine'
};
// Alias for backward compat
const NATO = PHONETIC_ALPHABET;

const QuickRef = {
    initialized: false,
    cards: [],
    numbers: [],

    init() {
        if (this.initialized) return;
        this.initialized = true;
        this.buildPhoneticGrid();
        this.loadCards();
        this.renderCards();
        this.loadNumbers();
        this.renderNumbers();
        console.log('[QuickRef] initialized');
    },

    // ─── Phonetic Grid ──────────────

    buildPhoneticGrid() {
        const grid = document.getElementById('qrPhoneticGrid');
        if (!grid) return;
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        grid.innerHTML = letters.map(ch => `
            <div class="qr-phonetic-cell" data-letter="${ch}">
                <div class="qr-phonetic-letter">${ch}</div>
                <div class="qr-phonetic-word">${NATO[ch] || ch}</div>
            </div>
        `).join('');
    },

    // ─── Speller ────────────────────

    spell(text) {
        const output = document.getElementById('qrSpellerOutput');
        if (!output) return;
        const upper = (text || '').toUpperCase();

        // Highlight phonetic grid cells
        const usedLetters = new Set(upper.replace(/[^A-Z0-9]/g, '').split(''));
        document.querySelectorAll('#qrPhoneticGrid .qr-phonetic-cell').forEach(cell => {
            cell.classList.toggle('highlight', usedLetters.has(cell.dataset.letter));
        });

        if (!upper.trim()) { output.innerHTML = ''; return; }

        output.innerHTML = upper.split('').map(ch => {
            if (ch === ' ') return '<span class="qr-speller-item space">(space)</span>';
            const word = NATO[ch];
            if (!word) return `<span class="qr-speller-item"><span class="qr-spell-letter">${this.escHtml(ch)}</span>${this.escHtml(ch)}</span>`;
            return `<span class="qr-speller-item"><span class="qr-spell-letter">${this.escHtml(ch)}</span> ${word}</span>`;
        }).join('');
    },

    // ─── Card CRUD ──────────────────

    getDefaultCards() {
        return [
            {
                id: 'default-1',
                carrier: 'Progressive',
                color: '#0052cc',
                fields: [
                    { label: 'Agent Code', value: '78119' },
                    { label: 'Phone', value: '1-800-776-4737' }
                ]
            },
            {
                id: 'default-2',
                carrier: 'Safeco',
                color: '#005a30',
                fields: [
                    { label: 'Agent Code', value: '013575' },
                    { label: 'Phone', value: '1-800-332-3226' }
                ]
            },
            {
                id: 'default-3',
                carrier: 'Travelers',
                color: '#cc0000',
                fields: [
                    { label: 'Agency Code', value: '0cfj97' },
                    { label: 'Phone', value: '1-800-842-5075' }
                ]
            },
            {
                id: 'default-4',
                carrier: 'Mutual of Enumclaw',
                color: '#1a5276',
                fields: [
                    { label: 'Agent Code', value: '0057' },
                    { label: 'Phone', value: '1-800-892-4191' }
                ]
            }
        ];
    },

    loadCards() {
        // Try localStorage
        const raw = localStorage.getItem(QR_STORAGE_KEY);
        if (raw) {
            try { this.cards = JSON.parse(raw); return; } catch(e) {}
        }
        // Try disk
        fetch('/local/quickref-cards').then(r => r.ok ? r.json() : null).then(data => {
            if (data && Array.isArray(data.cards) && data.cards.length) {
                this.cards = data.cards;
                this.persistLocal();
                this.renderCards();
            }
        }).catch(() => {});
        // Defaults
        this.cards = this.getDefaultCards();
    },

    persistLocal() {
        localStorage.setItem(QR_STORAGE_KEY, JSON.stringify(this.cards));
    },

    syncToDisk() {
        fetch('/local/quickref-cards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cards: this.cards })
        }).catch(() => {});
    },

    save() {
        this.persistLocal();
        this.syncToDisk();
        // Trigger cloud sync if available
        if (typeof CloudSync !== 'undefined' && CloudSync.schedulePush) {
            CloudSync.schedulePush();
        }
    },

    renderCards() {
        const grid = document.getElementById('qrCardsGrid');
        if (!grid) return;
        if (this.cards.length === 0) {
            grid.innerHTML = '<p style="color: var(--text-secondary); font-style: italic; grid-column: 1/-1;">No cards yet. Click "+ Add Card" to create one.</p>';
            return;
        }
        grid.innerHTML = this.cards.map((card, i) => `
            <div class="qr-card">
                <div class="qr-card-actions">
                    <button class="qr-card-btn" onclick="QuickRef.editCard(${i})" title="Edit">✏️</button>
                    <button class="qr-card-btn delete" onclick="QuickRef.deleteCard(${i})" title="Delete">✕</button>
                </div>
                <div class="qr-card-carrier">
                    <span class="qr-carrier-dot" style="background:${card.color || '#0d9488'}"></span>
                    ${this.escHtml(card.carrier)}
                </div>
                ${card.fields.map(f => `
                    <div class="qr-card-field">
                        <span>${this.escHtml(f.label)}</span>
                        <span class="qr-card-value" onclick="QuickRef.copyVal(this)">${this.escHtml(f.value) || '—'}</span>
                    </div>
                `).join('')}
            </div>
        `).join('');
    },

    // Copy a value on click
    copyVal(el) {
        const text = el.textContent.trim();
        if (!text || text === '—') return;
        navigator.clipboard.writeText(text).then(() => {
            el.classList.add('copied');
            el.dataset.orig = el.textContent;
            el.textContent = '✓ copied';
            setTimeout(() => { el.textContent = el.dataset.orig; el.classList.remove('copied'); }, 1200);
        });
    },

    // ─── Add / Edit ─────────────────

    toggleAddForm() {
        const form = document.getElementById('qrAddForm');
        form.classList.toggle('active');
        if (form.classList.contains('active')) {
            document.getElementById('qrAddCarrier').value = '';
            document.getElementById('qrAddColor').value = '#0d9488';
            document.getElementById('qrAddFieldsList').innerHTML = `
                <div class="qr-add-field-row">
                    <input type="text" class="qr-add-input" placeholder="Label (e.g. Agent ID)" data-role="label">
                    <input type="text" class="qr-add-input" placeholder="Value (e.g. A12345)" data-role="value">
                    <button class="qr-card-btn delete" onclick="this.parentElement.remove()" title="Remove">✕</button>
                </div>
            `;
            delete form.dataset.editIdx;
            document.getElementById('qrAddCarrier').focus();
        }
    },

    addFieldRow() {
        const list = document.getElementById('qrAddFieldsList');
        const row = document.createElement('div');
        row.className = 'qr-add-field-row';
        row.innerHTML = `
            <input type="text" class="qr-add-input" placeholder="Label" data-role="label">
            <input type="text" class="qr-add-input" placeholder="Value" data-role="value">
            <button class="qr-card-btn delete" onclick="this.parentElement.remove()" title="Remove">✕</button>
        `;
        list.appendChild(row);
        row.querySelector('[data-role="label"]').focus();
    },

    saveNewCard() {
        const carrier = document.getElementById('qrAddCarrier').value.trim();
        if (!carrier) { App.toast('⚠️ Enter a carrier name'); return; }
        const color = document.getElementById('qrAddColor').value;
        const rows = document.querySelectorAll('#qrAddFieldsList .qr-add-field-row');
        const fields = [];
        rows.forEach(row => {
            const label = row.querySelector('[data-role="label"]').value.trim();
            const value = row.querySelector('[data-role="value"]').value.trim();
            if (label || value) fields.push({ label: label || 'Info', value });
        });
        if (fields.length === 0) { App.toast('⚠️ Add at least one field'); return; }

        const form = document.getElementById('qrAddForm');
        const editIdx = form.dataset.editIdx;

        if (editIdx !== undefined) {
            // Edit existing
            this.cards[parseInt(editIdx)] = { id: this.cards[parseInt(editIdx)].id, carrier, color, fields };
        } else {
            // New card
            this.cards.push({ id: 'card-' + Date.now(), carrier, color, fields });
        }

        this.save();
        this.renderCards();
        this.toggleAddForm();
        App.toast(editIdx !== undefined ? '✏️ Card updated' : '✅ Card added');
    },

    editCard(idx) {
        const card = this.cards[idx];
        if (!card) return;
        const form = document.getElementById('qrAddForm');
        form.classList.add('active');
        form.dataset.editIdx = idx;
        document.getElementById('qrAddCarrier').value = card.carrier;
        document.getElementById('qrAddColor').value = card.color || '#0d9488';
        const list = document.getElementById('qrAddFieldsList');
        list.innerHTML = card.fields.map(f => `
            <div class="qr-add-field-row">
                <input type="text" class="qr-add-input" placeholder="Label" data-role="label" value="${this.escAttr(f.label)}">
                <input type="text" class="qr-add-input" placeholder="Value" data-role="value" value="${this.escAttr(f.value)}">
                <button class="qr-card-btn delete" onclick="this.parentElement.remove()" title="Remove">✕</button>
            </div>
        `).join('');
        document.getElementById('qrAddCarrier').focus();
    },

    deleteCard(idx) {
        this.cards.splice(idx, 1);
        this.save();
        this.renderCards();
        App.toast('🗑️ Card removed');
    },

    // ─── Quick Dial Numbers CRUD ──────

    getDefaultNumbers() {
        return [
            { id: 'num-1', label: 'NAIC Lookup', value: 'naic.org/cis_consumer_information_look_up.htm' },
            { id: 'num-2', label: 'CLUE Report', value: '1-866-312-8076' },
            { id: 'num-3', label: 'MVR Check', value: '1-800-777-9929' }
        ];
    },

    loadNumbers() {
        const raw = localStorage.getItem(QR_NUMBERS_KEY);
        if (raw) {
            try { this.numbers = JSON.parse(raw); return; } catch(e) {}
        }
        this.numbers = this.getDefaultNumbers();
    },

    saveNumbers() {
        localStorage.setItem(QR_NUMBERS_KEY, JSON.stringify(this.numbers));
        if (typeof CloudSync !== 'undefined' && CloudSync.schedulePush) {
            CloudSync.schedulePush();
        }
    },

    renderNumbers() {
        const container = document.getElementById('qrNumbersList');
        if (!container) return;
        if (this.numbers.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); font-style: italic;">No numbers saved. Click "+ Add Number" to add one.</p>';
            return;
        }
        container.innerHTML = this.numbers.map((n, i) => `
            <div class="qr-number-row">
                <span class="qr-number-label">${this.escHtml(n.label)}</span>
                <span class="qr-card-value" onclick="QuickRef.copyVal(this)">${this.escHtml(n.value)}</span>
                <span class="qr-number-actions">
                    <button class="qr-card-btn" onclick="QuickRef.editNumber(${i})" title="Edit">✏️</button>
                    <button class="qr-card-btn delete" onclick="QuickRef.deleteNumber(${i})" title="Delete">✕</button>
                </span>
            </div>
        `).join('');
    },

    toggleNumberForm() {
        const form = document.getElementById('qrNumberForm');
        form.classList.toggle('active');
        if (form.classList.contains('active')) {
            document.getElementById('qrNumLabel').value = '';
            document.getElementById('qrNumValue').value = '';
            delete form.dataset.editIdx;
            document.getElementById('qrNumLabel').focus();
        }
    },

    saveNumber() {
        const label = document.getElementById('qrNumLabel').value.trim();
        const value = document.getElementById('qrNumValue').value.trim();
        if (!label || !value) { App.toast('⚠️ Enter both label and value'); return; }
        const form = document.getElementById('qrNumberForm');
        const editIdx = form.dataset.editIdx;
        if (editIdx !== undefined) {
            this.numbers[parseInt(editIdx)] = { ...this.numbers[parseInt(editIdx)], label, value };
        } else {
            this.numbers.push({ id: 'num-' + Date.now(), label, value });
        }
        this.saveNumbers();
        this.renderNumbers();
        this.toggleNumberForm();
        App.toast(editIdx !== undefined ? '✏️ Number updated' : '✅ Number added');
    },

    editNumber(idx) {
        const n = this.numbers[idx];
        if (!n) return;
        const form = document.getElementById('qrNumberForm');
        form.classList.add('active');
        form.dataset.editIdx = idx;
        document.getElementById('qrNumLabel').value = n.label;
        document.getElementById('qrNumValue').value = n.value;
        document.getElementById('qrNumLabel').focus();
    },

    deleteNumber(idx) {
        this.numbers.splice(idx, 1);
        this.saveNumbers();
        this.renderNumbers();
        App.toast('🗑️ Number removed');
    },

    // ─── Helpers ────────────────────

    escHtml(text) {
        if (!text) return '';
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    },

    escAttr(text) {
        if (!text) return '';
        return String(text).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
};

window.QuickRef = QuickRef;
